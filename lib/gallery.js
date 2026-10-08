'use strict';
/**
 * Galleries  : containers tagged  data-gallery="id"  in a template. Their repeated items can be
 *              removed, re-ordered and new items can be added (a copy of the first item with new
 *              pictures/text).
 * Blocks     : extra single pictures placed after any section of any page.
 */
const H = require('./html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attrOf = (tag, name) => { const m = tag.match(new RegExp('\\b' + name + '=("([^"]*)"|\'([^\']*)\')', 'i')); return m ? (m[2] !== undefined ? m[2] : m[3]) : null; };
const sigOf = (html, el) => { const t = html.slice(el.start, H.openTagEnd(html, el.start)); const n = (t.match(/^<([a-zA-Z0-9-]+)/) || [])[1]; return n + '.' + (attrOf(t, 'class') || ''); };

const LEAF_LABEL = { h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', p: 'Text', figcaption: 'Caption', a: 'Link text', b: 'Bold text', strong: 'Bold text', span: 'Label', small: 'Small text', div: 'Text', li: 'List text', em: 'Text' };

/** text-only elements inside an item = editable text fields */
function leaves(item) {
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|<!--[\s\S]*?-->/g;
  const stack = [], out = []; let m, svg = 0;
  while ((m = TAG.exec(item))) {
    if (!m[2]) continue;
    const n = m[2].toLowerCase();
    if ((n === 'script' || n === 'style') && !m[1]) { TAG.lastIndex = item.indexOf('</' + n, TAG.lastIndex); continue; }
    if (m[1]) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].n === n) {
          const e = stack.splice(i)[0];
          if (n === 'svg') svg--;
          else if (!svg && !e.child) {
            const text = item.slice(e.inner, m.index);
            if (text.trim()) out.push({ start: e.inner, end: m.index, tag: n, text: unesc(text.trim()) });
          }
          break;
        }
      }
      continue;
    }
    if (stack.length) stack[stack.length - 1].child = true;
    if (/^(img|br|hr|input|source|meta|link)$/.test(n) || /\/\s*$/.test(m[3])) continue;
    if (n === 'svg') svg++;
    stack.push({ n, inner: TAG.lastIndex, child: false });
  }
  return out;
}
function imgsOf(item) {
  const out = []; const re = /<img\b[^>]*>/gi; let m;
  while ((m = re.exec(item))) out.push({ src: attrOf(m[0], 'src') || '', alt: unesc(attrOf(m[0], 'alt') || '') });
  return out;
}

/** every tagged gallery in a template */
function defs(html) {
  const out = [];
  const re = /<([a-zA-Z0-9]+)\b(?:"[^"]*"|'[^']*'|[^'">])*\bdata-gallery="([^"]+)"(?:"[^"]*"|'[^']*'|[^'">])*>/g;
  let m;
  while ((m = re.exec(html))) {
    const start = m.index, end = H.elementEnd(html, start);
    if (end < 0) continue;
    const kids = H.children(html, start);
    if (!kids.length) continue;
    const sig = sigOf(html, kids[0]);
    const items = kids.filter((k) => sigOf(html, k) === sig).map((k, i) => {
      const h = html.slice(k.start, k.end);
      return { id: 'o' + i, start: k.start, end: k.end, html: h, images: imgsOf(h), texts: leaves(h) };
    });
    out.push({
      id: m[2], start, end, openEnd: H.openTagEnd(html, start), label: unesc(attrOf(m[0], 'data-gallery-label') || m[2]),
      countVar: attrOf(m[0], 'data-gallery-var'), tag: m[1], items, allKids: kids.length, itemKids: items.length,
    });
  }
  return out;
}

/** a copy of `item` with new pictures and texts */
function cloneItem(item, images, texts) {
  let h = item.html;
  const ls = item.texts.slice().sort((a, b) => b.start - a.start);
  for (const l of ls) {
    const idx = item.texts.indexOf(l);
    const t = texts && typeof texts[idx] === 'string' ? texts[idx] : l.text;
    h = h.slice(0, l.start) + esc(t) + h.slice(l.end);
  }
  let i = 0;
  h = h.replace(/<img\b[^>]*>/gi, (tag) => {
    const im = images[i++]; if (!im) return tag;
    tag = tag.replace(/\s(?:srcset|sizes)=("[^"]*"|'[^']*')/gi, '');
    tag = /\ssrc=/i.test(tag) ? tag.replace(/\ssrc=("[^"]*"|'[^']*')/i, ' src="' + esc(im.src) + '"') : tag.replace(/<img/i, '<img src="' + esc(im.src) + '"');
    const alt = ' alt="' + esc(im.alt || '') + '"';
    tag = /\salt=/i.test(tag) ? tag.replace(/\salt=("[^"]*"|'[^']*')/i, alt) : tag.replace(/<img/i, '<img' + alt);
    return tag;
  });
  return h;
}

/** apply saved gallery states ({order:[ids], added:{id:{images,texts}}}) */
function apply(html, page, galleries) {
  if (!galleries) return html;
  const ds = defs(html).filter((d) => galleries[page + ':' + d.id] && galleries[page + ':' + d.id].order);
  for (const d of ds.sort((a, b) => b.start - a.start)) {
    if (d.allKids !== d.itemKids) continue; // never touch a container with mixed children
    const st = galleries[page + ':' + d.id];
    const byId = {}; d.items.forEach((it) => { byId[it.id] = it.html; });
    const parts = [];
    for (const id of st.order) {
      if (byId[id]) parts.push(byId[id]);
      else if (st.added && st.added[id]) parts.push(cloneItem(d.items[0], st.added[id].images || [], st.added[id].texts || []));
    }
    let open = html.slice(d.start, d.openEnd);
    if (d.countVar) {
      const re = new RegExp('(' + d.countVar.replace(/[-]/g, '\\-') + '\\s*:\\s*)\\d+');
      open = open.replace(re, '$1' + Math.max(parts.length, 1));
    }
    const close = html.slice(html.lastIndexOf('</', d.end - 1), d.end);
    html = html.slice(0, d.start) + open + parts.join('\n') + close + html.slice(d.end);
  }
  return html;
}

/* ---------------- blocks (extra pictures) ---------------- */
function sections(html) {
  const body = Math.max(html.indexOf('<body'), 0);
  const out = [], used = {};
  const re = /<section\b(?:"[^"]*"|'[^']*'|[^'">])*>/g; re.lastIndex = body;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const end = H.elementEnd(html, m.index); if (end < 0) continue;
    n++;
    const inner = html.slice(m.index, end);
    const id = attrOf(m[0], 'id'), al = attrOf(m[0], 'aria-label');
    const hm = inner.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const heading = hm ? unesc(hm[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : '';
    let key = id ? '#' + id : (al ? 'L:' + unesc(al) : 'S' + n);
    if (used[key]) key += '~' + n; used[key] = 1;
    const label = (heading || (al && unesc(al)) || id || 'Section ' + n).slice(0, 70);
    out.push({ key, label, end });
  }
  return out;
}

const SIZES = { wide: 1100, medium: 760, small: 480, full: 0 };
function blockHtml(b) {
  const cap = b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : '';
  return `\n<section class="fue-block s-${SIZES[b.size] !== undefined ? b.size : 'wide'}" data-fue-block="${esc(b.id)}" aria-label="${esc(b.alt || 'Picture')}"><figure><img loading="lazy" src="${esc(b.image)}" alt="${esc(b.alt || '')}">${cap}</figure></section>\n`;
}
const BLOCK_CSS = '<style data-fue-blocks>.fue-block{padding:clamp(40px,6vw,90px) var(--gutter,24px)}.fue-block figure{margin:0 auto;max-width:1100px}.fue-block.s-medium figure{max-width:760px}.fue-block.s-small figure{max-width:480px}.fue-block.s-full figure{max-width:none}.fue-block img{display:block;width:100%;height:auto;border-radius:14px}.fue-block figcaption{margin-top:12px;font-size:13px;color:var(--ink-3,#8A8984);text-align:center}</style>';

function applyBlocks(html, page, blocks) {
  const mine = (blocks || []).filter((b) => b.page === page && b.image);
  if (!mine.length) return html;
  const secs = sections(html);
  const inserts = [];
  const byKey = {};
  mine.forEach((b) => { (byKey[b.after] = byKey[b.after] || []).push(b); });
  for (const key of Object.keys(byKey)) {
    const html2 = byKey[key].map(blockHtml).join('');
    if (key === '@end') {
      const f = html.search(/<footer\b/i);
      inserts.push({ at: f >= 0 ? f : html.search(/<\/body>/i), html: html2 });
    } else {
      const s = secs.find((x) => x.key === key);
      if (s) inserts.push({ at: s.end, html: html2 });
    }
  }
  for (const ins of inserts.sort((a, b) => b.at - a.at)) html = html.slice(0, ins.at) + ins.html + html.slice(ins.at);
  return inserts.length ? html.replace(/<\/head>/i, () => BLOCK_CSS + '\n</head>') : html;
}

module.exports = { defs, cloneItem, apply, sections, applyBlocks, SIZES };
