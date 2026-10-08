'use strict';
const crypto = require('crypto');
const store = require('../../lib/store');
const blob = require('../../lib/blob');
const auth = require('../../lib/auth');
const C = require('../../lib/content');

module.exports.config = { api: { bodyParser: false }, maxDuration: 30 };

const MAX_UPLOAD = 4.4 * 1024 * 1024;
const OK_EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

function send(res, code, obj, extra) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extra && extra['Set-Cookie']) res.setHeader('Set-Cookie', extra['Set-Cookie']);
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_UPLOAD + 1024) throw httpErr(413, 'File too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}
function httpErr(code, msg) { const e = new Error(msg); e.status = code; return e; }
async function readJSON(req) {
  const b = await readBody(req);
  if (!b.length) return {};
  try { return JSON.parse(b.toString('utf8')); } catch (e) { throw httpErr(400, 'Invalid request'); }
}
function ip(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const now = () => new Date().toISOString();

async function log(user, action, detail) {
  try { await store.pushLog({ t: now(), who: user ? user.name : 'system', email: user ? user.email : '', action, detail: detail || '' }); } catch (e) { /* non-fatal */ }
}

function sniff(buf) {
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

function validateContent(body) {
  const out = { pages: {}, tracking: null, siteUrl: undefined };
  if (body.pages && typeof body.pages === 'object') {
    for (const p of C.PAGES) {
      const s = body.pages[p];
      if (!s) continue;
      const v = {
        title: str(s.title, 200), description: str(s.description, 400), canonical: str(s.canonical, 500),
        ogTitle: str(s.ogTitle, 200), ogDescription: str(s.ogDescription, 400), ogImage: str(s.ogImage, 600),
        robots: s.robots === 'noindex' ? 'noindex' : '',
        schema: typeof s.schema === 'string' ? s.schema.trim().slice(0, 60000) : '',
      };
      for (const f of ['canonical', 'ogImage']) {
        if (v[f] && !/^(https?:\/\/|\/|images\/)/i.test(v[f])) throw httpErr(400, `${C.PAGE_LABELS[p]}: "${f}" must be a full web address (https://…)`);
      }
      if (v.schema) {
        try { const d = JSON.parse(v.schema); if (typeof d !== 'object' || d === null) throw 0; }
        catch (e) { throw httpErr(400, `${C.PAGE_LABELS[p]}: the schema is not valid JSON`); }
      }
      out.pages[p] = v;
    }
  }
  if (body.tracking && typeof body.tracking === 'object') {
    out.tracking = { head: String(body.tracking.head || '').slice(0, 30000), body: String(body.tracking.body || '').slice(0, 30000) };
  }
  if (typeof body.siteUrl === 'string') {
    const u = body.siteUrl.trim();
    if (u && !/^https:\/\/[^\s/]+$/i.test(u.replace(/\/$/, ''))) throw httpErr(400, 'Site address must look like https://www.example.com');
    out.siteUrl = u.replace(/\/$/, '');
  }
  return out;
}

const IMG_OK = [
  /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\/[\w./%+~-]+$/i,
  /^\/__uploads\/[\w.-]+$/,
  /^\/?images\/[\w.-]+\.(webp|png|jpe?g|avif)$/i,
];
function safeImg(u) {
  u = typeof u === 'string' ? u.trim() : '';
  if (!IMG_OK.some((r) => r.test(u))) throw httpErr(400, 'That picture address is not allowed');
  return u.replace(/^\//, '').startsWith('images/') ? u.replace(/^\//, '') : u;
}
const ID_RE = /^[a-z0-9]{1,24}$/i;

function validateGallery(body) {
  const page = String(body.page || ''), id = String(body.id || '');
  if (!C.PAGES.includes(page)) throw httpErr(400, 'Unknown page');
  const def = C.galleryInfo(page, { images: {}, galleries: {} }).find((g) => g.id === id);
  if (!def || def.mixed) throw httpErr(400, 'Unknown gallery');
  const origIds = def.items.map((i) => i.id);
  const order = Array.isArray(body.order) ? body.order.map(String) : [];
  const added = {}; const seen = new Set();
  if (order.length < 1 || order.length > 60) throw httpErr(400, 'A gallery needs between 1 and 60 items');
  for (const oid of order) {
    if (seen.has(oid)) throw httpErr(400, 'Duplicate item');
    seen.add(oid);
    if (origIds.includes(oid)) continue;
    if (!/^n[a-z0-9]{1,20}$/i.test(oid)) throw httpErr(400, 'Bad item id');
    const a = body.added && body.added[oid];
    if (!a || !Array.isArray(a.images) || a.images.length !== def.tplImages) throw httpErr(400, `Each new item needs ${def.tplImages} picture(s)`);
    added[oid] = {
      images: a.images.map((im) => ({ src: safeImg(im.src), alt: str(im.alt, 200) })),
      texts: def.tplTexts.map((t, i) => str(a.texts && a.texts[i], 300)),
    };
  }
  return { key: page + ':' + id, value: { order, added } };
}
function validateBlocks(list) {
  if (!Array.isArray(list) || list.length > 60) throw httpErr(400, 'Too many extra pictures');
  const secCache = {};
  return list.map((b) => {
    if (!C.PAGES.includes(b.page)) throw httpErr(400, 'Unknown page');
    secCache[b.page] = secCache[b.page] || C.sectionList(b.page).map((x) => x.key);
    const after = String(b.after || '');
    if (after !== '@end' && !secCache[b.page].includes(after)) throw httpErr(400, 'Unknown place on the page');
    const id = ID_RE.test(String(b.id || '')) ? String(b.id) : crypto.randomBytes(5).toString('hex');
    return { id, page: b.page, after, image: safeImg(b.image), alt: str(b.alt, 200), caption: str(b.caption, 300), size: ['wide', 'medium', 'small', 'full'].includes(b.size) ? b.size : 'wide' };
  });
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const action = (req.query && req.query.action) || url.searchParams.get('action') || url.pathname.split('/').pop();
  const method = req.method;
  try {
    if (method === 'POST' && req.headers['x-requested-with'] !== 'fue-admin') throw httpErr(403, 'Blocked');
    const storeMode = store.mode();
    const blobMode = blob.mode();

    // ---------- public-ish: who am I / first-time setup / login ----------
    if (action === 'me' && method === 'GET') {
      let users = [];
      let me = null;
      if (storeMode !== 'none') {
        try { users = await auth.loadUsers(); me = await auth.currentUser(req); } catch (e) { return send(res, 200, { storage: false, error: e.message }); }
      }
      return send(res, 200, {
        storage: storeMode !== 'none', images: blobMode !== 'none',
        needsSetup: storeMode !== 'none' && users.length === 0,
        user: me ? auth.publicUser(me) : null,
      });
    }

    if (storeMode === 'none') throw httpErr(503, 'Storage is not connected yet. See SETUP.md (Upstash Redis).');

    if (action === 'setup' && method === 'POST') {
      const users = await auth.loadUsers();
      if (users.length) throw httpErr(403, 'Setup is already done');
      const b = await readJSON(req);
      const tokenEnv = process.env.SETUP_TOKEN || (process.env.LOCAL_DEV === '1' ? 'dev-setup' : '');
      if (!tokenEnv || b.token !== tokenEnv) throw httpErr(403, 'Wrong setup code');
      const name = str(b.name, 80), email = str(b.email, 120).toLowerCase();
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw httpErr(400, 'Enter a name and a valid email');
      if (!auth.validPassword(b.password)) throw httpErr(400, 'Password needs 10+ characters with letters and numbers');
      const { salt, hash } = auth.hashPassword(b.password);
      const u = { id: crypto.randomUUID(), name, email, role: 'owner', salt, hash, mustChange: false, tv: 1, created: now() };
      await auth.saveUsers([u]);
      await log(u, 'setup', 'First owner account created');
      return send(res, 200, { ok: true, user: auth.publicUser(u) }, { 'Set-Cookie': auth.sessionCookie(u) });
    }

    if (action === 'login' && method === 'POST') {
      const b = await readJSON(req);
      const email = str(b.email, 120).toLowerCase();
      const key = 'fue:rl:' + ip(req) + ':' + email;
      const tries = await store.hit(key, 900);
      if (tries > 8) throw httpErr(429, 'Too many attempts. Wait 15 minutes and try again.');
      const users = await auth.loadUsers();
      const u = users.find((x) => x.email === email);
      // always do the hash work so timing does not reveal which emails exist
      const ok = u ? auth.checkPassword(String(b.password || ''), u) : (auth.hashPassword('x'), false);
      if (!ok) throw httpErr(401, 'Email or password is not correct');
      await store.clearHit(key);
      u.lastLogin = now();
      await auth.saveUsers(users);
      await log(u, 'login');
      return send(res, 200, { ok: true, user: auth.publicUser(u) }, { 'Set-Cookie': auth.sessionCookie(u) });
    }

    if (action === 'logout' && method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });

    // ---------- everything below needs a signed-in user ----------
    const me = await auth.currentUser(req);
    if (!me) throw httpErr(401, 'Please sign in');

    if (action === 'password' && method === 'POST') {
      const b = await readJSON(req);
      if (!auth.checkPassword(String(b.current || ''), me)) throw httpErr(400, 'Current password is not correct');
      if (!auth.validPassword(b.next)) throw httpErr(400, 'New password needs 10+ characters with letters and numbers');
      if (b.next === b.current) throw httpErr(400, 'Choose a different password');
      const users = await auth.loadUsers();
      const u = users.find((x) => x.id === me.id);
      Object.assign(u, auth.hashPassword(b.next), { mustChange: false, tv: (u.tv || 1) + 1 });
      await auth.saveUsers(users);
      await log(u, 'password-changed');
      return send(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(u) });
    }
    // a freshly invited user must pick their own password before anything else
    if (me.mustChange) throw httpErr(403, 'Please set your own password first');

    if (action === 'state' && method === 'GET') {
      const content = await C.loadContent();
      const saved = (await store.getJSON('fue:content', {})) || {};
      const pages = {};
      for (const p of C.PAGES) pages[p] = { label: C.PAGE_LABELS[p], defaults: C.defaults(p), saved: (saved.pages && saved.pages[p]) || {} };
      return send(res, 200, {
        user: auth.publicUser(me),
        storage: true, images: blobMode !== 'none',
        slots: C.slots().map((s) => Object.assign(s, { meta: content.imageMeta[s.key] || null, override: content.images[s.key] ? { url: content.images[s.key].url, by: content.images[s.key].by, at: content.images[s.key].at, history: (content.images[s.key].history || []).length } : null })),
        pages, tracking: content.tracking, siteUrl: content.siteUrl,
        galleries: [].concat(...C.PAGES.map((p) => C.galleryInfo(p, content))),
        sections: Object.fromEntries(C.PAGES.map((p) => [p, C.sectionList(p)])),
        blocks: content.blocks || [],
      });
    }

    if (action === 'content' && method === 'POST') {
      const v = validateContent(await readJSON(req));
      const saved = (await store.getJSON('fue:content', {})) || {};
      saved.pages = saved.pages || {};
      const changed = [];
      for (const p of Object.keys(v.pages)) { saved.pages[p] = v.pages[p]; changed.push(p); }
      if (v.tracking) { if (JSON.stringify(v.tracking) !== JSON.stringify(saved.tracking || {})) changed.push('tracking codes'); saved.tracking = v.tracking; }
      if (v.siteUrl !== undefined) saved.siteUrl = v.siteUrl;
      await store.setJSON('fue:content', saved);
      await log(me, 'content-saved', changed.join(', '));
      return send(res, 200, { ok: true });
    }

    if (action === 'upload' && method === 'POST') {
      if (blobMode === 'none') throw httpErr(503, 'Image storage (Vercel Blob) is not connected yet. See SETUP.md.');
      const free = url.searchParams.get('free') === '1';
      const key = url.searchParams.get('slot');
      if (!free && !C.slots().some((s) => s.key === key)) throw httpErr(400, 'Unknown picture slot');
      const buf = await readBody(req);
      if (!buf.length || buf.length > MAX_UPLOAD) throw httpErr(413, 'Picture is too large (max 4 MB after compression)');
      const type = sniff(buf);
      if (!type) throw httpErr(400, 'Only WebP, JPEG or PNG pictures are allowed');
      const fileUrl = await blob.putImage(buf, type, OK_EXT[type]);
      if (free) { await log(me, 'image-uploaded', 'for a gallery or extra picture'); return send(res, 200, { ok: true, url: fileUrl }); }
      const saved = (await store.getJSON('fue:content', {})) || {};
      saved.images = saved.images || {};
      const prev = saved.images[key];
      const history = (prev && prev.history) || [];
      if (prev && prev.url) history.unshift({ url: prev.url, by: prev.by, at: prev.at });
      saved.images[key] = { url: fileUrl, by: me.name, at: now(), history: history.slice(0, 10) };
      await store.setJSON('fue:content', saved);
      await log(me, 'image-replaced', key);
      return send(res, 200, { ok: true, url: fileUrl });
    }

    if ((action === 'image-reset' || action === 'image-restore') && method === 'POST') {
      const b = await readJSON(req);
      const saved = (await store.getJSON('fue:content', {})) || {};
      const rec = saved.images && saved.images[b.slot];
      if (!rec) throw httpErr(400, 'That picture is already the original');
      if (action === 'image-reset') {
        delete saved.images[b.slot];
        await log(me, 'image-reset', b.slot);
      } else {
        const i = Number(b.index);
        const h = rec.history || [];
        if (!h[i]) throw httpErr(400, 'Earlier version not found');
        const pick = h.splice(i, 1)[0];
        h.unshift({ url: rec.url, by: rec.by, at: rec.at });
        saved.images[b.slot] = { url: pick.url, by: me.name, at: now(), history: h.slice(0, 10) };
        await log(me, 'image-restored', b.slot);
      }
      await store.setJSON('fue:content', saved);
      return send(res, 200, { ok: true });
    }

    if (action === 'image-history' && method === 'GET') {
      const saved = (await store.getJSON('fue:content', {})) || {};
      const rec = saved.images && saved.images[url.searchParams.get('slot')];
      return send(res, 200, { history: rec ? rec.history || [] : [] });
    }

    if (action === 'image-meta' && method === 'POST') {
      const b = await readJSON(req);
      if (!C.slots().some((x) => x.key === b.slot)) throw httpErr(400, 'Unknown picture');
      const saved = (await store.getJSON('fue:content', {})) || {};
      saved.imageMeta = saved.imageMeta || {};
      const prev = saved.imageMeta[b.slot] || {};
      saved.imageMeta[b.slot] = { alt: str(b.alt, 300), title: str(b.title, 200), caption: str(b.caption, 500), description: str(b.description, 1000), hidden: !!prev.hidden };
      await store.setJSON('fue:content', saved);
      await log(me, 'picture-details-saved', b.slot);
      return send(res, 200, { ok: true });
    }
    if (action === 'image-hide' && method === 'POST') {
      const b = await readJSON(req);
      if (!C.slots().some((x) => x.key === b.slot)) throw httpErr(400, 'Unknown picture');
      const saved = (await store.getJSON('fue:content', {})) || {};
      saved.imageMeta = saved.imageMeta || {};
      const cur = saved.imageMeta[b.slot] || { alt: '', title: '', caption: '', description: '' };
      cur.hidden = !!b.hidden;
      saved.imageMeta[b.slot] = cur;
      await store.setJSON('fue:content', saved);
      await log(me, cur.hidden ? 'picture-deleted' : 'picture-restored', b.slot);
      return send(res, 200, { ok: true });
    }

    if (action === 'gallery-save' && method === 'POST') {
      const v = validateGallery(await readJSON(req));
      const saved = (await store.getJSON('fue:content', {})) || {};
      saved.galleries = saved.galleries || {};
      saved.galleries[v.key] = v.value;
      await store.setJSON('fue:content', saved);
      await log(me, 'gallery-saved', v.key.replace(':', ' / '));
      return send(res, 200, { ok: true });
    }
    if (action === 'gallery-reset' && method === 'POST') {
      const b = await readJSON(req);
      const saved = (await store.getJSON('fue:content', {})) || {};
      if (saved.galleries) delete saved.galleries[String(b.page) + ':' + String(b.id)];
      await store.setJSON('fue:content', saved);
      await log(me, 'gallery-reset', String(b.page) + ' / ' + String(b.id));
      return send(res, 200, { ok: true });
    }
    if (action === 'blocks-save' && method === 'POST') {
      const b = await readJSON(req);
      const blocks = validateBlocks(b.blocks);
      const saved = (await store.getJSON('fue:content', {})) || {};
      saved.blocks = blocks;
      await store.setJSON('fue:content', saved);
      await log(me, 'extra-pictures-saved', blocks.length + ' extra picture(s)');
      return send(res, 200, { ok: true, blocks });
    }

    if (action === 'audit' && method === 'GET') return send(res, 200, { log: await store.readLog(200) });

    if (action === 'users' && method === 'GET') {
      return send(res, 200, { users: (await auth.loadUsers()).map(auth.publicUser) });
    }

    // ---------- owners only: manage the team ----------
    if (['user-create', 'user-reset', 'user-remove', 'user-role'].includes(action) && method === 'POST') {
      if (me.role !== 'owner') throw httpErr(403, 'Only owners can manage logins');
      const b = await readJSON(req);
      const users = await auth.loadUsers();
      if (action === 'user-create') {
        const name = str(b.name, 80), email = str(b.email, 120).toLowerCase();
        const role = b.role === 'owner' ? 'owner' : 'admin';
        if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw httpErr(400, 'Enter a name and a valid email');
        if (users.some((x) => x.email === email)) throw httpErr(400, 'That email already has a login');
        const temp = auth.tempPassword();
        const u = Object.assign({ id: crypto.randomUUID(), name, email, role, mustChange: true, tv: 1, created: now() }, auth.hashPassword(temp));
        users.push(u);
        await auth.saveUsers(users);
        await log(me, 'user-created', `${name} (${role})`);
        return send(res, 200, { ok: true, tempPassword: temp, user: auth.publicUser(u) });
      }
      const u = users.find((x) => x.id === b.id);
      if (!u) throw httpErr(404, 'User not found');
      if (action === 'user-reset') {
        const temp = auth.tempPassword();
        Object.assign(u, auth.hashPassword(temp), { mustChange: true, tv: (u.tv || 1) + 1 });
        await auth.saveUsers(users);
        await log(me, 'user-password-reset', u.name);
        return send(res, 200, { ok: true, tempPassword: temp });
      }
      if (action === 'user-role') {
        const role = b.role === 'owner' ? 'owner' : 'admin';
        if (u.role === 'owner' && role !== 'owner' && users.filter((x) => x.role === 'owner').length < 2) throw httpErr(400, 'There must be at least one owner');
        u.role = role;
        await auth.saveUsers(users);
        await log(me, 'user-role', `${u.name} → ${role}`);
        return send(res, 200, { ok: true });
      }
      if (action === 'user-remove') {
        if (u.id === me.id) throw httpErr(400, 'You cannot remove your own login');
        if (u.role === 'owner' && users.filter((x) => x.role === 'owner').length < 2) throw httpErr(400, 'There must be at least one owner');
        await auth.saveUsers(users.filter((x) => x.id !== u.id));
        await log(me, 'user-removed', u.name);
        return send(res, 200, { ok: true });
      }
    }

    throw httpErr(404, 'Unknown action');
  } catch (e) {
    const code = e.status || 500;
    if (code >= 500) console.error('admin api error', action, e);
    send(res, code, { error: code >= 500 ? (e.message || 'Server error') : e.message });
  }
};
