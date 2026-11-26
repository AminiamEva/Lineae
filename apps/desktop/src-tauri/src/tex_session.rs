//! Experimental, trusted-document-only rtex 0.0.8 host.
//!
//! The live renderer receives unchanged source. A separate disposable session
//! observes editing geometry. Assets are staged from validated byte snapshots.
//! Clean PDF snapshots do not grant semantic caret targeting. LuaLaTeX is
//! NOT a sandbox, even with shell escape disabled.
//! Call close_all on window/app teardown in addition to the explicit close IPC.

use command_group::{CommandGroup, GroupChild};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{ipc::Response, AppHandle, Emitter, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

/// Event-driven protocol delivery. Polling remains as a compatibility fallback,
/// but an interactive surface never waits for a timer to receive geometry.
type EventSink = Arc<dyn Fn(Value) + Send + Sync>;

const SOURCE_LIMIT: usize = 2 * 1024 * 1024;
const LINE_LIMIT: usize = 16 * 1024 * 1024;
const QUEUE_LIMIT: usize = 32 * 1024 * 1024;
const EVENT_LIMIT: usize = 256;
const TAIL_LIMIT: usize = 4096;
const FONT_LIMIT: u64 = 32 * 1024 * 1024;
const PDF_LIMIT: u64 = 64 * 1024 * 1024;
const PROJECT_LIMIT: usize = 64 * 1024 * 1024;
const FILE_LIMIT: usize = 16 * 1024 * 1024;
const FILE_COUNT_LIMIT: usize = 512;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(45);
// Allows rtex's bounded multi-pass convergence, but not an indefinitely stuck host.
const LAYOUT_TIMEOUT: Duration = Duration::from_secs(240);
const EXPORT_TIMEOUT: Duration = Duration::from_secs(240);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTexError {
    code: &'static str,
    message: String,
    diagnostic_tail: String,
}

fn error(code: &'static str, message: impl Into<String>) -> NativeTexError {
    NativeTexError {
        code,
        message: message.into(),
        diagnostic_tail: String::new(),
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // No external/user callbacks run under these locks. Recover on teardown too.
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn validate_source(source: &str) -> Result<(), NativeTexError> {
    if source.len() > SOURCE_LIMIT || source.contains('\0') {
        return Err(error("invalid_source", "Source must be UTF-8 text without NUL, at most 2 MiB."));
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), NativeTexError> {
    let parts: Vec<_> = id.split('-').collect();
    if parts.len() != 4
        || parts[0] != "tex"
        || parts[1].len() != 8
        || parts[2].len() != 32
        || parts[3].len() != 16
        || !parts[1..].iter().all(|part| part.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err(error("invalid_session", "Invalid native TeX session identifier."));
    }
    Ok(())
}

fn integer(value: &Value, field: &str) -> Result<u64, NativeTexError> {
    value.get(field).and_then(Value::as_u64)
        .filter(|n| *n <= MAX_SAFE_INTEGER)
        .ok_or_else(|| error("protocol", format!("rtex returned an invalid {field}.")))
}

/// Byte-only IPC snapshot: no original filesystem paths or symlinks are copied.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeTexFile {
    pub path: String,
    pub bytes: Vec<u8>,
}

fn installed_tex_bin() -> Option<PathBuf> {
    if let Some(configured) = std::env::var_os("RTEX_TEXLIVE_BIN") {
        return Some(PathBuf::from(configured));
    }
    #[cfg(target_os = "macos")]
    {
        // Finder launches do not normally inherit a shell's PATH.
        let bin = PathBuf::from("/Library/TeX/texbin");
        if bin.join("lualatex").is_file() { return Some(bin); }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(drive) = std::env::var_os("SystemDrive") {
            let mut root = PathBuf::from(drive);
            root.push(r"\texlive");
            // TeX Live year directories are numeric; don't execute from an
            // arbitrary child directory or override an explicitly chosen bin.
            let mut releases = std::fs::read_dir(root).into_iter().flatten()
                .filter_map(Result::ok)
                .filter_map(|entry| {
                    let year = entry.file_name().to_str()?.parse::<u32>().ok()?;
                    let bin = entry.path().join("bin").join("windows");
                    bin.join("lualatex.exe").is_file().then_some((year, bin))
                }).collect::<Vec<_>>();
            releases.sort_unstable_by_key(|(year, _)| *year);
            return releases.pop().map(|(_, bin)| bin);
        }
    }
    None
}

static BUNDLED_RTEX: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn set_bundled_rtex(root: PathBuf) {
    let _ = BUNDLED_RTEX.set(root);
}

fn installed_rtex() -> PathBuf {
    if let Some(configured) = std::env::var_os("LINEAE_RTEX_PATH") {
        return PathBuf::from(configured);
    }
    if let Some(root) = BUNDLED_RTEX.get() {
        let path = root.join("bin").join(format!("rtex{}", std::env::consts::EXE_SUFFIX));
        if path.is_file() { return path; }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let path = PathBuf::from(home).join("Library")
                .join("Application Support").join("Lineae")
                .join("rtex-0.0.8-aarch64-apple-darwin").join("bin").join("rtex");
            if path.is_file() { return path; }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let path = PathBuf::from(local).join("Lineae")
                .join("rtex-0.0.8-x86_64-pc-windows-msvc").join("bin").join("rtex.exe");
            if path.is_file() { return path; }
        }
    }
    PathBuf::from("rtex")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeTexProjection {
    path: String,
    source: String,
}

fn validate_project_path(path: &str) -> Result<(), NativeTexError> {
    if path.is_empty() || path.len() > 1024
        || path.contains('\\') || path.contains(':') || path.chars().any(char::is_control)
    {
        return Err(error("project_path", "Project paths must be clean, relative forward-slash paths."));
    }
    let components: Vec<_> = path.split('/').collect();
    if components.len() > 32 {
        return Err(error("project_path", "Project paths may have at most 32 components."));
    }
    for component in &components {
        let lower = component.to_ascii_lowercase();
        let stem = lower.split('.').next().unwrap_or("").trim_end_matches(' ');
        if component.is_empty() || *component == "." || *component == ".."
            || component.ends_with('.') || component.ends_with(' ')
            || component.chars().any(|c| matches!(c, '<' | '>' | '"' | '|' | '?' | '*'))
            || component.starts_with('.')
            || matches!(stem, "con" | "prn" | "aux" | "nul" | "clock$" | "conin$" | "conout$"
                | "com¹" | "com²" | "com³" | "lpt¹" | "lpt²" | "lpt³")
            || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt"))
                && stem.as_bytes()[3].is_ascii_digit())
        {
            return Err(error("project_path", format!("Unsupported project path component in '{path}'.")));
        }
    }
    if components[0].eq_ignore_ascii_case("build")
        || components[0].eq_ignore_ascii_case("export.pdf")
        || components[0].to_ascii_lowercase().starts_with("lineae-")
    {
        return Err(error("project_path", "Project path collides with native session output."));
    }
    Ok(())
}

#[derive(Clone, PartialEq, Eq)]
struct Snapshot {
    main_file: String,
    files: BTreeMap<String, Vec<u8>>,
}

impl Snapshot {
    fn new(source: &str, main_file: String, files: Vec<NativeTexFile>) -> Result<Self, NativeTexError> {
        validate_source(source)?;
        validate_project_path(&main_file)?;
        if !main_file.to_ascii_lowercase().ends_with(".tex") {
            return Err(error("project_main", "The main file must have a .tex extension."));
        }
        if files.len() > FILE_COUNT_LIMIT {
            return Err(error("project_limit", "Project snapshot exceeds 512 files."));
        }
        let mut result = BTreeMap::new();
        let mut folded = std::collections::HashSet::new();
        let mut total = source.len();
        for file in files {
            validate_project_path(&file.path)?;
            if !folded.insert(file.path.to_lowercase()) {
                return Err(error("project_path", "Duplicate or case-colliding project paths."));
            }
            // The authoritative main buffer is counted once, even if the
            // frontend's complete snapshot also contains a main-file entry.
            if file.path == main_file { continue; }
            total = total.saturating_add(file.bytes.len());
            if file.bytes.len() > FILE_LIMIT || total > PROJECT_LIMIT {
                return Err(error("project_limit", "Project snapshot exceeds the 16 MiB file / 64 MiB total limit."));
            }
            // The selected main buffer always wins, including over binary bytes.
            if file.path.eq_ignore_ascii_case(&main_file) {
                return Err(error("project_path", "A project file case-collides with the main file."));
            }
            result.insert(file.path, file.bytes);
        }
        result.insert(main_file.clone(), source.as_bytes().to_vec());
        if result.len() > FILE_COUNT_LIMIT {
            return Err(error("project_limit", "Project snapshot exceeds 512 files including the main file."));
        }
        // Reject both file/directory collisions and their Windows case variants.
        let names: std::collections::HashSet<_> = result.keys().map(|name| name.to_lowercase()).collect();
        for path in result.keys() {
            for (index, _) in path.match_indices('/') {
                if names.contains(&path[..index].to_lowercase()) {
                    return Err(error("project_path", "A snapshot path is both a file and a directory."));
                }
            }
        }
        Ok(Self { main_file, files: result })
    }

    fn dependencies_equal(&self, other: &Self) -> bool {
        self.main_file == other.main_file
            && self.files.iter().filter(|(path, _)| path.as_str() != self.main_file.as_str())
                .eq(other.files.iter().filter(|(path, _)| path.as_str() != other.main_file.as_str()))
    }

    fn changed_tex_buffers(&self, other: &Self) -> Option<Vec<(String, String)>> {
        if self.main_file != other.main_file || !self.files.keys().eq(other.files.keys()) {
            return None;
        }
        let mut changes = Vec::new();
        for ((path, before), (_, after)) in self.files.iter().zip(&other.files) {
            if before == after { continue; }
            if !path.to_ascii_lowercase().ends_with(".tex") { return None; }
            let text = std::str::from_utf8(after).ok()?;
            validate_source(text).ok()?;
            changes.push((path.clone(), text.to_owned()));
        }
        Some(changes)
    }
}

#[derive(Default)]
struct Manager {
    generation: u64,
    stopped: bool,
    session: Option<Arc<Session>>,
    events: Option<EventSink>,
}

#[derive(Default)]
pub struct NativeTexSessions(Arc<Mutex<Manager>>);

impl NativeTexSessions {
    fn get(&self, id: &str) -> Result<Arc<Session>, NativeTexError> {
        validate_id(id)?;
        lock(&self.0).session.as_ref().filter(|session| session.id == id).cloned()
            .ok_or_else(|| error("stale_session", "This native TeX session is no longer active."))
    }

    /// Permanent teardown: also prevents an outstanding trust dialog from starting
    /// an engine after its window has been destroyed.
    pub fn close_all(&self) {
        let old = {
            let mut manager = lock(&self.0);
            manager.stopped = true;
            manager.generation = manager.generation.wrapping_add(1);
            manager.session.take()
        };
        if let Some(session) = old {
            session.terminate();
        }
    }
}

impl Drop for NativeTexSessions {
    fn drop(&mut self) {
        self.close_all();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTexInfo {
    session_id: String,
    source_revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTexUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    edit_id: u64,
    source_revision: u64,
    routed: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTexExport {
    job_id: u64,
    source_revision: u64,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTypeOneFont {
    bytes: Vec<u8>,
    map_entry: String,
    encoding: Option<String>,
}

fn tex_resource_name(name: &str) -> bool {
    name.len() <= 255 && name.starts_with(|ch: char| ch.is_ascii_alphanumeric())
        && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-+_.".contains(&byte))
}

fn type_one_map_entry<'a>(map: &'a str, name: &str) -> Option<(&'a str, &'a str, Option<&'a str>)> {
    let line = map.lines().filter(|line| line.len() <= 4096)
        .find(|line| line.split_ascii_whitespace().next() == Some(name))?;
    let files = line.split('"').step_by(2).flat_map(str::split_ascii_whitespace)
        .filter(|token| token.starts_with('<'))
        .map(|token| token.trim_start_matches(|ch| ch == '<' || ch == '['))
        .filter(|token| tex_resource_name(token));
    let font = files.clone().find(|file| file.ends_with(".pfb") || file.ends_with(".pfa"))?;
    let encoding = files.clone().find(|file| file.ends_with(".enc"));
    Some((line, font, encoding))
}

#[derive(Default)]
struct Messages {
    events: VecDeque<Value>,
    event_bytes: usize,
    waiting: Option<&'static str>,
    reply: Option<Value>,
    exports: HashMap<u64, Value>,
    fonts: HashMap<String, String>,
    type_one_fonts: HashSet<String>,
    failure: Option<NativeTexError>,
    tail: VecDeque<u8>,
    command_deadline: Option<Instant>,
    layout_deadline: Option<Instant>,
    revision: Option<u64>,
    layout_revision: Option<u64>,
    latest_layout: Option<(u64, u64)>,
    layout_pdfs: BTreeMap<(u64, u64), PathBuf>,
}

impl Messages {
    fn diagnostic(&self, mut problem: NativeTexError) -> NativeTexError {
        problem.diagnostic_tail = String::from_utf8_lossy(&self.tail.iter().copied().collect::<Vec<_>>()).into_owned();
        problem
    }

    fn check(&self) -> Result<(), NativeTexError> {
        match &self.failure {
            Some(problem) => Err(self.diagnostic(problem.clone())),
            None => Ok(()),
        }
    }

    fn append_tail(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if self.tail.len() == TAIL_LIMIT {
                self.tail.pop_front();
            }
            self.tail.push_back(byte);
        }
    }

    fn register_dl(&mut self, dl: &Value) -> Result<(), NativeTexError> {
        if let Some(fonts) = dl.get("fonts").and_then(Value::as_object) {
            for font in fonts.values() {
                let Some(filename) = font.get("filename").and_then(Value::as_str).filter(|name| !name.is_empty()) else {
                    if let Some(name) = font.get("name").and_then(Value::as_str).filter(|name| tex_resource_name(name)) {
                        if self.type_one_fonts.len() >= 2048 && !self.type_one_fonts.contains(name) {
                            return Err(error("resource_limit", "Too many native Type 1 fonts."));
                        }
                        self.type_one_fonts.insert(name.to_string());
                    }
                    continue;
                };
                let extension = Path::new(filename).extension().and_then(|s| s.to_str()).unwrap_or("");
                if !["otf", "ttf", "otc", "ttc"].iter().any(|allowed| extension.eq_ignore_ascii_case(allowed)) {
                    continue;
                }
                if filename.is_empty() || filename.len() > 4096 || filename.contains('\0') {
                    return Err(error("protocol", "Invalid captured font filename."));
                }
                let subfont = font.get("subfont").and_then(Value::as_u64).unwrap_or(0);
                if subfont > u16::MAX as u64 {
                    return Err(error("protocol", "Invalid captured font subfont."));
                }
                let key = format!("file:{filename}#{subfont}");
                if self.fonts.len() >= 2048 && !self.fonts.contains_key(&key) {
                    return Err(error("resource_limit", "Too many native font resources."));
                }
                self.fonts.insert(key, filename.to_string());
            }
        }
        Ok(())
    }

    /// Replies never enter the event queue. Events are retained even if they
    /// precede their command's reply (including PdfExported).
    fn receive(&mut self, message: Value, bytes: usize) -> Result<(), NativeTexError> {
        if let Some(reply) = message.get("reply").and_then(Value::as_str) {
            if self.waiting.is_none()
                || (Some(reply) != self.waiting && reply != "error")
                || self.reply.is_some()
            {
                return Err(error("protocol", "Unexpected or duplicate rtex command reply."));
            }
            self.reply = Some(message);
            return Ok(());
        }
        let event = message.get("event").and_then(Value::as_str)
            .ok_or_else(|| error("protocol", "rtex output was neither a reply nor an event."))?;
        match event {
            "LayoutUpdate" => {
                let revision = integer(&message["versions"], "source_revision")?;
                // Older fixture/protocol frames without a version cannot grant PDF access.
                if let Ok(version) = integer(&message["versions"], "layout_version") {
                    if self.latest_layout.map_or(true, |latest| (revision, version) >= latest) {
                        self.latest_layout = Some((revision, version));
                    }
                    if let Some(path) = message["pdf_fallback"].as_str().filter(|path| !path.is_empty()) {
                        self.layout_pdfs.insert((revision, version), PathBuf::from(path));
                        while self.layout_pdfs.len() > 8 {
                            self.layout_pdfs.pop_first();
                        }
                    }
                }
                self.layout_revision = Some(self.layout_revision.unwrap_or(0).max(revision));
                if self.revision.is_some_and(|current| revision >= current) {
                    self.layout_deadline = None;
                }
                if let Some(pages) = message.get("pages_changed").and_then(Value::as_array) {
                    for page in pages {
                        self.register_dl(&page["dl"])?;
                    }
                }
            }
            "ParagraphUpdate" => self.register_dl(&message["dl"])?,
            "PdfExported" => {
                let job = integer(&message, "job_id")?;
                if self.exports.len() >= 16 {
                    return Err(error("protocol", "Too many unmatched export completions."));
                }
                self.exports.insert(job, message.clone());
            }
            _ => {}
        }
        if self.events.len() >= EVENT_LIMIT || self.event_bytes.saturating_add(bytes) > QUEUE_LIMIT {
            // Never silently lose a changed-page delta and leave the UI corrupted.
            return Err(error("event_overflow", "Native preview event queue filled. Reopen the preview."));
        }
        self.event_bytes += bytes;
        self.events.push_back(message);
        Ok(())
    }
}

struct Process {
    child: GroupChild,
    persistent: bool,
}

struct Session {
    id: String,
    root: PathBuf,
    tex_bin: Option<PathBuf>,
    closed: AtomicBool,
    processes: Mutex<Vec<Process>>,
    stdin: Mutex<Option<ChildStdin>>,
    commands: Mutex<()>,
    messages: Mutex<Messages>,
    changed: Condvar,
    snapshot: Mutex<Snapshot>,
    observer: Mutex<Option<Arc<Session>>>,
    observation_commands: Mutex<()>,
    observation_pages: Mutex<BTreeMap<u64, Value>>,
    events: Mutex<Option<EventSink>>,
}

impl Session {
    #[cfg(test)]
    fn create(source: &str) -> Result<Arc<Self>, NativeTexError> {
        Self::create_snapshot(Snapshot::new(source, "main.tex".into(), Vec::new())?)
    }

    fn create_snapshot(snapshot: Snapshot) -> Result<Arc<Self>, NativeTexError> {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        let id = format!("tex-{:08x}-{stamp:032x}-{:016x}", std::process::id(), NEXT_ID.fetch_add(1, Ordering::Relaxed));
        let root = std::env::temp_dir().join(format!("lineae-native-{id}"));
        let mut directory = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            directory.mode(0o700);
        }
        directory.create(&root).map_err(|e| error("temporary_project", format!("Cannot create temporary TeX project: {e}")))?;
        let session = Arc::new(Self {
            id, root, tex_bin: installed_tex_bin(), closed: AtomicBool::new(false), processes: Mutex::new(Vec::new()),
            stdin: Mutex::new(None), commands: Mutex::new(()),
            messages: Mutex::new(Messages::default()), changed: Condvar::new(),
            snapshot: Mutex::new(snapshot.clone()),
            observer: Mutex::new(None),
            observation_commands: Mutex::new(()),
            observation_pages: Mutex::new(BTreeMap::new()),
            events: Mutex::new(None),
        });
        for (path, bytes) in &snapshot.files {
            let destination = session.root.join(path);
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| error("temporary_project", format!("Cannot create temporary project directory: {e}")))?;
            }
            let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&destination)
                .map_err(|e| error("temporary_project", format!("Cannot stage temporary project file '{path}': {e}")))?;
            file.write_all(bytes).map_err(|e| error("temporary_project", format!("Cannot write temporary project file '{path}': {e}")))?;
        }
        Ok(session)
    }

    fn check(&self) -> Result<(), NativeTexError> {
        lock(&self.messages).check()?;
        if self.closed.load(Ordering::Acquire) {
            return Err(error("session_closed", "The native TeX session was closed."));
        }
        Ok(())
    }

    fn set_events(&self, sink: EventSink) {
        *lock(&self.events) = Some(sink);
    }

    fn fail(&self, problem: NativeTexError) {
        let mut messages = lock(&self.messages);
        if messages.failure.is_none() {
            messages.failure = Some(problem);
        }
        self.changed.notify_all();
    }

    fn terminate(&self) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        self.changed.notify_all();
        if let Some(observer) = lock(&self.observer).take() {
            observer.terminate();
        }
        // Do not take the command/stdin locks: a blocked pipe write must be
        // interruptible by an independent tree kill.
        let mut processes = lock(&self.processes);
        for mut process in processes.drain(..) {
            let _ = process.child.kill();
            let _ = process.child.wait();
        }
        drop(processes);
        // Windows can briefly retain handles after process/job termination.
        for attempt in 0..20 {
            match std::fs::remove_dir_all(&self.root) {
                Ok(()) => return,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return,
                Err(e) if attempt == 19 => {
                    self.fail(error("temporary_cleanup", format!("Cannot remove temporary TeX project: {e}")));
                }
                Err(_) => thread::sleep(Duration::from_millis(50)),
            }
        }
    }

    fn spawn(&self, command: &mut Command, persistent: bool) -> Result<(u32, std::process::ChildStdout, std::process::ChildStderr, Option<ChildStdin>), NativeTexError> {
        let mut processes = lock(&self.processes);
        self.check()?;
        command.current_dir(&self.root).stdout(Stdio::piped()).stderr(Stdio::piped());
        // command-group 5.0.1 uses a Unix process group / Windows
        // job object (spawn suspended, assign job, resume). No hand-rolled FFI.
        let mut group = command.group();
        #[cfg(windows)]
        group.kill_on_drop(true).creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = group.spawn()
            .map_err(|e| error("tool_missing", format!("Cannot start native TeX tool: {e}. Install rtex 0.0.8 and LuaLaTeX; set LINEAE_RTEX_PATH / RTEX_TEXLIVE_BIN if needed.")))?;
        let id = child.id();
        let stdout = child.inner().stdout.take().expect("piped stdout");
        let stderr = child.inner().stderr.take().expect("piped stderr");
        let stdin = child.inner().stdin.take();
        processes.push(Process { child, persistent });
        Ok((id, stdout, stderr, stdin))
    }

    fn watchdog(session: &Arc<Self>) -> Result<(), NativeTexError> {
        let weak = Arc::downgrade(session);
        thread::Builder::new().name("native-tex-watchdog".into()).spawn(move || loop {
            thread::sleep(Duration::from_millis(50));
            let Some(session) = weak.upgrade() else { return };
            if session.closed.load(Ordering::Acquire) { return; }
            let deadline_expired = {
                let messages = lock(&session.messages);
                messages.command_deadline.into_iter().chain(messages.layout_deadline)
                    .any(|deadline| Instant::now() >= deadline)
            };
            if deadline_expired {
                session.fail(error("timeout", "Native TeX timed out; its entire process tree was stopped."));
            }
            let exited = {
                let mut processes = lock(&session.processes);
                processes.iter_mut().filter(|p| p.persistent)
                    .find_map(|p| match p.child.inner().try_wait() {
                        Ok(Some(status)) => Some(format!("rtex exited ({status}).")),
                        Err(e) => Some(format!("Cannot inspect rtex: {e}")),
                        Ok(None) => None,
                    })
            };
            if let Some(message) = exited {
                session.fail(error("engine_exit", message));
            }
            let failed = lock(&session.messages).failure.is_some();
            if failed {
                session.terminate();
                return;
            }
        }).map_err(|e| error("thread", format!("Cannot start native TeX watchdog: {e}")))?;
        Ok(())
    }

    fn reader(session: &Arc<Self>, pipe: impl Read + Send + 'static, protocol: bool) -> Result<thread::JoinHandle<Vec<u8>>, NativeTexError> {
        let weak = Arc::downgrade(session);
        thread::Builder::new().name("native-tex-reader".into()).spawn(move || {
            let mut reader = BufReader::new(pipe);
            let mut captured = Vec::new();
            loop {
                let mut line = Vec::new();
                // take() bounds allocation even for a malformed/missing newline.
                let result = reader.by_ref().take((if protocol { LINE_LIMIT } else { 64 * 1024 }) as u64 + 1).read_until(b'\n', &mut line);
                let Some(session) = weak.upgrade() else { return captured };
                match result {
                    Ok(0) => {
                        if protocol && !session.closed.load(Ordering::Acquire) {
                            session.fail(error("engine_exit", "rtex closed its protocol output."));
                        }
                        return captured;
                    }
                    Ok(_) if protocol => {
                        let dispatched = if line.len() <= LINE_LIMIT {
                            serde_json::from_slice::<Value>(&line).ok()
                                .filter(|value| value.get("event").is_some())
                        } else { None };
                        let received = if line.len() > LINE_LIMIT {
                            Err(error("protocol_limit", "rtex protocol frame exceeded 16 MiB."))
                        } else {
                            serde_json::from_slice::<Value>(&line)
                                .map_err(|_| error("protocol", "Invalid JSON from rtex."))
                                .and_then(|message| lock(&session.messages).receive(message, line.len()))
                        };
                        if let Err(problem) = received {
                            session.fail(problem);
                            return captured;
                        }
                        if let Some(event) = dispatched {
                            if let Some(sink) = lock(&session.events).clone() { sink(event); }
                        }
                        session.changed.notify_all();
                    }
                    Ok(_) => {
                        lock(&session.messages).append_tail(&line);
                        // Tool stdout is retained only to a small cap; stderr is
                        // also continuously drained, never inherited by the UI.
                        if captured.len() < 64 * 1024 {
                            captured.extend_from_slice(&line[..line.len().min(64 * 1024 - captured.len())]);
                        }
                    }
                    Err(e) => {
                        if !session.closed.load(Ordering::Acquire) {
                            session.fail(error("engine_io", format!("Cannot read native TeX output: {e}")));
                        }
                        return captured;
                    }
                }
            }
        }).map_err(|e| error("thread", format!("Cannot read native TeX output: {e}")))
    }

    /// Short-lived tools share the same tree registry and watchdog as rtex.
    fn tool(self: &Arc<Self>, command: &mut Command) -> Result<String, NativeTexError> {
        lock(&self.messages).command_deadline = Some(Instant::now() + Duration::from_secs(15));
        let result = (|| {
            command.stdin(Stdio::null());
            let (id, stdout, stderr, _) = self.spawn(command, false)?;
            let out = Self::reader(self, stdout, false)?;
            let err = Self::reader(self, stderr, false)?;
            let status = loop {
                self.check()?;
                let status = {
                    let mut processes = lock(&self.processes);
                    let process = processes.iter_mut().find(|p| p.child.id() == id)
                        .ok_or_else(|| error("session_closed", "Native TeX tool was stopped."))?;
                    process.child.inner().try_wait()
                        .map_err(|e| error("engine_io", format!("Cannot wait for native TeX tool: {e}")))?
                };
                if let Some(status) = status { break status; }
                thread::sleep(Duration::from_millis(20));
            };
            {
                let mut processes = lock(&self.processes);
                if let Some(index) = processes.iter().position(|p| p.child.id() == id) {
                    let mut process = processes.remove(index);
                    let _ = process.child.kill();
                    let _ = process.child.wait();
                }
            }
            let output = out.join().map_err(|_| error("thread", "Native tool stdout reader failed."))?;
            let _ = err.join();
            self.check()?;
            if !status.success() {
                return Err(lock(&self.messages).diagnostic(error("tooling", format!("Native TeX tool failed ({status}). Check rtex support files (RTEX_TEXDIR) and LuaLaTeX (RTEX_TEXLIVE_BIN)."))));
            }
            Ok(String::from_utf8_lossy(&output).trim().to_string())
        })();
        // Clear deadlines on every path, including spawn/reader failures.
        // A failed short-lived tool must not leave descendants behind either.
        {
            let mut processes = lock(&self.processes);
            let mut index = 0;
            while index < processes.len() {
                if !processes[index].persistent {
                    let mut process = processes.remove(index);
                    let _ = process.child.kill();
                    let _ = process.child.wait();
                } else {
                    index += 1;
                }
            }
        }
        lock(&self.messages).command_deadline = None;
        result
    }

    fn start(self: &Arc<Self>) -> Result<NativeTexInfo, NativeTexError> {
        self.start_with_owners(false)
    }

    fn start_with_owners(self: &Arc<Self>, owners: bool) -> Result<NativeTexInfo, NativeTexError> {
        Self::watchdog(self)?;
        let executable = installed_rtex();
        let new_command = || {
            let mut command = Command::new(&executable);
            if let Some(bin) = &self.tex_bin { command.env("RTEX_TEXLIVE_BIN", bin); }
            if std::env::var_os("RTEX_TEXDIR").is_none() {
                if let Some(root) = BUNDLED_RTEX.get().filter(|root| executable.starts_with(root)) {
                    command.env("RTEX_TEXDIR", root.join("share").join("rtex").join("tex"));
                }
            }
            command
        };
        let version = self.tool(new_command().arg("--version"))?;
        if version.trim() != "rtex 0.0.8" {
            return Err(error("engine_version", format!("rtex 0.0.8 is required; found {}.", version.chars().take(120).collect::<String>())));
        }
        // Uses rtex's own support-file and TeX Live discovery, not a guessed layout.
        self.tool(new_command().arg("doctor"))?;
        let mut command = new_command();
        let main_file = lock(&self.snapshot).main_file.clone();
        command.args(["serve", "--project"]).arg(&self.root)
            .arg(format!("--main={main_file}")).arg("--build").arg(self.root.join("build"))
            .args(["--eligibility", "allowlist", "--compile-timeout-ms", "30000", "--pass-timeout-ms", "60000"])
            .stdin(Stdio::piped());
        if owners {
            command.args(["--math-owner-attribute", "65000"]);
        }
        lock(&self.messages).layout_deadline = Some(Instant::now() + LAYOUT_TIMEOUT);
        let (_, stdout, stderr, stdin) = self.spawn(&mut command, true)?;
        *lock(&self.stdin) = stdin;
        Self::reader(self, stdout, true)?;
        Self::reader(self, stderr, false)?;
        let _serial = lock(&self.commands);
        let status = self.request(json!({"cmd": "status"}), "status")?;
        let revision = integer(&status["versions"], "source_revision")?;
        {
            let mut messages = lock(&self.messages);
            messages.revision = Some(revision);
            if messages.layout_revision.is_some_and(|layout| layout >= revision) {
                messages.layout_deadline = None;
            }
        }
        Ok(NativeTexInfo { session_id: self.id.clone(), source_revision: revision })
    }

    /// Caller holds commands across compound operations, not the manager lock.
    fn request(&self, message: Value, expected: &'static str) -> Result<Value, NativeTexError> {
        self.check()?;
        let deadline = Instant::now() + COMMAND_TIMEOUT;
        {
            let mut messages = lock(&self.messages);
            messages.waiting = Some(expected);
            messages.reply = None;
            messages.command_deadline = Some(deadline);
        }
        let write = (|| -> std::io::Result<()> {
            let mut stdin = lock(&self.stdin);
            let input = stdin.as_mut().ok_or_else(|| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "rtex stdin unavailable"))?;
            serde_json::to_writer(&mut *input, &message)?;
            input.write_all(b"\n")?;
            input.flush()
        })();
        if let Err(e) = write {
            self.fail(error("engine_io", format!("Cannot send command to rtex: {e}")));
            self.terminate();
        }
        let mut messages = lock(&self.messages);
        loop {
            messages.check()?;
            if self.closed.load(Ordering::Acquire) {
                return Err(error("session_closed", "The native TeX session was closed."));
            }
            if let Some(reply) = messages.reply.take() {
                messages.waiting = None;
                messages.command_deadline = None;
                if reply["reply"] == "error" {
                    return Err(messages.diagnostic(error("engine_command", reply["message"].as_str().unwrap_or("rtex rejected the command.").chars().take(1024).collect::<String>())));
                }
                return Ok(reply);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                drop(messages);
                self.fail(error("timeout", "rtex did not reply before the command deadline."));
                self.terminate();
                return Err(lock(&self.messages).diagnostic(error("timeout", "rtex command timed out.")));
            }
            messages = self.changed.wait_timeout(messages, remaining).unwrap_or_else(|p| p.into_inner()).0;
        }
    }

    fn update(&self, source: String) -> Result<NativeTexUpdate, NativeTexError> {
        let _serial = lock(&self.commands);
        self.set_source(source)
    }

    /// Caller holds commands, including while replacing a project snapshot.
    fn set_source(&self, source: String) -> Result<NativeTexUpdate, NativeTexError> {
        validate_source(&source)?;
        let main_file = {
            let snapshot = lock(&self.snapshot);
            let dependencies: usize = snapshot.files.iter()
                .filter(|(path, _)| path.as_str() != snapshot.main_file.as_str())
                .map(|(_, bytes)| bytes.len()).sum();
            if dependencies.saturating_add(source.len()) > PROJECT_LIMIT {
                return Err(error("project_limit", "Updated source exceeds the 64 MiB project snapshot limit."));
            }
            snapshot.main_file.clone()
        };
        self.apply_tex_buffers(vec![(main_file, source)])
    }

    // Caller owns commands and has already validated every staged path and buffer.
    fn apply_tex_buffers(&self, changes: Vec<(String, String)>) -> Result<NativeTexUpdate, NativeTexError> {
        let mut update = None;
        for (path, source) in changes {
            update = Some(self.set_tex_buffer(path, source)?);
        }
        let update = update.ok_or_else(|| error("protocol", "No native TeX buffers to update."))?;
        self.request(json!({"cmd": "request_layout"}), "request_layout")?;
        Ok(update)
    }

    fn set_tex_buffer(&self, path: String, source: String) -> Result<NativeTexUpdate, NativeTexError> {
        let reply = self.request(json!({"cmd": "set_document", "path": &path, "text": &source}), "set_document")?;
        let result = &reply["result"];
        let revision = integer(result, "source_revision")?;
        let edit_id = integer(result, "edit_id")?;
        let routed = result["routed"].as_str().filter(|s| matches!(*s, "fast" | "background" | "preamble"))
            .ok_or_else(|| error("protocol", "rtex returned invalid edit routing."))?.to_string();
        {
            let mut messages = lock(&self.messages);
            if messages.revision.is_some_and(|previous| revision < previous) {
                return Err(error("protocol", "rtex source revision moved backwards."));
            }
            messages.revision = Some(revision);
            if !messages.layout_revision.is_some_and(|layout| layout >= revision) {
                messages.layout_deadline.get_or_insert(Instant::now() + LAYOUT_TIMEOUT);
            }
        }
        lock(&self.snapshot).files.insert(path, source.into_bytes());
        Ok(NativeTexUpdate { session_id: None, edit_id, source_revision: revision, routed })
    }

    fn font(self: &Arc<Self>, key: String) -> Result<Vec<u8>, NativeTexError> {
        if key.len() > 4200 || !key.starts_with("file:") {
            return Err(error("font_resource", "Invalid native font resource token."));
        }
        self.check()?;
        let filename = lock(&self.messages).fonts.get(&key).cloned()
            .ok_or_else(|| error("font_resource", "Font token was not referenced by this session's captured OpenType display lists."))?;
        let _serial = lock(&self.commands);
        self.check()?;
        let path = PathBuf::from(&filename);
        let path = if path.is_absolute() {
            path
        } else if self.root.join(&path).is_file() {
            self.root.join(path)
        } else {
            let kpsewhich = self.tex_bin.as_ref()
                .map(|bin| bin.join(if cfg!(windows) { "kpsewhich.exe" } else { "kpsewhich" }))
                .unwrap_or_else(|| PathBuf::from("kpsewhich"));
            let found = self.tool(Command::new(kpsewhich).arg("--").arg(&filename))
                .map_err(|problem| error("font_missing", format!("Cannot locate captured font '{filename}': {}", problem.message)))?;
            if found.is_empty() || found.lines().count() != 1 {
                return Err(error("font_missing", format!("Captured font '{filename}' was not found by kpsewhich.")));
            }
            PathBuf::from(found)
        };
        self.check()?;
        let file = std::fs::File::open(&path)
            .map_err(|e| error("font_missing", format!("Captured font '{filename}' is unavailable at '{}': {e}", path.display())))?;
        if file.metadata().map_err(|e| error("font_io", e.to_string()))?.len() > FONT_LIMIT {
            return Err(error("font_limit", "Captured font exceeds 32 MiB."));
        }
        let mut bytes = Vec::new();
        file.take(FONT_LIMIT + 1).read_to_end(&mut bytes).map_err(|e| error("font_io", e.to_string()))?;
        if bytes.len() as u64 > FONT_LIMIT || !(bytes.starts_with(b"OTTO") || bytes.starts_with(&[0, 1, 0, 0]) || bytes.starts_with(b"true") || bytes.starts_with(b"ttcf")) {
            return Err(error("font_format", format!("Captured font '{filename}' is not a supported OpenType font.")));
        }
        self.check()?;
        Ok(bytes)
    }

    fn tex_font_file(self: &Arc<Self>, name: &str, limit: u64) -> Result<Vec<u8>, NativeTexError> {
        let kpsewhich = self.tex_bin.as_ref()
            .map(|bin| bin.join(if cfg!(windows) { "kpsewhich.exe" } else { "kpsewhich" }))
            .unwrap_or_else(|| PathBuf::from("kpsewhich"));
        let found = self.tool(Command::new(kpsewhich).arg("--").arg(name))?;
        if found.is_empty() || found.lines().count() != 1 {
            return Err(error("font_missing", format!("Cannot locate the TeX font resource '{name}'.")));
        }
        let file = std::fs::File::open(found)
            .map_err(|_| error("font_missing", format!("Cannot open the TeX font resource '{name}'.")))?;
        let mut bytes = Vec::new();
        file.take(limit + 1).read_to_end(&mut bytes).map_err(|problem| error("font_io", problem.to_string()))?;
        if bytes.len() as u64 > limit {
            return Err(error("font_limit", "The Type 1 font resource exceeds the size limit."));
        }
        Ok(bytes)
    }

    fn type_one_font(self: &Arc<Self>, key: String) -> Result<NativeTypeOneFont, NativeTexError> {
        let name = key.strip_prefix("tfm:").filter(|name| tex_resource_name(name))
            .ok_or_else(|| error("font_resource", "Invalid native Type 1 resource token."))?;
        if !lock(&self.messages).type_one_fonts.contains(name) {
            return Err(error("font_resource", "Type 1 font was not captured in this session."));
        }
        let _serial = lock(&self.commands);
        self.check()?;
        let map = self.tex_font_file("pdftex.map", 8 << 20)?;
        let map = String::from_utf8_lossy(&map);
        let (entry, file, encoding) = type_one_map_entry(&map, name)
            .ok_or_else(|| error("font_missing", format!("No Type 1 outline mapping exists for '{name}'.")))?;
        let bytes = self.tex_font_file(file, 2 << 20)?;
        if !(bytes.starts_with(&[0x80, 1]) || bytes.starts_with(b"%!")) {
            return Err(error("font_format", "The captured outline is not a Type 1 font."));
        }
        let encoding = encoding.map(|name| self.tex_font_file(name, 256 << 10)
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())).transpose()?;
        self.check()?;
        Ok(NativeTypeOneFont { bytes, map_entry: entry.to_string(), encoding })
    }

    /// Caller holds commands to freeze the raw source/assets through compilation.
    /// PDF bytes have no editable geometry contract.
    fn compile_pdf(&self, revision: u64) -> Result<(u64, Vec<u8>), NativeTexError> {
        self.check()?;
        if lock(&self.messages).revision != Some(revision) {
            return Err(error("revision_mismatch", "The source changed while choosing an export destination. Export again."));
        }
        let output = self.root.join("build").join("lineae-export.pdf");
        match std::fs::remove_file(&output) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(error("export_failed", format!("Cannot clear previous temporary export: {e}"))),
        }
        let reply = self.request(json!({"cmd": "export_pdf", "out": output}), "export_pdf")?;
        let job = integer(&reply, "job_id")?;
        let deadline = Instant::now() + EXPORT_TIMEOUT;
        let mut messages = lock(&self.messages);
        messages.command_deadline = Some(deadline);
        let event = loop {
            messages.check()?;
            if self.closed.load(Ordering::Acquire) {
                return Err(error("session_closed", "Native PDF export was canceled by session close."));
            }
            if let Some(event) = messages.exports.remove(&job) {
                messages.command_deadline = None;
                break event;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                drop(messages);
                self.fail(error("timeout", "Native PDF export timed out."));
                self.terminate();
                return Err(error("timeout", "Native PDF export timed out."));
            }
            messages = self.changed.wait_timeout(messages, remaining).unwrap_or_else(|p| p.into_inner()).0;
        };
        drop(messages);
        // Never trust an event's arbitrary path; only our fixed output is read.
        if event["status"]["state"] != "Ok" || event["converged"] != true {
            return Err(error("export_failed", "LuaLaTeX did not produce a successful, converged clean PDF. The destination was not changed."));
        }
        self.check()?;
        Ok((job, self.read_pdf(&output)?))
    }

    fn read_pdf(&self, path: &Path) -> Result<Vec<u8>, NativeTexError> {
        self.check()?;
        let canonical = |path: &Path| path.canonicalize()
            .map_err(|e| error("pdf_missing", format!("Native PDF resource is unavailable: {e}")));
        let root = canonical(&self.root)?;
        let build = canonical(&self.root.join("build"))?;
        let path = canonical(path)?;
        if build == root || !build.starts_with(&root) || !path.starts_with(&build) {
            return Err(error("pdf_resource", "Native PDF resource escaped the session build directory."));
        }
        let file = std::fs::File::open(&path).map_err(|e| error("pdf_missing", e.to_string()))?;
        let metadata = file.metadata().map_err(|e| error("pdf_io", e.to_string()))?;
        if !metadata.is_file() || metadata.len() > PDF_LIMIT {
            return Err(error("pdf_limit", "Native PDF must be a regular file, at most 64 MiB."));
        }
        let mut bytes = Vec::new();
        file.take(PDF_LIMIT + 1).read_to_end(&mut bytes).map_err(|e| error("pdf_io", e.to_string()))?;
        if bytes.len() as u64 > PDF_LIMIT || !bytes.starts_with(b"%PDF-") {
            return Err(error("pdf_format", "Native PDF resource has an invalid header or size."));
        }
        self.check()?;
        Ok(bytes)
    }

    fn pdf(&self, revision: u64, layout_version: u64) -> Result<Vec<u8>, NativeTexError> {
        let _serial = lock(&self.commands);
        self.check()?;
        let path = {
            let messages = lock(&self.messages);
            if messages.revision != Some(revision) || messages.latest_layout != Some((revision, layout_version)) {
                return Err(error("revision_mismatch", "This PDF request does not match the current source and layout."));
            }
            messages.layout_pdfs.get(&(revision, layout_version)).cloned()
                .ok_or_else(|| error("pdf_unavailable", "This exact layout has no registered PDF fallback. Request a clean read-only PDF snapshot instead."))?
        };
        let path = if path.is_absolute() { path } else { self.root.join(path) };
        let bytes = self.read_pdf(&path)?;
        // A newer layout can arrive independently of the command lock.
        if lock(&self.messages).latest_layout != Some((revision, layout_version)) {
            return Err(error("revision_mismatch", "A newer native layout replaced this PDF."));
        }
        Ok(bytes)
    }

    fn render_pdf(&self, revision: u64) -> Result<Vec<u8>, NativeTexError> {
        let _serial = lock(&self.commands);
        self.compile_pdf(revision).map(|(_, bytes)| bytes)
    }

    // Instrumentation is deliberately isolated from the authoritative engine:
    // neither its source nor its PDF ever replaces the user's raw snapshot.
    fn observe_formula(&self, revision: u64, projection: &str, files: Vec<NativeTexProjection>) -> Result<Vec<Value>, NativeTexError> {
        let _observation = self.observation_commands.try_lock()
            .map_err(|_| error("formula_observation", "Another formula observation is already running."))?;
        let snapshot = {
            let _serial = lock(&self.commands);
            self.check()?;
            if lock(&self.messages).revision != Some(revision) {
                return Err(error("revision_mismatch", "The source changed before observing its formula."));
            }
            let mut snapshot = lock(&self.snapshot).clone();
            snapshot.files.insert(snapshot.main_file.clone(), projection.as_bytes().to_vec());
            let mut patched = std::collections::HashSet::new();
            for file in files {
                validate_project_path(&file.path)?;
                validate_source(&file.source)?;
                if file.path == snapshot.main_file || !file.path.to_ascii_lowercase().ends_with(".tex")
                    || !patched.insert(file.path.to_lowercase()) {
                    return Err(error("project_path", "Formula projection must name a unique included TeX file."));
                }
                let original = snapshot.files.get_mut(&file.path)
                    .filter(|original| std::str::from_utf8(original).is_ok())
                    .ok_or_else(|| error("project_path", "Formula projection refers to a file outside the trusted snapshot."))?;
                *original = file.source.into_bytes();
            }
            if snapshot.files.values().map(Vec::len).sum::<usize>() > PROJECT_LIMIT {
                return Err(error("project_limit", "Instrumented preview exceeds the project snapshot limit."));
            }
            snapshot
        };
        let previous = lock(&self.observer).clone();
        let reusable = previous.and_then(|active| {
            active.check().ok()?;
            let changes = lock(&active.snapshot).changed_tex_buffers(&snapshot)?;
            Some((active, changes))
        });
        let mut pages = lock(&self.observation_pages);
        let (observer, changes) = if let Some((active, changes)) = reusable {
            (active, Some(changes))
        } else {
            let observer = Self::create_snapshot(snapshot)?;
            let old = {
                let mut active = lock(&self.observer);
                self.check()?;
                active.replace(observer.clone())
            };
            if let Some(old) = old { old.terminate(); }
            pages.clear();
            (observer, None)
        };
        let result: Result<Vec<Value>, NativeTexError> = (|| {
            let target = match changes {
                Some(changes) if changes.is_empty() => observer.update(projection.to_owned())?.source_revision,
                Some(changes) => {
                    let _serial = lock(&observer.commands);
                    observer.apply_tex_buffers(changes)?.source_revision
                }
                None => observer.start_with_owners(true)?.source_revision,
            };
            // A cold observation may need the same complete passes as the primary layout.
            // Source revisions are still checked on every wake while those passes run.
            let deadline = Instant::now() + LAYOUT_TIMEOUT;
            let mut messages = lock(&observer.messages);
            loop {
                self.check()?;
                if lock(&self.messages).revision != Some(revision) {
                    return Err(error("revision_mismatch", "Source changed while observing formula geometry."));
                }
                messages.check()?;
                let events = std::mem::take(&mut messages.events);
                messages.event_bytes = 0;
                let mut ready = false;
                for event in events {
                    if event["event"] != "LayoutUpdate" { continue; }
                    let source = integer(&event["versions"], "source_revision")?;
                    if event["compile"]["state"] != "Ok" {
                        if source == target {
                            return Err(error("formula_observation", "The instrumented formula did not compile."));
                        }
                        continue;
                    }
                    if let Some(changed) = event["pages_changed"].as_array() {
                        for page in changed {
                            pages.insert(integer(page, "page")?, page.clone());
                        }
                    }
                    let total = integer(&event, "pages_total")?;
                    pages.retain(|page, _| *page <= total);
                    if source == target && event["convergence"]["state"] == "Converged" {
                        ready = pages.len() as u64 == total;
                    }
                }
                if ready { return Ok(pages.values().cloned().collect()); }
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    return Err(messages.diagnostic(error("formula_observation", "No converged instrumented formula layout.")));
                }
                messages = observer.changed.wait_timeout(messages, remaining.min(Duration::from_millis(100)))
                    .unwrap_or_else(|p| p.into_inner()).0;
            }
        })();
        if let Err(problem) = &result {
            if problem.code != "revision_mismatch" {
                observer.terminate();
                lock(&self.observer).take();
                pages.clear();
            }
        }
        result
    }

    fn export(&self, revision: u64, destination: PathBuf) -> Result<NativeTexExport, NativeTexError> {
        // Freeze native mutations through the clean build and approved copy.
        let _serial = lock(&self.commands);
        let (job, bytes) = self.compile_pdf(revision)?;
        // Stage beside the approved destination, then atomically replace it.
        // Compilation/copy failures never truncate an existing user PDF.
        let parent = destination.parent().ok_or_else(|| error("export_path", "The selected PDF has no parent directory."))?;
        let staging_path = parent.join(format!(".lineae-export-{}-{job}.tmp", self.id));
        let mut staging = std::fs::OpenOptions::new().write(true).create_new(true).open(&staging_path)
            .map_err(|e| error("export_copy", format!("Cannot stage the completed PDF: {e}")))?;
        let published = (|| {
            staging.write_all(&bytes).map_err(|e| error("export_copy", e.to_string()))?;
            staging.sync_all().map_err(|e| error("export_copy", e.to_string()))?;
            drop(staging);
            self.check()?;
            std::fs::rename(&staging_path, &destination)
                .map_err(|e| error("export_copy", format!("Cannot publish the completed PDF: {e}")))
        })();
        if published.is_err() {
            let _ = std::fs::remove_file(&staging_path);
        }
        published?;
        Ok(NativeTexExport { job_id: job, source_revision: revision, path: destination.to_string_lossy().into_owned() })
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.terminate();
    }
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, NativeTexError> + Send + 'static) -> Result<T, NativeTexError> {
    tauri::async_runtime::spawn_blocking(work).await
        .map_err(|e| error("native_task", format!("Native TeX task failed: {e}")))?
}

/// `files: Some` is a complete replacement dependency snapshot, not a patch.
/// A changed dependency (including deletion/binary changes) starts a new engine
/// session so no stale parsed assets, aux state, or cached pictures survive.
fn update_snapshot(
    manager: &Mutex<Manager>,
    session: Arc<Session>,
    source: String,
    files: Option<Vec<NativeTexFile>>,
    main_file: Option<String>,
) -> Result<NativeTexUpdate, NativeTexError> {
    let _serial = lock(&session.commands);
    session.check()?;
    let current_main = lock(&session.snapshot).main_file.clone();
    let next_main = main_file.unwrap_or_else(|| current_main.clone());
    if next_main != current_main && !files.as_ref().is_some_and(|entries|
        entries.iter().any(|file| file.path == next_main)) {
        return Err(error("project_main", "The new compilation entry is missing from the project snapshot."));
    }
    let snapshot = match files {
        None => return session.set_source(source),
        Some(files) => Snapshot::new(&source, next_main, files)?,
    };
    if lock(&session.snapshot).dependencies_equal(&snapshot) {
        return session.set_source(source);
    }
    let buffers = lock(&session.snapshot).changed_tex_buffers(&snapshot);
    let incremental_failure = match buffers.map(|changes| session.apply_tex_buffers(changes)) {
        Some(Ok(update)) => return Ok(update),
        Some(Err(problem)) => Some(problem),
        None => None,
    };
    let replacement = Session::create_snapshot(snapshot).map_err(|problem| {
        if let Some(incremental) = incremental_failure {
            session.fail(incremental);
            session.terminate();
            return error("session_closed", format!("Cannot restage the native TeX update: {}", problem.message));
        }
        problem
    })?;
    if let Some(sink) = lock(manager).events.clone() {
        replacement.set_events(sink);
    }
    {
        let mut manager = lock(manager);
        if manager.stopped || !manager.session.as_ref().is_some_and(|active| active.id == session.id) {
            return Err(error("stale_session", "A newer session replaced this project update."));
        }
        manager.generation = manager.generation.wrapping_add(1);
        manager.session = Some(replacement.clone());
    }
    session.terminate();
    let result = replacement.start().and_then(|_| replacement.update(source)).map(|mut update| {
        update.session_id = Some(replacement.id.clone());
        update
    });
    if let Err(problem) = &result {
        replacement.fail(problem.clone());
        replacement.terminate();
    }
    result.map_err(|problem| lock(&replacement.messages).diagnostic(problem))
}

#[tauri::command]
pub async fn native_tex_open(
    app: AppHandle,
    state: State<'_, NativeTexSessions>,
    source: String,
    main_file: Option<String>,
    files: Option<Vec<NativeTexFile>>,
) -> Result<Option<NativeTexInfo>, NativeTexError> {
    let snapshot = Snapshot::new(&source, main_file.unwrap_or_else(|| "main.tex".into()), files.unwrap_or_default())?;
    let (generation, old) = {
        let mut manager = lock(&state.0);
        if manager.stopped { return Err(error("session_closed", "The native TeX host is shutting down.")); }
        manager.generation = manager.generation.wrapping_add(1);
        (manager.generation, manager.session.take())
    };
    if let Some(old) = old { blocking(move || { old.terminate(); Ok(()) }).await?; }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let dialog_app = app.clone();
    app.run_on_main_thread(move || dialog_app.dialog().message("Compile this project with native LuaLaTeX?\n\nOnly continue if you trust its source and included project assets. LuaLaTeX can execute Lua and access or change files with your account's permissions, even without shell escape. The temporary snapshot is not a security sandbox.")
        .title("Trust native TeX source")
        .buttons(MessageDialogButtons::OkCancelCustom("Trust and compile".into(), "Cancel".into()))
        .show(move |approved| { let _ = sender.send(approved); }))
        .map_err(|e| error("trust_dialog", format!("Cannot show native TeX trust dialog: {e}")))?;
    if !receiver.await.map_err(|_| error("trust_canceled", "Native TeX trust dialog was closed."))? {
        return Ok(None);
    }
    let session = blocking(move || Session::create_snapshot(snapshot)).await?;
    let session_id = session.id.clone();
    let event_app = app.clone();
    session.set_events(Arc::new(move |event| {
        let _ = event_app.emit("lineae-native-tex", json!({
            "sessionId": session_id,
            "event": event,
        }));
    }));
    {
        let mut manager = lock(&state.0);
        if manager.stopped || manager.generation != generation {
            return Err(error("stale_session", "A newer native TeX session replaced this request."));
        }
        manager.session = Some(session.clone());
        manager.events = lock(&session.events).clone();
    }
    blocking(move || {
        let result = session.start();
        if let Err(problem) = &result {
            session.fail(problem.clone());
            session.terminate();
        }
        result.map_err(|problem| lock(&session.messages).diagnostic(problem))
    }).await.map(Some)
}

#[tauri::command]
pub async fn native_tex_update(state: State<'_, NativeTexSessions>, session_id: String, source: String, files: Option<Vec<NativeTexFile>>, main_file: Option<String>) -> Result<NativeTexUpdate, NativeTexError> {
    validate_source(&source)?;
    let session = state.get(&session_id)?;
    let manager = state.0.clone();
    blocking(move || {
        let result = update_snapshot(&manager, session.clone(), source, files, main_file);
        // Snapshot validation failures leave the current project usable.
        if let Err(problem) = &result {
            if !matches!(problem.code, "project_path" | "project_limit" | "project_main" | "temporary_project" | "invalid_source" | "stale_session") {
                session.fail(problem.clone());
                session.terminate();
            }
        }
        result.map_err(|problem| lock(&session.messages).diagnostic(problem))
    }).await
}

#[tauri::command]
pub fn native_tex_poll(state: State<'_, NativeTexSessions>, session_id: String) -> Result<Vec<Value>, NativeTexError> {
    let session = state.get(&session_id)?;
    let mut messages = lock(&session.messages);
    messages.check()?;
    messages.event_bytes = 0;
    Ok(messages.events.drain(..).map(|mut event| {
        // Keep engine versions/geometry/diagnostics intact, but never publish
        // host-private PDF paths as web resources. Provenance stays in the hub.
        if event["event"] == "LayoutUpdate" {
            let available = event["pdf_fallback"].as_str().is_some_and(|path| !path.is_empty());
            event["pdf_fallback_registered"] = json!(available);
            event["pdf_fallback"] = Value::Null;
        } else if event["event"] == "PdfExported" {
            event["path"] = Value::Null;
        }
        event
    }).collect())
}

#[tauri::command]
pub async fn native_tex_font(state: State<'_, NativeTexSessions>, session_id: String, key: String) -> Result<Response, NativeTexError> {
    let session = state.get(&session_id)?;
    blocking(move || session.font(key)).await.map(Response::new)
}

#[tauri::command]
pub async fn native_tex_type_one_font(state: State<'_, NativeTexSessions>, session_id: String, key: String) -> Result<NativeTypeOneFont, NativeTexError> {
    let session = state.get(&session_id)?;
    blocking(move || session.type_one_font(key)).await
}

/// Only the PDF provenance registered by this exact current layout is accepted.
#[tauri::command]
pub async fn native_tex_pdf(state: State<'_, NativeTexSessions>, session_id: String, source_revision: u64, layout_version: u64) -> Result<Response, NativeTexError> {
    if source_revision > MAX_SAFE_INTEGER || layout_version > MAX_SAFE_INTEGER {
        return Err(error("invalid_revision", "Invalid source or layout revision."));
    }
    let session = state.get(&session_id)?;
    blocking(move || session.pdf(source_revision, layout_version)).await.map(Response::new)
}

/// Clean, revision-frozen read-only PDF, also available when an exact display
/// list uses Type 1/TTC/fonts/images unsupported by the browser glyph renderer.
/// Returns bytes only; never a filesystem path or editable geometry.
#[tauri::command]
pub async fn native_tex_render_pdf(state: State<'_, NativeTexSessions>, session_id: String, source_revision: u64) -> Result<Response, NativeTexError> {
    if source_revision > MAX_SAFE_INTEGER {
        return Err(error("invalid_revision", "Invalid source revision."));
    }
    let session = state.get(&session_id)?;
    blocking(move || session.render_pdf(source_revision)).await.map(Response::new)
}

#[tauri::command]
pub async fn native_tex_observe_formula(
    state: State<'_, NativeTexSessions>, session_id: String, source_revision: u64, projection: String,
    files: Option<Vec<NativeTexProjection>>,
) -> Result<Vec<Value>, NativeTexError> {
    validate_source(&projection)?;
    let session = state.get(&session_id)?;
    blocking(move || session.observe_formula(source_revision, &projection, files.unwrap_or_default())).await
}

#[tauri::command]
pub async fn native_tex_export(app: AppHandle, state: State<'_, NativeTexSessions>, session_id: String, source_revision: u64) -> Result<Option<NativeTexExport>, NativeTexError> {
    if source_revision > MAX_SAFE_INTEGER {
        return Err(error("invalid_revision", "Invalid expected source revision."));
    }
    let session = state.get(&session_id)?;
    session.check()?;
    if lock(&session.messages).revision != Some(source_revision) {
        return Err(error("revision_mismatch", "Only the current native source revision can be exported."));
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let dialog_app = app.clone();
    app.run_on_main_thread(move || dialog_app.dialog().file().add_filter("PDF", &["pdf"]).set_file_name("document.pdf")
        .save_file(move |path| { let _ = sender.send(path); }))
        .map_err(|e| error("export_dialog", format!("Cannot show native PDF save dialog: {e}")))?;
    let Some(path) = receiver.await.map_err(|_| error("export_canceled", "Native PDF save dialog was closed."))? else { return Ok(None) };
    let mut destination = path.into_path().map_err(|e| error("export_path", e.to_string()))?;
    if destination.extension().is_none() { destination.set_extension("pdf"); }
    blocking(move || session.export(source_revision, destination).map(Some)).await
}

#[tauri::command]
pub async fn native_tex_close(state: State<'_, NativeTexSessions>, session_id: String) -> Result<(), NativeTexError> {
    validate_id(&session_id)?;
    let session = {
        let mut manager = lock(&state.0);
        match &manager.session {
            Some(session) if session.id == session_id => manager.session.take(),
            _ => return Err(error("stale_session", "This native TeX session is no longer active.")),
        }
    };
    if let Some(session) = session { blocking(move || { session.terminate(); Ok(()) }).await?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_one_font_names_and_map_resources_are_bounded() {
        let map = "cmmi100 Another <other.pfb\ncmmi10 CMMI10 \"0.1 SlantFont\" <[math.enc <cmmi10.pfb\n";
        let (_, font, encoding) = type_one_map_entry(map, "cmmi10").unwrap();
        assert_eq!(font, "cmmi10.pfb");
        assert_eq!(encoding, Some("math.enc"));
        assert!(type_one_map_entry("cmmi10 CMMI10 </private/cmmi10.pfb", "cmmi10").is_none());
        assert!(!tex_resource_name("../cmmi10"));
        assert!(!tex_resource_name("-output"));
        let mut messages = Messages::default();
        messages.register_dl(&json!({"fonts":{"1":{"name":"cmmi10"},"2":{"name":"../hidden"}}})).unwrap();
        assert_eq!(messages.type_one_fonts, HashSet::from(["cmmi10".into()]));
    }

    fn save_pdf_evidence(name: &str, bytes: &[u8]) {
        if let Some(directory) = std::env::var_os("LINEAE_NATIVE_EVIDENCE_DIR") {
            assert!(!directory.is_empty(), "configured evidence directory must not be empty");
            let directory = PathBuf::from(directory);
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(directory.join(name), bytes).unwrap();
        }
    }

    #[test]
    #[ignore = "requires the comprehensive pinned LuaLaTeX project CI toolchain"]
    fn real_native_project() {
        for name in ["LINEAE_RTEX_PATH", "RTEX_TEXLIVE_BIN"] {
            assert!(!std::env::var_os(name).unwrap_or_else(|| panic!("{name} is required")).is_empty());
        }
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../tests/native-math/fixtures/lua-project");
        let source = std::fs::read_to_string(fixture.join("main.tex")).unwrap();
        let sibling = std::fs::read(fixture.join("chapters/one.tex")).unwrap();
        let session = Session::create_snapshot(Snapshot::new(&source, "main.tex".into(), vec![
            NativeTexFile { path: "chapters/one.tex".into(), bytes: sibling },
        ]).unwrap()).unwrap();
        let info = session.start().expect("comprehensive LuaLaTeX project must start");
        let pdf = session.render_pdf(info.source_revision)
            .expect("ctex/Fandol, unicode-math, Lua and TikZ must produce a converged clean PDF");
        assert!(pdf.starts_with(b"%PDF-"));
        save_pdf_evidence("native-lua-project.pdf", &pdf);
        let root = session.root.clone();
        session.terminate();
        assert!(!root.exists());
        assert!(lock(&session.processes).is_empty());
    }

    /// Prose ownership is only accepted when rtex reports attributes on text
    /// glyphs outside math. This gate runs on both target platforms.
    #[test]
    #[ignore = "requires the pinned real rtex 0.0.8 / LuaLaTeX CI toolchain"]
    fn real_native_text_observation() {
        for name in ["LINEAE_RTEX_PATH", "RTEX_TEXLIVE_BIN"] {
            assert!(!std::env::var_os(name).unwrap_or_else(|| panic!("{name} is required")).is_empty());
        }
        let source = include_str!("../../../../tests/native-math/fixtures/prose-font.tex");
        let directory = PathBuf::from(std::env::var_os("LINEAE_NATIVE_EVIDENCE_DIR")
            .expect("the real prose fixture needs the generated production projection"));
        let projection = std::fs::read_to_string(directory.join("prose-projection.tex")).unwrap();
        let session = Session::create(source).unwrap();
        let info = session.start_with_owners(true).expect("prose owner session must start");
        {
            let deadline = Instant::now() + Duration::from_secs(180);
            let mut messages = lock(&session.messages);
            loop {
                messages.check().expect("real engine failed while waiting for prose geometry");
                if messages.events.iter().any(|event| event["event"] == "LayoutUpdate"
                    && event["versions"]["source_revision"].as_u64() == Some(info.source_revision)
                    && event["compile"]["state"] == "Ok"
                    && event["convergence"]["state"] == "Converged") {
                    break;
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                assert!(!remaining.is_zero(), "no converged prose layout");
                messages = session.changed.wait_timeout(messages, remaining).unwrap().0;
            }
        }
        let observed = session.observe_formula(info.source_revision, &projection, Vec::new())
            .expect("prose attributes must produce observable glyph boxes");
        let owned = |owner: i64, ch: i64| observed.iter().any(|page| {
            page["dl"]["math_owners"]["glyphs"].as_array().is_some_and(|glyphs| glyphs.iter()
                .any(|glyph| glyph["owner"] == owner && glyph["char"] == ch))
        });
        assert!(owned(1, 65) && owned(2, 108), "text glyph ownership must survive compilation");
        assert!(owned(12, '汉' as i64) && owned(13, '字' as i64),
            "each CJK glyph needs its own editable source address");
        assert!(observed.iter().any(|page| page["dl"]["math_owners"]["glyphs"].as_array()
            .is_some_and(|glyphs| glyphs.iter().any(|glyph| glyph["owner"] == 11))),
            "the escaped caret must have native text geometry");
        let terminal: u64 = std::fs::read_to_string(directory.join("prose-terminal-owner.txt"))
            .unwrap().parse().unwrap();
        assert!(observed.iter().any(|page| page["dl"]["math_owners"]["fields"].as_array()
            .is_some_and(|fields| fields.iter().any(|field|
                field["owner"] == terminal && field["role"] == "math" && field["empty"] == true))),
            "the terminal footnote must leave an exact native typing position");
        let raw = lock(&session.messages).events.iter()
            .filter(|event| event["event"] == "LayoutUpdate"
                && event["versions"]["source_revision"].as_u64() == Some(info.source_revision))
            .filter_map(|event| event["pages_changed"].as_array())
            .flatten()
            .filter(|page| observed.iter().any(|item| item["page"] == page["page"]))
            .filter_map(|page| Some((page["page"].as_u64()?, page.clone())))
            .collect::<BTreeMap<_, _>>().into_values().collect::<Vec<_>>();
        assert!(!raw.is_empty(), "raw pages must be available for prose evidence");
        std::fs::write(directory.join("native-text-pages.json"), serde_json::to_vec(&json!({
            "raw":raw, "observed":observed, "projection":projection, "source":source,
        })).unwrap()).unwrap();
        session.terminate();
    }

    /// Explicit remote CI gate only; this is not a JavaScript trust-dialog bypass.
    #[test]
    #[ignore = "requires the pinned real rtex 0.0.8 / LuaLaTeX CI toolchain"]
    fn real_native_session() {
        for name in ["LINEAE_RTEX_PATH", "RTEX_TEXLIVE_BIN"] {
            let value = std::env::var_os(name).unwrap_or_else(|| panic!("{name} is required for this explicitly selected real-engine test"));
            assert!(!value.is_empty(), "{name} must not be empty");
        }
        let source = concat!(
            "\\documentclass{article}\n",
            "\\usepackage{amsmath}\n",
            "\\usepackage{unicode-math}\n",
            "\\usepackage{localstyle}\n",
            "\\setmathfont{Latin Modern Math}\n",
            "\\begin{document}\n",
            "Native LuaLaTeX checkpoint.\n",
            "\\input{dependency}\n",
            "\\IfFileExists{assets/payload.bin}{}{\\errmessage{Missing binary snapshot asset}}\n",
            "\\[\\frac{a}{}\\]\n",
            "\\end{document}\n"
        );
        let files = |dependency: &str| {
            let changed = dependency.contains("unsaved");
            let mut files = vec![
                NativeTexFile { path: "dependency.tex".into(), bytes: dependency.as_bytes().to_vec() },
                NativeTexFile { path: "localstyle.sty".into(), bytes: format!(
                    "\\ProvidesPackage{{localstyle}}\n\\directlua{{lineaenativevalue=require(\"cachevalue\")}}\n\\newcommand{{\\SnapshotWord}}{{{} \\directlua{{tex.sprint(lineaenativevalue)}}}}\n",
                    if changed { "Changed style" } else { "Original style" }
                ).into_bytes() },
                NativeTexFile { path: "cachevalue.lua".into(), bytes: if changed {
                    b"return 'Changed Lua module'".to_vec()
                } else { b"return 'Original Lua module'".to_vec() } },
                NativeTexFile { path: "assets/payload.bin".into(), bytes: vec![0, 255, 13, 10, 128, if changed { 2 } else { 1 }] },
            ];
            if !changed {
                files.push(NativeTexFile { path: "obsolete.tex".into(), bytes: b"removed by replacement snapshot".to_vec() });
            }
            files
        };
        let dependency = "\\SnapshotWord{} first.\n\\[\\frac{z}{}\\]\n";
        let session = Session::create_snapshot(Snapshot::new(source, "main.tex".into(), files(dependency)).unwrap()).unwrap();
        let manager = NativeTexSessions::default();
        lock(&manager.0).session = Some(session.clone());
        let info = session.start().expect("the pinned real native engine must start");
        assert_eq!(info.session_id, session.id);
        assert!(info.source_revision > 0, "use the engine's actual initial revision");
        let wait_layout = |session: &Arc<Session>, revision: u64| {
            let deadline = Instant::now() + Duration::from_secs(180);
            let mut messages = lock(&session.messages);
            loop {
                messages.check().expect("real engine failed while waiting for geometry");
                let mut pages = BTreeMap::new();
                for event in messages.events.iter().filter(|event| event["event"] == "LayoutUpdate"
                    && event["versions"]["source_revision"].as_u64() == Some(revision)) {
                    for page in event["pages_changed"].as_array().into_iter().flatten() {
                        if let Some(number) = page["page"].as_u64() { pages.insert(number, page.clone()); }
                    }
                    let total = event["pages_total"].as_u64().unwrap_or(0);
                    if total > 0 && pages.keys().filter(|&&page| page<=total).copied().eq(1..=total)
                        && event["compile"]["state"] == "Ok" && event["convergence"]["state"] == "Converged" {
                        let mut frame = event.clone();
                        frame["pages_changed"] = json!(pages.into_iter().filter_map(|(number,page)| (number<=total).then_some(page)).collect::<Vec<_>>());
                        return frame;
                    }
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                assert!(!remaining.is_zero(), "no successful converged layout for revision {revision}");
                messages = session.changed.wait_timeout(messages, remaining).unwrap().0;
            }
        };
        let initial = wait_layout(&session, info.source_revision);
        assert!(initial["pages_total"].as_i64().unwrap() > 0);
        if let Some(directory) = std::env::var_os("LINEAE_NATIVE_EVIDENCE_DIR") {
            let directory = PathBuf::from(directory);
            let repeated: Value = serde_json::from_slice(
                &std::fs::read(directory.join("repeated-input-probe.json")).unwrap(),
            ).unwrap();
            let snapshot = Snapshot::new(
                repeated["source"].as_str().unwrap(),
                "main.tex".into(),
                vec![NativeTexFile {
                    path: "chapters/one.tex".into(),
                    bytes: repeated["child"].as_str().unwrap().as_bytes().to_vec(),
                }],
            ).unwrap();
            let input = Session::create_snapshot(snapshot).unwrap();
            let opened = input.start().expect("repeated project input must start");
            let layout = wait_layout(&input, opened.source_revision);
            let files = serde_json::from_value(repeated["files"].clone()).unwrap();
            let observed = input.observe_formula(
                opened.source_revision, repeated["projection"].as_str().unwrap(), files,
            ).expect("repeated project source must preserve both geometry instances");
            for (list, tag) in [("glyphs", "glyph"), ("fields", "denominator")] {
                let owner = &repeated[tag];
                let mut boxes = observed.iter().flat_map(|page| {
                    let number = &page["page"];
                    page["dl"]["math_owners"][list].as_array().into_iter().flatten().filter_map(move |item| {
                        (&item["owner"] == owner && (list != "fields" ||
                            item["role"] == "den" && item["empty"] == true))
                            .then(|| (number.as_u64().unwrap(), item["bbox"].to_string()))
                    })
                }).collect::<Vec<_>>();
                boxes.sort_unstable();
                boxes.dedup();
                assert_eq!(boxes.len(), 2, "both expansions report the same source tag: {tag}, {boxes:?}");
                assert_ne!(boxes[0], boxes[1], "the two locations must be distinct: {tag}");
            }
            std::fs::write(directory.join("native-repeated-input-pages.json"), serde_json::to_vec(&json!({
                "raw":layout["pages_changed"],"observed":observed,"source":repeated["source"],
                "child":repeated["child"],"glyph":repeated["glyph"],"denominator":repeated["denominator"],
                "projection":repeated["projection"],"files":repeated["files"],
            })).unwrap()).unwrap();
            input.terminate();
            let raw_source = include_str!("../../../../tests/native-math/fixtures/degraded-page.tex");
            let projection = std::fs::read_to_string(directory.join("degraded-projection.tex")).unwrap();
            let degraded = Session::create(raw_source).unwrap();
            let opened = degraded.start().expect("TikZ and formula snapshot starts");
            let layout = wait_layout(&degraded, opened.source_revision);
            let version = integer(&layout["versions"], "layout_version").unwrap();
            let pdf = degraded.pdf(opened.source_revision, version)
                .expect("the converged TikZ layout has an authoritative registered PDF");
            let observed = degraded.observe_formula(opened.source_revision, &projection, Vec::new())
                .expect("the same TikZ page retains formula ownership");
            let target = observed.iter().filter_map(|page| page["dl"]["math_owners"]["fields"].as_array())
                .flatten().find(|field| field["role"] == "den" && field["empty"] == true)
                .expect("the real degraded page reports an empty denominator");
            let drawing: Value = serde_json::from_slice(&std::fs::read(directory.join("degraded-drawing-probe.json")).unwrap()).unwrap();
            let measured_projection = drawing["projection"].as_str().unwrap();
            let measured = degraded.observe_formula(opened.source_revision, measured_projection, Vec::new())
                .expect("observe the two exact corners of a floating TikZ drawing");
            for corner in ["top", "bottom"] {
                assert!(measured.iter().any(|page| page["dl"]["math_owners"]["fields"].as_array().into_iter().flatten()
                    .any(|field| field["owner"] == drawing["corners"][corner] && field["empty"] == true)),
                    "the measured drawing must expose its {corner} corner");
            }
            save_pdf_evidence("native-degraded.pdf", &pdf);
            std::fs::write(directory.join("native-degraded-pages.json"), serde_json::to_vec(&json!({
                "raw": layout["pages_changed"], "observed": observed, "projection": projection,
                "measuredObserved": measured, "measuredProjection": measured_projection, "drawingCorners": drawing["corners"],
                "source": raw_source, "targetOwner": target["owner"],
            })).unwrap()).unwrap();
            degraded.terminate();
        }
        let table_source = concat!(
            "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n",
            "\\begin{tabular}{lc}\n & \\textbf{Entry} $\\frac{a}{}$ \\\\\nRow & Value\n\\end{tabular}\n\n",
            "\\includegraphics[width=18pt]{figures/preview.png}\n\\end{document}\n"
        );
        let table = Session::create_snapshot(Snapshot::new(
            table_source, "main.tex".into(),
            vec![NativeTexFile {
                path: "figures/preview.png".into(),
                bytes: include_bytes!("../icons/32x32.png").to_vec(),
            }],
        ).unwrap()).unwrap();
        let table_info = table.start().unwrap();
        let raw_table = wait_layout(&table, table_info.source_revision);
        let projected_table = table_source.replace("\n & \\textbf{Entry} $\\frac{a}{}$",
            "\n \\begingroup\\mathsurround=0pt\\attribute65000=91 $ $\\endgroup& \
             \\textbf{\\begingroup\\attribute65000=92 Entry\\endgroup} \
             $\\begingroup\\attribute65000=93 \\frac{a}{}\\endgroup$");
        let observed_table = table.observe_formula(table_info.source_revision, &projected_table, Vec::new())
            .expect("the observer retains the staged raster asset");
        let raw_page = &raw_table["pages_changed"][0];
        let observed_page = &observed_table[0];
        assert_eq!(raw_page["exact"], true);
        assert_eq!(observed_page["exact"], true);
        assert!(observed_page["dl"]["math_owners"]["fields"].as_array().is_some_and(|fields|
            fields.iter().any(|field| field["owner"] == 91 && field["empty"] == true &&
                matches!(field["role"].as_str(), Some("math" | "cell")))), "missing empty-cell position");
        assert!(observed_page["dl"]["math_owners"]["glyphs"].as_array().is_some_and(|glyphs|
            glyphs.iter().any(|glyph| glyph["owner"] == 92)), "missing marked table prose");
        assert!(observed_page["dl"]["math_owners"]["fields"].as_array().is_some_and(|fields|
            fields.iter().any(|field| field["owner"] == 93 && field["role"] == "den" && field["empty"] == true)),
            "missing a formula field next to marked prose in the same cell");
        let image_entries = |page: &Value| page["dl"]["images_info"].as_object().unwrap().values()
            .map(|entry| entry["file"].as_str().unwrap().replace('\\', "/"))
            .collect::<Vec<_>>();
        for page in [raw_page, observed_page] {
            assert!(image_entries(page).iter().any(|file| file.ends_with("figures/preview.png")));
        }
        let drawing_without_markers = |page: &Value| {
            let dl = &page["dl"];
            let drawing_items = |items: &Value| items.as_array().unwrap().iter()
                .filter(|item| item[0] != "m").cloned().collect::<Vec<_>>();
            let lines = dl["lines"].as_array().unwrap().iter().map(|line|
                json!([line["x"], line["y"], line["w"], line["h"], line["d"], drawing_items(&line["items"])]))
                .collect::<Vec<_>>();
            json!([dl["page_width"], dl["page_height"], dl["fonts"], drawing_items(&dl["other"]), lines])
        };
        assert!(drawing_without_markers(raw_page) == drawing_without_markers(observed_page),
            "an empty-cell observation must preserve visible table and image geometry");
        table.terminate();
        if let Some(directory) = std::env::var_os("LINEAE_NATIVE_EVIDENCE_DIR") {
            let directory = PathBuf::from(directory);
            for environment in ["tabular", "tabularx", "tblr"] {
                let probe: Value = serde_json::from_slice(&std::fs::read(directory.join(format!("{environment}-rowspan-probe.json"))).unwrap()).unwrap();
                let rowspan = Session::create(probe["source"].as_str().unwrap()).unwrap();
                let info = rowspan.start().expect("the editor-generated row span compiles");
                let layout = wait_layout(&rowspan, info.source_revision);
                let observed = rowspan.observe_formula(info.source_revision, probe["projection"].as_str().unwrap(), Vec::new())
                    .expect("the merged cell and its neighbors remain observable");
                let raw_page = &layout["pages_changed"][0];
                let observed_page = &observed[0];
                assert!(observed_page["dl"]["math_owners"]["glyphs"].as_array().is_some_and(|glyphs|
                    glyphs.iter().any(|glyph| glyph["owner"] == probe["tag"] && glyph["char"] == u32::from('F'))),
                    "missing glyph owner inside the merged {environment} cell");
                assert!(drawing_without_markers(raw_page) == drawing_without_markers(observed_page),
                    "instrumentation must preserve visible row span geometry in {environment}");
                rowspan.terminate();
            }
            let raster_source = include_str!("../../../../tests/native-math/fixtures/raster-repeat.tex");
            let raster_probe: Value = serde_json::from_slice(&std::fs::read(directory.join("raster-repeat-probe.json")).unwrap()).unwrap();
            let raster = Session::create_snapshot(Snapshot::new(raster_source, "main.tex".into(), vec![NativeTexFile {
                path: "plot.png".into(), bytes: include_bytes!("../icons/32x32.png").to_vec(),
            }]).unwrap()).unwrap();
            let info = raster.start().unwrap();
            let layout = wait_layout(&raster, info.source_revision);
            let measured = raster.observe_formula(info.source_revision, raster_probe["projection"].as_str().unwrap(), Vec::new()).unwrap();
            assert!(drawing_without_markers(&layout["pages_changed"][0]) == drawing_without_markers(&measured[0]),
                "instrumentation must preserve both occurrences of the staged image");
            let display = &measured[0]["dl"];
            let images = display["other"].as_array().unwrap().iter().chain(display["lines"].as_array().unwrap().iter()
                .flat_map(|line| line["items"].as_array().unwrap())).filter(|item| item[0] == "i").collect::<Vec<_>>();
            assert_eq!(images.len(), 2);
            let fields = display["math_owners"]["fields"].as_array().unwrap();
            let tags = raster_probe["tags"].as_array().unwrap();
            assert_eq!(tags.len(), 4);
            std::fs::write(directory.join("native-raster-repeat-pages.json"), serde_json::to_vec(&json!({
                "raw": layout["pages_changed"], "observed": measured, "tags": tags,
            })).unwrap()).unwrap();
            for tag in tags {
                assert_eq!(fields.iter().filter(|entry| entry["owner"] == *tag && entry["empty"] == true).count(), 1,
                    "each repeated raster corner must have exactly one observed owner");
            }
            raster.terminate();
            let reference_source = include_str!("../../../../tests/native-math/fixtures/native-reference.tex");
            let reference_probe: Value = serde_json::from_slice(&std::fs::read(directory.join("native-reference-probe.json")).unwrap()).unwrap();
            let reference = Session::create(reference_source).unwrap();
            let info = reference.start().unwrap();
            let layout = wait_layout(&reference, info.source_revision);
            let measured = reference.observe_formula(info.source_revision, reference_probe["projection"].as_str().unwrap(), Vec::new()).unwrap();
            assert!(drawing_without_markers(&layout["pages_changed"][0]) == drawing_without_markers(&measured[0]),
                "observing a reference must preserve the original line and glyph geometry");
            assert!(measured[0]["dl"]["math_owners"]["glyphs"].as_array().is_some_and(|glyphs|
                glyphs.iter().any(|glyph| glyph["owner"] == reference_probe["tag"])),
                "the reference expansion must retain its exact source owner");
            std::fs::write(directory.join("native-reference-pages.json"), serde_json::to_vec(&json!({
                "raw": layout["pages_changed"], "observed": measured, "projection": reference_probe["projection"],
                "source": reference_source, "targetOwner": reference_probe["tag"],
            })).unwrap()).unwrap();
            reference.terminate();
            let source = include_str!("../../../../tests/native-math/fixtures/numbered-alignment.tex");
            let projection = std::fs::read_to_string(directory.join("alignment-projection.tex")).unwrap();
            let alignment = Session::create(source).unwrap();
            let info = alignment.start().expect("numbered and starred alignat compile");
            let raw = wait_layout(&alignment, info.source_revision);
            let observed = alignment.observe_formula(info.source_revision, &projection, Vec::new())
                .expect("production alignment projection renders alongside the unmarked original");
            let mut denominators = Vec::new();
            for page in &observed {
                let original = raw["pages_changed"].as_array().unwrap().iter()
                    .find(|original| original["page"] == page["page"]).unwrap();
                assert!(drawing_without_markers(original) == drawing_without_markers(page),
                    "alignat ownership must preserve the original page drawing");
                denominators.extend(page["dl"]["math_owners"]["fields"].as_array().into_iter().flatten()
                    .filter(|field| field["role"] == "den" && field["empty"] == true)
                    .filter_map(|field| field["owner"].as_u64()));
            }
            denominators.sort_unstable();
            denominators.dedup();
            assert_eq!(denominators.len(), 2, "both alignat variants keep an editable empty denominator");
            std::fs::write(directory.join("native-alignment-pages.json"), serde_json::to_vec(&json!({
                "raw": raw["pages_changed"], "observed": observed, "projection": projection,
                "source": source, "targetOwner": denominators[1], "labelOwner": denominators[0],
            })).unwrap()).unwrap();
            alignment.terminate();
            if let Some(path) = std::env::var_os("LINEAE_NATIVE_TYPE_ONE_PAGE") {
                let source = include_str!("../../../../tests/native-math/fixtures/classic-font.tex");
                let projection = std::fs::read_to_string(directory.join("classic-projection.tex")).unwrap();
                let classic = Session::create(source).unwrap();
                let info = classic.start().expect("classic Computer Modern compiles");
                let raw = wait_layout(&classic, info.source_revision);
                let names = lock(&classic.messages).type_one_fonts.clone();
                assert!(names.contains("cmmi10"), "classic math reports a captured TFM font");
                let fonts = names.into_iter().map(|name| {
                    let key = format!("tfm:{name}");
                    let resource = classic.type_one_font(key.clone()).expect("resolve the captured TFM mapping");
                    (key, resource)
                }).collect::<BTreeMap<_, _>>();
                assert!(classic.type_one_font("tfm:not-captured".into()).is_err());
                let observed = classic.observe_formula(info.source_revision, &projection, Vec::new()).unwrap();
                let target = observed.iter().filter_map(|page| page["dl"]["math_owners"]["fields"].as_array())
                    .flatten().find(|field| field["role"] == "den" && field["empty"] == true).unwrap();
                std::fs::write(path, serde_json::to_vec(&json!({"raw": raw["pages_changed"],
                    "observed": observed, "projection": projection, "source": source,
                    "targetOwner": target["owner"], "fonts": fonts})).unwrap()).unwrap();
                classic.terminate();
            }
        }
        let project_projection = source.replace("\\frac{a}{}", "\\begingroup\\attribute65000=11 \\frac{a}{}\\endgroup");
        let project_observed = session.observe_formula(info.source_revision, &project_projection, vec![
            NativeTexProjection {
                path: "dependency.tex".into(),
                source: dependency.replace("\\frac{z}{}", "\\begingroup\\attribute65000=12 \\frac{z}{}\\endgroup"),
            },
        ])
            .expect("owner observation retains the project style, Lua module and binary dependency");
        for owner in [11, 12] {
            assert!(project_observed.iter().any(|page| page["dl"]["math_owners"]["fields"]
                .as_array().is_some_and(|fields| fields.iter().any(|field| field["owner"] == owner && field["role"] == "den"))));
        }
        assert_eq!(std::fs::read_to_string(session.root.join("dependency.tex")).unwrap(), dependency);
        let observer_id = lock(&session.observer).as_ref().unwrap().id.clone();
        let child_draft = dependency.replace("first.", "first warm.");
        let child_update = update_snapshot(&manager.0, session.clone(), source.into(),
            Some(files(&child_draft)), None).expect("an included TeX edit must use the current native engine");
        assert!(child_update.session_id.is_none());
        assert!(child_update.source_revision > info.source_revision);
        wait_layout(&session, child_update.source_revision);
        assert_eq!(lock(&session.snapshot).files["dependency.tex"], child_draft.as_bytes());
        assert_eq!(std::fs::read_to_string(session.root.join("dependency.tex")).unwrap(), dependency);
        let observed_child = session.observe_formula(child_update.source_revision, &project_projection, vec![
            NativeTexProjection {
                path: "dependency.tex".into(),
                source: child_draft.replace("\\frac{z}{}", "\\begingroup\\attribute65000=12 \\frac{z}{}\\endgroup"),
            },
        ]).expect("changed child geometry must come from the existing observer");
        assert_eq!(lock(&session.observer).as_ref().unwrap().id, observer_id);
        assert!(observed_child.iter().any(|page| page["dl"]["math_owners"]["fields"]
            .as_array().is_some_and(|fields| fields.iter().any(|field| field["owner"] == 12))));
        let standalone = include_str!("../../../../tests/native-math/fixtures/empty-denominator.tex");
        let targeting = Session::create(standalone).unwrap();
        let target_info = targeting.start().unwrap();
        wait_layout(&targeting, target_info.source_revision);
        let evidence = std::env::var_os("LINEAE_NATIVE_EVIDENCE_DIR").map(PathBuf::from);
        let projected = if let Some(directory) = &evidence {
            std::fs::read_to_string(directory.join("production-projection.tex")).unwrap()
        } else {
            standalone.replace("\\frac{a}{}", "\\begingroup\\attribute65000=10 \\frac{a}{}\\endgroup")
        };
        let expected_owner = if evidence.is_some() {2} else {10};
        let observed = targeting.observe_formula(target_info.source_revision, &projected, Vec::new()).expect("isolated owner observation");
        assert!(observed.iter().any(|page| page["dl"]["math_owners"]["fields"].as_array().is_some_and(|fields| {
            fields.iter().any(|field| field["owner"] == expected_owner && field["role"] == "den" && field["empty"] == true)
        })));
        let drawing = |page: &Value| {
            let dl = &page["dl"];
            let lines = dl["lines"].as_array().unwrap().iter()
                .map(|line| json!([line["x"], line["y"], line["w"], line["h"], line["d"], line["items"]]))
                .collect::<Vec<_>>();
            json!([dl["page_width"], dl["page_height"], dl["fonts"], dl["other"], lines])
        };
        {
            let messages = lock(&targeting.messages);
            let mut originals = Vec::new();
            for page in &observed {
                let raw_page = messages.events.iter().rev()
                    .filter(|event| event["event"] == "LayoutUpdate")
                    .filter_map(|event| event["pages_changed"].as_array())
                    .flatten()
                    .find(|raw| raw["page"] == page["page"]).expect("original page drawing");
                assert_eq!(raw_page["exact"], true);
                assert_eq!(page["exact"], true);
                assert!(drawing(raw_page) == drawing(page), "ownership instrumentation changed page drawing");
                originals.push(raw_page);
            }
            if let Some(directory) = &evidence {
                std::fs::write(directory.join("native-formula-pages.json"), serde_json::to_vec(&json!({
                    "raw":originals,"observed":observed,"projection":projected,"targetOwner":expected_owner,
                })).unwrap()).unwrap();
            }
        }
        let observer = lock(&targeting.observer).as_ref().expect("warm observer").clone();
        let edit = targeting.update(standalone.replace("\\frac{a}{}", "\\frac{a}{b}")).unwrap();
        let filled = targeting.observe_formula(edit.source_revision, &projected.replacen("}{}", "}{b}", 1), Vec::new())
            .expect("a changed fraction reuses the instrumented process");
        assert!(filled.iter().any(|page| page["dl"]["math_owners"]["fields"].as_array().is_some_and(|fields| {
            fields.iter().any(|field| field["role"] == "den" && field["empty"] == false)
        })));
        assert!(Arc::ptr_eq(lock(&targeting.observer).as_ref().unwrap(), &observer));
        assert_eq!(std::fs::read_to_string(targeting.root.join("main.tex")).unwrap(), standalone);
        let integral = standalone.replace("\\frac{a}{}", "\\int{}");
        let integral_edit = targeting.update(integral.clone()).unwrap();
        wait_layout(&targeting, integral_edit.source_revision);
        let observed_integral = targeting.observe_formula(integral_edit.source_revision,
            &integral.replace("\\int{}", "\\begingroup\\attribute65000=413 \\int{}\\endgroup"), Vec::new())
            .expect("native integral ownership provides the operator insertion boundary");
        assert!(observed_integral.iter().any(|page| page["dl"]["math_owners"]["glyphs"].as_array()
            .is_some_and(|glyphs| glyphs.iter().any(|glyph| glyph["owner"] == 413))));
        targeting.terminate();
        assert!(!observer.root.exists());
        assert!(lock(&session.messages).events.iter().any(|event| {
            event["event"] == "LayoutUpdate"
                && event["versions"]["source_revision"].as_u64() == Some(info.source_revision)
                && event["pages_changed"].as_array().is_some_and(|pages| pages.iter().any(|page| {
                    page["dl"]["glyphs"].as_u64().unwrap_or(0) > 0
                }))
        }), "initial layout history must contain actual engine glyphs");
        assert_eq!(std::fs::read_to_string(session.root.join("main.tex")).unwrap(), source);
        assert!(manager.get("tex-ffffffff-ffffffffffffffffffffffffffffffff-ffffffffffffffff").is_err());
        assert_eq!(session.font("file:/not-a-captured-font.otf#1".into()).unwrap_err().code, "font_resource");
        let key = lock(&session.messages).fonts.keys().next().cloned()
            .expect("real OTF font descriptors must have been captured");
        let font = session.font(key).expect("the exact captured font must exist");
        assert!(font.starts_with(b"OTTO") || font.starts_with(&[0, 1, 0, 0]));

        let updated = source.replace("\\frac{a}{}", "\\frac{a}{b}");
        let edit = session.update(updated.clone()).expect("set_document must accept the raw edited document");
        assert!(edit.source_revision > info.source_revision);
        let layout = wait_layout(&session, edit.source_revision);
        assert_eq!(layout["versions"]["source_revision"].as_u64(), Some(edit.source_revision));
        // Engine buffer updates must not rewrite even the disposable input file.
        assert_eq!(std::fs::read_to_string(session.root.join("main.tex")).unwrap(), source);
        assert_eq!(session.render_pdf(info.source_revision).unwrap_err().code, "revision_mismatch");
        let preview_pdf = session.render_pdf(edit.source_revision).expect("read-only PDF snapshot must compile");
        assert!(preview_pdf.starts_with(b"%PDF-"));
        save_pdf_evidence("native-session.pdf", &preview_pdf);

        let saved = Session::create("separate export-test temporary directory").unwrap();
        assert!(manager.get(&saved.id).is_err());
        assert_eq!(saved.font("file:/not-a-captured-font.otf#1".into()).unwrap_err().code, "font_resource");
        let destination = saved.root.join("clean.pdf");
        std::fs::write(&destination, b"previous user PDF").unwrap();
        assert_eq!(session.export(info.source_revision, destination.clone()).unwrap_err().code, "revision_mismatch");
        assert_eq!(std::fs::read(&destination).unwrap(), b"previous user PDF");
        let exported = session.export(edit.source_revision, destination.clone())
            .expect("real clean export must finish successfully and converge");
        assert_eq!(exported.source_revision, edit.source_revision);
        assert!(exported.job_id > 0);
        assert!(std::fs::read(&destination).unwrap().starts_with(b"%PDF-"));
        assert!(lock(&session.messages).events.iter().any(|event| {
            event["event"] == "PdfExported" && event["job_id"].as_u64() == Some(exported.job_id)
        }), "export completion must remain visible to the frontend poller");
        let project = session.root.clone();
        let replaced = update_snapshot(&manager.0, session.clone(), updated.clone(),
            Some(files("\\SnapshotWord{} unsaved sibling change.\n")), None).expect("changed dependencies must replace the native engine");
        let replaced_id = replaced.session_id.as_ref().expect("dependency replacement must return its new session ID");
        assert_ne!(replaced_id, &session.id);
        assert!(manager.get(&session.id).is_err());
        assert!(session.closed.load(Ordering::Acquire));
        assert!(lock(&session.processes).is_empty());
        assert!(!project.exists());
        let active = manager.get(replaced_id).unwrap();
        wait_layout(&active, replaced.source_revision);
        assert_eq!(std::fs::read_to_string(active.root.join("main.tex")).unwrap(), updated,
            "dependency/style/Lua/binary updates must not need a main source change");
        assert_eq!(std::fs::read(active.root.join("assets/payload.bin")).unwrap(), vec![0, 255, 13, 10, 128, 2]);
        assert!(!active.root.join("obsolete.tex").exists(), "removed snapshot members must not survive");
        let updated_pdf = active.render_pdf(replaced.source_revision).expect("PDF must include updated siblings, Lua/style modules and binary assets");
        assert!(updated_pdf.starts_with(b"%PDF-"));
        save_pdf_evidence("native-session-updated-dependencies.pdf", &updated_pdf);
        // Classic Computer Modern is not browser-OTF geometry, but remains fully
        // renderable through the same native LuaLaTeX PDF snapshot endpoint.
        let type_one_source = updated.replace("\\usepackage{unicode-math}\n", "")
            .replace("\\setmathfont{Latin Modern Math}\n", "");
        let classic = active.update(type_one_source).unwrap();
        let type_one_pdf = active.render_pdf(classic.source_revision).expect("Type 1 PDF fallback must compile");
        assert!(type_one_pdf.starts_with(b"%PDF-"));
        save_pdf_evidence("native-type1.pdf", &type_one_pdf);
        assert_eq!(active.render_pdf(replaced.source_revision).unwrap_err().code, "revision_mismatch");
        let alternate = "\\documentclass{article}\n\\begin{document}\nAnother project document.\n\\end{document}\n".to_string();
        let alternate_path = "docs/standalone.tex".to_string();
        let missing_entry = update_snapshot(&manager.0, active.clone(), alternate.clone(), None,
            Some(alternate_path.clone())).err().expect("an unstaged entry must be rejected");
        assert_eq!(missing_entry.code, "project_main");
        let switched = update_snapshot(&manager.0, active.clone(), alternate.clone(), Some(vec![
            NativeTexFile { path: "main.tex".into(), bytes: updated.as_bytes().to_vec() },
            NativeTexFile { path: alternate_path.clone(), bytes: alternate.as_bytes().to_vec() },
        ]), Some(alternate_path.clone())).expect("a verified entry change must replace the session");
        let alternate_session = manager.get(switched.session_id.as_ref().unwrap()).unwrap();
        wait_layout(&alternate_session, switched.source_revision);
        assert_eq!(lock(&alternate_session.snapshot).main_file, alternate_path);
        assert_eq!(std::fs::read_to_string(alternate_session.root.join("main.tex")).unwrap(), updated);
        let active_root = active.root.clone();
        manager.close_all();
        assert!(active.closed.load(Ordering::Acquire));
        assert!(lock(&active.processes).is_empty());
        assert!(!active_root.exists(), "closing must remove the temporary project");
        assert!(manager.get(&active.id).is_err());
        assert!(!alternate_session.root.exists());
        assert!(std::fs::read(&destination).unwrap().starts_with(b"%PDF-"),
            "closing a session must not remove the independently saved PDF");
        let saved_root = saved.root.clone();
        saved.terminate();
        assert!(!saved_root.exists());
    }

    #[test]
    fn validates_source_ids_and_revisions() {
        assert!(validate_source("\\documentclass{article}\n空🙂").is_ok());
        assert!(validate_source("a\0b").is_err());
        assert!(validate_source(&"x".repeat(SOURCE_LIMIT + 1)).is_err());
        assert!(validate_id("../../main.tex").is_err());
        assert!(validate_id("tex-00000001-00000000000000000000000000000001-0000000000000001").is_ok());
        assert!(integer(&json!({"revision": -1}), "revision").is_err());
        assert!(integer(&json!({"revision": MAX_SAFE_INTEGER + 1}), "revision").is_err());
    }

    #[test]
    fn update_serializes_replacement_id_only_when_session_changes() {
        let mut update = NativeTexUpdate {
            session_id: None, edit_id: 4, source_revision: 2, routed: "background".into(),
        };
        let value = serde_json::to_value(&update).unwrap();
        assert!(value.get("sessionId").is_none());
        assert_eq!(value["sourceRevision"], 2);
        update.session_id = Some("replacement".into());
        assert_eq!(serde_json::to_value(update).unwrap()["sessionId"], "replacement");
    }

    #[test]
    fn snapshot_rejects_untrusted_paths_collisions_unknown_fields_and_limits() {
        for path in [
            "/absolute.tex", "../escape.tex", "dir/../escape.tex", "dir//file.tex",
            "C:/escape.tex", "dir\\file.tex", ".git/config", "dir/.hidden",
            "build/asset.pdf", "export.pdf", "lineae-private/file", "NUL.tex",
            "dir/aux.txt", "file.tex.", "file.tex ", "dir/COM1.log", "dir/a:b",
            "CONIN$", "dir/COM¹.txt", "dir/LPT².log", "con .tex",
        ] {
            assert!(validate_project_path(path).is_err(), "accepted {path}");
        }
        assert!(validate_project_path("chapters/空 白.tex").is_ok());
        assert!(serde_json::from_value::<NativeTexFile>(json!({
            "path": "okay.tex", "bytes": [], "symlink": "/secret"
        })).is_err());
        let make = |path: &str| NativeTexFile { path: path.into(), bytes: vec![] };
        assert!(Snapshot::new("", "main.tex".into(), vec![make("part.tex"), make("PART.tex")]).is_err());
        assert!(Snapshot::new("", "main.tex".into(), vec![make("dir"), make("dir/part.tex")]).is_err());
        assert!(Snapshot::new("", "main.tex".into(), vec![make("MAIN.tex")]).is_err());
        assert!(Snapshot::new("", "main.pdf".into(), vec![]).is_err());
        assert!(Snapshot::new("", "main.tex".into(), vec![NativeTexFile {
            path: "large.bin".into(), bytes: vec![0; FILE_LIMIT + 1]
        }]).is_err());
        assert!(Snapshot::new("", "main.tex".into(), (0..=FILE_COUNT_LIMIT)
            .map(|i| make(&format!("part{i}.tex"))).collect()).is_err());
    }

    #[test]
    fn snapshot_stages_binary_assets_and_authoritative_main_without_original_paths() {
        let snapshot = Snapshot::new("authoritative main", "chapters/document.tex".into(), vec![
            NativeTexFile { path: "chapters/document.tex".into(), bytes: vec![0, 255] },
            NativeTexFile { path: "assets/data.bin".into(), bytes: vec![0, 255, 128, 13, 10] },
            NativeTexFile { path: "local.sty".into(), bytes: b"raw unsaved style".to_vec() },
        ]).unwrap();
        let mut changed_main = snapshot.clone();
        changed_main.files.insert(snapshot.main_file.clone(), b"next main".to_vec());
        assert!(snapshot.dependencies_equal(&changed_main));
        changed_main.files.insert("assets/data.bin".into(), vec![1]);
        assert!(!snapshot.dependencies_equal(&changed_main));
        let session = Session::create_snapshot(snapshot).unwrap();
        assert_eq!(std::fs::read_to_string(session.root.join("chapters/document.tex")).unwrap(), "authoritative main");
        assert_eq!(std::fs::read(session.root.join("assets/data.bin")).unwrap(), vec![0, 255, 128, 13, 10]);
        assert!(!std::fs::symlink_metadata(session.root.join("assets/data.bin")).unwrap().file_type().is_symlink());
    }

    #[test]
    fn pdf_registry_requires_current_exact_provenance_and_build_containment() {
        let session = Session::create("raw").unwrap();
        let build = session.root.join("build");
        std::fs::create_dir(&build).unwrap();
        let pdf = build.join("layout-7.pdf");
        std::fs::write(&pdf, b"%PDF-unit-test-only").unwrap();
        {
            let mut messages = lock(&session.messages);
            messages.revision = Some(3);
            messages.receive(json!({"event": "LayoutUpdate",
                "versions": {"source_revision": 3, "layout_version": 7},
                "pdf_fallback": pdf}), 100).unwrap();
        }
        assert_eq!(session.pdf(3, 7).unwrap(), b"%PDF-unit-test-only");
        assert_eq!(session.pdf(2, 7).unwrap_err().code, "revision_mismatch");
        assert_eq!(session.pdf(3, 6).unwrap_err().code, "revision_mismatch");
        let outside = session.root.join("outside.pdf");
        std::fs::write(&outside, b"%PDF-unit-test-only").unwrap();
        lock(&session.messages).receive(json!({"event": "LayoutUpdate",
            "versions": {"source_revision": 3, "layout_version": 8},
            "pdf_fallback": outside}), 100).unwrap();
        assert_eq!(session.pdf(3, 8).unwrap_err().code, "pdf_resource");
        lock(&session.messages).receive(json!({"event": "LayoutUpdate",
            "versions": {"source_revision": 3, "layout_version": 9}}), 100).unwrap();
        assert_eq!(session.pdf(3, 7).unwrap_err().code, "revision_mismatch");
        assert_eq!(session.pdf(3, 9).unwrap_err().code, "pdf_unavailable");
        std::fs::write(&pdf, b"not a PDF").unwrap();
        assert_eq!(session.read_pdf(&pdf).unwrap_err().code, "pdf_format");
        let file = std::fs::OpenOptions::new().write(true).open(&pdf).unwrap();
        file.set_len(PDF_LIMIT + 1).unwrap();
        assert_eq!(session.read_pdf(&pdf).unwrap_err().code, "pdf_limit");
    }

    #[cfg(unix)]
    #[test]
    fn registered_pdf_symlink_cannot_escape_session_build() {
        let session = Session::create("raw").unwrap();
        let other = Session::create("another project").unwrap();
        let outside = other.root.join("outside.pdf");
        std::fs::write(&outside, b"%PDF-unit-test-only").unwrap();
        std::fs::create_dir(session.root.join("build")).unwrap();
        let link = session.root.join("build").join("link.pdf");
        std::os::unix::fs::symlink(outside, &link).unwrap();
        assert_eq!(session.read_pdf(&link).unwrap_err().code, "pdf_resource");
    }

    #[test]
    fn temporary_projects_preserve_raw_source_and_isolate_sessions() {
        let source = "\\documentclass{article}\r\n\\begin{document}$\\frac{a}{}$\\end{document}";
        let one = Session::create(source).unwrap();
        let two = Session::create("other").unwrap();
        assert_ne!(one.id, two.id);
        assert_ne!(one.root, two.root);
        assert_eq!(std::fs::read_to_string(one.root.join("main.tex")).unwrap(), source);
        let manager = NativeTexSessions::default();
        lock(&manager.0).session = Some(one.clone());
        assert!(manager.get(&two.id).is_err());
        let path = one.root.clone();
        manager.close_all();
        assert!(!path.exists());
        assert!(!two.closed.load(Ordering::Acquire));
        assert!(one.check().is_err());
    }

    #[test]
    fn registry_accepts_only_captured_otf_ttf_descriptors() {
        let mut messages = Messages::default();
        messages.receive(json!({"event": "Diagnostics", "filename": "/secret.otf"}), 10).unwrap();
        assert!(messages.fonts.is_empty());
        messages.receive(json!({"event": "LayoutUpdate", "versions": {"source_revision": 7},
            "pages_changed": [{"dl": {"fonts": {
                "1": {"filename": "/tex/lm-math.otf", "subfont": 0},
                "2": {"filename": "/tex/text.ttf", "subfont": 2},
                "3": {"filename": "/tex/classic.pfb", "subfont": 0}
            }}}]}), 100).unwrap();
        assert_eq!(messages.fonts.len(), 2);
        assert_eq!(messages.fonts["file:/tex/lm-math.otf#0"], "/tex/lm-math.otf");
        assert_eq!(messages.fonts["file:/tex/text.ttf#2"], "/tex/text.ttf");
        assert!(Messages::default().fonts.get("file:/tex/text.ttf#2").is_none());
    }

    #[test]
    fn events_survive_interleaved_replies_and_export_completion() {
        let mut messages = Messages { waiting: Some("export_pdf"), ..Default::default() };
        let exported = json!({"event": "PdfExported", "job_id": 19, "status": {"state": "Ok"}, "converged": true});
        messages.receive(exported.clone(), 50).unwrap();
        messages.receive(json!({"reply": "export_pdf", "job_id": 19}), 25).unwrap();
        assert_eq!(messages.exports.remove(&19), Some(exported.clone()));
        assert_eq!(messages.events.pop_front(), Some(exported));
        assert_eq!(messages.reply.unwrap()["job_id"], 19);
    }

    #[test]
    fn actual_one_based_subfonts_and_engine_revisions_are_not_rewritten() {
        let mut messages = Messages { waiting: Some("status"), ..Default::default() };
        messages.receive(json!({"event": "LayoutUpdate", "versions": {"source_revision": 1},
            "pages_changed": [{"dl": {"fonts": {
                "20": {"filename": "/tex/latinmodern-math.otf", "subfont": 1},
                "21": {"filename": "/tex/cjk.ttc", "subfont": 2}
            }}}]}), 100).unwrap();
        messages.receive(json!({"reply": "status", "versions": {"source_revision": 1}}), 40).unwrap();
        assert_eq!(messages.layout_revision, Some(1));
        assert_eq!(integer(&messages.reply.unwrap()["versions"], "source_revision").unwrap(), 1);
        assert!(messages.fonts.contains_key("file:/tex/latinmodern-math.otf#1"));
        assert!(!messages.fonts.contains_key("file:/tex/latinmodern-math.otf#0"));
        assert!(messages.fonts.contains_key("file:/tex/cjk.ttc#2"));
        assert!(!messages.fonts.contains_key("file:/tex/cjk.ttc#1"));
    }

    #[test]
    fn rejects_unknown_font_tokens_and_wrong_export_revision_without_tools() {
        let session = Session::create("raw").unwrap();
        lock(&session.messages).revision = Some(1);
        assert_eq!(session.font("file:/not-captured.otf#1".into()).unwrap_err().code, "font_resource");
        let destination = session.root.join("must-not-exist.pdf");
        assert_eq!(session.export(2, destination.clone()).unwrap_err().code, "revision_mismatch");
        assert!(!destination.exists());
        assert!(lock(&session.processes).is_empty());
    }

    #[test]
    fn malformed_protocol_and_closed_output_are_structured_failures() {
        let malformed = Session::create("").unwrap();
        Session::reader(&malformed, std::io::Cursor::new(b"not json\n".to_vec()), true)
            .unwrap().join().unwrap();
        assert_eq!(malformed.check().unwrap_err().code, "protocol");
        let closed = Session::create("").unwrap();
        Session::reader(&closed, std::io::Cursor::new(Vec::<u8>::new()), true)
            .unwrap().join().unwrap();
        assert_eq!(closed.check().unwrap_err().code, "engine_exit");
    }

    #[test]
    fn bounded_failures_never_silently_discard_layout_frames() {
        let mut messages = Messages::default();
        assert!(messages.receive(json!({"reply": "status"}), 10).is_err());
        assert!(messages.receive(json!({"unexpected": true}), 10).is_err());
        messages.event_bytes = QUEUE_LIMIT;
        assert!(messages.receive(json!({"event": "EngineState"}), 1).is_err());
        messages.append_tail(&vec![b'x'; TAIL_LIMIT * 3]);
        assert_eq!(messages.tail.len(), TAIL_LIMIT);
        messages.failure = Some(error("test_failure", "bounded diagnostic"));
        let failure = messages.check().unwrap_err();
        assert_eq!(failure.code, "test_failure");
        assert_eq!(failure.diagnostic_tail.len(), TAIL_LIMIT);
    }
}
