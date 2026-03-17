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

// --- App ---

export default function App() {
  const [stats, setStats] = useState(DEFAULT_STATS);

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
        {/* Top card — Statistics */}
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

        {/* Bottom card — Recommendations (placeholder) */}
        <div className="flex-1 rounded-2xl bg-card/60 backdrop-blur-sm border border-border flex flex-col overflow-hidden min-h-0 animate-fade-in-up-delay">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-foreground">Recommended Machines</h2>
            <span className="text-[11px] text-muted-foreground">{state.label}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col items-center justify-center h-full text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
                <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                Machine recommendations will appear here
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Based on your usage patterns
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
