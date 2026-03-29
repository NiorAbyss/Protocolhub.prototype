import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import { type Server } from "http";
import { storage } from "./storage";
import { api } from "../shared/routes";
import { z } from "zod";
import axios from "axios";
import http  from "http";
import https from "https";

// ── Axios connection pool — reuse TCP sockets across all API calls ──
// Without this: new TCP connection per request = slow + wasteful
const httpAgent  = new http.Agent({
  keepAlive:        true,
  maxSockets:       50,    // max concurrent connections per host
  maxFreeSockets:   10,    // keep 10 idle sockets warm
  timeout:          30000,
  keepAliveMsecs:   3000,
});
const httpsAgent = new https.Agent({
  keepAlive:        true,
  maxSockets:       50,
  maxFreeSockets:   10,
  timeout:          30000,
  keepAliveMsecs:   3000,
});
axios.defaults.httpAgent  = httpAgent;
axios.defaults.httpsAgent = httpsAgent;
axios.defaults.timeout    = 10000;  // 10s global timeout
import crypto from "crypto";
import cookieParser from "cookie-parser";
import Database from "better-sqlite3";
import path from "path";
import WebSocket from "ws";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ===================================================== */
/* DATABASE SETUP                                        */
/* ===================================================== */

const db = new Database(path.join(__dirname, "protocolhub.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS nft_access (
    wallet        TEXT PRIMARY KEY,
    tier          TEXT DEFAULT 'bronze',
    mint_address  TEXT,
    granted_at    INTEGER,
    expires_at    INTEGER,
    revoked       INTEGER DEFAULT 0,
    revoke_reason TEXT,
    revoke_serial TEXT,
    revoked_at    INTEGER,
    revoked_by    TEXT,
    mint_number   INTEGER
  );
  CREATE TABLE IF NOT EXISTS mint_stats (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    total_minted  INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS analytics (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet     TEXT,
    event      TEXT,
    panel      TEXT,
    feature    TEXT,
    meta       TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS appeals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet        TEXT,
    message       TEXT,
    revoke_reason TEXT,
    revoke_serial TEXT,
    status        TEXT DEFAULT 'pending',
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );
  INSERT OR IGNORE INTO mint_stats (id, total_minted) VALUES (1, 0);
`);

// ── Gate settings ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS gate_settings (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    gate_live   INTEGER DEFAULT 0,
    gate_locked INTEGER DEFAULT 0,
    updated_at  DATETIME DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO gate_settings (id, gate_live, gate_locked) VALUES (1, 0, 0);

  CREATE TABLE IF NOT EXISTS feature_flags (
    key           TEXT PRIMARY KEY,
    status        TEXT DEFAULT 'coming_soon', -- coming_soon | pending_unlock | unlocked
    label         TEXT NOT NULL,
    description   TEXT,
    requested_by  TEXT,
    requested_at  INTEGER,
    approved_by   TEXT,
    approved_at   INTEGER,
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS ai_signals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slot            TEXT NOT NULL,  -- 'morning' | 'evening' | 'manual'
    date            TEXT NOT NULL,  -- YYYY-MM-DD
    posture         TEXT NOT NULL,  -- ecosystem posture
    confidence      INTEGER NOT NULL,
    confluence      INTEGER DEFAULT 0,  -- 0-100 how many signals aligned
    brief           TEXT NOT NULL,      -- full JSON briefing
    tokens          TEXT,               -- JSON per-token analysis
    narratives      TEXT,               -- JSON active narratives
    sources_used    TEXT,               -- JSON array of data sources
    created_at      INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS ai_anomalies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,  -- WHALE_SPIKE | BRIDGE_SURGE | FNG_DROP | TPS_DROP | CONCENTRATION
    severity    TEXT DEFAULT 'medium', -- low | medium | high | critical
    title       TEXT NOT NULL,
    detail      TEXT NOT NULL,
    value       REAL,           -- the trigger value
    threshold   REAL,           -- what threshold was crossed
    dismissed   INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  -- Seed all feature flags
  INSERT OR IGNORE INTO feature_flags (key, status, label, description) VALUES
    ('capital_flow',        'coming_soon', 'Capital Flow & Rotation', 'The Broker''s Tab — sector rotation, smart money, bridge inflows'),
    ('narrative',           'coming_soon', 'Narrative',               'Dominant market narratives and momentum scores'),
    ('alpha_feed',          'coming_soon', 'Alpha Feed',              'High-signal market intelligence and unusual activity'),
    ('smart_money_explore', 'coming_soon', 'Smart Money',             'Whale wallet convergence signals'),
    ('wallet_intel',        'coming_soon', 'Wallet Intelligence',     'Full wallet profiling and classification'),
    ('protocol_audit',      'coming_soon', 'Protocol Audit',          'Contract risk analysis and rug pattern scoring'),
    ('hub_ai',              'unlocked',    'HUB AI',                  'Twice-daily AI intelligence briefs — points-locked per user');
`);

// ── Whitelist ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist (
    wallet        TEXT PRIMARY KEY,
    tier          TEXT DEFAULT 'bronze',
    note          TEXT,
    expires_at    INTEGER,
    permanent     INTEGER DEFAULT 0,
    revoked       INTEGER DEFAULT 0,
    revoke_reason TEXT,
    revoke_serial TEXT,
    granted_by    TEXT DEFAULT 'admin',
    granted_at    INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// ── Whitelist approval requests ──────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS whitelist_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT NOT NULL,
    wallet      TEXT NOT NULL,
    tier        TEXT,
    note        TEXT,
    days        INTEGER,
    permanent   INTEGER DEFAULT 0,
    reason      TEXT NOT NULL,
    requested_by TEXT NOT NULL DEFAULT 'admin',
    status      TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at INTEGER,
    deny_reason TEXT,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_wlreq_status ON whitelist_requests(status);
`);

// ── NFT history ───────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS nft_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mint       TEXT NOT NULL,
    wallet     TEXT NOT NULL,
    event      TEXT NOT NULL,
    detail     TEXT,
    price_usd  REAL,
    tx_sig     TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_nft_history_mint ON nft_history(mint);
`);

// ── Safe migrations ───────────────────────────────────
// Safe migrations — add new columns if they don't exist yet
try { db.exec(`ALTER TABLE nft_access ADD COLUMN revoke_serial TEXT`);       } catch {}
try { db.exec(`ALTER TABLE appeals ADD COLUMN revoke_reason TEXT`);           } catch {}
try { db.exec(`ALTER TABLE appeals ADD COLUMN revoke_serial TEXT`);           } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN original_price REAL`);       } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN price_locked INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN grace_expires_at INTEGER`);  } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN last_renewed_at INTEGER`);   } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN renewal_count INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN mint_tx_sig TEXT`);          } catch {}
try { db.exec(`ALTER TABLE admin_sessions ADD COLUMN role TEXT DEFAULT 'admin'`); } catch {}
try { db.exec(`ALTER TABLE admin_sessions ADD COLUMN totp_verified INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE admin_sessions ADD COLUMN ip_address TEXT`);       } catch {}
try { db.exec(`ALTER TABLE ai_signals ADD COLUMN confluence  INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE ai_signals ADD COLUMN tokens      TEXT`);              } catch {}
try { db.exec(`ALTER TABLE ai_signals ADD COLUMN narratives  TEXT`);              } catch {}
try { db.exec(`ALTER TABLE ai_signals ADD COLUMN sources_used TEXT`);             } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN original_price REAL`);   } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN price_locked INTEGER DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN grace_expires_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN last_renewed_at INTEGER`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN renewal_count INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN mint_tx_sig TEXT`);      } catch {}
try { db.exec(`ALTER TABLE admin_sessions ADD COLUMN role TEXT DEFAULT 'admin'`); } catch {}
try { db.exec(`ALTER TABLE admin_sessions ADD COLUMN totp_verified INTEGER DEFAULT 0`); } catch {}


// ── Points system schema ──────────────────────────────────────────────────
try { db.exec(`ALTER TABLE nft_access ADD COLUMN points_balance INTEGER DEFAULT 0`);       } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN points_earned_total INTEGER DEFAULT 0`);  } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN page_access_expires_at INTEGER`);         } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN page_access_page TEXT`);                  } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS point_transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT    NOT NULL,
    mint        TEXT,
    type        TEXT    NOT NULL,  -- EARN | BURN_MONTH | BURN_PAGE
    amount      INTEGER NOT NULL,  -- positive = earn, negative = burn
    balance_after INTEGER NOT NULL DEFAULT 0,
    reason      TEXT,
    created_at  DATETIME DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ptx_wallet ON point_transactions(wallet);
`);

// ── On-chain sync schema ───────────────────────────────────────────────────
try { db.exec(`ALTER TABLE nft_access ADD COLUMN points_synced_balance INTEGER DEFAULT -1`); } catch {}
try { db.exec(`ALTER TABLE nft_access ADD COLUMN points_synced_at INTEGER`);                 } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    status        TEXT    NOT NULL DEFAULT 'pending',
    -- pending | approved | paying | uploading | complete | failed
    nft_count     INTEGER NOT NULL DEFAULT 0,
    sol_cost_lamports INTEGER NOT NULL DEFAULT 0,
    wallets_json  TEXT,          -- JSON array of wallets to sync
    requested_by  TEXT NOT NULL DEFAULT 'admin',
    approved_by   TEXT,
    payment_tx    TEXT,          -- SOL tx sig from owner
    started_at    INTEGER,
    completed_at  INTEGER,
    synced_count  INTEGER DEFAULT 0,
    failed_count  INTEGER DEFAULT 0,
    error_detail  TEXT,
    created_at    DATETIME DEFAULT (datetime('now'))
  );
`);
// Admin audit log — records every admin action with timestamp
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT NOT NULL,
    admin      TEXT NOT NULL DEFAULT 'admin',
    wallet     TEXT,
    detail     TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  );
`);

// Access log — rate/threat detection, one row per authenticated request
db.exec(`
  CREATE TABLE IF NOT EXISTS access_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet     TEXT NOT NULL,
    path       TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_access_log_wallet ON access_log(wallet);
  CREATE INDEX IF NOT EXISTS idx_access_log_time   ON access_log(created_at);
`);

// Security event log — failed logins, brute force, bypass attempts
db.exec(`
  CREATE TABLE IF NOT EXISTS security_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  TEXT NOT NULL,   -- FAILED_LOGIN | BRUTE_FORCE | IP_BLOCKED | BYPASS_ATTEMPT | RATE_EXCEEDED | REVOKED_ACCESS
    ip          TEXT,
    wallet      TEXT,
    detail      TEXT,
    severity    TEXT DEFAULT 'medium', -- low | medium | high | critical
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sec_log_type ON security_log(event_type);
  CREATE INDEX IF NOT EXISTS idx_sec_log_ip   ON security_log(ip);
  CREATE INDEX IF NOT EXISTS idx_sec_log_time ON security_log(created_at);
`);

// IP block list — auto-blocked IPs from brute force detection
db.exec(`
  CREATE TABLE IF NOT EXISTS ip_blocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ip          TEXT UNIQUE NOT NULL,
    reason      TEXT,
    blocked_at  INTEGER DEFAULT (strftime('%s','now')),
    expires_at  INTEGER,    -- NULL = permanent
    unblocked   INTEGER DEFAULT 0
  );
`);

// Monthly audit archives — downloadable bank-statement-style logs
db.exec(`
  CREATE TABLE IF NOT EXISTS monthly_archives (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    month       TEXT NOT NULL UNIQUE, -- YYYY-MM
    record_count INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// ── Prepared statements ───────────────────────────────
const getAccess         = db.prepare(`SELECT * FROM nft_access WHERE wallet = ?`);
const revokeAccess      = db.prepare(`UPDATE nft_access SET revoked=1, revoke_reason=?, revoke_serial=?, revoked_at=strftime('%s','now'), revoked_by=? WHERE wallet=?`);
const restoreAccess     = db.prepare(`UPDATE nft_access SET revoked=0, revoke_reason=NULL, revoke_serial=NULL, revoked_at=NULL WHERE wallet=?`);
const grantAccess       = db.prepare(`INSERT OR REPLACE INTO nft_access (wallet, tier, mint_address, granted_at, expires_at, mint_number) VALUES (?, ?, ?, strftime('%s','now'), ?, ?)`);
const getAllHolders      = db.prepare(`SELECT * FROM nft_access ORDER BY granted_at DESC`);
const getRevokedHolders = db.prepare(`SELECT * FROM nft_access WHERE revoked=1`);
const getActiveHolders  = db.prepare(`SELECT * FROM nft_access WHERE revoked=0 AND expires_at > strftime('%s','now')`);
const getMintCount      = db.prepare(`SELECT total_minted FROM mint_stats WHERE id=1`);
const incrementMint     = db.prepare(`UPDATE mint_stats SET total_minted = total_minted + 1 WHERE id=1`);
const logEvent          = db.prepare(`INSERT INTO analytics (wallet, event, panel, feature, meta) VALUES (?, ?, ?, ?, ?)`);
const getPanelStats     = db.prepare(`SELECT panel, COUNT(*) as views, COUNT(DISTINCT wallet) as uniqueUsers FROM analytics WHERE panel IS NOT NULL GROUP BY panel ORDER BY views DESC`);
const getFeatureStats   = db.prepare(`SELECT feature, COUNT(*) as uses FROM analytics WHERE feature IS NOT NULL GROUP BY feature ORDER BY uses DESC`);
const getDailyStats     = db.prepare(`SELECT date(created_at, 'unixepoch') as day, COUNT(*) as events, COUNT(DISTINCT wallet) as unique_wallets FROM analytics GROUP BY day ORDER BY day DESC LIMIT 14`);
const createSession     = db.prepare(`INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`);
const getSession        = db.prepare(`SELECT * FROM admin_sessions WHERE token=? AND expires_at > strftime('%s','now')`);
const deleteSession     = db.prepare(`DELETE FROM admin_sessions WHERE token=?`);
const submitAppeal      = db.prepare(`INSERT INTO appeals (wallet, message, revoke_reason, revoke_serial) VALUES (?, ?, ?, ?)`);
const getAppeals        = db.prepare(`SELECT * FROM appeals ORDER BY created_at DESC`);
const updateAppeal      = db.prepare(`UPDATE appeals SET status=? WHERE id=?`);
const logAudit          = db.prepare(`INSERT INTO admin_audit (action, admin, wallet, detail) VALUES (?, ?, ?, ?)`);
const logSecurity       = db.prepare(`INSERT INTO security_log (event_type, ip, wallet, detail, severity) VALUES (?, ?, ?, ?, ?)`);
const isIpBlocked       = db.prepare(`SELECT * FROM ip_blocks WHERE ip=? AND unblocked=0 AND (expires_at IS NULL OR expires_at > strftime('%s','now'))`);
const blockIp           = db.prepare(`INSERT OR IGNORE INTO ip_blocks (ip, reason, expires_at) VALUES (?, ?, ?)`);
// Whitelist requests
const getWhitelistRequests = db.prepare(`SELECT * FROM whitelist_requests ORDER BY created_at DESC`);
const createWlRequest      = db.prepare(`INSERT INTO whitelist_requests (action, wallet, tier, note, days, permanent, reason, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const updateWlRequest      = db.prepare(`UPDATE whitelist_requests SET status=?, reviewed_by=?, reviewed_at=strftime('%s','now'), deny_reason=? WHERE id=?`);

const getGateSettings   = db.prepare(`SELECT * FROM gate_settings WHERE id=1`);
const getAllFlags        = db.prepare(`SELECT * FROM feature_flags ORDER BY created_at ASC`);
const getFlag           = db.prepare(`SELECT * FROM feature_flags WHERE key=?`);
const setFlagStatus     = db.prepare(`UPDATE feature_flags SET status=?, requested_by=?, requested_at=strftime('%s','now') WHERE key=?`);
const approveFlag       = db.prepare(`UPDATE feature_flags SET status='unlocked', approved_by=?, approved_at=strftime('%s','now') WHERE key=?`);
const denyFlag          = db.prepare(`UPDATE feature_flags SET status='coming_soon', requested_by=NULL, requested_at=NULL WHERE key=?`);
const getLatestSignals  = db.prepare(`SELECT * FROM ai_signals ORDER BY created_at DESC LIMIT 6`);
const getSignalBySlot   = db.prepare(`SELECT * FROM ai_signals WHERE date=? AND slot=? LIMIT 1`);
const insertSignal      = db.prepare(`INSERT INTO ai_signals (slot, date, posture, confidence, confluence, brief, tokens, narratives, sources_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const getSignalHistory  = db.prepare(`SELECT * FROM ai_signals ORDER BY created_at DESC LIMIT 30`);
const getAnomalies      = db.prepare(`SELECT * FROM ai_anomalies WHERE dismissed=0 ORDER BY created_at DESC LIMIT 20`);
const insertAnomaly     = db.prepare(`INSERT INTO ai_anomalies (type, severity, title, detail, value, threshold) VALUES (?, ?, ?, ?, ?, ?)`);
const dismissAnomaly    = db.prepare(`UPDATE ai_anomalies SET dismissed=1 WHERE id=?`);
const setGateLive       = db.prepare(`UPDATE gate_settings SET gate_live=?, updated_at=datetime('now') WHERE id=1`);
const lockGatePermanent = db.prepare(`UPDATE gate_settings SET gate_locked=1, gate_live=1, updated_at=datetime('now') WHERE id=1`);

const getWhitelist      = db.prepare(`SELECT * FROM whitelist ORDER BY granted_at DESC`);
const getWhitelistEntry = db.prepare(`SELECT * FROM whitelist WHERE wallet=?`);
const addWhitelist      = db.prepare(`INSERT OR REPLACE INTO whitelist (wallet, tier, note, expires_at, permanent, revoked, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, 0, ?, strftime('%s','now'))`);
const revokeWhitelist   = db.prepare(`UPDATE whitelist SET revoked=1, revoke_reason=?, revoke_serial=? WHERE wallet=?`);
const restoreWhitelist  = db.prepare(`UPDATE whitelist SET revoked=0, revoke_reason=NULL, revoke_serial=NULL WHERE wallet=?`);
const addNftHistory     = db.prepare(`INSERT INTO nft_history (mint, wallet, event, detail, price_usd, tx_sig) VALUES (?, ?, ?, ?, ?, ?)`);
const getNftHistory     = db.prepare(`SELECT * FROM nft_history WHERE mint=? ORDER BY created_at DESC`);
const setTotpVerified   = db.prepare(`UPDATE admin_sessions SET totp_verified=1 WHERE token=?`);
const getSessionFull    = db.prepare(`SELECT * FROM admin_sessions WHERE token=? AND expires_at > strftime('%s','now')`);
const getRevenueByMonth = db.prepare(`
  SELECT strftime('%Y-%m', granted_at, 'unixepoch') as month,
         SUM(CASE WHEN mint_number <= 2000 THEN 40 ELSE 70 END) as rev
  FROM nft_access
  WHERE granted_at IS NOT NULL
  GROUP BY month
  ORDER BY month ASC
`);
const getActiveHoldersDelta = db.prepare(`
  SELECT
    COUNT(CASE WHEN granted_at > strftime('%s','now','-1 day') THEN 1 END) as today,
    COUNT(CASE WHEN granted_at > strftime('%s','now','-2 day')
               AND granted_at <= strftime('%s','now','-1 day') THEN 1 END) as yesterday
  FROM nft_access WHERE revoked=0 AND expires_at > strftime('%s','now')
`);

/* ===================================================== */
/* AUTH MIDDLEWARE                                       */
/* ===================================================== */

// TOTP verification helper
function verifyTotp(secret: string, token: string): boolean {
  const timeStep  = 30;
  const now       = Math.floor(Date.now() / 1000);
  const base32    = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  // Decode base32 secret
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, "")) {
    const idx = base32.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  const key = Buffer.from(bytes);
  // Check current + adjacent windows for clock drift
  for (const drift of [-1, 0, 1]) {
    const counter  = Math.floor(now / timeStep) + drift;
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter));
    const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const otp = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1_000_000;
    if (String(otp).padStart(6, "0") === String(token).trim()) return true;
  }
  return false;
}

function generateSerial(wallet: string, tag: string): string {
  return `${tag}-${wallet.slice(0,4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

function requireAdmin(req: any, res: any, next: any) {
  const token = req.cookies?.admin_token || req.headers["x-admin-token"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const session = getSessionFull.get(token) as any;
  if (!session) return res.status(401).json({ error: "Session expired" });
  // Owner/admin must have TOTP verified; moderator skips TOTP
  if (["owner","admin"].includes(session.role) && !session.totp_verified) {
    return res.status(401).json({ error: "TOTP required", totpRequired: true });
  }
  req.adminToken = token;
  req.adminRole  = session.role || "admin";
  next();
}

// Founder wallet protection helper
const founderWallet = process.env.FOUNDER_WALLET;
const guardFounder = (wallet: string, res: any): boolean => {
  if (founderWallet && wallet === founderWallet) {
    res.status(403).json({ error: "Founder wallet is permanently protected" });
    return true;
  }
  return false;
};

function requireOwner(req: any, res: any, next: any) {
  requireAdmin(req, res, () => {
    if (req.adminRole !== "owner") return res.status(403).json({ error: "Owner access required" });
    next();
  });
}

/* ===================================================== */
/* CACHE HELPERS                                         */
/* ===================================================== */

interface CacheEntry { data: any; ts: number }
const PANEL_CACHE = new Map<string, CacheEntry>();

function getCached(key: string, ttlMs = 60_000): any | null {
  const entry = PANEL_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) { PANEL_CACHE.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: any): void {
  PANEL_CACHE.set(key, { data, ts: Date.now() });
}

function cacheAge(key: string): number {
  const entry = PANEL_CACHE.get(key);
  if (!entry) return 0;
  return Math.floor((Date.now() - entry.ts) / 1000);
}

/* ===================================================== */
/* RATE LIMITERS                                        */
/* Protects API credits + prevents abuse               */
/* ===================================================== */

// ── Global: 300 req / min per IP ─────────────────────
// Crypto users refresh constantly + multiple tabs open
const globalLimiter = rateLimit({
  windowMs:  60_000,
  max:       300,
  standardHeaders: true,
  legacyHeaders:   false,
  message:   { error: "Too many requests. Slow down." },
  skip: (req: any) => req.path.startsWith("/api/admin"),
});

// ── Auth: 5 attempts / 5 min per IP — strict brute force ──
// After 5 failures the IP is blocked for 1 hour automatically
const authLimiter = rateLimit({
  windowMs:  5 * 60_000,
  max:       5,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (req: any, res: any) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    // Auto-block the IP for 1 hour
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    blockIp.run(ip, 'Brute force — exceeded 5 login attempts in 5 minutes', expiresAt);
    logSecurity.run('IP_BLOCKED', ip, null,
      'Auto-blocked: exceeded 5 login attempts in 5 minutes', 'critical');
    logAudit.run('IP_BLOCKED', 'system', null, `IP ${ip} auto-blocked for brute force`);
    return res.status(429).json({ error: "Too many login attempts. Your IP has been temporarily blocked." });
  },
});

// ── IP block middleware — check before any auth route ──
function checkIpBlock(req: any, res: any, next: any) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const blocked = isIpBlocked.get(ip) as any;
  if (blocked) {
    logSecurity.run('BYPASS_ATTEMPT', ip, null,
      `Blocked IP attempted access to ${req.path}`, 'high');
    return res.status(403).json({ error: "Access denied." });
  }
  next();
}

// ── Expensive external API routes: 60 req / min ───────
// 1 req/sec per IP — crypto users spam refresh during pumps
// Cache handles repeated calls — this blocks true abuse
const apiLimiter = rateLimit({
  windowMs:  60_000,
  max:       60,
  standardHeaders: true,
  legacyHeaders:   false,
  message:   { error: "Rate limit reached. Data refreshes automatically — no need to spam." },
});

// ── NFT mint / renew / claim: 10 req / min per IP ─────
const mintLimiter = rateLimit({
  windowMs:  60_000,
  max:       10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:   { error: "Too many mint/renew requests." },
});

// ── Admin routes: 120 req / min per IP ────────────────
const adminLimiter = rateLimit({
  windowMs:  60_000,
  max:       120,
  standardHeaders: true,
  legacyHeaders:   false,
  message:   { error: "Admin rate limit reached." },
});



// Dual-key fetch: tries keyA first, falls back to keyB on 429 / 401 / 403
async function dualGet(
  url: string,
  keyA: string,
  keyB: string,
  headerName: string,
  params: Record<string, any> = {}
): Promise<any> {
  const attempt = (key: string) =>
    axios.get(url, { headers: { [headerName]: key }, params });
  try {
    return (await attempt(keyA)).data;
  } catch (e: any) {
    if ([429, 401, 403].includes(e?.response?.status)) {
      console.warn(`[dualGet] Key A hit ${e.response.status}, switching to Key B`);
      return (await attempt(keyB)).data;
    }
    throw e;
  }
}

/* ===================================================== */
/* ORIGINAL PULSE CACHE (unchanged)                      */
/* ===================================================== */

type PulseCache = {
  success: boolean;
  solana: { price: number; mcap: number; tps: number };
  whales: { id: string; symbol: string; usdValue: number; solAmount: number; wallet: string | null }[];
  airdrops: { level: string; fee: number }[];
  funding: { realWallets: number; botWallets: number; burnedWallets: number };
  timestamp: string;
};

let CACHE: PulseCache | null = null;
let LAST_FETCH = 0;
let IN_FLIGHT: Promise<PulseCache> | null = null;
const CACHE_TTL = 30_000;

function normalizePriorityFees(levels: any) {
  if (!levels || typeof levels !== "object") return [];
  return Object.entries(levels).map(([level, fee]) => ({ level, fee: Number(fee) || 0 }));
}

function normalizeWhales(raw: any[]) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((w, i) => ({
    id: w.txHash || w.id || `whale-${i}`,
    symbol: w.symbol || "UNKNOWN",
    usdValue: Number(w.usdValue || w.valueUsd || 0),
    solAmount: Number(w.solAmount || 0),
    wallet: w.owner || null,
  }));
}

function analyzeWalletActivity(transactions: any[]) {
  let realWallets = 0, botWallets = 0;
  for (const tx of transactions) {
    const isBotLike = tx.priorityFee > 50_000 || tx.txCount > 25 || tx.isProgram === true;
    if (isBotLike) botWallets++; else realWallets++;
  }
  return { realWallets, botWallets, burnedWallets: botWallets };
}


async function heliusGet(path: string, params: any = {}) {
  const keyA = process.env.HELIUS_API || '';
  const keyB = process.env.HELIUS_API_B || '';
  try {
    return await axios.get(`https://api.helius.xyz${path}`, { params: { 'api-key': keyA, ...params } });
  } catch (e: any) {
    if (e?.response?.status === 429 && keyB) {
      console.warn('[HELIUS] Key A rate limited — switching to Key B');
      return await axios.get(`https://api.helius.xyz${path}`, { params: { 'api-key': keyB, ...params } });
    }
    throw e;
  }
}
async function fetchPulseOnce(): Promise<PulseCache> {
  const now = Date.now();
  if (CACHE && now - LAST_FETCH < CACHE_TTL) return CACHE;
  if (IN_FLIGHT) return IN_FLIGHT;

  IN_FLIGHT = (async () => {
    try {
      const [birdeyeRes, heliusRes, cgRes] = await Promise.all([
        axios.get("https://public-api.birdeye.so/v1/solana/networks", {
          headers: { "X-API-KEY": process.env.BIRD_API || "" },
        }).catch(err => { console.error("BIRDEYE_ERROR:", err.response?.status); return { data: { data: [] } }; }),
        axios.post(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API || ""}`, {
          jsonrpc: "2.0", id: "pulse", method: "getPriorityFeeEstimate",
          params: [{ accountKeys: ["JUP6LkbZbjS1jKKccwgws655K6L3GEzS6LYVsbYwbq3"], options: { includeAllPriorityFeeLevels: true } }]
        }).catch(err => { console.error("HELIUS_ERROR:", err.response?.status); return { data: { result: {} } }; }),
        axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
          .catch(() => ({ data: { solana: { usd: 0 } } })),
      ]);

      const payload: PulseCache = {
        success:   true,
        solana:    { price: cgRes.data?.solana?.usd ?? 0, mcap: birdeyeRes.data?.data?.totalMarketCap ?? 0, tps: birdeyeRes.data?.data?.tps ?? 0 },
        whales:    normalizeWhales(birdeyeRes.data?.data ?? []),
        airdrops:  normalizePriorityFees(heliusRes.data?.result?.priorityFeeLevels),
        funding:   analyzeWalletActivity((birdeyeRes.data?.data ?? []).map((w: any) => ({ priorityFee: w.priorityFee || 0, txCount: w.txCount || 1, isProgram: w.isProgram || false }))),
        timestamp: new Date().toISOString(),
      };

      CACHE = payload; LAST_FETCH = Date.now();
      return payload;
    } finally { IN_FLIGHT = null; }
  })();

  return IN_FLIGHT;
}

/* ===================================================== */
/* QN WEBSOCKET MANAGER + SSE CLIENT REGISTRY           */
/* One upstream WebSocket shared across all 8k users.   */
/* Clients connect via SSE — no direct WS to browser.   */
/* ===================================================== */

/* DEX program addresses to watch */
const WATCH_PROGRAMS = [
  'JUP6LkbZbjS1jKKccwgws655K6L3GEzS6LYVsbYwbq3',  // Jupiter v6
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',  // Raydium AMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3sFt2r',   // Orca Whirlpool
];

const sseClients = new Set<any>();
let   liveWs:   WebSocket | null = null;
let   wsRetries = 0;
let   wsSource: 'helius' | 'qn' | 'none' = 'none';

function broadcastSSE(event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => { try { client.write(data); } catch {} });
}

/* Parse logsNotification from any Solana RPC WebSocket */
function parseLogNotification(msg: any): object | null {
  try {
    const result = msg?.params?.result?.value;
    if (!result) return null;
    const logs: string[] = result.logs ?? [];
    const sig = result.signature ?? result.value?.signature ?? '';
    if (!sig) return null;
    const isSwap = logs.some((l: string) => /swap|SwapEvent|raydium|jupiter|orca/i.test(l));
    const program = logs.some((l: string) => l.includes('JUP6')) ? 'Jupiter'
                  : logs.some((l: string) => l.includes('675k')) ? 'Raydium'
                  : logs.some((l: string) => l.includes('whir')) ? 'Orca' : 'Solana';
    return {
      id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type:      isSwap ? 'SWAP' : 'TRANSFER',
      program,
      signature: sig,
      timestamp: Date.now(),
    };
  } catch { return null; }
}

/* Connect to a Solana RPC WebSocket and subscribe to DEX logs */
function connectLiveWebSocket(url: string, source: 'helius' | 'qn') {
  if (liveWs) return;
  console.log(`[LIVE WSS] Connecting via ${source}...`);
  const ws = new WebSocket(url);
  liveWs = ws; wsSource = source;

  ws.on('open', () => {
    console.log(`[LIVE WSS] Connected (${source})`);
    wsRetries = 0;
    WATCH_PROGRAMS.forEach((program, i) => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0', id: i + 1,
        method:  'logsSubscribe',
        params:  [{ mentions: [program] }, { commitment: 'processed' }],
      }));
    });
  });

  ws.on('message', (raw: any) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.method === 'slotNotification') return;
      if (msg.method !== 'logsNotification')  return;
      const event = parseLogNotification(msg) as any;
      if (!event) return;

      // Broadcast immediately with what we have (signature + type)
      broadcastSSE(event);

      // Enrich async — sends a second message with same id so frontend patches the row
      if (process.env.HELIUS_API && event.signature) {
        enrichEventAmounts(event.signature).then(amounts => {
          if (amounts) {
            broadcastSSE({
              id:        event.id,          // SAME id — frontend matches and patches
              enriched:  true,
              amountSol: amounts.amountSol,
              amountUsd: amounts.amountUsd,
              dex:       amounts.dex,
            });
          }
        }).catch(() => {});
      }
    } catch {}
  });

  ws.on('close', (code: number) => {
    console.warn(`[LIVE WSS] ${source} disconnected (${code}) — reconnecting in 5s`);
    liveWs = null; wsSource = 'none';
    const delay = Math.min(5_000 * Math.pow(2, wsRetries), 60_000);
    wsRetries++;
    setTimeout(initLiveWebSocket, delay);
  });

  ws.on('error', (err: Error) => {
    console.error(`[LIVE WSS] ${source} error: ${err.message}`);
    try { ws.terminate(); } catch {}
    liveWs = null; wsSource = 'none';
    const delay = Math.min(5_000 * Math.pow(2, wsRetries), 60_000);
    wsRetries++;
    setTimeout(initLiveWebSocket, delay);
  });
}

/* Enrich a tx signature with SOL/USD amounts — called async after broadcast */
const _enrichPending = new Set<string>(); // prevent duplicate enrich calls
async function enrichEventAmounts(sig: string): Promise<{ amountSol: number; amountUsd: number; dex: string } | null> {
  if (_enrichPending.has(sig)) return null;
  if (_enrichPending.size > 20) return null; // cap concurrent enrichments
  _enrichPending.add(sig);
  try {
    // Helius enhanced transactions — POST is the correct method
    const res = await axios.post(
      `https://api.helius.xyz/v0/transactions?api-key=${process.env.HELIUS_API || ""}`,
      { transactions: [sig] },
      { timeout: 6000 }
    );
    const tx = (Array.isArray(res.data) ? res.data : [])[0];
    if (!tx) return null;

    const nativeTransfers = tx.nativeTransfers ?? [];
    const tokenTransfers  = tx.tokenTransfers  ?? [];

    // Get real SOL price from cache
    let solPrice = 130;
    try {
      const cached = getCached("admin:sol-price", 60_000);
      if (cached?.price) {
        solPrice = cached.price;
      } else {
        const pr = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
          { timeout: 3000 }
        );
        solPrice = pr.data?.solana?.usd ?? 130;
        setCache("admin:sol-price", { price: solPrice });
      }
    } catch {}

    // Total SOL moved — sum all native transfers
    const amountSol = nativeTransfers.reduce((s: number, t: any) => s + (t.amount ?? 0), 0) / 1e9;

    // USD calculation — try multiple sources
    let amountUsd = 0;

    // 1. Check accountData for fee-payer balance changes (most reliable)
    const accountData: any[] = tx.accountData ?? [];
    const maxChange = accountData.reduce((max: number, a: any) => {
      const change = Math.abs(a.nativeBalanceChange ?? 0) / 1e9;
      return change > max ? change : max;
    }, 0);

    // 2. Stable token transfers are 1:1 USD
    const stableTokens = ['USDC','USDT','BUSD','DAI','USDC.e'];
    const stableAmt = tokenTransfers
      .filter((t: any) => stableTokens.includes((t.symbol ?? '').toUpperCase()))
      .reduce((s: number, t: any) => s + Math.abs(t.tokenAmount ?? 0), 0);

    if (stableAmt > 0) {
      amountUsd = stableAmt;
    } else if (amountSol > 0) {
      amountUsd = amountSol * solPrice;
    } else if (maxChange > 0) {
      amountUsd = maxChange * solPrice;
    }

    const dex = tx.source ?? tx.type ?? '—';
    return { amountSol: parseFloat((amountSol || maxChange).toFixed(4)), amountUsd: Math.round(amountUsd), dex };
  } catch { return null; }
  finally { _enrichPending.delete(sig); }
}

/* Primary: Helius WSS (paid, reliable logsSubscribe)
   Fallback: QuickNode WSS (requires Build plan)       */
function initLiveWebSocket() {
  if (liveWs) return;
  const heliusKey = process.env.HELIUS_API;
  const qnUrl     = process.env.QN_WSS_B;
  if (heliusKey) {
    connectLiveWebSocket(`wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_B || heliusKey}`, 'helius');
  } else if (qnUrl) {
    connectLiveWebSocket(qnUrl, 'qn');
  } else {
    console.warn('[LIVE WSS] No WebSocket credentials — live feed disabled');
  }
}


/* RSS HELPER — no extra dependencies                    */
/* ===================================================== */

function rssTimeAgo(isoDate?: string): string {
  if (!isoDate) return 'recently';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

async function fetchRSS(url: string, source: string, defaultTag: string): Promise<any[]> {
  try {
    const res = await axios.get(url, { timeout: 6_000, headers: { 'User-Agent': 'ProtocolHub/1.0', Accept: 'application/rss+xml,application/xml,text/xml,*/*' } });
    const xml = typeof res.data === 'string' ? res.data : '';
    const items: any[] = [];
    const itemRx = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRx.exec(xml)) !== null) {
      const block = m[1];
      const get = (tag: string) => {
        const cd = new RegExp(`<${tag}>[\\s]*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>[\\s]*<\\/${tag}>`, 'i').exec(block);
        if (cd) return cd[1].trim();
        const pl = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
        return pl ? pl[1].replace(/<[^>]+>/g, '').trim() : '';
      };
      const title   = get('title');
      const pubDate = get('pubDate') || get('dc:date');
      const snippet = (get('description') || get('summary')).slice(0, 260);
      if (!title) continue;
      const body = (title + snippet).toLowerCase();
      let tag = defaultTag;
      if (body.includes('solana') || body.includes(' sol ')) tag = 'SOLANA';
      else if (body.includes('defi') || body.includes('yield') || body.includes('tvl')) tag = 'DEFI';
      else if (body.includes('bitcoin') || body.includes('ethereum') || body.includes(' btc ')) tag = 'MARKET';
      else if (body.includes('web3') || body.includes('nft') || body.includes('dao')) tag = 'WEB3';
      items.push({ title, source, snippet: snippet || title, tag, time: rssTimeAgo(pubDate), publishedAt: pubDate ? new Date(pubDate).getTime() : 0 });
    }
    return items;
  } catch (e: any) { console.warn(`[RSS] ${source}:`, e.message); return []; }
}

/* ===================================================== */
/* ROUTES                                                */
/* ===================================================== */

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  initLiveWebSocket();
  scheduleHubAi();

  // ── Compression (skip SSE — buffering kills real-time stream) ───────────────
  const compression = (await import("compression")).default;
  const isSSE = (req: any) => req.path === '/api/protocol/live-stream';
  app.use((req: any, res: any, next: any) => {
    if (isSSE(req)) return next();
    return compression({ level: 6, threshold: 1024 })(req, res, next);
  });

  // ── Security headers (skip SSE) ───────────────────────────────────────────
  const helmet = (await import("helmet")).default;
  app.use((req: any, res: any, next: any) => {
    if (isSSE(req)) return next();
    return helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } })(req, res, next);
  });

  // ── CORS (skip SSE — the route itself sets Access-Control-Allow-Origin: *) ─
  const cors = (await import("cors")).default;
  app.use((req: any, res: any, next: any) => {
    if (isSSE(req)) return next();
    return cors({
      origin: [
        /\.replit\.dev$/,
        /\.replit\.app$/,
        process.env.SITE_DOMAIN ? `https://${process.env.SITE_DOMAIN}` : '',
        process.env.SITE_DOMAIN ? `https://www.${process.env.SITE_DOMAIN}` : '',
      ].filter(Boolean),
      credentials: true,
    })(req, res, next);
  });

  // ── Keep-alive ────────────────────────────────────────────────────────────
  app.use((req: any, res: any, next: any) => {
    if (!isSSE(req)) {
      res.set("Connection", "keep-alive");
      res.set("Keep-Alive", "timeout=30, max=100");
    }
    next();
  });

  // ── JSON body limit ───────────────────────────────────────────────────────
  app.use(express.json({ limit: "50kb" }));
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));

  app.use(cookieParser());
  app.use(globalLimiter);
  app.use("/api/admin", adminLimiter);

  // Access log middleware — records authenticated requests for threat detection
  // Only logs when wallet is present in session; skips auth routes to avoid noise
  app.use((req: any, _res: any, next: any) => {
    const wallet = req.session?.wallet || req.cookies?.wallet;
    if (wallet && !req.path.includes("/auth/")) {
      try {
        db.prepare("INSERT INTO access_log (wallet, path) VALUES (?, ?)").run(wallet, req.path);
      } catch {}
    }
    next();
  });

  // ── Existing posts ─────────────────────────────────
  app.get(api.posts.list.path, async (_req, res) => {
    res.json(await storage.getPosts());
  });
  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getPostBySlug(req.params.slug);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  });
  app.post(api.posts.create.path, async (req, res) => {
    try {
      const input = api.posts.create.input.parse(req.body);
      res.status(201).json(await storage.createPost(input));
    } catch (err) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      throw err;
    }
  });

  // ── Pulse ──────────────────────────────────────────
  app.get("/api/pulse", apiLimiter, async (_req, res) => {
    try { res.json(await fetchPulseOnce()); }
    catch { res.status(503).json({ success: false }); }
  });

  // ── Auth ───────────────────────────────────────────
  // ── Auth: Login (step 1 — password) ───────────────
  app.post("/api/auth/login", checkIpBlock, authLimiter, (req: any, res: any) => {
    const { password } = req.body;
    if (!password) return res.status(401).json({ error: "Password required" });

    // Determine role from password
    let role: string | null = null;
    const OWNER_PW    = process.env.OWNER_PASSWORD;
    const ADMIN_PW    = process.env.ADMIN_PASSWORD;
    const MOD_PW      = process.env.MODERATOR_PASSWORD;

    if (OWNER_PW && password === OWNER_PW)       role = "owner";
    else if (ADMIN_PW && password === ADMIN_PW)  role = "admin";
    else if (MOD_PW && password === MOD_PW)      role = "moderator";

    if (!role) {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      logSecurity.run('FAILED_LOGIN', ip, null,
        `Failed login attempt — wrong password from ${ip}`, 'medium');
      logAudit.run('FAILED_LOGIN', 'unknown', null, `Failed login from IP: ${ip}`);
      return res.status(401).json({ error: "Invalid password" });
    }

    // Moderators — no TOTP, grant session immediately
    if (role === "moderator") {
      const token     = crypto.randomBytes(48).toString("hex");
      const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
      db.prepare(`INSERT INTO admin_sessions (token, expires_at, role, totp_verified) VALUES (?, ?, ?, 1)`).run(token, expiresAt, role);
      res.cookie("admin_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 60 * 60 * 8 * 1000 });
      logAudit.run("LOGIN", role, null, `${role} session started`);
      return res.json({ success: true, role, requiresTotp: false });
    }

    // Owner/Admin — issue a temp token pending TOTP verification
    const tempToken = crypto.randomBytes(48).toString("hex");
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
    db.prepare(`INSERT INTO admin_sessions (token, expires_at, role, totp_verified) VALUES (?, ?, ?, 0)`).run(tempToken, expiresAt, role);
    return res.json({ success: true, role, requiresTotp: true, tempToken });
  });

  // ── Auth: Verify TOTP (step 2) ──────────────────────
  app.post("/api/auth/totp", checkIpBlock, authLimiter, (req: any, res: any) => {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) return res.status(400).json({ error: "Token and code required" });

    const session = db.prepare(`SELECT * FROM admin_sessions WHERE token=? AND totp_verified=0 AND expires_at > strftime('%s','now')`).get(tempToken) as any;
    if (!session) return res.status(401).json({ error: "Invalid or expired session" });

    // Get the correct TOTP secret for this role
    const secret = session.role === "owner"
      ? process.env.OWNER_TOTP_SECRET
      : process.env.ADMIN_TOTP_SECRET;
    if (!secret) return res.status(500).json({ error: "TOTP not configured" });

    // Verify TOTP code — manual HMAC-SHA1 implementation (no external lib needed)
    const verifyTotp = (secret: string, token: string): boolean => {
      const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let bits = 0, value = 0;
      const bytes: number[] = [];
      for (const char of secret.toUpperCase()) {
        const idx = base32Chars.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
      }
      const keyBuf = Buffer.from(bytes);
      const counter = Math.floor(Date.now() / 1000 / 30);
      // Check current window + ±1 for clock drift
      for (const offset of [-1, 0, 1]) {
        const buf = Buffer.alloc(8);
        buf.writeUInt32BE(0, 0);
        buf.writeUInt32BE(counter + offset, 4);
        const hmac = crypto.createHmac("sha1", keyBuf).update(buf).digest();
        const offset2 = hmac[hmac.length - 1] & 0xf;
        const otp = ((hmac.readUInt32BE(offset2) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
        if (otp === token) return true;
      }
      return false;
    };

    if (!verifyTotp(secret, code.toString().trim())) {
      return res.status(401).json({ error: "Invalid authenticator code" });
    }

    // Mark TOTP verified, set cookie
    setTotpVerified.run(tempToken);
    res.cookie("admin_token", tempToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 60 * 60 * 8 * 1000 });
    logAudit.run("LOGIN", session.role, null, `${session.role} session verified via TOTP`);
    return res.json({ success: true, role: session.role });
  });

  app.post("/api/auth/logout", requireAdmin, (req: any, res: any) => {
    deleteSession.run(req.adminToken);
    // Must pass same options as when cookie was set — otherwise browser ignores it
    res.clearCookie("admin_token", {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "strict",
      path:     "/",
    });
    return res.json({ success: true });
  });

  app.get("/api/auth/verify", requireAdmin, (req: any, res: any) => {
    const session = getSessionFull.get(req.adminToken) as any;
    return res.json({ success: true, authenticated: true, role: session?.role || "admin" });
  });

  // ── Gate control (owner only) ────────────────────────
  app.get("/api/admin/gate", requireAdmin, (_req: any, res: any) => {
    const gate = getGateSettings.get() as any;
    return res.json({ gateLive: !!gate?.gate_live, gateLocked: !!gate?.gate_locked });
  });

  app.post("/api/admin/gate/toggle", requireAdmin, (req: any, res: any) => {
    const session = getSessionFull.get(req.adminToken) as any;
    if (session?.role !== "owner") return res.status(403).json({ error: "Owner only" });
    const gate = getGateSettings.get() as any;
    if (gate?.gate_locked) return res.status(403).json({ error: "Gate is permanently locked" });
    const newState = req.body.live ? 1 : 0;
    setGateLive.run(newState);
    logAudit.run(newState ? "GATE_ON" : "GATE_OFF", "owner", null, `Gate ${newState ? "enabled" : "disabled"}`);
    return res.json({ success: true, gateLive: !!newState });
  });

  app.post("/api/admin/gate/lock", requireAdmin, (req: any, res: any) => {
    const session = getSessionFull.get(req.adminToken) as any;
    if (session?.role !== "owner") return res.status(403).json({ error: "Owner only" });
    const { confirm } = req.body;
    if (confirm !== "LOCK PERMANENTLY") return res.status(400).json({ error: "Type LOCK PERMANENTLY to confirm" });
    lockGatePermanent.run();
    logAudit.run("GATE_LOCKED", "owner", null, "Gate permanently locked — cannot be disabled");
    return res.json({ success: true, gateLocked: true });
  });

  // ── Whitelist (owner + admin can add, owner only can revoke) ─
  app.get("/api/admin/whitelist", requireAdmin, (_req: any, res: any) => {
    const now = Math.floor(Date.now() / 1000);
    const entries = (getWhitelist.all() as any[]).map(w => ({
      ...w,
      granted_at: w.granted_at ? new Date(w.granted_at * 1000).toISOString() : null,
      expires_at: w.expires_at ? new Date(w.expires_at * 1000).toISOString() : null,
      is_expired: w.expires_at && !w.permanent ? w.expires_at < now : false,
    }));
    return res.json({ whitelist: entries });
  });

  // ── Whitelist: request (admin) / direct action (owner) ──
  app.post("/api/admin/whitelist/request", requireAdmin, (req: any, res: any) => {
    const { action, wallet, tier, note, days, permanent, reason } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet required" });
    if (!reason?.trim()) return res.status(400).json({ error: "Reason required" });
    if (!["add","revoke","restore"].includes(action)) return res.status(400).json({ error: "Invalid action" });
    if (wallet === process.env.FOUNDER_WALLET && action === "revoke")
      return res.status(403).json({ error: "Founder wallet cannot be revoked" });

    if (req.adminRole === "owner") {
      // Owner acts immediately
      if (action === "add") {
        const expiresAt = permanent ? null : Math.floor(Date.now() / 1000) + (days || 30) * 86400;
        addWhitelist.run(wallet, tier || "bronze", note || null, expiresAt, permanent ? 1 : 0, "owner");
      } else if (action === "revoke") {
        const serial = generateSerial(wallet, "WL");
        revokeWhitelist.run(reason.trim(), serial, wallet);
      } else if (action === "restore") {
        restoreWhitelist.run(wallet);
      }
      logAudit.run("WHITELIST_" + action.toUpperCase(), "owner", wallet, reason.trim());
      return res.json({ success: true, approved: true });
    }

    // Admin — create pending request for owner approval
    createWlRequest.run(action, wallet, tier || "bronze", note || null, days || 30, permanent ? 1 : 0, reason.trim(), req.adminRole);
    logAudit.run("WHITELIST_REQUEST_" + action.toUpperCase(), req.adminRole, wallet, reason.trim());
    return res.json({ success: true, pending: true, message: "Request submitted — awaiting owner approval" });
  });

  // ── Whitelist: list all requests ───────────────────
  app.get("/api/admin/whitelist/requests", requireAdmin, (_req: any, res: any) => {
    const all = getWhitelistRequests.all() as any[];
    return res.json({
      requests: all.map(r => ({ ...r, created_at: new Date(r.created_at * 1000).toISOString() })),
      pendingCount: all.filter(r => r.status === "pending").length
    });
  });

  // ── Whitelist: owner approves request ──────────────
  app.post("/api/admin/whitelist/approve", requireOwner, (req: any, res: any) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Request ID required" });
    const r = db.prepare("SELECT * FROM whitelist_requests WHERE id=? AND status='pending'").get(id) as any;
    if (!r) return res.status(404).json({ error: "Pending request not found" });
    if (r.wallet === process.env.FOUNDER_WALLET && r.action === "revoke")
      return res.status(403).json({ error: "Founder wallet cannot be revoked" });

    if (r.action === "add") {
      const expiresAt = r.permanent ? null : Math.floor(Date.now() / 1000) + (r.days || 30) * 86400;
      addWhitelist.run(r.wallet, r.tier || "bronze", r.note || null, expiresAt, r.permanent, "owner");
    } else if (r.action === "revoke") {
      const serial = generateSerial(r.wallet, "WL");
      revokeWhitelist.run(r.reason, serial, r.wallet);
    } else if (r.action === "restore") {
      restoreWhitelist.run(r.wallet);
    }

    updateWlRequest.run("approved", "owner", null, id);
    logAudit.run("WHITELIST_" + r.action.toUpperCase() + "_APPROVED", "owner", r.wallet,
      "Approved request #" + id + " from " + r.requested_by + ": " + r.reason);
    return res.json({ success: true });
  });

  // ── Whitelist: owner denies request ────────────────
  app.post("/api/admin/whitelist/deny", requireOwner, (req: any, res: any) => {
    const { id, denyReason } = req.body;
    if (!id) return res.status(400).json({ error: "Request ID required" });
    const r = db.prepare("SELECT * FROM whitelist_requests WHERE id=? AND status='pending'").get(id) as any;
    if (!r) return res.status(404).json({ error: "Pending request not found" });

    updateWlRequest.run("denied", "owner", denyReason || null, id);
    logAudit.run("WHITELIST_" + r.action.toUpperCase() + "_DENIED", "owner", r.wallet,
      "Denied request #" + id + " from " + r.requested_by + ". Reason: " + (denyReason || "none given"));
    return res.json({ success: true });
  });

  // ── Admin ──────────────────────────────────────────
  app.get("/api/admin/overview", requireAdmin, async (_req: any, res: any) => {
    const mintStats   = getMintCount.get() as any;
    const totalMinted = mintStats?.total_minted || 0;
    const deltaStat   = getActiveHoldersDelta.get() as any;

    // Fetch live SOL price from CoinGecko (30s cache)
    let solPrice: number | null = null;
    const solCacheKey = "admin:sol-price";
    const solCached   = getCached(solCacheKey, 30_000);
    if (solCached) {
      solPrice = solCached.price;
    } else {
      try {
        const r = await axios.get(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
          process.env.CG_API_ ? { headers: { "x-cg-demo-api-key": process.env.CG_API_ } } : {}
        );
        solPrice = r.data?.solana?.usd ?? null;
        if (solPrice) setCache(solCacheKey, { price: solPrice });
      } catch {}
    }

    // Revenue by month — from real mint data
    const rawMonths = getRevenueByMonth.all() as any[];
    const revenueByMonth = rawMonths.map(r => ({
      month: new Date(r.month + "-01").toLocaleString("en", { month: "short" }),
      rev:   r.rev || 0,
    }));

    // Active holder delta (today vs yesterday % change)
    const todayActive     = deltaStat?.today     || 0;
    const yesterdayActive = deltaStat?.yesterday || 0;
    const activeHoldersDelta = yesterdayActive > 0
      ? Math.round(((todayActive - yesterdayActive) / yesterdayActive) * 100)
      : null;

    return res.json({
      totalHolders:        (getAllHolders.all() as any[]).length,
      activeHolders:       (getActiveHolders.all() as any[]).length,
      revokedHolders:      (getRevokedHolders.all() as any[]).length,
      totalMinted,
      remainingEarly:      Math.max(0, 2000 - totalMinted),
      currentPrice:        totalMinted < 2000 ? 40 : 70,
      pendingAppeals:         (getAppeals.all() as any[]).filter((a: any) => a.status === "pending").length,
      pendingWhitelistRequests: (db.prepare(`SELECT COUNT(*) as c FROM whitelist_requests WHERE status='pending'`).get() as any)?.c || 0,
      panelStats:          getPanelStats.all(),
      featureStats:        getFeatureStats.all(),
      dailyStats:          getDailyStats.all(),
      solPrice,
      revenueByMonth,
      activeHoldersDelta,
    });
  });

  app.get("/api/admin/holders", requireAdmin, (req: any, res: any) => {
    const { filter } = req.query;
    let holders: any[] = filter === "active" ? getActiveHolders.all() as any[]
      : filter === "revoked" ? getRevokedHolders.all() as any[]
      : getAllHolders.all() as any[];
    const now = Math.floor(Date.now() / 1000);
    holders = holders.map(h => ({
      ...h,
      granted_at: h.granted_at ? new Date(h.granted_at * 1000).toISOString() : null,
      expires_at: h.expires_at ? new Date(h.expires_at * 1000).toISOString() : null,
      revoked_at: h.revoked_at ? new Date(h.revoked_at * 1000).toISOString() : null,
      is_expired: h.expires_at ? h.expires_at < now : false,
    }));
    return res.json({ holders, count: holders.length });
  });

  app.post("/api/admin/revoke", requireAdmin, (req: any, res: any) => {
    const { wallet, reason, serial } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet required" });
    if (guardFounder(wallet, res)) return;
    if (!reason || reason.trim().length < 5) return res.status(400).json({ error: "Reason too short" });
    const revokeSerial = serial || `RVK-${wallet.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    revokeAccess.run(reason.trim(), revokeSerial, req.adminRole || "admin", wallet);
    logAudit.run("REVOKE", req.adminRole || "admin", wallet, `Serial: ${revokeSerial} — ${reason.trim()}`);
    return res.json({ success: true, serial: revokeSerial });
  });

  app.post("/api/admin/restore", requireAdmin, (req: any, res: any) => {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet required" });
    restoreAccess.run(wallet);
    logAudit.run("RESTORE", "admin", wallet, "Manual access restore");
    return res.json({ success: true });
  });

  app.get("/api/admin/appeals", requireAdmin, (_req: any, res: any) => {
    const appeals = (getAppeals.all() as any[]).map(a => ({
      ...a, created_at: new Date(a.created_at * 1000).toISOString(),
    }));
    return res.json({ appeals });
  });

  app.post("/api/admin/appeals/:id", requireAdmin, (req: any, res: any) => {
    const { status } = req.body;
    if (!["pending", "approved", "denied"].includes(status))
      return res.status(400).json({ error: "Invalid status" });
    updateAppeal.run(status, req.params.id);
    const allAppeals = getAppeals.all() as any[];
    const appeal     = allAppeals.find((a: any) => a.id === parseInt(req.params.id));
    if (status === "approved" && appeal?.wallet) {
      restoreAccess.run(appeal.wallet);
      logAudit.run("APPEAL_APPROVE", "admin", appeal.wallet, `Appeal #${req.params.id} approved — access restored`);
    } else if (appeal?.wallet) {
      logAudit.run("APPEAL_DENY", "admin", appeal.wallet, `Appeal #${req.params.id} denied`);
    }
    return res.json({ success: true });
  });


  // ── Admin: API Health ──────────────────────────────
  // Pings each external service and returns real latency + status
  app.get("/api/admin/api-health", requireAdmin, async (_req: any, res: any) => {
    const SERVICES = [
      { name: "Helius RPC",     key: "HELIUS_API",       url: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API || ""}`, method: "POST", body: JSON.stringify({ jsonrpc:"2.0", id:1, method:"getSlot", params:[] }), headers: { "Content-Type":"application/json" } },
      { name: "Birdeye",        key: "BIRD_API",         url: "https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=1", method: "GET", headers: { "X-API-KEY": process.env.BIRD_API || "" } },
      { name: "CoinGecko",      key: "CG_API_",          url: "https://api.coingecko.com/api/v3/ping", method: "GET", headers: process.env.CG_API_ ? { "x-cg-demo-api-key": process.env.CG_API_ } : {} },
      { name: "DexScreener",    key: "—",                url: "https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112", method: "GET", headers: {} },
      { name: "GoPlus",         key: "—",                url: "https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", method: "GET", headers: {} },
      { name: "Tenderly",       key: "T_SIM_",           url: "https://api.tenderly.co/api/v1/user", method: "GET", headers: { "X-Access-Key": process.env.T_SIM_ || "" } },
      { name: "CryptoPanic",    key: "CRYPTOPANIC_API",  url: `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${process.env.CRYPTOPANIC_API || ""}&limit=1&public=true`, method: "GET", headers: {} },
      { name: "DeFiLlama",      key: "—",                url: "https://api.llama.fi/protocols", method: "GET", headers: {} },
      { name: "QuickNode WSS",  key: "QN_WSS_B",         url: null, method: null, headers: {} }, // WSS — use cached state
      { name: "Moralis",        key: "M_API_",           url: "https://solana-gateway.moralis.io/account/mainnet/So11111111111111111111111111111111111111112/balance", method: "GET", headers: { "X-API-Key": process.env.M_API_ || "", "Accept": "application/json" } },
      { name: "Groq AI",        key: "GROQ_API_KEY",     url: "https://api.groq.com/openai/v1/models", method: "GET", headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY || ""}` } },
    ];

    const results = await Promise.all(SERVICES.map(async (svc) => {
      if (!svc.url) {
        // QuickNode WSS — infer from live WebSocket state
        return { name: svc.name, key: svc.key, status: "ok", latency: null, lastSuccess: Date.now() };
      }

      // For services where the ping endpoint requires strict auth or has no public
      // health URL, treat a missing env key as "unknown" and a network reach as "ok"
      const keyVal = svc.key !== "—" ? process.env[svc.key] : "public";
      if (svc.key !== "—" && !keyVal) {
        return { name: svc.name, key: svc.key, status: "unknown", latency: null, lastSuccess: null };
      }

      const start = Date.now();
      try {
        const fetchOpts: any = { method: svc.method, headers: svc.headers, signal: AbortSignal.timeout(6000) };
        if (svc.body) fetchOpts.body = svc.body;
        const r = await fetch(svc.url, fetchOpts);
        const latency = Date.now() - start;
        // 401/403 means the API is reachable and our key is recognised (or wrong)
        // but the service itself is UP — only 5xx or network errors = down
        const reachable = r.status < 500;
        const status = !reachable ? "down" : r.ok ? (latency > 800 ? "warn" : "ok") : "warn";
        return { name: svc.name, key: svc.key, status, latency, lastSuccess: reachable ? Date.now() : null };
      } catch {
        return { name: svc.name, key: svc.key, status: "down", latency: null, lastSuccess: null };
      }
    }));

    return res.json({ services: results });
  });

  // ── Admin: Threats ─────────────────────────────────
  app.get("/api/admin/threats", requireAdmin, (_req: any, res: any) => {
    try {
      const lookback = "'-7 days'"; // 7-day look-back

      // 1. Failed login attempts
      const failedLogins: any[] = db.prepare(`
        SELECT ip, COUNT(*) as attempts,
               MIN(datetime(created_at, 'unixepoch')) as first_seen,
               MAX(datetime(created_at, 'unixepoch')) as last_seen
        FROM security_log
        WHERE event_type='FAILED_LOGIN'
          AND created_at > strftime('%s','now',${lookback})
        GROUP BY ip
        ORDER BY attempts DESC LIMIT 30
      `).all();

      // 2. Brute force / IP blocks
      const bruteForce: any[] = db.prepare(`
        SELECT ip, COUNT(*) as attempts,
               MIN(datetime(created_at, 'unixepoch')) as first_seen,
               MAX(datetime(created_at, 'unixepoch')) as last_seen
        FROM security_log
        WHERE event_type IN ('BRUTE_FORCE','IP_BLOCKED')
          AND created_at > strftime('%s','now',${lookback})
        GROUP BY ip
        ORDER BY attempts DESC LIMIT 20
      `).all();

      // 3. Currently blocked IPs
      const blockedIps: any[] = db.prepare(`
        SELECT * FROM ip_blocks
        WHERE unblocked=0 AND (expires_at IS NULL OR expires_at > strftime('%s','now'))
        ORDER BY blocked_at DESC LIMIT 20
      `).all();

      // 4. Revoked wallet bypass attempts
      const revokedBypass: any[] = db.prepare(`
        SELECT wallet, ip, COUNT(*) as attempts,
               MIN(datetime(created_at, 'unixepoch')) as first_seen,
               MAX(datetime(created_at, 'unixepoch')) as last_seen
        FROM security_log
        WHERE event_type='REVOKED_ACCESS'
          AND created_at > strftime('%s','now',${lookback})
        GROUP BY wallet
        ORDER BY attempts DESC LIMIT 20
      `).all();

      // 5. Rate abuse (high req count wallets)
      const rateAbuse: any[] = db.prepare(`
        SELECT wallet, COUNT(*) as req_count,
               MIN(created_at) as first_seen,
               MAX(created_at) as last_seen
        FROM access_log
        WHERE created_at > datetime('now', '-24 hours')
        GROUP BY wallet
        HAVING COUNT(*) > 200
        ORDER BY req_count DESC LIMIT 20
      `).all();

      // 6. Summary counts
      const summary = {
        failedLoginsToday: (db.prepare(`
          SELECT COUNT(*) as c FROM security_log
          WHERE event_type='FAILED_LOGIN' AND created_at > strftime('%s','now','-1 day')
        `).get() as any)?.c || 0,
        blockedIpsActive: (db.prepare(`
          SELECT COUNT(*) as c FROM ip_blocks
          WHERE unblocked=0 AND (expires_at IS NULL OR expires_at > strftime('%s','now'))
        `).get() as any)?.c || 0,
        revokedBypass7d: (db.prepare(`
          SELECT COUNT(*) as c FROM security_log
          WHERE event_type='REVOKED_ACCESS' AND created_at > strftime('%s','now','-7 days')
        `).get() as any)?.c || 0,
        criticalEvents24h: (db.prepare(`
          SELECT COUNT(*) as c FROM security_log
          WHERE severity='critical' AND created_at > strftime('%s','now','-1 day')
        `).get() as any)?.c || 0,
      };

      return res.json({ summary, failedLogins, bruteForce, blockedIps, revokedBypass, rateAbuse });
    } catch (e: any) {
      return res.json({ summary: {}, failedLogins: [], bruteForce: [], blockedIps: [], revokedBypass: [], rateAbuse: [], error: e.message });
    }
  });

  // Owner — unblock an IP
  app.post("/api/admin/threats/unblock", requireOwner, (req: any, res: any) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: "ip required" });
    db.prepare(`UPDATE ip_blocks SET unblocked=1 WHERE ip=?`).run(ip);
    logAudit.run("IP_UNBLOCKED", "owner", null, `IP ${ip} manually unblocked`);
    return res.json({ success: true });
  });

  // Owner — download monthly log as CSV
  app.get("/api/admin/logs/download/:month", requireOwner, (req: any, res: any) => {
    const { month } = req.params; // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid month format" });

    try {
      // Combine audit + security log for the month
      const auditRows: any[] = db.prepare(`
        SELECT datetime(created_at) as timestamp, 'AUDIT' as log_type,
               action as event, admin as actor, wallet, detail
        FROM admin_audit
        WHERE strftime('%Y-%m', created_at) = ?
        ORDER BY created_at ASC
      `).all(month);

      const secRows: any[] = db.prepare(`
        SELECT datetime(created_at, 'unixepoch') as timestamp, 'SECURITY' as log_type,
               event_type as event, ip as actor, wallet, detail
        FROM security_log
        WHERE strftime('%Y-%m', datetime(created_at, 'unixepoch')) = ?
        ORDER BY created_at ASC
      `).all(month);

      const allRows = [...auditRows, ...secRows].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      if (allRows.length === 0) {
        return res.status(404).json({ error: "No logs found for this month" });
      }

      // Build CSV
      const headers = ["TIMESTAMP (UTC)", "LOG TYPE", "EVENT", "ACTOR / IP", "WALLET", "DETAIL"];
      const rows = allRows.map(r => [
        r.timestamp,
        r.log_type,
        r.event,
        r.actor || "—",
        r.wallet || "—",
        (r.detail || "").replace(/,/g, ";").replace(/\n/g, " "),
      ].map(v => `"${v}"`).join(","));

      const csv = [
        `"PROTOCOLHUB ADMIN LOG — ${month}"`,
        `"Generated: ${new Date().toISOString()}"`,
        `"Total records: ${allRows.length}"`,
        "",
        headers.map(h => `"${h}"`).join(","),
        ...rows,
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="protocolhub-log-${month}.csv"`);
      return res.send(csv);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // List available log months
  app.get("/api/admin/logs/months", requireOwner, (_req: any, res: any) => {
    const auditMonths: any[] = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', created_at) as month,
             COUNT(*) as records
      FROM admin_audit GROUP BY month ORDER BY month DESC
    `).all();
    const secMonths: any[] = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', datetime(created_at, 'unixepoch')) as month,
             COUNT(*) as records
      FROM security_log GROUP BY month ORDER BY month DESC
    `).all();
    // Merge months
    const merged: Record<string, number> = {};
    [...auditMonths, ...secMonths].forEach(r => {
      merged[r.month] = (merged[r.month] || 0) + r.records;
    });
    const months = Object.entries(merged)
      .map(([month, records]) => ({ month, records }))
      .sort((a, b) => b.month.localeCompare(a.month));
    return res.json({ months });
  });

  // ── Admin: Audit Log ───────────────────────────────
  // Reads from the admin_audit table — every admin action
  app.get("/api/admin/audit-log", requireAdmin, (_req: any, res: any) => {
    try {
      const entries: any[] = db.prepare(`
        SELECT id, action, admin, wallet, detail,
               strftime('%s', created_at) * 1000 as ts
        FROM admin_audit
        ORDER BY created_at DESC
        LIMIT 200
      `).all();
      return res.json({ entries });
    } catch (e: any) {
      return res.json({ entries: [], error: e.message });
    }
  });

  // ── Audit logger helper — call this on every admin action ──

  /* ─────────────────────────────────────────────────────────────────────────
     PUBLIC GATE STATUS — frontend polls this on load (no auth required)
     Returns: { gateLive, gateOff }
  ───────────────────────────────────────────────────────────────────────── */

  /* =================================================== */
  /* FEATURE FLAGS                                        */
  /* Public: GET /api/features — all flag statuses        */
  /* Admin:  POST /api/admin/features/request            */
  /* Owner:  POST /api/admin/features/approve            */
  /*         POST /api/admin/features/deny               */
  /* =================================================== */

  // Public — frontend checks this on load
  app.get("/api/features", (_req: any, res: any) => {
    res.set("Cache-Control", "public, max-age=30");
    const flags = getAllFlags.all() as any[];
    const map: Record<string, string> = {};
    flags.forEach((f: any) => { map[f.key] = f.status; });
    return res.json(map);
  });

  // Admin — request unlock (sends to owner for approval)
  app.post("/api/admin/features/request", requireAdmin, (req: any, res: any) => {
    const { key, notes } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    const flag = getFlag.get(key) as any;
    if (!flag) return res.status(404).json({ error: "Feature not found" });
    if (flag.status === "unlocked") return res.status(400).json({ error: "Already unlocked" });
    setFlagStatus.run("pending_unlock", req.adminRole || "admin", key);
    logAudit.run("FEATURE_REQUEST", req.adminRole, null, `Requested unlock: ${key}${notes ? ` — ${notes}` : ""}`);
    return res.json({ success: true, message: "Unlock request sent to owner" });
  });

  // Owner only — approve unlock
  app.post("/api/admin/features/approve", requireOwner, (req: any, res: any) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    approveFlag.run("owner", key);
    logAudit.run("FEATURE_APPROVED", "owner", null, `Approved unlock: ${key}`);
    return res.json({ success: true, message: `${key} is now live` });
  });

  // Owner only — deny unlock request
  app.post("/api/admin/features/deny", requireOwner, (req: any, res: any) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    denyFlag.run(key);
    logAudit.run("FEATURE_DENIED", "owner", null, `Denied unlock: ${key}`);
    return res.json({ success: true, message: `${key} request denied` });
  });

  // Admin — get all flags with full details
  app.get("/api/admin/features", requireAdmin, (_req: any, res: any) => {
    return res.json({ flags: getAllFlags.all() });
  });


  /* =================================================== */
  /* DYNAMIC NFT METADATA                                 */
  /* GET /api/nft/metadata/:tokenId                       */
  /* Called by Magic Eden, wallets, marketplaces          */
  /* Returns live points, tier, tenure for each NFT       */
  /* =================================================== */

  app.get("/api/nft/metadata/:tokenId", (req: any, res: any) => {
    const { tokenId } = req.params;
    const id = parseInt(tokenId);

    // Set cache headers — marketplaces cache this
    // 1 hour cache means points show within 1hr of update
    res.set("Cache-Control", "public, max-age=3600");

    try {
      // Find NFT holder by mint number
      const record = db.prepare(
        `SELECT * FROM nft_access WHERE mint_number=? LIMIT 1`
      ).get(id) as any;

      // Base metadata — same image and description for all
      const base = {
        name:         `Protocol Genesis #${id}`,
        symbol:       "PGEN",
        description:  "ProtocolHub Genesis — Pioneer access pass to ProtocolHub: The Vast Network. Grants full platform access.",
        image:        process.env.NFT_IMAGE_URI || "https://purple-petite-rooster-763.mypinata.cloud/ipfs/bafybeidb4z3iootvdvys35ls5s72qma6xvakraz3sam2apnoteg3vbrjwy",
        external_url: `https://${process.env.SITE_DOMAIN || "inku.riker.replit.dev"}`,
        seller_fee_basis_points: 600,
        properties: {
          files: [{
            uri:  process.env.NFT_IMAGE_URI || "https://purple-petite-rooster-763.mypinata.cloud/ipfs/bafybeidb4z3iootvdvys35ls5s72qma6xvakraz3sam2apnoteg3vbrjwy",
            type: "image/png",
          }],
          category: "image",
        },
      };

      if (!record) {
        // Token not yet minted or wallet not in DB — return base metadata
        return res.json({
          ...base,
          attributes: [
            { trait_type: "Tier",           value: "Bronze"        },
            { trait_type: "Type",           value: "Genesis"       },
            { trait_type: "Access",         value: "Full Platform" },
            { trait_type: "Series",         value: "Pioneer"       },
            { trait_type: "Status",         value: "Unminted"      },
            { trait_type: "Points Balance", value: "0"             },
          ],
        });
      }

      // Calculate tenure
      const now         = Math.floor(Date.now() / 1000);
      const grantedAt   = record.granted_at ?? now;
      const tenureDays  = Math.floor((now - grantedAt) / 86400);
      const tenureLabel = tenureDays < 30  ? "New Member"
        : tenureDays < 90  ? "1+ Month"
        : tenureDays < 180 ? "3+ Months"
        : tenureDays < 365 ? "6+ Months"
        : "1+ Year";

      // Points balance
      const points  = record.points_balance ?? 0;
      const earned  = record.points_earned_total ?? 0;

      // Tier
      const tier    = record.tier ?? "bronze";
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

      // Status
      const isExpired = record.expires_at && record.expires_at < now;
      const isRevoked = !!record.revoked;
      const status    = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";

      // Renewal count
      const renewals = record.renewal_count ?? 0;

      return res.json({
        ...base,
        attributes: [
          { trait_type: "Tier",             value: tierLabel                    },
          { trait_type: "Type",             value: "Genesis"                    },
          { trait_type: "Access",           value: "Full Platform"              },
          { trait_type: "Series",           value: "Pioneer"                    },
          { trait_type: "Status",           value: status                       },
          { trait_type: "Points Balance",   value: points.toString()            },
          { trait_type: "Points Earned",    value: earned.toString()            },
          { trait_type: "Member Since",     value: tenureLabel                  },
          { trait_type: "Tenure Days",      value: tenureDays.toString()        },
          { trait_type: "Renewals",         value: renewals.toString()          },
          { trait_type: "Mint Number",      value: id.toString()                },
          { trait_type: "Price Tier",       value: id <= 2000 ? "Early ($40)" : "Public ($70)" },
        ],
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/gate/status", (req: any, res: any) => {
    // Lightweight DB call — set cache headers so browser caches for 15s
    res.set('Cache-Control', 'public, max-age=15');
    const gate = getGateSettings.get() as any;
    return res.json({ gateLive: !!gate?.gate_live, gateLocked: !!gate?.gate_locked });
  });

  /* ─────────────────────────────────────────────────────────────────────────
     REQUIRE-GATE MIDDLEWARE — applied to all panel data routes
     When gate is live:  wallet header must be present + pass /nft/check
     When gate is off:   passes through freely
     Header: X-Wallet: <base58 public key>
  ───────────────────────────────────────────────────────────────────────── */
  function requireGate(req: any, res: any, next: any) {
    const gate = getGateSettings.get() as any;
    if (!gate?.gate_live) return next();          // gate off — let everyone through

    const wallet = req.headers["x-wallet"] as string | undefined;
    if (!wallet) return res.status(401).json({ error: "Gate is active. Connect your wallet.", gated: true });

    const now = Math.floor(Date.now() / 1000);

    // Founder always passes
    if (wallet === process.env.FOUNDER_WALLET) return next();

    // Whitelist check
    const wl = getWhitelistEntry.get(wallet) as any;
    if (wl && !wl.revoked) {
      const wlExpired = wl.expires_at && !wl.permanent && wl.expires_at < now;
      if (!wlExpired) return next();
    }

    // NFT access record check
    const record = getAccess.get(wallet) as any;
    if (!record)           return res.status(403).json({ error: "No NFT access found for this wallet.", gated: true });
    if (record.revoked) {
      const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      logSecurity.run('REVOKED_ACCESS', ip, wallet,
        `Revoked wallet attempted gated access: ${wallet}`, 'high');
      return res.status(403).json({ error: "NFT access revoked.", gated: true });
    }
    if (record.expires_at < now) {
      const graceDays = parseInt(process.env.RENEWAL_GRACE_DAYS || "7");
      const graceEnd  = record.expires_at + (graceDays * 86400);
      if (now > graceEnd) return res.status(403).json({ error: "NFT access expired. Please renew.", gated: true });
      return next(); // still in grace period — allow
    }

    return next(); // valid active NFT
  }

  // Apply requireGate to all panel data routes
  // SSE stream is exempt — browser EventSource cannot send custom headers
  const GATED_PREFIXES = ["/api/network/", "/api/protocol/", "/api/explore/", "/api/search/", "/api/points/"];
  const GATE_EXEMPT    = ["/api/protocol/live-stream"];
  app.use((req: any, res: any, next: any) => {
    if (GATE_EXEMPT.some(p => req.path.startsWith(p))) return next();
    const isGated = GATED_PREFIXES.some(p => req.path.startsWith(p));
    if (isGated) return requireGate(req, res, next);
    return next();
  });

  // Already called inline in /revoke, /restore, /appeals — add if missing

  // ── NFT ────────────────────────────────────────────
  app.get("/api/nft/check/:wallet", (req: any, res: any) => {
    const { wallet } = req.params;
    const now  = Math.floor(Date.now() / 1000);
    const gate = getGateSettings.get() as any;

    // Founder wallet always has access
    if (wallet === process.env.FOUNDER_WALLET) {
      return res.json({ hasAccess: true, status: "active", tier: "owner", isFounder: true, wallet });
    }

    // Gate off — everyone gets in
    if (!gate?.gate_live) {
      return res.json({ hasAccess: true, status: "active", tier: "bronze", gateOff: true, wallet });
    }

    // Check whitelist
    const wl = getWhitelistEntry.get(wallet) as any;
    if (wl && !wl.revoked) {
      const wlExpired = wl.expires_at && !wl.permanent && wl.expires_at < now;
      if (!wlExpired) {
        return res.json({ hasAccess: true, status: "active", tier: wl.tier, isWhitelisted: true,
          expiresAt: wl.expires_at ? new Date(wl.expires_at * 1000).toISOString() : null,
          permanent: !!wl.permanent, wallet });
      }
    }

    // Check NFT access record
    const record = getAccess.get(wallet) as any;
    if (!record) return res.json({ hasAccess: false, status: "none", wallet });
    if (record.revoked) return res.json({ hasAccess: false, status: "revoked",
      reason: record.revoke_reason, serial: record.revoke_serial,
      revokedAt: new Date(record.revoked_at * 1000).toISOString(),
      appealEmail: process.env.APPEAL_EMAIL, wallet });

    // Grace period logic
    if (record.expires_at < now) {
      const graceDays = parseInt(process.env.RENEWAL_GRACE_DAYS || "7");
      const graceEnd  = record.expires_at + (graceDays * 86400);
      const inGrace   = now < graceEnd;
      return res.json({ hasAccess: false, status: "expired",
        expiredAt: new Date(record.expires_at * 1000).toISOString(),
        graceEnd:  new Date(graceEnd * 1000).toISOString(),
        inGrace, tier: record.tier, originalPrice: record.original_price,
        priceLocked: inGrace ? !!record.price_locked : false, wallet });
    }

    return res.json({ hasAccess: true, status: "active", tier: record.tier,
      mintAddress: record.mint_address, mintNumber: record.mint_number,
      expiresAt:   new Date(record.expires_at * 1000).toISOString(),
      daysLeft:    Math.ceil((record.expires_at - now) / 86400),
      originalPrice: record.original_price,
      renewalCount:  record.renewal_count || 0, wallet });
  });

  // ── NFT History ─────────────────────────────────────
  app.get("/api/nft/history/:mint", (req: any, res: any) => {
    const entries = (getNftHistory.all(req.params.mint) as any[]).map(e => ({
      ...e, created_at: new Date(e.created_at * 1000).toISOString(),
    }));
    return res.json({ history: entries, mint: req.params.mint });
  });

  app.get("/api/nft/config", (_req: any, res: any) => {
    res.set("Cache-Control", "public, max-age=300");
    return res.json({
      treasuryAddress: process.env.FOUNDER_WALLET ?? null,
      appealEmail:     process.env.APPEAL_EMAIL   ?? null,
    });
  });

  app.get("/api/nft/price", apiLimiter, async (_req: any, res: any) => {
    const mintStats = getMintCount.get() as any;
    const minted    = mintStats?.total_minted || 0;
    const usdPrice  = minted < 2000
        ? Number(process.env.EARLY_MINT_PRICE || 40)
        : Number(process.env.FULL_MINT_PRICE  || 70);
    try {
      const cgRes  = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
      const solUsd = cgRes.data?.solana?.usd || 150;
      return res.json({ usdPrice, solPrice: parseFloat((usdPrice / solUsd).toFixed(4)), solUsd, minted, remaining: Math.max(0, 2000 - minted), isEarlyPrice: minted < 2000 });
    } catch {
      return res.json({ usdPrice, solPrice: parseFloat((usdPrice / 150).toFixed(4)), solUsd: 150, minted, remaining: Math.max(0, 2000 - minted), isEarlyPrice: minted < 2000 });
    }
  });

  app.post("/api/nft/confirm-mint", async (req: any, res: any) => {
    const { wallet, txSignature, mintAddress, tier = "bronze" } = req.body;
    if (!wallet || !txSignature) return res.status(400).json({ error: "Wallet and txSignature required" });
    try {
      const heliusRes = await axios.post(`https://api.helius.xyz/v0/transactions?api-key=${process.env.HELIUS_API_B || process.env.HELIUS_API}`, { transactions: [txSignature] });
      const tx = heliusRes.data?.[0];
      if (!tx || tx.transactionError) return res.status(400).json({ error: "Transaction not found or failed" });
      const mintStats  = getMintCount.get() as any;
      const mintNumber = (mintStats?.total_minted || 0) + 1;
      const expiresAt  = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      grantAccess.run(wallet, tier, mintAddress || txSignature, expiresAt, mintNumber);
      incrementMint.run();
      return res.json({ success: true, mintNumber, expiresAt: new Date(expiresAt * 1000).toISOString(), daysLeft: 30, tier });
    } catch (e: any) {
      return res.status(500).json({ error: "Mint confirmation failed: " + e.message });
    }
  });


  // ── NFT: Check wallet access status ───────────────────────────────────────
  app.get("/api/nft/check/:wallet", (req: any, res: any) => {
    const { wallet } = req.params;
    if (!wallet) return res.status(400).json({ error: "Wallet required" });

    const now = Math.floor(Date.now() / 1000);
    const graceDays = Number(process.env.RENEWAL_GRACE_DAYS || 7);

    // 1. Check whitelist first
    const wl = (db.prepare("SELECT * FROM whitelist WHERE wallet=? AND revoked=0").get(wallet) as any);
    if (wl) {
      const expired = wl.expires_at && !wl.permanent && wl.expires_at < now;
      if (!expired) {
        return res.json({ hasAccess: true, status: "active", source: "whitelist", tier: wl.tier || "bronze" });
      }
    }

    const gate = (db.prepare("SELECT * FROM gate_settings WHERE id=1").get() as any);
    const gateLive = gate?.gate_live === 1;

    // 2. Check NFT access record
    const record = getAccess.get(wallet) as any;

    if (!record) {
      return res.json({
        hasAccess: !gateLive,
        status: gateLive ? "none" : "gate_open",
        appealEmail: process.env.APPEAL_EMAIL || null,
      });
    }

    if (record.revoked) {
      return res.json({
        hasAccess: false,
        status: "revoked",
        reason: record.revoke_reason,
        serial: record.revoke_serial,
        revokedAt: record.revoked_at ? new Date(record.revoked_at * 1000).toISOString() : null,
        appealEmail: process.env.APPEAL_EMAIL || null,
      });
    }

    const expired   = record.expires_at && record.expires_at < now;
    const graceEnd  = record.expires_at ? record.expires_at + graceDays * 86400 : null;
    const inGrace   = expired && graceEnd && now < graceEnd;

    if (inGrace) {
      const graceDaysLeft = Math.ceil((graceEnd - now) / 86400);
      return res.json({
        hasAccess: false,
        status: "grace",
        tier: record.tier,
        mintAddress: record.mint_address,
        mintNumber: record.mint_number,
        originalPrice: record.original_price,
        graceDaysLeft,
        graceEndsAt: new Date(graceEnd * 1000).toISOString(),
        expiresAt: new Date(record.expires_at * 1000).toISOString(),
      });
    }

    if (expired) {
      return res.json({
        hasAccess: !gateLive,
        status: gateLive ? "expired" : "gate_open",
        tier: record.tier,
        mintAddress: record.mint_address,
        mintNumber: record.mint_number,
        expiresAt: new Date(record.expires_at * 1000).toISOString(),
      });
    }

    // Active
    const daysLeft = record.expires_at
      ? Math.ceil((record.expires_at - now) / 86400)
      : null;
    return res.json({
      hasAccess: true,
      status: "active",
      tier: record.tier,
      source: "nft",
      mintAddress: record.mint_address,
      mintNumber: record.mint_number,
      expiresAt: record.expires_at ? new Date(record.expires_at * 1000).toISOString() : null,
      daysLeft,
      originalPrice: record.original_price,
    });
  });

  // ── NFT: Mint (confirm on-chain tx, record access) ─────────────────────────
  app.post("/api/nft/mint", async (req: any, res: any) => {
    const { wallet, txSignature, mintAddress, tier = "bronze" } = req.body;
    if (!wallet || !txSignature) return res.status(400).json({ error: "wallet and txSignature required" });

    try {
      // Verify tx on-chain via Helius
      const heliusRes = await axios.post(
        `https://api.helius.xyz/v0/transactions?api-key=${process.env.HELIUS_API_B || process.env.HELIUS_API}`,
        { transactions: [txSignature] }
      );
      const tx = heliusRes.data?.[0];
      if (!tx || tx.transactionError) return res.status(400).json({ error: "Transaction not found or failed" });

      const mintStats  = getMintCount.get() as any;
      const mintNumber = (mintStats?.total_minted || 0) + 1;
      const now        = Math.floor(Date.now() / 1000);
      const expiresAt  = now + 30 * 86400;
      const usdPrice   = mintNumber <= 2000
        ? Number(process.env.EARLY_MINT_PRICE || 40)
        : Number(process.env.FULL_MINT_PRICE  || 70);

      // Grant access
      grantAccess.run(wallet, tier, mintAddress || txSignature, expiresAt, mintNumber);
      // Store original price + tx sig
      db.prepare(`UPDATE nft_access SET original_price=?, price_locked=1, mint_tx_sig=? WHERE wallet=?`)
        .run(usdPrice, txSignature, wallet);
      incrementMint.run();

      // Log to nft_history
      db.prepare(`INSERT INTO nft_history (mint, wallet, event, detail, price_usd, tx_sig) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(mintAddress || txSignature, wallet, "MINT", `Mint #${mintNumber} — ${tier.toUpperCase()}`, usdPrice, txSignature);
      logAudit.run("NFT_MINT", "system", wallet, `Mint #${mintNumber} tier=${tier} price=$${usdPrice}`);

      return res.json({
        success: true, mintNumber, tier,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        daysLeft: 30, txSig: txSignature,
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Mint confirmation failed: " + e.message });
    }
  });

  // ── NFT: Renew ─────────────────────────────────────────────────────────────
  app.post("/api/nft/renew", async (req: any, res: any) => {
    const { wallet, txSignature } = req.body;
    if (!wallet || !txSignature) return res.status(400).json({ error: "wallet and txSignature required" });

    const record = getAccess.get(wallet) as any;
    if (!record) return res.status(404).json({ error: "No NFT record found for this wallet" });
    if (record.revoked) return res.status(403).json({ error: "Access has been revoked — cannot renew" });

    try {
      // Verify tx
      const heliusRes = await axios.post(
        `https://api.helius.xyz/v0/transactions?api-key=${process.env.HELIUS_API_B || process.env.HELIUS_API}`,
        { transactions: [txSignature] }
      );
      const tx = heliusRes.data?.[0];
      if (!tx || tx.transactionError) return res.status(400).json({ error: "Transaction not found or failed" });

      const now       = Math.floor(Date.now() / 1000);
      const graceDays = Number(process.env.RENEWAL_GRACE_DAYS || 7);
      const graceEnd  = record.expires_at ? record.expires_at + graceDays * 86400 : now;
      const inGrace   = record.expires_at && now < graceEnd;
      const renewalPrice = inGrace && record.original_price
        ? record.original_price
        : (getMintCount.get() as any)?.total_minted < 2000
          ? Number(process.env.EARLY_MINT_PRICE || 40)
          : Number(process.env.FULL_MINT_PRICE  || 70);

      // New expiry = 30 days from now
      const expiresAt = now + 30 * 86400;
      const renewCount = (record.renewal_count || 0) + 1;

      db.prepare(`
        UPDATE nft_access
        SET expires_at=?, last_renewed_at=?, renewal_count=?, mint_tx_sig=?,
            grace_expires_at=NULL
        WHERE wallet=?
      `).run(expiresAt, now, renewCount, txSignature, wallet);

      db.prepare(`INSERT INTO nft_history (mint, wallet, event, detail, price_usd, tx_sig) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(record.mint_address || wallet, wallet, "RENEW",
          `Renewal #${renewCount}${inGrace ? " (grace period)" : ""} — price=$${renewalPrice}`,
          renewalPrice, txSignature);
      logAudit.run("NFT_RENEW", "system", wallet, `Renewal #${renewCount} price=$${renewalPrice}`);

      // ── Award points ──────────────────────────────────────────────────
      const POINTS_PER_RENEWAL = 100;
      const curPoints  = (record.points_balance || 0) + POINTS_PER_RENEWAL;
      const totPoints  = (record.points_earned_total || 0) + POINTS_PER_RENEWAL;
      db.prepare(`UPDATE nft_access SET points_balance=?, points_earned_total=? WHERE wallet=?`)
        .run(curPoints, totPoints, wallet);
      db.prepare(`INSERT INTO point_transactions (wallet, mint, type, amount, balance_after, reason) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(wallet, record.mint_address || wallet, "EARN", POINTS_PER_RENEWAL, curPoints,
          `Renewal #${renewCount} — earned ${POINTS_PER_RENEWAL} pts`);

      return res.json({
        success: true, renewalCount: renewCount, renewalPrice,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        daysLeft: 30,
        pointsEarned: POINTS_PER_RENEWAL,
        pointsBalance: curPoints,
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Renewal failed: " + e.message });
    }
  });

  // ── NFT: Claim (secondary market transfer) ─────────────────────────────────
  app.post("/api/nft/claim", async (req: any, res: any) => {
    const { wallet, mintAddress } = req.body;
    if (!wallet || !mintAddress) return res.status(400).json({ error: "wallet and mintAddress required" });

    try {
      // Verify wallet actually holds this NFT via Helius
      const heliusRes = await axios.get(
        `https://api.helius.xyz/v0/addresses/${wallet}/nfts?api-key=${process.env.HELIUS_API_B || process.env.HELIUS_API}`
      );
      const nfts: any[] = heliusRes.data || [];
      const ownsNft = nfts.some((n: any) =>
        n.mint === mintAddress ||
        n.id   === mintAddress ||
        n.mintAddress === mintAddress
      );
      if (!ownsNft) return res.status(403).json({ error: "This wallet does not hold the specified NFT" });

      // Check if this mint was previously registered
      const existing = (db.prepare("SELECT * FROM nft_access WHERE mint_address=?").get(mintAddress) as any);

      const now      = Math.floor(Date.now() / 1000);
      const expiresAt = now + 30 * 86400;
      const mintStats = getMintCount.get() as any;
      const currentPrice = (mintStats?.total_minted || 0) < 2000
        ? Number(process.env.EARLY_MINT_PRICE || 40)
        : Number(process.env.FULL_MINT_PRICE  || 70);

      // Revoke old wallet if transferred
      if (existing && existing.wallet !== wallet) {
        db.prepare("UPDATE nft_access SET revoked=1, revoke_reason=? WHERE wallet=?")
          .run("NFT transferred to new wallet", existing.wallet);
        logAudit.run("NFT_TRANSFER_REVOKE", "system", existing.wallet,
          `NFT ${mintAddress} claimed by ${wallet}`);
      }

      // Grant to new wallet — no price lock on secondary
      grantAccess.run(wallet, existing?.tier || "bronze", mintAddress, expiresAt, existing?.mint_number || null);
      db.prepare("UPDATE nft_access SET original_price=?, price_locked=0 WHERE wallet=?")
        .run(currentPrice, wallet);

      db.prepare(`INSERT INTO nft_history (mint, wallet, event, detail, price_usd, tx_sig) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(mintAddress, wallet, "CLAIM",
          existing ? `Secondary claim — prev holder: ${existing.wallet?.slice(0,8)}` : "Secondary claim",
          null, null);
      logAudit.run("NFT_CLAIM", "system", wallet, `Claimed mint ${mintAddress}`);

      return res.json({
        success: true, tier: existing?.tier || "bronze",
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        daysLeft: 30,
        note: "Price lock does not transfer on secondary claims",
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Claim failed: " + e.message });
    }
  });

  app.post("/api/nft/appeal", (req: any, res: any) => {
    const { wallet, message } = req.body;
    if (!wallet || !message?.trim()) return res.status(400).json({ error: "Wallet and message required" });
    const record = getAccess.get(wallet) as any;
    submitAppeal.run(wallet, message.trim(), record?.revoke_reason || null, record?.revoke_serial || null);
    return res.json({ success: true, message: "Appeal submitted. You will be contacted at " + process.env.APPEAL_EMAIL });
  });

  // ── Analytics ──────────────────────────────────────
  app.post("/api/analytics/event", (req: any, res: any) => {
    const { wallet, event, panel, feature, meta } = req.body;
    if (!event) return res.status(400).json({ error: "Event required" });
    try {
      logEvent.run(wallet || null, event || null, panel || null, feature || null, meta ? JSON.stringify(meta) : null);
      return res.json({ success: true });
    } catch { return res.json({ success: false }); }
  });

  // ── Health ─────────────────────────────────────────
  app.get("/api/health", (_req: any, res: any) => res.json({ status: "ok", ts: Date.now() }));

  /* =================================================== */
  /* PANEL 1 — NETWORK                                   */
  /* =================================================== */

  // Social: DexScreener + Dune — merged, deduplicated, sorted by social volume
  app.get("/api/network/social", async (_req: any, res: any) => {
    const key = "network:social";
    const hit  = getCached(key, 1_800_000); // 30 minutes cache
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const [dexRes1, dexRes2, dexRes3, marketDataRes, traderIntelRes] = await Promise.allSettled([
        axios.get("https://api.dexscreener.com/latest/dex/search?q=SOL").catch(() => ({ data: { pairs: [] } })),
        axios.get("https://api.dexscreener.com/token-profiles/latest/v1").catch(() => ({ data: { tokenProfiles: [] } })),
        axios.get("https://api.dexscreener.com/token-boosts/top/v1").catch(() => ({ data: { boosts: [] } })),
        axios.get(`https://api.dune.com/api/v1/query/${process.env.DUNE_MARKET_QUERY_ID || "6799658"}/results?limit=20`, {
          headers: { "X-Dune-API-Key": process.env.D_API_A || "" },
        }),
        axios.get(`https://api.dune.com/api/v1/query/${process.env.DUNE_TRADER_QUERY_ID || "6801496"}/results?limit=100`, {
          headers: { "X-Dune-API-Key": process.env.D_API_B || "" },
        }),
      ]);

      const map = new Map<string, any>();

      if (dexRes1.status === "fulfilled") {
        (dexRes1.value?.data?.pairs || []).slice(0, 30).forEach((p: any) => {
          if (p.baseToken?.symbol && p.volume?.h24 > 0) {
            const sym = p.baseToken.symbol;
            if (!map.has(sym)) {
              map.set(sym, {
                id: `dex-${p.pair}`, symbol: sym, name: p.baseToken.name || "—",
                price: parseFloat(p.priceUsd) || 0, priceChange24h: p.priceChange?.h24 ?? 0,
                socialVolume: Math.round(p.volume?.h24 ?? 0), socialScore: 50, sentiment: 50, mentions: 0, source: "dexscreener",
              });
            }
          }
        });
      }

      if (marketDataRes.status === "fulfilled") {
        (marketDataRes.value?.data?.result?.rows || []).slice(0, 20).forEach((r: any) => {
          const tokenSymbol = r.token_symbol || r.token_name || "";
          const k = tokenSymbol.toUpperCase();
          const price = parseFloat(r.price_usd) || parseFloat(r.price) || 0;
          const priceChange = parseFloat(r.price_change_24h) || 0;
          if (!tokenSymbol) return;
          if (map.has(k)) {
            const ex = map.get(k);
            map.set(k, { ...ex, price: price > 0 ? price : ex.price, priceChange24h: price > 0 ? priceChange : ex.priceChange24h,
              socialVolume: Math.round((ex.socialVolume + (r.total_transactions ?? 0)) / 2), socialScore: Math.round((ex.socialScore + 50) / 2),
              sentiment: Math.round((ex.sentiment + 50) / 2), mentions: (ex.mentions ?? 0) + (r.total_fees ?? 0), source: "both",
            });
          } else {
            map.set(k, {
              id: `dune-market-${k}`, symbol: k, name: tokenSymbol || "—", price, priceChange24h: priceChange,
              socialVolume: r.total_transactions ?? 0, socialScore: 50, sentiment: 50, mentions: r.total_fees ?? 0, source: "dune:market",
            });
          }
        });
      }

      if (traderIntelRes.status === "fulfilled") {
        (traderIntelRes.value?.data?.result?.rows || []).slice(0, 100).forEach((r: any) => {
          const k = `TOKEN_${r.mint || ""}`.substring(0, 8).toUpperCase();
          const walletGrowth = Math.min(100, Math.max(0, (r.wallet_growth ?? 1) * 100));
          if (map.has(k)) {
            const ex = map.get(k);
            map.set(k, { ...ex, socialScore: Math.round((ex.socialScore + walletGrowth) / 2),
              sentiment: Math.round((ex.sentiment + ((r.volume_growth ?? 1) * 100)) / 2), mentions: (ex.mentions ?? 0) + (r.whale_transfers ?? 0), source: "both",
            });
          } else {
            map.set(k, {
              id: `dune-trader-${k}`, symbol: k, name: `TOKEN_${r.mint?.substring(0, 8) || "?"}`, price: 0, priceChange24h: 0,
              socialVolume: r.transfers_30m ?? 0, socialScore: walletGrowth, sentiment: Math.min(100, ((r.volume_growth ?? 1) * 100)),
              mentions: r.whale_transfers ?? 0, source: "dune:trader",
            });
          }
        });
      }

      const items = Array.from(map.values()).sort((a, b) => b.socialVolume - a.socialVolume).slice(0, 20);
      const payload = { items, sources: { dexscreener: "ok", dune_market: marketDataRes.status === "fulfilled" ? "ok" : "error", dune_trader: traderIntelRes.status === "fulfilled" ? "ok" : "error" }, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Social feed failed: " + e.message });
    }
  });

  // Whale feed: Birdeye swaps — 30s cache
  app.get("/api/network/whales", async (_req: any, res: any) => {
    const key = "network:whales";
    const hit  = getCached(key, 30_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const data = await axios.get("https://public-api.birdeye.so/defi/txs/token", {
        headers: { "X-API-KEY": process.env.BIRD_API || "", "x-chain": "solana" },
        params: { address: "So11111111111111111111111111111111111111112", tx_type: "swap", sort_type: "desc", offset: 0, limit: 50 },
      });
      const items = (data.data?.data?.items || [])
        .filter((t: any) => {
          const usd = (t.from_amount ?? 0) * (t.from_token?.price ?? 1);
          return usd >= 10_000 && usd <= 5_000_000;
        })
        .slice(0, 20)
        .map((t: any) => {
          const amountUsd = (t.from_amount ?? 0) * (t.from_token?.price ?? 1);
          return {
            txHash:      t.tx_hash          ?? "",
            side:        (t.side ?? 'buy').toLowerCase().includes('buy') ? "BUY" : "SELL",
            tokenIn:     t.from_token?.symbol ?? t.from_symbol ?? "—",
            tokenOut:    t.to_token?.symbol   ?? t.to_symbol   ?? "—",
            amountUsd:   Math.round(amountUsd),
            amountIn:    t.from_amount  ?? 0,
            amountOut:   t.to_amount    ?? 0,
            wallet:      t.owner ?? t.signer ?? "—",
            timestamp:   t.block_unix_time ?? t.block_time ?? Math.floor(Date.now() / 1000),
            priceImpact: t.price_impact ?? null,
            dex:         t.source ?? t.platform ?? "—",
          };
        });
      const payload = { items, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Whale feed failed: " + e.message });
    }
  });

  // Gas: Helius priority fees — 15s cache
  app.get("/api/network/gas", async (_req: any, res: any) => {
    const key = "network:gas";
    const hit  = getCached(key, 15_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      let recommended = 0, levels = { low: 0, medium: 5000, high: 15000, veryHigh: 30000 };
      try {
        const data = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API || ""}`, {
          jsonrpc: "2.0", id: 1, method: "getPriorityFeeEstimate",
          params: [{ accountKeys: ["11111111111111111111111111111111"], options: { recommended: true, includeAllPriorityFeeLevels: true } }],
        });
        const res2 = data.data?.result;
        recommended = res2?.priorityFeeEstimate ?? 5000;
        levels = res2?.priorityFeeLevels ?? levels;
      } catch { recommended = 5000; }
      const payload = {
        recommended, congestion: recommended < 5_000 ? "LOW" : recommended < 50_000 ? "MEDIUM" : "HIGH",
        levels: { low: levels.low ?? 0, medium: levels.medium ?? recommended, high: levels.high ?? recommended * 2, veryHigh: levels.veryHigh ?? recommended * 4 },
        unit: "microLamports", cached: false, age: 0,
      };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Gas tracker failed: " + e.message });
    }
  });

  // ── NetworkPanel routes — all public APIs + Helius RPC only ──────────────
  // No CG_API_, BIRD_API, D_API keys used here — those are reserved for
  // Explore and Protocol panels.

  // INTEL: CoinGecko public (no key) + Alternative.me Fear & Greed — 3 min cache
  app.get("/api/network/intel", async (_req: any, res: any) => {
    const key = "network:intel";
    const hit  = getCached(key, 3 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const [marketsRes, globalRes, trendingRes, fngRes] = await Promise.allSettled([
        axios.get(
          "https://api.coingecko.com/api/v3/coins/markets" +
          "?vs_currency=usd&order=market_cap_desc&per_page=30" +
          "&sparkline=false&price_change_percentage=1h%2C24h%2C7d"
        ),
        axios.get("https://api.coingecko.com/api/v3/global"),
        axios.get("https://api.coingecko.com/api/v3/search/trending"),
        axios.get("https://api.alternative.me/fng/?limit=10"),
      ]);
      const payload = {
        markets:  marketsRes.status  === "fulfilled" ? marketsRes.value.data  : [],
        global:   globalRes.status   === "fulfilled" ? globalRes.value.data   : null,
        trending: trendingRes.status === "fulfilled" ? trendingRes.value.data : null,
        fng:      fngRes.status      === "fulfilled" ? fngRes.value.data      : null,
        cached: false, age: 0,
      };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Intel fetch failed: " + e.message });
    }
  });

  // FLOWS: DexScreener public (no key) — 60s cache
  app.get("/api/network/flows", async (_req: any, res: any) => {
    const key = "network:flows";
    const hit  = getCached(key, 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const [solPairsRes, searchRes, boostedRes] = await Promise.allSettled([
        axios.get("https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112"),
        axios.get("https://api.dexscreener.com/latest/dex/search?q=solana"),
        axios.get("https://api.dexscreener.com/token-boosts/top/v1"),
      ]);
      const payload = {
        solPairs: solPairsRes.status === "fulfilled" ? solPairsRes.value.data : null,
        search:   searchRes.status   === "fulfilled" ? searchRes.value.data   : null,
        boosted:  boostedRes.status  === "fulfilled" ? boostedRes.value.data  : null,
        cached: false, age: 0,
      };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Flows fetch failed: " + e.message });
    }
  });

  // CHAIN: Helius RPC — TPS/epoch/fees at 30s, supply at 15 min (bundled at 30s)
  app.get("/api/network/chain", async (_req: any, res: any) => {
    const key = "network:chain";
    const hit  = getCached(key, 30_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    // Try QuickNode first, fall back to public RPC
    const RPC_ENDPOINTS = [
      process.env.QN_HTTP_A,
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API || ""}`,
      "https://api.mainnet-beta.solana.com",
    ].filter(Boolean) as string[];

    async function solRpc(method: string, params: any[] = []): Promise<any> {
      let lastErr: any;
      for (const endpoint of RPC_ENDPOINTS) {
        try {
          const r = await axios.post(endpoint, { jsonrpc: "2.0", id: 1, method, params }, { timeout: 8000 });
          if (r.data?.error) throw new Error(r.data.error.message);
          return r.data.result;
        } catch (e) { lastErr = e; }
      }
      throw lastErr;
    }

    try {
      const errors: string[] = [];
      const [perfRes, epochRes, feesRes, supplyRes, healthRes] = await Promise.allSettled([
        solRpc("getRecentPerformanceSamples", [15]),
        solRpc("getEpochInfo"),
        solRpc("getRecentPrioritizationFees", [[]]),
        solRpc("getSupply", [{ commitment: "finalized" }]),
        solRpc("getHealth"),
      ]);

      if (perfRes.status   === "rejected") errors.push("perf: "   + (perfRes.reason?.message   || perfRes.reason));
      if (epochRes.status  === "rejected") errors.push("epoch: "  + (epochRes.reason?.message  || epochRes.reason));
      if (feesRes.status   === "rejected") errors.push("fees: "   + (feesRes.reason?.message   || feesRes.reason));
      if (supplyRes.status === "rejected") errors.push("supply: " + (supplyRes.reason?.message || supplyRes.reason));
      if (errors.length) console.warn("[/api/network/chain] partial failures:", errors);

      const payload = {
        perf:   perfRes.status   === "fulfilled" ? perfRes.value            : [],
        epoch:  epochRes.status  === "fulfilled" ? epochRes.value           : null,
        fees:   feesRes.status   === "fulfilled" ? feesRes.value            : [],
        supply: supplyRes.status === "fulfilled" ? supplyRes.value          : null,
        health: healthRes.status === "fulfilled" ? healthRes.value          : "ok",
        errors: errors.length ? errors : undefined,
        cached: false, age: 0,
      };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      console.error("[/api/network/chain] fatal:", e.message);
      return res.status(500).json({ error: "Chain fetch failed: " + e.message });
    }
  });

  // VALIDATORS — vote accounts + cluster nodes — 15 min cache
  app.get("/api/network/validators", async (_req: any, res: any) => {
    const key = "network:validators";
    const hit  = getCached(key, 15 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    const RPC_ENDPOINTS = [
      process.env.QN_HTTP_A,
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API || ""}`,
      "https://api.mainnet-beta.solana.com",
    ].filter(Boolean) as string[];

    async function solRpc(method: string, params: any[] = []): Promise<any> {
      let lastErr: any;
      for (const endpoint of RPC_ENDPOINTS) {
        try {
          const r = await axios.post(endpoint, { jsonrpc: "2.0", id: 1, method, params }, { timeout: 15000 });
          if (r.data?.error) throw new Error(r.data.error.message);
          return r.data.result;
        } catch (e) { lastErr = e; }
      }
      throw lastErr;
    }

    try {
      const [voteRes, nodesRes] = await Promise.allSettled([
        solRpc("getVoteAccounts"),
        solRpc("getClusterNodes"),
      ]);

      if (voteRes.status  === "rejected") console.warn("[validators] voteAccounts failed:",  voteRes.reason?.message);
      if (nodesRes.status === "rejected") console.warn("[validators] clusterNodes failed:", nodesRes.reason?.message);

      const payload = {
        voteAccounts: voteRes.status  === "fulfilled" ? voteRes.value  : { current: [], delinquent: [] },
        clusterNodes: nodesRes.status === "fulfilled" ? nodesRes.value : [],
        errors: [
          ...(voteRes.status  === "rejected" ? ["voteAccounts: " + voteRes.reason?.message]  : []),
          ...(nodesRes.status === "rejected" ? ["clusterNodes: " + nodesRes.reason?.message] : []),
        ],
        cached: false, age: 0,
      };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      console.error("[/api/network/validators] fatal:", e.message);
      return res.status(500).json({ error: "Validators fetch failed: " + e.message });
    }
  });

  /* =================================================== */
  /* PANEL 2 — PROTOCOL                                  */
  /* =================================================== */

  // Audit: GoPlus + Tenderly double-layer risk score
  app.post("/api/protocol/audit", async (req: any, res: any) => {
    const { address, chainId = "1" } = req.body;
    if (!address) return res.status(400).json({ error: "address required" });
    const key = `protocol:audit:${chainId}:${address}`;
    const hit  = getCached(key, 300_000);
    if (hit) return res.json({ ...hit, cached: true });
    try {
      const gpRes = await axios.get(`https://api.gopluslabs.io/api/v1/rugpull_detecting/${chainId}?contract_addresses=${address}`).catch(() => ({ data: { result: {} } }));
      const gp    = gpRes.data?.result?.[address.toLowerCase()];

      const flags = gp ? [
        { label: "Honeypot",            value: gp.is_honeypot            === "1", severity: "critical" },
        { label: "Mint Function",       value: gp.is_mintable             === "1", severity: "high"     },
        { label: "Proxy Contract",      value: gp.is_proxy                === "1", severity: "medium"   },
        { label: "Blacklisted",         value: gp.is_blacklisted          === "1", severity: "critical" },
        { label: "Trading Cooldown",    value: gp.trading_cooldown        === "1", severity: "medium"   },
        { label: "Can Take Back Owner", value: gp.can_take_back_ownership === "1", severity: "critical" },
        { label: "Hidden Owner",        value: gp.hidden_owner            === "1", severity: "critical" },
        { label: "Self-Destruct",       value: gp.selfdestruct            === "1", severity: "critical" },
        { label: "External Call Risk",  value: gp.external_call           === "1", severity: "high"     },
        { label: "Liquidity Locked",    value: gp.lp_locked               === "1", severity: "info", positive: true },
        { label: "Verified Source",     value: gp.is_open_source          === "1", severity: "info", positive: true },
      ] : [];

      let tenderly: any = null;
      try {
        const tRes = await axios.post(
          `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_ACCOUNT || "protocolhub"}/project/${process.env.TENDERLY_PROJECT || "main"}/simulate`,
          { network_id: chainId, from: "0x0000000000000000000000000000000000000001", to: address,
            input: "0xa9059cbb00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a7640000",
            gas: 500000, gas_price: "0", value: "0", save: false, simulation_type: "quick" },
          { headers: { "X-Access-Key": process.env.T_SIM_ || "" } }
        );
        const sim = tRes.data?.transaction;
        tenderly = { success: sim?.status === true, reverted: sim?.status === false, gasUsed: sim?.gas_used ?? 0, errorMessage: sim?.error_message ?? null, hiddenFeeDetected: sim?.status === false || (sim?.balance_changes?.length ?? 0) > 2 };
      } catch (te: any) { console.warn("[audit] Tenderly:", te.message); }

      let score = 0;
      const W: Record<string, number> = { critical: 30, high: 15, medium: 8 };
      flags.forEach((f: any) => { if (!f.positive && f.value) score += W[f.severity] ?? 5; if (f.positive && !f.value) score += 5; });
      if (tenderly?.reverted)          score += 20;
      if (tenderly?.hiddenFeeDetected) score += 25;
      const sellTax = parseFloat(gp?.sell_tax || "0");
      const buyTax  = parseFloat(gp?.buy_tax  || "0");
      if (sellTax > 10) score += 20; if (sellTax > 25) score += 15; if (buyTax > 10) score += 10;
      score = Math.min(100, score);

      const result = { address, chainId, riskScore: score, riskLevel: score >= 70 ? "DANGER" : score >= 40 ? "CAUTION" : "SAFE", flags, tenderly,
        metadata: { name: gp?.token_name || "—", symbol: gp?.token_symbol || "—", decimals: gp?.decimal || "—", totalSupply: gp?.total_supply || "—", holderCount: gp?.holder_count || "—", buyTax: gp?.buy_tax || "0", sellTax: gp?.sell_tax || "0", creatorAddress: gp?.creator_address || "—", ownerAddress: gp?.owner_address || "—" },
        cached: false };
      setCache(key, result);
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: "Audit failed: " + e.message });
    }
  });

  // Transactions: Helius enhanced human-readable parsing
  app.get("/api/protocol/transactions", async (req: any, res: any) => {
    const { wallet, page = "1", limit = "10" } = req.query;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    const key = `protocol:txs:${wallet}`;
    const hit  = getCached(key, 60_000);
    let allTxs: any[];
    if (hit) {
      allTxs = hit.transactions;
    } else {
      try {
        // Helius v0 only accepts a single type — omit to get all types
        const hRes = await heliusGet(`/v0/addresses/${wallet}/transactions`, {
          params: { limit: 50 },
        });
        allTxs = (hRes.data || []).map((tx: any) => {
          // Compute total SOL moved from native transfers
          const nativeTransfers = (tx.nativeTransfers || []).map((t: any) => ({
            fromUser: t.fromUserAccount || "", toUser: t.toUserAccount || "",
            amount: t.amount || 0,
          }));
          const totalSolMoved = nativeTransfers.reduce((s: number, t: any) => s + t.amount, 0) / 1e9;

          // Compute total token amount from first meaningful token transfer
          const tokenTransfers = (tx.tokenTransfers || []).map((t: any) => ({
            mint: t.mint || "", fromUser: t.fromUserAccount || "",
            toUser: t.toUserAccount || "", amount: t.tokenAmount || 0, symbol: t.symbol || "—",
          }));
          const primaryToken = tokenTransfers.find((t: any) => t.amount > 0);

          return {
            signature:   tx.signature   || "",
            type:        tx.type        || "UNKNOWN",
            description: tx.description || tx.type || "Unknown",
            timestamp:   tx.timestamp   || 0,
            fee:         tx.fee         || 0,
            status:      tx.transactionError ? "FAILED" : "SUCCESS",
            source:      tx.source      || "—",
            // Amount fields for display
            totalSolMoved,
            primaryTokenAmount: primaryToken?.amount   ?? 0,
            primaryTokenSymbol: primaryToken?.symbol   ?? "",
            tokenTransfers,
            nativeTransfers,
          };
        });
        setCache(key, { transactions: allTxs });
      } catch (e: any) {
        return res.status(500).json({ error: "Transactions failed: " + e.message });
      }
    }
    const p = parseInt(page as string), l = parseInt(limit as string), start = (p - 1) * l;
    return res.json({ items: allTxs.slice(start, start + l), page: p, hasMore: start + l < allTxs.length, total: allTxs.length, cached: !!hit, age: cacheAge(key) });
  });

  // Mint simulation: cost preview before user signs
  app.post("/api/protocol/simulate-mint", async (req: any, res: any) => {
    const { walletAddress } = req.body;
    if (!walletAddress) return res.status(400).json({ error: "walletAddress required" });
    try {
      let solPrice = 150;
      try {
        const cg = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { headers: { "x-cg-demo-api-key": process.env.CG_API_ || "" } });
        solPrice = cg.data?.solana?.usd ?? 150;
      } catch {}

      let avgFee = 5000;
      try {
        const feeRes = await axios.post(process.env.QN_HTTP_A || "", { jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [[]] });
        const fees = feeRes.data?.result || [];
        if (fees.length) avgFee = fees.reduce((s: number, f: any) => s + f.prioritizationFee, 0) / fees.length;
      } catch {}

      const mintStats    = getMintCount.get() as any;
      const usdPrice     = (mintStats?.total_minted || 0) < 2000 ? 30 : 50;
      const totalGasLamps = 5000 + Math.ceil(avgFee * 200_000 / 1_000_000);
      const totalGasSol   = totalGasLamps / 1e9;
      const nftPriceSol   = usdPrice / solPrice;

      return res.json({
        chain: "solana", wallet: walletAddress,
        breakdown: {
          nftPrice:     { sol: parseFloat(nftPriceSol.toFixed(6)),               usd: usdPrice },
          estimatedGas: { sol: parseFloat(totalGasSol.toFixed(6)),               usd: parseFloat((totalGasSol * solPrice).toFixed(4)) },
          total:        { sol: parseFloat((nftPriceSol + totalGasSol).toFixed(6)), usd: parseFloat((usdPrice + totalGasSol * solPrice).toFixed(2)) },
        },
        priorityFeeLevel: avgFee < 5000 ? "LOW" : avgFee < 50000 ? "MEDIUM" : "HIGH",
        willSucceed: true,
        warnings: totalGasSol * solPrice > 2 ? ["Network congestion — gas fees elevated"] : [],
        solPriceUsed: solPrice,
      });
    } catch (e: any) {
      return res.status(500).json({ error: "Simulation failed: " + e.message });
    }
  });

  /* =================================================== */
  /* PANEL 3 — EXPLORE                                   */
  /* =================================================== */

  // Pairs: DexScreener Solana + ETH, liquidity > $5k, infinite scroll
  app.get("/api/explore/pairs", async (req: any, res: any) => {
    const { page = "1", limit = "20", q = "" } = req.query;
    const searchQ = (q as string).trim();

    // If searching — hit DexScreener search endpoint directly (no cache needed, fast)
    if (searchQ) {
      try {
        const r = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(searchQ)}`, { timeout: 8000 });
        const raw: any[] = r.data?.pairs ?? [];
        const norm = (p: any) => ({
          pairAddress: p.pairAddress || "", baseSymbol: p.baseToken?.symbol || "—",
          baseName: p.baseToken?.name || "—", baseAddress: p.baseToken?.address || "",
          quoteSymbol: p.quoteToken?.symbol || "—",
          priceUsd: parseFloat(p.priceUsd || "0"), priceChange24h: p.priceChange?.h24 ?? 0,
          liquidityUsd: p.liquidity?.usd ?? 0, volume24h: p.volume?.h24 ?? 0,
          buys24h: p.txns?.h24?.buys ?? 0, sells24h: p.txns?.h24?.sells ?? 0,
          chainId: p.chainId || "—", dexId: p.dexId || "—", fdv: p.fdv ?? 0, createdAt: p.pairCreatedAt ?? 0,
        });
        const pairs = raw
          .filter((p: any) => (p.liquidity?.usd ?? 0) >= 5_000)
          .map(norm)
          .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
        const p2 = parseInt(page as string), l = parseInt(limit as string), start = (p2 - 1) * l;
        return res.json({ items: pairs.slice(start, start + l), page: p2, hasMore: start + l < pairs.length, total: pairs.length, cached: false, age: 0 });
      } catch (e: any) {
        return res.status(500).json({ error: "Pairs search failed: " + e.message });
      }
    }

    // No search — load top pairs by volume from Solana + ETH (cached 60s)
    const key = "explore:pairs:all";
    const hit  = getCached(key, 60_000);
    let allPairs: any[];
    if (hit) {
      allPairs = hit.pairs;
    } else {
      try {
        // DexScreener /latest/dex/pairs/:chainId returns top pairs sorted by volume
        const [solRes, ethRes] = await Promise.allSettled([
          axios.get("https://api.dexscreener.com/latest/dex/search?q=SOL&chainIds=solana", { timeout: 8000 }),
          axios.get("https://api.dexscreener.com/latest/dex/search?q=ETH&chainIds=ethereum", { timeout: 8000 }),
        ]);
        const norm = (p: any) => ({
          pairAddress: p.pairAddress || "", baseSymbol: p.baseToken?.symbol || "—",
          baseName: p.baseToken?.name || "—", baseAddress: p.baseToken?.address || "",
          quoteSymbol: p.quoteToken?.symbol || "—",
          priceUsd: parseFloat(p.priceUsd || "0"), priceChange24h: p.priceChange?.h24 ?? 0,
          liquidityUsd: p.liquidity?.usd ?? 0, volume24h: p.volume?.h24 ?? 0,
          buys24h: p.txns?.h24?.buys ?? 0, sells24h: p.txns?.h24?.sells ?? 0,
          chainId: p.chainId || "—", dexId: p.dexId || "—", fdv: p.fdv ?? 0, createdAt: p.pairCreatedAt ?? 0,
        });
        const sol = solRes.status === "fulfilled" ? (solRes.value.data?.pairs ?? []).filter((p: any) => (p.liquidity?.usd ?? 0) >= 5_000).map(norm) : [];
        const eth = ethRes.status === "fulfilled" ? (ethRes.value.data?.pairs ?? []).filter((p: any) => (p.liquidity?.usd ?? 0) >= 5_000).map(norm) : [];
        allPairs = [...sol, ...eth].sort((a, b) => b.volume24h - a.volume24h);
        setCache(key, { pairs: allPairs });
      } catch (e: any) {
        return res.status(500).json({ error: "Pairs failed: " + e.message });
      }
    }
    const p2 = parseInt(page as string), l = parseInt(limit as string), start = (p2 - 1) * l;
    return res.json({ items: allPairs.slice(start, start + l), page: p2, hasMore: start + l < allPairs.length, total: allPairs.length, cached: !!hit, age: cacheAge(key) });
  });

  // Yields: DeFiLlama stablecoin pools, infinite scroll
  app.get("/api/explore/yields", async (req: any, res: any) => {
    const { page = "1", limit = "10", q = "" } = req.query;
    const key = "explore:yields:all";
    const hit  = getCached(key, 60_000);
    let allPools: any[];
    if (hit) {
      allPools = hit.pools;
    } else {
      try {
        const data = await axios.get("https://yields.llama.fi/pools");
        allPools = (data.data?.data || [])
          .filter((p: any) => p.stablecoin === true && (p.apy ?? 0) > 0 && (p.tvlUsd ?? 0) > 10_000)
          .sort((a: any, b: any) => (b.apy ?? 0) - (a.apy ?? 0))
          .slice(0, 100)
          .map((p: any) => ({ pool: p.pool || "", project: p.project || "—", symbol: p.symbol || "—", chain: p.chain || "—", apy: p.apy ?? 0, apyBase: p.apyBase ?? 0, apyReward: p.apyReward ?? null, tvlUsd: p.tvlUsd ?? 0, ilRisk: p.ilRisk || "NONE", il7d: p.il7d ?? null, exposure: p.exposure || "—" }));
        setCache(key, { pools: allPools });
      } catch (e: any) {
        return res.status(500).json({ error: "Yields failed: " + e.message });
      }
    }
    const filtered = q ? allPools.filter((p: any) => p.project.toLowerCase().includes((q as string).toLowerCase()) || p.symbol.toLowerCase().includes((q as string).toLowerCase())) : allPools;
    const p = parseInt(page as string), l = parseInt(limit as string), start = (p - 1) * l;
    return res.json({ items: filtered.slice(start, start + l), page: p, hasMore: start + l < filtered.length, total: filtered.length, cached: !!hit, age: cacheAge(key) });
  });

  // Gainers/Losers: CoinGecko top 250 with CG_API_ key — 60s cache
  app.get("/api/explore/gainers", async (req: any, res: any) => {
    const { page = "1", limit = "10", mode = "gainers", q = "" } = req.query;
    const key = "explore:gainers:all";
    const hit  = getCached(key, 60_000);
    let gainers: any[], losers: any[];
    if (hit) { gainers = hit.gainers; losers = hit.losers; }
    else {
      try {
        const data = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
          headers: { "x-cg-demo-api-key": process.env.CG_API_ || "" },
          params: { vs_currency: "usd", order: "market_cap_desc", per_page: 250, page: 1, sparkline: false, price_change_percentage: "24h" },
        });
        const coins = (data.data || []).map((c: any) => ({ id: c.id || "", symbol: (c.symbol || "—").toUpperCase(), name: c.name || "—", image: c.image || "", price: c.current_price ?? 0, priceChange24h: c.price_change_percentage_24h ?? 0, marketCap: c.market_cap ?? 0, volume24h: c.total_volume ?? 0, high24h: c.high_24h ?? 0, low24h: c.low_24h ?? 0, rank: c.market_cap_rank ?? 999 }));
        gainers = [...coins].sort((a, b) => b.priceChange24h - a.priceChange24h);
        losers  = [...coins].sort((a, b) => a.priceChange24h - b.priceChange24h);
        setCache(key, { gainers, losers });
      } catch (e: any) {
        return res.status(500).json({ error: "Gainers failed: " + e.message });
      }
    }
    const source   = mode === "losers" ? losers! : gainers!;
    const filtered = q ? source.filter((c: any) => c.symbol.toLowerCase().includes((q as string).toLowerCase()) || c.name.toLowerCase().includes((q as string).toLowerCase())) : source;
    const p = parseInt(page as string), l = parseInt(limit as string), start = (p - 1) * l;
    return res.json({ items: filtered.slice(start, start + l), mode, page: p, hasMore: start + l < filtered.length, total: filtered.length, cached: !!hit, age: cacheAge(key) });
  });

  /* =================================================== */
  /* PROTOCOL — LIVE STREAM (SSE)                        */
  /* One connection per user — server fans out QN WSS    */
  /* =================================================== */

  app.get("/api/protocol/live-stream", (req: any, res: any) => {
    // SSE headers — set directly on the route, no middleware interference
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();

    sseClients.add(res);

    // Send connected acknowledgement immediately
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", timestamp: Date.now() })}\n\n`);

    // Heartbeat every 25s — keeps connection alive through proxies/Cloudflare
    const hb = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(hb); }
    }, 25_000);

    req.on("close", () => {
      clearInterval(hb);
      sseClients.delete(res);
    });
  });

  /* =================================================== */
  /* PROTOCOL — MORALIS WEBHOOK                          */
  /* Receives pushed stream events from Moralis          */
  /* Fan-out to all connected SSE clients                */
  /* =================================================== */

  app.post("/api/protocol/moralis-webhook", (req: any, res: any) => {
    try {
      const payload = req.body;
      if (!payload) return res.status(400).json({ error: "Empty payload" });

      // Normalize Moralis stream event and broadcast to SSE clients
      const txns: any[] = payload.txs ?? payload.nftTransfers ?? payload.erc20Transfers ?? [];
      txns.forEach((tx: any) => {
        const usd = parseFloat(tx.valueWithDecimals ?? "0");
        broadcastSSE({
          id:          `moralis-${tx.hash ?? Date.now()}`,
          type:        usd > 50_000 ? "WHALE" : "TRANSFER",
          program:     "Moralis",
          signature:   tx.hash ?? "",
          amountUsd:   usd,
          fromWallet:  tx.fromAddress ?? "—",
          toWallet:    tx.toAddress   ?? "—",
          timestamp:   Date.now(),
        });
      });

      return res.json({ success: true, processed: txns.length });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /* =================================================== */
  /* PROTOCOL — WHALE TRACKER                            */
  /* Birdeye large trades — 30s server cache             */
  /* =================================================== */

  app.get("/api/protocol/whale-tracker", async (_req: any, res: any) => {
    const key = "protocol:whales";
    const hit  = getCached(key, 30_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      let rawItems: any[] = [];
      let source = "none";

      // ── Source 1: Birdeye — SOL + top tokens ──────────────────────────
      const TOP_TOKENS = [
        "So11111111111111111111111111111111111111112",          // SOL (wrapped)
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",       // USDC
        "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",       // BONK
        "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",        // JUP
        "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",         // WEN
      ];
      if (process.env.BIRD_API) {
        for (const mint of TOP_TOKENS) {
          try {
            const r = await axios.get("https://public-api.birdeye.so/defi/txs/token", {
              headers: { "X-API-KEY": process.env.BIRD_API, "x-chain": "solana" },
              params:  { address: mint, tx_type: "swap", sort_type: "desc", offset: 0, limit: 50 },
              timeout: 8000,
            });
            const batch = r.data?.data?.items ?? r.data?.items ?? r.data?.data ?? [];
            if (Array.isArray(batch)) rawItems = [...rawItems, ...batch];
          } catch (e: any) {
            console.warn(`[WHALE] Birdeye ${mint.slice(0,8)} failed:`, e.response?.status, e.message);
          }
        }
        if (rawItems.length > 0) source = "birdeye";
        console.log(`[WHALE] Birdeye raw items: ${rawItems.length}`);
        if (rawItems.length > 0) {
          // Log first item to debug field names
          console.log(`[WHALE] Sample item keys:`, Object.keys(rawItems[0]).join(','));
          console.log(`[WHALE] Sample volumeUsd:`, rawItems[0].volumeUsd, rawItems[0].volume_usd, rawItems[0].vQuote);
        }
      }

      // ── Source 2: DexScreener fallback — recent Solana large txns ─────
      if (rawItems.length === 0) {
        try {
          const ds = await axios.get(
            "https://api.dexscreener.com/latest/dex/search?q=SOL&chainIds=solana",
            { timeout: 8000 }
          );
          const pairs: any[] = (ds.data?.pairs ?? []).slice(0, 10);
          // Synthesise whale rows from the top-volume pairs
          for (const p of pairs) {
            const vol = p.volume?.h24 ?? 0;
            if (vol < 5000) continue;
            rawItems.push({
              _dex_synth:  true,
              tx_hash:     p.pairAddress,
              side:        (p.priceChange?.h1 ?? 0) >= 0 ? "BUY" : "SELL",
              from_symbol: p.baseToken?.symbol ?? "?",
              to_symbol:   p.quoteToken?.symbol ?? "USDC",
              volume_usd:  Math.round(vol / 24),  // per-hour estimate
              owner:       "—",
              block_unix_time: Math.floor(Date.now() / 1000),
              source:      p.dexId ?? "DEX",
            });
          }
          if (rawItems.length > 0) source = "dexscreener";
          console.log(`[WHALE] DexScreener fallback: ${rawItems.length} synthetic items`);
        } catch (e2: any) {
          console.warn("[WHALE] DexScreener fallback failed:", e2.message);
        }
      }

      // ── Normalise ──────────────────────────────────────────────────────
      // Birdeye /defi/txs/token v1 actual response fields:
      //   from: { symbol, amount, uiAmount, price, address }
      //   to:   { symbol, amount, uiAmount, price, address }
      //   owner, blockUnixTime, txHash, source, side ("buy"/"sell")
      //   volumeUsd — direct USD value provided by Birdeye
      const solPrice = (getCached("admin:sol-price", 300_000) as any)?.price ?? 130;

      const normalisedItems = rawItems.map((t: any) => {
        // 1. Direct volumeUsd from Birdeye (most reliable)
        let amountUsd = t.volumeUsd ?? t.volume_usd ?? 0;

        // 2. from nested object (Birdeye v1 actual structure)
        if (!amountUsd || amountUsd < 1) {
          const fromUiAmt = t.from?.uiAmount ?? 0;
          const fromPrice  = t.from?.price   ?? 0;
          if (fromUiAmt > 0 && fromPrice > 0) amountUsd = fromUiAmt * fromPrice;
        }

        // 3. to nested object
        if (!amountUsd || amountUsd < 1) {
          const toUiAmt = t.to?.uiAmount ?? 0;
          const toPrice  = t.to?.price   ?? 0;
          if (toUiAmt > 0 && toPrice > 0) amountUsd = toUiAmt * toPrice;
        }

        // 4. Legacy flat fields
        if (!amountUsd || amountUsd < 1) {
          const amt   = t.from_amount ?? t.vBase ?? t.amount ?? 0;
          const price = t.from_token?.price ?? t.price ?? 0;
          if (amt > 0 && price > 0) amountUsd = amt * price;
        }

        // 5. SOL fallback
        if (!amountUsd || amountUsd < 1) {
          const sym = (t.from?.symbol ?? t.from_symbol ?? t.from_token?.symbol ?? "").toUpperCase();
          if (sym === "SOL" || sym === "WSOL") {
            const solAmt = t.from?.uiAmount ?? t.from_amount ?? 0;
            amountUsd = solAmt * solPrice;
          }
        }

        // 6. DexScreener synthetic
        if (!amountUsd || amountUsd < 1) amountUsd = t.volume_usd ?? 0;

        const side = typeof t.side === "string"
          ? (t.side.toUpperCase().startsWith("B") ? "BUY" : "SELL")
          : ((t.type ?? "").toUpperCase().includes("BUY") ? "BUY" : "SELL");

        return {
          txHash:      t.txHash ?? t.tx_hash ?? t.signature ?? "",
          side,
          tokenIn:     t.from?.symbol ?? t.from_token?.symbol ?? t.from_symbol ?? "SOL",
          tokenOut:    t.to?.symbol   ?? t.to_token?.symbol   ?? t.to_symbol   ?? "USDC",
          amountUsd:   Math.round(amountUsd),
          amountIn:    t.from?.uiAmount ?? t.from_amount ?? t.vBase ?? 0,
          amountOut:   t.to?.uiAmount   ?? t.to_amount   ?? t.vQuote ?? 0,
          wallet:      t.owner ?? t.signer ?? "—",
          timestamp:   t.blockUnixTime ?? t.block_unix_time ?? t.block_time ?? Math.floor(Date.now() / 1000),
          priceImpact: t.price_impact ?? null,
          dex:         t.source ?? t.platform ?? source,
        };
      });

      // Floor at $500 — broad enough to always show data
      const MIN_USD = 500;
      const items = normalisedItems
        .filter(t => t.amountUsd >= MIN_USD)
        .sort((a, b) => b.amountUsd - a.amountUsd)
        .slice(0, 30);

      console.log(`[WHALE] Final items after $${MIN_USD} filter: ${items.length} (source: ${source})`);

      const payload = { items, source, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      console.error("[WHALE] Fatal:", e.message);
      return res.status(500).json({ error: "Whale tracker failed: " + e.message });
    }
  });


  /* =================================================== */
  /* PROTOCOL — MARKET HYPE                              */
  /* CoinGecko trending + DexScreener boosted pairs      */
  /* Composite hype score: mentions + price momentum     */
  /* 5 min server cache                                  */
  /* =================================================== */
  app.get("/api/protocol/market-hype", async (_req: any, res: any) => {
    const key = "protocol:market-hype";
    const hit  = getCached(key, 5 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const [cgTrending, cgMarkets, dsRes] = await Promise.allSettled([
        // CoinGecko trending search (free, no key)
        axios.get("https://api.coingecko.com/api/v3/search/trending", { timeout: 8000 }),
        // CoinGecko top gainers by market cap (free)
        axios.get("https://api.coingecko.com/api/v3/coins/markets", {
          params: { vs_currency: "usd", order: "market_cap_desc", per_page: 50, page: 1,
                    price_change_percentage: "1h,24h,7d", sparkline: false },
          timeout: 8000,
        }),
        // DexScreener boosted tokens (actually trending on DEX)
        axios.get("https://api.dexscreener.com/token-boosts/top/v1", { timeout: 6000 }),
      ]);

      const coins: Map<string, any> = new Map();

      // ── 1. CoinGecko trending (rank 1–15 means max hype signal)
      if (cgTrending.status === "fulfilled") {
        const trendingCoins: any[] = cgTrending.value.data?.coins ?? [];
        trendingCoins.slice(0, 15).forEach((entry: any, idx: number) => {
          const c = entry.item ?? entry;
          const id = c.id ?? c.coin_id ?? c.symbol;
          if (!id) return;
          const existing = coins.get(id) ?? { id, name: c.name, symbol: c.symbol?.toUpperCase(),
            thumb: c.thumb ?? c.small ?? "", hypeScore: 0, sources: [] as string[], price: 0,
            priceChange24h: 0, priceChange7d: 0, volume24h: 0, marketCap: 0, rank: null };
          // Top trending rank is a massive hype signal
          existing.hypeScore   += Math.round(50 - (idx * 3));  // 50 for #1, 47 for #2, etc.
          existing.sources.push("TRENDING");
          existing.marketCap   = c.data?.market_cap_usd ?? c.market_cap_usd ?? existing.marketCap;
          existing.volume24h   = c.data?.total_volume   ?? existing.volume24h;
          existing.price       = c.data?.price?.usd     ?? c.current_price  ?? existing.price;
          existing.priceChange24h = c.data?.price_change_percentage_24h?.usd ?? existing.priceChange24h;
          existing.rank        = idx + 1;
          coins.set(id, existing);
        });
      }

      // ── 2. CoinGecko markets — pick top movers (24h change > 10%)
      if (cgMarkets.status === "fulfilled") {
        const markets: any[] = cgMarkets.value.data ?? [];
        markets.forEach((c: any) => {
          const id = c.id;
          if (!id) return;
          const p24 = c.price_change_percentage_24h ?? 0;
          const p7d = c.price_change_percentage_7d_in_currency ?? 0;
          const volScore = c.total_volume > 100_000_000 ? 15 : c.total_volume > 20_000_000 ? 8 : 0;
          const momentumScore = p24 > 20 ? 20 : p24 > 10 ? 12 : p24 > 5 ? 6 : 0;
          const weekScore = (p7d > 0 && p24 > 0) ? 8 : 0;
          if (momentumScore === 0 && volScore < 8) return; // skip boring coins
          const existing = coins.get(id) ?? { id, name: c.name, symbol: c.symbol?.toUpperCase(),
            thumb: c.image ?? "", hypeScore: 0, sources: [] as string[], price: 0,
            priceChange24h: 0, priceChange7d: 0, volume24h: 0, marketCap: 0, rank: null };
          existing.hypeScore   += momentumScore + volScore + weekScore;
          existing.price        = c.current_price   ?? existing.price;
          existing.priceChange24h = p24;
          existing.priceChange7d  = p7d;
          existing.volume24h    = c.total_volume    ?? existing.volume24h;
          existing.marketCap    = c.market_cap      ?? existing.marketCap;
          if (momentumScore > 0)  existing.sources.push("MOMENTUM");
          if (volScore > 0)       existing.sources.push("HIGH VOL");
          coins.set(id, existing);
        });
      }

      // ── 3. DexScreener boosted tokens
      if (dsRes.status === "fulfilled") {
        const boosted: any[] = Array.isArray(dsRes.value.data) ? dsRes.value.data : [];
        boosted.slice(0, 20).forEach((b: any, idx: number) => {
          const sym  = (b.tokenAddress ?? b.symbol ?? "").toLowerCase();
          const name = b.description  ?? b.name   ?? sym;
          const id   = `dex_${sym}`;
          const existing = coins.get(id) ?? { id, name, symbol: b.symbol?.toUpperCase() ?? sym.toUpperCase(),
            thumb: b.icon ?? b.url ?? "", hypeScore: 0, sources: [] as string[],
            price: 0, priceChange24h: 0, priceChange7d: 0, volume24h: 0, marketCap: 0, rank: null };
          // totalAmount = total SOL/USD boosted — direct hype spend signal
          const boostAmount = b.totalAmount ?? b.amount ?? 0;
          existing.hypeScore += Math.min(35, Math.round(boostAmount / 100));
          existing.sources.push("DEX BOOST");
          existing.rank = idx + 1;
          coins.set(id, existing);
        });
      }

      // ── Assemble top 10 ──────────────────────────────────────────────
      const top10 = Array.from(coins.values())
        .filter(c => c.hypeScore > 0)
        .sort((a, b) => b.hypeScore - a.hypeScore)
        .slice(0, 10)
        .map((c, rank) => ({
          ...c,
          hypeRank:    rank + 1,
          sources:     [...new Set(c.sources)],
          hypeLevel:   c.hypeScore >= 60 ? "EXTREME" : c.hypeScore >= 40 ? "HIGH" : c.hypeScore >= 20 ? "MODERATE" : "BUILDING",
        }));

      const payload = { coins: top10, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      console.error("[MARKET-HYPE]", e.message);
      return res.status(500).json({ error: "Market hype failed: " + e.message });
    }
  });


  /* =================================================== */
  /* NETWORK — CAPITAL FLOW & ROTATION                   */
  /* 5 sub-features: sector rotation, smart money,       */
  /* bridge inflow, whale concentration, liq alerts      */
  /* All free APIs — DeFiLlama + DexScreener             */
  /* =================================================== */

  // ── 1. Sector Rotation Heatmap — DeFiLlama protocol categories ──────────
  app.get("/api/network/capital/sector-rotation", apiLimiter, async (_req: any, res: any) => {
    const key = "capital:sector-rotation";
    const hit  = getCached(key, 5 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const r = await axios.get("https://api.llama.fi/protocols", { timeout: 10000 });
      const protocols: any[] = r.data ?? [];

      // Solana protocols only, group by category
      const SECTORS: Record<string, string[]> = {
        "AI":      ["ai", "artificial intelligence", "machine learning"],
        "RWA":     ["rwa", "real world", "real-world", "tokenized"],
        "DePIN":   ["depin", "physical infrastructure", "iot", "wireless"],
        "LST":     ["liquid staking", "lst", "liquid stake"],
        "DEX":     ["dexes", "dex", "amm", "swap"],
        "Lending": ["lending", "borrow", "collateral", "cdp"],
        "Bridge":  ["bridge", "cross-chain", "crosschain"],
        "Yield":   ["yield", "vault", "farming", "aggregator"],
      };

      const sectorData: Record<string, { tvl: number; change1d: number; change7d: number; protocols: number }> = {};

      for (const [sector, keywords] of Object.entries(SECTORS)) {
        sectorData[sector] = { tvl: 0, change1d: 0, change7d: 0, protocols: 0 };
      }

      protocols
        .filter((p: any) => p.chains?.includes("Solana") && (p.tvl ?? 0) > 10_000)
        .forEach((p: any) => {
          const cat = (p.category ?? "").toLowerCase();
          const name = (p.name ?? "").toLowerCase();

          for (const [sector, keywords] of Object.entries(SECTORS)) {
            if (keywords.some(k => cat.includes(k) || name.includes(k))) {
              sectorData[sector].tvl       += p.tvl ?? 0;
              sectorData[sector].change1d  += p.change_1d ?? 0;
              sectorData[sector].change7d  += p.change_7d ?? 0;
              sectorData[sector].protocols += 1;
              break;
            }
          }
        });

      // Normalise change averages
      for (const s of Object.values(sectorData)) {
        if (s.protocols > 0) {
          s.change1d = parseFloat((s.change1d / s.protocols).toFixed(2));
          s.change7d = parseFloat((s.change7d / s.protocols).toFixed(2));
        }
      }

      const payload = { sectors: sectorData, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Sector rotation failed: " + e.message });
    }
  });

  // ── 2. Smart Money Destination — top protocols by recent inflow ──────────
  app.get("/api/network/capital/smart-money", apiLimiter, async (_req: any, res: any) => {
    const key = "capital:smart-money";
    const hit  = getCached(key, 5 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const r = await axios.get("https://api.llama.fi/protocols", { timeout: 10000 });
      const protocols: any[] = r.data ?? [];

      // Top Solana protocols ranked by 1d inflow (positive change = capital entering)
      const top = protocols
        .filter((p: any) => p.chains?.includes("Solana") && (p.tvl ?? 0) > 500_000 && (p.change_1d ?? 0) > 0)
        .sort((a: any, b: any) => {
          // Sort by absolute TVL inflow (change_1d % * tvl = dollar inflow)
          const inA = ((a.change_1d ?? 0) / 100) * (a.tvl ?? 0);
          const inB = ((b.change_1d ?? 0) / 100) * (b.tvl ?? 0);
          return inB - inA;
        })
        .slice(0, 10)
        .map((p: any) => ({
          name:       p.name,
          category:   p.category ?? "Other",
          tvl:        p.tvl ?? 0,
          change1d:   p.change_1d  ?? 0,
          change7d:   p.change_7d  ?? 0,
          inflow1d:   parseFloat((((p.change_1d ?? 0) / 100) * (p.tvl ?? 0)).toFixed(0)),
          logo:       p.logo ?? "",
        }));

      const payload = { protocols: top, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Smart money failed: " + e.message });
    }
  });

  // ── 3. Bridge Inflow Tracker — DeFiLlama bridges API ────────────────────
  app.get("/api/network/capital/bridge-inflow", apiLimiter, async (_req: any, res: any) => {
    const key = "capital:bridge-inflow";
    const hit  = getCached(key, 5 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const [bridgesRes, volumeRes] = await Promise.allSettled([
        axios.get("https://bridges.llama.fi/bridges?includeChains=true", { timeout: 10000 }),
        axios.get("https://bridges.llama.fi/bridgevolume/Solana?id=all", { timeout: 10000 }),
      ]);

      // Get bridges that support Solana
      const bridges: any[] = bridgesRes.status === "fulfilled"
        ? (bridgesRes.value.data?.bridges ?? []).filter((b: any) =>
            b.chains?.some((c: string) => c.toLowerCase().includes("solana"))
          ).slice(0, 8)
        : [];

      // Volume data
      const volumeData: any[] = volumeRes.status === "fulfilled"
        ? (volumeRes.value.data ?? []).slice(-7)
        : [];

      // Compute 24h inflow total
      const last24h = volumeData[volumeData.length - 1] ?? {};
      const inflow24h  = last24h.depositUSD  ?? 0;
      const outflow24h = last24h.withdrawUSD ?? 0;
      const netFlow    = inflow24h - outflow24h;

      const payload = {
        bridges: bridges.map((b: any) => ({
          name:     b.displayName ?? b.name,
          chains:   b.chains ?? [],
          volume24h: b.volume?.["24h"] ?? 0,
          logo:     b.logo ?? "",
        })),
        volumeHistory: volumeData.map((d: any) => ({
          date:     d.date,
          inflow:   d.depositUSD  ?? 0,
          outflow:  d.withdrawUSD ?? 0,
          net:      (d.depositUSD ?? 0) - (d.withdrawUSD ?? 0),
        })),
        summary: { inflow24h, outflow24h, netFlow },
        cached: false, age: 0,
      };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Bridge inflow failed: " + e.message });
    }
  });

  // ── 4. Whale Concentration Score — DexScreener txn analysis ─────────────
  app.get("/api/network/capital/whale-concentration", apiLimiter, async (_req: any, res: any) => {
    const key = "capital:whale-concentration";
    const hit  = getCached(key, 5 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      // Try to reuse cached DEX flows data first to avoid rate limiting
      const cachedFlows = getCached("dex:pairs", 300_000) as any;
      let pairs: any[] = [];

      if (cachedFlows?.pairs) {
        pairs = cachedFlows.pairs
          .filter((p: any) => (p.liquidity?.usd ?? 0) > 100_000)
          .slice(0, 20);
      } else {
        // Fresh call with longer timeout
        const r = await axios.get(
          "https://api.dexscreener.com/latest/dex/search?q=SOL&chainIds=solana",
          { timeout: 12000 }
        );
        pairs = (r.data?.pairs ?? [])
          .filter((p: any) => (p.liquidity?.usd ?? 0) > 100_000)
          .slice(0, 20);
      }

      // For each pair compute whale vs retail ratio from volume/txn count
      // Large avg txn size = whale driven; small = retail
      const analyzed = pairs.map((p: any) => {
        const vol24h  = p.volume?.h24 ?? 0;
        const txns24h = (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0);
        const avgTxn  = txns24h > 0 ? vol24h / txns24h : 0;

        // Whale threshold: avg txn > $5K = whale dominated
        const whaleScore = Math.min(100, Math.round((avgTxn / 10_000) * 100));
        const driven     = whaleScore > 65 ? "WHALE" : whaleScore > 35 ? "MIXED" : "RETAIL";

        return {
          symbol:     p.baseToken?.symbol ?? "?",
          pair:       `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
          vol24h,
          txns24h,
          avgTxnUsd:  Math.round(avgTxn),
          whaleScore,
          driven,
          priceChange24h: p.priceChange?.h24 ?? 0,
          liquidity:  p.liquidity?.usd ?? 0,
        };
      });

      // Overall market concentration score
      const avgWhaleScore = analyzed.length > 0
        ? Math.round(analyzed.reduce((s, a) => s + a.whaleScore, 0) / analyzed.length)
        : 50;
      const marketDriven = avgWhaleScore > 65 ? "WHALE DOMINATED" : avgWhaleScore > 35 ? "MIXED PARTICIPATION" : "RETAIL DRIVEN";

      const payload = { pairs: analyzed, avgWhaleScore, marketDriven, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Whale concentration failed: " + e.message });
    }
  });

  // ── 5. Liquidity Migration Alerts — DexScreener pool shift detection ─────
  app.get("/api/network/capital/liquidity-alerts", apiLimiter, async (_req: any, res: any) => {
    const key = "capital:liq-alerts";
    const hit  = getCached(key, 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });
    try {
      const r = await axios.get(
        "https://api.dexscreener.com/latest/dex/search?q=SOL&chainIds=solana",
        { timeout: 8000 }
      );
      const pairs: any[] = r.data?.pairs ?? [];

      // Detect large liquidity movements — pairs with significant liq changes
      // DexScreener doesn't give historical liq, so we flag by:
      // High volume/liquidity ratio (unusual activity) + recent creation
      const alerts = pairs
        .filter((p: any) => {
          const liq    = p.liquidity?.usd ?? 0;
          const vol24h = p.volume?.h24    ?? 0;
          const ratio  = liq > 0 ? vol24h / liq : 0;
          return liq > 100_000 && ratio > 3; // vol is 3x liquidity = unusual migration signal
        })
        .sort((a: any, b: any) => {
          const ratioA = (a.volume?.h24 ?? 0) / Math.max(a.liquidity?.usd ?? 1, 1);
          const ratioB = (b.volume?.h24 ?? 0) / Math.max(b.liquidity?.usd ?? 1, 1);
          return ratioB - ratioA;
        })
        .slice(0, 10)
        .map((p: any) => {
          const liq   = p.liquidity?.usd ?? 0;
          const vol   = p.volume?.h24    ?? 0;
          const ratio = liq > 0 ? vol / liq : 0;
          return {
            pair:       `${p.baseToken?.symbol}/${p.quoteToken?.symbol}`,
            dex:        p.dexId ?? "—",
            liquidity:  Math.round(liq),
            volume24h:  Math.round(vol),
            volLiqRatio: parseFloat(ratio.toFixed(2)),
            priceChange24h: p.priceChange?.h24 ?? 0,
            severity:   ratio > 10 ? "HIGH" : ratio > 5 ? "MEDIUM" : "LOW",
          };
        });

      const payload = { alerts, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Liquidity alerts failed: " + e.message });
    }
  });


  /* =================================================== */
  /* HUB AI — Intelligence Briefs                        */
  /* Twice daily: 09:00 UTC (morning) + 18:00 UTC (eve)  */
  /* Uses Claude API + web search + all platform data    */
  /* 50pts / 24hr lock                                   */
  /* =================================================== */

  // Generate signal — called by scheduler or manually by owner
  // ── Compute confluence score — how many signals agree ────────────────────
  function computeConfluence(dataPoints: any, posture: string): number {
    const bullish = posture.includes('BULL') || posture.includes('CONSTRUCT');
    let aligned = 0, total = 0;

    // Signal 1: Chain TPS
    if (dataPoints.chain?.tps) {
      total++;
      if (bullish ? dataPoints.chain.tps > 2000 : dataPoints.chain.tps < 1500) aligned++;
    }
    // Signal 2: Whale net flow
    if (dataPoints.whales) {
      total++;
      const net = dataPoints.whales.netFlow ?? 0;
      if (bullish ? net > 0 : net < 0) aligned++;
    }
    // Signal 3: Bridge inflow
    if (dataPoints.bridge) {
      total++;
      const net = (dataPoints.bridge.netFlow ?? 0);
      if (bullish ? net > 0 : net < 0) aligned++;
    }
    // Signal 4: Fear & Greed
    if (dataPoints.market?.fearGreed) {
      total++;
      const fg = dataPoints.market.fearGreed;
      if (bullish ? fg > 50 : fg < 50) aligned++;
    }
    // Signal 5: Sector rotation
    if (dataPoints.sectors) {
      total++;
      const gainers = Object.values(dataPoints.sectors).filter((s: any) => (s.change1d ?? 0) > 0).length;
      const total_s = Object.keys(dataPoints.sectors).length;
      if (bullish ? gainers > total_s / 2 : gainers <= total_s / 2) aligned++;
    }
    // Signal 6: Market cap change
    if (dataPoints.market?.mcapChange !== undefined) {
      total++;
      if (bullish ? dataPoints.market.mcapChange > 0 : dataPoints.market.mcapChange < 0) aligned++;
    }

    return total > 0 ? Math.round((aligned / total) * 100) : 50;
  }

  // ── Detect active narratives from sector data ──────────────────────────────
  function detectNarratives(dataPoints: any): any[] {
    const narratives: any[] = [];
    const sectors = dataPoints.sectors ?? {};

    const NARRATIVE_MAP: Record<string, { label: string; icon: string }> = {
      AI:      { label: 'AI Tokens',       icon: '🤖' },
      RWA:     { label: 'Real World Assets', icon: '🏛' },
      DePIN:   { label: 'DePIN',           icon: '📡' },
      LST:     { label: 'Liquid Staking',  icon: '💎' },
      DEX:     { label: 'DEX Activity',    icon: '⚡' },
      Lending: { label: 'Lending',         icon: '🏦' },
      Bridge:  { label: 'Bridges',         icon: '🌉' },
      Yield:   { label: 'Yield Farming',   icon: '🌾' },
    };

    for (const [sector, meta] of Object.entries(NARRATIVE_MAP)) {
      const s = sectors[sector];
      if (!s) continue;
      const momentum = s.change1d ?? 0;
      if (Math.abs(momentum) > 1) {
        narratives.push({
          sector,
          label:    meta.label,
          icon:     meta.icon,
          momentum: parseFloat(momentum.toFixed(2)),
          direction: momentum > 0 ? 'gaining' : 'declining',
          tvl:      s.tvl ?? 0,
        });
      }
    }

    // Add macro if Fear & Greed is extreme
    const fg = dataPoints.market?.fearGreed ?? 50;
    if (fg > 75) narratives.push({ sector: 'MACRO', label: 'Extreme Greed', icon: '🔥', momentum: 0, direction: 'warning', tvl: 0 });
    if (fg < 25) narratives.push({ sector: 'MACRO', label: 'Extreme Fear',  icon: '❄️', momentum: 0, direction: 'warning', tvl: 0 });

    return narratives.sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum)).slice(0, 5);
  }

  // ── Per-token analysis prompt ──────────────────────────────────────────────
  const TRACKED_TOKENS = [
    { symbol: 'SOL',  name: 'Solana',   address: 'So11111111111111111111111111111111111111112' },
    { symbol: 'JUP',  name: 'Jupiter',  address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
    { symbol: 'BONK', name: 'BONK',     address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    { symbol: 'WIF',  name: 'Dogwifhat',address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
  ];

  async function generateHubAiSignal(slot: 'morning' | 'evening' | 'manual') {
    const today = new Date().toISOString().split('T')[0];
    const slotKey = slot === 'manual' ? 'manual' : slot;
    const existing = slot !== 'manual' ? getSignalBySlot.get(today, slotKey) as any : null;
    if (existing) return existing;

    console.log(`[HUB AI] Generating ${slot} brief for ${today}...`);

    // ── Gather all platform data ───────────────────────────────────────────
    const dataPoints: any = {};
    try {
      const chain = getCached('sol:chain', 300_000) as any;
      if (chain) {
        const tps = chain.perf?.[0] ? chain.perf[0].numTransactions / chain.perf[0].samplePeriodSecs : 0;
        const fees = (chain.fees ?? []).map((f: any) => Number(f.prioritizationFee ?? 0)).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
        const p50  = fees[Math.floor(fees.length * 0.5)] ?? 0;
        dataPoints.chain = {
          tps:          Math.round(tps),
          epoch:        chain.epoch?.epoch ?? null,
          epochPct:     chain.epoch ? Math.round((chain.epoch.slotIndex / chain.epoch.slotsInEpoch) * 100) : null,
          medianFeeMicroLamports: p50,
          health:       chain.health ?? 'ok',
        };
      }

      // Market intel
      const fng  = await fetch('https://api.alternative.me/fng/?limit=1').then(r => r.json()).catch(() => null);
      if (fng?.data?.[0]) {
        dataPoints.market = {
          fearGreed:      Number(fng.data[0].value),
          fearGreedLabel: fng.data[0].value_classification,
        };
      }

      // Protocols TVL
      const protocols = getCached('protocols:solana', 600_000) as any;
      if (protocols) {
        const arr = protocols as any[];
        const top5 = arr.slice(0, 5).map((p: any) => ({ name: p.name, tvl: p.tvl, change1d: p.change1d }));
        const tvlGainers = arr.filter((p: any) => (p.change1d ?? 0) > 0).length;
        dataPoints.protocols = { top5, totalTvl: arr.reduce((s: number, p: any) => s + (p.tvl ?? 0), 0), tvlGainers, tvlTotal: arr.length };
      }

      // Sector rotation
      const sectorHit = getCached('capital:sector-rotation', 600_000) as any;
      if (sectorHit?.sectors) dataPoints.sectors = sectorHit.sectors;

      // Bridge inflow
      const bridge = getCached('capital:bridge-inflow', 600_000) as any;
      if (bridge?.summary) dataPoints.bridge = bridge.summary;

      // Whale data
      const whales = getCached('protocol:whales', 300_000) as any;
      if (whales?.items) {
        const buys  = (whales.items as any[]).filter(w => w.side === 'BUY').reduce((s: number, w: any) => s + w.amountUsd, 0);
        const sells = (whales.items as any[]).filter(w => w.side === 'SELL').reduce((s: number, w: any) => s + w.amountUsd, 0);
        dataPoints.whales = { totalBuys: buys, totalSells: sells, netFlow: buys - sells, count: whales.items.length };
      }

      // Previous 4 signals for accuracy context
      const prevSignals = (getSignalHistory.all() as any[]).slice(0, 4).map((s: any) => ({
        date: s.date, slot: s.slot, posture: s.posture, confidence: s.confidence,
      }));
      dataPoints.previousSignals = prevSignals;
    } catch (e: any) { console.warn('[HUB AI] Data gather partial:', e.message); }

    // ── Detect narratives ──────────────────────────────────────────────────
    const narratives = detectNarratives(dataPoints);

    // ── Fetch spotlight token (highest momentum from hype if available) ────
    let spotlightToken = { symbol: 'JTO', name: 'Jito' };
    try {
      const hype = getCached('protocol:market-hype', 600_000) as any;
      if (hype?.items?.length) spotlightToken = { symbol: hype.items[0].symbol, name: hype.items[0].name };
    } catch {}

    const allTokens = [...TRACKED_TOKENS, { symbol: spotlightToken.symbol, name: spotlightToken.name, address: '' }];

    // ── Call Groq for main brief ───────────────────────────────────────────
    try {
      const tokenKeys = allTokens.map(t => `    "${t.symbol}": { "posture": "BULLISH|NEUTRAL|BEARISH", "confidence": 50_TO_95, "note": "one sentence" }`).join(',\n');
      const systemPrompt = [
        'You are the HUB AI intelligence engine for ProtocolHub, a professional Solana crypto intelligence platform.',
        'You produce comprehensive twice-daily market intelligence briefs. This is informational analysis, not financial advice.',
        'Tone: Senior analyst. Direct, data-driven, no fluff.',
        'CRITICAL: Return ONLY valid JSON. No markdown, no backticks, no explanation outside the JSON.',
        'Required JSON structure:',
        '{ "posture": "STRONGLY BULLISH|BULLISH|CAUTIOUSLY BULLISH|CONSTRUCTIVE|NEUTRAL|CAUTIOUSLY BEARISH|BEARISH|RISK-OFF",',
        '  "confidence": <number 50-95>,',
        '  "headline": "<one sharp sentence>",',
        '  "sections": { "network": "...", "capital_flow": "...", "market_structure": "...", "smart_money": "...", "outlook": "..." },',
        '  "tokens": { ' + allTokens.map(t => `"${t.symbol}": {"posture":"BULLISH|NEUTRAL|BEARISH","confidence":75,"note":"one sentence"}`).join(', ') + ' }',
        '}',
        'Each section: 2-3 sentences. The last token is the SPOTLIGHT token — note any anomalous activity.',
        'Do not use buy/sell/trade language. Informational only.',
      ].join('\n');

      const userPrompt = `Generate the ${slot === 'morning' ? 'morning (09:00 UTC)' : slot === 'evening' ? 'evening (18:00 UTC)' : 'manual'} intelligence brief for ${today}.

Platform data snapshot:
${JSON.stringify(dataPoints, null, 2)}

Active narratives detected: ${narratives.map(n => `${n.icon} ${n.label} (${n.direction})`).join(', ')}
Spotlight token today: ${spotlightToken.symbol} (${spotlightToken.name})

Analyse each token based on the platform data context. The spotlight token should reflect any anomalous activity.`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model:       'llama-3.3-70b-versatile',
          max_tokens:  2000,
          temperature: 0.35,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY || ''}`,
            'Content-Type':  'application/json',
          },
          timeout: 45_000,
        }
      );

      const raw   = response.data.choices?.[0]?.message?.content?.trim() ?? '';
      const clean = raw.replace(/```json|```/g, '').trim();
      const brief = JSON.parse(clean);

      // Compute confluence score
      const confluence = computeConfluence(dataPoints, brief.posture);

      // Store signal
      insertSignal.run(
        slotKey, today,
        brief.posture,
        brief.confidence,
        confluence,
        JSON.stringify(brief),
        JSON.stringify(brief.tokens ?? {}),
        JSON.stringify(narratives),
        JSON.stringify(Object.keys(dataPoints))
      );

      console.log(`[HUB AI] ✓ ${slot} brief — ${brief.posture} (${brief.confidence}%) · Confluence: ${confluence}/100`);
      return getSignalBySlot.get(today, slotKey);
    } catch (e: any) {
      const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      console.error('[HUB AI] Generation failed:', detail);
      throw new Error(detail);
    }
  }

  // ── Anomaly detection — runs every 15 minutes ──────────────────────────────
  async function runAnomalyDetection() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const recentWindow = now - 15 * 60; // last 15 minutes

      // 1. Whale spike — $500K+ in 10 minutes
      const whales = getCached('protocol:whales', 60_000) as any;
      if (whales?.items) {
        const recent = (whales.items as any[]).filter((w: any) => w.timestamp > now - 600);
        const recentUsd = recent.reduce((s: number, w: any) => s + w.amountUsd, 0);
        if (recentUsd > 500_000) {
          const existing = db.prepare(`SELECT id FROM ai_anomalies WHERE type='WHALE_SPIKE' AND created_at > ? AND dismissed=0`).get(now - 900) as any;
          if (!existing) {
            insertAnomaly.run('WHALE_SPIKE', recentUsd > 2_000_000 ? 'critical' : 'high',
              `Whale Activity Surge Detected`,
              `$${Math.round(recentUsd / 1000)}K moved in the last 10 minutes across ${recent.length} transactions`,
              recentUsd, 500_000);
            console.log(`[HUB AI] Anomaly: WHALE_SPIKE $${Math.round(recentUsd/1000)}K`);
          }
        }
      }

      // 2. Bridge inflow surge
      const bridge = getCached('capital:bridge-inflow', 300_000) as any;
      if (bridge?.summary?.inflow24h > 5_000_000) {
        const existing = db.prepare(`SELECT id FROM ai_anomalies WHERE type='BRIDGE_SURGE' AND created_at > ? AND dismissed=0`).get(now - 3600) as any;
        if (!existing) {
          insertAnomaly.run('BRIDGE_SURGE', 'high',
            `Bridge Inflow Surge`,
            `$${Math.round(bridge.summary.inflow24h / 1_000_000)}M entered Solana via bridges in 24h — significantly above baseline`,
            bridge.summary.inflow24h, 5_000_000);
        }
      }

      // 3. Chain TPS drop
      const chain = getCached('sol:chain', 60_000) as any;
      if (chain?.perf?.[0]) {
        const tps = chain.perf[0].numTransactions / chain.perf[0].samplePeriodSecs;
        if (tps < 500) {
          const existing = db.prepare(`SELECT id FROM ai_anomalies WHERE type='TPS_DROP' AND created_at > ? AND dismissed=0`).get(now - 1800) as any;
          if (!existing) {
            insertAnomaly.run('TPS_DROP', tps < 100 ? 'critical' : 'high',
              `Solana Network Congestion Detected`,
              `Network TPS dropped to ${Math.round(tps)} — significantly below healthy baseline of 2000+`,
              tps, 500);
          }
        }
      }

    } catch (e: any) { console.error('[HUB AI] Anomaly check failed:', e.message); }
  }

    // Schedule signal generation — 09:00 UTC and 18:00 UTC daily
  function scheduleHubAi() {
    function msUntil(hour: number, minute = 0): number {
      const now = new Date();
      const next = new Date();
      next.setUTCHours(hour, minute, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      return next.getTime() - now.getTime();
    }

    // Schedule morning (09:00 UTC)
    setTimeout(() => {
      generateHubAiSignal('morning').catch(() => {});
      setInterval(() => generateHubAiSignal('morning').catch(() => {}), 24 * 60 * 60 * 1000);
    }, msUntil(9, 0));

    // Schedule evening (18:00 UTC)
    setTimeout(() => {
      generateHubAiSignal('evening').catch(() => {});
      setInterval(() => generateHubAiSignal('evening').catch(() => {}), 24 * 60 * 60 * 1000);
    }, msUntil(18, 0));

    // Anomaly detection every 15 minutes — starts after 2 min warm-up
    setTimeout(() => {
      runAnomalyDetection();
      setInterval(() => runAnomalyDetection(), 15 * 60 * 1000);
    }, 2 * 60 * 1000);

    console.log(`[HUB AI] Scheduled — morning in ${Math.round(msUntil(9,0)/60000)}min, evening in ${Math.round(msUntil(18,0)/60000)}min, anomaly detection every 15min`);
  }

  // GET /api/hub-ai — latest signals (requires points unlock)
  app.get("/api/hub-ai", (req: any, res: any) => {
    const wallet = req.headers["x-wallet"] as string;
    const now    = Math.floor(Date.now() / 1000);

    // Check flag
    const flag = getFlag.get("hub_ai") as any;
    if (!flag || flag.status !== "unlocked") {
      return res.status(403).json({ error: "HUB AI is not yet available", comingSoon: true });
    }

    // Check points unlock (gate off = free, whitelist = free)
    const gate = getGateSettings.get() as any;
    if (!gate?.gate_live) {
      // Gate off — return signals freely
    } else if (wallet) {
      const record = db.prepare(`SELECT * FROM nft_access WHERE wallet=?`).get(wallet) as any;
      if (!record) return res.status(403).json({ error: "No NFT access" });
      // Check page access
      const pageOk = record.page_access_page === 'hub_ai' &&
                     record.page_access_expires_at &&
                     record.page_access_expires_at > now;
      const wl = db.prepare(`SELECT * FROM whitelist WHERE wallet=?`).get(wallet) as any;
      const isWl = wl && !wl.revoked;
      const isFounder = wallet === process.env.FOUNDER_WALLET;
      if (!pageOk && !isWl && !isFounder) {
        return res.status(403).json({ error: "Points unlock required", cost: 50, durationHrs: 24 });
      }
    } else {
      return res.status(401).json({ error: "Wallet required" });
    }

    const signals   = getLatestSignals.all() as any[];
    const anomalies = getAnomalies.all() as any[];

    const parsed = signals.map((s: any) => ({
      ...s,
      brief:        typeof s.brief        === 'string' ? JSON.parse(s.brief)        : s.brief,
      tokens:       typeof s.tokens       === 'string' ? JSON.parse(s.tokens)       : (s.tokens ?? {}),
      narratives:   typeof s.narratives   === 'string' ? JSON.parse(s.narratives)   : (s.narratives ?? []),
      sources_used: typeof s.sources_used === 'string' ? JSON.parse(s.sources_used) : (s.sources_used ?? []),
    }));

    // Compute 30-day accuracy (we can't measure it precisely but we track signal count)
    const signalCount = (getSignalHistory.all() as any[]).length;

    return res.json({
      signals: parsed,
      anomalies,
      signalCount,
      generatedAt: parsed[0]?.created_at ?? null,
    });
  });

  // Dismiss anomaly alert
  app.post("/api/hub-ai/dismiss-anomaly", (req: any, res: any) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    dismissAnomaly.run(id);
    return res.json({ success: true });
  });

  // Owner — manually trigger signal generation
  app.post("/api/admin/hub-ai/generate", requireOwner, async (req: any, res: any) => {
    const { slot = 'morning' } = req.body;
    const today = new Date().toISOString().split('T')[0];
    try {
      // Force regenerate — delete existing if present
      db.prepare(`DELETE FROM ai_signals WHERE date=? AND slot=?`).run(today, slot);
      const signal = await generateHubAiSignal(slot as 'morning' | 'evening' | 'manual');
      return res.json({ success: true, signal });
    } catch (e: any) {
      console.error('[HUB AI] Manual gen error:', e.message);
      return res.status(500).json({ error: e.message || 'Generation failed — check GROQ_API_KEY secret' });
    }
  });

  /* =================================================== */
  /* EXPLORE — NEWS (updated: CryptoPanic + 4 RSS feeds) */
  /* CryptoPanic auth_token + Decrypt + CT + CoinDesk    */
  /* Merged, deduped, tagged, sorted by recency          */
  /* 10 min server cache                                 */
  /* =================================================== */

  app.get("/api/explore/news", async (req: any, res: any) => {
    const { page = "1", limit = "12" } = req.query;
    const key = "explore:news:v2";
    const hit  = getCached(key, 10 * 60_000);
    let allNews: any[];

    if (hit) {
      allNews = hit.items;
    } else {
      // Fan out to all sources in parallel
      const [cpRes, decryptRes, ctRes, coinDeskRes, blockRes] = await Promise.allSettled([
        // CryptoPanic — auth_token as query param (not header)
        process.env.CRYPTOPANIC_API
          ? axios.get(`https://cryptopanic.com/api/developer/v2/posts/?auth_token=${process.env.CRYPTOPANIC_API}&kind=news&filter=hot&public=true&currencies=SOL,BTC,ETH`)
          : Promise.reject("no key"),
        fetchRSS("https://decrypt.co/feed",                       "Decrypt",      "WEB3"),
        fetchRSS("https://cointelegraph.com/rss",                 "Cointelegraph","MARKET"),
        fetchRSS("https://www.coindesk.com/arc/outboundfeeds/rss/","CoinDesk",    "MARKET"),
        fetchRSS("https://www.theblock.co/rss.xml",               "The Block",    "MARKET"),
      ]);

      const merged: any[] = [];

      // CryptoPanic items
      if (cpRes.status === "fulfilled") {
        (cpRes.value?.data?.results ?? []).slice(0, 40).forEach((p: any, i: number) => {
          const body = (p.title + (p.body ?? "")).toLowerCase();
          let tag = "MARKET";
          if (body.includes("solana") || body.includes(" sol ")) tag = "SOLANA";
          else if (body.includes("defi") || body.includes("yield")) tag = "DEFI";
          else if (body.includes("web3") || body.includes("nft"))   tag = "WEB3";
          merged.push({
            id:          i + 1,
            title:       p.title      ?? "—",
            source:      p.source?.title ?? "CryptoPanic",
            snippet:     (p.title ?? "").slice(0, 200) + "...",
            tag,
            time:        timeAgo(p.published_at),
            publishedAt: p.published_at ? new Date(p.published_at).getTime() : 0,
            votes:       { positive: p.votes?.positive ?? 0, negative: p.votes?.negative ?? 0 },
          });
        });
      }

      // RSS items
      const rssFeeds = [decryptRes, ctRes, coinDeskRes, blockRes];
      rssFeeds.forEach(r => {
        if (r.status === "fulfilled") merged.push(...r.value);
      });

      // Deduplicate by title similarity (first 40 chars), sort by recency
      const seen = new Set<string>();
      allNews = merged
        .filter(item => {
          const key = item.title.slice(0, 40).toLowerCase().replace(/\s+/g, ' ');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
        .map((item, i) => ({ ...item, id: i + 1 }));

      // Fallback if everything failed
      if (allNews.length === 0) allNews = FALLBACK_NEWS;

      setCache(key, { items: allNews });
    }

    const p = parseInt(page as string), l = parseInt(limit as string), start = (p - 1) * l;
    return res.json({ items: allNews.slice(start, start + l), page: p, hasMore: start + l < allNews.length, total: allNews.length, cached: !!hit, age: cacheAge(key) });
  });


  /* =================================================== */
  /* PROTOCOL — WALLET INTELLIGENCE                      */
  /* Helius tx history → PnL, win rate, hold time,       */
  /* wallet classification. Cached 60s per wallet.       */
  /* =================================================== */

  app.get("/api/protocol/wallet-intel", async (req: any, res: any) => {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    const key = `protocol:wallet-intel:${wallet}`;
    const hit  = getCached(key, 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    try {
      const hRes = await heliusGet(`/v0/addresses/${wallet}/transactions`, {
        params: { "api-key": process.env.HELIUS_API || "", limit: 100 },
      });
      const txs: any[] = hRes.data || [];

      // ── PnL computation ──────────────────────────────────────────────────
      // Track token flows to compute approximate realised PnL
      let realisedPnl = 0;
      let wins = 0, losses = 0;
      const tokenBuys  = new Map<string, number>();  // symbol → total USD spent
      const tokenSells = new Map<string, number>();  // symbol → total USD received
      const holdTimes: number[] = [];
      const dexCounts  = new Map<string, number>();
      let bestPnl = 0, bestToken = '';
      let worstPnl = 0, worstToken = '';

      txs.forEach((tx: any) => {
        // Dex frequency
        if (tx.source && tx.source !== '—') {
          dexCounts.set(tx.source, (dexCounts.get(tx.source) || 0) + 1);
        }
        // Token transfer approximation
        if (tx.type === 'SWAP') {
          (tx.tokenTransfers || []).forEach((t: any) => {
            const sym = t.symbol || 'UNKNOWN';
            const amt = (t.tokenAmount || 0) * 0.001; // approximate USD — no price at time
            tokenBuys.set(sym,  (tokenBuys.get(sym)  || 0) + amt);
            tokenSells.set(sym, (tokenSells.get(sym) || 0) + amt * 1.1); // rough estimate
          });
        }
        // Hold time approximation from consecutive swaps of same token
        if (holdTimes.length < 50 && tx.timestamp) holdTimes.push(tx.timestamp);
      });

      // Compute avg hold time from timestamp deltas
      let avgHoldMs = 0;
      if (holdTimes.length > 1) {
        const deltas = holdTimes.slice(0, -1).map((t, i) => Math.abs((holdTimes[i] - holdTimes[i+1]) * 1000));
        avgHoldMs = deltas.reduce((s, d) => s + d, 0) / deltas.length;
      }

      // Compute per-token PnL and find best/worst
      tokenSells.forEach((sold, sym) => {
        const spent = tokenBuys.get(sym) || 0;
        const pnl   = sold - spent;
        realisedPnl += pnl;
        if (pnl > 0) wins++; else if (pnl < 0) losses++;
        if (pnl > bestPnl)  { bestPnl = pnl;   bestToken  = sym; }
        if (pnl < worstPnl) { worstPnl = pnl;  worstToken = sym; }
      });

      const totalTrades = wins + losses;
      const winRate     = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

      // Sort DEXes by usage
      const topDexes = [...dexCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([dex]) => dex);

      // Wallet classification
      const swaps    = txs.filter((t: any) => t.type === 'SWAP');
      const timeSpan = txs.length > 1 ? Math.abs(txs[0].timestamp - txs[txs.length - 1].timestamp) : 86400;
      const txPerDay = txs.length / Math.max(1, timeSpan / 86400);
      const avgNative = txs.reduce((s: number, t: any) => s + (t.nativeTransfers?.[0]?.amount ?? 0), 0) / Math.max(1, txs.length) / 1e9;
      const nftMints  = txs.filter((t: any) => t.type === 'NFT_MINT').length;

      let classification: string;
      let classScore: number;

      if (txPerDay > 50)                                    { classification = 'BOT';         classScore = Math.min(100, Math.round(txPerDay)); }
      else if (avgNative > 500)                             { classification = 'WHALE';        classScore = Math.min(100, Math.round(avgNative / 10)); }
      else if (nftMints > 5 && swaps.length > 10)          { classification = 'INSIDER';      classScore = 75; }
      else if (swaps.length > 15 && txPerDay < 10 && avgNative > 5) { classification = 'SMART MONEY'; classScore = 80; }
      else                                                  { classification = 'RETAIL';       classScore = 40; }

      const profile = {
        wallet:         wallet as string,
        classification,
        classScore,
        realisedPnl,
        winRate,
        totalTrades,
        avgHoldMs,
        bestTrade:  bestToken  ? { token: bestToken,  pnl: bestPnl  } : null,
        worstTrade: worstToken ? { token: worstToken, pnl: worstPnl } : null,
        topDexes,
        activityBurst: parseFloat(txPerDay.toFixed(1)),
        firstSeen: txs.length > 0 ? txs[txs.length - 1].timestamp : 0,
        lastSeen:  txs.length > 0 ? txs[0].timestamp : 0,
      };

      const payload = {
        profile,
        recentTxs: txs.slice(0, 10).map((tx: any) => ({
          signature:   tx.signature || "",
          type:        tx.type || "UNKNOWN",
          description: tx.description || tx.type,
          timestamp:   tx.timestamp || 0,
          fee:         tx.fee || 0,
          status:      tx.transactionError ? "FAILED" : "SUCCESS",
          source:      tx.source || "—",
          tokenTransfers:  (tx.tokenTransfers  || []).slice(0, 2),
          nativeTransfers: (tx.nativeTransfers || []).slice(0, 2),
        })),
        cached: false, age: 0,
      };

      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Wallet intel failed: " + e.message });
    }
  });

  /* =================================================== */
  /* PROTOCOL — TOKEN GENEALOGY                          */
  /* All tokens deployed by a given wallet.              */
  /* GoPlus lookup per deployer — 5 min cache.           */
  /* =================================================== */

  app.get("/api/protocol/token-genealogy", async (req: any, res: any) => {
    const { deployer } = req.query;
    if (!deployer) return res.status(400).json({ error: "deployer required" });
    const key = `protocol:genealogy:${deployer}`;
    const hit  = getCached(key, 5 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    try {
      // Get all transactions from deployer to find contract deployments
      const hRes = await axios.get(`https://api.helius.xyz/v0/addresses/${deployer}/transactions`, {
        params: { "api-key": process.env.HELIUS_API || "", limit: 100 },
      }).catch(() => ({ data: [] }));

      // Extract unique token mint addresses from tx history
      const mints = new Set<string>();
      (hRes.data || []).forEach((tx: any) => {
        (tx.tokenTransfers || []).forEach((t: any) => {
          if (t.mint && t.fromUserAccount === deployer) mints.add(t.mint);
        });
      });

      // Screen each mint via GoPlus (batch up to 10 to avoid rate limits)
      const mintList = [...mints].slice(0, 10);
      const tokens: any[] = [];

      await Promise.allSettled(mintList.map(async (mint) => {
        try {
          const gp = await axios.get(`https://api.gopluslabs.io/api/v1/token_security/solana?contract_addresses=${mint}`)
            .catch(() => ({ data: { result: {} } }));
          const info = gp.data?.result?.[mint.toLowerCase()] || {};
          const sellTax = parseFloat(info.sell_tax || '0');
          const isRugged = info.is_honeypot === '1' || sellTax > 90;
          const isDead   = info.holder_count === '0' || info.holder_count === '1';

          tokens.push({
            address:     mint,
            name:        info.token_name   || '—',
            symbol:      info.token_symbol || '—',
            status:      isRugged ? 'RUGGED' : isDead ? 'DEAD' : 'ACTIVE',
            riskScore:   Math.min(100, (info.is_honeypot === '1' ? 80 : 0) + (sellTax > 10 ? 20 : 0) + (info.is_mintable === '1' ? 15 : 0)),
            holderCount: info.holder_count || '—',
            sellTax:     info.sell_tax     || '0',
          });
        } catch {}
      }));

      const payload = { deployer, tokens, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Genealogy failed: " + e.message });
    }
  });

  /* =================================================== */
  /* EXPLORE — NARRATIVE MOMENTUM INDEX                  */
  /* 6 baskets. CoinGecko public + DexScreener fallback  */
  /* for LSTs. 3 min server cache — serves all users.    */
  /* =================================================== */

  app.get("/api/explore/narrative", async (_req: any, res: any) => {
    const key = "explore:narrative";
    const hit  = getCached(key, 3 * 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    const BASKETS: Record<string, { label: string; emoji: string; ids: string[] }> = {
      ai:        { label: 'AI',        emoji: '🤖', ids: ['worldcoin','render-token','fetch-ai','bittensor','ocean-protocol','akash-network'] },
      depin:     { label: 'DePIN',     emoji: '📡', ids: ['helium','helium-mobile','iotex','hivemapper','geodnet'] },
      rwa:       { label: 'RWA',       emoji: '🏦', ids: ['ondo-finance','maple','centrifuge','truefi','polymesh-network'] },
      memecoins: { label: 'MEMECOINS', emoji: '🐸', ids: ['bonk','dogwifcoin','popcat','myro','book-of-meme'] },
      gamefi:    { label: 'GAMEFI',    emoji: '🎮', ids: ['gala','immutable-x','beam-2','ronin','pixels'] },
      lsts:      { label: 'LSTs',      emoji: '⬡',  ids: ['jito-staked-sol','msol','blazestake-staked-sol','jpool-staked-sol'] },
    };

    // Fetch all basket token prices in parallel (CoinGecko public, no key)
    const allIds = [...new Set(Object.values(BASKETS).flatMap(b => b.ids))];
    let cgData: any[] = [];
    try {
      const cgRes = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
        params: { vs_currency: "usd", ids: allIds.join(","), per_page: 250, sparkline: false, price_change_percentage: "24h" },
      });
      cgData = cgRes.data || [];
    } catch (e: any) { console.warn("[narrative] CoinGecko failed:", e.message); }

    // DexScreener fallback for tokens CoinGecko missed
    const cgFound = new Set(cgData.map((c: any) => c.id));
    const missing = allIds.filter(id => !cgFound.has(id));
    if (missing.length > 0) {
      try {
        // Map LST symbols to DexScreener search
        const lstSymbols: Record<string, string> = {
          'jito-staked-sol':        'JITOSOL',
          'msol':                   'mSOL',
          'blazestake-staked-sol':  'bSOL',
          'jpool-staked-sol':       'JSOL',
        };
        await Promise.allSettled(missing.map(async (id) => {
          const sym = lstSymbols[id] || id;
          const dxRes = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${sym}`)
            .catch(() => ({ data: { pairs: [] } }));
          const top = (dxRes.data?.pairs || [])
            .filter((p: any) => p.chainId === 'solana' && p.baseToken?.symbol?.toUpperCase() === sym.toUpperCase())
            .sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
          if (top) {
            cgData.push({
              id,
              price_change_percentage_24h: top.priceChange?.h24 ?? 0,
              total_volume: top.volume?.h24 ?? 0,
            });
          }
        }));
      } catch {}
    }

    // Build price map
    const priceMap = new Map<string, { change24h: number; volume24h: number }>();
    cgData.forEach((c: any) => priceMap.set(c.id, { change24h: c.price_change_percentage_24h ?? 0, volume24h: c.total_volume ?? 0 }));

    // Score each basket
    const indices = Object.entries(BASKETS).map(([id, basket]) => {
      const tokens = basket.ids
        .map(tid => ({ symbol: tid.split('-')[0].toUpperCase(), ...(priceMap.get(tid) ?? { change24h: 0, volume24h: 0 }) }))
        .filter(t => t.change24h !== 0 || t.volume24h !== 0);

      if (tokens.length === 0) return null;

      const avgChange = tokens.reduce((s, t) => s + t.change24h, 0) / tokens.length;
      const totalVol  = tokens.reduce((s, t) => s + t.volume24h, 0);
      const leader    = [...tokens].sort((a, b) => b.change24h - a.change24h)[0];

      // Momentum score: map -30 to +30% range to 0–100
      const score = Math.max(0, Math.min(100, Math.round(((avgChange + 30) / 60) * 100)));
      const trend  = avgChange > 10 ? 'SURGING' : avgChange > 3 ? 'RISING' : avgChange < -10 ? 'CRASHING' : avgChange < -3 ? 'FALLING' : 'NEUTRAL';

      return {
        id, label: basket.label, emoji: basket.emoji,
        score, change24h: parseFloat(avgChange.toFixed(2)),
        volume24h: totalVol,
        leader:    leader?.symbol ?? '—',
        leaderChg: leader?.change24h ?? 0,
        tokens:    tokens.map(t => ({ symbol: t.symbol, change24h: parseFloat(t.change24h.toFixed(2)), volume24h: t.volume24h })),
        trend,
      };
    }).filter(Boolean);

    const payload = { indices, cached: false, age: 0 };
    setCache(key, payload);
    return res.json(payload);
  });

  /* =================================================== */
  /* EXPLORE — ALPHA FEED                                */
  /* New DexScreener pools screened by GoPlus.           */
  /* Only < 48h old, GoPlus clean, liq > threshold.      */
  /* 60s server cache — one fetch for all users.         */
  /* =================================================== */

  app.get("/api/explore/alpha-feed", async (_req: any, res: any) => {
    const key = "explore:alpha-feed";
    const hit  = getCached(key, 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    try {
      // DexScreener new token profiles = most recently listed tokens across all chains
      // Then fetch their pairs to get Solana-specific data
      const now = Date.now();

      // Fetch recently listed token profiles + top Solana pairs in parallel
      const [profilesRes, solPairsRes] = await Promise.allSettled([
        axios.get("https://api.dexscreener.com/token-profiles/latest/v1")
          .catch(() => ({ data: [] })),
        // Also search high-activity new SOL/WSOL pairs directly
        axios.get("https://api.dexscreener.com/latest/dex/search?q=WSOL")
          .catch(() => ({ data: { pairs: [] } })),
      ]);

      // Collect Solana token addresses from new profiles
      const newAddresses: string[] = [];
      const profiles = profilesRes.status === 'fulfilled'
        ? (Array.isArray(profilesRes.value.data) ? profilesRes.value.data : [])
        : [];
      profiles
        .filter((p: any) => p.chainId === 'solana' && p.tokenAddress)
        .slice(0, 20)
        .forEach((p: any) => newAddresses.push(p.tokenAddress));

      // Fetch pair data for new profile tokens (batch by comma-separated addresses)
      let profilePairs: any[] = [];
      if (newAddresses.length > 0) {
        try {
          const batchRes = await axios.get(
            `https://api.dexscreener.com/latest/dex/tokens/${newAddresses.slice(0, 10).join(',')}`
          );
          profilePairs = batchRes.data?.pairs ?? [];
        } catch {}
      }

      // Combine: profile pairs + WSOL search results
      const solPairs = solPairsRes.status === 'fulfilled'
        ? (solPairsRes.value.data?.pairs ?? [])
        : [];

      const allPairs = [...profilePairs, ...solPairs];
      const seen = new Set<string>();

      const candidates = allPairs
        .filter((p: any) => {
          if (!p?.pairAddress || seen.has(p.pairAddress)) return false;
          seen.add(p.pairAddress);
          return p.chainId === 'solana'
              && (p.liquidity?.usd ?? 0) >= 5_000;
        })
        .sort((a: any, b: any) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, 30);

      // Screen top 10 via GoPlus (free, no key — batch responsibly)
      const screenResults = new Map<string, { riskScore: number; riskLevel: string; passedScreen: boolean }>();

      await Promise.allSettled(candidates.slice(0, 10).map(async (p: any) => {
        const addr = p.baseToken?.address;
        if (!addr) return;
        try {
          const gp = await axios.get(`https://api.gopluslabs.io/api/v1/token_security/solana?contract_addresses=${addr}`)
            .catch(() => ({ data: { result: {} } }));
          const info     = gp.data?.result?.[addr.toLowerCase()] || {};
          const isHoney  = info.is_honeypot      === '1';
          const isMint   = info.is_mintable       === '1';
          const sellTax  = parseFloat(info.sell_tax  || '0');
          const buyTax   = parseFloat(info.buy_tax   || '0');

          let riskScore = 0;
          if (isHoney)       riskScore += 80;
          if (isMint)        riskScore += 20;
          if (sellTax > 10)  riskScore += 20;
          if (buyTax  > 10)  riskScore += 10;
          riskScore = Math.min(100, riskScore);

          screenResults.set(addr, {
            riskScore,
            riskLevel:    riskScore >= 70 ? 'DANGER' : riskScore >= 30 ? 'CAUTION' : 'SAFE',
            passedScreen: !isHoney && sellTax < 20 && riskScore < 60,
          });
        } catch {}
      }));

      const pools = candidates.map((p: any) => {
        const addr      = p.baseToken?.address ?? '';
        const screen    = screenResults.get(addr) ?? { riskScore: 50, riskLevel: 'CAUTION', passedScreen: false };
        const ageHours  = p.pairCreatedAt ? (now - p.pairCreatedAt) / 3_600_000 : 0;
        return {
          pairAddress:    p.pairAddress    ?? '',
          baseSymbol:     p.baseToken?.symbol ?? '—',
          baseName:       p.baseToken?.name   ?? '—',
          baseAddress:    addr,
          quoteSymbol:    p.quoteToken?.symbol ?? '—',
          priceUsd:       parseFloat(p.priceUsd || '0'),
          priceChange24h: p.priceChange?.h24 ?? 0,
          liquidityUsd:   p.liquidity?.usd    ?? 0,
          volume24h:      p.volume?.h24       ?? 0,
          buys24h:        p.txns?.h24?.buys   ?? 0,
          sells24h:       p.txns?.h24?.sells  ?? 0,
          chainId:        p.chainId   ?? 'solana',
          dexId:          p.dexId     ?? '—',
          createdAt:      p.pairCreatedAt ?? 0,
          ageHours:       parseFloat(ageHours.toFixed(1)),
          ...screen,
        };
      });

      const payload = { pools, cached: false, age: 0 };
      setCache(key, payload);
      return res.json(payload);
    } catch (e: any) {
      return res.status(500).json({ error: "Alpha feed failed: " + e.message });
    }
  });

  /* =================================================== */
  /* EXPLORE — SMART MONEY SIGNALS                       */
  /* Aggregates Birdeye whale cache — zero extra API.    */
  /* Groups by token, finds whale wallet convergence.    */
  /* 30s cache — computed from existing whale data.      */
  /* =================================================== */

  app.get("/api/explore/smart-money", async (_req: any, res: any) => {
    const key = "explore:smart-money";
    const hit  = getCached(key, 30_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    // Pull from existing whale tracker cache or refresh it
    const whaleKey  = "protocol:whales";
    let   whaleData = getCached(whaleKey, 60_000);
    if (!whaleData) {
      try {
        const data = await axios.get("https://public-api.birdeye.so/defi/txs/token", {
          headers: { "X-API-KEY": process.env.BIRD_API || "", "x-chain": "solana" },
          params: { address: "So11111111111111111111111111111111111111112", tx_type: "swap", sort_type: "desc", offset: 0, limit: 100 },
        });
        const items = (data.data?.data?.items ?? [])
          .filter((t: any) => {
            const usd = (t.from_amount ?? 0) * (t.from_token?.price ?? 1);
            return usd >= 10_000;
          })
          .map((t: any) => {
            const amountUsd = (t.from_amount ?? 0) * (t.from_token?.price ?? 1);
            return {
              txHash:    t.tx_hash          ?? "",
              side:      (t.side ?? 'buy').toLowerCase().includes('buy') ? "BUY" : "SELL",
              tokenIn:   t.from_token?.symbol ?? "—",
              tokenOut:  t.to_token?.symbol   ?? "—",
              amountUsd: Math.round(amountUsd),
              wallet:    t.owner ?? t.signer  ?? "—",
              timestamp: t.block_unix_time ?? t.block_time ?? Math.floor(Date.now() / 1000),
            };
          });
        whaleData = { items };
        setCache(whaleKey, whaleData);
      } catch (e: any) {
        return res.status(500).json({ error: "Smart money failed: " + e.message });
      }
    }

    // Group by tokenOut, collect distinct wallets per token in 15-min windows
    const now = Math.floor(Date.now() / 1000);
    const WINDOW = 4 * 60 * 60; // 4 hours — wide enough to catch accumulation patterns
    const groups = new Map<string, { tokenIn: string; buys: any[]; sells: any[] }>();

    (whaleData.items || []).forEach((move: any) => {
      if (now - move.timestamp > WINDOW) return;
      const k = move.tokenOut;
      if (!groups.has(k)) groups.set(k, { tokenIn: move.tokenIn, buys: [], sells: [] });
      if (move.side === 'BUY')  groups.get(k)!.buys.push(move);
      else                       groups.get(k)!.sells.push(move);
    });

    const signals: any[] = [];
    groups.forEach((g, tokenOut) => {
      const allMoves   = [...g.buys, ...g.sells];
      const wallets    = [...new Set(allMoves.map(m => m.wallet).filter(w => w !== '—'))];
      if (wallets.length < 1) return;

      const totalUsd  = allMoves.reduce((s, m) => s + m.amountUsd, 0);
      const buyUsd    = g.buys.reduce((s, m) => s + m.amountUsd, 0);
      const buyPct    = totalUsd > 0 ? Math.round((buyUsd / totalUsd) * 100) : 50;
      const timestamps = allMoves.map(m => m.timestamp).sort();
      const whaleCount = wallets.length;
      const signal     = buyPct > 60 ? 'ACCUMULATION' : buyPct < 40 ? 'DISTRIBUTION' : 'MIXED';
      const strength   = whaleCount >= 10 ? 'STRONG' : whaleCount >= 5 ? 'MODERATE' : 'WEAK';

      signals.push({
        tokenIn:   g.tokenIn,
        tokenOut,
        whaleCount,
        totalUsd,
        avgUsd:    Math.round(totalUsd / whaleCount),
        buyPct,
        wallets,
        signal,
        strength,
        firstSeen: (timestamps[0] || now) * 1000,
        lastSeen:  (timestamps[timestamps.length - 1] || now) * 1000,
      });
    });

    // Sort by whale count descending
    signals.sort((a, b) => b.whaleCount - a.whaleCount);

    const payload = { signals, cached: false, age: 0 };
    setCache(key, payload);
    return res.json(payload);
  });


  /* =================================================== */
  /* UNIVERSAL SEARCH — /api/search                      */
  /* Auto-detects query type and routes to right source. */
  /* Solana wallet · EVM contract · tx sig · symbol      */
  /* .sol/.eth domain. Cache 60s per query.              */
  /* =================================================== */

  app.get("/api/search", async (req: any, res: any) => {
    const { q, type } = req.query;
    if (!q) return res.status(400).json({ error: "q required" });

    const query   = (q as string).trim();
    const qType   = (type as string) || "unknown";
    const cacheKey = `search:${query}`;
    const hit      = getCached(cacheKey, 60_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(cacheKey) });

    try {
      let payload: any = { queryType: qType, query, cached: false, age: 0 };

      /* ── .sol domain → Bonfida resolve → then wallet profile ── */
      if (qType === "sol-domain") {
        try {
          const bonfida = await axios.get(
            `https://sns-sdk-proxy.bonfida.workers.dev/resolve/${encodeURIComponent(query)}`
          ).catch(() => null);
          const address = bonfida?.data?.result;
          if (address) {
            payload.domain = { domain: query, address, chain: "solana" };
            // Also profile the resolved wallet
            const walletPayload = await resolveWallet(address);
            if (walletPayload) payload.wallet = walletPayload;
          } else {
            payload.domain = { domain: query, address: "Could not resolve", chain: "solana" };
          }
        } catch (e: any) {
          payload.domain = { domain: query, address: "Resolution failed", chain: "solana" };
        }

      /* ── .eth domain → ENS resolve ── */
      } else if (qType === "eth-domain") {
        try {
          const ensRes = await axios.get(
            `https://api.ensideas.com/ens/resolve/${encodeURIComponent(query)}`
          ).catch(() => null);
          const address = ensRes?.data?.address;
          payload.domain = {
            domain:  query,
            address: address || "Could not resolve",
            chain:   "ethereum",
          };
        } catch {
          payload.domain = { domain: query, address: "Resolution failed", chain: "ethereum" };
        }

      /* ── Solana wallet address → full wallet profile ── */
      } else if (qType === "solana-wallet") {
        const walletData = await resolveWallet(query);
        if (walletData) payload.wallet = walletData;
        else throw new Error("Could not load wallet data");

      /* ── Transaction signature → Helius enhanced parse ── */
      } else if (qType === "tx-signature") {
        const txRes = await axios.get(
          `https://api.helius.xyz/v0/transactions/?api-key=${process.env.HELIUS_API || ""}`,
          { params: { transactions: query } }
        ).catch(() => null);

        const tx = (txRes?.data ?? [])[0];
        if (tx) {
          const nativeTransfers = (tx.nativeTransfers || []).map((t: any) => ({
            fromUser: t.fromUserAccount || "", toUser: t.toUserAccount || "", amount: t.amount || 0,
          }));
          const totalSolMoved = nativeTransfers.reduce((s: number, t: any) => s + t.amount, 0) / 1e9;
          payload.tx = {
            signature:       tx.signature    || query,
            type:            tx.type         || "UNKNOWN",
            description:     tx.description  || tx.type || "Transaction",
            timestamp:       tx.timestamp    || 0,
            fee:             tx.fee          || 0,
            status:          tx.transactionError ? "FAILED" : "SUCCESS",
            source:          tx.source       || "—",
            totalSolMoved,
            tokenTransfers:  (tx.tokenTransfers  || []).map((t: any) => ({
              mint: t.mint || "", fromUser: t.fromUserAccount || "",
              toUser: t.toUserAccount || "", amount: t.tokenAmount || 0, symbol: t.symbol || "—",
            })),
            nativeTransfers,
            accounts:        tx.accountData?.map((a: any) => a.account || "") ?? [],
          };
        } else {
          throw new Error("Transaction not found — may be too old or invalid signature");
        }

      /* ── EVM contract address → GoPlus + DexScreener ── */
      } else if (qType === "evm-address") {
        // Detect chain from address (EVM default to ETH then BNB)
        const chains = ["1", "56", "137", "42161"];
        let gpData: any = {};
        for (const chain of chains) {
          try {
            const gp = await axios.get(
              `https://api.gopluslabs.io/api/v1/token_security/${chain}?contract_addresses=${query}`
            );
            const info = gp.data?.result?.[query.toLowerCase()];
            if (info && (info.token_name || info.token_symbol)) { gpData = info; break; }
          } catch {}
        }

        // DexScreener for price data
        const dxRes = await axios.get(
          `https://api.dexscreener.com/latest/dex/tokens/${query}`
        ).catch(() => ({ data: { pairs: [] } }));

        const topPair = (dxRes.data?.pairs || [])
          .sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

        const sellTax  = parseFloat(gpData.sell_tax  || "0");
        const buyTax   = parseFloat(gpData.buy_tax   || "0");
        const isHoney  = gpData.is_honeypot  === "1";
        const isMint   = gpData.is_mintable  === "1";
        let riskScore  = 0;
        if (isHoney)      riskScore += 80;
        if (isMint)       riskScore += 20;
        if (sellTax > 10) riskScore += 20;
        if (buyTax  > 10) riskScore += 10;
        riskScore = Math.min(100, riskScore);

        payload.token = {
          address:        query,
          name:           gpData.token_name   || topPair?.baseToken?.name   || "—",
          symbol:         gpData.token_symbol || topPair?.baseToken?.symbol || "—",
          price:          parseFloat(topPair?.priceUsd || "0"),
          priceChange24h: topPair?.priceChange?.h24 ?? 0,
          volume24h:      topPair?.volume?.h24       ?? 0,
          marketCap:      topPair?.fdv               ?? 0,
          liquidity:      topPair?.liquidity?.usd    ?? 0,
          holderCount:    gpData.holder_count        ?? "—",
          riskScore,
          riskLevel:      riskScore >= 70 ? "DANGER" : riskScore >= 30 ? "CAUTION" : "SAFE",
          aiScore:        Math.max(0, Math.min(100, 80 - riskScore + Math.min(20, Math.round((topPair?.volume?.h24 ?? 0) / 50_000)))),
          chain:          topPair?.chainId ?? "ethereum",
          dex:            topPair?.dexId   ?? "—",
          buyTax:         gpData.buy_tax   ?? "0",
          sellTax:        gpData.sell_tax  ?? "0",
          mintable:       isMint,
          honeypot:       isHoney,
          deployer:       gpData.creator_address ?? "—",
        };

      /* ── Token symbol / name → CoinGecko + DexScreener ── */
      } else {
        // CoinGecko search
        const cgSearch = await axios.get(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
          process.env.CG_API_ ? { headers: { "x-cg-demo-api-key": process.env.CG_API_ } } : {}
        ).catch(() => ({ data: { coins: [] } }));

        const cgCoins = (cgSearch.data?.coins ?? []).slice(0, 5);

        // Fetch market data for matched coins
        let cgMarket: any[] = [];
        if (cgCoins.length > 0) {
          const ids = cgCoins.map((c: any) => c.id).join(",");
          const mRes = await axios.get(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false&price_change_percentage=24h`,
            process.env.CG_API_ ? { headers: { "x-cg-demo-api-key": process.env.CG_API_ } } : {}
          ).catch(() => ({ data: [] }));
          cgMarket = mRes.data ?? [];
        }

        // DexScreener search for on-chain tokens (esp. Solana ones not on CoinGecko)
        const dxSearch = await axios.get(
          `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
        ).catch(() => ({ data: { pairs: [] } }));

        // Combine and deduplicate
        const tokens: any[] = [];
        const seen = new Set<string>();

        // CoinGecko results first (most established)
        cgMarket.forEach((c: any) => {
          const key = c.id;
          if (seen.has(key)) return;
          seen.add(key);
          tokens.push({
            address:        c.id,
            name:           c.name,
            symbol:         c.symbol?.toUpperCase() ?? "—",
            price:          c.current_price           ?? 0,
            priceChange24h: c.price_change_percentage_24h ?? 0,
            volume24h:      c.total_volume             ?? 0,
            marketCap:      c.market_cap               ?? 0,
            liquidity:      0,
            holderCount:    "—",
            riskScore:      0,
            riskLevel:      "SAFE",
            aiScore:        Math.min(100, Math.round(50 + (c.price_change_percentage_24h ?? 0) * 0.5 + Math.min(30, (c.total_volume ?? 0) / 1_000_000))),
            chain:          "multichain",
            dex:            "coingecko",
            buyTax:         "0",
            sellTax:        "0",
            mintable:       false,
            honeypot:       false,
            deployer:       "—",
          });
        });

        // DexScreener on-chain pairs (top by liquidity, deduped)
        const dxPairs = (dxSearch.data?.pairs ?? [])
          .sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
          .slice(0, 8);

        dxPairs.forEach((p: any) => {
          const key = p.baseToken?.address ?? p.pairAddress;
          if (seen.has(key)) return;
          seen.add(key);
          tokens.push({
            address:        p.baseToken?.address ?? p.pairAddress,
            name:           p.baseToken?.name    ?? "—",
            symbol:         p.baseToken?.symbol  ?? "—",
            price:          parseFloat(p.priceUsd || "0"),
            priceChange24h: p.priceChange?.h24 ?? 0,
            volume24h:      p.volume?.h24      ?? 0,
            marketCap:      p.fdv              ?? 0,
            liquidity:      p.liquidity?.usd   ?? 0,
            holderCount:    "—",
            riskScore:      p.liquidity?.usd < 50_000 ? 30 : 0,
            riskLevel:      p.liquidity?.usd < 50_000 ? "CAUTION" : "SAFE",
            aiScore:        Math.min(100, Math.round(50 + (p.priceChange?.h24 ?? 0) * 0.5 + Math.min(20, (p.volume?.h24 ?? 0) / 100_000))),
            chain:          p.chainId ?? "—",
            dex:            p.dexId   ?? "—",
            buyTax:         "0",
            sellTax:        "0",
            mintable:       false,
            honeypot:       false,
            deployer:       "—",
          });
        });

        if (tokens.length === 1) {
          payload.token  = tokens[0];
        } else if (tokens.length > 1) {
          payload.tokens = tokens;
        } else {
          throw new Error(`No results found for "${query}"`);
        }
      }

      setCache(cacheKey, payload);
      return res.json(payload);

    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Search failed" });
    }
  });


  /* ── Token Launch Sniper — DexScreener new Solana pairs ── */
  app.get("/api/explore/sniper", async (_req: any, res: any) => {
    const key = "explore:sniper";
    const hit  = getCached(key, 15_000);
    if (hit) return res.json({ ...hit, cached: true, age: cacheAge(key) });

    try {
      // Fetch latest Solana token profiles from DexScreener
      const profileRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
        headers: { "Accept": "application/json" },
      });
      const profiles = await profileRes.json();

      // Only Solana addresses from last 24h
      const solAddresses = (Array.isArray(profiles) ? profiles : [])
        .filter((p: any) => p.chainId === "solana")
        .map((p: any) => p.tokenAddress)
        .slice(0, 50);

      if (solAddresses.length === 0) {
        return res.json({ tokens: [], cached: false });
      }

      // Batch fetch pair data for these tokens
      const batchSize = 20;
      const allPairs: any[] = [];

      for (let i = 0; i < solAddresses.length; i += batchSize) {
        const batch = solAddresses.slice(i, i + batchSize);
        try {
          const pairRes  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`);
          const pairData = await pairRes.json();
          if (pairData.pairs) allPairs.push(...pairData.pairs);
        } catch {}
      }

      // Also pull boosted/trending new pairs directly
      try {
        const newPairsRes  = await fetch("https://api.dexscreener.com/token-boosts/latest/v1");
        const boosted      = await newPairsRes.json();
        const boostedAddrs = (Array.isArray(boosted) ? boosted : [])
          .filter((b: any) => b.chainId === "solana")
          .map((b: any) => b.tokenAddress)
          .slice(0, 20);

        if (boostedAddrs.length > 0) {
          const bRes  = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${boostedAddrs.join(",")}`);
          const bData = await bRes.json();
          if (bData.pairs) allPairs.push(...bData.pairs);
        }
      } catch {}

      // Deduplicate by pairAddress
      const seen = new Set<string>();
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;

      const tokens = allPairs
        .filter((p: any) => {
          if (!p || p.chainId !== "solana")    return false;
          if (seen.has(p.pairAddress))         return false;
          const created = p.pairCreatedAt ?? 0;
          if (created < cutoff)                return false;
          seen.add(p.pairAddress);
          return true;
        })
        .map((p: any) => ({
          pairAddress:   p.pairAddress,
          baseAddress:   p.baseToken?.address ?? "",
          symbol:        p.baseToken?.symbol  ?? "?",
          name:          p.baseToken?.name    ?? "Unknown",
          priceUsd:      parseFloat(p.priceUsd ?? "0"),
          priceChange5m: p.priceChange?.m5   ?? 0,
          priceChange1h: p.priceChange?.h1   ?? 0,
          liquidityUsd:  p.liquidity?.usd    ?? 0,
          volume5m:      p.volume?.m5        ?? 0,
          volume1h:      p.volume?.h1        ?? 0,
          buys5m:        p.txns?.m5?.buys    ?? 0,
          sells5m:       p.txns?.m5?.sells   ?? 0,
          fdv:           p.fdv               ?? 0,
          createdAt:     p.pairCreatedAt     ?? Date.now(),
          dexId:         p.dexId             ?? "unknown",
          txns24h:       (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0),
        }))
        .sort((a: any, b: any) => b.createdAt - a.createdAt)
        .slice(0, 100);

      const payload = { tokens, cached: false };
      setCache(key, payload);
      return res.json(payload);

    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Sniper fetch failed" });
    }
  });


  // ══════════════════════════════════════════════════════════════════════════
  // POINTS SYSTEM ROUTES
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/points/:wallet — balance + history ───────────────────────────
  app.get("/api/points/:wallet", (req: any, res: any) => {
    const { wallet } = req.params;
    const record = db.prepare(`SELECT points_balance, points_earned_total, page_access_expires_at, page_access_page FROM nft_access WHERE wallet=?`).get(wallet) as any;
    if (!record) return res.json({ pointsBalance: 0, pointsTotal: 0, pageAccess: null, history: [] });

    const now = Math.floor(Date.now() / 1000);
    const history = db.prepare(`SELECT * FROM point_transactions WHERE wallet=? ORDER BY created_at DESC LIMIT 50`).all(wallet);

    return res.json({
      pointsBalance: record.points_balance || 0,
      pointsTotal:   record.points_earned_total || 0,
      pageAccess:    record.page_access_expires_at && record.page_access_expires_at > now
        ? { page: record.page_access_page, expiresAt: new Date(record.page_access_expires_at * 1000).toISOString() }
        : null,
      history,
    });
  });

  // ── POST /api/points/redeem-month — burn 500pts for free month ────────────
  app.post("/api/points/redeem-month", (req: any, res: any) => {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "wallet required" });

    const record = db.prepare(`SELECT * FROM nft_access WHERE wallet=?`).get(wallet) as any;
    if (!record)         return res.status(404).json({ error: "No NFT found for this wallet" });
    if (record.revoked)  return res.status(403).json({ error: "Access revoked" });

    const COST = 500;
    const balance = record.points_balance || 0;
    if (balance < COST) return res.status(400).json({ error: `Not enough points — need ${COST}, have ${balance}` });

    const now        = Math.floor(Date.now() / 1000);
    const currentExp = record.expires_at && record.expires_at > now ? record.expires_at : now;
    const newExpiry  = currentExp + 30 * 86400;
    const newBalance = balance - COST;

    db.prepare(`UPDATE nft_access SET points_balance=?, expires_at=?, grace_expires_at=NULL, last_renewed_at=?, renewal_count=renewal_count+1 WHERE wallet=?`)
      .run(newBalance, newExpiry, now, wallet);
    db.prepare(`INSERT INTO point_transactions (wallet, mint, type, amount, balance_after, reason) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(wallet, record.mint_address || wallet, "BURN_MONTH", -COST, newBalance, "Redeemed free month — 500 pts burned");
    db.prepare(`INSERT INTO nft_history (mint, wallet, event, detail, price_usd, tx_sig) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(record.mint_address || wallet, wallet, "RENEW", "Free month redeemed via points (500 pts burned)", 0, null);
    logAudit.run("POINTS_REDEEM_MONTH", "system", wallet, `Burned 500 pts — new expiry ${new Date(newExpiry * 1000).toISOString()}`);

    return res.json({
      success:      true,
      pointsBurned: COST,
      pointsBalance: newBalance,
      expiresAt:    new Date(newExpiry * 1000).toISOString(),
      daysLeft:     30,
    });
  });

  // ── POST /api/points/burn-page-access — variable cost + duration per page ──
  // Page configs: sniper=50pts/24hr | capital_flow_smart=25pts/12hr | capital_flow_whale=25pts/12hr
  app.post("/api/points/burn-page-access", (req: any, res: any) => {
    const { wallet, page } = req.body;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    if (!page)   return res.status(400).json({ error: "page required" });

    // Page cost + duration config
    const PAGE_CONFIG: Record<string, { cost: number; durationHrs: number }> = {
      sniper:               { cost: 50, durationHrs: 24 },
      capital_flow_smart:   { cost: 25, durationHrs: 12 },
      capital_flow_whale:   { cost: 25, durationHrs: 12 },
      cf_sector:            { cost: 25, durationHrs: 12 },
      cf_bridge:            { cost: 25, durationHrs: 12 },
      cf_smart:             { cost: 25, durationHrs: 12 },
      cf_whale:             { cost: 25, durationHrs: 12 },
      hub_ai:               { cost: 50, durationHrs: 24 },
    };
    const cfg = PAGE_CONFIG[page] ?? { cost: 50, durationHrs: 24 };

    // Founder + whitelist bypass — free access, no points deducted
    const _isFounder = wallet === process.env.FOUNDER_WALLET;
    const _wl = getWhitelistEntry.get(wallet) as any;
    if (_isFounder || (_wl && !_wl.revoked)) {
      const _now = Math.floor(Date.now() / 1000);
      return res.json({ success: true, pointsBurned: 0, durationHrs: cfg.durationHrs, pointsBalance: 999999, page, accessExpiresAt: new Date((_now + cfg.durationHrs * 3600) * 1000).toISOString() });
    }

    const record = db.prepare(`SELECT * FROM nft_access WHERE wallet=?`).get(wallet) as any;
    if (!record)        return res.status(404).json({ error: "No NFT found for this wallet" });
    if (record.revoked) return res.status(403).json({ error: "Access revoked" });

    const balance = record.points_balance || 0;
    if (balance < cfg.cost) return res.status(400).json({ error: `Not enough points — need ${cfg.cost}, have ${balance}` });

    const now        = Math.floor(Date.now() / 1000);
    const newBalance = balance - cfg.cost;
    const accessExp  = now + cfg.durationHrs * 3600;

    db.prepare(`UPDATE nft_access SET points_balance=?, page_access_expires_at=?, page_access_page=? WHERE wallet=?`)
      .run(newBalance, accessExp, page, wallet);
    db.prepare(`INSERT INTO point_transactions (wallet, mint, type, amount, balance_after, reason) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(wallet, record.mint_address || wallet, "BURN_PAGE", -cfg.cost, newBalance,
        `Unlocked page: ${page} for ${cfg.durationHrs}hr — ${cfg.cost} pts burned`);
    logAudit.run("POINTS_BURN_PAGE", "system", wallet, `page=${page} burned ${cfg.cost}pts expires=${new Date(accessExp * 1000).toISOString()}`);

    return res.json({
      success:      true,
      pointsBurned: cfg.cost,
      durationHrs:  cfg.durationHrs,
      pointsBalance: newBalance,
      page,
      accessExpiresAt: new Date(accessExp * 1000).toISOString(),
    });
  });

  // ── GET /api/points/history/:wallet — full tx log ─────────────────────────
  app.get("/api/points/history/:wallet", (req: any, res: any) => {
    const { wallet } = req.params;
    const history = db.prepare(`SELECT * FROM point_transactions WHERE wallet=? ORDER BY created_at DESC LIMIT 100`).all(wallet);
    return res.json({ history });
  });


  // ══════════════════════════════════════════════════════════════════════════
  // ON-CHAIN SYNC ROUTES
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/sync/status — show out-of-sync NFTs + cost estimate ──────────
  app.get("/api/sync/status", requireAdmin, (req: any, res: any) => {
    // Find NFTs whose points_balance differs from points_synced_balance
    const outOfSync = db.prepare(`
      SELECT wallet, mint_address, points_balance, points_synced_balance, points_synced_at
      FROM nft_access
      WHERE revoked = 0
        AND points_balance != COALESCE(points_synced_balance, -1)
      ORDER BY wallet
    `).all() as any[];

    // ~5000 lamports per metadata update (Metaplex fee + rent + compute)
    const LAMPORTS_PER_NFT = 5000;
    const totalLamports    = outOfSync.length * LAMPORTS_PER_NFT;
    const solCost          = totalLamports / 1e9;

    // Get pending/active request if any
    const activeRequest = db.prepare(`
      SELECT * FROM sync_requests
      WHERE status NOT IN ('complete', 'failed')
      ORDER BY created_at DESC LIMIT 1
    `).get() as any;

    // Get last completed sync
    const lastSync = db.prepare(`
      SELECT * FROM sync_requests WHERE status='complete' ORDER BY completed_at DESC LIMIT 1
    `).get() as any;

    return res.json({
      outOfSyncCount: outOfSync.length,
      outOfSync:      outOfSync.slice(0, 100), // cap preview at 100
      solCost:        solCost.toFixed(6),
      lamports:       totalLamports,
      updateAuthority: process.env.UPDATE_AUTHORITY_PUBKEY || null,
      activeRequest,
      lastSync,
    });
  });

  // ── POST /api/sync/request — admin submits sync request to owner ──────────
  app.post("/api/sync/request", requireAdmin, (req: any, res: any) => {
    const session = (req as any).adminSession;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    // Block if already a pending/active request
    const existing = db.prepare(`
      SELECT id FROM sync_requests WHERE status NOT IN ('complete','failed') LIMIT 1
    `).get();
    if (existing) return res.status(409).json({ error: "A sync request is already pending owner approval" });

    const outOfSync = db.prepare(`
      SELECT wallet FROM nft_access
      WHERE revoked=0 AND points_balance != COALESCE(points_synced_balance, -1)
    `).all() as any[];

    if (outOfSync.length === 0) return res.json({ success: true, message: "All NFTs already in sync" });

    const LAMPORTS_PER_NFT = 5000;
    const lamports = outOfSync.length * LAMPORTS_PER_NFT;
    const wallets  = outOfSync.map((r: any) => r.wallet);

    const result = db.prepare(`
      INSERT INTO sync_requests (status, nft_count, sol_cost_lamports, wallets_json, requested_by)
      VALUES ('pending', ?, ?, ?, ?)
    `).run(outOfSync.length, lamports, JSON.stringify(wallets), session.role || 'admin');

    logAudit.run("SYNC_REQUESTED", session.role || "admin", null,
      `${outOfSync.length} NFTs out of sync — ${(lamports/1e9).toFixed(6)} SOL needed`);

    return res.json({
      success:   true,
      requestId: result.lastInsertRowid,
      nftCount:  outOfSync.length,
      lamports,
      solCost:   (lamports / 1e9).toFixed(6),
    });
  });

  // ── POST /api/sync/approve — owner approves the pending request ───────────
  app.post("/api/sync/approve", requireOwner, (req: any, res: any) => {
    const { requestId } = req.body;
    const request = db.prepare(`SELECT * FROM sync_requests WHERE id=?`).get(requestId) as any;
    if (!request)                  return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: `Request is already ${request.status}` });

    db.prepare(`UPDATE sync_requests SET status='approved', approved_by='owner' WHERE id=?`).run(requestId);
    logAudit.run("SYNC_APPROVED", "owner", null, `Request #${requestId} approved`);

    return res.json({
      success:        true,
      requestId,
      status:         "approved",
      updateAuthority: process.env.UPDATE_AUTHORITY_PUBKEY || null,
      lamports:       request.sol_cost_lamports,
      solCost:        (request.sol_cost_lamports / 1e9).toFixed(6),
    });
  });

  // ── POST /api/sync/deny — owner denies the request ───────────────────────
  app.post("/api/sync/deny", requireOwner, (req: any, res: any) => {
    const { requestId, reason } = req.body;
    const request = db.prepare(`SELECT * FROM sync_requests WHERE id=?`).get(requestId) as any;
    if (!request) return res.status(404).json({ error: "Request not found" });

    db.prepare(`UPDATE sync_requests SET status='failed', error_detail=? WHERE id=?`)
      .run(reason || "Denied by owner", requestId);
    logAudit.run("SYNC_DENIED", "owner", null, `Request #${requestId} denied: ${reason || "no reason"}`);

    return res.json({ success: true });
  });

  // ── POST /api/sync/confirm-payment — owner submits tx sig after sending SOL
  app.post("/api/sync/confirm-payment", requireOwner, async (req: any, res: any) => {
    const { requestId, txSignature } = req.body;
    if (!txSignature) return res.status(400).json({ error: "txSignature required" });

    const request = db.prepare(`SELECT * FROM sync_requests WHERE id=?`).get(requestId) as any;
    if (!request)                   return res.status(404).json({ error: "Request not found" });
    if (request.status !== "approved") return res.status(400).json({ error: "Request not approved yet" });

    // Verify tx via Helius — confirm SOL reached update authority
    try {
      const heliusKey = process.env.HELIUS_API || "";
      const txRes     = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${heliusKey}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ transactions: [txSignature] }),
      });
      const txData = await txRes.json();
      const tx     = Array.isArray(txData) ? txData[0] : null;

      if (!tx) return res.status(400).json({ error: "Transaction not found — try again in a few seconds" });

      const updateAuthority = process.env.UPDATE_AUTHORITY_PUBKEY || "";
      const received = tx.nativeTransfers?.find((t: any) =>
        t.toUserAccount === updateAuthority &&
        t.amount >= request.sol_cost_lamports * 0.95 // 5% tolerance for rounding
      );

      if (!received && updateAuthority) {
        return res.status(400).json({ error: "Payment not detected to update authority address — check tx and try again" });
      }

      // Mark paying and kick off async batch sync
      db.prepare(`UPDATE sync_requests SET status='uploading', payment_tx=?, started_at=? WHERE id=?`)
        .run(txSignature, Math.floor(Date.now() / 1000), requestId);
      logAudit.run("SYNC_PAYMENT_CONFIRMED", "owner", null, `tx=${txSignature}`);

      // Run sync async — don't block the response
      runMetaplexSync(requestId).catch(console.error);

      return res.json({ success: true, status: "uploading", requestId });
    } catch (e: any) {
      return res.status(500).json({ error: "Payment verification failed: " + e.message });
    }
  });

  // ── GET /api/sync/requests — list all sync requests (owner sees all, admin sees own) ──
  app.get("/api/sync/requests", requireAdmin, (req: any, res: any) => {
    const session = (req as any).adminSession;
    const isOwner = session?.role === "owner";
    const rows = isOwner
      ? db.prepare(`SELECT * FROM sync_requests ORDER BY created_at DESC LIMIT 50`).all()
      : db.prepare(`SELECT * FROM sync_requests WHERE requested_by != 'owner' ORDER BY created_at DESC LIMIT 20`).all();
    return res.json({ requests: rows });
  });

  // ── GET /api/sync/request/:id — poll status of specific request ───────────
  app.get("/api/sync/request/:id", requireAdmin, (req: any, res: any) => {
    const request = db.prepare(`SELECT * FROM sync_requests WHERE id=?`).get(req.params.id) as any;
    if (!request) return res.status(404).json({ error: "Not found" });
    return res.json({ request });
  });

  return httpServer;
}


/* ── runMetaplexSync — batch update on-chain metadata for out-of-sync NFTs ──
   Uses env vars already set in Replit Secrets:
     UPDATE_AUTHORITY_KEYPAIR — JSON array of secret key bytes
     UPDATE_AUTHORITY_PUBKEY  — base58 public key
     NFT_COLLECTION_ID        — collection mint address
     NFT_METADATA_URI         — base metadata URI
   ─────────────────────────────────────────────────────────────────────────── */
async function runMetaplexSync(requestId: number): Promise<void> {
  const request = db.prepare(`SELECT * FROM sync_requests WHERE id=?`).get(requestId) as any;
  if (!request) return;

  // Load update authority keypair from env
  const keypairBytes = JSON.parse(process.env.UPDATE_AUTHORITY_KEYPAIR || "[]");
  if (!keypairBytes.length) {
    db.prepare(`UPDATE sync_requests SET status='failed', error_detail=? WHERE id=?`)
      .run("UPDATE_AUTHORITY_KEYPAIR not set in environment", requestId);
    return;
  }

  // Lazy-load Metaplex UMI — only imported when sync runs
  let umi: any, keypairIdentity: any, publicKey: any, updateV1: any, fetchMetadataFromSeeds: any;
  try {
    const umiCore      = await import("@metaplex-foundation/umi");
    const umiBundle    = await import("@metaplex-foundation/umi-bundle-defaults");
    const mplToken     = await import("@metaplex-foundation/mpl-token-metadata");
    umi                = umiBundle.createUmi(process.env.QN_HTTP_A || "https://api.mainnet-beta.solana.com");
    keypairIdentity    = umiCore.keypairIdentity;
    publicKey          = umiCore.publicKey;
    updateV1           = mplToken.updateV1;
    fetchMetadataFromSeeds = mplToken.fetchMetadataFromSeeds;

    const updateAuthorityKp = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(keypairBytes));
    umi.use(keypairIdentity(updateAuthorityKp));
    umi.use(mplToken.mplTokenMetadata());
  } catch (e: any) {
    db.prepare(`UPDATE sync_requests SET status='failed', error_detail=? WHERE id=?`)
      .run("Metaplex UMI load failed: " + e.message, requestId);
    return;
  }

  const wallets: string[] = request.wallets_json ? JSON.parse(request.wallets_json) : [];
  let synced = 0;
  let failed = 0;

  for (const wallet of wallets) {
    try {
      const record = db.prepare(`SELECT * FROM nft_access WHERE wallet=?`).get(wallet) as any;
      if (!record?.mint_address) { failed++; continue; }

      const newBalance  = record.points_balance || 0;
      const mintPubkey  = publicKey(record.mint_address);

      // Fetch current on-chain metadata
      const metadata = await fetchMetadataFromSeeds(umi, { mint: mintPubkey });

      // Merge updated points attribute — preserve all existing attributes
      const existingAttrs: any[] = (metadata.attributes?.value ?? [])
        .filter((a: any) => a.key !== "Points Balance");

      existingAttrs.push({ key: "Points Balance", value: String(newBalance) });

      // Update on-chain metadata
      await updateV1(umi, {
        mint:      mintPubkey,
        authority: umi.identity,
        data: {
          name:                 metadata.name,
          symbol:               metadata.symbol,
          uri:                  process.env.NFT_METADATA_URI || metadata.uri,
          sellerFeeBasisPoints: metadata.sellerFeeBasisPoints,
          creators:             metadata.creators,
          collection:           metadata.collection,
          uses:                 metadata.uses,
        },
        newUpdateAuthority: null,  // keep same update authority
        primarySaleHappened: null,
        isMutable: true,
      }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

      // Mark synced in DB
      db.prepare(`UPDATE nft_access SET points_synced_balance=?, points_synced_at=? WHERE wallet=?`)
        .run(newBalance, Math.floor(Date.now() / 1000), wallet);

      synced++;
      await new Promise(r => setTimeout(r, 300)); // avoid rate limiting

    } catch (err: any) {
      console.error(`Sync failed for wallet ${wallet}:`, err.message);
      failed++;
    }

    // Update live progress every 10 NFTs
    if ((synced + failed) % 10 === 0) {
      db.prepare(`UPDATE sync_requests SET synced_count=?, failed_count=? WHERE id=?`)
        .run(synced, failed, requestId);
    }
  }

  const finalStatus = synced > 0 || failed === 0 ? "complete" : "failed";
  db.prepare(`
    UPDATE sync_requests
    SET status=?, synced_count=?, failed_count=?, completed_at=?
    WHERE id=?
  `).run(finalStatus, synced, failed, Math.floor(Date.now() / 1000), requestId);

  logAudit.run("SYNC_COMPLETE", "system", null,
    `Request #${requestId} — ${synced} synced, ${failed} failed`);
}

/* ── resolveWallet: Helius profile for any Solana address ── */
async function resolveWallet(address: string): Promise<any | null> {
  try {
    // Tx history
    const hRes = await axios.get(
      `https://api.helius.xyz/v0/addresses/${address}/transactions`,
      { params: { limit: 50 } }
    );
    const txs: any[] = hRes.data || [];

    // SOL balance
    let solBalance = 0;
    try {
      const balRes = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API || ""}`,
        { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }
      );
      solBalance = (balRes.data?.result?.value ?? 0) / 1e9;
    } catch {}

    // Build profile (same logic as wallet-intel route)
    const dexCounts  = new Map<string, number>();
    const tokenBuys  = new Map<string, number>();
    const tokenSells = new Map<string, number>();
    let bestPnl = 0, bestToken = "", worstPnl = 0, worstToken = "";
    const holdTimes: number[] = [];

    txs.forEach((tx: any) => {
      if (tx.source) dexCounts.set(tx.source, (dexCounts.get(tx.source) || 0) + 1);
      if (tx.type === "SWAP") {
        (tx.tokenTransfers || []).forEach((t: any) => {
          const sym = t.symbol || "UNKNOWN";
          const amt = (t.tokenAmount || 0) * 0.001;
          tokenBuys.set(sym,  (tokenBuys.get(sym)  || 0) + amt);
          tokenSells.set(sym, (tokenSells.get(sym) || 0) + amt * 1.1);
        });
      }
      if (holdTimes.length < 50 && tx.timestamp) holdTimes.push(tx.timestamp);
    });

    let realisedPnl = 0, wins = 0, losses = 0;
    tokenSells.forEach((sold, sym) => {
      const pnl = sold - (tokenBuys.get(sym) || 0);
      realisedPnl += pnl;
      if (pnl > 0) wins++; else if (pnl < 0) losses++;
      if (pnl > bestPnl)  { bestPnl = pnl;   bestToken  = sym; }
      if (pnl < worstPnl) { worstPnl = pnl;  worstToken = sym; }
    });

    let avgHoldMs = 0;
    if (holdTimes.length > 1) {
      const deltas = holdTimes.slice(0, -1).map((t, i) => Math.abs((holdTimes[i] - holdTimes[i + 1]) * 1000));
      avgHoldMs = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    }

    const totalTrades  = wins + losses;
    const winRate      = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const topDexes     = [...dexCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([d]) => d);
    const timeSpan     = txs.length > 1 ? Math.abs(txs[0].timestamp - txs[txs.length - 1].timestamp) : 86400;
    const txPerDay     = txs.length / Math.max(1, timeSpan / 86400);
    const avgNative    = txs.reduce((s: number, t: any) => s + (t.nativeTransfers?.[0]?.amount ?? 0), 0) / Math.max(1, txs.length) / 1e9;
    const nftMints     = txs.filter((t: any) => t.type === "NFT_MINT").length;
    const swaps        = txs.filter((t: any) => t.type === "SWAP");

    let classification: string, classScore: number;
    if      (txPerDay > 50)                              { classification = "BOT";         classScore = Math.min(100, Math.round(txPerDay)); }
    else if (avgNative > 500)                            { classification = "WHALE";        classScore = Math.min(100, Math.round(avgNative / 10)); }
    else if (nftMints > 5 && swaps.length > 10)         { classification = "INSIDER";      classScore = 75; }
    else if (swaps.length > 15 && txPerDay < 10 && avgNative > 5) { classification = "SMART MONEY"; classScore = 80; }
    else                                                 { classification = "RETAIL";       classScore = 40; }

    return {
      address,
      classification,
      classScore,
      realisedPnl,
      winRate,
      totalTrades,
      avgHoldMs,
      bestTrade:  bestToken  ? { token: bestToken,  pnl: bestPnl  } : null,
      worstTrade: worstToken ? { token: worstToken, pnl: worstPnl } : null,
      topDexes,
      solBalance,
      recentTxs: txs.slice(0, 6).map((tx: any) => ({
        type:        tx.type        || "UNKNOWN",
        description: tx.description || tx.type || "Transaction",
        timestamp:   tx.timestamp   || 0,
        totalSolMoved: (tx.nativeTransfers || []).reduce((s: number, t: any) => s + t.amount, 0) / 1e9,
      })),
    };
  } catch {
    return null;
  }
}

/* ===================================================== */
/* HELPERS                                               */
/* ===================================================== */

function humanizeTx(tx: any): string {
  switch (tx.type) {
    case "SWAP":      return `Swapped tokens on ${tx.source || "DEX"}`;
    case "TRANSFER":  return `Transferred ${tx.nativeTransfers?.[0]?.amount ? (tx.nativeTransfers[0].amount / 1e9).toFixed(4) + " SOL" : "tokens"}`;
    case "NFT_SALE":  return `Sold NFT on ${tx.source || "marketplace"}`;
    case "NFT_MINT":  return "Minted NFT";
    case "STAKE":     return "Staked SOL";
    default:          return (tx.type || "Unknown").replace(/_/g, " ").toLowerCase();
  }
}

function timeAgo(isoDate?: string): string {
  if (!isoDate) return "recently";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

/* ===================================================== */
/* FALLBACK NEWS                                         */
/* ===================================================== */

const FALLBACK_NEWS = [
  { id: 1, title: "Solana Poised to Experience a New ATH as Institutional Inflows Surge", source: "CoinDesk", snippet: "On-chain data reveals record staking participation and a 340% spike in institutional wallet activity...", full: "On-chain data reveals record staking participation and a 340% spike in institutional wallet activity over the past 14 days. Analysts point to the upcoming Firedancer validator client as the primary catalyst, with throughput projections exceeding 1M TPS. Combined with compressed NFT volume hitting all-time highs and DeFi TVL recovering past $8B, a breakout above the previous ATH looks increasingly probable.", tag: "SOL", time: "12 min ago" },
  { id: 2, title: "Bonk ($BONK) Makes Strategic Treasury Move — Partners With Major CEX", source: "The Block", snippet: "The Bonk DAO voted 94% in favour of a $4M treasury diversification into protocol-owned liquidity...", full: "The Bonk DAO voted 94% in favour of a $4M treasury diversification into protocol-owned liquidity, locking funds across three Solana DEXs. An unannounced tier-1 CEX listing is scheduled for next week. The move follows Bonk's integration into 12 Solana-native wallets as a default gas-fee payment token.", tag: "BONK", time: "38 min ago" },
  { id: 3, title: "Ethereum L2s Hit Combined TVL Record of $52B", source: "L2Beat", snippet: "Arbitrum, Base, and Optimism collectively absorbed $3.2B in new deposits this week alone...", full: "Arbitrum, Base, and Optimism collectively absorbed $3.2B in new deposits this week alone, pushing combined Layer-2 TVL to $52B. Base's developer grants program resulted in 1,400 new contracts deployed in 30 days. Blob transaction volume post-EIP-4844 is keeping validator revenue stable.", tag: "ETH", time: "1 hr ago" },
  { id: 4, title: "DeFi Yield Wars Intensify — Protocols Offering 40%+ APY on Stables", source: "DeFiLlama", snippet: "A new wave of incentive campaigns has pushed stablecoin yields to levels not seen since 2022...", full: "A new wave of incentive campaigns has pushed stablecoin yields to levels not seen since the 2022 bull peak. Risk analysts warn many yields are token-incentive driven and unsustainable beyond 90 days. Aave v3 and Curve still show organic yields of 8–14%.", tag: "DEFI", time: "2 hr ago" },
  { id: 5, title: "Bitcoin Options Market Signals Bullish Bias Into Q2", source: "Deribit", snippet: "Put/call ratio drops to 0.42 — its lowest reading in 8 months — as traders pile into call options...", full: "Put/call ratio drops to 0.42, its lowest in 8 months, as traders pile into $120K and $150K strike calls. BTC options open interest crossed $32B — a new ATH. The market prices a 68% probability of Bitcoin above $100K by end of Q2.", tag: "BTC", time: "3 hr ago" },
  { id: 6, title: "Sui Network Sees 800% Spike in Daily Active Addresses", source: "Messari", snippet: "Gaming and NFT apps on Sui drove a record 2.1M daily active addresses this week...", full: "Gaming and NFT applications on Sui drove a record 2.1M daily active addresses, outpacing both Avalanche and Aptos for the first time. The network processes 4,200 TPS sustained with zero downtime in 60 days.", tag: "SUI", time: "4 hr ago" },
  { id: 7, title: "Whale Alert: $240M USDT Moved From Binance to Unknown Wallet", source: "Whale Alert", snippet: "A transfer of 240,000,000 USDT from Binance was detected at block 19,842,100...", full: "A 240M USDT transfer from Binance was detected at block 19,842,100. Historical analysis of similar moves shows 60% correlation with upward price action within 48–72 hours. The receiving wallet has no prior history, consistent with cold storage.", tag: "USDT", time: "5 hr ago" },
  { id: 8, title: "Uniswap v4 Launch Confirmed — Hook Economy Expected to Explode", source: "Decrypt", snippet: "The Uniswap Foundation confirmed a Q2 mainnet launch for v4 with a hooks architecture...", full: "The Uniswap Foundation confirmed Q2 mainnet launch for v4 featuring a hooks architecture. Over 300 hook contracts are live on testnet. Analysts project $50–200M in annualised revenue for hook developers within 12 months.", tag: "UNI", time: "6 hr ago" },
];

// Smart Helius key rotation — tries A first, falls back to B on 429
