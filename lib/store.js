'use strict';
/**
 * Tiny storage layer.
 *  - Production: Upstash Redis over its REST API (added from the Vercel Marketplace; it sets
 *    KV_REST_API_URL and KV_REST_API_TOKEN automatically). No npm package needed.
 *  - Local testing: set LOCAL_DEV=1 and an in-memory store is used.
 *  - Otherwise mode() is 'none' and the admin shows "storage not connected"; the public site
 *    keeps working from content.config.json.
 */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = new Map();

function mode() {
  if (URL_ && TOKEN) return 'redis';
  if (process.env.LOCAL_DEV === '1') return 'memory';
  return 'none';
}

async function rcmd(args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'Storage error ' + r.status);
  return j.result;
}

async function getJSON(key, def) {
  const m = mode();
  if (m === 'redis') {
    const v = await rcmd(['GET', key]);
    return v ? JSON.parse(v) : def;
  }
  if (m === 'memory') return mem.has(key) ? JSON.parse(mem.get(key)) : def;
  return def;
}

async function setJSON(key, val) {
  const m = mode();
  const s = JSON.stringify(val);
  if (m === 'redis') return rcmd(['SET', key, s]);
  if (m === 'memory') return void mem.set(key, s);
  throw new Error('Storage is not connected');
}

/** counter with expiry (used for login rate limiting) */
async function hit(key, ttlSeconds) {
  const m = mode();
  if (m === 'redis') {
    const n = await rcmd(['INCR', key]);
    if (n === 1) await rcmd(['EXPIRE', key, String(ttlSeconds)]);
    return n;
  }
  if (m === 'memory') {
    const rec = mem.get(key) || { n: 0, exp: Date.now() + ttlSeconds * 1000 };
    if (rec.exp < Date.now()) { rec.n = 0; rec.exp = Date.now() + ttlSeconds * 1000; }
    rec.n++; mem.set(key, rec); return rec.n;
  }
  return 0;
}
async function clearHit(key) {
  const m = mode();
  if (m === 'redis') return rcmd(['DEL', key]);
  mem.delete(key);
}

async function pushLog(entry) {
  const m = mode();
  const s = JSON.stringify(entry);
  if (m === 'redis') { await rcmd(['LPUSH', 'fue:audit', s]); await rcmd(['LTRIM', 'fue:audit', '0', '499']); return; }
  if (m === 'memory') { const a = mem.get('fue:audit:list') || []; a.unshift(s); mem.set('fue:audit:list', a.slice(0, 500)); }
}
async function readLog(n) {
  const m = mode();
  if (m === 'redis') return (await rcmd(['LRANGE', 'fue:audit', '0', String(n - 1)])).map((x) => JSON.parse(x));
  if (m === 'memory') return (mem.get('fue:audit:list') || []).slice(0, n).map((x) => JSON.parse(x));
  return [];
}

module.exports = { mode, getJSON, setJSON, hit, clearHit, pushLog, readLog };
