//! Experimental, trusted-document-only rtex 0.0.8 host.
//!
//! Source is never instrumented. Only a disposable main.tex is exposed to rtex;
//! project assets, PDF fallback rendering, Type 1 fonts and native editing are not
//! supported here. LuaLaTeX is NOT a sandbox, even with shell escape disabled.
//! Call close_all on window/app teardown in addition to the explicit close IPC.

use command_group::{CommandGroup, GroupChild};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

const SOURCE_LIMIT: usize = 2 * 1024 * 1024;
const LINE_LIMIT: usize = 16 * 1024 * 1024;
const QUEUE_LIMIT: usize = 32 * 1024 * 1024;
const EVENT_LIMIT: usize = 256;
const TAIL_LIMIT: usize = 4096;
const FONT_LIMIT: u64 = 32 * 1024 * 1024;
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

#[derive(Default)]
struct Manager {
    generation: u64,
    stopped: bool,
    session: Option<Arc<Session>>,
}

#[derive(Default)]
pub struct NativeTexSessions(Mutex<Manager>);

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

#[derive(Default)]
struct Messages {
    events: VecDeque<Value>,
    event_bytes: usize,
    waiting: Option<&'static str>,
    reply: Option<Value>,
    exports: HashMap<u64, Value>,
    fonts: HashMap<String, String>,
    failure: Option<NativeTexError>,
    tail: VecDeque<u8>,
    command_deadline: Option<Instant>,
    layout_deadline: Option<Instant>,
    revision: Option<u64>,
    layout_revision: Option<u64>,
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
                let Some(filename) = font.get("filename").and_then(Value::as_str) else { continue };
                let extension = Path::new(filename).extension().and_then(|s| s.to_str()).unwrap_or("");
                if !extension.eq_ignore_ascii_case("otf") && !extension.eq_ignore_ascii_case("ttf") {
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
    closed: AtomicBool,
    processes: Mutex<Vec<Process>>,
    stdin: Mutex<Option<ChildStdin>>,
    commands: Mutex<()>,
    messages: Mutex<Messages>,
    changed: Condvar,
}

impl Session {
    fn create(source: &str) -> Result<Arc<Self>, NativeTexError> {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        let id = format!("tex-{:08x}-{stamp:032x}-{:016x}", std::process::id(), NEXT_ID.fetch_add(1, Ordering::Relaxed));
        let root = std::env::temp_dir().join(format!("lineae-native-{id}"));
        std::fs::create_dir(&root).map_err(|e| error("temporary_project", format!("Cannot create temporary TeX project: {e}")))?;
        let session = Arc::new(Self {
            id, root, closed: AtomicBool::new(false), processes: Mutex::new(Vec::new()),
            stdin: Mutex::new(None), commands: Mutex::new(()),
            messages: Mutex::new(Messages::default()), changed: Condvar::new(),
        });
        std::fs::write(session.root.join("main.tex"), source)
            .map_err(|e| error("temporary_project", format!("Cannot write temporary main.tex: {e}")))?;
        Ok(session)
    }

    fn check(&self) -> Result<(), NativeTexError> {
        lock(&self.messages).check()?;
        if self.closed.load(Ordering::Acquire) {
            return Err(error("session_closed", "The native TeX session was closed."));
        }
        Ok(())
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
        Self::watchdog(self)?;
        let executable = std::env::var_os("LINEAE_RTEX_PATH").unwrap_or_else(|| "rtex".into());
        let version = self.tool(Command::new(&executable).arg("--version"))?;
        if version.trim() != "rtex 0.0.8" {
            return Err(error("engine_version", format!("rtex 0.0.8 is required; found {}.", version.chars().take(120).collect::<String>())));
        }
        // Uses rtex's own support-file and TeX Live discovery, not a guessed layout.
        self.tool(Command::new(&executable).arg("doctor"))?;
        let mut command = Command::new(&executable);
        command.args(["serve", "--project"]).arg(&self.root)
            .args(["--main", "main.tex", "--build"]).arg(self.root.join("build"))
            .args(["--eligibility", "allowlist", "--compile-timeout-ms", "30000", "--pass-timeout-ms", "60000"])
            .stdin(Stdio::piped());
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
        let reply = self.request(json!({"cmd": "set_document", "path": "main.tex", "text": source}), "set_document")?;
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
        // Always obtain a whole-page result: the checkpoint does not paint fast
        // paragraph overlays. The event queue still contains all original frames.
        self.request(json!({"cmd": "request_layout"}), "request_layout")?;
        Ok(NativeTexUpdate { edit_id, source_revision: revision, routed })
    }

    fn font(self: &Arc<Self>, key: String) -> Result<Vec<u8>, NativeTexError> {
        if key.len() > 4200 || !key.starts_with("file:") {
            return Err(error("font_resource", "Invalid native font resource token."));
        }
        self.check()?;
        let filename = lock(&self.messages).fonts.get(&key).cloned()
            .ok_or_else(|| error("font_resource", "Font token was not referenced by this session's captured display lists (only OTF/TTF are supported)."))?;
        let _serial = lock(&self.commands);
        self.check()?;
        let path = PathBuf::from(&filename);
        let path = if path.is_absolute() {
            path
        } else if self.root.join(&path).is_file() {
            self.root.join(path)
        } else {
            let kpsewhich = std::env::var_os("RTEX_TEXLIVE_BIN")
                .map(|bin| PathBuf::from(bin).join(if cfg!(windows) { "kpsewhich.exe" } else { "kpsewhich" }))
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
        if bytes.len() as u64 > FONT_LIMIT || !(bytes.starts_with(b"OTTO") || bytes.starts_with(&[0, 1, 0, 0]) || bytes.starts_with(b"true")) {
            return Err(error("font_format", format!("Captured font '{filename}' is not a supported OTF/TTF file.")));
        }
        self.check()?;
        Ok(bytes)
    }

    fn export(&self, revision: u64, destination: PathBuf) -> Result<NativeTexExport, NativeTexError> {
        // Freeze session mutations through the clean build and approved copy.
        // UI edits can continue in the authoritative editor and queue an update.
        let _serial = lock(&self.commands);
        self.check()?;
        if lock(&self.messages).revision != Some(revision) {
            return Err(error("revision_mismatch", "The source changed while choosing an export destination. Export again."));
        }
        let output = self.root.join("export.pdf");
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
        // A completed file is copied only after successful engine confirmation.
        // No caller-provided filesystem path enters this command.
        let mut file = std::fs::File::open(&output).map_err(|e| error("export_failed", format!("Clean PDF is missing: {e}")))?;
        let mut header = [0; 5];
        file.read_exact(&mut header).map_err(|e| error("export_failed", e.to_string()))?;
        if &header != b"%PDF-" {
            return Err(error("export_failed", "Clean export was not a PDF. The destination was not changed."));
        }
        // Stage beside the approved destination, then atomically replace it.
        // Compilation/copy failures never truncate an existing user PDF.
        let parent = destination.parent().ok_or_else(|| error("export_path", "The selected PDF has no parent directory."))?;
        let staging_path = parent.join(format!(".lineae-export-{}-{job}.tmp", self.id));
        let mut staging = std::fs::OpenOptions::new().write(true).create_new(true).open(&staging_path)
            .map_err(|e| error("export_copy", format!("Cannot stage the completed PDF: {e}")))?;
        let published = (|| {
            staging.write_all(&header).map_err(|e| error("export_copy", e.to_string()))?;
            std::io::copy(&mut file, &mut staging).map_err(|e| error("export_copy", e.to_string()))?;
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

#[tauri::command]
pub async fn native_tex_open(app: AppHandle, state: State<'_, NativeTexSessions>, source: String) -> Result<Option<NativeTexInfo>, NativeTexError> {
    validate_source(&source)?;
    let (generation, old) = {
        let mut manager = lock(&state.0);
        if manager.stopped { return Err(error("session_closed", "The native TeX host is shutting down.")); }
        manager.generation = manager.generation.wrapping_add(1);
        (manager.generation, manager.session.take())
    };
    if let Some(old) = old { blocking(move || { old.terminate(); Ok(()) }).await?; }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let dialog_app = app.clone();
    app.run_on_main_thread(move || dialog_app.dialog().message("Compile this document with native LuaLaTeX?\n\nOnly continue if you trust its source. LuaLaTeX can execute Lua and access or change files with your account's permissions, even without shell escape. The temporary project is not a security sandbox.")
        .title("Trust native TeX source")
        .buttons(MessageDialogButtons::OkCancelCustom("Trust and compile".into(), "Cancel".into()))
        .show(move |approved| { let _ = sender.send(approved); }))
        .map_err(|e| error("trust_dialog", format!("Cannot show native TeX trust dialog: {e}")))?;
    if !receiver.await.map_err(|_| error("trust_canceled", "Native TeX trust dialog was closed."))? {
        return Ok(None);
    }
    let session = Session::create(&source)?;
    {
        let mut manager = lock(&state.0);
        if manager.stopped || manager.generation != generation {
            return Err(error("stale_session", "A newer native TeX session replaced this request."));
        }
        manager.session = Some(session.clone());
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
pub async fn native_tex_update(state: State<'_, NativeTexSessions>, session_id: String, source: String) -> Result<NativeTexUpdate, NativeTexError> {
    validate_source(&source)?;
    let session = state.get(&session_id)?;
    blocking(move || {
        let result = session.update(source);
        if let Err(problem) = &result {
            session.fail(problem.clone());
            session.terminate();
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
    Ok(messages.events.drain(..).collect())
}

#[tauri::command]
pub async fn native_tex_font(state: State<'_, NativeTexSessions>, session_id: String, key: String) -> Result<Vec<u8>, NativeTexError> {
    let session = state.get(&session_id)?;
    blocking(move || session.font(key)).await
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
            "\\setmathfont{Latin Modern Math}\n",
            "\\begin{document}\n",
            "Native LuaLaTeX checkpoint.\n",
            "\\[\\frac{a}{}\\]\n",
            "\\end{document}\n"
        );
        let session = Session::create(source).unwrap();
        let manager = NativeTexSessions::default();
        lock(&manager.0).session = Some(session.clone());
        let info = session.start().expect("the pinned real native engine must start");
        assert_eq!(info.session_id, session.id);
        assert!(info.source_revision > 0, "use the engine's actual initial revision");
        let wait_layout = |revision: u64| {
            let deadline = Instant::now() + Duration::from_secs(180);
            let mut messages = lock(&session.messages);
            loop {
                messages.check().expect("real engine failed while waiting for geometry");
                if let Some(event) = messages.events.iter().find(|event| {
                    event["event"] == "LayoutUpdate"
                        && event["versions"]["source_revision"].as_u64() == Some(revision)
                        && event["compile"]["state"] == "Ok"
                        && event["convergence"]["state"] == "Converged"
                }) {
                    return event.clone();
                }
                let remaining = deadline.saturating_duration_since(Instant::now());
                assert!(!remaining.is_zero(), "no successful converged layout for revision {revision}");
                messages = session.changed.wait_timeout(messages, remaining).unwrap().0;
            }
        };
        let initial = wait_layout(info.source_revision);
        assert!(initial["pages_total"].as_i64().unwrap() > 0);
        assert!(initial["pages_changed"].as_array().unwrap().iter().any(|page| {
            page["dl"]["glyphs"].as_u64().unwrap_or(0) > 0
        }), "initial geometry must contain actual engine glyphs");
        assert_eq!(std::fs::read_to_string(session.root.join("main.tex")).unwrap(), source);
        assert!(manager.get("tex-ffffffff-ffffffffffffffffffffffffffffffff-ffffffffffffffff").is_err());
        assert_eq!(session.font("file:/not-a-captured-font.otf#1".into()).unwrap_err().code, "font_resource");
        let key = lock(&session.messages).fonts.keys().next().cloned()
            .expect("real OTF font descriptors must have been captured");
        let font = session.font(key).expect("the exact captured font must exist");
        assert!(font.starts_with(b"OTTO") || font.starts_with(&[0, 1, 0, 0]));

        let updated = source.replace("\\frac{a}{}", "\\frac{a}{b}");
        let edit = session.update(updated).expect("set_document must accept the raw edited document");
        assert!(edit.source_revision > info.source_revision);
        let layout = wait_layout(edit.source_revision);
        assert_eq!(layout["versions"]["source_revision"].as_u64(), Some(edit.source_revision));
        // Engine buffer updates must not rewrite even the disposable input file.
        assert_eq!(std::fs::read_to_string(session.root.join("main.tex")).unwrap(), source);

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
        manager.close_all();
        assert!(session.closed.load(Ordering::Acquire));
        assert!(lock(&session.processes).is_empty());
        assert!(!project.exists(), "closing must remove the temporary project");
        assert!(manager.get(&session.id).is_err());
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
                "20": {"filename": "/tex/latinmodern-math.otf", "subfont": 1}
            }}}]}), 100).unwrap();
        messages.receive(json!({"reply": "status", "versions": {"source_revision": 1}}), 40).unwrap();
        assert_eq!(messages.layout_revision, Some(1));
        assert_eq!(integer(&messages.reply.unwrap()["versions"], "source_revision").unwrap(), 1);
        assert!(messages.fonts.contains_key("file:/tex/latinmodern-math.otf#1"));
        assert!(!messages.fonts.contains_key("file:/tex/latinmodern-math.otf#0"));
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
