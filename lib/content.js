'use strict';
/**
 * Renders a page template with the admin's overrides applied:
 *  - meta title / description / canonical / Open Graph / robots
 *  - JSON-LD page schema
 *  - tracking & verification code (head and start of body)
 *  - replaced images
 * Everything is done on the server, so Google sees the final HTML (not JavaScript patches).
 */
const fs = require('fs');
const path = require('path');
const store = require('./store');
const G = require('./gallery');

const PAGES = ['index', 'how-it-is-done', 'about-us', 'fue-candidate', 'fue-results', 'contact', 'privacy', 'terms'];
const PAGE_LABELS = {
  'index': 'Home', 'how-it-is-done': "How It's Done", 'about-us': 'About Us', 'fue-candidate': 'FUE Candidate',
  'fue-results': 'FUE Results', 'contact': 'Contact', 'privacy': 'Privacy Policy', 'terms': 'Terms of Use',
};
const ROOT = process.cwd();
const tplCache = new Map();

function template(name) {
  if (!PAGES.includes(name)) return null;
  if (!tplCache.has(name)) tplCache.set(name, fs.readFileSync(path.join(ROOT, 'templates', name + '.html'), 'utf8'));
  return tplCache.get(name);
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function attr(html, re, name) { const m = html.match(re); if (!m) return ''; const a = m[0].match(new RegExp(name + '=("([^"]*)"|\'([^\']*)\')', 'i')); return a ? (a[2] !== undefined ? a[2] : a[3]) : ''; }
function unesc(s) { return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

const RE = {
  title: /<title>[\s\S]*?<\/title>/i,
  desc: /<meta\s+name=["']description["'][^>]*>/i,
  canon: /<link\s+rel=["']canonical["'][^>]*>/i,
  ogTitle: /<meta\s+property=["']og:title["'][^>]*>/i,
  ogDesc: /<meta\s+property=["']og:description["'][^>]*>/i,
  ogImage: /<meta\s+property=["']og:image["'][^>]*>/i,
  robots: /<meta\s+name=["']robots["'][^>]*>/i,
  ld: /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi,
};

/** the page's built-in values (what the template ships with) */
function defaults(name) {
  const h = template(name);
  const t = h.match(RE.title);
  const schemas = [];
  h.replace(RE.ld, (m, j) => { schemas.push(j.trim()); return m; });
  let schema = '';
  if (schemas.length === 1) { try { schema = JSON.stringify(JSON.parse(schemas[0]), null, 2); } catch (e) { schema = schemas[0]; } }
  else if (schemas.length > 1) { try { schema = JSON.stringify(schemas.map((s) => JSON.parse(s)), null, 2); } catch (e) { schema = schemas.join('\n'); } }
  return {
    title: t ? unesc(t[0].replace(/<\/?title>/gi, '').trim()) : '',
    description: unesc(attr(h, RE.desc, 'content')),
    canonical: attr(h, RE.canon, 'href'),
    ogTitle: unesc(attr(h, RE.ogTitle, 'content')),
    ogDescription: unesc(attr(h, RE.ogDesc, 'content')),
    ogImage: attr(h, RE.ogImage, 'content'),
    robots: /noindex/i.test(attr(h, RE.robots, 'content')) ? 'noindex' : '',
    schema,
  };
}

/** raster images the pages use = the "slots" shown in the admin */
function slots() {
  const map = new Map();
  const re = /(?<![\w.\-\/])\/?(images\/[A-Za-z0-9_.\-]+\.(?:webp|png|jpe?g|avif))(?![\w.\-])/g;
  for (const p of PAGES) {
    const h = template(p);
    let m;
    while ((m = re.exec(h))) {
      const k = m[1];
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(p);
    }
  }
  // first non-empty alt text the templates already use for each picture
  const alts = {};
  const imgRe = /<img\b[^>]*>/gi;
  for (const p of PAGES) {
    const h = template(p); let m;
    while ((m = imgRe.exec(h))) {
      const src = (attr(m[0], /.*/, 'src') || '').replace(/^\.?\//, '');
      const alt = unesc(attr(m[0], /.*/, 'alt') || '');
      if (src && alt && !alts[src]) alts[src] = alt;
    }
  }
  return [...map.entries()].map(([key, pages]) => ({ key, pages: [...pages], alt: alts[key] || '' })).sort((a, b) => a.key.localeCompare(b.key));
}

let cfgCache;
function configDefaults() {
  if (!cfgCache) {
    try { cfgCache = JSON.parse(fs.readFileSync(path.join(ROOT, 'content.config.json'), 'utf8')); } catch (e) { cfgCache = {}; }
  }
  return cfgCache;
}

/** content.config.json (option B, works without a database) + admin-saved content on top */
async function loadContent() {
  const base = configDefaults();
  let saved = {};
  try { saved = (await store.getJSON('fue:content', {})) || {}; } catch (e) { saved = {}; }
  return {
    siteUrl: saved.siteUrl || base.siteUrl || '',
    images: Object.assign({}, base.images || {}, saved.images || {}),
    pages: mergePages(base.pages || {}, saved.pages || {}),
    tracking: Object.assign({ head: '', body: '' }, base.tracking || {}, saved.tracking || {}),
    imageMeta: Object.assign({}, base.imageMeta || {}, saved.imageMeta || {}),
    galleries: Object.assign({}, base.galleries || {}, saved.galleries || {}),
    blocks: Array.isArray(saved.blocks) ? saved.blocks : (Array.isArray(base.blocks) ? base.blocks : []),
  };
}
function mergePages(a, b) {
  const out = {};
  for (const p of PAGES) out[p] = Object.assign({}, a[p] || {}, b[p] || {});
  return out;
}

function setTag(html, re, tag) {
  return re.test(html) ? html.replace(re, () => tag) : html.replace(/<\/head>/i, () => tag + '\n</head>');
}
function absUrl(u, siteUrl) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  return siteUrl.replace(/\/$/, '') + '/' + u.replace(/^\//, '');
}

function applyImageMeta(html, meta) {
  const keys = Object.keys(meta || {});
  if (!keys.length) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = (attr(tag, /.*/, 'src') || '').replace(/^\.?\//, '');
    const m = meta[src];
    if (!m) return tag;
    const setAttr = (t, name, val) => {
      const re = new RegExp('\\s' + name + '=("[^"]*"|\'[^\']*\')', 'i');
      const a = ' ' + name + '="' + esc(val) + '"';
      return re.test(t) ? t.replace(re, () => a) : t.replace(/<img/i, () => '<img' + a);
    };
    if (typeof m.alt === 'string' && m.alt.trim()) tag = setAttr(tag, 'alt', m.alt.trim());
    if (typeof m.title === 'string' && m.title.trim()) tag = setAttr(tag, 'title', m.title.trim());
    if (m.hidden) {
      tag = setAttr(tag, 'alt', '');
      tag = /\sstyle=/i.test(tag) ? tag.replace(/\sstyle=("([^"]*)"|'([^']*)')/i, (x, q, a, b) => ' style="' + esc(unesc(a !== undefined ? a : b)) + ';display:none!important"') : tag.replace(/<img/i, '<img style="display:none!important"');
      tag = tag.replace(/<img/i, '<img hidden aria-hidden="true"');
    }
    return tag;
  });
}

function render(name, content, host) {
  let html = template(name);
  if (html == null) return null;
  const siteUrl = content.siteUrl || (host ? 'https://' + host : '');
  const o = (content.pages && content.pages[name]) || {};
  const has = (v) => typeof v === 'string' && v.trim() !== '';

  if (has(o.title)) html = setTag(html, RE.title, `<title>${esc(o.title.trim())}</title>`);
  if (has(o.description)) html = setTag(html, RE.desc, `<meta name="description" content="${esc(o.description.trim())}">`);
  if (has(o.canonical)) html = setTag(html, RE.canon, `<link rel="canonical" href="${esc(o.canonical.trim())}">`);
  if (has(o.ogTitle)) html = setTag(html, RE.ogTitle, `<meta property="og:title" content="${esc(o.ogTitle.trim())}">`);
  if (has(o.ogDescription)) html = setTag(html, RE.ogDesc, `<meta property="og:description" content="${esc(o.ogDescription.trim())}">`);
  if (has(o.ogImage)) html = setTag(html, RE.ogImage, `<meta property="og:image" content="${esc(o.ogImage.trim())}">`);
  if (o.robots === 'noindex') html = setTag(html, RE.robots, '<meta name="robots" content="noindex, nofollow">');

  if (has(o.schema)) {
    let data;
    try { data = JSON.parse(o.schema); } catch (e) { data = null; }
    if (data) {
      html = html.replace(RE.ld, '');
      const arr = Array.isArray(data) ? data : [data];
      const tags = arr.map((d) => '<script type="application/ld+json">' + JSON.stringify(d).replace(/</g, '\\u003c') + '</script>').join('\n');
      html = html.replace(/<\/head>/i, () => tags + '\n</head>');
    }
  }

  // galleries (add / remove / re-order photos) and extra picture blocks
  html = G.apply(html, name, content.galleries);
  html = G.applyBlocks(html, name, content.blocks);

  // picture details (alt text, title, hidden) for static <img> tags
  html = applyImageMeta(html, content.imageMeta);

  // images: swap the template path for the uploaded file's URL
  const imgs = content.images || {};
  for (const key of Object.keys(imgs)) {
    const url = imgs[key] && imgs[key].url;
    if (!url) continue;
    const re = new RegExp('(?<![\\w.\\-\\/])\\/?' + reEsc(key) + '(?![\\w.\\-])', 'g');
    html = html.replace(re, () => url);
  }
  // make a relative og:image absolute so social networks can fetch it
  html = html.replace(RE.ogImage, (m) => {
    const c = attr(m, /.*/, 'content');
    return c && !/^https?:\/\//i.test(c) && siteUrl ? `<meta property="og:image" content="${esc(absUrl(c, siteUrl))}">` : m;
  });

  const t = content.tracking || {};
  if (has(t.head)) html = html.replace(/<\/head>/i, () => '<!-- site tracking / verification -->\n' + t.head + '\n</head>');
  if (has(t.body)) html = html.replace(/<body[^>]*>/i, (m) => m + '\n' + t.body + '\n');
  return html;
}

/** gallery + section info for the admin screens */
function galleryInfo(name, content) {
  const html = template(name);
  const imgs = content.images || {};
  const eff = (src) => (imgs[src] && imgs[src].url) || src;
  return G.defs(html).map((d) => ({
    page: name, id: d.id, label: d.label, mixed: d.allKids !== d.itemKids,
    tplImages: d.items[0] ? d.items[0].images.length : 0,
    tplTexts: d.items[0] ? d.items[0].texts.map((t) => ({ tag: t.tag, text: t.text })) : [],
    items: d.items.map((it) => ({ id: it.id, images: it.images.map((i) => ({ src: eff(i.src), orig: i.src, alt: i.alt })), texts: it.texts.map((t) => t.text) })),
    state: (content.galleries || {})[name + ':' + d.id] || null,
  }));
}
function sectionList(name) { return G.sections(template(name)).map((s) => ({ key: s.key, label: s.label })); }

module.exports = { galleryInfo, sectionList, PAGES, PAGE_LABELS, template, defaults, slots, loadContent, render, configDefaults };
