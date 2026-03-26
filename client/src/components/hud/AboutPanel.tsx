// client/src/components/panels/AboutPanel.tsx
// Renders as children inside PanelWrapper — no wrapper, no gate

import { useState } from 'react';

if (typeof document !== 'undefined' && !document.getElementById('about-kf')) {
  const s = document.createElement('style');
  s.id = 'about-kf';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Bebas+Neue&display=swap');
    @keyframes aFade  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes aPulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
  `;
  document.head.appendChild(s);
}

const FM = '"IBM Plex Mono","Courier New",monospace';
const FH = '"Bebas Neue","Impact",sans-serif';
const C  = {
  border:    'rgba(0,180,255,0.10)',
  borderHi:  'rgba(0,180,255,0.25)',
  cyan:      '#00b4ff',
  cyanDim:   'rgba(0,180,255,0.45)',
  cyanFaint: 'rgba(0,180,255,0.07)',
  silver:    'rgba(180,200,220,0.60)',
  green:     '#00ff88',
  red:       '#ff3355',
  yellow:    '#ffdd00',
  orange:    '#ffaa00',
  purple:    '#9966ff',
  text:      'rgba(200,220,240,0.85)',
  dim:       'rgba(150,180,210,0.40)',
} as const;

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize:8, fontWeight:700, letterSpacing:1, color, border:`1px solid ${color}44`, borderRadius:3, padding:'2px 6px', background:`${color}0d`, fontFamily:FM, whiteSpace:'nowrap' }}>
      {label}
    </span>
  );
}

function SLabel({ children }: { children: string }) {
  return <div style={{ fontSize:7, letterSpacing:3, color:C.cyanDim, fontFamily:FM, marginBottom:8 }}>{children}</div>;
}

const PANELS = [
  { id:'network',  icon:'◈', label:'NETWORK INTELLIGENCE',
    tabs:['MARKET INTEL','DEX FLOWS','CHAIN','VALIDATORS','PROTOCOLS','STAKING','CAPITAL FLOW ★'],
    desc:'A macro-level view of the entire Solana ecosystem in real time. Track validator health and Nakamoto coefficients, monitor live DEX flows and liquidity dominance, measure capital rotation across protocols, and watch on-chain TPS — all from a single unified terminal view.' },
  { id:'protocol', icon:'◉', label:'PROTOCOL INTELLIGENCE',
    tabs:['AUDIT ★','TRANSACTIONS','LIVE FEED','WHALE TRACKER','WALLET INTEL ★','HYPE'],
    desc:'Forensic-grade analytics for serious market participants. Human-readable transaction histories, real-time whale wallet tracking with 30-second refresh cycles, contract audit pattern scoring for pre-rug detection, and deep protocol TVL analytics.' },
  { id:'explore',  icon:'◎', label:'EXPLORE & ALPHA',
    tabs:['MARKET','DEX PAIRS','YIELDS','NEWS','NARRATIVE ★','ALPHA FEED ★','SMART MONEY ★','SNIPER 🔒','HUB AI 🔒'],
    desc:'Our primary research hub for identifying market rotations before the crowd. Track the smart money, monitor emerging narratives across AI, RWA, DePIN, and Layer 2 sectors, and catch new token launches with the Token Launch Sniper.' },
  { id:'search',   icon:'◌', label:'UNIVERSAL SEARCH',
    tabs:['TOKENS','WALLETS','PROTOCOLS','TRANSACTIONS'],
    desc:'A single intelligence query across the entire platform. Pull price data, risk scores, on-chain metrics, and contract intelligence simultaneously. One entry point — the full picture.' },
  { id:'connect',  icon:'◍', label:'CONNECT',
    tabs:['WALLET','NFT STATUS','POINTS','RENEWALS'],
    desc:'Secure, read-only wallet integration for NFT verification and access management. Monitor your Genesis NFT tier, points balance, tenure, and renewal status — all verified on-chain.' },
];

const POINTS_ROWS = [
  { action:'Mint / Renew NFT',         pts:'+100', period:'per event'   },
  { action:'HUB AI Access',            pts:  '50', period:'24hr unlock' },
  { action:'Sniper Access',            pts:  '50', period:'24hr unlock' },
  { action:'Sector Rotation',          pts:  '25', period:'12hr access' },
  { action:'Bridge Inflow',            pts:  '25', period:'12hr access' },
  { action:'Smart Money Capital Flow', pts:  '25', period:'12hr access' },
  { action:'Whale Score',              pts:  '25', period:'12hr access' },
  { action:'Redeem Free Month',        pts: '500', period:'redemption'  },
];

const DISCLAIMERS = [
  { icon:'◈', color:C.orange, title:'NOT FINANCIAL ADVICE',      body:'ProtocolHub is a data intelligence and analytics platform. We do not provide financial advice, investment recommendations, or trading signals of any kind. All on-chain data, AI-generated signals, and market analytics are for informational purposes only.' },
  { icon:'◉', color:C.red,    title:'HIGH RISK — VOLATILE MARKETS', body:'Cryptocurrency markets are highly volatile and carry significant risk of financial loss. Past patterns do not guarantee future results. Never invest more than you can afford to lose. ProtocolHub bears no responsibility for trading decisions made using our data.' },
  { icon:'◎', color:C.yellow, title:'NFT UTILITY ONLY',          body:'The Protocol Genesis (PGEN) NFT grants access to the ProtocolHub platform only. It does not represent equity, ownership, profit-sharing rights, or any form of security or investment product.' },
  { icon:'◌', color:C.cyan,   title:'DATA PRIVACY',              body:'ProtocolHub does not store, sell, or share your personal data. Wallet connections are read-only and used solely for NFT access verification.' },
  { icon:'◍', color:C.silver, title:'JURISDICTIONAL COMPLIANCE', body:'By accessing ProtocolHub you confirm you are of legal age in your jurisdiction and that accessing cryptocurrency-related platforms is legally permitted in your region.' },
  { icon:'◈', color:C.orange, title:'AI SIGNAL DISCLAIMER',      body:'HUB AI signals are generated by an AI model and are not a substitute for independent research. Never make financial decisions based solely on AI-generated content.' },
];

const TABS = [
  { id:'platform', label:'PLATFORM'    },
  { id:'genesis',  label:'GENESIS NFT' },
  { id:'points',   label:'POINTS'      },
  { id:'hubai',    label:'HUB AI'      },
  { id:'legal',    label:'DISCLAIMERS' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function AboutPanel() {
  const [tab,       setTab]       = useState<TabId>('platform');
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  return (
    <div style={{ fontFamily:FM, color:C.text }}>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, borderBottom:`1px solid ${C.border}`, overflowX:'auto', scrollbarWidth:'none', marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'6px 14px', borderRadius:'4px 4px 0 0', border:'none', cursor:'pointer',
            background:   tab === t.id ? C.cyanFaint : 'transparent',
            borderBottom: tab === t.id ? `2px solid ${C.cyan}` : '2px solid transparent',
            color:        tab === t.id ? C.cyan : C.dim,
            fontSize:9, fontFamily:FM, letterSpacing:2, fontWeight:700, whiteSpace:'nowrap',
            transition:'color 0.2s, background 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── PLATFORM ── */}
      {tab === 'platform' && (
        <div style={{ animation:'aFade 0.3s ease both' }}>
          <div style={{ padding:'18px 16px', marginBottom:16, border:`1px solid ${C.borderHi}`, borderRadius:8, background:C.cyanFaint }}>
            <div style={{ fontFamily:FH, fontSize:'clamp(28px,4vw,42px)', letterSpacing:4, color:'#fff', marginBottom:4 }}>
              PROTOCOL<span style={{ color:C.cyan }}>HUB</span>
            </div>
            <div style={{ fontSize:7, letterSpacing:4, color:C.cyanDim, marginBottom:12 }}>INSTITUTIONAL STANDARD FOR ON-CHAIN INTELLIGENCE</div>
            <div style={{ fontSize:10, color:C.silver, lineHeight:1.9 }}>
              ProtocolHub is not a general-purpose crypto site. It is a professional-grade intelligence
              platform engineered for serious market participants. In an era of fragmented data and
              influencer-driven noise, we deliver a clean terminal-style interface integrating real-time
              blockchain telemetry, sophisticated market analytics, and AI-driven direction indicators.
            </div>
            <div style={{ marginTop:12, padding:'8px 12px', borderLeft:`2px solid ${C.cyan}`, background:'rgba(0,0,0,0.25)', borderRadius:'0 4px 4px 0' }}>
              <div style={{ fontSize:9, color:C.cyan, fontStyle:'italic' }}>"We provide the lens — you execute the strategy."</div>
            </div>
          </div>

          <SLabel>// FIVE INTELLIGENCE PANELS</SLabel>
          {PANELS.map((panel, i) => {
            const isOpen = openPanel === panel.id;
            return (
              <div key={panel.id} onClick={() => setOpenPanel(isOpen ? null : panel.id)}
                style={{ marginBottom:4, cursor:'pointer', border:`1px solid ${isOpen ? C.borderHi : C.border}`, borderRadius:6, background:isOpen ? C.cyanFaint : 'transparent', transition:'all 0.2s', animation:`aFade 0.3s ease ${i*0.05}s both` }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px' }}>
                  <span style={{ fontSize:18, color:C.cyan, width:24, textAlign:'center', flexShrink:0 }}>{panel.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:isOpen ? C.cyan : C.text }}>{panel.label}</div>
                    {!isOpen && <div style={{ fontSize:7, color:C.dim, marginTop:2 }}>{panel.tabs.slice(0,4).join(' · ')}{panel.tabs.length > 4 ? ' ...' : ''}</div>}
                  </div>
                  <Pill label="LIVE" color={C.green} />
                  <span style={{ fontSize:9, color:C.dim, flexShrink:0, transition:'transform 0.2s', transform:isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                </div>
                {isOpen && (
                  <div style={{ padding:'0 12px 14px', borderTop:`1px solid ${C.border}` }}>
                    <div style={{ marginTop:10, marginBottom:10, fontSize:9, color:C.silver, lineHeight:1.8 }}>{panel.desc}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {panel.tabs.map(t => {
                        const isCS = t.endsWith('★'); const isLock = t.includes('🔒');
                        const label = t.replace(' ★','').replace(' 🔒','');
                        const col = isCS ? C.orange : isLock ? C.purple : C.cyanDim;
                        return (
                          <span key={t} style={{ fontSize:7, letterSpacing:1, color:col, border:`1px solid ${col}33`, borderRadius:3, padding:'2px 7px', background:`${col}0a`, fontFamily:FM }}>
                            {label}{isCS && <span style={{ marginLeft:4, fontSize:6 }}>SOON</span>}{isLock && <span style={{ marginLeft:3 }}>🔒</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── GENESIS NFT ── */}
      {tab === 'genesis' && (
        <div style={{ animation:'aFade 0.3s ease both' }}>
          <SLabel>// PROTOCOL GENESIS (PGEN)</SLabel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:14 }}>
            {[
              { label:'SUPPLY',       value:'25,000', sub:'total NFTs' },
              { label:'EARLY PRICE',  value:'$40',    sub:'first 2,000 mints', color:C.green },
              { label:'PUBLIC PRICE', value:'$70',    sub:'remaining 23,000' },
              { label:'ROYALTY',      value:'6%',     sub:'secondary sales' },
            ].map((s,i) => (
              <div key={i} style={{ padding:'12px 14px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint, animation:`aFade 0.3s ease ${i*0.05}s both` }}>
                <div style={{ fontSize:7, letterSpacing:2, color:C.dim, marginBottom:4 }}>{s.label}</div>
                <div style={{ fontFamily:FH, fontSize:22, letterSpacing:2, color:(s as any).color ?? C.text }}>{s.value}</div>
                <div style={{ fontSize:7, color:C.dim, marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
          {[
            { icon:'◈', title:'EXCLUSIVE NFT-GATED ACCESS', body:'Access to ProtocolHub is permanently secured by holding a Protocol Genesis NFT on Solana. Your NFT is your membership pass — verified on-chain every session via read-only wallet connection.' },
            { icon:'◉', title:'DYNAMIC ON-CHAIN METADATA',  body:'Your NFT metadata updates automatically. Points balance, tier, tenure, and renewal count are visible live on Magic Eden and Solscan — your NFT literally reflects your status in real time.' },
            { icon:'◎', title:'LOYALTY PROTECTED',          body:'Your original mint price is permanently locked as your renewal rate. Existing holders are never subject to price increases. First mover advantage is real and protected on-chain.' },
            { icon:'◌', title:'CANDY MACHINE V3 · USDC',    body:'Fixed USD pricing enforced by Candy Machine v3 splTokenPayment guard. Early tier $40 for first 2,000 mints — remaining 23,000 at $70 USDC. 6% royalty on all secondary sales.' },
          ].map((b,i) => (
            <div key={i} style={{ padding:'14px', marginBottom:8, border:`1px solid ${C.border}`, borderRadius:6, background:'rgba(0,0,0,0.2)', animation:`aFade 0.3s ease ${i*0.07}s both` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                <span style={{ fontSize:16, color:C.cyan }}>{b.icon}</span>
                <span style={{ fontSize:9, fontWeight:700, color:C.text, letterSpacing:1 }}>{b.title}</span>
              </div>
              <div style={{ fontSize:9, color:C.silver, lineHeight:1.8 }}>{b.body}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── POINTS ── */}
      {tab === 'points' && (
        <div style={{ animation:'aFade 0.3s ease both' }}>
          <SLabel>// POINTS & REWARDS SYSTEM</SLabel>
          <div style={{ fontSize:9, color:C.silver, lineHeight:1.8, marginBottom:14 }}>
            Every PGEN holder earns points by engaging with the platform. Points unlock premium features and
            can be redeemed for rewards. Your balance is tracked live and reflected in your NFT metadata on-chain.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 90px', gap:6, padding:'5px 10px', borderBottom:`1px solid ${C.border}`, marginBottom:4 }}>
            {['ACTION','PTS','PERIOD'].map(h => <div key={h} style={{ fontSize:7, color:C.dim, letterSpacing:2 }}>{h}</div>)}
          </div>
          {POINTS_ROWS.map((row,i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 70px 90px', gap:6, padding:'9px 10px', borderBottom:`1px solid rgba(255,255,255,0.03)`, alignItems:'center', animation:`aFade 0.2s ease ${i*0.04}s both` }}>
              <span style={{ fontSize:9, color:C.text }}>{row.action}</span>
              <span style={{ fontSize:10, fontWeight:700, color:row.pts.startsWith('+') ? C.green : C.cyan, fontFamily:FM }}>{row.pts}</span>
              <span style={{ fontSize:8, color:C.dim }}>{row.period}</span>
            </div>
          ))}
          <div style={{ marginTop:14, padding:'12px 14px', border:`1px solid ${C.borderHi}`, borderRadius:6, background:C.cyanFaint }}>
            <div style={{ fontSize:9, color:C.cyan, fontWeight:700, marginBottom:4 }}>500 pts → FREE MONTH</div>
            <div style={{ fontSize:8, color:C.dim, lineHeight:1.7 }}>Accumulate 500 points and redeem them for a free renewal month. Consistent engagement compounds your access — no payment required.</div>
          </div>
        </div>
      )}

      {/* ── HUB AI ── */}
      {tab === 'hubai' && (
        <div style={{ animation:'aFade 0.3s ease both' }}>
          <SLabel>// HUB AI — INTELLIGENCE DIGEST</SLabel>
          <div style={{ padding:'16px 14px', marginBottom:14, border:`1px solid ${C.borderHi}`, borderRadius:6, background:C.cyanFaint }}>
            <div style={{ fontFamily:FH, fontSize:22, letterSpacing:3, color:C.cyan, marginBottom:6 }}>DIRECTIONAL CONFIDENCE ENGINE</div>
            <div style={{ fontSize:9, color:C.silver, lineHeight:1.9 }}>
              Every asset on ProtocolHub carries a live AI signal — a sophisticated directional confidence
              indicator built on real-time momentum, on-chain volume, and liquidity analysis. This is not
              price prediction. It is a confluence-weighted direction score that lets you gauge the strength
              of underlying market data — from marginal drift to high-conviction trend formation.
            </div>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:14 }}>
            {['09:00 UTC MORNING BRIEF','18:00 UTC EVENING BRIEF','CONFLUENCE SCORE 0–100','ANOMALY DETECTION 15MIN','WHALE_SPIKE ALERTS','BRIDGE_SURGE ALERTS','TPS_DROP MONITORING','SOL · JUP · BONK · WIF'].map((tag,i) => (
              <span key={i} style={{ fontSize:7, letterSpacing:1, color:C.cyan, border:`1px solid ${C.borderHi}`, borderRadius:3, padding:'3px 8px', background:C.cyanFaint, fontFamily:FM }}>{tag}</span>
            ))}
          </div>
          {[
            { time:'09:00 UTC', label:'🌅 MORNING BRIEF', desc:'Pre-market analysis covering overnight on-chain activity, validator metrics, capital flow shifts, and directional confidence for the trading session ahead.' },
            { time:'18:00 UTC', label:'🌆 EVENING BRIEF',  desc:'Mid-session synthesis covering intraday momentum, whale accumulation or distribution patterns, narrative shifts, and updated per-token signal scores.' },
          ].map((brief,i) => (
            <div key={i} style={{ padding:'12px 14px', marginBottom:8, border:`1px solid ${C.border}`, borderRadius:6, background:'rgba(0,0,0,0.2)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <div style={{ fontFamily:FH, fontSize:16, letterSpacing:2, color:C.text }}>{brief.label}</div>
                <Pill label={brief.time} color={C.cyanDim} />
              </div>
              <div style={{ fontSize:9, color:C.dim, lineHeight:1.8 }}>{brief.desc}</div>
            </div>
          ))}
          <div style={{ padding:'12px 14px', border:`1px solid rgba(153,102,255,0.3)`, borderRadius:6, background:'rgba(153,102,255,0.05)' }}>
            <div style={{ fontSize:9, color:C.purple, fontWeight:700, marginBottom:4 }}>🔒 50 PTS · 24HR ACCESS</div>
            <div style={{ fontSize:8, color:C.dim, lineHeight:1.7 }}>HUB AI costs 50 points per 24-hour access window — ensuring only engaged, active holders benefit from our most powerful intelligence tool. Anomaly detection runs every 15 minutes: WHALE_SPIKE, BRIDGE_SURGE, and TPS_DROP alerts surface automatically.</div>
          </div>
        </div>
      )}

      {/* ── DISCLAIMERS ── */}
      {tab === 'legal' && (
        <div style={{ animation:'aFade 0.3s ease both' }}>
          <SLabel>// IMPORTANT DISCLAIMERS</SLabel>
          <div style={{ padding:'10px 12px', marginBottom:14, border:`1px solid ${C.orange}44`, borderRadius:6, background:'rgba(255,170,0,0.04)' }}>
            <div style={{ fontSize:8, color:C.orange, fontWeight:700, marginBottom:4 }}>⚠ PLEASE READ BEFORE USING THIS PLATFORM</div>
            <div style={{ fontSize:8, color:C.dim, lineHeight:1.7 }}>By accessing ProtocolHub you confirm you have read and agree to the following terms.</div>
          </div>
          {DISCLAIMERS.map((d,i) => (
            <div key={i} style={{ padding:'12px 14px', marginBottom:8, border:`1px solid ${d.color}22`, borderRadius:6, background:`${d.color}05`, animation:`aFade 0.25s ease ${i*0.05}s both` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ fontSize:14, color:d.color }}>{d.icon}</span>
                <span style={{ fontSize:9, fontWeight:700, color:d.color, letterSpacing:1 }}>{d.title}</span>
              </div>
              <div style={{ fontSize:9, color:C.dim, lineHeight:1.8 }}>{d.body}</div>
            </div>
          ))}
          <div style={{ marginTop:8, padding:'8px 12px', border:`1px solid ${C.border}`, borderRadius:6, background:C.cyanFaint, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:C.green, flexShrink:0, animation:'aPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize:7, color:C.dim, letterSpacing:2 }}>PROTOCOLHUB · INTELLIGENCE IS THE EDGE · PUBLIC ACCESS</span>
          </div>
        </div>
      )}

    </div>
  );
}
