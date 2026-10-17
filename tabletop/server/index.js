'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { attach, keepalive } = require('./ws');
const { db, save, ASSET_DIR } = require('./store');
const G = require('./game');
const E = require('./engine');
const rules = require('./rules');
const { fail, GameError } = G;

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const conns = new Set();
const rooms = new Map(); // campaignId -> Set<Conn>
const uploadCount = new Map();

// ------------------------------------------------------------------ HTTP
function sniff(buf) {
  if (buf.length > 12 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf.slice(0, 4).toString() === 'GIF8') return '.gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}
function sessionOf(token) { return token && db.sessions[token] ? db.sessions[token] : null; }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/upload') {
    const sess = sessionOf(url.searchParams.get('token')); const kind = url.searchParams.get('kind');
    const ip = req.socket.remoteAddress; const n = (uploadCount.get(ip) || 0) + 1; uploadCount.set(ip, n);
    const limit = kind === 'map' ? 14 * 1024 * 1024 : 2 * 1024 * 1024;
    if (n > 200 || (kind === 'map' && !(sess && sess.role === 'dm'))) { res.writeHead(403); return res.end('{"error":"Not allowed"}'); }
    const chunks = []; let size = 0; let dead = false;
    req.on('data', (d) => { size += d.length; if (size > limit) { dead = true; res.writeHead(413); res.end('{"error":"File too large"}'); req.destroy(); } else chunks.push(d); });
    req.on('end', () => {
      if (dead) return; const buf = Buffer.concat(chunks); const ext = sniff(buf);
      if (!ext) { res.writeHead(415); return res.end('{"error":"Only PNG, JPEG, GIF or WebP images."}'); }
      const name = crypto.randomBytes(10).toString('hex') + ext;
      fs.writeFileSync(path.join(ASSET_DIR, name), buf);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ url: '/assets/' + name }));
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let file;
  if (url.pathname === '/engine.js') file = path.join(__dirname, 'engine.js');
  else if (url.pathname.startsWith('/assets/')) file = path.join(ASSET_DIR, path.basename(url.pathname));
  else { const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, '')); if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); } }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
setInterval(() => uploadCount.clear(), 3600 * 1000).unref();

// ------------------------------------------------------------------ helpers
const campaignOf = (id) => { const c = db.campaigns[id]; if (!c) fail('That campaign no longer exists.'); return c; };
function ctx(ws) {
  const s = ws.data.session; if (!s) fail('Please log in first.');
  const c = db.campaigns[s.cid]; if (!c) fail('That campaign no longer exists.');
  return { c, who: { role: s.role, charId: s.charId || null, token: s.token }, s };
}
const dmOnly = (who) => { if (who.role !== 'dm') fail('Only the DM can do that.'); };
function onlineList(c) {
  const out = []; for (const w of rooms.get(c.id) || []) { const s = w.data.session; if (!s) continue; const e = s.charId ? c.entities[s.charId] : null; out.push({ role: s.role, name: s.role === 'dm' ? 'DM' : e ? e.name : '?', eid: s.charId || null }); }
  return out;
}
function sendState(ws, c, withLogs) {
  const s = ws.data.session; if (!s) return;
  const snap = G.snapshotFor(c, { role: s.role, charId: s.charId }, onlineList(c));
  if (!withLogs) delete snap.logs;
  ws.send({ t: 'state', s: snap, full: !!withLogs });
}
const pending = new Map();
function bcast(c) {
  if (pending.has(c.id)) return;
  pending.set(c.id, setTimeout(() => { pending.delete(c.id); for (const w of rooms.get(c.id) || []) sendState(w, c, false); }, 25));
  save();
}
function emit(c, msg) { for (const w of rooms.get(c.id) || []) w.send(msg); }
function sendLogs(c, logs) {
  for (const { kind, entry } of logs || []) for (const w of rooms.get(c.id) || []) {
    const s = w.data.session; if (!s) continue; if (entry.hidden && s.role !== 'dm') continue;
    w.send({ t: 'log', kind, entry });
  }
}
function joinRoom(ws, session) {
  leaveRoom(ws); ws.data.session = session;
  if (!rooms.has(session.cid)) rooms.set(session.cid, new Set()); rooms.get(session.cid).add(ws);
  const c = db.campaigns[session.cid]; sendState(ws, c, true); bcast(c);
}
function leaveRoom(ws) {
  const s = ws.data.session; if (!s) return; const set = rooms.get(s.cid); if (set) set.delete(ws); ws.data.session = null;
  const c = db.campaigns[s.cid]; if (c) bcast(c);
}
function makeSession(cid, role, charId) { const token = crypto.randomBytes(24).toString('hex'); const s = { cid, role, charId: charId || null, token, at: Date.now() }; db.sessions[token] = s; return s; }
function done(c, r) { if (r && r.logs) sendLogs(c, r.logs); if (!r || r.changed !== false) bcast(c); else save(); return r; }
function limitSize(o, n) { if (JSON.stringify(o || {}).length > n) fail('That is too large.'); }

// ------------------------------------------------------------------ message handlers: lobby
const lobby = {
  list: () => ({ campaigns: Object.values(db.campaigns).sort((a, b) => b.created - a.created).map(G.campaignSummary) }),
  presets: () => ({ presets: rules.listPresets() }),
  campaignRuleset: (ws, m) => { const c = campaignOf(m.campaignId); return { ruleset: { ...c.rs, npcs: [] }, name: c.name }; },
  preset: (ws, m) => { const p = rules.getPreset(m.id); if (!p) fail('Unknown preset.'); return { ruleset: p }; },
  campaignRuleset: (ws, m) => { const c = campaignOf(m.campaignId); return { ruleset: { ...c.rs, npcs: [] } }; },
  validateRuleset: (ws, m) => { limitSize(m.ruleset, 2e6); return { errors: G.validateRuleset(rules.normalizeRuleset(m.ruleset)) }; },
  createCampaign: (ws, m) => {
    let rs = m.ruleset ? m.ruleset : rules.getPreset(m.rulesetId || 'dnd5e'); if (!rs) fail('Unknown ruleset.');
    limitSize(rs, 2e6); rs = rules.normalizeRuleset(rs);
    const errs = G.validateRuleset(rs); if (errs.length) fail('Ruleset has formula errors:\n' + errs.slice(0, 5).join('\n'));
    if (!rs.abilities.length && !rs.resources.length) fail('A ruleset needs at least one attribute or resource.');
    const c = G.newCampaign({ name: m.name, rs, dmPassword: m.dmPassword && String(m.dmPassword).length >= 3 ? m.dmPassword : 'dm123' });
    db.campaigns[c.id] = c; save();
    return { campaign: G.campaignSummary(c) };
  },
  deleteCampaign: (ws, m) => { const c = campaignOf(m.campaignId); if (!G.checkPw(c.dm, m.password)) fail('Wrong DM password.'); delete db.campaigns[c.id]; for (const t of Object.keys(db.sessions)) if (db.sessions[t].cid === c.id) delete db.sessions[t]; for (const w of rooms.get(c.id) || []) { w.send({ t: 'kicked' }); w.data.session = null; } rooms.delete(c.id); save(); return {}; },
  login: (ws, m) => {
    const c = campaignOf(m.campaignId); ws.data.fails = ws.data.fails || 0;
    if (ws.data.fails > 10) { ws.close(1008); fail('Too many attempts.'); }
    let s;
    if (m.role === 'dm') { if (!G.checkPw(c.dm, m.password)) { ws.data.fails++; fail('Wrong DM password.'); } s = makeSession(c.id, 'dm', null); }
    else { const e = c.entities[m.characterId]; if (!e || e.kind !== 'pc') fail('Unknown character.'); if (!G.checkPw(e.pw, m.password)) { ws.data.fails++; fail('Wrong password for ' + e.name + '.'); } s = makeSession(c.id, 'player', e.id); }
    joinRoom(ws, s); return { token: s.token, role: s.role, charId: s.charId };
  },
  createCharacter: (ws, m) => {
    const c = campaignOf(m.campaignId); limitSize(m.character, 200000);
    const e = G.createCharacterEntity(c, m.character || {});
    const s = makeSession(c.id, 'player', e.id); joinRoom(ws, s);
    G.pushLog(c, 'actions', { kind2: 'info', who: 'System', text: `${e.name} joins the adventure.` });
    return { token: s.token, role: 'player', charId: e.id };
  },
  resume: (ws, m) => { const s = sessionOf(m.token); if (!s || !db.campaigns[s.cid]) fail('Session expired.'); if (s.role === 'player' && !db.campaigns[s.cid].entities[s.charId]) fail('That character no longer exists.'); joinRoom(ws, s); return { token: s.token, role: s.role, charId: s.charId, campaignId: s.cid }; },
  leave: (ws) => { leaveRoom(ws); return {}; },
};

// ------------------------------------------------------------------ message handlers: in a campaign
const SHAPES = new Set(['pen', 'line', 'circle', 'rect', 'cone', 'text', 'pin', 'marker']);
const num = (v, lo = -1e6, hi = 1e6) => Math.max(lo, Math.min(hi, Number(v) || 0));
const game = {
  roll: (ws, m) => { const { c, who } = ctx(ws); return done(c, G.rollCheck(c, who, m)); },
  action: (ws, m) => { const { c, who } = ctx(ws); return done(c, G.useAction(c, who, m)); },
  item: (ws, m) => { const { c, who } = ctx(ws); return done(c, G.useItem(c, who, m)); },
  dice: (ws, m) => { const { c, who } = ctx(ws); return done(c, G.diceRoll(c, who, m)); },
  combat: (ws, m) => {
    const { c, who } = ctx(ws);
    if (who.role !== 'dm') {
      const cur = c.combat.order[c.combat.turn]; const e = cur && c.entities[cur.eid];
      if (!(m.op === 'next' && e && G.canControl(c, who, e))) fail('Only the DM controls combat. (You can end your own turn when it is yours.)');
    }
    const r = G.combatOp(c, m.op, m);
    if (r.anim) emit(c, { t: 'initAnim', rolls: r.anim });
    return done(c, r);
  },
  tokenMove: (ws, m) => {
    const { c, who } = ctx(ws); const t = c.tokens[m.id]; if (!t) fail('Unknown token.');
    const e = c.entities[t.eid]; if (!e || !G.canControl(c, who, e)) fail('You can only move your own character.');
    if (who.role !== 'dm' && c.combat.active) for (const st of e.status || []) { const d = E.statusDef(c.rs, st.key); if (d && d.blocks && d.blocks.includes('move')) fail(`${e.name} can't move while ${d.name}.`); }
    let x = num(m.x, 0, c.scene.w), y = num(m.y, 0, c.scene.h);
    if (c.scene.snap && c.scene.grid && !m.free) { const g = c.scene.cell; x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
    t.x = x; t.y = y;
    for (const w of rooms.get(c.id) || []) { const s = w.data.session; if (t.hidden && s.role !== 'dm') continue; w.send({ t: 'tokenMoved', id: t.id, x, y, by: ws.data.id }); }
    save(); return { moved: true };
  },
  tokenSet: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const t = c.tokens[m.id]; if (!t) fail('Unknown token.'); const p = m.patch || {};
    if ('hidden' in p) t.hidden = !!p.hidden; if ('size' in p) t.size = Math.max(0.5, Math.min(8, Number(p.size) || 1)); if ('inCombat' in p) { if (p.inCombat) G.combatOp(c, 'add', { eid: t.eid }); else G.combatOp(c, 'remove', { eid: t.eid }); }
    return done(c, { changed: true });
  },
  tokenAdd: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e) fail('Unknown character.'); if (e.kind === 'npc') fail('Spawn library creatures instead.'); if (Object.values(c.tokens).some((t) => t.eid === e.id)) fail(`${e.name} is already on the map.`); const g = c.scene.cell; G.placeToken(c, e, m.x != null ? Math.round(num(m.x, 0, c.scene.w) / g) * g : undefined, m.y != null ? Math.round(num(m.y, 0, c.scene.h) / g) * g : undefined); return done(c, { changed: true }); },
  tokenRemove: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const t = c.tokens[m.id]; if (!t) fail('Unknown token.'); const e = c.entities[t.eid];
    G.combatOp(c, 'remove', { eid: t.eid }); delete c.tokens[t.id];
    if (e && e.kind === 'inst' && m.destroy !== false && !Object.values(c.tokens).some((x) => x.eid === e.id)) delete c.entities[e.id];
    return done(c, { changed: true });
  },
  spawn: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const tpl = c.entities[m.npcId]; if (!tpl || tpl.kind !== 'npc') fail('Unknown library creature.');
    const count = G.clampInt(m.count, 1, 20, 1); const g = c.scene.cell;
    for (let i = 0; i < count; i++) {
      const same = Object.values(c.entities).filter((e) => e.kind === 'inst' && e.name.replace(/ \d+$/, '') === tpl.name).length;
      const copy = JSON.parse(JSON.stringify(tpl)); delete copy.id; copy.name = count > 1 || same ? `${tpl.name} ${same + 1}` : tpl.name; copy.res = {}; copy.status = [];
      if (m.owner) copy.owner = m.owner;
      const inst = G.makeEntity(c, 'inst', copy); inst.templateKey = tpl.templateKey || tpl.id;
      const bx = m.x != null ? Math.round(num(m.x, 0, c.scene.w) / g) * g : Math.round(c.scene.w / 2 / g) * g, by = m.y != null ? Math.round(num(m.y, 0, c.scene.h) / g) * g : Math.round(c.scene.h / 3 / g) * g;
      const t = G.placeToken(c, inst, bx + (i % 5) * g, by + Math.floor(i / 5) * g); t.hidden = !!m.hidden; t.size = tpl.size || 1;
      if (c.combat.active) G.combatOp(c, 'add', { eid: inst.id, hidden: true });
    }
    return done(c, { changed: true });
  },
  entityEdit: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e) fail('Unknown creature.'); limitSize(m.patch, 300000); G.patchEntity(e, m.patch || {}); return done(c, { changed: true }); },
  npcCreate: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); limitSize(m.data, 300000); const e = G.makeEntity(c, 'npc', { ...(m.data || {}), id: undefined, name: (m.data && m.data.name) || 'New Creature' }); return done(c, { changed: true, id: e.id }); },
  npcDelete: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e || e.kind !== 'npc') fail('Not a library creature.'); delete c.entities[e.id]; return done(c, { changed: true }); },
  npcDuplicate: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e) fail('Unknown creature.'); const d = JSON.parse(JSON.stringify(e)); delete d.id; d.name = e.name + ' (copy)'; d.res = {}; d.status = []; const n = G.makeEntity(c, 'npc', d); return done(c, { changed: true, id: n.id }); },
  give: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e) fail('Unknown creature.');
    const logs = [];
    if (m.ref || m.item) {
      const def = m.ref ? E.findItem(c.rs, m.ref) : null; if (m.ref && !def) fail('Unknown item.');
      const item = G.prepItem(m.ref ? { ref: m.ref, qty: m.qty || 1 } : { ...m.item, qty: m.qty || 1 });
      const ex = m.ref && e.inventory.find((i) => i.ref === m.ref && !i.name); if (ex) ex.qty += item.qty; else e.inventory.push(item);
      logs.push(G.pushLog(c, 'custom', { kind2: 'gift', who: 'DM', eid: e.id, text: `DM gives ${e.name} ${item.qty}× ${(def || item).name}.`, hidden: !!m.hidden }));
    }
    if (m.currency) { for (const [k, v] of Object.entries(m.currency)) { e.currency[k] = Math.max(0, (Number(e.currency[k]) || 0) + (Number(v) || 0)); } logs.push(G.pushLog(c, 'custom', { kind2: 'gift', who: 'DM', eid: e.id, text: `DM gives ${e.name} ${Object.entries(m.currency).map(([k, v]) => v + ' ' + k.toUpperCase()).join(', ')}.`, hidden: !!m.hidden })); }
    return done(c, { changed: true, logs });
  },
  adjust: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e) fail('Unknown creature.');
    const comp = E.compute(c.rs, e); const r = comp.resources[m.res]; if (!r) fail('Unknown resource.'); const logs = [];
    if (m.set != null) { e.res[m.res] = Math.max(0, Math.min(r.max, Math.floor(Number(m.set) || 0))); logs.push(G.pushLog(c, 'actions', { kind2: 'info', who: 'DM', eid: e.id, text: `${e.name}'s ${m.res.toUpperCase()} set to ${e.res[m.res]}.`, hidden: !!m.hidden })); }
    else { const d = Math.floor(Number(m.delta) || 0); const x = G.applyDelta(c, e, m.res, d); if (x) logs.push(G.pushLog(c, 'actions', { kind2: d < 0 ? 'damage' : 'heal', who: 'DM', eid: e.id, amount: d, text: `${e.name} ${d < 0 ? 'takes ' + -d + ' damage' : 'recovers ' + d}${x.down ? ' and is down!' : '.'}`, hidden: !!m.hidden })); }
    return done(c, { changed: true, logs });
  },
  status: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e) fail('Unknown creature.'); const logs = [];
    if (m.op === 'remove') { if (G.removeStatus(e, m.key)) logs.push(G.pushLog(c, 'actions', { kind2: 'status', who: 'DM', eid: e.id, text: `${e.name} is no longer ${(E.statusDef(c.rs, m.key) || { name: m.key }).name}.`, hidden: !!m.hidden })); }
    else { const d = G.applyStatus(c, e, m.key, m.turns, 'DM'); logs.push(G.pushLog(c, 'actions', { kind2: 'status', who: 'DM', eid: e.id, text: `${e.name} is now ${d.name}${m.turns ? ' for ' + m.turns + ' turns' : ''}.`, hidden: !!m.hidden })); }
    return done(c, { changed: true, logs });
  },
  rest: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const list = m.eid ? [c.entities[m.eid]].filter(Boolean) : Object.values(c.entities).filter((e) => e.kind === 'pc'); const logs = [];
    for (const e of list) {
      if (m.type === 'long') { e.res = {}; e.status = (e.status || []).filter((s) => { const d = E.statusDef(c.rs, s.key); return !(d && d.tags && d.tags.includes('buff')); }); }
      else for (const r of c.rs.resources) if (r.rest === 'short') delete e.res[r.key];
    }
    logs.push(G.pushLog(c, 'actions', { kind2: 'info', who: 'DM', text: `${list.length > 1 || !m.eid ? 'The party takes' : list[0].name + ' takes'} a ${m.type} rest.` }));
    return done(c, { changed: true, logs });
  },
  notes: (ws, m) => {
    const { c, who } = ctx(ws); const html = G.str(m.html, 200000);
    if (m.eid === 'session') { dmOnly(who); c.sessionNotes = html; } else { const e = c.entities[m.eid]; if (!e || !G.canControl(c, who, e)) fail('You cannot edit those notes.'); e.notes = html; }
    save(); if (m.eid === 'session') bcast(c); else for (const w of rooms.get(c.id) || []) if (w.data.session.role === 'dm' && w !== ws) w.send({ t: 'notesChanged', eid: m.eid, html }); return {};
  },
  sceneSet: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); const p = m.patch || {}; const s = c.scene;
    if ('mapUrl' in p) s.mapUrl = p.mapUrl && /^\/assets\/[a-f0-9]+\.(png|jpg|gif|webp)$/.test(p.mapUrl) ? p.mapUrl : null;
    if ('w' in p) s.w = G.clampInt(p.w, 200, 20000, s.w); if ('h' in p) s.h = G.clampInt(p.h, 200, 20000, s.h); if ('cell' in p) s.cell = G.clampInt(p.cell, 10, 400, s.cell);
    if ('grid' in p) s.grid = !!p.grid; if ('snap' in p) s.snap = !!p.snap; if ('bg' in p && /^#[0-9a-f]{3,8}$/i.test(p.bg)) s.bg = p.bg;
    return done(c, { changed: true });
  },
  drawAdd: (ws, m) => {
    const { c, who } = ctx(ws); const sh = m.shape || {}; if (!SHAPES.has(sh.kind)) fail('Unknown shape.'); if (c.drawings.length > 3000) fail('The map is full of drawings; ask the DM to clear some.');
    const e = who.charId ? c.entities[who.charId] : null;
    const d = { id: G.uid('d_'), kind: sh.kind, color: /^#[0-9a-f]{3,8}$/i.test(sh.color || '') ? sh.color : '#ffffff', width: num(sh.width || 3, 1, 30), by: who.role === 'dm' ? 'DM' : e ? e.name : 'Player', byRole: who.role, byEid: who.charId };
    if (sh.kind === 'pen') d.points = (sh.points || []).slice(0, 2000).map((p) => [num(p[0], -1e4, 3e4), num(p[1], -1e4, 3e4)]);
    else { for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'w', 'h', 'r', 'angle', 'dir', 'size']) if (sh[k] != null) d[k] = num(sh[k], -1e5, 1e5); if (sh.text != null) d.text = G.str(sh.text, 300); if (sh.label != null) d.label = G.str(sh.label, 80); if (sh.icon != null) d.icon = G.str(sh.icon, 8); if (sh.fill) d.fill = true; }
    c.drawings.push(d); emit(c, { t: 'drawAdded', d }); save(); return { id: d.id };
  },
  drawRemove: (ws, m) => { const { c, who } = ctx(ws); const d = c.drawings.find((x) => x.id === m.id); if (!d) return {}; if (who.role !== 'dm' && d.byEid !== who.charId) fail('You can only erase your own drawings.'); c.drawings = c.drawings.filter((x) => x.id !== m.id); emit(c, { t: 'drawRemoved', id: m.id }); save(); return {}; },
  drawClear: (ws, m) => { const { c, who } = ctx(ws); if (m.scope === 'all') { dmOnly(who); c.drawings = []; } else c.drawings = c.drawings.filter((d) => who.role === 'dm' ? d.byRole !== 'dm' : d.byEid !== who.charId); emit(c, { t: 'drawingsReset', drawings: c.drawings }); save(); return {}; },
  ping: (ws, m) => { const { c, who } = ctx(ws); const e = who.charId ? c.entities[who.charId] : null; emit(c, { t: 'ping', x: num(m.x, 0, 3e4), y: num(m.y, 0, 3e4), color: /^#[0-9a-f]{3,8}$/i.test(m.color || '') ? m.color : '#fff', by: who.role === 'dm' ? 'DM' : e ? e.name : '' }); return {}; },
  tabSet: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); if (!c.tabData[m.tabId] && !c.rs.tabs.some((t) => t.id === m.tabId)) fail('Unknown tab.'); limitSize(m.data, 500000); c.tabData[m.tabId] = m.data || {}; return done(c, { changed: true }); },
  buy: (ws, m) => {
    const { c, who } = ctx(ws); const e = c.entities[who.role === 'dm' ? m.eid : who.charId]; if (!e) fail('Unknown character.');
    const tab = c.tabData[m.tabId]; const row = tab && (tab.items || []).find((x) => x.id === m.itemId); if (!row || row.hidden) fail('That item is not for sale.');
    const qty = G.clampInt(m.qty, 1, 99, 1); if (row.stock != null && row.stock < qty) fail('Not enough in stock.');
    const def = row.ref ? E.findItem(c.rs, row.ref) : null; const base = def || row.item; if (!base) fail('Broken shop item.');
    const price = row.price || (def && def.price) || {}; const cost = G.toBase(price) * qty;
    const have = G.toBase(e.currency); if (have + 0.0001 < cost) fail("You can't afford that.");
    e.currency = G.fromBase(c.rs, have - cost);
    const ex = row.ref && e.inventory.find((i) => i.ref === row.ref && !i.name); if (ex) ex.qty += qty; else e.inventory.push(G.prepItem(row.ref ? { ref: row.ref, qty } : { ...row.item, qty }));
    if (row.stock != null) row.stock -= qty;
    const logs = [G.pushLog(c, 'custom', { kind2: 'buy', who: e.name, eid: e.id, text: `${e.name} buys ${qty}× ${base.name} for ${Object.entries(price).map(([k, v]) => v * qty + ' ' + k.toUpperCase()).join(', ') || 'free'}.` })];
    return done(c, { changed: true, logs });
  },
  gift: (ws, m) => {
    const { c, who } = ctx(ws); if (who.role !== 'player') fail('Players gift from their own character.'); const from = c.entities[who.charId]; const to = c.entities[m.to];
    if (!to || to.kind !== 'pc' || to.id === from.id) fail('Choose another player character.'); const logs = [];
    if (m.itemId) { const it = from.inventory.find((i) => i.id === m.itemId); if (!it) fail('Item not found.'); const q = Math.min(G.clampInt(m.qty, 1, 999, 1), it.qty || 1); it.qty -= q; const copy = { ...it, id: undefined, qty: q, equipped: false }; const ex = it.ref && to.inventory.find((i) => i.ref === it.ref && !i.name); if (ex) ex.qty += q; else to.inventory.push(G.prepItem(copy)); if (it.qty <= 0) from.inventory = from.inventory.filter((i) => i.id !== it.id); logs.push(G.pushLog(c, 'custom', { kind2: 'gift', who: from.name, eid: from.id, text: `${from.name} gives ${to.name} ${q}× ${E.resolveItem(c.rs, it).name}.` })); }
    if (m.currency) { const amt = {}; for (const [k, v] of Object.entries(m.currency)) { const n = Math.floor(Number(v) || 0); if (n > 0 && (from.currency[k] || 0) >= n) amt[k] = n; else if (n > 0) fail(`You don't have ${n} ${k.toUpperCase()}.`); } for (const [k, n] of Object.entries(amt)) { from.currency[k] -= n; to.currency[k] = (to.currency[k] || 0) + n; } if (Object.keys(amt).length) logs.push(G.pushLog(c, 'custom', { kind2: 'gift', who: from.name, eid: from.id, text: `${from.name} gives ${to.name} ${Object.entries(amt).map(([k, v]) => v + ' ' + k.toUpperCase()).join(', ')}.` })); }
    if (!logs.length) fail('Nothing to give.');
    return done(c, { changed: true, logs });
  },
  customLog: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); return done(c, { changed: false, logs: [G.pushLog(c, 'custom', { kind2: 'note', who: 'DM', text: G.str(m.text, 400), hidden: !!m.hidden })] }); },
  rulesetSet: (ws, m) => {
    const { c, who } = ctx(ws); dmOnly(who); limitSize(m.ruleset, 2e6); const rs = rules.normalizeRuleset(m.ruleset); const errs = G.validateRuleset(rs); if (errs.length) fail('Formula errors:\n' + errs.slice(0, 6).join('\n'));
    c.rs = rs; for (const t of rs.tabs) if (!c.tabData[t.id]) c.tabData[t.id] = G.defaultTab(t, rs); return done(c, { changed: true });
  },
  importNpcs: (ws) => { const { c, who } = ctx(ws); dmOnly(who); let n = 0; for (const t of c.rs.npcs) if (!c.entities['n_' + t.key]) { G.makeEntity(c, 'npc', { ...t, id: 'n_' + t.key, templateKey: t.key }); n++; } return done(c, { changed: true, imported: n }); },
  dmPassword: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); if (!m.password || String(m.password).length < 3) fail('Password must be at least 3 characters.'); c.dm = G.hashPw(m.password); save(); return {}; },
  setCharPassword: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e || e.kind !== 'pc') fail('Unknown character.'); if (!m.password || String(m.password).length < 3) fail('Password must be at least 3 characters.'); e.pw = G.hashPw(m.password); save(); return {}; },
  deleteCharacter: (ws, m) => { const { c, who } = ctx(ws); dmOnly(who); const e = c.entities[m.eid]; if (!e || e.kind !== 'pc') fail('Unknown character.'); for (const t of Object.values(c.tokens)) if (t.eid === e.id) delete c.tokens[t.id]; G.combatOp(c, 'remove', { eid: e.id }); delete c.entities[e.id]; for (const w of rooms.get(c.id) || []) if (w.data.session.charId === e.id) { w.send({ t: 'kicked' }); w.data.session = null; } return done(c, { changed: true }); },
  sync: (ws) => { const { c } = ctx(ws); sendState(ws, c, true); return {}; },
};

// ------------------------------------------------------------------ WebSocket plumbing
attach(server, (ws) => {
  conns.add(ws); ws.data.id = crypto.randomBytes(4).toString('hex');
  ws.send({ t: 'hello', id: ws.data.id });
  ws.onmessage = (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const rid = m.rid; const h = lobby[m.t] || game[m.t];
    const reply = (ok, body) => { if (rid != null) ws.send({ t: 'reply', rid, ok, ...(ok ? { data: body } : { error: body }) }); };
    if (!h) return reply(false, 'Unknown command.');
    try { const r = h(ws, m); reply(true, r && !r.logs ? r : r ? { ...r, logs: undefined } : {}); }
    catch (e) { if (e instanceof GameError) reply(false, e.message); else { console.error('handler error', m.t, e); reply(false, 'Something went wrong on the server.'); } }
  };
  ws.onclose = () => { conns.delete(ws); leaveRoom(ws); };
});
keepalive(() => conns);

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  Tabletop Hall is running.\n  Local:   http://localhost:${PORT}`);
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Network: http://${i.address}:${PORT}   (share this with your players)`);
    console.log('  DM password for new campaigns: dm123 (changeable in DM settings)\n');
  });
}
module.exports = { server, db };
