'use strict';
/** Image storage. Production: Vercel Blob (BLOB_READ_WRITE_TOKEN is added automatically when you
 *  create a Blob store in the Vercel dashboard). Local testing: files in .devdata/uploads. */
const fs = require('fs');
const path = require('path');

function mode() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.LOCAL_DEV === '1') return 'local';
  return 'none';
}

async function putImage(buf, contentType, ext) {
  const m = mode();
  const name = 'fue-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
  if (m === 'blob') {
    const { put } = require('@vercel/blob');
    const r = await put('site-images/' + name, buf, { access: 'public', contentType, addRandomSuffix: true });
    return r.url;
  }
  if (m === 'local') {
    const dir = path.join(process.cwd(), '.devdata', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buf);
    return '/__uploads/' + name;
  }
  throw new Error('Image storage (Vercel Blob) is not connected');
}

module.exports = { mode, putImage };
