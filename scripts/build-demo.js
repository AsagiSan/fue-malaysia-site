// Builds the click-through demo of the admin panel (option C): demo/admin-demo.html + demo/admin/*
const fs = require('fs'), path = require('path');
const C = require('../lib/content');
const out = path.join(__dirname, '..', 'demo');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'admin'), { recursive: true });
const pages = {}; C.PAGES.forEach((p) => { pages[p] = { label: C.PAGE_LABELS[p], defaults: C.defaults(p) }; });
const empty = { images: {}, galleries: {}, blocks: [] };
const data = { slots: C.slots(), pages, galleries: [].concat(...C.PAGES.map((p) => C.galleryInfo(p, empty))), sections: Object.fromEntries(C.PAGES.map((p) => [p, C.sectionList(p)])), users: [
  { name: 'Asagihouse (agency)', email: 'agency@example.com', role: 'owner' }, { name: 'Dr. Inder', email: 'dr.inder@example.com', role: 'owner' },
  { name: 'Salim (website)', email: 'salim@example.com', role: 'owner' }, { name: 'Assistant', email: 'assistant@example.com', role: 'admin' }, { name: 'Clinic admin', email: 'admin@example.com', role: 'admin' } ] };
fs.writeFileSync(path.join(out, 'admin', 'demo-data.js'), 'window.FUE_DEMO_DATA=' + JSON.stringify(data) + ';');
fs.copyFileSync(path.join(__dirname, '..', 'public', 'admin', 'admin.js'), path.join(out, 'admin', 'admin.js'));
fs.copyFileSync(path.join(__dirname, '..', 'public', 'admin', 'admin.css'), path.join(out, 'admin', 'admin.css'));
fs.writeFileSync(path.join(out, 'admin-demo.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Admin Demo — FUE Malaysia</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="admin/admin.css"></head>
<body><div id="app"></div>
<script>window.FUE_DEMO=true;</script><script src="admin/demo-data.js"></script><script src="admin/admin.js"></script></body></html>`);
console.log('demo built', data.slots.length, 'slots');
