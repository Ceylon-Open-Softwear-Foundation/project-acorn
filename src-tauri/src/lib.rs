use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;

// --- State ---

pub struct AppState {
    system: System,
    cpu_peak: f32,
    ram_peak: f32,
}

impl AppState {
    fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        Self {
            system,
            cpu_peak: 0.0,
            ram_peak: 0.0,
        }
    }
}

// --- Response type ---

#[derive(Serialize)]
pub struct HardwareStats {
    cpu_current: f32,
    cpu_peak: f32,
    ram_current: f32,
    ram_peak: f32,
    /// Suitability Score (0–100): cpu_peak * 0.7 + ram_current * 0.3
    score: f32,
}

// --- Tauri command ---

#[tauri::command]
fn get_hardware_stats(state: tauri::State<Mutex<AppState>>) -> HardwareStats {
    let mut s = state.lock().unwrap();

    s.system.refresh_cpu_usage();
    s.system.refresh_memory();

    let cpu_current = s.system.global_cpu_usage();

    let total_ram = s.system.total_memory() as f32;
    let used_ram = s.system.used_memory() as f32;
    let ram_current = if total_ram > 0.0 {
        (used_ram / total_ram) * 100.0
    } else {
        0.0
    };

    // Track session peaks (FR-2)
    if cpu_current > s.cpu_peak {
        s.cpu_peak = cpu_current;
    }
    if ram_current > s.ram_peak {
        s.ram_peak = ram_current;
    }

    let cpu_peak = s.cpu_peak;
    let ram_peak = s.ram_peak;

    // Weighted suitability score (FR-5): higher utilisation = better match
    let score = (cpu_peak * 0.7 + ram_current * 0.3).round();

    HardwareStats {
        cpu_current: round1(cpu_current),
        cpu_peak: round1(cpu_peak),
        ram_current: round1(ram_current),
        ram_peak: round1(ram_peak),
        score,
    }
}

fn round1(v: f32) -> f32 {
    (v * 10.0).round() / 10.0
}

// --- App entry point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(AppState::new()))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_hardware_stats])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
