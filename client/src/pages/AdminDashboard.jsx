import React, { useState, useEffect, useCallback, useRef } from "react";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ background:"#000", color:"#ff3355", fontFamily:"monospace",
        padding:32, minHeight:"100vh", fontSize:12, whiteSpace:"pre-wrap" }}>
        <div style={{ color:"#ffaa00", marginBottom:16, fontSize:14 }}>⚑ ADMIN DASHBOARD — RUNTIME ERROR</div>
        {String(this.state.error)}
        {this.state.error?.stack && (
          <div style={{ color:"rgba(255,51,85,0.5)", fontSize:10, marginTop:16 }}>
            {this.state.error.stack}
          </div>
        )}
      </div>
    );
    return this.props.children;
  }
}

const API = "/api";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:         "#020408",
  bgCard:     "rgba(0,180,255,0.02)",
  bgHover:    "rgba(0,180,255,0.04)",
  border:     "rgba(0,180,255,0.08)",
  borderHi:   "rgba(0,180,255,0.25)",
  cyan:       "#00b4ff",
  cyanDim:    "rgba(0,180,255,0.5)",
  cyanFaint:  "rgba(0,180,255,0.07)",
  cyanGlow:   "rgba(0,180,255,0.12)",
  green:      "#00ff88",
  red:        "#ff3355",
  orange:     "#ffaa00",
  yellow:     "#ffdd00",
  purple:     "#9966ff",
  text:       "rgba(180,210,240,0.85)",
  textDim:    "rgba(140,180,220,0.5)",
  textFaint:  "rgba(100,150,200,0.3)",
};

const FM = '"IBM Plex Mono","Courier New",monospace';
const FH = '"Bebas Neue","Impact",sans-serif';

// ─── INJECT STYLES ────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById("adm-styles")) return;
  const s = document.createElement("style");
  s.id = "adm-styles";
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&family=Bebas+Neue&display=swap');
    @keyframes adm-fade  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
    @keyframes adm-slide { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
    @keyframes adm-spin  { to{transform:rotate(360deg)} }
    @keyframes adm-pulse { 0%,100%{opacity:1;box-shadow:0 0 6px currentColor} 50%{opacity:0.4;box-shadow:none} }
    @keyframes adm-scan  { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
    @keyframes adm-blink { 0%,100%{opacity:1} 49%{opacity:1} 50%{opacity:0} 99%{opacity:0} }
    @keyframes adm-bar   { from{width:0} to{width:var(--w)} }
    @keyframes adm-count { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
    @keyframes adm-glow  { 0%,100%{box-shadow:0 0 20px rgba(0,180,255,0.1)} 50%{box-shadow:0 0 40px rgba(0,180,255,0.25)} }
    * { box-sizing: border-box; }
    body { margin:0; background:#020408; }
    ::-webkit-scrollbar { width:3px; height:3px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:rgba(0,180,255,0.15); border-radius:2px; }
    .adm-row:hover { background:rgba(0,180,255,0.03) !important; }
    .adm-btn {
      cursor:pointer; border-radius:3px; font-family:${FM};
      letter-spacing:1.5px; font-weight:700; transition:all 0.15s;
      font-size:9px; padding:5px 12px; white-space:nowrap;
    }
    .adm-btn:disabled { opacity:0.35; cursor:not-allowed; }
    .adm-btn:not(:disabled):hover { filter:brightness(1.3); transform:translateY(-1px); }
    .adm-input {
      background:rgba(0,180,255,0.03);
      border:1px solid rgba(0,180,255,0.1);
      border-radius:3px; color:rgba(180,210,240,0.85);
      padding:7px 11px; font-family:${FM};
      font-size:11px; outline:none; width:100%; transition:border 0.2s;
    }
    .adm-input::placeholder { color:rgba(0,180,255,0.2); }
    .adm-input:focus { border-color:rgba(0,180,255,0.35); box-shadow:0 0 0 2px rgba(0,180,255,0.05); }
    .adm-card {
      background:rgba(0,180,255,0.02);
      border:1px solid rgba(0,180,255,0.08);
      border-radius:6px; padding:16px;
    }
    .adm-tab {
      cursor:pointer; padding:8px 16px; border-radius:4px 4px 0 0;
      font-size:9px; letter-spacing:2px; font-weight:700;
      border:none; background:transparent; transition:all 0.2s;
      font-family:${FM}; white-space:nowrap;
    }
    .adm-nav {
      cursor:pointer; padding:9px 14px; border-radius:4px;
      font-size:10px; letter-spacing:1.5px; font-weight:600;
      transition:all 0.2s; display:flex; align-items:center; gap:10px;
      font-family:${FM}; border:1px solid transparent;
    }
    .adm-nav:hover  { background:rgba(0,180,255,0.04); color:rgba(0,180,255,0.7) !important; }
    .adm-nav.active { background:rgba(0,180,255,0.08); border-color:rgba(0,180,255,0.2); }
    .adm-check { cursor:pointer; accent-color:#00b4ff; width:14px; height:14px; }
    .adm-threat-row:hover { background:rgba(255,51,85,0.04) !important; }
  `;
  document.head.appendChild(s);
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function fmtBig(n) {
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return String(n ?? "—");
}
function fmtSol(n) { return `◎${(n||0).toFixed(3)}`; }
function fmtUsd(n) { return `$${(n||0).toLocaleString("en", {maximumFractionDigits:0})}`; }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function generateSerial(wallet, mintNum) {
  const ts    = Date.now().toString(36).toUpperCase();
  const wPart = (wallet||"").replace(/[^a-zA-Z0-9]/g,"").slice(0,4).toUpperCase();
  const mPart = String(mintNum||"0").padStart(4,"0");
  return `RVK-${wPart}-${mPart}-${ts}`;
}
function exportCSV(data, filename) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k]??"",(_, v)=>v instanceof Date?v.toISOString():v)).join(","))];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = filename; a.click();
}

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function Pill({ label, color, bg }) {
  return (
    <span style={{ fontSize:8, fontWeight:700, letterSpacing:1.5, color, border:`1px solid ${color}44`,
      borderRadius:2, padding:"2px 7px", background: bg || `${color}0d`, fontFamily:FM, whiteSpace:"nowrap" }}>
      {label}
    </span>
  );
}

function Dot({ color, pulse }) {
  return (
    <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%",
      background:color, boxShadow:`0 0 6px ${color}`,
      animation: pulse ? "adm-pulse 2s ease infinite" : "none",
      verticalAlign:"middle", flexShrink:0 }} />
  );
}

function Loader({ label = "LOADING..." }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10,
      height:120, color:C.textFaint, fontSize:9, letterSpacing:2, fontFamily:FM }}>
      <div style={{ width:12, height:12, border:`1px solid ${C.cyanFaint}`,
        borderTop:`1px solid ${C.cyan}`, borderRadius:"50%", animation:"adm-spin 0.8s linear infinite" }} />
      {label}
    </div>
  );
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, []);
  const col = type === "success" ? C.green : type === "warn" ? C.orange : C.red;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999,
      background:C.bg, border:`1px solid ${col}44`, borderRadius:4,
      padding:"10px 18px", color:col, fontSize:10, letterSpacing:1.5,
      fontFamily:FM, animation:"adm-fade 0.3s ease", boxShadow:`0 0 30px ${col}18`,
      display:"flex", alignItems:"center", gap:8 }}>
      <Dot color={col} />
      {msg}
    </div>
  );
}

function SectionHead({ children, action }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${C.border}` }}>
      <div style={{ fontSize:8, color:C.textFaint, letterSpacing:3, fontFamily:FM }}>{children}</div>
      {action}
    </div>
  );
}

function BigStat({ label, value, sub, color = C.cyan, delta }) {
  return (
    <div className="adm-card" style={{ position:"relative", overflow:"hidden" }}>
      {/* Glow accent */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1,
        background:`linear-gradient(90deg,transparent,${color}66,transparent)` }} />
      <div style={{ fontSize:8, color:C.textFaint, letterSpacing:3, marginBottom:6 }}>{label}</div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:8 }}>
        <div style={{ fontSize:28, fontWeight:700, color, lineHeight:1, fontFamily:FM,
          textShadow:`0 0 24px ${color}44`, animation:"adm-count 0.4s ease" }}>
          {value ?? "—"}
        </div>
        {delta != null && (
          <div style={{ fontSize:9, color: delta >= 0 ? C.green : C.red, marginBottom:3, fontFamily:FM }}>
            {delta >= 0 ? "▲" : "▼"}{Math.abs(delta)}%
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize:9, color:C.textFaint, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ─── API HEALTH MONITOR ───────────────────────────────────────────────────────
function ApiHealthPanel() {
  const [health, setHealth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/admin/api-health");
      setHealth(res.services || []);
      setLastCheck(Date.now());
    } catch (e) {
      setHealth([]);
      console.error("[API Health] Failed to load:", e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const ok   = health.filter(s => s.status === "ok").length;
  const warn = health.filter(s => s.status === "warn").length;
  const down = health.filter(s => s.status === "down").length;

  const statusColor = (s) =>
    s === "ok" ? C.green : s === "warn" ? C.orange : s === "down" ? C.red : C.textFaint;

  const latencyColor = (ms) =>
    !ms ? C.textFaint : ms < 200 ? C.green : ms < 600 ? C.yellow : C.red;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        <BigStat label="SERVICES UP"   value={ok}   color={C.green}  sub={`of ${health.length} monitored`} />
        <BigStat label="DEGRADED"      value={warn} color={C.orange} sub="slow or partial" />
        <BigStat label="DOWN"          value={down} color={down > 0 ? C.red : C.textFaint} sub="not responding" />
      </div>

      {/* Service table */}
      <div className="adm-card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 16px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:8, color:C.textFaint, letterSpacing:3 }}>◎ API SERVICES</div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:8, color:C.textFaint }}>
              Updated {Math.round((Date.now()-lastCheck)/1000)}s ago
            </span>
            <button className="adm-btn"
              style={{ border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}
              onClick={load}>↺ REFRESH</button>
          </div>
        </div>

        {loading ? <Loader /> : health.length === 0 ? (
          <div style={{ textAlign:"center", padding:32, color:C.textFaint, fontSize:10, letterSpacing:1 }}>
            <div style={{ marginBottom:8, fontSize:14 }}>◎</div>
            No health data — wire <code style={{color:C.cyanDim}}>/admin/api-health</code> to return service statuses
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {["STATUS","SERVICE","ENV KEY","LATENCY","LAST SUCCESS"].map(h => (
                  <th key={h} style={{ padding:"8px 14px", color:C.textFaint, fontSize:8,
                    letterSpacing:2, textAlign:"left", fontWeight:400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {health.map((svc, i) => (
                <tr key={i} className="adm-row" style={{ borderBottom:`1px solid ${C.border}`,
                  animation:`adm-slide 0.2s ease ${i*0.03}s both` }}>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <Dot color={statusColor(svc.status)} pulse={svc.status === "ok"} />
                      <span style={{ fontSize:8, color:statusColor(svc.status), letterSpacing:1 }}>
                        {svc.status.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px", color:C.text, fontWeight:600 }}>{svc.name}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:9, color:C.cyanDim, fontFamily:FM,
                      background:C.cyanFaint, padding:"2px 6px", borderRadius:2 }}>
                      {svc.key === "—" ? "public" : svc.key}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ color:latencyColor(svc.latency), fontSize:10, fontWeight:700 }}>
                      {svc.latency ? `${svc.latency}ms` : "—"}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px", color:C.textDim, fontSize:10 }}>
                    {svc.lastSuccess ? timeAgo(svc.lastSuccess) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── REVENUE TAB ──────────────────────────────────────────────────────────────
function RevenuePanel({ overview }) {
  const d = overview || {};

  // Revenue tiers
  const earlyMinted  = Math.min(d.totalMinted || 0, 2000);
  const lateMinted   = Math.max(0, (d.totalMinted || 0) - 2000);
  const earlyRev     = earlyMinted * 40;
  const lateRev      = lateMinted  * 70;
  const totalRev     = earlyRev + lateRev;
  const solPrice     = d.solPrice ?? null;
  const totalRevSol  = solPrice ? totalRev / solPrice : null;
  const projected    = 10_000 * 70;
  const projectedSol = solPrice ? projected / solPrice : null;

  const tiers = [
    { label:"EARLY (1–2000)",  minted:earlyMinted,  price:40,  revenue:earlyRev,  color:C.cyan,   pct:(earlyMinted/2000)*100 },
    { label:"FULL (2001+)",    minted:lateMinted,   price:70,  revenue:lateRev,   color:C.purple, pct:(lateMinted /8000)*100 },
  ];

  const months = d.revenueByMonth || [];
  const maxRev = Math.max(...months.map((m) => m.rev), 1);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Top metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
        <BigStat label="TOTAL REVENUE"    value={fmtUsd(totalRev)}    color={C.green}  sub={totalRevSol ? fmtSol(totalRevSol) : undefined} />
        <BigStat label="EARLY TIER REV"   value={fmtUsd(earlyRev)}    color={C.cyan}   sub={`${earlyMinted} × $40`} />
        <BigStat label="FULL TIER REV"    value={fmtUsd(lateRev)}     color={C.purple} sub={`${lateMinted} × $70`} />
        <BigStat label="PROJECTED (10K)"  value={fmtUsd(projected)}   color={C.orange} sub={projectedSol ? fmtSol(projectedSol) : undefined} />
      </div>

      {/* Tier progress */}
      <div className="adm-card">
        <SectionHead>◈ MINT TIER BREAKDOWN</SectionHead>
        {tiers.map((t, i) => (
          <div key={i} style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:9, color:t.color, letterSpacing:2, fontWeight:700 }}>{t.label}</span>
                <span style={{ fontSize:9, color:C.textFaint }}>{t.minted.toLocaleString()} minted</span>
              </div>
              <div style={{ textAlign:"right" }}>
                <span style={{ fontSize:11, fontWeight:700, color:t.color }}>{fmtUsd(t.revenue)}</span>
                <span style={{ fontSize:8, color:C.textFaint, marginLeft:8 }}>${t.price}/NFT</span>
              </div>
            </div>
            <div style={{ height:5, background:"rgba(255,255,255,0.04)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.min(100,t.pct)}%`,
                background:`linear-gradient(90deg,${t.color}88,${t.color})`,
                borderRadius:3, transition:"width 1s ease", boxShadow:`0 0 10px ${t.color}44` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <div className="adm-card">
        <SectionHead>◎ MONTHLY REVENUE</SectionHead>
        {months.length === 0 ? (
          <div style={{ textAlign:"center", padding:30, color:C.textFaint, fontSize:10 }}>
            No monthly revenue data yet — wire <code style={{color:C.cyanDim}}>/admin/overview</code> to return <code style={{color:C.cyanDim}}>revenueByMonth</code>
          </div>
        ) : (
        <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:80, marginTop:12 }}>
          {months.map((m, i) => {
            const h = Math.max(4, (m.rev / maxRev) * 80);
            return (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                <span style={{ fontSize:8, color:C.green, opacity: m.rev > 0 ? 1 : 0 }}>
                  {m.rev > 0 ? fmtUsd(m.rev) : ""}
                </span>
                <div style={{ width:"100%", height:h, background:`linear-gradient(180deg,${C.cyan},${C.cyanFaint})`,
                  borderRadius:"2px 2px 0 0", transition:"height 0.8s ease",
                  boxShadow:`0 0 8px ${C.cyan}33`, cursor:"default" }}
                  title={`${m.month}: ${fmtUsd(m.rev)}`} />
                <span style={{ fontSize:8, color:C.textFaint }}>{m.month}</span>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Average per holder */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        <div className="adm-card">
          <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:6 }}>AVG REVENUE/HOLDER</div>
          <div style={{ fontSize:20, fontWeight:700, color:C.cyan }}>
            {d.totalMinted ? fmtUsd(totalRev / d.totalMinted) : "—"}
          </div>
        </div>
        <div className="adm-card">
          <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:6 }}>REVOKED (LOST REV)</div>
          <div style={{ fontSize:20, fontWeight:700, color:C.red }}>
            {fmtUsd((d.revokedHolders || 0) * 55)}
          </div>
        </div>
        <div className="adm-card">
          <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:6 }}>% TO FULL MINT</div>
          <div style={{ fontSize:20, fontWeight:700, color:C.orange }}>
            {d.totalMinted ? `${((d.totalMinted/10000)*100).toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── THREAT DETECTION ─────────────────────────────────────────────────────────
function ThreatPanel({ onToast }) {
  const [threats, setThreats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/admin/threats");
      setThreats(res.threats || []);
    } catch (e) {
      setThreats([]);
      console.error("[Threats] Failed to load:", e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function flagRevoke(wallet, reason) {
    try {
      const serial = generateSerial(wallet, "THREAT");
      await api("/admin/revoke", {
        method:"POST", body: JSON.stringify({ wallet, reason, serial }),
      });
      onToast("Threat wallet revoked", "success");
      load();
    } catch { onToast("Revoke failed", "error"); }
  }

  const sevColor = (s) =>
    s === "high" ? C.red : s === "medium" ? C.orange : C.yellow;

  const typeIcon = (t) =>
    t === "BOT" ? "◉" : t === "MULTI_WALLET" ? "◈" : t === "EXPIRED_BYPASS" ? "⚑" : "↺";

  const filtered = filter === "all" ? threats
    : threats.filter(t => t.severity === filter);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, flex:1 }}>
          <BigStat label="TOTAL THREATS"   value={threats.length}                                      color={C.red}    />
          <BigStat label="HIGH SEVERITY"   value={threats.filter(t=>t.severity==="high").length}   color={C.red}    sub="immediate action" />
          <BigStat label="BOT WALLETS"     value={threats.filter(t=>t.type==="BOT").length}        color={C.orange} sub="automated access" />
        </div>
      </div>

      {/* Filter + actions */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {["all","high","medium","low"].map(f => (
          <button key={f} className="adm-btn"
            style={{ border:`1px solid ${filter===f ? sevColor(f==="all"?C.cyan:f) : C.border}`,
              background: filter===f ? `${sevColor(f==="all"?C.cyan:f)}11` : "transparent",
              color: filter===f ? sevColor(f==="all"?C.cyan:f) : C.textDim }}
            onClick={() => setFilter(f)}>
            {f.toUpperCase()}
          </button>
        ))}
        <button className="adm-btn" onClick={load}
          style={{ marginLeft:"auto", border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}>
          ↺ REFRESH
        </button>
      </div>

      {loading ? <Loader label="SCANNING FOR THREATS..." /> : (
        filtered.length === 0
          ? <div style={{ textAlign:"center", padding:40, color:C.textFaint, fontSize:10 }}>
              {filter === "all" ? "No threats detected — wire /admin/threats to return flagged wallets" : "No threats at this severity level"}
            </div>
          : filtered.map((t, i) => (
            <div key={i} className="adm-threat-row adm-card"
              style={{ borderLeft:`3px solid ${sevColor(t.severity)}`,
                animation:`adm-slide 0.2s ease ${i*0.05}s both` }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1 }}>
                  {/* Header row */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:14, color:sevColor(t.severity) }}>{typeIcon(t.type)}</span>
                    <Pill label={t.type} color={sevColor(t.severity)} />
                    <Pill label={t.severity.toUpperCase()} color={sevColor(t.severity)} />
                    <span style={{ fontSize:9, color:C.textFaint, fontFamily:FM }}>
                      {t.wallet?.slice(0,8)}...{t.wallet?.slice(-6)}
                    </span>
                  </div>
                  {/* Reason */}
                  <div style={{ fontSize:11, color:C.text, marginBottom:8, lineHeight:1.5 }}>
                    {t.reason}
                  </div>
                  {/* Stats */}
                  <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                    <div><span style={{ fontSize:8, color:C.textFaint }}>REQUESTS  </span>
                      <span style={{ fontSize:10, color:C.orange, fontWeight:700 }}>{t.reqCount?.toLocaleString()}</span></div>
                    <div><span style={{ fontSize:8, color:C.textFaint }}>FIRST SEEN  </span>
                      <span style={{ fontSize:10, color:C.textDim }}>{timeAgo(t.firstSeen)}</span></div>
                    <div><span style={{ fontSize:8, color:C.textFaint }}>LAST SEEN  </span>
                      <span style={{ fontSize:10, color:C.textDim }}>{timeAgo(t.lastSeen)}</span></div>
                  </div>
                </div>
                {/* Action */}
                <button className="adm-btn"
                  style={{ background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.3)", color:C.red }}
                  onClick={() => flagRevoke(t.wallet, `Auto-flagged: ${t.reason}`)}>
                  ⚑ REVOKE
                </button>
              </div>
            </div>
          ))
      )}
    </div>
  );
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
function AuditLogPanel() {
  const [log,      setLog]     = useState([]);
  const [loading,  setLoading] = useState(false);
  const [filter,   setFilter]  = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/admin/audit-log");
      setLog(res.entries || []);
    } catch (e) {
      setLog([]);
      console.error("[Audit Log] Failed to load:", e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const actionColor = (a) =>
    a.includes("REVOKE") ? C.red : a.includes("RESTORE") || a.includes("APPROVE") ? C.green
    : a.includes("DENY") ? C.orange : C.cyan;

  const filtered = filter === "all" ? log
    : log.filter(e => e.action.toLowerCase().includes(filter));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {["all","revoke","restore","appeal","login"].map(f => (
          <button key={f} className="adm-btn"
            style={{ border:`1px solid ${filter===f ? C.cyan : C.border}`,
              background: filter===f ? C.cyanFaint : "transparent",
              color: filter===f ? C.cyan : C.textDim }}
            onClick={() => setFilter(f)}>
            {f.toUpperCase()}
          </button>
        ))}
        <button className="adm-btn" onClick={() => exportCSV(log, "audit-log.csv")}
          style={{ marginLeft:"auto", border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}>
          ↓ EXPORT CSV
        </button>
        <button className="adm-btn" onClick={load}
          style={{ border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}>
          ↺ REFRESH
        </button>
      </div>

      <div className="adm-card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {["TIME","ACTION","WALLET","DETAIL","ADMIN"].map(h => (
                <th key={h} style={{ padding:"8px 14px", color:C.textFaint, fontSize:8,
                  letterSpacing:2, textAlign:"left", fontWeight:400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}><Loader /></td></tr>
            ) : filtered.map((e, i) => (
              <tr key={e.id} className="adm-row"
                style={{ borderBottom:`1px solid ${C.border}`, animation:`adm-slide 0.2s ease ${i*0.03}s both` }}>
                <td style={{ padding:"9px 14px", color:C.textFaint, fontSize:9, whiteSpace:"nowrap" }}>
                  {timeAgo(e.ts)}
                </td>
                <td style={{ padding:"9px 14px" }}>
                  <Pill label={e.action} color={actionColor(e.action)} />
                </td>
                <td style={{ padding:"9px 14px", fontFamily:FM, color:C.textDim, fontSize:9 }}>
                  {e.wallet}
                </td>
                <td style={{ padding:"9px 14px", color:C.text, fontSize:10 }}>{e.detail}</td>
                <td style={{ padding:"9px 14px", color:C.cyanDim, fontSize:9 }}>{e.admin}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:30, color:C.textFaint, fontSize:10 }}>
            No audit log entries
          </div>
        )}
      </div>
    </div>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ data, role, onSwitchTab }) {
  const isOwner = role === "owner";

  if (!data) return <Loader label="LOADING OVERVIEW..." />;
  const d = data;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14, animation:"adm-fade 0.3s ease" }}>
      {/* Key metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:8 }}>
        <BigStat label="TOTAL HOLDERS"    value={fmtBig(d.totalHolders)}   color={C.cyan}           />
        <BigStat label="ACTIVE NOW"       value={fmtBig(d.activeHolders)}  color={C.green}  delta={d.activeHoldersDelta} />
        <BigStat label="TOTAL MINTED"     value={fmtBig(d.totalMinted)}    color={C.purple}         />
        <BigStat label="EARLY SPOTS LEFT" value={fmtBig(d.remainingEarly)} color={C.yellow} sub={`$${d.currentPrice} current`} />
        <BigStat label="REVOKED"          value={fmtBig(d.revokedHolders)} color={C.red}            />
        <BigStat label="PENDING APPEALS"      value={fmtBig(d.pendingAppeals)}            color={C.orange} />
        <BigStat label="WHITELIST REQUESTS"    value={fmtBig(d.pendingWhitelistRequests)}  color={d.pendingWhitelistRequests > 0 ? C.orange : C.textFaint} />
      </div>

      {/* Pending whitelist alert — owner only */}
      {d.pendingWhitelistRequests > 0 && isOwner && (
        <div style={{ background:"rgba(255,170,0,0.06)", border:"1px solid rgba(255,170,0,0.3)",
          borderRadius:6, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between",
          animation:"adm-fade 0.3s ease" }}>
          <div>
            <div style={{ color:C.orange, fontSize:11, fontWeight:700, letterSpacing:2, marginBottom:3 }}>
              ★ {d.pendingWhitelistRequests} WHITELIST REQUEST{d.pendingWhitelistRequests !== 1 ? "S" : ""} AWAITING APPROVAL
            </div>
            <div style={{ color:C.textFaint, fontSize:10 }}>
              Admin has submitted whitelist changes that need your review
            </div>
          </div>
          <button className="adm-btn" onClick={() => onSwitchTab("whitelist")}
            style={{ background:"rgba(255,170,0,0.1)", border:"1px solid rgba(255,170,0,0.4)",
              color:C.orange, fontSize:9, letterSpacing:2, flexShrink:0, whiteSpace:"nowrap" }}>
            REVIEW →
          </button>
        </div>
      )}

      {/* Panel usage */}
      <div className="adm-card">
        <SectionHead>◈ PANEL USAGE — TOP FEATURES</SectionHead>
        {(d.panelStats?.length === 0 || !d.panelStats)
          ? <div style={{ color:C.textFaint, fontSize:10, padding:20, textAlign:"center" }}>No usage data yet</div>
          : d.panelStats?.map((p, i) => {
          const maxViews = d.panelStats[0]?.views || 1;
          const pct      = Math.min(100, (p.views / maxViews) * 100);
          return (
            <div key={i} style={{ marginBottom:10, animation:`adm-slide 0.2s ease ${i*0.05}s both` }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:10, color:C.textDim }}>{p.panel}</span>
                <div style={{ display:"flex", gap:10 }}>
                  <span style={{ fontSize:9, color:C.textFaint }}>{p.uniqueUsers ? `${p.uniqueUsers} users` : ""}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:C.cyan }}>{p.views?.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ height:4, background:"rgba(255,255,255,0.04)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`,
                  background:`linear-gradient(90deg,${C.cyanFaint},${C.cyan})`,
                  borderRadius:2, transition:"width 1s ease", boxShadow:`0 0 8px ${C.cyan}33` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* Cache health */}
        <div className="adm-card">
          <SectionHead>◎ CACHE HIT RATES</SectionHead>
          {[
            { label:"NETWORK",  rate:d.cacheHitRate?.network,  color:C.cyan   },
            { label:"PROTOCOL", rate:d.cacheHitRate?.protocol, color:C.purple },
            { label:"EXPLORE",  rate:d.cacheHitRate?.explore,  color:C.green  },
            { label:"SEARCH",   rate:d.cacheHitRate?.search,   color:C.orange },
          ].map((p, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <span style={{ fontSize:8, color:C.textFaint, letterSpacing:2, width:60 }}>{p.label}</span>
              <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.04)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${p.rate || 0}%`,
                  background:p.color, borderRadius:2, boxShadow:`0 0 6px ${p.color}55` }} />
              </div>
              <span style={{ fontSize:10, fontWeight:700, color:p.color, width:36, textAlign:"right" }}>
                {p.rate != null ? `${p.rate}%` : "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Feature hits */}
        <div className="adm-card">
          <SectionHead>⬡ TOP FEATURES</SectionHead>
          {(d.featureStats || []).slice(0,6).map((f, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between",
              padding:"5px 0", borderBottom:`1px solid ${C.border}`,
              animation:`adm-slide 0.2s ease ${i*0.04}s both` }}>
              <span style={{ fontSize:10, color:C.textDim }}>{f.feature}</span>
              <span style={{ fontSize:10, fontWeight:700, color:C.cyan }}>{f.uses?.toLocaleString()}</span>
            </div>
          ))}
          {(!d.featureStats || d.featureStats.length === 0) && (
            <div style={{ color:C.textFaint, fontSize:10, textAlign:"center", padding:16 }}>No data yet</div>
          )}
        </div>
      </div>

      {/* Activity chart */}
      <div className="adm-card">
        <SectionHead>◎ DAILY EVENTS — 14 DAYS</SectionHead>
        <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:72, marginTop:8 }}>
          {(d.dailyStats || Array(14).fill({ events:0, day:"" })).map((day, i) => {
            const max = Math.max(...(d.dailyStats||[{events:1}]).map((x) => x.events), 1);
            const h   = Math.max(3, (day.events / max) * 72);
            const isToday = i === (d.dailyStats?.length || 14) - 1;
            return (
              <div key={i} title={`${day.day}: ${day.events?.toLocaleString()} events`}
                style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <div style={{ width:"100%", height:h,
                  background: isToday
                    ? `linear-gradient(180deg,${C.green},${C.green}44)`
                    : `linear-gradient(180deg,${C.cyan}88,${C.cyan}22)`,
                  borderRadius:"2px 2px 0 0", transition:"height 0.6s ease",
                  boxShadow: isToday ? `0 0 10px ${C.green}44` : `0 0 6px ${C.cyan}22` }} />
                <span style={{ fontSize:7, color: isToday ? C.green : C.textFaint,
                  transform:"rotate(-40deg)", whiteSpace:"nowrap" }}>
                  {day.day?.slice(5) || ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── HOLDERS TAB ──────────────────────────────────────────────────────────────
function HoldersTab({ onToast }) {
  const [holders,     setHolders]     = useState([]);
  const [filter,      setFilter]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState(new Set());
  const [revoking,    setRevoking]    = useState(null);
  const [reason,      setReason]      = useState("");
  const [confirm,     setConfirm]     = useState(null);
  const [serialPopup, setSerialPopup] = useState(null);
  const [sortBy,      setSortBy]      = useState("minted_desc");
  const [historyModal, setHistoryModal] = useState(null); // wallet string

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/admin/holders?filter=${filter}`);
      setHolders(data.holders || []);
    } catch { onToast("Failed to load holders", "error"); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function revoke(wallet) {
    if (!reason.trim()) { onToast("Enter a reason", "error"); return; }
    setRevoking(wallet);
    const holder = holders.find(h => h.wallet === wallet);
    const serial = generateSerial(wallet, holder?.mint_number);
    try {
      const res = await api("/admin/revoke", {
        method:"POST", body: JSON.stringify({ wallet, reason, serial }),
      });
      if (res.success) {
        onToast("Access revoked", "success");
        setConfirm(null); setReason("");
        setSerialPopup({ serial, wallet, mint:holder?.mint_number });
        load();
      } else onToast(res.error || "Failed", "error");
    } catch { onToast("Request failed", "error"); }
    setRevoking(null);
  }

  async function restore(wallet) {
    try {
      const res = await api("/admin/restore", { method:"POST", body: JSON.stringify({ wallet }) });
      if (res.success) { onToast("Access restored", "success"); load(); }
      else onToast(res.error || "Failed", "error");
    } catch { onToast("Request failed", "error"); }
  }

  async function bulkRevoke() {
    if (selected.size === 0) { onToast("No wallets selected", "warn"); return; }
    if (!reason.trim())      { onToast("Enter a bulk revoke reason", "error"); return; }
    let ok = 0;
    for (const wallet of selected) {
      try {
        const serial = generateSerial(wallet, "BULK");
        await api("/admin/revoke", { method:"POST", body: JSON.stringify({ wallet, reason, serial }) });
        ok++;
      } catch {}
    }
    onToast(`Bulk revoked ${ok}/${selected.size}`, "success");
    setSelected(new Set()); setReason(""); load();
  }

  const tierColor = (t) =>
    t === "gold" ? C.yellow : t === "silver" ? "#aaaacc" : t === "bronze" ? C.orange : C.cyan;

  const sorted = [...holders]
    .filter(h => !search || h.wallet?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "minted_desc")  return (b.mint_number||0) - (a.mint_number||0);
      if (sortBy === "expires_asc")  return new Date(a.expires_at||0).getTime() - new Date(b.expires_at||0).getTime();
      return 0;
    });

  const toggleSelect = (w) => {
    const s = new Set(selected);
    s.has(w) ? s.delete(w) : s.add(w);
    setSelected(s);
  };

  const allSelected = sorted.length > 0 && sorted.every(h => selected.has(h.wallet));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"adm-fade 0.3s ease" }}>
      {/* Controls bar */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <input className="adm-input" style={{ flex:1, minWidth:200 }}
          placeholder="Search wallet..." value={search}
          onChange={e => setSearch(e.target.value)} />

        {["all","active","revoked","expired"].map(f => (
          <button key={f} className="adm-btn"
            style={{ border:`1px solid ${filter===f ? C.cyan : C.border}`,
              background: filter===f ? C.cyanFaint : "transparent",
              color: filter===f ? C.cyan : C.textDim }}
            onClick={() => setFilter(f)}>{f.toUpperCase()}</button>
        ))}

        <select className="adm-input" style={{ width:"auto", padding:"5px 8px", cursor:"pointer" }}
          value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="minted_desc">Newest minted</option>
          <option value="expires_asc">Expiring soon</option>
        </select>

        <button className="adm-btn"
          style={{ border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}
          onClick={() => exportCSV(holders, "holders.csv")}>↓ CSV</button>

        <button className="adm-btn"
          style={{ border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}
          onClick={load}>↺</button>
      </div>

      {/* Bulk actions bar — only show when items selected */}
      {selected.size > 0 && (
        <div style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 14px",
          border:`1px solid ${C.orange}44`, borderRadius:4, background:`${C.orange}05`,
          animation:"adm-fade 0.2s ease" }}>
          <Dot color={C.orange} />
          <span style={{ fontSize:10, color:C.orange }}>{selected.size} SELECTED</span>
          <input className="adm-input" style={{ flex:1 }}
            placeholder="Bulk revoke reason..."
            value={reason} onChange={e => setReason(e.target.value)} />
          <button className="adm-btn"
            style={{ background:"rgba(255,51,85,0.1)", border:"1px solid rgba(255,51,85,0.3)", color:C.red }}
            onClick={bulkRevoke}>⚑ BULK REVOKE {selected.size}</button>
          <button className="adm-btn"
            style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textDim }}
            onClick={() => setSelected(new Set())}>CANCEL</button>
        </div>
      )}

      {/* Table */}
      <div className="adm-card" style={{ padding:0, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, minWidth:700 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                <th style={{ padding:"10px 12px" }}>
                  <input type="checkbox" className="adm-check"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(sorted.map(h => h.wallet)))} />
                </th>
                {["WALLET","TIER","MINT #","SERIAL","EXPIRES","POINTS","STATUS","ACTIONS"].map(h => (
                  <th key={h} style={{ padding:"10px 12px", color:C.textFaint,
                    fontSize:8, letterSpacing:2, textAlign:"left", fontWeight:400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><Loader /></td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8} style={{ padding:30, textAlign:"center", color:C.textFaint, fontSize:10 }}>
                  No holders found
                </td></tr>
              ) : sorted.map((h, i) => (
                <tr key={i} className="adm-row"
                  style={{ borderBottom:`1px solid ${C.border}`,
                    background: selected.has(h.wallet) ? "rgba(0,180,255,0.04)" : "transparent",
                    animation:`adm-slide 0.15s ease ${Math.min(i,10)*0.02}s both` }}>
                  <td style={{ padding:"8px 12px" }}>
                    <input type="checkbox" className="adm-check"
                      checked={selected.has(h.wallet)}
                      onChange={() => toggleSelect(h.wallet)} />
                  </td>
                  <td style={{ padding:"8px 12px", fontFamily:FM, color:C.textDim, fontSize:9 }}>
                    {h.wallet?.slice(0,8)}...{h.wallet?.slice(-6)}
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <span style={{ color:tierColor(h.tier), fontWeight:700, fontSize:9, letterSpacing:1 }}>
                      {h.tier?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:"8px 12px", color:C.textDim, fontSize:10 }}>#{h.mint_number||"—"}</td>
                  <td style={{ padding:"8px 12px" }}>
                    {h.revoke_serial
                      ? <span style={{ fontFamily:FM, color:C.red, fontSize:8,
                          background:"rgba(255,51,85,0.07)", padding:"2px 6px", borderRadius:2,
                          border:"1px solid rgba(255,51,85,0.18)" }}>{h.revoke_serial}</span>
                      : <span style={{ color:C.textFaint, fontSize:9 }}>—</span>}
                  </td>
                  <td style={{ padding:"8px 12px", color: h.is_expired ? C.red : C.textDim, fontSize:9 }}>
                    {h.expires_at ? new Date(h.expires_at).toLocaleDateString() : "—"}
                    {h.is_expired && <span style={{ color:C.red, marginLeft:5 }}>(EXP)</span>}
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:C.cyan, fontFamily:FM }}>
                        {(h.points_balance||0).toLocaleString()}
                      </span>
                      {h.points_balance >= 500 && (
                        <span style={{ fontSize:7, color:C.green, border:"1px solid rgba(0,255,136,0.25)",
                          borderRadius:2, padding:"1px 5px", letterSpacing:1 }}>FREE</span>
                      )}
                      {h.points_balance >= 50 && h.points_balance < 500 && (
                        <span style={{ fontSize:7, color:C.purple, border:"1px solid rgba(153,102,255,0.25)",
                          borderRadius:2, padding:"1px 5px", letterSpacing:1 }}>PG</span>
                      )}
                    </div>
                    <div style={{ fontSize:7, color:C.textFaint }}>{(h.points_earned_total||0)} earned</div>
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <Pill
                      label={h.revoked ? "REVOKED" : h.is_expired ? "EXPIRED" : "ACTIVE"}
                      color={h.revoked ? C.red : h.is_expired ? C.orange : C.green} />
                  </td>
                  <td style={{ padding:"8px 12px" }}>
                    <div style={{ display:"flex", gap:5 }}>
                      <button className="adm-btn"
                        style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`, color:C.cyan, fontSize:8 }}
                        onClick={() => setHistoryModal(h.wallet)}>▸ HISTORY</button>
                      {h.revoked
                        ? <button className="adm-btn"
                            style={{ background:"rgba(0,255,136,0.07)", border:"1px solid rgba(0,255,136,0.25)", color:C.green }}
                            onClick={() => restore(h.wallet)}>RESTORE</button>
                        : <button className="adm-btn"
                            style={{ background:"rgba(255,51,85,0.07)", border:"1px solid rgba(255,51,85,0.25)", color:C.red }}
                            onClick={() => setConfirm(h.wallet)}>REVOKE</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revoke modal */}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex",
          alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(6px)" }}>
          <div style={{ background:C.bg, border:"1px solid rgba(255,51,85,0.25)", borderRadius:6,
            width:460, maxWidth:"92vw", padding:24, animation:"adm-fade 0.2s ease",
            boxShadow:"0 0 60px rgba(255,51,85,0.06)" }}>
            <div style={{ color:C.red, fontSize:11, letterSpacing:3, marginBottom:4 }}>⚑ REVOKE ACCESS</div>
            <div style={{ color:C.textDim, fontSize:9, fontFamily:FM, marginBottom:4 }}>{confirm}</div>
            <div style={{ color:C.textFaint, fontSize:8, letterSpacing:1, marginBottom:14, lineHeight:1.7 }}>
              A unique serial code will be generated and permanently linked to this revocation.
              The user will see this reason in their appeal form.
            </div>
            <textarea className="adm-input" rows={3} style={{ resize:"none", marginBottom:12 }}
              placeholder="Reason for revocation..." value={reason}
              onChange={e => setReason(e.target.value)} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="adm-btn"
                style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textDim }}
                onClick={() => { setConfirm(null); setReason(""); }}>CANCEL</button>
              <button className="adm-btn"
                style={{ background:"rgba(255,51,85,0.1)", border:"1px solid rgba(255,51,85,0.35)", color:C.red }}
                onClick={() => revoke(confirm)} disabled={revoking === confirm}>
                {revoking === confirm
                  ? <span style={{ animation:"adm-spin 1s linear infinite", display:"inline-block" }}>↻</span>
                  : "CONFIRM REVOKE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {historyModal && <NftHistoryModal wallet={historyModal} onClose={() => setHistoryModal(null)} />}

      {/* Serial popup */}
      {serialPopup && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex",
          alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(6px)" }}>
          <div style={{ background:C.bg, border:`1px solid ${C.borderHi}`, borderRadius:6,
            width:420, maxWidth:"92vw", padding:28, animation:"adm-fade 0.2s ease",
            textAlign:"center", boxShadow:`0 0 60px ${C.cyanGlow}` }}>
            <div style={{ color:C.cyan, fontSize:11, letterSpacing:3, marginBottom:14 }}>◈ REVOKE SERIAL ISSUED</div>
            <div style={{ color:C.textFaint, fontSize:9, marginBottom:8 }}>
              NFT #{serialPopup.mint} · {serialPopup.wallet?.slice(0,8)}...
            </div>
            <div style={{ background:C.cyanFaint, border:`1px solid ${C.border}`,
              borderRadius:4, padding:"14px 18px", marginBottom:14 }}>
              <div style={{ fontFamily:FM, color:C.cyan, fontSize:13, letterSpacing:2,
                fontWeight:700, wordBreak:"break-all", textShadow:`0 0 12px ${C.cyan}44` }}>
                {serialPopup.serial}
              </div>
            </div>
            <div style={{ color:C.textFaint, fontSize:9, marginBottom:18, lineHeight:1.7 }}>
              Permanently tied to this NFT. Appears in the holders table and any appeal the user submits.
            </div>
            <button className="adm-btn"
              style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`, color:C.cyan, padding:"8px 28px" }}
              onClick={() => setSerialPopup(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── APPEALS TAB ──────────────────────────────────────────────────────────────
function AppealsTab({ onToast }) {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/admin/appeals");
      setAppeals(data.appeals || []);
    } catch { onToast("Failed to load appeals", "error"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  async function update(id, status) {
    try {
      const res = await api(`/admin/appeals/${id}`, { method:"POST", body: JSON.stringify({ status }) });
      if (res.success) { onToast(`Appeal ${status}`, "success"); load(); }
      else onToast("Failed", "error");
    } catch { onToast("Request failed", "error"); }
  }

  const statusColor = (s) =>
    s === "approved" ? C.green : s === "denied" ? C.red : C.yellow;

  const shown = filter === "all" ? appeals : appeals.filter(a => a.status === filter);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, animation:"adm-fade 0.3s ease" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        {["all","pending","approved","denied"].map(f => (
          <button key={f} className="adm-btn"
            style={{ border:`1px solid ${filter===f ? statusColor(f==="all"?C.cyan:f) : C.border}`,
              background: filter===f ? `${statusColor(f==="all"?C.cyan:f)}11` : "transparent",
              color: filter===f ? statusColor(f==="all"?C.cyan:f) : C.textDim }}
            onClick={() => setFilter(f)}>
            {f.toUpperCase()}
            {f === "pending" && appeals.filter(a=>a.status==="pending").length > 0 && (
              <span style={{ marginLeft:6, background:C.orange, color:"#000",
                borderRadius:8, padding:"1px 5px", fontSize:7 }}>
                {appeals.filter(a=>a.status==="pending").length}
              </span>
            )}
          </button>
        ))}
        <button className="adm-btn" onClick={load}
          style={{ marginLeft:"auto", border:`1px solid ${C.border}`, color:C.cyanDim, background:"transparent" }}>
          ↺ REFRESH
        </button>
      </div>

      {loading ? <Loader /> : shown.length === 0
        ? <div style={{ textAlign:"center", padding:40, color:C.textFaint, fontSize:10 }}>No appeals</div>
        : shown.map((a, i) => (
          <div key={i} className="adm-card"
            style={{ borderLeft:`3px solid ${statusColor(a.status)}44`,
              animation:`adm-fade 0.3s ease ${i*0.05}s both` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10, flexWrap:"wrap", gap:8 }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                  <span style={{ color:C.textDim, fontSize:9, fontFamily:FM }}>
                    {a.wallet?.slice(0,8)}...{a.wallet?.slice(-6)}
                  </span>
                  {a.revoke_serial && (
                    <span style={{ fontFamily:FM, color:C.red, fontSize:8,
                      background:"rgba(255,51,85,0.07)", padding:"2px 6px", borderRadius:2,
                      border:"1px solid rgba(255,51,85,0.18)" }}>{a.revoke_serial}</span>
                  )}
                </div>
                <div style={{ color:C.textFaint, fontSize:8 }}>{timeAgo(a.created_at)}</div>
              </div>
              <Pill label={a.status?.toUpperCase()} color={statusColor(a.status)} />
            </div>

            {a.revoke_reason && (
              <div style={{ background:"rgba(255,51,85,0.04)", border:"1px solid rgba(255,51,85,0.1)",
                borderRadius:3, padding:"8px 12px", marginBottom:10 }}>
                <div style={{ color:"rgba(255,51,85,0.4)", fontSize:7, letterSpacing:2, marginBottom:3 }}>REVOKE REASON</div>
                <div style={{ color:"rgba(255,80,100,0.75)", fontSize:10, lineHeight:1.5 }}>{a.revoke_reason}</div>
              </div>
            )}

            <div style={{ background:C.cyanFaint, border:`1px solid ${C.border}`,
              borderRadius:3, padding:"8px 12px", marginBottom:12 }}>
              <div style={{ color:C.textFaint, fontSize:7, letterSpacing:2, marginBottom:3 }}>USER'S APPEAL</div>
              <p style={{ color:C.text, fontSize:11, lineHeight:1.6, margin:0 }}>{a.message}</p>
            </div>

            {a.status === "pending" && (
              <div style={{ display:"flex", gap:8 }}>
                <button className="adm-btn"
                  style={{ background:"rgba(0,255,136,0.08)", border:"1px solid rgba(0,255,136,0.25)", color:C.green }}
                  onClick={() => update(a.id, "approved")}>✓ APPROVE &amp; RESTORE</button>
                <button className="adm-btn"
                  style={{ background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.25)", color:C.red }}
                  onClick={() => update(a.id, "denied")}>✗ DENY</button>
              </div>
            )}
          </div>
        ))
      }
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [step,      setStep]      = useState("password");
  const [password,  setPassword]  = useState("");
  const [totpCode,  setTotpCode]  = useState("");
  const [tempToken, setTempToken] = useState(null);
  const [role,      setRole]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  async function login() {
    if (!password) return;
    setLoading(true); setError(null);
    try {
      const res = await api("/auth/login", { method:"POST", body: JSON.stringify({ password }) });
      if (res.success) {
        if (res.requiresTotp) {
          setTempToken(res.tempToken); setRole(res.role); setStep("totp");
        } else {
          onLogin(res.role || "admin");
        }
      } else setError(res.error || "Invalid password");
    } catch { setError("Connection error"); }
    setLoading(false);
  }

  async function verifyTotp() {
    if (!totpCode || totpCode.length !== 6) { setError("Enter your 6-digit code"); return; }
    setLoading(true); setError(null);
    try {
      const res = await api("/auth/totp", { method:"POST", body: JSON.stringify({ tempToken, code: totpCode }) });
      if (res.success) onLogin(res.role);
      else setError(res.error || "Invalid code — check Google Authenticator");
    } catch { setError("Connection error"); }
    setLoading(false);
  }

  const roleLabel = role === "owner" ? "OWNER" : "ADMIN";
  const roleColor = role === "owner" ? C.yellow : C.cyan;

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:C.bg, fontFamily:FM }}>
      <div style={{ width:360, animation:"adm-fade 0.4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontFamily:FH, fontSize:28, letterSpacing:6, color:C.cyan,
            textShadow:`0 0 40px ${C.cyan}44` }}>PROTOCOL HUB</div>
          <div style={{ color:C.textFaint, fontSize:9, letterSpacing:4, marginTop:4 }}>ADMIN CONSOLE</div>
        </div>

        <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, borderRadius:6,
          padding:24, boxShadow:`0 0 80px rgba(0,180,255,0.04)`, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:1, overflow:"hidden" }}>
            <div style={{ height:"100%", background:`linear-gradient(90deg,transparent,${C.cyan},transparent)`,
              animation:"adm-scan 3s linear infinite" }} />
          </div>

          {step === "password" ? (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <div style={{ fontSize:8, color:C.textFaint, letterSpacing:3, marginBottom:6 }}>PASSWORD</div>
                <input className="adm-input" type="password" placeholder="Enter password..."
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && login()} autoFocus />
              </div>
              {error && <div style={{ color:C.red, fontSize:9, letterSpacing:1 }}>⚑ {error}</div>}
              <button className="adm-btn" onClick={login} disabled={loading || !password}
                style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`,
                  color:C.cyan, padding:"9px", width:"100%", fontSize:10, letterSpacing:3 }}>
                {loading
                  ? <span style={{ animation:"adm-spin 1s linear infinite", display:"inline-block" }}>↻</span>
                  : "→ CONTINUE"}
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ fontSize:9, color:roleColor, letterSpacing:2, fontWeight:700,
                  background:`${roleColor}18`, border:`1px solid ${roleColor}44`,
                  padding:"2px 10px", borderRadius:3 }}>{roleLabel}</span>
                <span style={{ fontSize:9, color:C.textFaint, letterSpacing:1 }}>2-step verification</span>
              </div>
              <div>
                <div style={{ fontSize:8, color:C.textFaint, letterSpacing:3, marginBottom:6 }}>
                  GOOGLE AUTHENTICATOR CODE
                </div>
                <input className="adm-input" type="number" placeholder="000000"
                  value={totpCode} onChange={e => setTotpCode(e.target.value.slice(0,6))}
                  onKeyDown={e => e.key === "Enter" && verifyTotp()}
                  style={{ fontSize:20, letterSpacing:8, textAlign:"center" }} autoFocus />
                <div style={{ color:C.textFaint, fontSize:8, marginTop:6, letterSpacing:1 }}>
                  Open Google Authenticator and enter the 6-digit code for ProtocolHub {roleLabel}
                </div>
              </div>
              {error && <div style={{ color:C.red, fontSize:9, letterSpacing:1 }}>⚑ {error}</div>}
              <div style={{ display:"flex", gap:8 }}>
                <button className="adm-btn"
                  style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textDim, flex:1 }}
                  onClick={() => { setStep("password"); setError(null); setTotpCode(""); }}>
                  ← BACK
                </button>
                <button className="adm-btn" onClick={verifyTotp} disabled={loading || totpCode.length !== 6}
                  style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`,
                    color:C.cyan, flex:2, fontSize:10, letterSpacing:3 }}>
                  {loading
                    ? <span style={{ animation:"adm-spin 1s linear infinite", display:"inline-block" }}>↻</span>
                    : "→ VERIFY"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ color:C.textFaint, fontSize:8, textAlign:"center", marginTop:14, letterSpacing:2 }}>
          PROTOCOL HUB · RESTRICTED ACCESS
        </div>
      </div>
    </div>
  );
}


// ─── GATE TAB (owner only) ────────────────────────────────────────────────────
function GateTab({ onToast }) {
  const [gate,        setGate]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [toggling,    setToggling]    = useState(false);
  const [lockConfirm, setLockConfirm] = useState("");
  const [locking,     setLocking]     = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api("/admin/gate");
      setGate(res);
    } catch { onToast("Failed to load gate status", "error"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleGate() {
    if (gate?.gateLocked) return;
    setToggling(true);
    const res = await api("/admin/gate/toggle", {
      method: "POST", body: JSON.stringify({ live: !gate?.gateLive }),
    });
    if (res.success) { onToast(`Gate ${res.gateLive ? "enabled" : "disabled"}`, "success"); load(); }
    else onToast(res.error || "Failed", "error");
    setToggling(false);
  }

  async function lockGate() {
    if (lockConfirm !== "LOCK FOREVER") { onToast("Type LOCK PERMANENTLY to confirm", "error"); return; }
    setLocking(true);
    const res = await api("/admin/gate/lock", {
      method: "POST", body: JSON.stringify({ confirm: lockConfirm }),
    });
    if (res.success) { onToast("Gate permanently locked", "success"); load(); }
    else onToast(res.error || "Failed", "error");
    setLocking(false);
  }

  if (loading) return <Loader />;

  const isLive   = !!gate?.gateLive;
  const isLocked = !!gate?.gateLocked;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16, maxWidth:520 }}>
      {/* Gate status card */}
      <div className="adm-card" style={{ textAlign:"center", padding:32 }}>
        <div style={{ fontSize:8, color:isLocked ? C.red : C.textFaint, letterSpacing:3, marginBottom:16 }}>
          {isLocked ? "⚑ PERMANENTLY LOCKED — CANNOT BE DISABLED" : "◎ GATE STATUS"}
        </div>

        {/* Big status indicator */}
        <div style={{ fontSize:48, marginBottom:12 }}>{isLive ? "🔒" : "🔓"}</div>
        <div style={{ fontSize:22, fontWeight:700, letterSpacing:4,
          color: isLive ? C.green : C.textFaint,
          textShadow: isLive ? `0 0 20px ${C.green}44` : "none" }}>
          {isLive ? "GATE ACTIVE" : "GATE OFF"}
        </div>
        <div style={{ color:C.textFaint, fontSize:10, marginTop:8, marginBottom:24 }}>
          {isLive
            ? "Only NFT holders and whitelisted wallets can access the platform"
            : "All users can access the platform — NFT not required"}
        </div>

        {/* Toggle switch */}
        {!isLocked && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16 }}>
            <span style={{ color:C.textDim, fontSize:11 }}>OFF</span>
            <div onClick={!toggling ? toggleGate : undefined}
              style={{ width:56, height:28, borderRadius:14, cursor:"pointer",
                background: isLive ? C.green : "rgba(255,255,255,0.1)",
                border: `2px solid ${isLive ? C.green : C.border}`,
                position:"relative", transition:"all 0.3s",
                boxShadow: isLive ? `0 0 16px ${C.green}44` : "none",
                opacity: toggling ? 0.5 : 1 }}>
              <div style={{ position:"absolute", top:2,
                left: isLive ? "calc(100% - 22px)" : 2,
                width:20, height:20, borderRadius:"50%",
                background: isLive ? "#000" : C.textDim,
                transition:"left 0.3s" }} />
            </div>
            <span style={{ color: isLive ? C.green : C.textDim, fontSize:11, fontWeight:700 }}>ON</span>
          </div>
        )}

        {isLocked && (
          <div style={{ display:"inline-flex", alignItems:"center", gap:8,
            background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.3)",
            borderRadius:6, padding:"8px 20px" }}>
            <span style={{ color:C.red, fontSize:11, letterSpacing:2 }}>🔐 LOCKED — GATE CANNOT BE TURNED OFF</span>
          </div>
        )}
      </div>

      {/* What the gate controls */}
      <div className="adm-card">
        <SectionHead>◎ WHAT THE GATE CONTROLS</SectionHead>
        {[
          { label:"Gate OFF", desc:"Everyone can access ProtocolHub regardless of NFT ownership" },
          { label:"Gate ON", desc:"Only NFT holders + whitelisted wallets can enter — everyone else sees the mint panel" },
          { label:"Permanent Lock", desc:"Once locked, the gate can never be turned off — ensures long-term NFT value" },
        ].map((item, i) => (
          <div key={i} style={{ display:"flex", gap:12, padding:"10px 0",
            borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color:C.cyan, fontSize:10, fontWeight:700, width:120, flexShrink:0 }}>{item.label}</span>
            <span style={{ color:C.textDim, fontSize:10, lineHeight:1.5 }}>{item.desc}</span>
          </div>
        ))}
      </div>

      {/* Permanent lock */}
      {!isLocked && (
        <div className="adm-card" style={{ border:"1px solid rgba(255,51,85,0.2)" }}>
          <SectionHead style={{ color:C.red }}>⚑ PERMANENT LOCK</SectionHead>
          <div style={{ color:C.textDim, fontSize:10, lineHeight:1.7, marginBottom:16 }}>
            Once you click lock, the gate will be permanently set to ON and can never be disabled — not even by you.
            This is irreversible. Only do this when you are fully confident the NFT system is working correctly.
          </div>
          <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:6 }}>
            TYPE "LOCK FOREVER" TO CONFIRM
          </div>
          <input className="adm-input" placeholder='Type: LOCK FOREVER'
            value={lockConfirm} onChange={e => setLockConfirm(e.target.value)}
            style={{ marginBottom:10 }} />
          <button className="adm-btn" onClick={lockGate} disabled={locking || lockConfirm !== "LOCK FOREVER"}
            style={{ background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.4)",
              color:C.red, width:"100%", padding:"9px", fontSize:10, letterSpacing:2 }}>
            {locking ? "⟳ LOCKING..." : "🔐 LOCK GATE PERMANENTLY"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── WHITELIST TAB ────────────────────────────────────────────────────────────
// Small inline deny modal for requests table
function DenyModal({ requestId, onDeny }) {
  const [open,   setOpen]   = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return (
    <button className="adm-btn"
      style={{ background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.3)", color:C.red, fontSize:9, marginRight:6 }}
      onClick={() => setOpen(true)}>✕ DENY</button>
  );
  return (
    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
      <input className="adm-input" placeholder="Deny reason..." style={{ padding:"4px 8px", fontSize:9, width:140 }}
        value={reason} onChange={e => setReason(e.target.value)} />
      <button className="adm-btn"
        style={{ background:"rgba(255,51,85,0.12)", border:"1px solid rgba(255,51,85,0.4)", color:C.red, fontSize:9 }}
        onClick={() => { onDeny(requestId, reason); setOpen(false); setReason(""); }}>DENY</button>
      <button className="adm-btn"
        style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textDim, fontSize:9 }}
        onClick={() => setOpen(false)}>✕</button>
    </div>
  );
}

function WhitelistTab({ onToast, role }) {
  const [entries,   setEntries]   = useState([]);
  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [submitting,setSubmitting]= useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [activeView,setActiveView]= useState("entries"); // "entries" | "requests"
  const [wallet,    setWallet]    = useState("");
  const [tier,      setTier]      = useState("bronze");
  const [note,      setNote]      = useState("");
  const [days,      setDays]      = useState("30");
  const [perm,      setPerm]      = useState(false);
  const [reason,    setReason]    = useState("");
  const [actionModal, setActionModal] = useState(null); // { action, wallet, entry }

  const isOwner = role === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wlRes, reqRes] = await Promise.all([
        api("/admin/whitelist"),
        api("/admin/whitelist/requests"),
      ]);
      setEntries(wlRes.whitelist || []);
      setRequests(reqRes.requests || []);
    } catch { onToast("Failed to load whitelist", "error"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  // Auto-switch owner to requests view when there are pending items
  useEffect(() => {
    if (isOwner && pendingCount > 0 && activeView === "entries") {
      setActiveView("requests");
    }
  }, [pendingCount, isOwner]);

  async function submitRequest(action, targetWallet, extra = {}) {
    if (!reason.trim()) { onToast("Reason required", "error"); return; }
    setSubmitting(true);
    const res = await api("/admin/whitelist/request", {
      method:"POST", body: JSON.stringify({ action, wallet: targetWallet, reason: reason.trim(), ...extra }),
    });
    if (res.success) {
      onToast(res.approved
        ? action === "add" ? "Wallet added" : action === "revoke" ? "Access revoked" : "Access restored"
        : "Request submitted — awaiting owner approval", "success");
      setActionModal(null); setReason(""); setWallet(""); setNote(""); setDays("30"); setPerm(false); setShowForm(false);
      load();
    } else onToast(res.error || "Failed", "error");
    setSubmitting(false);
  }

  async function approveRequest(id) {
    const res = await api("/admin/whitelist/approve", { method:"POST", body: JSON.stringify({ id }) });
    if (res.success) { onToast("Request approved", "success"); load(); }
    else onToast(res.error || "Failed", "error");
  }

  async function denyRequest(id, denyReason) {
    const res = await api("/admin/whitelist/deny", { method:"POST", body: JSON.stringify({ id, denyReason }) });
    if (res.success) { onToast("Request denied", "success"); load(); }
    else onToast(res.error || "Failed", "error");
  }

  const tierColor = t => t === "gold" ? C.yellow : t === "silver" ? "#aaccff" : C.orange;
  const actionLabel = a => a === "add" ? "ADD TO WHITELIST" : a === "revoke" ? "REVOKE ACCESS" : "RESTORE ACCESS";
  const actionColor = a => a === "revoke" ? C.red : a === "restore" ? C.green : C.cyan;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", gap:8 }}>
          {["entries","requests"].map(v => (
            <button key={v} className="adm-btn" onClick={() => setActiveView(v)}
              style={{ fontSize:9, letterSpacing:2, padding:"5px 12px",
                background: activeView === v ? C.cyanFaint : "transparent",
                border:`1px solid ${activeView === v ? C.borderHi : C.border}`,
                color: activeView === v ? C.cyan : C.textDim }}>
              {v === "entries" ? `WHITELIST (${entries.filter(e=>!e.revoked).length})` : `REQUESTS (${pendingCount} PENDING)`}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="adm-btn"
            style={{ border:`1px solid ${C.border}`, color:C.textDim, background:"transparent" }}
            onClick={load}>↺</button>
          <button className="adm-btn"
            style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`, color:C.cyan }}
            onClick={() => setShowForm(!showForm)}>
            {showForm ? "✕ CANCEL" : "+ ADD WALLET"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="adm-card" style={{ border:`1px solid ${C.borderHi}`, animation:"adm-fade 0.2s ease" }}>
          <SectionHead>★ {isOwner ? "ADD TO WHITELIST" : "REQUEST: ADD TO WHITELIST"}</SectionHead>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div>
              <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:5 }}>WALLET ADDRESS</div>
              <input className="adm-input" placeholder="Solana wallet address (base58)..."
                value={wallet} onChange={e => setWallet(e.target.value)} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:5 }}>TIER</div>
                <select className="adm-input" value={tier} onChange={e => setTier(e.target.value)}
                  style={{ cursor:"pointer" }}>
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:5 }}>DURATION (DAYS)</div>
                <input className="adm-input" type="number" value={days} disabled={perm}
                  onChange={e => setDays(e.target.value)} style={{ opacity: perm ? 0.4 : 1 }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:5 }}>NOTE (OPTIONAL)</div>
              <input className="adm-input" placeholder="e.g. Lead Designer, Beta Tester..."
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div onClick={() => setPerm(!perm)}
                style={{ width:36, height:18, borderRadius:9, cursor:"pointer",
                  background: perm ? C.yellow : "rgba(255,255,255,0.1)",
                  border: `1px solid ${perm ? C.yellow : C.border}`,
                  position:"relative", transition:"all 0.2s" }}>
                <div style={{ position:"absolute", top:1,
                  left: perm ? "calc(100% - 17px)" : 1,
                  width:14, height:14, borderRadius:"50%",
                  background: perm ? "#000" : C.textDim, transition:"left 0.2s" }} />
              </div>
              <span style={{ color: perm ? C.yellow : C.textDim, fontSize:10 }}>
                {perm ? "PERMANENT ACCESS — never expires" : "Expires after set days"}
              </span>
            </div>
            <div>
              <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:5 }}>
                REASON {!isOwner && <span style={{color:C.orange}}>(REQUIRED — OWNER WILL SEE THIS)</span>}
              </div>
              <textarea className="adm-input" rows={2} style={{ resize:"none" }}
                placeholder={isOwner ? "Reason for adding..." : "Explain why this wallet should be added..."}
                value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <button className="adm-btn"
              onClick={() => submitRequest("add", wallet.trim(), { tier, note, days: parseInt(days), permanent: perm })}
              disabled={submitting || !wallet.trim() || !reason.trim()}
              style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`,
                color:C.cyan, padding:"9px", fontSize:10, letterSpacing:2 }}>
              {submitting ? "⟳ SUBMITTING..." : isOwner ? "★ ADD TO WHITELIST" : "★ SUBMIT REQUEST"}
            </button>
            {!isOwner && (
              <div style={{ color:C.textFaint, fontSize:9, textAlign:"center", letterSpacing:1 }}>
                ↑ This will be sent to the owner for approval
              </div>
            )}
          </div>
        </div>
      )}




      {/* Action modal (revoke / restore) */}
      {actionModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(8px)" }}>
          <div style={{ background:"#000", border:`1px solid ${actionModal.action==="revoke" ? "rgba(255,51,85,0.3)" : "rgba(0,255,136,0.3)"}`,
            borderRadius:8, width:440, maxWidth:"90vw", padding:24, animation:"adm-fade 0.2s ease" }}>
            <div style={{ color: actionColor(actionModal.action), fontSize:12, fontWeight:700, letterSpacing:2, marginBottom:8 }}>
              {actionModal.action === "revoke" ? "⚑ REVOKE WHITELIST ACCESS" : "✓ RESTORE WHITELIST ACCESS"}
            </div>
            <div style={{ color:C.textDim, fontSize:10, fontFamily:"monospace", marginBottom:4 }}>{actionModal.wallet}</div>
            {!isOwner && (
              <div style={{ color:C.orange, fontSize:9, letterSpacing:1, marginBottom:12 }}>
                ↑ This will be sent to the owner for approval
              </div>
            )}
            <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, margin:"12px 0 5px" }}>
              REASON {!isOwner && <span style={{color:C.orange}}>(OWNER WILL SEE THIS)</span>}
            </div>
            <textarea className="adm-input" rows={3} style={{ resize:"none", marginBottom:12 }}
              placeholder={`Reason for ${actionModal.action}...`}
              value={reason} onChange={e => setReason(e.target.value)} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button className="adm-btn"
                style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textDim }}
                onClick={() => { setActionModal(null); setReason(""); }}>CANCEL</button>
              <button className="adm-btn"
                style={{ background: actionModal.action==="revoke" ? "rgba(255,51,85,0.12)" : "rgba(0,255,136,0.12)",
                  border: `1px solid ${actionColor(actionModal.action)}44`, color: actionColor(actionModal.action) }}
                onClick={() => submitRequest(actionModal.action, actionModal.wallet)} disabled={submitting || !reason.trim()}>
                {submitting ? "⟳ SUBMITTING..." : isOwner ? actionLabel(actionModal.action) : "SUBMIT REQUEST"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requests view — owner sees pending queue */}
      {activeView === "requests" && (
        <div className="adm-card" style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {["ACTION","WALLET","REASON","BY","STATUS", isOwner ? "APPROVE/DENY" : ""].filter(Boolean).map(h => (
                  <th key={h} style={{ padding:"10px 14px", color:C.textFaint, fontSize:8, letterSpacing:2, textAlign:"left", fontWeight:400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:30, textAlign:"center", color:C.textFaint, fontSize:10 }}>
                  No requests yet
                </td></tr>
              ) : requests.map((r, i) => (
                <tr key={i} className="adm-row" style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:9, fontWeight:700, letterSpacing:1, color: actionColor(r.action) }}>
                      {r.action?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", color:C.textDim, fontSize:10 }}>
                    {r.wallet?.slice(0,6)}...{r.wallet?.slice(-4)}
                  </td>
                  <td style={{ padding:"10px 14px", color:C.textDim, fontSize:10, maxWidth:200 }}>
                    <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.reason}</div>
                    {r.deny_reason && <div style={{ color:C.red, fontSize:9, marginTop:2 }}>Denied: {r.deny_reason}</div>}
                  </td>
                  <td style={{ padding:"10px 14px", color:C.textFaint, fontSize:9 }}>{r.requested_by}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:9, fontWeight:700, letterSpacing:1, padding:"2px 8px", borderRadius:3,
                      color: r.status==="approved" ? C.green : r.status==="denied" ? C.red : C.yellow,
                      background: r.status==="approved" ? "rgba(0,255,136,0.1)" : r.status==="denied" ? "rgba(255,51,85,0.1)" : "rgba(255,204,0,0.1)",
                      border:`1px solid ${r.status==="approved" ? "rgba(0,255,136,0.3)" : r.status==="denied" ? "rgba(255,51,85,0.3)" : "rgba(255,204,0,0.3)"}` }}>
                      {r.status?.toUpperCase()}
                    </span>
                  </td>
                  {isOwner && r.status === "pending" && (
                    <td style={{ padding:"10px 14px" }}>
                      <DenyModal requestId={r.id} onDeny={denyRequest} />
                      <button className="adm-btn"
                        style={{ background:"rgba(0,255,136,0.08)", border:"1px solid rgba(0,255,136,0.3)", color:C.green, fontSize:9 }}
                        onClick={() => approveRequest(r.id)}>✓ APPROVE</button>
                    </td>
                  )}
                  {isOwner && r.status !== "pending" && <td />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Entries view */}
      {activeView === "entries" && (
        <div className="adm-card" style={{ padding:0, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {["WALLET","TIER","NOTE","EXPIRES","STATUS","ACTIONS"].map(h => (
                  <th key={h} style={{ padding:"10px 14px", color:C.textFaint,
                    fontSize:8, letterSpacing:2, textAlign:"left", fontWeight:400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding:30, textAlign:"center" }}><Loader /></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:30, textAlign:"center", color:C.textFaint, fontSize:10 }}>
                  No whitelisted wallets — add staff, testers, or founders above
                </td></tr>
              ) : entries.map((e, i) => (
                <tr key={i} className="adm-row" style={{ borderBottom:`1px solid ${C.border}` }}>
                  <td style={{ padding:"10px 14px", fontFamily:"monospace", color:C.textDim, fontSize:10 }}>
                    {e.wallet?.slice(0,8)}...{e.wallet?.slice(-6)}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ color:tierColor(e.tier), fontSize:10, fontWeight:700 }}>
                      {e.tier?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px", color:C.textFaint, fontSize:10 }}>{e.note || "—"}</td>
                  <td style={{ padding:"10px 14px", color: e.is_expired ? C.red : C.textDim, fontSize:10 }}>
                    {e.permanent ? (
                      <span style={{ color:C.yellow, fontSize:9 }}>★ PERMANENT</span>
                    ) : e.expires_at ? new Date(e.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontSize:9, fontWeight:700, letterSpacing:1, padding:"2px 8px", borderRadius:3,
                      color:      e.revoked ? C.red   : e.is_expired ? C.yellow : C.green,
                      background: e.revoked ? "rgba(255,51,85,0.1)" : e.is_expired ? "rgba(255,204,0,0.1)" : "rgba(0,255,136,0.1)",
                      border:`1px solid ${e.revoked ? "rgba(255,51,85,0.3)" : e.is_expired ? "rgba(255,204,0,0.3)" : "rgba(0,255,136,0.3)"}` }}>
                      {e.revoked ? "REVOKED" : e.is_expired ? "EXPIRED" : "ACTIVE"}
                    </span>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    {e.revoked ? (
                      <button className="adm-btn"
                        style={{ background:"rgba(0,255,136,0.08)", border:"1px solid rgba(0,255,136,0.3)", color:C.green, fontSize:9 }}
                        onClick={() => { setActionModal({ action:"restore", wallet:e.wallet }); setReason(""); }}>
                        {isOwner ? "RESTORE" : "REQUEST RESTORE"}
                      </button>
                    ) : !e.is_founder ? (
                      <button className="adm-btn"
                        style={{ background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.3)", color:C.red, fontSize:9 }}
                        onClick={() => { setActionModal({ action:"revoke", wallet:e.wallet }); setReason(""); }}>
                        {isOwner ? "REVOKE" : "REQUEST REVOKE"}
                      </button>
                    ) : (
                      <span style={{ color:C.yellow, fontSize:9 }}>★ FOUNDER</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

/* ─────────────────────────────────────────────────────────────────────────
   SYNC TAB
   Admin: see out-of-sync NFTs → request sync → wait for owner approval
   Owner: see pending request → approve/deny → send SOL → confirm payment
   ───────────────────────────────────────────────────────────────────────── */
function SyncTab({ role, onToast }) {
  const isOwner = role === "owner";

  const [status,      setStatus]      = useState(null);   // /api/sync/status
  const [requests,    setRequests]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [requesting,  setRequesting]  = useState(false);
  const [approving,   setApproving]   = useState(false);
  const [payTx,       setPayTx]       = useState("");
  const [confirming,  setConfirming]  = useState(false);
  const [pollId,      setPollId]      = useState(null);

  async function load() {
    try {
      const [s, r] = await Promise.all([
        api("/sync/status"),
        api("/sync/requests"),
      ]);
      setStatus(s);
      setRequests(r.requests || []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // Poll active request every 5s when uploading
  const activeRequest = requests.find(r => !["complete","failed"].includes(r.status));
  useEffect(() => {
    if (activeRequest?.status === "uploading") {
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }
  }, [activeRequest?.status]);

  async function requestSync() {
    setRequesting(true);
    try {
      const r = await api("/sync/request", "POST", {});
      if (r.success) {
        onToast({ msg: r.message || `Sync request submitted — ${r.nftCount} NFTs, ${r.solCost} SOL needed`, type:"info" });
        load();
      } else {
        onToast({ msg: r.error || "Failed", type:"error" });
      }
    } catch { onToast({ msg:"Network error", type:"error" }); }
    setRequesting(false);
  }

  async function approveRequest(id) {
    setApproving(true);
    try {
      const r = await api("/sync/approve", "POST", { requestId: id });
      if (r.success) { onToast({ msg:"Request approved — send SOL to proceed", type:"success" }); load(); }
      else onToast({ msg: r.error || "Failed", type:"error" });
    } catch { onToast({ msg:"Network error", type:"error" }); }
    setApproving(false);
  }

  async function denyRequest(id) {
    try {
      await api("/sync/deny", "POST", { requestId: id, reason: "Denied by owner" });
      onToast({ msg:"Request denied", type:"info" });
      load();
    } catch {}
  }

  async function confirmPayment(id) {
    if (!payTx.trim()) return onToast({ msg:"Enter the transaction signature", type:"error" });
    setConfirming(true);
    try {
      const r = await api("/sync/confirm-payment", "POST", { requestId: id, txSignature: payTx.trim() });
      if (r.success) {
        onToast({ msg:"Payment confirmed — uploading to chain...", type:"success" });
        setPayTx("");
        load();
      } else {
        onToast({ msg: r.error || "Payment verification failed", type:"error" });
      }
    } catch { onToast({ msg:"Network error", type:"error" }); }
    setConfirming(false);
  }

  const statusColor = s => ({
    pending:"#ffaa00", approved:"#00b4ff", paying:"#9966ff",
    uploading:"#00b4ff", complete:"#00ff88", failed:"#ff3355",
  }[s] || "#aaa");

  const statusIcon = s => ({
    pending:"⏳", approved:"✓", paying:"◎",
    uploading:"↻", complete:"✓✓", failed:"⚑",
  }[s] || "?");

  if (loading) return <div style={{ display:"flex", justifyContent:"center", paddingTop:60 }}><Loader /></div>;

  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      <SectionHead>⟳ ON-CHAIN METADATA SYNC</SectionHead>

      {/* ── Stats bar ── */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <BigStat
          label="OUT OF SYNC"
          value={status?.outOfSyncCount ?? 0}
          color={status?.outOfSyncCount > 0 ? C.orange : C.green}
          sub="NFTs need update"
        />
        <BigStat
          label="SOL COST"
          value={status?.solCost ?? "0.000000"}
          color={C.cyan}
          sub="≈5000 lamports/NFT"
        />
        {status?.lastSync && (
          <BigStat
            label="LAST SYNC"
            value={status.lastSync.synced_count}
            color={C.green}
            sub={`NFTs · ${new Date(status.lastSync.created_at).toLocaleDateString()}`}
          />
        )}
      </div>

      {/* ── Update authority address ── */}
      {isOwner && status?.updateAuthority && (
        <div style={{
          padding:"12px 16px", border:`1px solid ${C.borderHi}`, borderRadius:5,
          background:C.cyanFaint, marginBottom:16, fontFamily:FM,
        }}>
          <div style={{ fontSize:8, color:C.textFaint, letterSpacing:2, marginBottom:4 }}>
            UPDATE AUTHORITY ADDRESS (send SOL here)
          </div>
          <div style={{ fontSize:10, color:C.cyan, wordBreak:"break-all" }}>
            {status.updateAuthority}
          </div>
        </div>
      )}

      {/* ── Active request ── */}
      {activeRequest && (
        <div style={{
          padding:"16px 18px", border:`1px solid ${statusColor(activeRequest.status)}44`,
          borderRadius:6, background:`${statusColor(activeRequest.status)}08`,
          marginBottom:20,
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18 }}>{statusIcon(activeRequest.status)}</span>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:C.text, letterSpacing:2 }}>
                  REQUEST #{activeRequest.id}
                </div>
                <div style={{ fontSize:8, color:C.textFaint, marginTop:2 }}>
                  {activeRequest.nft_count} NFTs · {(activeRequest.sol_cost_lamports/1e9).toFixed(6)} SOL
                  · requested by {activeRequest.requested_by}
                </div>
              </div>
            </div>
            <Pill
              label={activeRequest.status.toUpperCase()}
              color={statusColor(activeRequest.status)}
            />
          </div>

          {/* Progress bar when uploading */}
          {activeRequest.status === "uploading" && (
            <div style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:8, color:C.textFaint, letterSpacing:2 }}>UPLOAD PROGRESS</span>
                <span style={{ fontSize:8, color:C.cyan }}>
                  {activeRequest.synced_count} / {activeRequest.nft_count}
                  {activeRequest.failed_count > 0 && <span style={{ color:C.red }}> · {activeRequest.failed_count} failed</span>}
                </span>
              </div>
              <div style={{ height:6, background:"rgba(0,180,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:3,
                  width:`${activeRequest.nft_count > 0 ? (activeRequest.synced_count/activeRequest.nft_count)*100 : 0}%`,
                  background:`linear-gradient(90deg, ${C.cyan}88, ${C.cyan})`,
                  transition:"width 1s ease",
                  animation:"adm-pulse 2s ease-in-out infinite",
                }} />
              </div>
            </div>
          )}

          {/* Owner actions */}
          {isOwner && activeRequest.status === "pending" && (
            <div style={{ display:"flex", gap:8 }}>
              <button className="adm-btn"
                style={{ background:"rgba(0,255,136,0.1)", border:"1px solid rgba(0,255,136,0.3)", color:C.green, padding:"8px 20px" }}
                onClick={() => approveRequest(activeRequest.id)}
                disabled={approving}>
                {approving ? "..." : "✓ APPROVE"}
              </button>
              <button className="adm-btn"
                style={{ background:"rgba(255,51,85,0.08)", border:"1px solid rgba(255,51,85,0.25)", color:C.red, padding:"8px 20px" }}
                onClick={() => denyRequest(activeRequest.id)}>
                ✕ DENY
              </button>
            </div>
          )}

          {/* Owner payment confirmation */}
          {isOwner && activeRequest.status === "approved" && (
            <div>
              <div style={{ fontSize:9, color:C.text, marginBottom:10, lineHeight:1.7 }}>
                Send exactly <span style={{ color:C.cyan, fontWeight:700 }}>
                  {(activeRequest.sol_cost_lamports/1e9).toFixed(6)} SOL
                </span> to the update authority address above, then paste the transaction signature below.
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  value={payTx}
                  onChange={e => setPayTx(e.target.value)}
                  placeholder="Transaction signature..."
                  style={{
                    flex:1, background:"rgba(0,0,0,0.3)", border:`1px solid ${C.border}`,
                    borderRadius:4, padding:"8px 12px", color:C.text,
                    fontFamily:FM, fontSize:9, outline:"none",
                  }}
                />
                <button className="adm-btn"
                  style={{ background:C.cyanFaint, border:`1px solid ${C.borderHi}`, color:C.cyan, padding:"8px 16px" }}
                  onClick={() => confirmPayment(activeRequest.id)}
                  disabled={confirming}>
                  {confirming ? "↻ VERIFYING..." : "✓ CONFIRM"}
                </button>
              </div>
            </div>
          )}

          {/* Admin waiting states */}
          {!isOwner && activeRequest.status === "pending" && (
            <div style={{ fontSize:9, color:C.orange, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ animation:"adm-pulse 1.5s ease-in-out infinite" }}>⏳</span>
              Waiting for owner approval...
            </div>
          )}
          {!isOwner && activeRequest.status === "approved" && (
            <div style={{ fontSize:9, color:C.cyan, display:"flex", alignItems:"center", gap:6 }}>
              <span>◎</span> Owner approved — waiting for SOL payment...
            </div>
          )}
          {!isOwner && activeRequest.status === "uploading" && (
            <div style={{ fontSize:9, color:C.cyan, display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ animation:"adm-spin 1s linear infinite", display:"inline-block" }}>↻</span>
              Uploading to chain...
            </div>
          )}
        </div>
      )}

      {/* ── Request sync button (admin / owner with no active request) ── */}
      {!activeRequest && (
        <div style={{ marginBottom:24 }}>
          {status?.outOfSyncCount === 0 ? (
            <div style={{
              padding:"16px 20px", border:`1px solid rgba(0,255,136,0.2)`,
              borderRadius:6, background:"rgba(0,255,136,0.04)",
              display:"flex", alignItems:"center", gap:10,
            }}>
              <span style={{ color:C.green, fontSize:16 }}>✓</span>
              <div>
                <div style={{ fontSize:10, color:C.green, fontWeight:700 }}>ALL NFTs IN SYNC</div>
                <div style={{ fontSize:8, color:C.textFaint, marginTop:2 }}>On-chain metadata matches database</div>
              </div>
            </div>
          ) : (
            <button
              onClick={requestSync}
              disabled={requesting}
              style={{
                fontFamily:FM, fontSize:10, letterSpacing:3, fontWeight:700,
                color:requesting ? C.textFaint : "#000",
                background:requesting ? "rgba(0,180,255,0.08)" : C.cyan,
                border:`1px solid ${requesting ? C.border : C.cyan}`,
                borderRadius:4, padding:"12px 28px", cursor:requesting ? "not-allowed":"pointer",
                boxShadow:requesting ? "none" : "0 0 20px rgba(0,180,255,0.25)",
                display:"flex", alignItems:"center", gap:8,
              }}
            >
              {requesting
                ? <> SUBMITTING...</>
                : isOwner
                  ? `⟳ SYNC ${status?.outOfSyncCount} NFTs — ${status?.solCost} SOL`
                  : `⟳ REQUEST SYNC — ${status?.outOfSyncCount} NFTs`}
            </button>
          )}
          {!isOwner && status?.outOfSyncCount > 0 && (
            <div style={{ fontSize:8, color:C.textFaint, marginTop:8 }}>
              Submits request to owner for approval — owner sends SOL and triggers upload
            </div>
          )}
        </div>
      )}

      {/* ── Out-of-sync NFT preview ── */}
      {status?.outOfSync?.length > 0 && (
        <div>
          <SectionHead>PENDING UPDATES</SectionHead>
          <div style={{ border:`1px solid ${C.border}`, borderRadius:5, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:FM }}>
              <thead>
                <tr style={{ background:"rgba(0,180,255,0.04)", borderBottom:`1px solid ${C.border}` }}>
                  {["WALLET","CURRENT PTS","ON-CHAIN PTS","LAST SYNCED"].map(h => (
                    <th key={h} style={{ padding:"8px 12px", fontSize:7, color:C.textFaint, letterSpacing:2, textAlign:"left", fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.outOfSync.map((n, i) => (
                  <tr key={n.wallet} style={{ borderBottom:`1px solid ${C.border}88`, background: i%2===0?"transparent":"rgba(0,180,255,0.01)" }}>
                    <td style={{ padding:"8px 12px", color:C.textDim, fontSize:9 }}>
                      {n.wallet?.slice(0,8)}...{n.wallet?.slice(-6)}
                    </td>
                    <td style={{ padding:"8px 12px", fontWeight:700, color:C.cyan, fontSize:10 }}>
                      {(n.points_balance||0).toLocaleString()}
                    </td>
                    <td style={{ padding:"8px 12px", color:C.textFaint, fontSize:10 }}>
                      {n.points_synced_balance === -1 ? "never" : (n.points_synced_balance||0).toLocaleString()}
                    </td>
                    <td style={{ padding:"8px 12px", color:C.textFaint, fontSize:9 }}>
                      {n.points_synced_at ? new Date(n.points_synced_at*1000).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {status.outOfSyncCount > 100 && (
              <div style={{ padding:"8px 12px", fontSize:8, color:C.textFaint, borderTop:`1px solid ${C.border}` }}>
                Showing 100 of {status.outOfSyncCount} — all will be synced
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sync history ── */}
      {requests.filter(r => ["complete","failed"].includes(r.status)).length > 0 && (
        <div style={{ marginTop:24 }}>
          <SectionHead>SYNC HISTORY</SectionHead>
          {requests.filter(r => ["complete","failed"].includes(r.status)).map(r => (
            <div key={r.id} style={{
              display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
              border:`1px solid ${C.border}`, borderRadius:4, marginBottom:6,
              background:"rgba(0,0,0,0.15)",
            }}>
              <span style={{ fontSize:14, color:statusColor(r.status) }}>{statusIcon(r.status)}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:C.text }}>
                  #{r.id} · {r.synced_count}/{r.nft_count} NFTs synced
                  {r.failed_count > 0 && <span style={{ color:C.red }}> · {r.failed_count} failed</span>}
                </div>
                <div style={{ fontSize:8, color:C.textFaint, marginTop:2 }}>
                  {new Date(r.created_at).toLocaleString()} · by {r.requested_by}
                </div>
              </div>
              <Pill label={r.status.toUpperCase()} color={statusColor(r.status)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id:"overview",   icon:"◈", label:"OVERVIEW",   roles:["owner","admin","moderator"] },
  { id:"holders",    icon:"⬡", label:"HOLDERS",    roles:["owner","admin","moderator"] },
  { id:"whitelist",  icon:"★", label:"WHITELIST",  roles:["owner","admin"] },
  { id:"appeals",    icon:"✦", label:"APPEALS",    roles:["owner","admin","moderator"] },
  { id:"features",   icon:"⚙", label:"FEATURES",   roles:["owner","admin"] },
  { id:"revenue",    icon:"◎", label:"REVENUE",    roles:["owner"] },
  { id:"gate",       icon:"⬤", label:"GATE",       roles:["owner"] },
  { id:"threats",    icon:"⚑", label:"THREATS",    roles:["owner","admin"] },
  { id:"api",        icon:"↻", label:"API HEALTH", roles:["owner","admin"] },
  { id:"audit",      icon:"▸", label:"AUDIT LOG",  roles:["owner","admin"] },
  { id:"sync",       icon:"⟳", label:"SYNC",        roles:["owner","admin"] },
];

function AdminDashboardInner() {
  const [authed,   setAuthed]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [role,     setRole]     = useState("admin");
  const [tab,      setTab]      = useState("overview");
  const [overview, setOverview] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [live,     setLive]     = useState(true);

  useEffect(() => { injectStyles(); }, []);

  useEffect(() => {
    api("/auth/verify")
      .then(r => {
        if (r.authenticated) {
          setAuthed(true);
          setRole(r.role || "admin");
          loadOverview();
        } else {
          // Explicitly set false — never assume logged in
          setAuthed(false);
        }
      })
      .catch(() => {
        // Network error or 401 — treat as logged out
        setAuthed(false);
      })
      .finally(() => setChecking(false));
  }, []);

  // Pulse live indicator every 5s
  useEffect(() => {
    const t = setInterval(() => setLive(l => !l), 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-refresh overview every 30s to keep badges (pending requests, appeals) live
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => loadOverview(), 30_000);
    return () => clearInterval(t);
  }, [authed]);

  async function loadOverview() {
    try {
      const data = await api("/admin/overview");
      setOverview(data);
    } catch {}
  }

  async function logout() {
    await api("/auth/logout", { method:"POST" }).catch(() => {});
    // Clear all local state then force full page reload
    // so no stale auth state can persist in memory
    setAuthed(false);
    setOverview(null);
    setRole("admin");
    setTab("overview");
    // Hard reload — forces cookie re-check from scratch on next visit
    window.location.href = "/admin";
  }

  const showToast = (msg, type) => setToast({ msg, type });

  if (checking) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:C.bg, color:C.cyanDim, fontFamily:FM, fontSize:10, letterSpacing:3 }}>
      <div style={{ width:12, height:12, border:`1px solid ${C.cyanFaint}`,
        borderTop:`1px solid ${C.cyan}`, borderRadius:"50%", animation:"adm-spin 0.8s linear infinite",
        marginRight:12 }} />
      VERIFYING SESSION...
    </div>
  );

  if (!authed) return <LoginPage onLogin={(r) => { setAuthed(true); setRole(r || "admin"); loadOverview(); }} />;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:FM, display:"flex", flexDirection:"column" }}>

      {/* Top bar */}
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"10px 20px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:"rgba(0,180,255,0.01)", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontFamily:FH, fontSize:16, letterSpacing:5, color:C.cyan,
            textShadow:`0 0 20px ${C.cyan}33` }}>PROTOCOL HUB</span>
          <span style={{ color:C.textFaint, fontSize:8, letterSpacing:4 }}>ADMIN CONSOLE</span>
          {/* Live pulse */}
          <div style={{ display:"flex", alignItems:"center", gap:5, marginLeft:8 }}>
            <Dot color={C.green} pulse />
            <span style={{ fontSize:8, color:C.textFaint, letterSpacing:1 }}>LIVE</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {overview && (
            <span style={{ fontSize:9, color:C.textFaint }}>
              {overview.totalMinted?.toLocaleString()} minted
            </span>
          )}
          <button className="adm-btn" onClick={logout}
            style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.textDim }}>
            LOGOUT
          </button>
        </div>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Sidebar */}
        <div style={{ width:180, borderRight:`1px solid ${C.border}`, padding:12,
          display:"flex", flexDirection:"column", gap:3, flexShrink:0, overflowY:"auto" }}>

          {TABS.filter(t => !t.roles || t.roles.includes(role)).map(t => (
            <div key={t.id}
              className={`adm-nav${tab === t.id ? " active" : ""}`}
              style={{ color: tab === t.id ? C.cyan : C.textDim }}
              onClick={() => {
                setTab(t.id);
                if (t.id === "overview") loadOverview();
              }}>
              <span style={{ fontSize:12, opacity:0.7 }}>{t.icon}</span>
              <span>{t.label}</span>
              {/* Badge for appeals */}
              {t.id === "whitelist" && overview?.pendingWhitelistRequests > 0 && (
                <span style={{ marginLeft:5, background:C.orange, color:"#000",
                  borderRadius:"50%", width:16, height:16, fontSize:8, fontWeight:700,
                  display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                  {overview.pendingWhitelistRequests}
                </span>
              )}
              {t.id === "appeals" && overview?.pendingAppeals > 0 && (
                <span style={{ marginLeft:"auto", background:C.orange, color:"#000",
                  borderRadius:8, padding:"1px 6px", fontSize:7, fontWeight:700 }}>
                  {overview.pendingAppeals}
                </span>
              )}
              {/* Badge for threats */}
              {t.id === "threats" && (
                <span style={{ marginLeft:"auto", background:C.red, color:"#fff",
                  borderRadius:8, padding:"1px 6px", fontSize:7, fontWeight:700 }}>!</span>
              )}
            </div>
          ))}

          {/* Mini stats sidebar */}
          {overview && (
            <div style={{ marginTop:"auto", paddingTop:14, borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:7, color:C.textFaint, letterSpacing:2, marginBottom:8 }}>MINT PROGRESS</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:9, color:C.textDim }}>Minted</span>
                <span style={{ fontSize:9, color:C.cyan, fontWeight:700 }}>{overview.totalMinted?.toLocaleString()}</span>
              </div>
              <div style={{ height:3, background:"rgba(0,180,255,0.06)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%",
                  width:`${Math.min(100,((overview.totalMinted||0)/10000)*100)}%`,
                  background:`linear-gradient(90deg,${C.cyanFaint},${C.cyan})`,
                  borderRadius:2, transition:"width 1.2s ease" }} />
              </div>
              <div style={{ color:C.textFaint, fontSize:8, marginTop:4 }}>
                {(10000 - (overview.totalMinted||0)).toLocaleString()} remaining
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:20, overflowY:"auto", maxHeight:"calc(100vh - 53px)" }}>
          {tab === "overview"  && <OverviewTab   data={overview} role={role} onSwitchTab={setTab} />}
          {tab === "holders"   && <HoldersTab    onToast={showToast} />}
          {tab === "whitelist" && <WhitelistTab  onToast={showToast} role={role} />}
          {tab === "appeals"   && <AppealsTab    onToast={showToast} />}
          {tab === "revenue"   && <RevenuePanel  overview={overview} />}
          {tab === "gate"      && <GateTab       onToast={showToast} />}
          {tab === "threats"   && <ThreatPanel   onToast={showToast} />}
          {tab === "api"       && <ApiHealthPanel />}
          {tab === "audit"     && <AuditLogPanel />}
          {tab === "sync"      && <SyncTab role={role} onToast={showToast} />}
          {tab === "features"   && <FeaturesTab role={role} onToast={showToast} />}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}


// ─── FEATURES TAB ─────────────────────────────────────────────────────────────
const FEATURE_META = {
  capital_flow:        { label: "Capital Flow & Rotation", desc: "The Broker's Tab — sector rotation, smart money, bridge inflows", panel: "Network" },
  narrative:           { label: "Narrative",               desc: "Dominant market narratives and momentum scores",                  panel: "Explore"  },
  alpha_feed:          { label: "Alpha Feed",              desc: "High-signal market intelligence and unusual activity",           panel: "Explore"  },
  smart_money_explore: { label: "Smart Money",             desc: "Whale wallet convergence signals",                               panel: "Explore"  },
  wallet_intel:        { label: "Wallet Intelligence",     desc: "Full wallet profiling and classification",                       panel: "Protocol" },
  protocol_audit:      { label: "Protocol Audit",          desc: "Contract risk analysis and rug pattern scoring",                 panel: "Protocol" },
  hub_ai:              { label: "HUB AI",                  desc: "Twice-daily AI intelligence briefs",                            panel: "HUB AI"   },
};

const STATUS_COLOR = { coming_soon: "#ff3355", pending_unlock: "#ffaa00", unlocked: "#00ff88" };
const STATUS_LABEL = { coming_soon: "COMING SOON", pending_unlock: "PENDING APPROVAL", unlocked: "LIVE" };

function FeaturesTab({ role, onToast }) {
  const [flags,     setFlags]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [acting,    setActing]    = useState(null);
  const [genSlot,   setGenSlot]   = useState("morning");
  const [genLoading,setGenLoading]= useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/admin/features");
      setFlags(d.flags || []);
    } catch { onToast("Failed to load features", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function requestUnlock(key) {
    setActing(key + "_req");
    try {
      await api("/admin/features/request", { method: "POST", body: JSON.stringify({ key }) });
      onToast("Unlock request sent to owner", "success");
      load();
    } catch (e) { onToast(e.message, "error"); }
    finally { setActing(null); }
  }

  async function approve(key) {
    setActing(key + "_approve");
    try {
      await api("/admin/features/approve", { method: "POST", body: JSON.stringify({ key }) });
      onToast(`${key} is now LIVE`, "success");
      load();
    } catch (e) { onToast(e.message, "error"); }
    finally { setActing(null); }
  }

  async function deny(key) {
    setActing(key + "_deny");
    try {
      await api("/admin/features/deny", { method: "POST", body: JSON.stringify({ key }) });
      onToast("Request denied", "success");
      load();
    } catch (e) { onToast(e.message, "error"); }
    finally { setActing(null); }
  }

  async function generateSignal() {
    setGenLoading(true);
    try {
      const r = await api("/admin/hub-ai/generate", { method: "POST", body: JSON.stringify({ slot: genSlot }) });
      if (r.success) {
        onToast(`${genSlot} brief generated successfully`, "success");
      } else {
        onToast(r.error || "Generation failed", "error");
      }
    } catch (e) {
      onToast(e.message || "Generation failed — check GROQ_API_KEY in secrets", "error");
    }
    finally { setGenLoading(false); }
  }

  if (loading) return <Loader label="LOADING FEATURES..." />;

  const pending = flags.filter(f => f.status === "pending_unlock");

  return (
    <div>
      <SectionHead>⚙ FEATURE FLAGS</SectionHead>

      {/* Pending banner */}
      {pending.length > 0 && (
        <div style={{ margin: "0 0 16px", padding: "10px 16px", border: "1px solid #ffaa0044", borderRadius: 6, background: "#ffaa0008", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ fontSize: 9, color: "#ffaa00", letterSpacing: 2, fontFamily: "IBM Plex Mono, monospace" }}>
            {pending.length} FEATURE{pending.length > 1 ? "S" : ""} AWAITING YOUR APPROVAL
          </span>
        </div>
      )}

      {/* Feature cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {flags.map(flag => {
          const meta   = FEATURE_META[flag.key] || { label: flag.key, desc: "", panel: "—" };
          const color  = STATUS_COLOR[flag.status] || C.dim;
          const label  = STATUS_LABEL[flag.status] || flag.status;
          const isPending = flag.status === "pending_unlock";
          const isLocked  = flag.status === "coming_soon";
          const isLive    = flag.status === "unlocked";

          return (
            <div key={flag.key} style={{ padding: "14px 16px", border: `1px solid ${color}22`, borderRadius: 8, background: `${color}06`, display: "flex", alignItems: "flex-start", gap: 12 }}>
              
              {/* Status dot */}
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0, marginTop: 4 }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: "IBM Plex Mono, monospace" }}>{meta.label}</span>
                  <span style={{ fontSize: 7, color: C.dim, border: `1px solid ${C.border}`, borderRadius: 3, padding: "1px 6px", letterSpacing: 1 }}>{meta.panel}</span>
                  <span style={{ fontSize: 7, fontWeight: 700, color, letterSpacing: 2, marginLeft: "auto" }}>{label}</span>
                </div>
                <div style={{ fontSize: 9, color: C.textFaint, fontFamily: "IBM Plex Mono, monospace", marginBottom: 8 }}>{meta.desc}</div>

                {/* Timestamps */}
                {flag.requested_at && (
                  <div style={{ fontSize: 8, color: C.dim, fontFamily: "IBM Plex Mono, monospace", marginBottom: 4 }}>
                    Requested by {flag.requested_by || "admin"} · {new Date(flag.requested_at * 1000).toLocaleString()}
                  </div>
                )}
                {flag.approved_at && (
                  <div style={{ fontSize: 8, color: C.green, fontFamily: "IBM Plex Mono, monospace", marginBottom: 4 }}>
                    Approved by {flag.approved_by || "owner"} · {new Date(flag.approved_at * 1000).toLocaleString()}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* Admin: request unlock */}
                  {role === "admin" && isLocked && (
                    <button
                      onClick={() => requestUnlock(flag.key)}
                      disabled={acting === flag.key + "_req"}
                      style={{ padding: "5px 14px", borderRadius: 4, border: `1px solid ${C.cyan}44`, background: C.cyanFaint, color: C.cyan, fontSize: 8, letterSpacing: 2, cursor: "pointer", fontFamily: "IBM Plex Mono, monospace" }}>
                      {acting === flag.key + "_req" ? "SENDING..." : "REQUEST UNLOCK"}
                    </button>
                  )}
                  {/* Owner: approve */}
                  {role === "owner" && (isLocked || isPending) && (
                    <button
                      onClick={() => approve(flag.key)}
                      disabled={acting === flag.key + "_approve"}
                      style={{ padding: "5px 14px", borderRadius: 4, border: "1px solid #00ff8844", background: "#00ff8808", color: "#00ff88", fontSize: 8, letterSpacing: 2, cursor: "pointer", fontFamily: "IBM Plex Mono, monospace" }}>
                      {acting === flag.key + "_approve" ? "APPROVING..." : "✓ APPROVE — GO LIVE"}
                    </button>
                  )}
                  {/* Owner: deny pending */}
                  {role === "owner" && isPending && (
                    <button
                      onClick={() => deny(flag.key)}
                      disabled={acting === flag.key + "_deny"}
                      style={{ padding: "5px 14px", borderRadius: 4, border: "1px solid #ff335544", background: "#ff335508", color: "#ff3355", fontSize: 8, letterSpacing: 2, cursor: "pointer", fontFamily: "IBM Plex Mono, monospace" }}>
                      {acting === flag.key + "_deny" ? "DENYING..." : "✕ DENY"}
                    </button>
                  )}
                  {/* Owner: lock back */}
                  {role === "owner" && isLive && (
                    <button
                      onClick={() => deny(flag.key)}
                      style={{ padding: "5px 14px", borderRadius: 4, border: "1px solid #ff335522", background: "transparent", color: C.dim, fontSize: 8, letterSpacing: 2, cursor: "pointer", fontFamily: "IBM Plex Mono, monospace" }}>
                      LOCK BACK
                    </button>
                  )}
                  {isLive && (
                    <span style={{ padding: "5px 14px", fontSize: 8, color: "#00ff88", letterSpacing: 2, fontFamily: "IBM Plex Mono, monospace" }}>
                      ● LIVE FOR ALL NFT HOLDERS
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* HUB AI manual trigger */}
      {role === "owner" && (
        <div style={{ marginTop: 24 }}>
          <SectionHead>🤖 HUB AI — MANUAL SIGNAL GENERATION</SectionHead>
          <div style={{ padding: "14px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.panelBg }}>
            <div style={{ fontSize: 9, color: C.textFaint, fontFamily: "IBM Plex Mono, monospace", marginBottom: 12 }}>
              Signals auto-generate at 09:00 UTC (morning) and 18:00 UTC (evening). Use this to generate manually if needed.
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={genSlot}
                onChange={e => setGenSlot(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#0a0f1a", color: C.text, fontFamily: "IBM Plex Mono, monospace", fontSize: 9, letterSpacing: 1 }}>
                <option value="morning">MORNING (09:00 UTC)</option>
                <option value="evening">EVENING (18:00 UTC)</option>
              </select>
              <button
                onClick={generateSignal}
                disabled={genLoading}
                style={{ padding: "6px 20px", borderRadius: 4, border: `1px solid ${C.cyan}44`, background: C.cyanFaint, color: C.cyan, fontSize: 9, letterSpacing: 2, cursor: genLoading ? "not-allowed" : "pointer", fontFamily: "IBM Plex Mono, monospace", opacity: genLoading ? 0.6 : 1 }}>
                {genLoading ? "⟳ GENERATING..." : "⟳ GENERATE NOW"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() { return <ErrorBoundary><AdminDashboardInner /></ErrorBoundary>; }
