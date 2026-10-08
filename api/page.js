'use strict';
const { loadContent, render } = require('../lib/content');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const name = url.searchParams.get('p') || 'index';
  try {
    const content = await loadContent();
    const html = render(name, content, req.headers['x-forwarded-host'] || req.headers.host);
    if (html == null) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Edits appear on the live site within about a minute.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
    res.end(html);
  } catch (e) {
    console.error('page render failed', e);
    res.statusCode = 500; res.setHeader('Content-Type', 'text/plain'); res.end('Server error');
  }
};
