/* FUE Malaysia admin panel — plain JavaScript, no build step.
   When window.FUE_DEMO is set (admin-demo.html) it runs against an in-memory fake API. */
(function () {
  'use strict';
  var DEMO = !!window.FUE_DEMO;
  var app = document.getElementById('app');
  var S = { me: null, data: null, tab: 'pictures', page: 'index', q: '', pf: '', changed: false, users: null, log: null, natural: {} };

  function E(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function assetUrl(k) { return (DEMO ? '' : '/') + k; }
  function when(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
  function toast(msg, bad) {
    var t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 5200 : 2600);
  }

  /* ---------------- API ---------------- */
  function api(action, opt) {
    opt = opt || {};
    if (DEMO) return demoApi(action, opt);
    var method = opt.method || 'GET';
    var url = '/api/admin/' + action + (opt.query ? '?' + opt.query : '');
    var init = { method: method, credentials: 'same-origin', headers: {} };
    if (method === 'POST') {
      init.headers['X-Requested-With'] = 'fue-admin';
      if (opt.raw) { init.body = opt.raw; init.headers['Content-Type'] = opt.rawType || 'application/octet-stream'; }
      else { init.body = JSON.stringify(opt.body || {}); init.headers['Content-Type'] = 'application/json'; }
    }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Something went wrong'); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    api('me').then(function (m) {
      if (!m.storage) return viewNoStorage(m);
      if (m.needsSetup) return viewSetup();
      if (!m.user) return viewLogin();
      S.me = m.user;
      if (m.user.mustChange) return viewForcePw();
      return load();
    }).catch(function (e) { viewNoStorage({ error: e.message }); });
  }
  function load() {
    return api('state').then(function (d) { S.data = d; S.me = d.user; render(); }).catch(function (e) {
      if (e.status === 401) { S.me = null; return viewLogin(); }
      if (e.status === 403) return viewForcePw();
      toast(e.message, true);
    });
  }

  /* ---------------- auth views ---------------- */
  function authShell(inner) {
    app.innerHTML = '<div class="center"><div class="card auth"><div class="brand">FUE Malaysia · Admin</div>' + inner + '</div></div>';
  }
  function viewNoStorage(m) {
    authShell('<h1>Storage not connected</h1><p>The admin panel needs its database and image store. Your developer can connect them in a few minutes by following <b>SETUP.md</b> in the project (Upstash Redis + Vercel Blob + two environment variables).</p>' +
      (m && m.error ? '<div class="help">' + E(m.error) + '</div>' : '') + '<p class="small muted">The public website keeps working normally in the meantime.</p>');
  }
  function viewSetup() {
    authShell('<h1>First-time setup</h1><p>Create the first owner login. You need the one-time <b>setup code</b> from the Vercel environment variable <code>SETUP_TOKEN</code>.</p>' +
      '<form id="f"><label>Setup code</label><input type="password" name="token" autocomplete="off" required>' +
      '<label>Your name</label><input type="text" name="name" required><label>Email</label><input type="email" name="email" required>' +
      '<label>Password <span class="count">10+ characters, letters and numbers</span></label><input type="password" name="password" autocomplete="new-password" required>' +
      '<div class="err" id="err"></div><button class="btn" style="margin-top:8px">Create owner login</button></form>');
    $('#f').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      api('setup', { method: 'POST', body: { token: f.token.value, name: f.name.value, email: f.email.value, password: f.password.value } })
        .then(function () { boot(); }).catch(function (x) { $('#err').textContent = x.message; });
    };
  }
  function viewLogin() {
    authShell('<h1>Sign in</h1><p>Private area for the FUE Malaysia team.</p>' + (DEMO ? '<div class="help"><b>Demo:</b> type anything and press Sign in.</div>' : '') +
      '<form id="f"><label>Email</label><input type="email" name="email" autocomplete="username" ' + (DEMO ? 'value="agency@example.com" ' : '') + 'required>' +
      '<label>Password</label><input type="password" name="password" autocomplete="current-password" ' + (DEMO ? 'value="demo-password" ' : '') + 'required>' +
      '<div class="err" id="err"></div><button class="btn" style="margin-top:8px">Sign in</button></form>');
    $('#f').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      api('login', { method: 'POST', body: { email: f.email.value, password: f.password.value } })
        .then(function () { boot(); }).catch(function (x) { $('#err').textContent = x.message; });
    };
  }
  function viewForcePw() {
    authShell('<h1>Choose your password</h1><p>You signed in with a temporary password. Set your own now (10+ characters, letters and numbers).</p>' +
      '<form id="f"><label>Temporary password</label><input type="password" name="cur" required autocomplete="current-password">' +
      '<label>New password</label><input type="password" name="nw" required autocomplete="new-password">' +
      '<div class="err" id="err"></div><button class="btn" style="margin-top:8px">Save and continue</button></form>');
    $('#f').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      api('password', { method: 'POST', body: { current: f.cur.value, next: f.nw.value } }).then(function () { boot(); }).catch(function (x) { $('#err').textContent = x.message; });
    };
  }

  /* ---------------- main layout ---------------- */
  var TABS = [['pictures', 'Pictures'], ['galleries', 'Photo galleries'], ['extras', 'Extra pictures'], ['seo', 'SEO & Schema'], ['tracking', 'Tracking codes'], ['team', 'Team'], ['activity', 'Activity'], ['account', 'My account']];
  function render() {
    var d = S.data;
    app.innerHTML =
      '<header class="top"><div class="wrap"><div class="logo">FUE Malaysia<small>Admin</small></div><div class="grow"></div>' +
      '<a class="btn ghost sm" href="' + (DEMO ? '#' : '/') + '" ' + (DEMO ? '' : 'target="_blank" rel="noopener"') + '>View site ↗</a>' +
      '<div class="who"><b>' + E(S.me.name) + '</b><br>' + (S.me.role === 'owner' ? 'Owner' : 'Admin') + '</div>' +
      '<button class="btn ghost sm" id="out">Sign out</button></div>' +
      '<div class="wrap"><nav class="tabs">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</nav></div></header>' +
      '<main><div class="wrap">' + (DEMO ? '<div class="banner demo"><b>Demo mode.</b> This is a working preview of the admin panel. Nothing here is saved to the public website, and logins are not real.</div>' : '') +
      (!d.images ? '<div class="banner">Image storage (Vercel Blob) is not connected yet, so pictures can’t be replaced. See SETUP.md.</div>' : '') +
      '<div id="view"></div></div></main>';
    $('#out').onclick = function () { api('logout', { method: 'POST' }).then(function () { S.me = null; S.data = null; if (DEMO) { demo.reset(); } boot(); }); };
    $$('nav.tabs button').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.t; render(); }; });
    var v = $('#view');
    ({ pictures: vPictures, galleries: vGalleries, extras: vExtras, seo: vSeo, tracking: vTracking, team: vTeam, activity: vActivity, account: vAccount })[S.tab](v);
  }

  /* ---------------- pictures ---------------- */
  function label(k) { return k.replace(/^images\//, '').replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' '); }
  function vPictures(v) {
    var d = S.data, pages = Object.keys(d.pages);
    v.innerHTML = '<h2>Pictures</h2><p class="muted">Every picture on the website. Replace one and it goes live within about a minute. You can always reset to the original or restore an earlier version.</p>' +
      '<div class="tool"><input type="text" id="q" placeholder="Search pictures…" value="' + E(S.q) + '">' +
      '<select id="pf"><option value="">All pages</option>' + pages.map(function (p) { return '<option value="' + p + '"' + (S.pf === p ? ' selected' : '') + '>' + E(d.pages[p].label) + '</option>'; }).join('') + '</select>' +
      '<label class="chk"><input type="checkbox" id="ch"' + (S.changed ? ' checked' : '') + '> Replaced only</label><span class="muted small" id="cnt"></span></div><div class="grid" id="grid"></div>' +
      '<input type="file" id="file" accept="image/png,image/jpeg,image/webp" hidden>';
    var pick = null;
    function draw() {
      var q = S.q.toLowerCase();
      var list = d.slots.filter(function (s) {
        return (!q || s.key.toLowerCase().indexOf(q) >= 0) && (!S.pf || s.pages.indexOf(S.pf) >= 0) && (!S.changed || s.override);
      });
      $('#cnt').textContent = list.length + ' of ' + d.slots.length;
      $('#grid').innerHTML = list.map(function (s) {
        var src = s.override ? s.override.url : assetUrl(s.key);
        return '<div class="slot"><div class="ph"><img loading="lazy" src="' + E(src) + '" alt=""><span class="badge' + (s.meta && s.meta.hidden ? ' del' : (s.override ? ' on' : '')) + '">' + (s.meta && s.meta.hidden ? 'Deleted' : (s.override ? 'Replaced' : 'Original')) + '</span></div>' +
          '<div class="meta"><div class="name">' + E(label(s.key)) + '</div><div class="chips">' + s.pages.map(function (p) { return '<span class="chip">' + E(d.pages[p].label) + '</span>'; }).join('') + '</div>' +
          (s.override ? '<div class="small muted">by ' + E(s.override.by) + ' · ' + E(when(s.override.at)) + '</div>' : '') +
          '<div class="act"><button class="btn sm" data-a="det" data-k="' + E(s.key) + '">Edit details</button><button class="btn sm ghost" data-a="rep" data-k="' + E(s.key) + '"' + (d.images ? '' : ' disabled') + '>Replace</button>' +
          (s.override ? '<button class="btn sm ghost" data-a="hist" data-k="' + E(s.key) + '">History</button><button class="btn sm danger" data-a="reset" data-k="' + E(s.key) + '">Reset</button>' : '') + '</div></div></div>';
      }).join('') || '<p class="muted">No pictures match.</p>';
    }
    draw();
    $('#q').oninput = function (e) { S.q = e.target.value; draw(); };
    $('#pf').onchange = function (e) { S.pf = e.target.value; draw(); };
    $('#ch').onchange = function (e) { S.changed = e.target.checked; draw(); };
    $('#grid').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return; var k = b.dataset.k;
      if (b.dataset.a === 'det') return modalPicture(k);
      if (b.dataset.a === 'rep') { pick = k; $('#file').value = ''; $('#file').click(); }
      if (b.dataset.a === 'reset') { if (confirm('Put the original picture back?')) api('image-reset', { method: 'POST', body: { slot: k } }).then(function () { toast('Original restored'); load(); }).catch(function (x) { toast(x.message, true); }); }
      if (b.dataset.a === 'hist') modalHistory(k);
    };
    $('#file').onchange = function (e) { if (e.target.files[0]) modalReplace(pick, e.target.files[0]); };
  }

  function loadImg(src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; }); }
  function processImage(file, ratio, crop) {
    return createBitmap(file).then(function (bmp) {
      var sw = bmp.width, sh = bmp.height, sx = 0, sy = 0;
      if (crop && ratio) {
        var r = sw / sh;
        if (r > ratio) { var nw = sh * ratio; sx = (sw - nw) / 2; sw = nw; } else { var nh = sw / ratio; sy = (sh - nh) / 2; sh = nh; }
      }
      var sc = Math.min(1, 2400 / Math.max(sw, sh)), w = Math.round(sw * sc), h = Math.round(sh * sc);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
      var q = 0.88;
      function enc() {
        return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/webp', q); }).then(function (b) {
          if (b && b.size > 3.8 * 1024 * 1024 && q > 0.45) { q -= 0.1; return enc(); }
          return { blob: b, w: w, h: h };
        });
      }
      return enc();
    });
  }
  function createBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return loadImg(URL.createObjectURL(file));
  }

  function modalReplace(key, file) {
    var slot = S.data.slots.filter(function (s) { return s.key === key; })[0];
    var modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = '<div class="box"><h2>Replace “' + E(label(key)) + '”</h2><p class="muted small">Used on: ' + E(slot.pages.map(function (p) { return S.data.pages[p].label; }).join(', ')) + '</p>' +
      '<label class="chk" style="margin-top:12px"><input type="checkbox" id="crop" checked> Crop to the same shape as the current picture (recommended, keeps the layout perfect)</label>' +
      '<div class="cmp"><figure><img id="o" alt=""><figcaption id="oc">Current</figcaption></figure><figure><img id="n" alt=""><figcaption id="nc">New picture…</figcaption></figure></div>' +
      '<div class="err" id="err"></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="go" disabled>Replace on live site</button></div></div>';
    document.body.appendChild(modal);
    var cur = slot.override ? slot.override.url : assetUrl(key), ratio = 0, result = null;
    $('#o', modal).src = cur;
    loadImg(assetUrl(key)).then(function (i) { ratio = i.naturalWidth / i.naturalHeight; $('#oc', modal).textContent = 'Original shape ' + i.naturalWidth + '×' + i.naturalHeight; run(); }).catch(function () { run(); });
    function run() {
      $('#go', modal).disabled = true; $('#nc', modal).textContent = 'Preparing…';
      processImage(file, ratio, $('#crop', modal).checked).then(function (r) {
        result = r; $('#n', modal).src = URL.createObjectURL(r.blob);
        $('#nc', modal).textContent = 'New picture ' + r.w + '×' + r.h + ' · ' + (r.blob.size / 1024 / 1024).toFixed(2) + ' MB';
        $('#go', modal).disabled = false;
      }).catch(function () { $('#err', modal).textContent = 'Could not read that picture. Try a JPG, PNG or WebP.'; });
    }
    $('#crop', modal).onchange = run;
    $('#cancel', modal).onclick = function () { modal.remove(); };
    $('#go', modal).onclick = function () {
      $('#go', modal).disabled = true; $('#go', modal).textContent = 'Uploading…';
      api('upload', { method: 'POST', query: 'slot=' + encodeURIComponent(key), raw: result.blob, rawType: 'image/webp' })
        .then(function (r) { modal.remove(); toast('Picture replaced — live within about a minute'); if (DEMO) demo.setImg(key, URL.createObjectURL(result.blob)); load(); })
        .catch(function (x) { $('#err', modal).textContent = x.message; $('#go', modal).disabled = false; $('#go', modal).textContent = 'Replace on live site'; });
    };
  }

  /* ---------------- picture details (like the WordPress "Attachment details") ---------------- */
  function fileUrlOf(slot) {
    var u = slot.override ? slot.override.url : slot.key;
    if (/^https?:/i.test(u)) return u;
    var base = (S.data.siteUrl || (DEMO ? 'https://www.fuemalaysia.com' : location.origin)).replace(/\/$/, '');
    return base + '/' + u.replace(/^\//, '');
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); res(); });
  }
  function modalPicture(key) {
    var slot = S.data.slots.filter(function (x) { return x.key === key; })[0];
    var meta = slot.meta || {};
    var hidden = !!meta.hidden, src = slot.override ? slot.override.url : assetUrl(key);
    var fname = key.replace(/^images\//, '');
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="box wide"><div class="pd"><div class="pd-left"><div class="pd-img"><img id="pimg" alt="" src="' + E(src) + '">' + (hidden ? '<span class="badge del" style="position:absolute;top:10px;left:10px">Deleted from website</span>' : '') + '</div>' +
      '<div class="pd-info"><b id="pname">' + E(fname) + '</b><div class="muted small" id="pmeta">' + (slot.override ? 'Replaced by ' + E(slot.override.by) + ' · ' + E(when(slot.override.at)) : 'Original picture') + '</div><div class="muted small" id="pdim"></div><div class="muted small" id="psize"></div>' +
      '<div class="muted small">Used on: ' + E(slot.pages.map(function (p) { return S.data.pages[p].label; }).join(', ')) + '</div>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm ghost" id="pchange"' + (S.data.images ? '' : ' disabled') + '>Change picture</button>' + (slot.override ? '<button class="btn sm ghost" id="phist">History</button><button class="btn sm danger" id="preset">Reset to original</button>' : '') + '</div></div></div>' +
      '<div class="pd-right"><label>Alt text <span class="count">describe the picture, used by screen readers and Google</span></label><textarea class="plain" id="palt" style="min-height:70px">' + E(meta.alt || slot.alt || '') + '</textarea>' +
      '<div class="small muted" style="margin-top:4px"><a href="https://www.w3.org/WAI/tutorials/images/decision-tree/" target="_blank" rel="noopener">Learn how to describe the purpose of the image</a>. Leave empty only if the picture is purely decorative.</div>' +
      '<label>Title <span class="count">shown when someone hovers over the picture</span></label><input type="text" id="ptitle" value="' + E(meta.title || '') + '">' +
      '<label>Image caption <span class="count">saved for your team and for “Extra pictures”</span></label><textarea class="plain" id="pcap" style="min-height:60px">' + E(meta.caption || '') + '</textarea>' +
      '<label>Description <span class="count">internal notes: source, patient consent, date…</span></label><textarea class="plain" id="pdesc" style="min-height:60px">' + E(meta.description || '') + '</textarea>' +
      '<label>File URL</label><input type="text" id="purl" readonly value="' + E(fileUrlOf(slot)) + '"><div class="row" style="margin-top:8px"><button class="btn sm ghost" id="pcopy">Copy URL to clipboard</button></div>' +
      '<div class="err" id="err"></div></div></div>' +
      '<div class="row pd-foot"><button class="btn danger" id="pdel">' + (hidden ? 'Restore to website' : 'Delete from website') + '</button><div class="grow"></div><button class="btn ghost" id="pclose">Close</button><button class="btn" id="psave">Save</button></div></div>';
    document.body.appendChild(m);
    var im = new Image(); im.onload = function () { $('#pdim', m).textContent = im.naturalWidth + ' by ' + im.naturalHeight + ' pixels'; }; im.src = src;
    if (!DEMO) fetch(src, { method: 'HEAD' }).then(function (r) { var n = Number(r.headers.get('content-length')); if (n) $('#psize', m).textContent = n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }).catch(function () {});
    function done() { m.remove(); }
    $('#pclose', m).onclick = done;
    $('#pcopy', m).onclick = function () { copyText($('#purl', m).value).then(function () { toast('File URL copied'); }); };
    $('#purl', m).onclick = function () { this.select(); };
    $('#psave', m).onclick = function () {
      api('image-meta', { method: 'POST', body: { slot: key, alt: $('#palt', m).value, title: $('#ptitle', m).value, caption: $('#pcap', m).value, description: $('#pdesc', m).value } })
        .then(function () { toast('Details saved — live within about a minute'); done(); return load(); }).catch(function (x) { $('#err', m).textContent = x.message; });
    };
    $('#pdel', m).onclick = function () {
      var msg = hidden ? 'Show this picture on the website again?' : 'Delete this picture from the website?\n\nIt disappears from every page where it is used. Nothing is erased permanently: you can restore it here at any time.';
      if (!confirm(msg)) return;
      api('image-hide', { method: 'POST', body: { slot: key, hidden: !hidden } }).then(function () { toast(hidden ? 'Picture restored' : 'Picture deleted from the website'); done(); return load(); }).catch(function (x) { $('#err', m).textContent = x.message; });
    };
    $('#pchange', m).onclick = function () {
      var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/png,image/jpeg,image/webp';
      f.onchange = function () { if (f.files[0]) { done(); modalReplace(key, f.files[0]); } };
      f.click();
    };
    if (slot.override) {
      $('#phist', m).onclick = function () { done(); modalHistory(key); };
      $('#preset', m).onclick = function () { if (confirm('Put the original picture back?')) api('image-reset', { method: 'POST', body: { slot: key } }).then(function () { toast('Original restored'); done(); return load(); }).catch(function (x) { $('#err', m).textContent = x.message; }); };
    }
  }

  function modalHistory(key) {
    api('image-history', { query: 'slot=' + encodeURIComponent(key) }).then(function (r) {
      var modal = document.createElement('div'); modal.className = 'modal';
      var h = r.history || [];
      modal.innerHTML = '<div class="box"><h2>Earlier versions</h2><p class="muted small">' + E(label(key)) + '. Restoring swaps it with the current picture.</p>' +
        (h.length ? '<div class="hist">' + h.map(function (x, i) { return '<figure><img src="' + E(x.url) + '" alt=""><div class="small muted">' + E(x.by) + '<br>' + E(when(x.at)) + '</div><button class="btn sm" data-i="' + i + '" style="margin-top:6px">Restore</button></figure>'; }).join('') + '</div>' : '<p class="muted" style="margin:14px 0">No earlier versions yet. Reset puts back the original.</p>') +
        '<div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" id="close">Close</button></div></div>';
      document.body.appendChild(modal);
      $('#close', modal).onclick = function () { modal.remove(); };
      modal.onclick = function (e) {
        var b = e.target.closest('button[data-i]'); if (!b) return;
        api('image-restore', { method: 'POST', body: { slot: key, index: Number(b.dataset.i) } }).then(function () { modal.remove(); toast('Version restored'); load(); }).catch(function (x) { toast(x.message, true); });
      };
    });
  }

  /* ---------------- SEO & schema ---------------- */
  var FIELDS = ['title', 'description', 'canonical', 'ogTitle', 'ogDescription', 'ogImage', 'robots', 'schema'];
  function effective(p) {
    var pg = S.data.pages[p], out = {};
    FIELDS.forEach(function (f) { out[f] = (pg.saved && pg.saved[f] != null && pg.saved[f] !== '') ? pg.saved[f] : (pg.defaults[f] || ''); });
    if (pg.saved && pg.saved.robots === 'noindex') out.robots = 'noindex';
    return out;
  }
  function schemaTemplates(p) {
    var pg = S.data.pages[p], e = effective(p), home = S.data.pages.index.defaults.schema;
    var url = e.canonical || 'https://www.fuemalaysia.com/';
    return {
      clinic: function () { return home || JSON.stringify({ '@context': 'https://schema.org', '@type': 'MedicalClinic', name: 'FUE Malaysia', url: 'https://www.fuemalaysia.com/' }, null, 2); },
      webpage: function () { return JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebPage', name: e.title, description: e.description, url: url, isPartOf: { '@type': 'WebSite', name: 'FUE Malaysia', url: 'https://www.fuemalaysia.com/' } }, null, 2); },
      breadcrumb: function () { return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.fuemalaysia.com/' }, { '@type': 'ListItem', position: 2, name: pg.label, item: url }] }, null, 2); },
      faq: function () { return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Replace with a question people really ask?', acceptedAnswer: { '@type': 'Answer', text: 'Replace with the answer exactly as it appears on this page.' } }] }, null, 2); },
    };
  }
  function vSeo(v) {
    var d = S.data, p = S.page, e = effective(p), pg = d.pages[p];
    v.innerHTML = '<h2>SEO & Schema</h2><div class="help"><b>Meta title</b> is the blue headline people see on Google. <b>Meta description</b> is the grey text under it. <b>Page schema</b> is hidden structured data (JSON-LD) that tells Google this is a medical clinic, an FAQ and so on, which can unlock rich results. Changes are written into the page itself so Google reads them directly.</div>' +
      '<div class="pills">' + Object.keys(d.pages).map(function (k) { return '<button data-p="' + k + '" class="' + (k === p ? 'on' : '') + '">' + E(d.pages[k].label) + '</button>'; }).join('') + '</div>' +
      '<div class="panel"><div class="serp"><div class="u" id="su"></div><div class="t" id="st"></div><div class="d" id="sd"></div></div><div class="muted small">Preview of the Google result</div>' +
      '<label>Meta title <span class="count" id="ct"></span></label><input type="text" id="f-title" value="' + E(e.title) + '">' +
      '<label>Meta description <span class="count" id="cd"></span></label><textarea class="plain" id="f-description">' + E(e.description) + '</textarea>' +
      '<div class="two"><div><label>Canonical address</label><input type="url" id="f-canonical" value="' + E(e.canonical) + '" placeholder="https://www.fuemalaysia.com/"></div>' +
      '<div><label>Search engines</label><select id="f-robots"><option value="">Show this page in Google</option><option value="noindex"' + (e.robots === 'noindex' ? ' selected' : '') + '>Hide this page from Google (noindex)</option></select></div></div>' +
      '<div class="two"><div><label>Social share title (Open Graph)</label><input type="text" id="f-ogTitle" value="' + E(e.ogTitle) + '"></div>' +
      '<div><label>Social share picture</label><select id="f-ogImage">' + ogOptions(e.ogImage) + '</select></div></div>' +
      '<label>Social share description</label><textarea class="plain" id="f-ogDescription" style="min-height:60px">' + E(e.ogDescription) + '</textarea>' +
      '<label>Page schema (JSON-LD) <span class="count" id="cs"></span></label>' +
      '<div class="row" style="margin-bottom:8px"><select id="tpl" style="max-width:260px"><option value="">Insert a starter…</option><option value="clinic">Medical clinic (site-wide)</option><option value="webpage">Web page</option><option value="breadcrumb">Breadcrumbs</option><option value="faq">FAQ page</option></select><button class="btn ghost sm" id="val">Check JSON</button></div>' +
      '<textarea id="f-schema" style="min-height:220px" spellcheck="false">' + E(e.schema) + '</textarea>' +
      '<div class="help">Only describe things that are really on the page. Clear the box to remove the schema from this page. Test it at <b>search.google.com/test/rich-results</b> after saving.</div>' +
      '<div class="row sect"><button class="btn" id="save">Save “' + E(pg.label) + '”</button><button class="btn ghost" id="reset">Reset page to built-in values</button><span class="muted small">Goes live within about a minute.</span></div></div>';
    function fv(f) { return $('#f-' + f).value; }
    function counts() {
      var t = fv('title').length, ds = fv('description').length;
      var ct = $('#ct'); ct.textContent = t + ' characters · aim for 30–60'; ct.className = 'count ' + (t >= 30 && t <= 60 ? 'ok' : (t > 70 ? 'bad' : ''));
      var cd = $('#cd'); cd.textContent = ds + ' characters · aim for 70–160'; cd.className = 'count ' + (ds >= 70 && ds <= 160 ? 'ok' : (ds > 175 ? 'bad' : ''));
      $('#su').textContent = (fv('canonical') || 'https://www.fuemalaysia.com/'); $('#st').textContent = fv('title') || '(no title)'; $('#sd').textContent = fv('description');
      var sv = fv('schema').trim(), cs = $('#cs');
      if (!sv) { cs.textContent = 'none'; cs.className = 'count'; } else { try { JSON.parse(sv); cs.textContent = 'valid JSON'; cs.className = 'count ok'; } catch (x) { cs.textContent = 'not valid JSON'; cs.className = 'count bad'; } }
    }
    counts();
    $$('input,textarea,select', v).forEach(function (el) { el.addEventListener('input', counts); });
    $$('.pills button', v).forEach(function (b) { b.onclick = function () { S.page = b.dataset.p; vSeo(v); }; });
    var T = schemaTemplates(p);
    $('#tpl').onchange = function (ev) {
      var k = ev.target.value; if (!k) return;
      if (!$('#f-schema').value.trim() || confirm('Replace the schema in the box with this starter?')) { $('#f-schema').value = T[k](); counts(); }
      ev.target.value = '';
    };
    $('#val').onclick = function () { try { var s = $('#f-schema').value.trim(); if (s) JSON.parse(s); toast('JSON looks valid'); } catch (x) { toast('Not valid JSON: ' + x.message, true); } };
    function body() { var o = {}; FIELDS.forEach(function (f) { o[f] = fv(f); }); return o; }
    $('#save').onclick = function () {
      var b = { pages: {} }; b.pages[p] = body();
      api('content', { method: 'POST', body: b }).then(function () { toast('Saved — live within about a minute'); return load(); }).catch(function (x) { toast(x.message, true); });
    };
    $('#reset').onclick = function () {
      if (!confirm('Go back to the built-in title, description and schema for this page?')) return;
      var b = { pages: {} }; b.pages[p] = { title: '', description: '', canonical: '', ogTitle: '', ogDescription: '', ogImage: '', robots: '', schema: '' };
      api('content', { method: 'POST', body: b }).then(function () { toast('Reset'); return load(); }).catch(function (x) { toast(x.message, true); });
    };
  }
  function ogOptions(cur) {
    var seen = false, html = S.data.slots.map(function (s) { var sel = cur === s.key || cur === '/' + s.key; if (sel) seen = true; return '<option value="' + E(s.key) + '"' + (sel ? ' selected' : '') + '>' + E(label(s.key)) + '</option>'; }).join('');
    if (cur && !seen) html = '<option value="' + E(cur) + '" selected>' + E(cur) + '</option>' + html;
    return '<option value="">Default</option>' + html;
  }

  /* ---------------- tracking ---------------- */
  function vTracking(v) {
    var t = S.data.tracking || {};
    v.innerHTML = '<h2>Tracking & verification codes</h2><div class="help"><b>Where to paste what:</b> Google Search Console, Google Ads, Google Analytics, Tag Manager and Meta Pixel each give you a small snippet. Paste the part that goes in the <code>&lt;head&gt;</code> into the first box. Google Tag Manager also gives a <code>&lt;noscript&gt;</code> part for the start of the <code>&lt;body&gt;</code>; that goes in the second box. The code is added to <b>every page</b> automatically.</div>' +
      '<div class="banner"><b>Admins only.</b> Only signed-in team members can see or change these boxes. Visitors never see this screen. Note: browsers can always see tracking tags in a page’s source — that is normal for Google tags and not a leak. Only paste code from Google or another provider you trust: it runs on every page.</div>' +
      '<div class="panel"><label>Head code (goes before &lt;/head&gt;)</label><textarea id="th" style="min-height:200px" spellcheck="false" placeholder="&lt;meta name=&quot;google-site-verification&quot; content=&quot;…&quot; /&gt;&#10;&lt;!-- Google tag (gtag.js) --&gt;&#10;&lt;script async src=&quot;https://www.googletagmanager.com/gtag/js?id=G-XXXX&quot;&gt;&lt;/script&gt;…">' + E(t.head || '') + '</textarea>' +
      '<label>Start-of-body code (right after &lt;body&gt;, e.g. Tag Manager noscript)</label><textarea id="tb" style="min-height:110px" spellcheck="false">' + E(t.body || '') + '</textarea>' +
      '<div class="row sect"><button class="btn" id="save">Save tracking codes</button><span class="muted small">Goes live on all pages within about a minute.</span></div></div>' +
      '<div class="panel sect"><h3>Site address</h3><p class="muted small" style="margin:4px 0 0">Used to build full links for social-share pictures. Leave empty to use the website’s own address.</p><input type="url" id="su" placeholder="https://www.fuemalaysia.com" value="' + E(S.data.siteUrl || '') + '"><div class="row" style="margin-top:12px"><button class="btn ghost sm" id="ssu">Save address</button></div></div>';
    $('#save').onclick = function () {
      api('content', { method: 'POST', body: { tracking: { head: $('#th').value, body: $('#tb').value } } }).then(function () { toast('Saved — live within about a minute'); return load(); }).catch(function (x) { toast(x.message, true); });
    };
    $('#ssu').onclick = function () {
      api('content', { method: 'POST', body: { siteUrl: $('#su').value } }).then(function () { toast('Saved'); return load(); }).catch(function (x) { toast(x.message, true); });
    };
  }


  /* ---------------- photo galleries (add / remove / re-order inside a section) ---------------- */
  var LEAF = { h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', p: 'Text', figcaption: 'Caption', a: 'Link text', b: 'Bold text', strong: 'Bold text', span: 'Label', small: 'Small text', div: 'Text', li: 'List text', em: 'Text' };
  function rid() { return Math.random().toString(36).slice(2, 9); }
  function uploadFree(blob) {
    return api('upload', { method: 'POST', query: 'free=1', raw: blob, rawType: 'image/webp' }).then(function (r) { return r.url; });
  }
  function gKey(g) { return g.page + ':' + g.id; }
  function gInit(g) {
    var k = gKey(g);
    if (!S.gedit) S.gedit = {};
    if (!S.gedit[k]) {
      var st = g.state;
      S.gedit[k] = st ? { order: st.order.slice(), added: JSON.parse(JSON.stringify(st.added || {})), dirty: false }
        : { order: g.items.map(function (i) { return i.id; }), added: {}, dirty: false };
    }
    return S.gedit[k];
  }
  function thumbs(images) {
    return '<div class="gt">' + images.map(function (im) {
      var src = /^(https?:|blob:|\/__uploads)/.test(im.src) ? im.src : assetUrl(im.src.replace(/^\//, ''));
      return '<img loading="lazy" src="' + E(src) + '" alt="">';
    }).join('') + '</div>';
  }
  function vGalleries(v) {
    var d = S.data, groups = {};
    d.galleries.forEach(function (g) { (groups[g.page] = groups[g.page] || []).push(g); });
    v.innerHTML = '<h2>Photo galleries</h2><p class="muted">Sections that show several photos in a row or grid. Add a new photo, remove one, or change the order. Nothing changes on the website until you press <b>Save</b>. To swap a single existing photo for another, use the <b>Pictures</b> tab.</p><div id="gl"></div>';
    var html = '';
    Object.keys(groups).forEach(function (p) {
      html += '<h3 style="margin:26px 0 10px">' + E(d.pages[p].label) + '</h3>';
      groups[p].forEach(function (g) {
        var e = gInit(g), byId = {}; g.items.forEach(function (i) { byId[i.id] = i; });
        var removed = g.items.filter(function (i) { return e.order.indexOf(i.id) < 0; });
        html += '<div class="panel gal" style="margin-bottom:16px" data-k="' + E(gKey(g)) + '"><div class="row"><div class="grow"><b>' + E(g.label) + '</b> <span class="muted small">· ' + e.order.length + ' item' + (e.order.length === 1 ? '' : 's') + (e.dirty ? ' · <span style="color:var(--warn)">unsaved changes</span>' : '') + (g.state && !e.dirty ? ' · customised' : '') + '</span></div>' +
          '<button class="btn sm ghost" data-a="add">+ Add item</button><button class="btn sm" data-a="save"' + (e.dirty ? '' : ' disabled') + '>Save</button>' +
          (e.dirty ? '<button class="btn sm ghost" data-a="discard">Discard</button>' : '') + (g.state ? '<button class="btn sm danger" data-a="reset">Reset to original</button>' : '') + '</div><div class="ggrid">';
        e.order.forEach(function (id, ix) {
          var it = byId[id] || (e.added[id] && { images: e.added[id].images, texts: e.added[id].texts });
          if (!it) return;
          html += '<div class="gi"><span class="gn">' + (ix + 1) + '</span>' + thumbs(it.images) + '<div class="small muted gtx">' + E((it.texts || []).filter(Boolean).slice(0, 3).join(' · ')) + (id[0] === 'n' ? ' <b>(new)</b>' : '') + '</div><div class="row" style="gap:4px"><button class="btn sm ghost" data-a="left" data-id="' + id + '" ' + (ix === 0 ? 'disabled' : '') + ' title="Move earlier">←</button><button class="btn sm ghost" data-a="right" data-id="' + id + '" ' + (ix === e.order.length - 1 ? 'disabled' : '') + ' title="Move later">→</button><button class="btn sm danger" data-a="rm" data-id="' + id + '">Remove</button></div></div>';
        });
        html += '</div>' + (removed.length ? '<div class="small muted" style="margin-top:12px">Removed originals (put back with Restore):</div><div class="ggrid">' + removed.map(function (i) { return '<div class="gi off">' + thumbs(i.images) + '<div class="small muted gtx">' + E(i.texts.filter(Boolean).slice(0, 2).join(' · ')) + '</div><button class="btn sm ghost" data-a="restore" data-id="' + i.id + '">Restore</button></div>'; }).join('') + '</div>' : '') + '</div>';
      });
    });
    $('#gl').innerHTML = html;
    $('#gl').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) return;
      var box = b.closest('.gal'), k = box.dataset.k, g = d.galleries.filter(function (x) { return gKey(x) === k; })[0], e = gInit(g), id = b.dataset.id, a = b.dataset.a;
      var i = e.order.indexOf(id);
      if (a === 'left' && i > 0) { e.order.splice(i - 1, 0, e.order.splice(i, 1)[0]); e.dirty = true; }
      if (a === 'right' && i < e.order.length - 1) { e.order.splice(i + 1, 0, e.order.splice(i, 1)[0]); e.dirty = true; }
      if (a === 'rm') { if (e.order.length < 2) return toast('A gallery needs at least one item', true); if (!confirm('Remove this item from the website? (You can restore originals later.)')) return; e.order.splice(i, 1); delete e.added[id]; e.dirty = true; }
      if (a === 'restore') { e.order.push(id); e.dirty = true; }
      if (a === 'discard') { delete S.gedit[k]; }
      if (a === 'add') return modalAddItem(g, e, function () { vGalleries(v); });
      if (a === 'save') {
        var usedAdded = {}; e.order.forEach(function (x) { if (e.added[x]) usedAdded[x] = e.added[x]; });
        return api('gallery-save', { method: 'POST', body: { page: g.page, id: g.id, order: e.order, added: usedAdded } }).then(function () { toast('Saved — live within about a minute'); delete S.gedit[k]; return load(); }).catch(function (x) { toast(x.message, true); });
      }
      if (a === 'reset') { if (!confirm('Put this gallery back exactly as it was originally?')) return; return api('gallery-reset', { method: 'POST', body: { page: g.page, id: g.id } }).then(function () { toast('Gallery reset'); delete S.gedit[k]; return load(); }).catch(function (x) { toast(x.message, true); }); }
      vGalleries(v);
    };
  }
  function modalAddItem(g, e, done) {
    var m = document.createElement('div'); m.className = 'modal';
    var imgs = [], i;
    var body = '<div class="box"><h2>Add to “' + E(g.label) + '”</h2><p class="muted small">The new item looks exactly like the others. Add the picture' + (g.tplImages > 1 ? 's' : '') + ' and fill in the text.</p>';
    for (i = 0; i < g.tplImages; i++) {
      body += '<label>Picture ' + (g.tplImages > 1 ? (i + 1) + ' of ' + g.tplImages : '') + '</label><div class="row"><input type="file" accept="image/png,image/jpeg,image/webp" data-i="' + i + '" class="pf"><img class="pv" data-i="' + i + '" alt="" style="height:64px;border-radius:8px;display:none"></div><input type="text" class="alt" data-i="' + i + '" placeholder="Describe the picture (for accessibility and Google)">';
    }
    g.tplTexts.forEach(function (t, j) { body += '<label>' + (LEAF[t.tag] || 'Text') + ' ' + (j + 1) + ' <span class="count">example: ' + E(t.text.slice(0, 30)) + '</span></label><input type="text" class="tx" data-j="' + j + '" value="' + E(t.text) + '">'; });
    body += '<div class="help">Tip: numbers such as “Case 01” or “02” are copied from the first item. Change them to match.</div><div class="err" id="err"></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cn">Cancel</button><button class="btn" id="ok">Add item</button></div></div>';
    m.innerHTML = body; document.body.appendChild(m);
    var files = [];
    $$('.pf', m).forEach(function (f) { f.onchange = function () { var ix = Number(f.dataset.i); files[ix] = f.files[0]; var pv = $('.pv[data-i="' + ix + '"]', m); pv.src = URL.createObjectURL(f.files[0]); pv.style.display = ''; }; });
    $('#cn', m).onclick = function () { m.remove(); };
    $('#ok', m).onclick = function () {
      for (var q = 0; q < g.tplImages; q++) if (!files[q]) { $('#err', m).textContent = 'Choose all the pictures first.'; return; }
      $('#ok', m).disabled = true; $('#ok', m).textContent = 'Uploading…';
      var ratios = g.items[0].images.map(function (im) { return loadImg(/^(https?:|blob:|\/__uploads)/.test(im.src) ? im.src : assetUrl(im.orig.replace(/^\//, ''))).then(function (x) { return x.naturalWidth / x.naturalHeight; }).catch(function () { return 0; }); });
      Promise.all(ratios).then(function (rs) {
        return Promise.all(files.map(function (f, ix) { return processImage(f, rs[ix], true).then(function (r) { return uploadFree(r.blob); }); }));
      }).then(function (urls) {
        var id = 'n' + rid();
        e.added[id] = { images: urls.map(function (u, ix) { return { src: u, alt: ($('.alt[data-i="' + ix + '"]', m).value || '').trim() }; }), texts: $$('.tx', m).map(function (t) { return t.value; }) };
        e.order.push(id); e.dirty = true; m.remove(); toast('Added — press Save to publish'); done();
      }).catch(function (x) { $('#err', m).textContent = x.message || 'Upload failed'; $('#ok', m).disabled = false; $('#ok', m).textContent = 'Add item'; });
    };
  }

  /* ---------------- extra pictures (a new picture anywhere on a page) ---------------- */
  function vExtras(v) {
    var d = S.data;
    if (!S.bedit) S.bedit = { list: JSON.parse(JSON.stringify(d.blocks || [])), dirty: false };
    var be = S.bedit;
    function secLabel(b) { if (b.after === '@end') return 'End of page'; var s = (d.sections[b.page] || []).filter(function (x) { return x.key === b.after; })[0]; return s ? 'After “' + s.label + '”' : 'After a section that no longer exists'; }
    v.innerHTML = '<h2>Extra pictures</h2><p class="muted">Add a brand-new picture to any page, anywhere between its sections, without changing the design. Choose the page, the place, the picture and an optional caption. Nothing changes on the website until you press <b>Save</b>.</p>' +
      '<div class="row" style="margin:16px 0"><button class="btn" id="addb">+ Add a picture</button><button class="btn" id="saveb"' + (be.dirty ? '' : ' disabled') + '>Save</button>' + (be.dirty ? '<button class="btn ghost" id="disc">Discard changes</button><span class="small" style="color:var(--warn)">Unsaved changes</span>' : '') + '</div><div id="bl"></div>';
    $('#bl').innerHTML = be.list.length ? '<div class="grid">' + be.list.map(function (b, i) {
      var src = /^(https?:|blob:|\/__uploads)/.test(b.image) ? b.image : assetUrl(b.image.replace(/^\//, ''));
      return '<div class="slot"><div class="ph"><img src="' + E(src) + '" alt=""><span class="badge on">' + E(d.pages[b.page].label) + '</span></div><div class="meta"><div class="name">' + E(secLabel(b)) + '</div><div class="small muted">' + E(b.size) + (b.caption ? ' · “' + E(b.caption.slice(0, 40)) + '”' : '') + '</div><div class="act"><button class="btn sm ghost" data-a="up" data-i="' + i + '" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button class="btn sm ghost" data-a="down" data-i="' + i + '" ' + (i === be.list.length - 1 ? 'disabled' : '') + '>↓</button><button class="btn sm ghost" data-a="edit" data-i="' + i + '">Edit</button><button class="btn sm danger" data-a="rm" data-i="' + i + '">Remove</button></div></div></div>';
    }).join('') + '</div>' : '<p class="muted">No extra pictures yet.</p>';
    $('#addb').onclick = function () { modalBlock(null, function () { vExtras(v); }); };
    $('#saveb').onclick = function () { api('blocks-save', { method: 'POST', body: { blocks: be.list } }).then(function () { toast('Saved — live within about a minute'); S.bedit = null; return load(); }).catch(function (x) { toast(x.message, true); }); };
    if ($('#disc')) $('#disc').onclick = function () { S.bedit = null; vExtras(v); };
    $('#bl').onclick = function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) return; var i = Number(b.dataset.i), a = b.dataset.a;
      if (a === 'up') { be.list.splice(i - 1, 0, be.list.splice(i, 1)[0]); }
      if (a === 'down') { be.list.splice(i + 1, 0, be.list.splice(i, 1)[0]); }
      if (a === 'rm') { if (!confirm('Remove this picture from the page?')) return; be.list.splice(i, 1); }
      if (a === 'edit') return modalBlock(i, function () { vExtras(v); });
      be.dirty = true; vExtras(v);
    };
    function modalBlock(idx, done) {
      var cur = idx == null ? { id: rid(), page: 'index', after: '@end', image: '', alt: '', caption: '', size: 'wide' } : JSON.parse(JSON.stringify(be.list[idx]));
      var m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<div class="box"><h2>' + (idx == null ? 'Add a picture' : 'Edit picture') + '</h2><div class="two"><div><label>Page</label><select id="bp">' + Object.keys(d.pages).map(function (p) { return '<option value="' + p + '"' + (cur.page === p ? ' selected' : '') + '>' + E(d.pages[p].label) + '</option>'; }).join('') + '</select></div><div><label>Place on the page</label><select id="ba"></select></div></div>' +
        '<label>Picture</label><div class="row"><input type="file" id="bf" accept="image/png,image/jpeg,image/webp"><img id="bv" alt="" style="height:64px;border-radius:8px;display:none"></div>' +
        '<label>Describe the picture <span class="count">for accessibility and Google</span></label><input type="text" id="balt" value="' + E(cur.alt) + '">' +
        '<label>Caption <span class="count">optional</span></label><input type="text" id="bcap" value="' + E(cur.caption) + '">' +
        '<label>Size</label><select id="bsz"><option value="wide">Wide</option><option value="medium">Medium</option><option value="small">Small</option><option value="full">Full width</option></select>' +
        '<div class="err" id="err"></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn ghost" id="cn">Cancel</button><button class="btn" id="ok">' + (idx == null ? 'Add picture' : 'Done') + '</button></div></div>';
      document.body.appendChild(m);
      $('#bsz', m).value = cur.size;
      function fillPlaces() {
        var secs = d.sections[$('#bp', m).value] || [];
        $('#ba', m).innerHTML = secs.map(function (s) { return '<option value="' + E(s.key) + '">After: ' + E(s.label) + '</option>'; }).join('') + '<option value="@end">At the end (above the footer)</option>';
        $('#ba', m).value = cur.after;
        if ($('#ba', m).value !== cur.after) $('#ba', m).value = '@end';
      }
      fillPlaces();
      $('#bp', m).onchange = function () { cur.after = '@end'; fillPlaces(); };
      var file = null;
      if (cur.image) { $('#bv', m).src = /^(https?:|blob:|\/__uploads)/.test(cur.image) ? cur.image : assetUrl(cur.image.replace(/^\//, '')); $('#bv', m).style.display = ''; }
      $('#bf', m).onchange = function (e) { file = e.target.files[0]; if (file) { $('#bv', m).src = URL.createObjectURL(file); $('#bv', m).style.display = ''; } };
      $('#cn', m).onclick = function () { m.remove(); };
      $('#ok', m).onclick = function () {
        if (!file && !cur.image) { $('#err', m).textContent = 'Choose a picture first.'; return; }
        cur.page = $('#bp', m).value; cur.after = $('#ba', m).value; cur.alt = $('#balt', m).value.trim(); cur.caption = $('#bcap', m).value.trim(); cur.size = $('#bsz', m).value;
        $('#ok', m).disabled = true; $('#ok', m).textContent = 'Working…';
        var p = file ? processImage(file, 0, false).then(function (r) { return uploadFree(r.blob); }).then(function (u) { cur.image = u; }) : Promise.resolve();
        p.then(function () { if (idx == null) be.list.push(cur); else be.list[idx] = cur; be.dirty = true; m.remove(); done(); })
          .catch(function (x) { $('#err', m).textContent = x.message || 'Upload failed'; $('#ok', m).disabled = false; $('#ok', m).textContent = 'Done'; });
      };
    }
  }

  /* ---------------- team ---------------- */
  function vTeam(v) {
    var owner = S.me.role === 'owner';
    v.innerHTML = '<h2>Team</h2><p class="muted">Everyone has their own login. <b>Owners</b> can add and remove logins; <b>Admins</b> can change pictures, SEO and tracking codes.</p><div class="panel" id="tp"><p class="muted">Loading…</p></div>' +
      (owner ? '<div class="panel sect"><h3>Add a person</h3><form id="af" class="two" style="align-items:end"><div><label>Name</label><input type="text" name="name" required></div><div><label>Email</label><input type="email" name="email" required></div><div><label>Role</label><select name="role"><option value="admin">Admin</option><option value="owner">Owner</option></select></div><div><button class="btn">Create login</button></div></form><div class="err" id="err"></div><p class="small muted">A one-time temporary password is shown after you create the login. Send it privately; the person must choose their own password at first sign-in.</p></div>' : '');
    function list() {
      api('users').then(function (r) {
        S.users = r.users;
        $('#tp').innerHTML = '<div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th>' + (owner ? '<th></th>' : '') + '</tr></thead><tbody>' + r.users.map(function (u) {
          return '<tr><td><b>' + E(u.name) + '</b>' + (u.id === S.me.id ? ' <span class="chip">you</span>' : '') + (u.mustChange ? ' <span class="chip">temp password</span>' : '') + '</td><td>' + E(u.email) + '</td><td>' + (u.role === 'owner' ? 'Owner' : 'Admin') + '</td><td>' + E(when(u.lastLogin) || '—') + '</td>' +
            (owner ? '<td class="row" style="justify-content:flex-end"><button class="btn sm ghost" data-a="role" data-id="' + u.id + '" data-r="' + (u.role === 'owner' ? 'admin' : 'owner') + '">Make ' + (u.role === 'owner' ? 'admin' : 'owner') + '</button><button class="btn sm ghost" data-a="reset" data-id="' + u.id + '">Reset password</button>' + (u.id === S.me.id ? '' : '<button class="btn sm danger" data-a="rm" data-id="' + u.id + '">Remove</button>') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
      });
    }
    list();
    $('#tp').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return; var id = b.dataset.id;
      var u = S.users.filter(function (x) { return x.id === id; })[0];
      if (b.dataset.a === 'reset' && confirm('Create a new temporary password for ' + u.name + '? Their current password stops working.')) api('user-reset', { method: 'POST', body: { id: id } }).then(function (r) { modalTemp(u.name, r.tempPassword); list(); }).catch(function (x) { toast(x.message, true); });
      if (b.dataset.a === 'rm' && confirm('Remove ' + u.name + '? They lose access immediately.')) api('user-remove', { method: 'POST', body: { id: id } }).then(function () { toast('Removed'); list(); }).catch(function (x) { toast(x.message, true); });
      if (b.dataset.a === 'role') api('user-role', { method: 'POST', body: { id: id, role: b.dataset.r } }).then(function () { toast('Role changed'); list(); }).catch(function (x) { toast(x.message, true); });
    };
    if (owner) $('#af').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      api('user-create', { method: 'POST', body: { name: f.name.value, email: f.email.value, role: f.role.value } }).then(function (r) { modalTemp(f.name.value, r.tempPassword); f.reset(); $('#err').textContent = ''; list(); }).catch(function (x) { $('#err').textContent = x.message; });
    };
  }
  function modalTemp(name, pw) {
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="box"><h2>Temporary password for ' + E(name) + '</h2><p class="muted">Copy it now and send it privately. It is shown only once, and ' + E(name) + ' must choose their own password at first sign-in.</p><div class="temp">' + E(pw) + '</div><div class="row" style="justify-content:flex-end"><button class="btn ghost" id="cp">Copy</button><button class="btn" id="ok">Done</button></div></div>';
    document.body.appendChild(m);
    $('#cp', m).onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(pw).then(function () { toast('Copied'); }); };
    $('#ok', m).onclick = function () { m.remove(); };
  }

  /* ---------------- activity & account ---------------- */
  function vActivity(v) {
    v.innerHTML = '<h2>Activity</h2><p class="muted">The latest changes, newest first.</p><div class="panel" id="lp"><p class="muted">Loading…</p></div>';
    api('audit').then(function (r) {
      var rows = r.log || [];
      $('#lp').innerHTML = rows.length ? '<div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>' + rows.map(function (x) { return '<tr><td>' + E(when(x.t)) + '</td><td>' + E(x.who) + '</td><td>' + E(x.action.replace(/-/g, ' ')) + '</td><td>' + E(x.detail) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">Nothing yet.</p>';
    });
  }
  function vAccount(v) {
    v.innerHTML = '<h2>My account</h2><div class="panel" style="max-width:460px"><p><b>' + E(S.me.name) + '</b><br><span class="muted">' + E(S.me.email) + ' · ' + (S.me.role === 'owner' ? 'Owner' : 'Admin') + '</span></p>' +
      '<form id="pf2"><label>Current password</label><input type="password" name="c" autocomplete="current-password" required><label>New password <span class="count">10+ characters, letters and numbers</span></label><input type="password" name="n" autocomplete="new-password" required><div class="err" id="err"></div><button class="btn" style="margin-top:8px">Change password</button></form></div>';
    $('#pf2').onsubmit = function (e) {
      e.preventDefault(); var f = e.target;
      api('password', { method: 'POST', body: { current: f.c.value, next: f.n.value } }).then(function () { toast('Password changed'); f.reset(); $('#err').textContent = ''; }).catch(function (x) { $('#err').textContent = x.message; });
    };
  }

  /* ---------------- demo (fake in-memory API) ---------------- */
  var demo = { st: null, imgs: {}, reset: function () { demo.st = null; },
    setImg: function (k, u) { if (demo.st && demo.st.images[k]) demo.st.images[k].url = u; } };
  function demoState() {
    if (demo.st) return demo.st;
    var D = window.FUE_DEMO_DATA, now = new Date().toISOString();
    demo.st = { images: {}, meta: {}, galleries: {}, blocks: [], pages: {}, tracking: { head: '', body: '' }, siteUrl: '', log: [], loggedIn: false,
      users: D.users.map(function (u, i) { return { id: 'u' + i, name: u.name, email: u.email, role: u.role, mustChange: false, created: now, lastLogin: i === 0 ? now : null }; }) };
    return demo.st;
  }
  function demoLog(a, d) { var s = demoState(); s.log.unshift({ t: new Date().toISOString(), who: s.users[0].name, action: a, detail: d || '' }); }
  function demoApi(action, o) {
    var s = demoState(), D = window.FUE_DEMO_DATA, b = o.body || {};
    function ok(x) { return Promise.resolve(x); }
    function bad(m) { var e = new Error(m); return Promise.reject(e); }
    if (action === 'me') return ok({ storage: true, images: true, needsSetup: false, user: s.loggedIn ? pub(s.users[0]) : null });
    if (action === 'login') { s.loggedIn = true; return ok({ ok: true }); }
    if (action === 'logout') { s.loggedIn = false; return ok({ ok: true }); }
    if (action === 'password') return ok({ ok: true });
    if (action === 'state') {
      var pages = {};
      Object.keys(D.pages).forEach(function (p) { pages[p] = { label: D.pages[p].label, defaults: D.pages[p].defaults, saved: s.pages[p] || {} }; });
      var gal = D.galleries.map(function (g) { return Object.assign({}, g, { state: s.galleries[g.page + ':' + g.id] || null }); });
      return ok({ user: pub(s.users[0]), storage: true, images: true, pages: pages, tracking: s.tracking, siteUrl: s.siteUrl, galleries: gal, sections: D.sections, blocks: s.blocks,
        slots: D.slots.map(function (x) { var im = s.images[x.key]; return { key: x.key, pages: x.pages, alt: x.alt, meta: s.meta[x.key] || null, override: im ? { url: im.url, by: s.users[0].name, at: im.at, history: im.history.length } : null }; }) });
    }
    if (action === 'content') {
      Object.keys(b.pages || {}).forEach(function (p) { s.pages[p] = b.pages[p]; demoLog('content-saved', p); });
      if (b.tracking) { s.tracking = b.tracking; demoLog('content-saved', 'tracking codes'); }
      if (b.siteUrl !== undefined) s.siteUrl = b.siteUrl;
      return ok({ ok: true });
    }
    if (action === 'upload' && /free=1/.test(o.query || '')) return ok({ ok: true, url: URL.createObjectURL(o.raw) });
    if (action === 'image-meta') { var pm = s.meta[b.slot] || {}; s.meta[b.slot] = { alt: b.alt, title: b.title, caption: b.caption, description: b.description, hidden: !!pm.hidden }; demoLog('picture-details-saved', b.slot); return ok({ ok: true }); }
    if (action === 'image-hide') { var hm = s.meta[b.slot] || { alt: '', title: '', caption: '', description: '' }; hm.hidden = !!b.hidden; s.meta[b.slot] = hm; demoLog(hm.hidden ? 'picture-deleted' : 'picture-restored', b.slot); return ok({ ok: true }); }
    if (action === 'gallery-save') { s.galleries[b.page + ':' + b.id] = { order: b.order, added: b.added }; demoLog('gallery-saved', b.page + ' / ' + b.id); return ok({ ok: true }); }
    if (action === 'gallery-reset') { delete s.galleries[b.page + ':' + b.id]; return ok({ ok: true }); }
    if (action === 'blocks-save') { s.blocks = b.blocks; demoLog('extra-pictures-saved', b.blocks.length + ' extra picture(s)'); return ok({ ok: true }); }
    if (action === 'upload') {
      var key = decodeURIComponent((o.query || '').replace('slot=', ''));
      var prev = s.images[key], now2 = new Date().toISOString();
      s.images[key] = { url: URL.createObjectURL(o.raw), at: now2, history: prev ? [{ url: prev.url, by: s.users[0].name, at: prev.at }].concat(prev.history) : [] };
      demoLog('image-replaced', key); return ok({ ok: true });
    }
    if (action === 'image-reset') { delete s.images[b.slot]; demoLog('image-reset', b.slot); return ok({ ok: true }); }
    if (action === 'image-history') { var k2 = decodeURIComponent((o.query || '').replace('slot=', '')); var im2 = s.images[k2]; return ok({ history: im2 ? im2.history.map(function (h) { return { url: h.url, by: h.by, at: h.at }; }) : [] }); }
    if (action === 'image-restore') { var im3 = s.images[b.slot]; var pick = im3.history.splice(b.index, 1)[0]; im3.history.unshift({ url: im3.url, by: s.users[0].name, at: im3.at }); im3.url = pick.url; im3.at = new Date().toISOString(); demoLog('image-restored', b.slot); return ok({ ok: true }); }
    if (action === 'audit') return ok({ log: s.log });
    if (action === 'users') return ok({ users: s.users.map(pub) });
    if (action === 'user-create') { var tp = 'demo-' + Math.random().toString(36).slice(2, 6) + '-Xk7m2'; s.users.push({ id: 'u' + Date.now(), name: b.name, email: b.email, role: b.role, mustChange: true, created: new Date().toISOString() }); demoLog('user-created', b.name); return ok({ ok: true, tempPassword: tp }); }
    if (action === 'user-reset') return ok({ ok: true, tempPassword: 'demo-reset-Pq4n8' });
    if (action === 'user-role') { s.users.forEach(function (u) { if (u.id === b.id) u.role = b.role; }); return ok({ ok: true }); }
    if (action === 'user-remove') { s.users = s.users.filter(function (u) { return u.id !== b.id; }); demoLog('user-removed', ''); return ok({ ok: true }); }
    return bad('Not available in the demo');
    function pub(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, mustChange: u.mustChange, created: u.created, lastLogin: u.lastLogin }; }
  }

  boot();
})();
