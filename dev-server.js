'use strict';
// Local preview that mimics Vercel's routing. Run: LOCAL_DEV=1 node dev-server.js  (npm run dev)
process.env.LOCAL_DEV = process.env.LOCAL_DEV || '1';
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.txt': 'text/plain', '.xml': 'application/xml' };
const PAGES = '(index|how-it-is-done|about-us|fue-candidate|fue-results|contact|privacy|terms)';

function serveFile(res, file) {
  if (!file.startsWith(process.cwd()) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res); return true;
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(u.pathname);
  try {
    if (p.startsWith('/api/admin/')) {
      req.query = { action: p.split('/').pop() };
      return await require('./api/admin/[action].js')(req, res);
    }
    if (p.startsWith('/__uploads/')) { if (serveFile(res, path.join(process.cwd(), '.devdata', 'uploads', path.basename(p)))) return; }
    let m;
    if (p === '/' ) { req.url = '/api/page?p=index'; return await require('./api/page.js')(req, res); }
    if ((m = p.match(new RegExp('^/' + PAGES + '(\\.html)?$')))) { req.url = '/api/page?p=' + m[1]; return await require('./api/page.js')(req, res); }
    if (p === '/admin') p = '/admin/index.html';
    if (p.endsWith('/')) p += 'index.html';
    if (serveFile(res, path.join(process.cwd(), 'public', p))) return;
    res.writeHead(404); res.end('Not found');
  } catch (e) { console.error(e); res.writeHead(500); res.end('error'); }
}).listen(PORT, () => console.log('Local site: http://localhost:' + PORT + '  Admin: http://localhost:' + PORT + '/admin  (setup code: dev-setup)'));
