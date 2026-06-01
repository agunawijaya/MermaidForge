use std::sync::Mutex;
use tauri::menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_shell::ShellExt;

// Multi-window state: list of (label, title) for every currently-open
// window. Mutex-protected because Tauri menu events / window events
// fire from the main event loop while commands may run on async tasks.
struct WindowList(Mutex<Vec<(String, String)>>);

#[tauri::command]
async fn export_pptx(
    app: tauri::AppHandle,
    mermaid_source: String,
    output_path: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let input_path = temp_dir.join("mfspike_input.mmd");

    std::fs::write(&input_path, mermaid_source).map_err(|e| e.to_string())?;

    let sidecar = app
        .shell()
        .sidecar("mfengine")
        .map_err(|e| format!("sidecar lookup failed: {e}"))?
        .args([
            "--input",
            input_path.to_str().ok_or("input path not utf8")?,
            "--output",
            output_path.as_str(),
            "--format",
            "pptx",
        ]);

    let result = sidecar
        .output()
        .await
        .map_err(|e| format!("engine spawn failed: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        return Err(format!(
            "engine exited {}: stderr={} stdout={}",
            result.status.code().unwrap_or(-1),
            stderr,
            stdout
        ));
    }

    Ok(output_path)
}

#[tauri::command]
async fn export_vsdx(
    app: tauri::AppHandle,
    mermaid_source: String,
    output_path: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let input_path = temp_dir.join("mfspike_input.mmd");

    std::fs::write(&input_path, mermaid_source).map_err(|e| e.to_string())?;

    let sidecar = app
        .shell()
        .sidecar("mfengine")
        .map_err(|e| format!("sidecar lookup failed: {e}"))?
        .args([
            "--input",
            input_path.to_str().ok_or("input path not utf8")?,
            "--output",
            output_path.as_str(),
            "--format",
            "vsdx",
        ]);

    let result = sidecar
        .output()
        .await
        .map_err(|e| format!("engine spawn failed: {e}"))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        return Err(format!(
            "engine exited {}: stderr={} stdout={}",
            result.status.code().unwrap_or(-1),
            stderr,
            stdout
        ));
    }

    let stdout = String::from_utf8_lossy(&result.stdout).into_owned();
    Ok(stdout)
}

// Create a new webview window. Optional `initial_path` is passed via
// `?file=<encoded>` query param so the new window's JS can load it on
// boot.
#[tauri::command]
async fn open_new_window(
    app: tauri::AppHandle,
    initial_path: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let label = format!("w{}", &id.replace('-', "")[..10]);

    let url = match initial_path {
        Some(path) => format!("index.html?file={}", urlencoding::encode(&path)),
        None => "index.html".to_string(),
    };

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("Mermaid Forge")
        .inner_size(1280.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;

    register_window(&app, &label, "Untitled");
    attach_destroyed_listener(&app, &label);
    rebuild_all_menus(&app).map_err(|e| e.to_string())?;
    Ok(label)
}

// JS calls this whenever updateTitle() runs so the Window submenu
// can reflect the new label.
#[tauri::command]
fn notify_title_changed(
    app: tauri::AppHandle,
    window: WebviewWindow,
    title: String,
) -> Result<(), String> {
    let label = window.label().to_string();
    {
        let state = app.state::<WindowList>();
        let mut list = state.0.lock().unwrap();
        if let Some(entry) = list.iter_mut().find(|(l, _)| l == &label) {
            entry.1 = title;
        }
    }
    rebuild_all_menus(&app).map_err(|e| e.to_string())?;
    Ok(())
}

fn register_window<R: Runtime>(app: &AppHandle<R>, label: &str, title: &str) {
    let state = app.state::<WindowList>();
    let mut list = state.0.lock().unwrap();
    if !list.iter().any(|(l, _)| l == label) {
        list.push((label.to_string(), title.to_string()));
    }
}

// Listen for the window's actual destruction (not CloseRequested),
// so JS-side prevent-default-on-dirty still works as the gate.
// Once destroyed for real, remove from WindowList; if list is empty,
// exit the app (Q6).
fn attach_destroyed_listener<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let Some(win) = app.get_webview_window(label) else { return; };
    let app_handle = app.clone();
    let captured_label = label.to_string();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let now_empty = {
                let state = app_handle.state::<WindowList>();
                let mut list = state.0.lock().unwrap();
                list.retain(|(l, _)| l != &captured_label);
                list.is_empty()
            };
            if now_empty {
                app_handle.exit(0);
            } else {
                let _ = rebuild_all_menus(&app_handle);
            }
        }
    });
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    windows: &[(String, String)],
) -> tauri::Result<Menu<R>> {
    let file_new = MenuItem::with_id(app, "file_new", "&New", true, Some("Ctrl+N"))?;
    let file_open = MenuItem::with_id(app, "file_open", "&Open...", true, Some("Ctrl+O"))?;
    let file_save = MenuItem::with_id(app, "file_save", "&Save", true, Some("Ctrl+S"))?;
    let file_save_as = MenuItem::with_id(
        app,
        "file_save_as",
        "Save &As...",
        true,
        Some("Ctrl+Shift+S"),
    )?;
    let file_separator = PredefinedMenuItem::separator(app)?;
    let file_exit = MenuItem::with_id(app, "file_exit", "E&xit", true, None::<&str>)?;

    let file_menu = SubmenuBuilder::new(app, "&File")
        .item(&file_new)
        .item(&file_open)
        .item(&file_save)
        .item(&file_save_as)
        .item(&file_separator)
        .item(&file_exit)
        .build()?;

    // Build Window submenu with one item per open window. Activation
    // routes via "window_focus_<label>" id (handled in on_menu_event).
    let mut window_menu_builder = SubmenuBuilder::new(app, "&Window");
    for (label, title) in windows {
        let id = format!("window_focus_{}", label);
        let label_text = if title.is_empty() { "Untitled".to_string() } else { title.clone() };
        let item = MenuItem::with_id(app, &id, &label_text, true, None::<&str>)?;
        window_menu_builder = window_menu_builder.item(&item);
    }
    let window_menu = window_menu_builder.build()?;

    let help_about = MenuItem::with_id(
        app,
        "help_about",
        "&About Mermaid Forge",
        true,
        None::<&str>,
    )?;
    let help_menu = SubmenuBuilder::new(app, "&Help")
        .item(&help_about)
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

// Rebuild and apply the menu for every open window. Tauri 2.x doesn't
// expose dynamic menu-item mutation, so we replace the whole menu via
// window.set_menu() per window.
fn rebuild_all_menus<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let snapshot = {
        let state = app.state::<WindowList>();
        let list = state.0.lock().unwrap();
        list.clone()
    };
    for (label, _) in &snapshot {
        if let Some(win) = app.get_webview_window(label) {
            let menu = build_menu(app, &snapshot)?;
            win.set_menu(menu)?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowList(Mutex::new(Vec::new())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_handle = app.handle();
            // Register the first window (label "main" per tauri.conf.json).
            register_window(app_handle, "main", "Untitled");
            attach_destroyed_listener(app_handle, "main");

            // Initial menu (just the main window in the Window submenu).
            let snapshot = {
                let state = app.state::<WindowList>();
                let list = state.0.lock().unwrap();
                list.clone()
            };
            let menu = build_menu(app_handle, &snapshot)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str().to_string();
            // Route window-focus items directly; emit other menu events
            // to the JS side as before.
            if let Some(label) = id.strip_prefix("window_focus_") {
                if let Some(win) = app.get_webview_window(label) {
                    let _ = win.set_focus();
                }
            } else {
                let _ = app.emit("menu-event", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            export_pptx,
            export_vsdx,
            open_new_window,
            notify_title_changed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
