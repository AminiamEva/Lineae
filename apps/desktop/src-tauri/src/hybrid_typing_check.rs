use tauri::{Manager, WebviewWindow};
use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
use windows_core::HSTRING;

fn acknowledge(window: &WebviewWindow, id: u32, error: Option<String>) {
    let error = serde_json::to_string(&error).unwrap();
    let _ = window.eval(format!("window.lineaeTestInputComplete({id},{error})"));
}

// This fixture uses the WebView's own input methods. No listener, debugger
// port, registry policy, or special Windows account is needed on a hosted VM.
pub(super) fn on_title(window: WebviewWindow, title: String) {
    if let Some(result) = title.strip_prefix("Lineae hybrid passed ") {
        eprintln!("WebView displacement in CSS pixels {result}");
        window.app_handle().exit(0);
        return;
    }
    if let Some(message) = title.strip_prefix("Lineae hybrid failed ") {
        eprintln!("Hybrid input failed: {message}");
        window.app_handle().exit(1);
        return;
    }
    let Some(input) = title.strip_prefix("Lineae hybrid input ") else { return };
    let Ok((id, method, params)) = serde_json::from_str::<(u32, String, serde_json::Value)>(input) else { return };
    if !matches!(method.as_str(), "Input.dispatchKeyEvent" | "Input.imeSetComposition" | "Input.insertText") {
        acknowledge(&window, id, Some("Unsupported test input".into()));
        return;
    }
    let reply = window.clone();
    if let Err(error) = window.with_webview(move |view| {
        let completed = reply.clone();
        let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, _| {
            acknowledge(&completed, id, status.err().map(|e| e.to_string()));
            Ok(())
        }));
        // The controller and callback are used on the WebView's UI thread.
        let result = unsafe {
            view.controller().CoreWebView2().and_then(|core| core.CallDevToolsProtocolMethod(
                &HSTRING::from(method.as_str()), &HSTRING::from(params.to_string()), &callback))
        };
        if let Err(error) = result { acknowledge(&reply, id, Some(error.to_string())); }
    }) { acknowledge(&window, id, Some(error.to_string())); }
}
