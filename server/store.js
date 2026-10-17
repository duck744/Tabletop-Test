'use strict';
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.TABLETOP_DATA || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ASSET_DIR = path.join(DATA_DIR, 'assets');
fs.mkdirSync(ASSET_DIR, { recursive: true });

let db = { campaigns: {}, sessions: {} };
try { db = { campaigns: {}, sessions: {}, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch (e) { /* first run */ }
let timer = null;
function flush() {
  try { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); } catch (e) { console.error('save failed', e.message); }
}
function save() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 400);
  timer.unref();
}
process.on('exit', () => { if (timer) flush(); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { flush(); process.exit(0); });
module.exports = { db, save, flush, ASSET_DIR, DATA_DIR };
