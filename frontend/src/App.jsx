import { useState, useRef, useCallback } from "react";
import {
  Upload, Shield, AlertTriangle, CheckCircle, XCircle,
  Eye, FileText, Link, Brain, ChevronRight, RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Risk colour helpers
// ---------------------------------------------------------------------------
const RISK_CONFIG = {
  Low:      { color: "#22c55e", bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.25)"  },
  Medium:   { color: "#eab308", bg: "rgba(234,179,8,0.1)",  border: "rgba(234,179,8,0.25)"  },
  High:     { color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.25)" },
  Critical: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.25)"  },
};
const scoreColor = (s) =>
  s < 30 ? "#22c55e" : s < 55 ? "#eab308" : s < 75 ? "#f97316" : "#ef4444";

// ---------------------------------------------------------------------------
// Risk Gauge (SVG arc)
// ---------------------------------------------------------------------------
function RiskGauge({ score }) {
  const R = 70;
  const cx = 90, cy = 90;
  const startAngle = -210;
  const sweepTotal = 240;
  const sweep = (score / 100) * sweepTotal;
  const toRad = (d) => (d * Math.PI) / 180;
  const arc = (angle) => ({
    x: cx + R * Math.cos(toRad(angle)),
    y: cy + R * Math.sin(toRad(angle)),
  });
  const s = arc(startAngle);
  const eTrack = arc(startAngle + sweepTotal);
  const eFill  = arc(startAngle + sweep);
  const large = (a) => (a > 180 ? 1 : 0);
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="180" height="160" viewBox="0 0 180 160">
        {/* track */}
        <path
          d={`M ${s.x} ${s.y} A ${R} ${R} 0 ${large(sweepTotal)} 1 ${eTrack.x} ${eTrack.y}`}
          fill="none" stroke="#1a2744" strokeWidth="10" strokeLinecap="round"
        />
        {/* fill */}
        {score > 0 && (
          <path
            d={`M ${s.x} ${s.y} A ${R} ${R} 0 ${large(sweep)} 1 ${eFill.x} ${eFill.y}`}
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}
        {/* score label */}
        <text x={cx} y={cy + 6} textAnchor="middle"
          style={{ fontFamily: "Space Grotesk", fontSize: 30, fontWeight: 700, fill: color }}>
          {score}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle"
          style={{ fontFamily: "Inter", fontSize: 11, fill: "#4a5e7a" }}>
          / 100
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Stage Indicator
// ---------------------------------------------------------------------------
const STAGES = [
  { icon: Eye,      label: "Visual Analysis",  sub: "BLIP"         },
  { icon: FileText, label: "Text Extraction",  sub: "EasyOCR"      },
  { icon: Link,     label: "URL Scanning",     sub: "VirusTotal"   },
  { icon: Brain,    label: "Threat Synthesis", sub: "Groq / LLaMA" },
];

function Pipeline({ activeStage }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {STAGES.map((stage, i) => {
        const Icon = stage.icon;
        const done    = activeStage > i;
        const active  = activeStage === i;
        const pending = activeStage < i;
        const color   = done ? "#f59e0b" : active ? "#38bdf8" : "#1a2744";
        const textCol = done ? "#f59e0b" : active ? "#38bdf8" : "#4a5e7a";
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 min-w-[56px]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: active ? "rgba(56,189,248,0.12)" : done ? "rgba(245,158,11,0.1)" : "#0d1526",
                         border: `1.5px solid ${color}`,
                         boxShadow: active ? "0 0 12px rgba(56,189,248,0.3)" : done ? "0 0 8px rgba(245,158,11,0.2)" : "none" }}>
                {active ? (
                  <div className="w-3 h-3 rounded-full bg-sky-400 animate-ping opacity-75" />
                ) : (
                  <Icon size={14} style={{ color }} />
                )}
              </div>
              <span className="text-[9px] font-medium text-center leading-tight"
                style={{ color: textCol, fontFamily: "Space Grotesk" }}>
                {stage.label}
              </span>
              <span className="text-[8px] mono" style={{ color: "#4a5e7a" }}>{stage.sub}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className="flex-1 h-px mx-1" style={{
                background: done ? "linear-gradient(90deg,#f59e0b,#f59e0b44)" : "#1a2744"
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL Verdict Badge
// ---------------------------------------------------------------------------
function VerdictBadge({ verdict }) {
  const cfg = {
    malicious:  { color: "#ef4444", label: "MALICIOUS"  },
    suspicious: { color: "#f97316", label: "SUSPICIOUS" },
    clean:      { color: "#22c55e", label: "CLEAN"      },
    skipped:    { color: "#4a5e7a", label: "SKIPPED"    },
    error:      { color: "#64748b", label: "ERROR"      },
    timeout:    { color: "#64748b", label: "TIMEOUT"    },
  }[verdict] || { color: "#64748b", label: verdict?.toUpperCase() || "UNKNOWN" };
  return (
    <span className="mono text-[10px] px-2 py-0.5 rounded"
      style={{ color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [image, setImage]           = useState(null);  // base64
  const [preview, setPreview]       = useState(null);  // object URL
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [stage, setStage]           = useState(-1);    // -1 = idle
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      setPreview(URL.createObjectURL(file));
      setResult(null);
      setError(null);
      setStage(-1);
    };
    reader.readAsDataURL(file);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);

    // Simulate per-stage progress while waiting for the backend
    let s = 0;
    setStage(0);
    const tick = setInterval(() => {
      s = Math.min(s + 1, 3);
      setStage(s);
    }, 4000);   // ~4 s per stage (actual timing is backend-driven)

    try {
      const res = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      clearInterval(tick);
      setStage(4);   // all done

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setResult(data);
    } catch (err) {
      clearInterval(tick);
      setError(err.message);
    } finally {
      setLoading(false);
      setStage(-1);
    }
  };

  const reset = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setStage(-1);
  };

  const rCfg = result ? (RISK_CONFIG[result.risk_level] || RISK_CONFIG.Medium) : null;

  return (
    <div className="relative min-h-screen z-10" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid var(--amber-dim)" }}>
              <Shield size={16} style={{ color: "var(--amber)" }} />
            </div>
            <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "Space Grotesk", color: "var(--amber)" }}>
              PHISH<span style={{ color: "var(--text)" }}>LENS</span>
            </span>
            <span className="mono text-[10px] px-2 py-0.5 rounded" style={{ color: "var(--text-dim)", background: "var(--surface-hi)", border: "1px solid var(--border)" }}>
              v1.0
            </span>
          </div>
          <span className="text-xs" style={{ color: "var(--text-dim)", fontFamily: "Space Grotesk" }}>
            Multimodal Phishing Detection · BLIP + EasyOCR + Groq
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left — Upload */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-widest uppercase" style={{ color: "var(--text-dim)" }}>
              Screenshot Input
            </h2>
            {image && (
              <button onClick={reset} className="flex items-center gap-1 text-xs"
                style={{ color: "var(--text-dim)" }}>
                <RefreshCw size={11} /> Clear
              </button>
            )}
          </div>

          {/* Drop zone */}
          <div
            className={`drop-zone rounded-lg flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${isDragging ? "drag-over" : ""}`}
            style={{ minHeight: 220, background: "var(--surface)" }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            {preview ? (
              <img src={preview} alt="Uploaded screenshot"
                className="max-h-52 max-w-full rounded object-contain"
                style={{ border: "1px solid var(--border-hi)" }} />
            ) : (
              <>
                <div className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "var(--surface-hi)", border: "1px solid var(--border-hi)" }}>
                  <Upload size={20} style={{ color: "var(--text-dim)" }} />
                </div>
                <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                  Drop a screenshot or <span style={{ color: "var(--amber)" }}>click to upload</span>
                </p>
                <p className="text-xs mono" style={{ color: "var(--text-dim)" }}>PNG / JPG / WEBP</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handleFile(e.target.files[0])} />

          {/* Analyze button */}
          <button
            onClick={analyze}
            disabled={!image || loading}
            className="w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            style={{
              fontFamily: "Space Grotesk",
              background: image && !loading ? "var(--amber)" : "var(--surface-hi)",
              color: image && !loading ? "#0a0e1a" : "var(--text-dim)",
              cursor: image && !loading ? "pointer" : "not-allowed",
              boxShadow: image && !loading ? "0 0 20px rgba(245,158,11,0.25)" : "none",
            }}
          >
            {loading ? (
              <><RefreshCw size={14} className="animate-spin" /> Analyzing…</>
            ) : (
              <><Shield size={14} /> Run Analysis</>
            )}
          </button>

          {/* Pipeline progress */}
          {loading && (
            <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-xs mb-3" style={{ color: "var(--text-dim)", fontFamily: "Space Grotesk" }}>
                PIPELINE PROGRESS
              </p>
              <Pipeline activeStage={stage} />
            </div>
          )}
        </div>

        {/* Right — Results */}
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold tracking-widest uppercase" style={{ color: "var(--text-dim)" }}>
            Threat Report
          </h2>

          {!result && !error && !loading && (
            <div className="rounded-lg flex-1 flex flex-col items-center justify-center gap-3 py-20"
              style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}>
              <Shield size={32} style={{ color: "var(--border-hi)" }} />
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>Upload a screenshot to run analysis</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg p-4 flex items-start gap-3"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
              <XCircle size={16} style={{ color: "#ef4444", marginTop: 2, flexShrink: 0 }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "#ef4444", fontFamily: "Space Grotesk" }}>Analysis Failed</p>
                <p className="text-xs mt-1 mono" style={{ color: "#ef444499" }}>{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">

              {/* Risk score + level */}
              <div className="rounded-lg p-5 flex items-center gap-6"
                style={{ background: "var(--surface)", border: `1px solid ${rCfg.border}` }}>
                <RiskGauge score={result.risk_score} />
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold tracking-widest uppercase mono"
                    style={{ color: "var(--text-dim)" }}>Risk Level</span>
                  <span className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk", color: rCfg.color }}>
                    {result.risk_level}
                  </span>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)", maxWidth: 200 }}>
                    {result.summary}
                  </p>
                </div>
              </div>

              {/* Recommended action */}
              <div className="rounded-lg px-4 py-3 flex items-center gap-3"
                style={{ background: rCfg.bg, border: `1px solid ${rCfg.border}` }}>
                <AlertTriangle size={14} style={{ color: rCfg.color, flexShrink: 0 }} />
                <p className="text-sm font-medium" style={{ color: rCfg.color, fontFamily: "Space Grotesk" }}>
                  {result.recommended_action}
                </p>
              </div>

              {/* Phishing indicators */}
              {result.indicators?.length > 0 && (
                <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold tracking-widest uppercase mb-3 mono" style={{ color: "var(--text-dim)" }}>
                    Indicators Detected
                  </p>
                  <div className="flex flex-col gap-2">
                    {result.indicators.map((ind, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <ChevronRight size={12} style={{ color: "var(--amber)", marginTop: 3, flexShrink: 0 }} />
                        <span className="text-xs" style={{ color: "var(--text)" }}>{ind}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* URL verdicts */}
              {result.urls_found?.length > 0 && (
                <div className="rounded-lg p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold tracking-widest uppercase mb-3 mono" style={{ color: "var(--text-dim)" }}>
                    URL Scan Results
                  </p>
                  <div className="flex flex-col gap-2">
                    {result.urls_found.map((u, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0"
                        style={{ borderColor: "var(--border)" }}>
                        <span className="mono text-[10px] truncate" style={{ color: "var(--text-dim)", maxWidth: "70%" }}>
                          {u.url}
                        </span>
                        <VerdictBadge verdict={u.verdict} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw OCR text (collapsible) */}
              <details className="rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <summary className="px-4 py-3 text-xs font-semibold tracking-widest uppercase mono cursor-pointer"
                  style={{ color: "var(--text-dim)" }}>
                  Extracted Text (OCR)
                </summary>
                <p className="px-4 pb-4 text-xs mono leading-relaxed" style={{ color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>
                  {result.extracted_text || "No text detected."}
                </p>
              </details>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
