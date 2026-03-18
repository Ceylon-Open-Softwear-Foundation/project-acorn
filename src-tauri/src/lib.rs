use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::Manager;

mod db;

const FLUSH_INTERVAL: Duration = Duration::from_secs(300); // 5 minutes
const PRUNE_AGE_SECS: i64 = 90 * 86400; // 90 days

// --- State ---

struct Sample {
    cpu: f32,
    ram: f32,
    score: f32,
}

pub struct AppState {
    system: System,
    cpu_peak: f32,
    ram_peak: f32,
    // Long-term tracking
    buffer: Vec<Sample>,
    last_flush: Instant,
    db: rusqlite::Connection,
}

// --- Response types ---

#[derive(Serialize, Clone)]
pub struct GpuStats {
    name: String,
    usage_percent: Option<f32>,
    vram_used_mb: Option<u32>,
    vram_total_mb: Option<u32>,
}

#[derive(Serialize)]
pub struct HardwareStats {
    cpu_current: f32,
    cpu_peak: f32,
    ram_current: f32,
    ram_peak: f32,
    score: f32,
    gpu: Option<GpuStats>,
}

// --- GPU monitoring ---

struct GpuInitInfo {
    name: String,
    vram_total_mb: Option<u32>,
}

static GPU_INIT: OnceLock<GpuInitInfo> = OnceLock::new();

#[cfg(target_os = "macos")]
fn gpu_init_info() -> &'static GpuInitInfo {
    GPU_INIT.get_or_init(|| {
        let (name, vram_total_mb) = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType", "-json"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|json| {
                let first = json["SPDisplaysDataType"].as_array()?.first()?.clone();
                let name = first["_name"]
                    .as_str()
                    .or_else(|| first["sppci_model"].as_str())
                    .unwrap_or("Unknown GPU")
                    .to_string();
                let vram = first["_spdisplays_vram"].as_str().and_then(parse_vram_str);
                Some((name, vram))
            })
            .unwrap_or_else(|| ("Unknown GPU".to_string(), None));
        GpuInitInfo { name, vram_total_mb }
    })
}

#[cfg(target_os = "macos")]
fn parse_vram_str(s: &str) -> Option<u32> {
    let s = s.trim();
    if let Some(mb) = s.strip_suffix(" MB") {
        return mb.trim().parse().ok();
    }
    if let Some(gb) = s.strip_suffix(" GB") {
        let g: f32 = gb.trim().parse().ok()?;
        return Some((g * 1024.0) as u32);
    }
    None
}

fn find_u64_after(text: &str, marker: &str) -> Option<u64> {
    let pos = text.find(marker)?;
    let rest = &text[pos + marker.len()..];
    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    if end == 0 { return None; }
    rest[..end].parse().ok()
}

#[cfg(target_os = "macos")]
fn get_gpu_stats() -> Option<GpuStats> {
    let init = gpu_init_info();
    let text = std::process::Command::new("ioreg")
        .args(["-rc", "IOAccelerator"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())?;

    // Apple Silicon uses "Device Utilization %" in ioreg PerformanceStatistics
    let usage_percent = find_u64_after(&text, "\"Device Utilization %\"=")
        .or_else(|| find_u64_after(&text, "\"Device Utilization %\" = "))
        .or_else(|| find_u64_after(&text, "\"GPU Activity(%)\"="))
        .or_else(|| find_u64_after(&text, "\"GPU Activity(%)\":"))
        .map(|v| v as f32);
    // "In use system memory" is in bytes (unified / VRAM in use)
    let vram_used_mb = find_u64_after(&text, "\"In use system memory\"=")
        .or_else(|| find_u64_after(&text, "\"In use system memory\":"))
        .map(|b| (b / 1_048_576) as u32);

    Some(GpuStats {
        name: init.name.clone(),
        usage_percent,
        vram_used_mb,
        vram_total_mb: init.vram_total_mb,
    })
}

#[cfg(not(target_os = "macos"))]
fn get_gpu_stats() -> Option<GpuStats> {
    None
}

// --- Commands ---

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

    // Weighted suitability score (FR-5)
    let score = (cpu_peak * 0.7 + ram_current * 0.3).round();

    // Accumulate sample for long-term tracking
    s.buffer.push(Sample {
        cpu: cpu_current,
        ram: ram_current,
        score,
    });

    // Flush to DB every FLUSH_INTERVAL
    if s.last_flush.elapsed() >= FLUSH_INTERVAL && !s.buffer.is_empty() {
        flush_buffer(&mut s);
    }

    HardwareStats {
        cpu_current: round1(cpu_current),
        cpu_peak: round1(cpu_peak),
        ram_current: round1(ram_current),
        ram_peak: round1(ram_peak),
        score,
        gpu: get_gpu_stats(),
    }
}

#[tauri::command]
fn get_usage_history(
    state: tauri::State<Mutex<AppState>>,
    days: Option<u32>,
) -> Vec<db::DailySummary> {
    let mut s = state.lock().unwrap();
    // Flush pending samples so history is up-to-date
    flush_buffer(&mut s);
    db::get_daily_summaries(&s.db, days.unwrap_or(30)).unwrap_or_default()
}

// --- Helpers ---

fn flush_buffer(s: &mut AppState) {
    if s.buffer.is_empty() {
        return;
    }

    let len = s.buffer.len() as f32;
    let avg_cpu = s.buffer.iter().map(|sm| sm.cpu).sum::<f32>() / len;
    let peak_cpu = s.buffer.iter().map(|sm| sm.cpu).fold(0.0_f32, f32::max);
    let avg_ram = s.buffer.iter().map(|sm| sm.ram).sum::<f32>() / len;
    let peak_ram = s.buffer.iter().map(|sm| sm.ram).fold(0.0_f32, f32::max);
    let avg_score = s.buffer.iter().map(|sm| sm.score).sum::<f32>() / len;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if let Err(e) = db::insert_snapshot(&s.db, ts, avg_cpu, peak_cpu, avg_ram, peak_ram, avg_score)
    {
        eprintln!("Failed to write snapshot: {e}");
    }

    // Prune data older than 90 days
    let _ = db::prune_old(&s.db, ts - PRUNE_AGE_SECS);

    s.buffer.clear();
    s.last_flush = Instant::now();
}

fn round1(v: f32) -> f32 {
    (v * 10.0).round() / 10.0
}

// --- App entry point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let db_conn =
                db::open(&data_dir.join("usage.db")).expect("Failed to open usage database");

            let mut system = System::new_all();
            system.refresh_all();

            app.manage(Mutex::new(AppState {
                system,
                cpu_peak: 0.0,
                ram_peak: 0.0,
                buffer: Vec::with_capacity(128),
                last_flush: Instant::now(),
                db: db_conn,
            }));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_hardware_stats, get_usage_history])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
