'use strict';
const crypto = require('crypto');
const E = require('./engine');
const { normalizeRuleset } = require('./rules');

const uid = (p = '') => p + crypto.randomBytes(5).toString('hex');
class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };
const clampInt = (v, lo, hi, d) => { v = Math.floor(Number(v)); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
const str = (v, n = 200) => String(v == null ? '' : v).slice(0, n);

function hashPw(pw, salt) { salt = salt || crypto.randomBytes(12).toString('hex'); return { salt, hash: crypto.scryptSync(String(pw), salt, 32).toString('hex') }; }
function checkPw(rec, pw) {
  if (!rec) return false;
  const h = crypto.scryptSync(String(pw), rec.salt, 32), b = Buffer.from(rec.hash, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}

// ------------------------------------------------------------------ ruleset validation
const FORMULA_KEYS = new Set(['formula', 'max', 'start', 'show', 'attack', 'damage', 'heal', 'upcast', 'abilityMod', 'skillFormula', 'saveFormula', 'dc', 'add', 'base', 'skillBudget', 'amount', 'slotlvl', 'pactlvl', 'spellmod']);
function validateRuleset(rs) {
  const errors = [];
  (function walk(v, path) {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']'));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && (FORMULA_KEYS.has(k) || (k === 'target' && /\.rolls\[\d+\]$/.test(path))) && x.trim() !== '') { const e = E.validateFormula(x); if (e) errors.push(path + '.' + k + ': ' + e); }
      else walk(x, path + '.' + k);
    }
  })(rs, 'ruleset');
  for (const [i, a] of (rs.abilities || []).entries()) if (!a.key || /[^a-z0-9_]/i.test(a.key)) errors.push(`abilities[${i}]: key must be letters/numbers/underscore`);
  return errors.slice(0, 30);
}

// ------------------------------------------------------------------ entities
function prepItem(it) {
  const o = { id: it.id || uid('it_'), ref: it.ref ? str(it.ref, 60) : undefined, qty: clampInt(it.qty, 0, 9999, 1), equipped: !!it.equipped };
  for (const k of ['name', 'type', 'desc', 'damage', 'attack', 'damageType', 'equipSlot', 'uses', 'range', 'note']) if (it[k] != null) o[k] = str(it[k], 400);
  for (const k of ['mods', 'vars', 'price', 'use', 'crit']) if (it[k] != null && typeof it[k] === 'object') o[k] = JSON.parse(JSON.stringify(it[k]));
  return o;
}
function prepActions(list) {
  return (list || []).map((a) => {
    if (typeof a === 'string') return { ref: a, id: a };
    const o = JSON.parse(JSON.stringify(a));
    if (!o.id) o.id = o.ref || o.key || uid('a_');
    return o;
  });
}
function makeEntity(c, kind, d) {
  const e = {
    id: d.id || uid(kind === 'pc' ? 'p_' : kind === 'npc' ? 'n_' : 'i_'), kind, name: str(d.name || 'Unnamed', 60),
    level: clampInt(d.level, 1, 30, 1), choices: d.choices || {}, abilities: d.abilities || {}, asi: d.asi || {},
    skillProf: d.skillProf || {}, skillRanks: d.skillRanks || {}, inventory: (d.inventory || []).map(prepItem),
    actions: prepActions(d.actions), currency: d.currency || {}, res: d.res || {}, status: d.status || [], mods: d.mods || [],
    fixed: d.fixed || {}, icon: str(d.icon, 400), color: /^#[0-9a-f]{3,8}$/i.test(d.color || '') ? d.color : '#c53131',
    bio: d.bio || {}, notes: d.notes || '', owner: d.owner || null, alignment: str(d.alignment, 40), recLevel: d.recLevel, cr: d.cr,
    desc: str(d.desc, 2000), templateKey: d.templateKey || null,
  };
  if (d.pw) e.pw = d.pw;
  c.entities[e.id] = e;
  return e;
}
const EDITABLE = ['name', 'level', 'choices', 'abilities', 'asi', 'skillProf', 'skillRanks', 'inventory', 'actions', 'currency', 'res', 'status', 'mods', 'fixed', 'icon', 'color', 'bio', 'alignment', 'owner', 'recLevel', 'cr', 'desc'];
function patchEntity(e, patch) {
  for (const k of EDITABLE) {
    if (!(k in patch)) continue; const v = patch[k];
    if (k === 'inventory') e.inventory = (v || []).map(prepItem);
    else if (k === 'actions') e.actions = prepActions(v);
    else if (k === 'level') e.level = clampInt(v, 1, 30, e.level);
    else if (k === 'name') e.name = str(v, 60) || e.name;
    else if (k === 'icon' || k === 'alignment' || k === 'desc') e[k] = str(v, k === 'desc' ? 2000 : 400);
    else if (k === 'color') { if (/^#[0-9a-f]{3,8}$/i.test(v)) e.color = v; }
    else if (k === 'status') e.status = (v || []).filter((s) => s && s.key).map((s) => ({ key: str(s.key, 40), turns: s.turns == null ? null : clampInt(s.turns, 0, 999, null), src: s.src ? str(s.src, 60) : undefined }));
    else if (typeof v === 'object' || k === 'owner' || k === 'recLevel' || k === 'cr') e[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }
}

function defaultTab(t, rs) {
  if (t.type === 'shop') {
    const stock = (rs.items || []).filter((i) => i.price && ['weapon', 'armor', 'consumable', 'gear'].includes(i.type)).slice(0, 14).map((i) => ({ id: uid('s_'), ref: i.key, price: i.price, stock: null }));
    return { items: stock };
  }
  if (t.type === 'quests') return { quests: [] };
  return { rows: [] };
}
function newCampaign({ name, rs, dmPassword }) {
  rs = normalizeRuleset(rs);
  const c = {
    id: uid('c_'), name: str(name || 'Untitled Campaign', 80), created: Date.now(), rs, dm: hashPw(dmPassword || 'dm123'),
    entities: {}, tokens: {}, drawings: [],
    scene: { mapUrl: null, w: 2800, h: 1800, grid: true, snap: true, cell: 70, bg: '#1b1917' },
    combat: { active: false, round: 0, turn: 0, order: [], used: {}, budget: {} },
    logs: { rolls: [], actions: [], custom: [] }, tabData: {}, sessionNotes: '',
  };
  for (const n of rs.npcs) makeEntity(c, 'npc', { ...n, id: 'n_' + n.key, templateKey: n.key });
  for (const t of rs.tabs) c.tabData[t.id] = defaultTab(t, rs);
  return c;
}

// ------------------------------------------------------------------ currency
const CUR_VALUE = { pp: 1000, gp: 100, sp: 10, cp: 1 };
const curVal = (k) => CUR_VALUE[k] || 1;
function toBase(amounts) { return Object.entries(amounts || {}).reduce((a, [k, v]) => a + (Number(v) || 0) * curVal(k), 0); }
function fromBase(rs, base) {
  const out = {}; const keys = (rs.currency || []).map((x) => x.key).sort((a, b) => curVal(b) - curVal(a));
  base = Math.round(base * 1000) / 1000;
  for (const k of keys) { const v = curVal(k); const n = Math.floor(base / v + 1e-9); if (n > 0) { out[k] = n; base -= n * v; } }
  if (!keys.length) return out;
  if (base > 0.0001) { const last = keys[keys.length - 1]; out[last] = (out[last] || 0) + base / curVal(last); }
  for (const k of keys) if (out[k] == null) out[k] = 0;
  return out;
}
function priceBase(price) { return toBase(price); }

// ------------------------------------------------------------------ character creation (server-validated)
function optionList(rs, choices) { return E.chosenOptions(rs, { choices }).map((x) => x.opt); }
function createCharacterEntity(c, d) {
  const rs = c.rs;
  const name = str(d.name, 60).trim(); if (!name) fail('Your character needs a name.');
  const choices = {};
  for (const grp of rs.choices) {
    const k = d.choices && d.choices[grp.key];
    if (grp.required && !(grp.options || []).some((o) => o.key === k)) fail(`Choose a ${grp.name}.`);
    if ((grp.options || []).some((o) => o.key === k)) choices[grp.key] = k;
  }
  const opts = optionList(rs, choices);
  const cr = rs.creation;
  const start = cr.startLevel || 1;
  const level = cr.hideLevel ? 1 : Math.min(start, clampInt(d.level, 1, 20, start));
  const abilities = {};
  for (const a of rs.abilities) abilities[a.key] = clampInt(d.abilities && d.abilities[a.key], 1, 200, a.default ?? 10);
  const method = d.abilityMethod;
  if (method === 'standard' && cr.standardArray) {
    const got = rs.abilities.map((a) => abilities[a.key]).sort((x, y) => y - x).join(), want = [...cr.standardArray].sort((x, y) => y - x).join();
    if (got !== want && rs.abilities.length === cr.standardArray.length) fail('Standard array values do not match.');
  } else if (method === 'pointbuy' && cr.pointBuy) {
    let spent = 0;
    for (const a of rs.abilities) { const v = abilities[a.key]; if (cr.pointBuy.cost[v] == null) fail(`${a.name} ${v} is outside the point-buy range.`); spent += cr.pointBuy.cost[v]; }
    if (spent > cr.pointBuy.budget) fail(`Point buy overspent (${spent}/${cr.pointBuy.budget}).`);
  }
  // ability score increases
  const asi = {};
  const spec = opts.find((o) => o.asi);
  if (spec && d.asi && Object.keys(d.asi).length) {
    const vals = Object.entries(d.asi).filter(([, v]) => Number(v) > 0);
    const allowed = spec.asi.from === 'any' ? rs.abilities.map((a) => a.key) : spec.asi.from;
    for (const [k] of vals) if (!allowed.includes(k)) fail('Invalid ability score increase.');
    const pattern = vals.map(([, v]) => Number(v)).sort((a, b) => b - a).join();
    if (!spec.asi.patterns.some((p) => [...p].sort((a, b) => b - a).join() === pattern)) fail('Ability score increase does not match the allowed pattern.');
    for (const [k, v] of vals) asi[k] = Number(v);
  }
  // skills
  const skillProf = {}, skillRanks = {};
  const tmp = { level, abilities, choices, asi, inventory: [], status: [], actions: [] };
  const base = E.compute(rs, tmp);
  const budget = Math.max(0, Math.floor(E.calc(cr.skillBudget || '0', base.scope, rs.tables)));
  const known = new Set((rs.skills || []).map((s) => s.key));
  let used = 0;
  if (rs.skillMode === 'prof') {
    for (const [k, v] of Object.entries(d.skillProf || {})) if (known.has(k) && v >= 1) { skillProf[k] = clampInt(v, 1, 2, 1); used += 1; }
  } else {
    for (const [k, v] of Object.entries(d.skillRanks || {})) if (known.has(k) && v > 0) { skillRanks[k] = clampInt(v, 0, 99, 0); used += skillRanks[k]; }
  }
  if (used > budget) fail(`Too many skill points assigned (${used}/${budget}).`);
  // equipment: free kit from options + purchased with starting money
  const kit = {};
  if (cr.startItemsFromOptions !== false) for (const o of opts) for (const it of o.items || []) kit[it.ref] = (kit[it.ref] || 0) + (it.qty || 1);
  const startMoney = {};
  for (const o of opts) for (const [k, v] of Object.entries(o.currency || {})) startMoney[k] = (startMoney[k] || 0) + v;
  for (const [k, v] of Object.entries(cr.startCurrency || {})) startMoney[k] = (startMoney[k] || 0) + v;
  let spent = 0; const inventory = [];
  for (const it of (d.inventory || []).slice(0, 60)) {
    const def = E.findItem(rs, it.ref); if (!def) continue;
    const qty = clampInt(it.qty, 1, 99, 1);
    const free = Math.min(qty, kit[it.ref] || 0); kit[it.ref] = (kit[it.ref] || 0) - free;
    spent += (qty - free) * priceBase(def.price);
    inventory.push({ ref: it.ref, qty, equipped: !!it.equipped });
  }
  const startBase = toBase(startMoney);
  if (spent > startBase + 0.0001) fail('You cannot afford that equipment.');
  const currency = fromBase(rs, startBase - spent);
  // actions
  const actions = [];
  const optActions = new Set(opts.flatMap((o) => o.actions || []));
  for (const ref of (d.actions || []).slice(0, 60)) {
    const def = E.findAction(rs, ref); if (!def) continue;
    if (def.classes && !optActions.has(ref) && !opts.some((o) => def.classes.includes(o.key))) continue;
    actions.push(ref);
  }
  for (const ref of optActions) if (!actions.includes(ref)) actions.push(ref);
  const pw = d.password; if (!pw || String(pw).length < 3) fail('Set a password of at least 3 characters for this character.');
  const e = makeEntity(c, 'pc', {
    name, level, choices, abilities, asi, skillProf, skillRanks, inventory, actions, currency,
    icon: d.icon, color: d.color, bio: { ...(typeof d.bio === 'object' && d.bio ? d.bio : {}) }, alignment: d.alignment, pw: hashPw(pw),
  });
  e.bio = Object.fromEntries(Object.entries(e.bio).slice(0, 20).map(([k, v]) => [str(k, 40), str(v, 1500)]));
  placeToken(c, e);
  return e;
}
function placeToken(c, e, x, y) {
  const g = c.scene.cell; const taken = new Set(Object.values(c.tokens).map((t) => t.x + ',' + t.y));
  let px = x, py = y;
  if (px == null) {
    const n = Object.keys(c.tokens).length;
    for (let i = 0; i < 400; i++) { const cx = 2 + (n + i) % 8, cy = 2 + Math.floor((n + i) / 8); px = cx * g; py = cy * g; if (!taken.has(px + ',' + py)) break; }
  }
  const t = { id: uid('t_'), eid: e.id, x: px, y: py, size: 1, hidden: false, inCombat: true };
  c.tokens[t.id] = t; return t;
}

// ------------------------------------------------------------------ logging
function pushLog(c, kind, entry) {
  const arr = c.logs[kind]; const e = { id: uid('l_'), ts: Date.now(), ...entry };
  arr.push(e); if (arr.length > 400) arr.splice(0, arr.length - 400);
  return { kind, entry: e };
}

// ------------------------------------------------------------------ resource changes
function applyDelta(c, ent, resKey, delta) {
  const rs = c.rs; const comp = E.compute(rs, ent); const r = comp.resources[resKey];
  if (!r) return null;
  let cur = r.cur; const before = cur; let absorbed = 0;
  ent.res = ent.res || {};
  if (delta < 0 && rs.combat.temp && comp.resources[rs.combat.temp] && resKey === rs.combat.hp) {
    const t = comp.resources[rs.combat.temp].cur; const take = Math.min(t, -delta);
    if (take) { ent.res[rs.combat.temp] = t - take; absorbed = take; delta += take; }
  }
  cur = Math.max(0, Math.min(r.max, cur + delta));
  ent.res[resKey] = cur;
  return { before, after: cur, max: r.max, absorbed, down: resKey === rs.combat.hp && cur <= 0 && before > 0 };
}
function statusName(rs, key) { const d = E.statusDef(rs, key); return d ? d.name : key; }
function applyStatus(c, ent, key, turns, src) {
  const def = E.statusDef(c.rs, key); if (!def) fail('Unknown status: ' + key);
  ent.status = ent.status || [];
  const t = turns == null || turns === '' ? (def.defaultTurns || null) : clampInt(turns, 1, 999, null);
  const ex = ent.status.find((s) => s.key === key);
  if (ex) { ex.turns = t; if (src) ex.src = src; } else ent.status.push({ key, turns: t, src });
  return def;
}
function removeStatus(ent, key) { const n = (ent.status || []).length; ent.status = (ent.status || []).filter((s) => s.key !== key); return n !== ent.status.length; }

// ------------------------------------------------------------------ combat economy
const OFF_TURN = new Set(['reaction', 'immediate']);
function turnDef(rs) { return rs.combat.turn || []; }
function allowedFor(c, ent) {
  const rs = c.rs; const out = {};
  const bud = (c.combat.budget || {})[ent.id] || {};
  for (const t of turnDef(rs)) out[t.key] = bud[t.key] != null ? bud[t.key] : t.count;
  for (const st of ent.status || []) { const d = E.statusDef(rs, st.key); if (d && d.blocks) for (const k of d.blocks) if (k in out) out[k] = 0; }
  return out;
}
function blockedBy(c, ent, key) {
  for (const st of ent.status || []) { const d = E.statusDef(c.rs, st.key); if (d && d.blocks && d.blocks.includes(key)) return d.name; }
  return null;
}
function consumeEconomy(c, ent, uses, dm) {
  if (!uses || !c.combat.active) return;
  const inOrder = c.combat.order.findIndex((o) => o.eid === ent.id); if (inOrder < 0) return;
  const t = turnDef(c.rs).find((x) => x.key === uses); if (!t) return;
  const allowed = allowedFor(c, ent)[uses];
  c.combat.used[ent.id] = c.combat.used[ent.id] || {};
  const used = c.combat.used[ent.id][uses] || 0;
  if (!dm) {
    const b = blockedBy(c, ent, uses); if (b) fail(`${ent.name} can't use a ${t.name.toLowerCase()} while ${b}.`);
    const mine = c.combat.order[c.combat.turn] && c.combat.order[c.combat.turn].eid === ent.id;
    if (!mine && !(t.offTurn || OFF_TURN.has(t.key))) fail("It isn't your turn.");
    if (used >= allowed) fail(`No ${t.name.toLowerCase()} left this turn.`);
  }
  c.combat.used[ent.id][uses] = used + 1;
}

// ------------------------------------------------------------------ actions
function canControl(c, who, ent) { return who.role === 'dm' || ent.id === who.charId || (ent.owner && ent.owner === who.charId); }
function rollFormula(formula, scope, tables, o = {}) {
  const r = E.evaluate(formula, scope, { critDouble: !!o.critDouble, tables });
  let total = Math.max(0, Math.round(r.value));
  if (o.mult > 1) total *= o.mult;
  return { total, dice: r.dice, formula, error: r.error };
}
function dmgDiceText(r) { return r.dice.map((d) => `${d.expr}[${d.results.map((v, i) => (d.kept[i] ? v : `~~${v}~~`)).join(',')}]`).join(' + '); }

function useAction(c, who, req) {
  const rs = c.rs; const logs = [];
  const ent = c.entities[req.eid]; if (!ent) fail('Unknown character.');
  if (!canControl(c, who, ent)) fail('You can only act for your own character.');
  const comp = E.compute(rs, ent);
  const a = E.allActions(rs, ent).find((x) => x.id === req.actionId || x.key === req.actionId); if (!a) fail('Unknown action.');
  const dm = who.role === 'dm'; const hidden = dm && !!req.hidden;
  const L = (kind, e) => logs.push(pushLog(c, kind, { hidden, ...e }));
  consumeEconomy(c, ent, a.uses, dm);
  // cost
  let extra = 0; let costRes = a.cost && a.cost.res;
  if (a.cost) {
    const slot = Number(req.slot) || 0;
    if (a.upcast && slot && a.level && slot > a.level) { costRes = costRes.replace(/\d+$/, '') + slot; extra = slot - a.level; }
    const r = comp.resources[costRes]; if (!r) fail('You have no ' + costRes + ' to spend.');
    const amt = Number(a.cost.amount) || 1; if (r.cur < amt) fail(`Not enough ${(rs.resources.find((x) => x.key === costRes) || {}).name || costRes}.`);
    ent.res[costRes] = r.cur - amt;
  }
  const targets = (req.targets || []).map((id) => c.entities[id]).filter(Boolean);
  const mode = rs.combat.critMode;
  let dmgFormula = a.damage; if (dmgFormula && extra > 0 && a.upcast) dmgFormula += ('+' + a.upcast).repeat(extra);
  const header = `${ent.name} uses ${a.name}${extra ? ` (level ${a.level + extra})` : ''}`;
  L('actions', { kind2: 'action', who: ent.name, eid: ent.id, text: header + (targets.length ? ' on ' + targets.map((t) => t.name).join(', ') : '') + '.' });
  const hasAttack = a.attack != null && a.attack !== '' && !a.auto;
  const applyStatuses = (t, why) => { for (const k of a.applies || []) { const d = applyStatus(c, t, k, null, ent.name); L('actions', { kind2: 'status', who: ent.name, eid: t.id, text: `${t.name} is now ${d.name}${why ? ' (' + why + ')' : ''}.` }); } };
  const dealDamage = (t, total, type, note) => {
    if (!t) return;
    const res = applyDelta(c, t, rs.combat.hp, -total);
    if (res) L('actions', { kind2: 'damage', who: ent.name, eid: t.id, text: `${t.name} takes ${total}${type ? ' ' + type : ''} damage${res.absorbed ? ` (${res.absorbed} absorbed by temp HP)` : ''}${note ? ' ' + note : ''}${res.down ? ' and is down!' : '.'}`, amount: -total });
  };
  const healTarget = (t, total) => {
    const res = applyDelta(c, t, rs.combat.hp, total);
    if (res) L('actions', { kind2: 'heal', who: ent.name, eid: t.id, text: `${t.name} recovers ${res.after - res.before} HP.`, amount: res.after - res.before });
  };
  const showDamageRoll = (r, label) => L('rolls', { kind2: 'damage', who: ent.name, eid: ent.id, label, expr: r.formula, total: r.total, diceText: dmgDiceText(r), dice: r.dice, system: rs.rollSystem });

  if (a.save && (a.damage || a.applies || a.heal)) {
    const dc = Math.round(E.calc(a.save.dc || 10, comp.scope, rs.tables));
    const sr = dmgFormula ? rollFormula(dmgFormula, comp.scope, rs.tables) : null;
    if (sr) showDamageRoll(sr, `${a.name} damage`);
    if (!targets.length) L('actions', { kind2: 'info', who: ent.name, text: `DC ${dc} ${a.save.ability.toUpperCase()} save. Select targets to resolve automatically.` });
    for (const t of targets) {
      const tc = E.compute(rs, t);
      const abil = (rs.saves.find((s) => s.key === a.save.ability) || {});
      const check = E.resolveCheck(rs, { value: tc.saves[a.save.ability] || 0, label: `${abil.name || a.save.ability} save`, adv: E.rollState(rs, t, 'save', null), dc, kind: 'save' });
      L('rolls', { kind2: 'save', who: t.name, eid: t.id, label: `${a.name}: ${abil.name || a.save.ability} save`, ...check });
      if (sr) { const amt = check.success ? (a.save.half ? Math.floor(sr.total / 2) : 0) : sr.total; if (amt > 0) dealDamage(t, amt, a.damageType, check.success ? '(save: half)' : ''); else L('actions', { kind2: 'info', who: t.name, text: `${t.name} resists the effect.` }); }
      if (!check.success) applyStatuses(t, 'failed save');
    }
    if (a.heal) for (const t of (targets.length ? targets : [ent])) healTarget(t, rollFormula(a.heal, comp.scope, rs.tables).total);
  } else {
    const tl = targets.length ? targets : (hasAttack || a.damage ? [null] : [ent]);
    const hr = !hasAttack && a.damage ? rollFormula(dmgFormula, comp.scope, rs.tables) : null;
    if (hr) showDamageRoll(hr, `${a.name} damage`);
    for (const t of tl) {
      let hit = true, isCrit = false;
      if (hasAttack) {
        const val = Math.round(E.calc(a.attack, comp.scope, rs.tables));
        const tc = t ? E.compute(rs, t) : null;
        const dc = t && rs.rollSystem === 'd20' && rs.combat.defense && tc.derived[rs.combat.defense] != null ? tc.derived[rs.combat.defense] : null;
        const check = E.resolveCheck(rs, { value: val, label: a.name, adv: E.rollState(rs, ent, 'attack', req.adv), bonus: req.bonus, dc, kind: 'attack', crit: a.crit });
        if (check.system === 'd20') {
          hit = dc != null ? (check.nat === 20 ? true : check.nat === 1 ? false : check.total >= dc) : true;
          check.success = dc != null ? hit : null;
          if (mode === 'dice') { isCrit = check.crit === 'crit' && (dc == null || hit); if (isCrit) { hit = true; check.success = dc != null ? true : null; } }
          else if (mode === 'mult' && check.crit === 'crit' && hit && dc != null) {
            const cf = E.resolveCheck(rs, { value: val, label: 'Crit confirm', adv: null, bonus: req.bonus, dc, kind: 'attack' });
            check.confirm = { total: cf.total, nat: cf.nat, ok: cf.nat === 1 ? false : cf.nat === 20 ? true : cf.total >= dc }; isCrit = check.confirm.ok;
          }
        } else { hit = !!check.success; isCrit = check.crit === 'crit'; if (!t) hit = true; }
        L('rolls', { kind2: 'attack', who: ent.name, eid: ent.id, label: `${a.name}${t ? ' → ' + t.name : ''}`, ...check });
      }
      if (hit && a.damage) {
        const mult = isCrit && mode === 'mult' ? ((a.crit && a.crit.mult) || 2) : 1;
        const r = hasAttack ? rollFormula(dmgFormula, comp.scope, rs.tables, { critDouble: isCrit && mode === 'dice', mult }) : hr;
        if (hasAttack) showDamageRoll(r, `${a.name} damage${isCrit ? ' (CRIT)' : ''}`);
        if (t) dealDamage(t, r.total, a.damageType); else L('actions', { kind2: 'info', who: ent.name, text: `${a.name} deals ${r.total}${a.damageType ? ' ' + a.damageType : ''} damage.` });
      } else if (hasAttack && t && !hit) L('actions', { kind2: 'info', who: ent.name, text: `${a.name} misses ${t.name}.` });
      if (hit && t && !a.save) applyStatuses(t);
      if (!hasAttack && !a.damage && t && !a.heal && !a.save) applyStatuses(t);
      if (a.heal) { const hh = rollFormula(a.heal, comp.scope, rs.tables); showDamageRoll(hh, `${a.name} healing`); healTarget(t || ent, hh.total); }
    }
  }
  if (!hasAttack && !a.damage && !a.heal && !a.save && !(a.applies || []).length) L('actions', { kind2: 'info', who: ent.name, text: a.desc || '' });
  return { logs, changed: true };
}

function useItem(c, who, req) {
  const rs = c.rs; const ent = c.entities[req.eid]; if (!ent) fail('Unknown character.');
  if (!canControl(c, who, ent)) fail('You can only use your own items.');
  const inv = ent.inventory.find((i) => i.id === req.itemId); if (!inv) fail('Item not found.');
  const it = E.resolveItem(rs, inv); if (!it.use) fail('That item cannot be used.');
  const dm = who.role === 'dm'; const hidden = dm && !!req.hidden; const logs = [];
  const L = (kind, e) => logs.push(pushLog(c, kind, { hidden, ...e }));
  consumeEconomy(c, ent, it.uses || (rs.combat.turn[0] || {}).key, dm);
  const comp = E.compute(rs, ent);
  const targets = (req.targets || []).map((id) => c.entities[id]).filter(Boolean); const tl = targets.length ? targets : [ent];
  L('actions', { kind2: 'action', who: ent.name, eid: ent.id, text: `${ent.name} uses ${it.name}.` });
  for (const t of tl) {
    if (it.use.heal) { const r = rollFormula(it.use.heal, comp.scope, rs.tables); L('rolls', { kind2: 'damage', who: ent.name, eid: ent.id, label: `${it.name} healing`, expr: r.formula, total: r.total, diceText: dmgDiceText(r), dice: r.dice, system: rs.rollSystem }); const res = applyDelta(c, t, rs.combat.hp, r.total); if (res) L('actions', { kind2: 'heal', who: ent.name, eid: t.id, text: `${t.name} recovers ${res.after - res.before} HP.`, amount: res.after - res.before }); }
    if (it.use.restore) { const r = rollFormula(it.use.restore.amount, comp.scope, rs.tables); applyDelta(c, t, it.use.restore.res, r.total); L('actions', { kind2: 'heal', who: ent.name, eid: t.id, text: `${t.name} regains ${r.total} ${it.use.restore.res.toUpperCase()}.` }); }
    if (it.use.removeStatus && removeStatus(t, it.use.removeStatus)) L('actions', { kind2: 'status', who: ent.name, eid: t.id, text: `${t.name} is no longer ${statusName(rs, it.use.removeStatus)}.` });
    for (const k of it.use.applies || []) { const d = applyStatus(c, t, k, null, ent.name); L('actions', { kind2: 'status', who: ent.name, eid: t.id, text: `${t.name} is now ${d.name}.` }); }
  }
  inv.qty = (inv.qty || 1) - 1; if (inv.qty <= 0) ent.inventory = ent.inventory.filter((i) => i.id !== inv.id);
  return { logs, changed: true };
}

function rollCheck(c, who, req) {
  const rs = c.rs; const ent = c.entities[req.eid]; if (!ent) fail('Unknown character.');
  if (!canControl(c, who, ent)) fail('You can only roll for your own character.');
  const comp = E.compute(rs, ent); const hidden = who.role === 'dm' && !!req.hidden;
  let value = 0, label = '', adjKind = 'check';
  const key = str(req.key, 40);
  if (req.kind === 'skill') { const s = rs.skills.find((x) => x.key === key); if (!s) fail('Unknown skill.'); value = comp.skills[key]; label = s.name; }
  else if (req.kind === 'save') { const s = rs.saves.find((x) => x.key === key); if (!s) fail('Unknown save.'); value = comp.saves[key]; label = s.name + ' save'; adjKind = 'save'; }
  else if (req.kind === 'ability') { const a = rs.abilities.find((x) => x.key === key); if (!a) fail('Unknown ability.'); value = rs.rollSystem === 'd100' ? comp.abilities[key].score : comp.abilities[key].mod; label = a.name + ' check'; }
  else if (req.kind === 'roll') { const r = (rs.rolls || []).find((x) => x.key === key); if (!r) fail('Unknown roll.'); value = comp.rolls[key]; label = r.name; }
  else if (req.kind === 'init') { value = comp.derived[rs.initiative.stat] || 0; label = 'Initiative'; adjKind = 'init'; }
  else fail('Unknown roll type.');
  const check = E.resolveCheck(rs, { value, label, adv: E.rollState(rs, ent, adjKind, req.adv), bonus: req.bonus, dc: req.dc, difficulty: req.difficulty, kind: req.kind });
  const logs = [pushLog(c, 'rolls', { hidden, kind2: req.kind, who: ent.name, eid: ent.id, label, ...check })];
  return { logs, changed: false, check };
}
function diceRoll(c, who, req) {
  const groups = (Array.isArray(req.groups) ? req.groups : []).slice(0, 8).map((g) => ({ count: clampInt(g.count, 1, 50, 1), sides: clampInt(g.sides, 2, 1000, 20) }));
  if (!groups.length) fail('Add some dice first.');
  const mod = clampInt(req.mod, -999, 999, 0);
  let total = mod; const out = groups.map((g) => { const results = []; for (let i = 0; i < g.count; i++) results.push(E.rollDie(g.sides)); total += results.reduce((a, b) => a + b, 0); return { ...g, results }; });
  const ent = who.charId ? c.entities[who.charId] : null;
  const dm = who.role === 'dm';
  const entry = { kind2: 'dice', who: dm ? 'DM' : (ent ? ent.name : 'Player'), eid: ent ? ent.id : null, label: str(req.label, 60) || 'Dice roll', groups: out, mod, total, popup: dm && !!req.popup, hidden: dm && !!req.hidden && !req.popup };
  return { logs: [pushLog(c, 'rolls', entry)], changed: false };
}

// ------------------------------------------------------------------ combat flow
function combatants(c) {
  const seen = new Set(); const out = [];
  for (const t of Object.values(c.tokens)) { if (t.inCombat === false) continue; const e = c.entities[t.eid]; if (!e || seen.has(e.id)) continue; seen.add(e.id); out.push({ e, t }); }
  return out;
}
function rollInit(c, e, logs, hidden) {
  const rs = c.rs; const comp = E.compute(rs, e); const stat = comp.derived[rs.initiative.stat] || 0;
  if (rs.initiative.roll === 'none') return { eid: e.id, init: stat, total: stat, rolls: [], pc: e.kind === 'pc' };
  const check = E.resolveCheck(rs, { value: stat, label: 'Initiative', adv: E.rollState(rs, e, 'init', null), kind: 'init' });
  logs.push(pushLog(c, 'rolls', { hidden: e.kind !== 'pc' && hidden, kind2: 'init', who: e.name, eid: e.id, label: 'Initiative', ...check }));
  const total = rs.rollSystem === 'd100' ? stat : check.total;
  return { eid: e.id, init: stat, total, rolls: check.rolls, pc: e.kind === 'pc' };
}
const sortOrder = (o) => o.sort((a, b) => b.total - a.total || b.init - a.init || (b.pc ? 1 : 0) - (a.pc ? 1 : 0));
function startTurn(c, logs) {
  const cb = c.combat; const cur = cb.order[cb.turn]; if (!cur) return; const e = c.entities[cur.eid]; if (!e) return;
  cb.used[e.id] = {};
  logs.push(pushLog(c, 'actions', { kind2: 'turn', who: e.name, eid: e.id, text: `Round ${cb.round} — ${e.name}'s turn.` }));
  for (const st of [...(e.status || [])]) {
    const def = E.statusDef(c.rs, st.key); if (!def || !def.tick || def.tick.when === 'turnEnd') continue;
    tickStatus(c, e, def, logs);
  }
}
function tickStatus(c, e, def, logs) {
  const comp = E.compute(c.rs, e); const r = E.evaluate(def.tick.amount, comp.scope, { tables: c.rs.tables });
  const v = Math.round(r.value); const res = applyDelta(c, e, def.tick.res, v);
  if (res) logs.push(pushLog(c, 'actions', { kind2: v < 0 ? 'damage' : 'heal', who: def.name, eid: e.id, text: `${e.name} ${v < 0 ? 'takes ' + -v + (def.tick.type ? ' ' + def.tick.type : '') + ' damage' : 'regains ' + v} from ${def.name}${res.down ? ' and is down!' : '.'}`, amount: v }));
}
function endTurn(c, logs) {
  const cb = c.combat; const cur = cb.order[cb.turn]; if (!cur) return; const e = c.entities[cur.eid]; if (!e) return;
  for (const st of [...(e.status || [])]) {
    const def = E.statusDef(c.rs, st.key);
    if (def && def.tick && def.tick.when === 'turnEnd') tickStatus(c, e, def, logs);
    if (st.turns != null) { st.turns -= 1; if (st.turns <= 0) { removeStatus(e, st.key); logs.push(pushLog(c, 'actions', { kind2: 'status', who: 'System', eid: e.id, text: `${statusName(c.rs, st.key)} wears off ${e.name}.` })); } }
  }
}
function combatOp(c, op, req) {
  const cb = c.combat; const logs = []; let anim = null; const hidden = !!req.hidden;
  const prune = () => { cb.order = cb.order.filter((o) => c.entities[o.eid]); if (cb.turn >= cb.order.length) cb.turn = 0; };
  switch (op) {
    case 'start': {
      const list = combatants(c); if (!list.length) fail('Put some characters or creatures on the map first.');
      const order = list.map(({ e }) => rollInit(c, e, logs, hidden));
      cb.order = sortOrder(order); cb.active = true; cb.round = 1; cb.turn = 0; cb.used = {};
      anim = cb.order.map((o) => ({ eid: o.eid, rolls: o.rolls, total: o.total }));
      logs.push(pushLog(c, 'actions', { kind2: 'info', who: 'DM', text: 'Combat begins! Roll for initiative.' }));
      startTurn(c, logs); break;
    }
    case 'end': cb.active = false; cb.order = []; cb.round = 0; cb.turn = 0; cb.used = {}; logs.push(pushLog(c, 'actions', { kind2: 'info', who: 'DM', text: 'Combat ends.' })); break;
    case 'next': { if (!cb.active) fail('No combat is running.'); prune(); endTurn(c, logs); cb.turn += 1; if (cb.turn >= cb.order.length) { cb.turn = 0; cb.round += 1; } startTurn(c, logs); break; }
    case 'prev': { if (!cb.active) fail('No combat is running.'); prune(); cb.turn -= 1; if (cb.turn < 0) { cb.turn = Math.max(0, cb.order.length - 1); cb.round = Math.max(1, cb.round - 1); } cb.used[(cb.order[cb.turn] || {}).eid] = {}; break; }
    case 'setTurn': { const i = cb.order.findIndex((o) => o.eid === req.eid); if (i < 0) fail('Not in the turn order.'); cb.turn = i; cb.used[req.eid] = {}; break; }
    case 'setInit': { const o = cb.order.find((x) => x.eid === req.eid); if (!o) fail('Not in the turn order.'); const cur = cb.order[cb.turn]; o.total = Number(req.total) || 0; sortOrder(cb.order); cb.turn = Math.max(0, cb.order.indexOf(cur)); break; }
    case 'budget': { const e = c.entities[req.eid]; if (!e) fail('Unknown creature.'); cb.budget[e.id] = {}; for (const [k, v] of Object.entries(req.budget || {})) cb.budget[e.id][k] = clampInt(v, 0, 99, 1); break; }
    case 'refresh': { cb.used[req.eid] = {}; break; }
    case 'add': {
      const e = c.entities[req.eid]; if (!e) fail('Unknown creature.');
      for (const t of Object.values(c.tokens)) if (t.eid === e.id) t.inCombat = true;
      if (cb.active && !cb.order.some((o) => o.eid === e.id)) {
        const cur = cb.order[cb.turn]; const o = rollInit(c, e, logs, hidden); if (req.total != null) o.total = Number(req.total); cb.order.push(o); sortOrder(cb.order); cb.turn = Math.max(0, cb.order.indexOf(cur));
      } break;
    }
    case 'remove': {
      for (const t of Object.values(c.tokens)) if (t.eid === req.eid) t.inCombat = false;
      const i = cb.order.findIndex((o) => o.eid === req.eid);
      if (i >= 0) { const cur = cb.order[cb.turn]; cb.order.splice(i, 1); if (i < cb.turn) cb.turn -= 1; else if (cur && cur.eid === req.eid) { if (cb.turn >= cb.order.length) { cb.turn = 0; cb.round += 1; } startTurn(c, logs); } }
      break;
    }
    default: fail('Unknown combat command.');
  }
  return { logs, anim, changed: true };
}

// ------------------------------------------------------------------ views
function classLabel(c, e) { return E.chosenOptions(c.rs, e).map((x) => x.opt.name).join(' · '); }
function healthLabel(r) { if (!r || !r.max) return ''; if (r.cur <= 0) return 'Down'; if (r.cur >= r.max) return 'Unharmed'; const p = r.cur / r.max; return p > 0.5 ? 'Hurt' : p > 0.25 ? 'Bloodied' : 'Near death'; }
function entityView(c, e, mode) {
  const rs = c.rs; const comp = E.compute(rs, e);
  const res = {};
  for (const [k, v] of Object.entries(comp.resources)) if (v.visible) res[k] = mode === 'npcLite' ? { label: k === rs.combat.hp ? healthLabel(v) : '' } : { cur: v.cur, max: v.max };
  const hp = comp.resources[rs.combat.hp];
  const v = { id: e.id, kind: e.kind, name: e.name, icon: e.icon, color: e.color, level: e.level, owner: e.owner || null, alignment: e.alignment, status: e.status || [], res, down: !!(hp && hp.max > 0 && hp.cur <= 0), classLabel: classLabel(c, e), mode };
  if (mode !== 'npcLite') v.defense = rs.combat.defense ? comp.derived[rs.combat.defense] : null;
  if (mode === 'full') {
    const actionsView = E.allActions(rs, e).map((a) => {
      const o = { ...a };
      if (a.attack != null && a.attack !== '') o.atkVal = Math.round(E.calc(a.attack, comp.scope, rs.tables));
      if (a.save && a.save.dc != null) o.dcVal = Math.round(E.calc(a.save.dc, comp.scope, rs.tables));
      return o;
    });
    Object.assign(v, {
      abilities: e.abilities, asi: e.asi, skillProf: e.skillProf, skillRanks: e.skillRanks, choices: e.choices, currency: e.currency, notes: e.notes, bio: e.bio, mods: e.mods, fixed: e.fixed,
      inventory: e.inventory.map((it) => ({ ...E.resolveItem(rs, it), id: it.id, ref: it.ref, qty: it.qty, equipped: it.equipped })),
      actions: actionsView, rawActions: e.actions, cr: e.cr, recLevel: e.recLevel, desc: e.desc, templateKey: e.templateKey,
      comp: { abilities: comp.abilities, derived: comp.derived, derivedVisible: comp.derivedVisible, skills: comp.skills, saves: comp.saves, rolls: comp.rolls },
      allowed: allowedFor(c, e), used: c.combat.used[e.id] || {},
    });
  }
  return v;
}
function snapshotFor(c, who, online) {
  const dm = who.role === 'dm'; const rs = c.rs;
  const tokens = Object.values(c.tokens).filter((t) => dm || !t.hidden);
  const visible = new Set(tokens.map((t) => t.eid));
  const entities = {};
  for (const e of Object.values(c.entities)) {
    if (e.kind === 'npc' && !dm) continue;
    if (!dm && e.kind === 'inst' && !visible.has(e.id)) continue;
    const own = dm || e.id === who.charId || (e.owner && e.owner === who.charId);
    entities[e.id] = entityView(c, e, own ? 'full' : e.kind === 'inst' && rs.combat.hideNpcStats ? 'npcLite' : 'lite');
  }
  const rsOut = dm ? rs : { ...rs, npcs: [] };
  const filterTab = (d) => { if (dm) return d; const o = {}; for (const [k, v] of Object.entries(d)) o[k] = Array.isArray(v) ? v.filter((x) => !x.hidden) : v; return o; };
  const tabData = {}; for (const [k, v] of Object.entries(c.tabData)) tabData[k] = filterTab(v);
  const lg = (arr) => arr.filter((l) => dm || !l.hidden).slice(-250);
  return {
    campaign: { id: c.id, name: c.name }, ruleset: rsOut, me: { role: who.role, charId: who.charId || null },
    entities, tokens, drawings: c.drawings, scene: c.scene,
    combat: { active: c.combat.active, round: c.combat.round, turn: c.combat.turn, order: c.combat.order.filter((o) => entities[o.eid]) },
    tabData, sessionNotes: c.sessionNotes, logs: { rolls: lg(c.logs.rolls), actions: lg(c.logs.actions), custom: lg(c.logs.custom) }, online,
  };
}
function campaignSummary(c) {
  return {
    id: c.id, name: c.name, created: c.created, ruleset: c.rs.name, rulesetShort: c.rs.short, rollSystem: c.rs.rollSystem,
    characters: Object.values(c.entities).filter((e) => e.kind === 'pc').map((e) => ({ id: e.id, name: e.name, icon: e.icon, color: e.color, level: e.level, classLabel: classLabel(c, e) })),
  };
}

module.exports = {
  GameError, fail, uid, str, clampInt, hashPw, checkPw, validateRuleset, newCampaign, makeEntity, patchEntity, prepItem, prepActions, createCharacterEntity, placeToken,
  pushLog, applyDelta, applyStatus, removeStatus, useAction, useItem, rollCheck, diceRoll, combatOp, snapshotFor, campaignSummary, allowedFor, canControl, toBase, fromBase, defaultTab,
};
