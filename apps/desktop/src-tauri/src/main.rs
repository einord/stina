#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[tauri::command]
async fn proassist_tool(app: AppHandle, tool: String, payload: Value) -> Result<Value, String> {
  let script_path = resolve_tool_runner(&app).map_err(|err| err.to_string())?;
  let payload_json = serde_json::to_string(&payload).map_err(|err| err.to_string())?;

  let output = Command::new(node_binary())
    .arg(script_path)
    .arg(&tool)
    .arg(&payload_json)
    .output()
    .map_err(|err| format!("Failed to invoke tool runner: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(format!("Tool runner error: {stderr}"));
  }

  let stdout = String::from_utf8_lossy(&output.stdout);
  serde_json::from_str::<Value>(&stdout).map_err(|err| err.to_string())
}

fn resolve_tool_runner(app: &AppHandle) -> anyhow::Result<PathBuf> {
  let mut relative = PathBuf::from("../packages/tool-runner/dist/cli.cjs");
  if !relative.exists() {
    if let Some(resource) = app.path_resolver().resolve_resource("packages/tool-runner/dist/cli.cjs") {
      relative = resource;
    }
  }
  if !relative.exists() {
    return Err(anyhow::anyhow!(
      "Tool runner binary missing. Build @pro-assist/tool-runner before starting the app."
    ));
  }
  Ok(relative)
}

fn node_binary() -> String {
  std::env::var("PRO_ASSIST_NODE").unwrap_or_else(|_| "node".into())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![proassist_tool])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
