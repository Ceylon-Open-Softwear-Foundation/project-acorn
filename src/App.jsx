import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const DEFAULT_STATS = {
  cpu_current: 0,
  cpu_peak: 0,
  ram_current: 0,
  ram_peak: 0,
  score: 0,
};

function getScoreState(score) {
  if (score >= 80) {
    return {
      label: "Optimal",
      textColor: "text-emerald-400",
      strokeColor: "#34d399",
      glowColor: "rgba(52, 211, 153, 0.2)",
    };
  }
  if (score >= 40) {
    return {
      label: "Under-utilized",
      textColor: "text-amber-400",
      strokeColor: "#fbbf24",
      glowColor: "rgba(251, 191, 36, 0.2)",
    };
  }
  return {
    label: "Overkill",
    textColor: "text-rose-400",
    strokeColor: "#fb7185",
    glowColor: "rgba(251, 113, 133, 0.2)",
  };
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// --- Semicircular Gauge (270-degree arc) ---

function SuitabilityGauge({ score, state }) {
  const size = 170;
  const strokeWidth = 12;
  const radius = (size - strokeWidth * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  const arcLength = circumference * 0.75;
  const fillLength = (score / 100) * arcLength;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label={`Suitability score: ${Math.round(score)}%`}
    >
      <div
        className="absolute rounded-full blur-3xl transition-all duration-700"
        style={{
          width: size * 0.5,
          height: size * 0.5,
          backgroundColor: state.glowColor,
        }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <filter id="gauge-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g style={{ transform: "rotate(135deg)", transformOrigin: `${cx}px ${cy}px` }}>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="transparent"
            stroke="var(--muted)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="transparent"
            stroke={state.strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${fillLength} ${circumference}`}
            strokeLinecap="round"
            filter="url(#gauge-glow)"
            style={{
              transition: "stroke-dasharray 700ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </g>
      </svg>

      <div className="absolute flex flex-col items-center" style={{ marginTop: -6 }}>
        <span className={`text-4xl font-bold tabular-nums tracking-tight ${state.textColor}`}>
          {Math.round(score)}
          <span className="text-xl font-semibold opacity-60">%</span>
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mt-0.5">
          Suitability
        </span>
      </div>
    </div>
  );
}

// --- Stat Card ---

function StatCard({ label, current, peak, barColor }) {
  return (
    <div className="flex-1 rounded-lg bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
          Peak {Math.round(peak)}%
        </span>
      </div>

      <div className="text-xl font-bold tabular-nums text-foreground">
        {current.toFixed(1)}
        <span className="text-xs font-medium text-muted-foreground ml-0.5">%</span>
      </div>

      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${Math.min(current, 100)}%` }}
        />
      </div>
    </div>
  );
}

// --- History Row ---

function HistoryRow({ summary }) {
  const scoreState = getScoreState(summary.avg_score);

  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: scoreState.strokeColor }}
        />
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">
            {formatDate(summary.date)}
          </span>
          <span className="text-[10px] text-muted-foreground">{scoreState.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] tabular-nums">
        <span className="text-muted-foreground">
          CPU {Math.round(summary.avg_cpu)}%
        </span>
        <span className="text-muted-foreground">
          RAM {Math.round(summary.avg_ram)}%
        </span>
        <span className={`font-semibold ${scoreState.textColor}`}>
          {Math.round(summary.avg_score)}%
        </span>
        <span className="text-muted-foreground w-12 text-right">
          {formatDuration(summary.active_minutes)}
        </span>
      </div>
    </div>
  );
}

// --- App ---

export default function App() {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await invoke("get_hardware_stats");
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch hardware stats:", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await invoke("get_usage_history", { days: 30 });
        setHistory(data);
      } catch (err) {
        console.error("Failed to fetch usage history:", err);
        setHistory([]);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 300000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const state = getScoreState(stats.score);

  return (
    <div className="w-full h-screen bg-background text-foreground flex flex-col select-none overflow-hidden">
      {/* Subtle radial gradient overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, var(--accent) 0%, transparent 100%)",
          opacity: 0.4,
        }}
      />

      <div className="relative flex-1 flex flex-col gap-3 p-4 overflow-hidden">
        {/* Top card — Live Statistics */}
        <div className="rounded-2xl bg-card/60 backdrop-blur-sm border border-border p-4 flex flex-col items-center gap-3 shrink-0 animate-fade-in-up">
          <SuitabilityGauge score={stats.score} state={state} />

          <div className="w-full grid grid-cols-2 gap-2.5">
            <StatCard
              label="CPU"
              current={stats.cpu_current}
              peak={stats.cpu_peak}
              barColor="bg-blue-500"
            />
            <StatCard
              label="RAM"
              current={stats.ram_current}
              peak={stats.ram_peak}
              barColor="bg-violet-500"
            />
          </div>
        </div>

        {/* Bottom card — Usage History */}
        <div className="flex-1 rounded-2xl bg-card/60 backdrop-blur-sm border border-border flex flex-col overflow-hidden min-h-0 animate-fade-in-up-delay">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
            <h2 className="text-xs font-semibold text-foreground">Usage History</h2>
            <span className="text-[10px] text-muted-foreground">Last 30 days</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {history === null ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
                <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">No usage data yet</p>
                <p className="text-[10px] text-muted-foreground/60 max-w-48">
                  Keep the app running — daily summaries will appear here after a few minutes
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 px-4">
                {history.map((day) => (
                  <HistoryRow key={day.date} summary={day} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
