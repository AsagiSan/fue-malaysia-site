// End-to-end test against the local dev server. Run: npm test  (starts its own server on :3111)
process.env.LOCAL_DEV = '1'; process.env.PORT = '3111';
const { spawn } = require('child_process');
const srv = spawn('node', ['dev-server.js'], { env: process.env, stdio: 'ignore' });
const B = 'http://localhost:3111'; let cookie = '', fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function call(action, body, opt = {}) {
  const h = { 'X-Requested-With': 'fue-admin', Cookie: opt.cookie !== undefined ? opt.cookie : cookie };
  let init = { method: 'GET', headers: h };
  if (body !== undefined || opt.raw) { init.method = 'POST'; if (opt.raw) { init.body = opt.raw; h['Content-Type'] = 'image/webp'; } else { init.body = JSON.stringify(body); h['Content-Type'] = 'application/json'; } }
  if (opt.noHeader) delete h['X-Requested-With'];
  const r = await fetch(B + '/api/admin/' + action + (opt.q ? '?' + opt.q : ''), init);
  const sc = r.headers.get('set-cookie'); if (sc && opt.keep !== false) cookie = sc.split(';')[0];
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
(async () => {
  await new Promise((r) => setTimeout(r, 900));
  let r = await call('me'); ok(r.j.needsSetup === true && !r.j.user, 'fresh install asks for setup');
  r = await call('state'); ok(r.s === 401 || r.s === 503 || r.s === 404 || r.s === 405 || r.s >= 400, 'state blocked when not signed in');
  r = await call('setup', { token: 'wrong', name: 'A', email: 'a@x.com', password: 'abcdefghij1' }); ok(r.s === 403, 'setup rejects wrong code');
  r = await call('setup', { token: 'dev-setup', name: 'Owner One', email: 'owner@x.com', password: 'weak' }); ok(r.s === 400, 'setup rejects weak password');
  r = await call('setup', { token: 'dev-setup', name: 'Owner One', email: 'owner@x.com', password: 'correct-horse-9' }); ok(r.s === 200 && cookie, 'owner created + signed in');
  r = await call('setup', { token: 'dev-setup', name: 'X', email: 'y@x.com', password: 'correct-horse-9' }, { cookie: '' }); ok(r.s === 403, 'setup cannot be run twice');
  r = await call('state'); ok(r.s === 200 && r.j.slots.length > 50 && r.j.pages.index, 'state returns ' + (r.j.slots || []).length + ' slots');
  const slot = r.j.slots.find((s) => s.key === 'images/about.webp') || r.j.slots[0];
  const pg = '/' + (slot.pages.includes('about-us') ? 'about-us' : slot.pages[0]) + '.html';
  r = await call('content', { pages: { index: { title: 'New Home Title | FUE', description: 'New description here', canonical: 'https://www.fuemalaysia.com/', ogTitle: 'OG t', ogDescription: 'OG d', ogImage: 'images/banner.webp', robots: '', schema: '{"@context":"https://schema.org","@type":"MedicalClinic","name":"Test Clinic"}' } }, tracking: { head: '<meta name="google-site-verification" content="ABC123" />', body: '<noscript>GTM-BODY</noscript>' } });
  ok(r.s === 200, 'content saved');
  r = await call('content', { pages: { index: { schema: '{bad json' } } }); ok(r.s === 400, 'bad schema JSON rejected');
  r = await call('content', { pages: { index: { canonical: 'javascript:alert(1)' } } }); ok(r.s === 400, 'bad canonical rejected');
  r = await call('content', {}, { noHeader: true }); ok(r.s === 403, 'POST without CSRF header blocked');
  let html = await (await fetch(B + '/')).text();
  ok(html.includes('<title>New Home Title | FUE</title>'), 'public page shows new meta title');
  ok(html.includes('content="New description here"'), 'public page shows new description');
  ok(html.includes('google-site-verification" content="ABC123"') && html.includes('GTM-BODY'), 'tracking code injected (head + body)');
  ok(html.includes('Test Clinic') && (html.match(/application\/ld\+json/g) || []).length === 1, 'schema replaced (single JSON-LD block)');
  ok(!html.includes('FUE Malaysia Redesign'), 'no leftover placeholder title');
  const about = await (await fetch(B + '/about-us.html')).text(); ok(about.includes('ABC123') && about.includes('About Us'), 'other pages get tracking, keep own title');
  // image upload
  const png = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
  r = await call('upload', undefined, { raw: Buffer.from('not an image'), q: 'slot=' + encodeURIComponent(slot.key) }); ok(r.s === 400, 'non-image upload rejected');
  r = await call('upload', undefined, { raw: png, q: 'slot=' + encodeURIComponent('images/../../etc/passwd') }); ok(r.s === 400, 'unknown slot rejected');
  r = await call('upload', undefined, { raw: png, q: 'slot=' + encodeURIComponent(slot.key) }); ok(r.s === 200 && r.j.url, 'image uploaded -> ' + r.j.url);
  const url1 = r.j.url;
  html = await (await fetch(B + pg)).text(); ok(html.includes(url1) && !new RegExp('(?<![\\w./-])' + slot.key.replace('.', '\\.') + '(?![\\w.-])').test(html), 'public page now uses the new picture');
  const up = await fetch(B + url1); ok(up.status === 200, 'uploaded file is served');
  r = await call('upload', undefined, { raw: png, q: 'slot=' + encodeURIComponent(slot.key) }); const url2 = r.j.url;
  r = await call('image-history', undefined, { q: 'slot=' + encodeURIComponent(slot.key) }); ok(r.j.history.length === 1 && r.j.history[0].url === url1, 'history keeps previous version');
  r = await call('image-restore', { slot: slot.key, index: 0 }); html = await (await fetch(B + pg)).text(); ok(r.s === 200 && html.includes(url1), 'restore works');
  r = await call('image-reset', { slot: slot.key }); html = await (await fetch(B + pg)).text(); ok(r.s === 200 && !html.includes(url1) && html.includes(slot.key), 'reset brings the original back');

  // ---- galleries & extra pictures ----
  r = await call('state'); const gs = r.j.galleries; const pairs = gs.find((g) => g.id === 'pairs');
  ok(gs.length === 7 && pairs.items.length === 8 && pairs.tplImages === 2, 'state lists 7 galleries (pairs has 8 items, 2 pictures each)');
  ok(Object.keys(r.j.sections).length === 8 && r.j.sections.index.length > 5, 'state lists page sections');
  r = await call('upload', undefined, { raw: png, q: 'free=1' }); ok(r.s === 200 && r.j.url, 'free upload returns an address'); const fu = r.j.url;
  const order = pairs.items.map((i) => i.id).filter((id) => id !== 'o1').concat(['nabc1']);
  const addedItem = { nabc1: { images: [{ src: fu, alt: 'A <b>before</b>' }, { src: fu, alt: 'After' }], texts: ['Case 99', 'Before · After'] } };
  r = await call('gallery-save', { page: 'fue-results', id: 'pairs', order, added: addedItem }); ok(r.s === 200, 'gallery saved');
  r = await call('gallery-save', { page: 'fue-results', id: 'pairs', order, added: { nabc1: { images: [{ src: 'https://evil.example/x.png', alt: '' }, { src: fu, alt: '' }], texts: [] } } }); ok(r.s === 400, 'foreign picture address rejected');
  r = await call('gallery-save', { page: 'fue-results', id: 'pairs', order, added: { nabc1: { images: [{ src: fu, alt: '' }], texts: [] } } }); ok(r.s === 400, 'wrong number of pictures rejected');
  r = await call('gallery-save', { page: 'fue-results', id: 'pairs', order: [], added: {} }); ok(r.s === 400, 'empty gallery rejected');
  r = await call('gallery-save', { page: 'fue-results', id: 'nope', order: ['o0'], added: {} }); ok(r.s === 400, 'unknown gallery rejected');
  html = await (await fetch(B + '/fue-results.html')).text();
  ok((html.match(/class="diptych/g) || []).length === 8, 'public results page: 7 originals + 1 new = 8 pairs');
  ok(html.includes('Case 99') && html.includes(fu) && html.includes('alt="A &lt;b&gt;before&lt;/b&gt;"'), 'new pair shown, text escaped');
  r = await call('gallery-save', { page: 'fue-results', id: 'donor-progress', order: ['o0', 'o1', 'o2'], added: {} });
  html = await (await fetch(B + '/fue-results.html')).text();
  ok(/data-gallery="donor-progress"[^>]*style="--n:3"/.test(html), 'progress row column count follows item count');
  r = await call('gallery-reset', { page: 'fue-results', id: 'donor-progress' }); r = await call('gallery-reset', { page: 'fue-results', id: 'pairs' });
  html = await (await fetch(B + '/fue-results.html')).text(); ok((html.match(/class="diptych/g) || []).length === 8 && !html.includes('Case 99') && /--n:6/.test(html), 'galleries reset to original');
  r = await call('state'); const secKey = r.j.sections.contact[2].key;
  r = await call('blocks-save', { blocks: [{ id: 'blk1', page: 'contact', after: secKey, image: fu, alt: 'Reception desk', caption: 'Our <reception>', size: 'medium' }, { id: 'blk2', page: 'about-us', after: '@end', image: 'images/banner.webp', alt: 'x', size: 'wide' }] }); ok(r.s === 200, 'extra pictures saved');
  r = await call('blocks-save', { blocks: [{ page: 'contact', after: 'nonexistent', image: fu }] }); ok(r.s === 400, 'unknown place rejected');
  r = await call('blocks-save', { blocks: [{ page: 'contact', after: '@end', image: 'javascript:alert(1)' }] }); ok(r.s === 400, 'unsafe picture address rejected');
  html = await (await fetch(B + '/contact.html')).text();
  ok(html.includes('data-fue-block="blk1"') && html.includes('Reception desk') && html.includes('Our &lt;reception&gt;') && html.includes('class="fue-block s-medium"'), 'extra picture appears on the contact page');
  ok(html.indexOf('data-fue-block="blk1"') > html.indexOf('<section') && html.indexOf('data-fue-block="blk1"') < html.indexOf('<footer'), 'extra picture sits between sections, above the footer');
  const ab = await (await fetch(B + '/about-us.html')).text(); ok(ab.indexOf('data-fue-block="blk2"') < ab.indexOf('<footer') && ab.indexOf('data-fue-block="blk2"') > ab.indexOf('id="cta"'), 'end-of-page picture sits above the footer');
  r = await call('blocks-save', { blocks: [] }); html = await (await fetch(B + '/contact.html')).text(); ok(!html.includes('data-fue-block'), 'extra pictures removed');

  // ---- picture details ----
  r = await call('state'); const aboutSlot = r.j.slots.find((x) => x.key === 'images/about-01.webp'); ok(aboutSlot && aboutSlot.alt, 'slots carry their current alt text');
  r = await call('image-meta', { slot: 'images/about-01.webp', alt: 'Doctor "marking" the scalp', title: 'Treatment room', caption: 'Cap', description: 'Consent on file' }); ok(r.s === 200, 'picture details saved');
  html = await (await fetch(B + '/about-us.html')).text();
  ok(/<img[^>]*src="images\/about-01\.webp"[^>]*alt="Doctor &quot;marking&quot; the scalp"/.test(html) || /<img[^>]*alt="Doctor &quot;marking&quot; the scalp"[^>]*about-01/.test(html), 'new alt text appears on the page (escaped)');
  ok(/title="Treatment room"/.test(html), 'title attribute appears on the page');
  r = await call('image-meta', { slot: 'images/nope.webp', alt: 'x' }); ok(r.s === 400, 'unknown picture rejected');
  r = await call('image-hide', { slot: 'images/about-01.webp', hidden: true }); ok(r.s === 200, 'picture deleted from website');
  html = await (await fetch(B + '/about-us.html')).text();
  ok(/<img[^>]*hidden[^>]*about-01|<img[^>]*about-01[^>]*hidden/.test(html) && html.includes('display:none!important'), 'deleted picture is hidden on the page');
  r = await call('state'); ok(r.j.slots.find((x) => x.key === 'images/about-01.webp').meta.hidden === true && r.j.slots.find((x) => x.key === 'images/about-01.webp').meta.alt.startsWith('Doctor'), 'state reports hidden + keeps details');
  r = await call('image-meta', { slot: 'images/about-01.webp', alt: 'Doctor again', title: '', caption: '', description: '' }); r = await call('state'); ok(r.j.slots.find((x) => x.key === 'images/about-01.webp').meta.hidden === true, 'saving details does not un-delete');
  r = await call('image-hide', { slot: 'images/about-01.webp', hidden: false }); html = await (await fetch(B + '/about-us.html')).text(); ok(!/<img[^>]*about-01[^>]*hidden/.test(html) && /alt="Doctor again"/.test(html), 'picture restored to the website');
  r = await call('image-meta', { slot: 'images/about-01.webp', alt: '', title: '', caption: '', description: '' });
  // team
  r = await call('user-create', { name: 'Dr Inder', email: 'inder@x.com', role: 'owner' }); ok(r.s === 200 && r.j.tempPassword, 'owner creates login');
  const tmp = r.j.tempPassword;
  r = await call('user-create', { name: 'Assistant', email: 'asst@x.com', role: 'admin' }); const tmp2 = r.j.tempPassword; ok(r.s === 200, 'second login created');
  const ownerCookie = cookie;
  r = await call('login', { email: 'asst@x.com', password: 'wrong-pass-1' }, { cookie: '' }); ok(r.s === 401, 'wrong password refused');
  r = await call('login', { email: 'asst@x.com', password: tmp2 }, { cookie: '' }); ok(r.s === 200 && r.j.user.mustChange, 'assistant signs in with temp password');
  r = await call('state'); ok(r.s === 403, 'temp-password user is blocked until they change it');
  r = await call('password', { current: tmp2, next: 'my-own-pass-77' }); ok(r.s === 200, 'assistant sets own password');
  r = await call('state'); ok(r.s === 200 && r.j.user.role === 'admin', 'assistant can now use the panel');
  r = await call('content', { tracking: { head: '<meta name="x" content="by-assistant">', body: '' } }); ok(r.s === 200, 'assistant (admin) can edit tracking codes');
  r = await call('user-create', { name: 'Hacker', email: 'h@x.com', role: 'owner' }); ok(r.s === 403, 'assistant cannot create logins');
  r = await call('user-remove', { id: 'x' }); ok(r.s === 403, 'assistant cannot remove logins');
  r = await call('audit'); ok(r.j.log.length > 5, 'activity log has ' + r.j.log.length + ' entries');
  cookie = ownerCookie;
  r = await call('users'); const asst = r.j.users.find((u) => u.email === 'asst@x.com'); const me = r.j.users.find((u) => u.email === 'owner@x.com');
  r = await call('user-remove', { id: me.id }); ok(r.s === 400, 'cannot remove yourself');
  r = await call('user-reset', { id: asst.id }); ok(r.s === 200, 'owner resets a password');
  r = await call('user-remove', { id: asst.id }); ok(r.s === 200, 'owner removes a login');
  r = await call('login', { email: 'asst@x.com', password: 'my-own-pass-77' }, { cookie: '' }); ok(r.s === 401, 'removed user cannot sign in');
  r = await call('logout', {}); ok(r.s === 200, 'logout');
  r = await call('state', undefined, { cookie: '' }); ok(r.s === 401, 'no cookie = no access');
  for (let i = 0; i < 9; i++) r = await call('login', { email: 'owner@x.com', password: 'nope-nope-1' }, { cookie: '' });
  ok(r.s === 429, 'brute-force login is rate limited');
  for (const p of ['/how-it-is-done', '/fue-results.html', '/privacy.html', '/terms', '/contact']) { const x = await fetch(B + p); ok(x.status === 200, p + ' renders'); }
  ok((await fetch(B + '/admin')).status === 200 && (await fetch(B + '/images/about.webp')).status === 200, 'admin page and static images are served');
  srv.kill(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); srv.kill(); process.exit(1); });
