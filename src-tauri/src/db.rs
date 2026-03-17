use rusqlite::{params, Connection, Result};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Clone)]
pub struct DailySummary {
    pub date: String,
    pub avg_cpu: f32,
    pub peak_cpu: f32,
    pub avg_ram: f32,
    pub peak_ram: f32,
    pub avg_score: f32,
    pub active_minutes: u32,
}

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS snapshots (
             timestamp INTEGER PRIMARY KEY,
             avg_cpu REAL NOT NULL,
             peak_cpu REAL NOT NULL,
             avg_ram REAL NOT NULL,
             peak_ram REAL NOT NULL,
             avg_score REAL NOT NULL
         );",
    )?;
    Ok(conn)
}

pub fn insert_snapshot(
    conn: &Connection,
    ts: i64,
    avg_cpu: f32,
    peak_cpu: f32,
    avg_ram: f32,
    peak_ram: f32,
    avg_score: f32,
) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO snapshots (timestamp, avg_cpu, peak_cpu, avg_ram, peak_ram, avg_score)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![ts, avg_cpu, peak_cpu, avg_ram, peak_ram, avg_score],
    )?;
    Ok(())
}

pub fn get_daily_summaries(conn: &Connection, days: u32) -> Result<Vec<DailySummary>> {
    let cutoff = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        - (days as i64 * 86400);

    let mut stmt = conn.prepare(
        "SELECT
             date(timestamp, 'unixepoch', 'localtime') AS day,
             ROUND(AVG(avg_cpu), 1),
             ROUND(MAX(peak_cpu), 1),
             ROUND(AVG(avg_ram), 1),
             ROUND(MAX(peak_ram), 1),
             ROUND(AVG(avg_score), 1),
             COUNT(*) * 5
         FROM snapshots
         WHERE timestamp >= ?1
         GROUP BY day
         ORDER BY day DESC",
    )?;

    let rows = stmt.query_map(params![cutoff], |row| {
        Ok(DailySummary {
            date: row.get(0)?,
            avg_cpu: row.get(1)?,
            peak_cpu: row.get(2)?,
            avg_ram: row.get(3)?,
            peak_ram: row.get(4)?,
            avg_score: row.get(5)?,
            active_minutes: row.get(6)?,
        })
    })?;

    rows.collect()
}

pub fn prune_old(conn: &Connection, before_ts: i64) -> Result<usize> {
    conn.execute(
        "DELETE FROM snapshots WHERE timestamp < ?1",
        params![before_ts],
    )
}
