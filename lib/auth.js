'use strict';
const crypto = require('crypto');
const store = require('./store');

const COOKIE = 'fue_admin';
const MAX_AGE = 60 * 60 * 12; // 12 hours
const IS_DEV = process.env.LOCAL_DEV === '1';

function secret() {
  const s = process.env.SESSION_SECRET || (IS_DEV ? 'dev-only-secret-change-me-0123456789' : '');
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  return s;
}

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}
function checkPassword(pw, user) {
  const { hash } = hashPassword(pw, user.salt);
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(14)) s += abc[b % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4, 9) + '-' + s.slice(9);
}
function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 10 && pw.length <= 200 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function sessionCookie(user) {
  const tok = sign({ uid: user.id, tv: user.tv, exp: Date.now() + MAX_AGE * 1000 });
  return `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${IS_DEV ? '' : '; Secure'}`;
}
function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${IS_DEV ? '' : '; Secure'}`;
}

async function loadUsers() { return store.getJSON('fue:users', []); }
async function saveUsers(u) { return store.setJSON('fue:users', u); }

async function currentUser(req) {
  const p = verify(parseCookies(req)[COOKIE]);
  if (!p) return null;
  const users = await loadUsers();
  const u = users.find((x) => x.id === p.uid);
  if (!u || u.tv !== p.tv) return null;
  return u;
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, mustChange: !!u.mustChange, created: u.created, lastLogin: u.lastLogin || null };
}

module.exports = {
  hashPassword, checkPassword, tempPassword, validPassword,
  sessionCookie, clearCookie, currentUser, loadUsers, saveUsers, publicUser, secret,
};
