'use strict';
/** Minimal, dependency-free HTML helpers for our own templates (balanced tag matching). */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style']);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|<!--[\s\S]*?-->/g;

/** [start, end) of the element whose opening tag begins at `start` */
function elementEnd(html, start) {
  TAG.lastIndex = start;
  let m = TAG.exec(html);
  if (!m || m.index !== start || !m[2]) return -1;
  const name = m[2].toLowerCase();
  if (VOID.has(name) || /\/\s*$/.test(m[3])) return TAG.lastIndex;
  let depth = 1;
  while ((m = TAG.exec(html))) {
    if (!m[2]) continue; // comment
    const n = m[2].toLowerCase();
    if (RAW.has(n) && !m[1]) { // skip raw text content
      const close = html.indexOf('</' + n, TAG.lastIndex);
      if (close < 0) return -1;
      TAG.lastIndex = close; continue;
    }
    if (VOID.has(n) || /\/\s*$/.test(m[3])) continue;
    if (n !== name) { if (m[1]) { /* closing other tag */ } continue; }
    depth += m[1] ? -1 : 1;
    if (depth === 0) return TAG.lastIndex;
  }
  return -1;
}

/** direct child elements of the element that starts at `start`: [{start,end}] */
function children(html, start) {
  const end = elementEnd(html, start);
  if (end < 0) return [];
  TAG.lastIndex = start;
  const open = TAG.exec(html);
  let pos = TAG.lastIndex;
  const closeStart = html.lastIndexOf('</', end - 1);
  const out = [];
  TAG.lastIndex = pos;
  while (pos < closeStart) {
    TAG.lastIndex = pos;
    const m = TAG.exec(html);
    if (!m || m.index >= closeStart) break;
    if (!m[2]) { pos = TAG.lastIndex; continue; }
    if (m[1]) { pos = TAG.lastIndex; continue; }
    const e = elementEnd(html, m.index);
    if (e < 0) break;
    out.push({ start: m.index, end: e });
    pos = e;
  }
  return out;
}

/** position just after the opening tag that begins at `start` */
function openTagEnd(html, start) {
  TAG.lastIndex = start;
  const m = TAG.exec(html);
  return m && m.index === start ? TAG.lastIndex : -1;
}

module.exports = { elementEnd, children, openTagEnd };
