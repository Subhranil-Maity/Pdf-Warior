pub mod errors;
pub mod pdf_ops;

use tauri_plugin_dialog::DialogExt;
use tauri::Emitter;
use std::thread;

#[tauri::command]
fn get_page_count(path: String) -> Result<u32, errors::AppError> {
    pdf_ops::page_count(&path)
}

#[tauri::command]
async fn render_page_thumbnail(path: String, page_index: u32, width_px: u32) -> Result<Vec<u8>, errors::AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        pdf_ops::render_page_to_png(&path, page_index, width_px)
    }).await.unwrap()
}

#[tauri::command]
async fn pick_save_path(app: tauri::AppHandle, default_name: String) -> Option<String> {
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF", &["pdf"])
        .blocking_save_file()
        .map(|p| p.to_string())
}

#[derive(serde::Serialize, Clone)]
struct ProgressPayload {
    done: usize,
    total: usize,
}

#[derive(serde::Serialize, Clone)]
struct CompletePayload {
    out_path: String,
}

#[derive(serde::Serialize, Clone)]
struct ErrorPayload {
    message: String,
}

#[tauri::command]
async fn merge_and_save(
    app: tauri::AppHandle,
    pages: Vec<pdf_ops::PageManifestEntry>,
    out_path: String,
) -> Result<(), ()> {
    let app_handle = app.clone();
    let out_path_clone = out_path.clone();
    
    thread::spawn(move || {
        let result = pdf_ops::merge_pages(&pages, &out_path_clone, |done, total| {
            let _ = app_handle.emit("merge_progress", ProgressPayload { done, total });
        });
        
        match result {
            Ok(_) => {
                let _ = app_handle.emit("merge_complete", CompletePayload { out_path: out_path_clone });
            }
            Err(e) => {
                let _ = app_handle.emit("merge_error", ErrorPayload { message: e.to_string() });
            }
        }
    });
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_page_count,
            render_page_thumbnail,
            pick_save_path,
            merge_and_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
