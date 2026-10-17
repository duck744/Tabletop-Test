'use strict';
/**
 * Ruleset engine: safe formula/dice evaluator + character computation + roll resolution.
 * Everything a ruleset does is data: formulas are strings evaluated here (no eval()).
 */
const { randomInt } = require('crypto');

// ------------------------------------------------------------------ tokenizer
function tokenize(src) {
  const s = String(src ?? '');
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    if (/^\s/.test(rest)) { i++; continue; }
    let m = /^(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d+))?(?![A-Za-z_0-9])/i.exec(rest);
    if (m) {
      toks.push({ t: 'dice', count: m[1] === '' ? 1 : parseInt(m[1], 10), sides: m[2] === '%' ? 100 : parseInt(m[2], 10), keep: m[3] ? m[3].toLowerCase() : null, kn: m[4] ? parseInt(m[4], 10) : null });
      i += m[0].length; continue;
    }
    m = /^\d+(\.\d+)?/.exec(rest);
    if (m) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    m = /^@?[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    if (m) { toks.push({ t: 'id', v: m[0].replace(/^@/, '') }); i += m[0].length; continue; }
    m = /^('([^']*)'|"([^"]*)")/.exec(rest);
    if (m) { toks.push({ t: 'str', v: m[2] ?? m[3] }); i += m[0].length; continue; }
    m = /^(\|\||&&|==|!=|>=|<=|[-+*\/%()<>,!])/.exec(rest);
    if (m) { toks.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
    throw new Error('Unexpected character "' + rest[0] + '" in formula: ' + s);
  }
  return toks;
}

// ------------------------------------------------------------------ parser
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  function primary() {
    const t = toks[p++];
    if (!t) throw new Error('Unexpected end of formula: ' + src);
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'dice') return { k: 'dice', ...t };
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) { do { args.push(or()); } while (isOp(',') && ++p); }
        if (!isOp(')')) throw new Error('Missing ) in ' + src);
        p++;
        return { k: 'call', name: t.v.toLowerCase(), args };
      }
      return { k: 'var', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = or();
      if (!isOp(')')) throw new Error('Missing ) in ' + src);
      p++; return e;
    }
    throw new Error('Unexpected "' + (t.v ?? t.t) + '" in ' + src);
  }
  function unary() {
    if (isOp('-') || isOp('+') || isOp('!')) { const op = toks[p++].v; return { k: 'un', op, a: unary() }; }
    return primary();
  }
  function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: unary() }; } return l; }
  function add() { let l = mul(); while (isOp('+') || isOp('-')) { const op = toks[p++].v; l = { k: 'bin', op, l, r: mul() }; } return l; }
  function cmp() { let l = add(); while (['==', '!=', '>=', '<=', '>', '<'].some(isOp)) { const op = toks[p++].v; l = { k: 'bin', op, l, r: add() }; } return l; }
  function and() { let l = cmp(); while (isOp('&&')) { p++; l = { k: 'bin', op: '&&', l, r: cmp() }; } return l; }
  function or() { let l = and(); while (isOp('||')) { p++; l = { k: 'bin', op: '||', l, r: and() }; } return l; }
  const ast = or();
  if (p < toks.length) throw new Error('Unexpected trailing input in formula: ' + src);
  return ast;
}
const astCache = new Map();
function getAst(src) {
  const key = String(src);
  let a = astCache.get(key);
  if (!a) { a = parse(key); if (astCache.size > 5000) astCache.clear(); astCache.set(key, a); }
  return a;
}

// ------------------------------------------------------------------ evaluator
function d(sides) { return randomInt(1, Math.max(2, sides + 1)); }
function rollDice(count, sides, keep, kn, ctx, src) {
  count = Math.max(0, Math.min(200, Math.floor(count)));
  sides = Math.max(1, Math.min(1000, Math.floor(sides)));
  if (!count) return 0;
  const rolls = []; for (let i = 0; i < count; i++) rolls.push(sides === 1 ? 1 : d(sides));
  const kept = rolls.map(() => true);
  if (keep) {
    const n = Math.max(0, Math.min(count, kn ?? 1));
    const idx = rolls.map((v, i) => i).sort((a, b) => rolls[a] - rolls[b]);
    kept.fill(false);
    let chosen;
    if (keep === 'kh') chosen = idx.slice(count - n);
    else if (keep === 'kl') chosen = idx.slice(0, n);
    else if (keep === 'dl') chosen = idx.slice(n);
    else chosen = idx.slice(0, count - n); // dh
    chosen.forEach((i) => (kept[i] = true));
  }
  const total = rolls.reduce((a, v, i) => a + (kept[i] ? v : 0), 0);
  ctx.dice.push({ expr: src || `${count}d${sides}`, sides, results: rolls, kept });
  return total;
}
function num(v) { if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v !== 'number' || !isFinite(v)) return 0; return Math.round(v * 1e6) / 1e6; }
function ev(n, sc, ctx) {
  switch (n.k) {
    case 'num': return n.v;
    case 'str': return n.v;
    case 'var': { const v = sc[n.name]; return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0; }
    case 'dice': return rollDice(n.count * (ctx.critDouble ? 2 : 1), n.sides, n.keep, n.kn, ctx, `${n.count}d${n.sides}${n.keep ? n.keep + n.kn : ''}`);
    case 'un': { const a = num(ev(n.a, sc, ctx)); return n.op === '-' ? -a : n.op === '!' ? (a ? 0 : 1) : a; }
    case 'bin': {
      if (n.op === '&&') return num(ev(n.l, sc, ctx)) && num(ev(n.r, sc, ctx)) ? 1 : 0;
      if (n.op === '||') return num(ev(n.l, sc, ctx)) || num(ev(n.r, sc, ctx)) ? 1 : 0;
      const a = num(ev(n.l, sc, ctx)), b = num(ev(n.r, sc, ctx));
      switch (n.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b; case '%': return b === 0 ? 0 : a % b;
        case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0; case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0; case '<': return a < b ? 1 : 0;
      }
      return 0;
    }
    case 'call': {
      const A = n.args;
      const v = (i) => num(ev(A[i], sc, ctx));
      switch (n.name) {
        case 'floor': return Math.floor(v(0));
        case 'ceil': return Math.ceil(v(0));
        case 'round': return Math.round(v(0));
        case 'abs': return Math.abs(v(0));
        case 'min': return Math.min(...A.map((_, i) => v(i)));
        case 'max': return Math.max(...A.map((_, i) => v(i)));
        case 'if': return v(0) ? v(1) : (A[2] ? v(2) : 0);
        case 'dice': return rollDice(v(0) * (ctx.critDouble ? 2 : 1), v(1), null, null, ctx, `${v(0)}d${v(1)}`);
        case 'tbl': {
          const name = A[0].k === 'str' ? A[0].v : '';
          const table = (ctx.tables || {})[name]; const row = Math.floor(v(1)), col = Math.floor(v(2)) || 1;
          if (!table || row < 1) return 0;
          const r = table[Math.min(row, table.length) - 1];
          return Array.isArray(r) ? num(r[col - 1] ?? 0) : num(r);
        }
        default: return 0;
      }
    }
  }
  return 0;
}
/** evaluate(src, scope, {critDouble, tables}) -> {value, dice} */
function evaluate(src, scope = {}, opts = {}) {
  const ctx = { dice: [], critDouble: !!opts.critDouble, tables: opts.tables || {} };
  if (typeof src === 'number') return { value: src, dice: [] };
  if (src == null || String(src).trim() === '') return { value: 0, dice: [] };
  try { return { value: num(ev(getAst(src), scope, ctx)), dice: ctx.dice }; }
  catch (e) { return { value: 0, dice: ctx.dice, error: e.message }; }
}
function calc(src, scope, tables) { return evaluate(src, scope, { tables }).value; }
function validateFormula(src) { try { getAst(src); return null; } catch (e) { return e.message; } }

// ------------------------------------------------------------------ ruleset helpers
function findItem(rs, ref) { return (rs.items || []).find((i) => i.key === ref); }
function resolveItem(rs, inv) { const base = inv.ref ? findItem(rs, inv.ref) || {} : {}; return { ...base, ...inv }; }
function findAction(rs, ref) { return (rs.actions || []).find((a) => a.key === ref); }
function resolveAction(rs, a) {
  if (typeof a === 'string') a = { ref: a };
  const base = a.ref ? findAction(rs, a.ref) || {} : {};
  return { ...base, ...a, id: a.id || a.ref || a.key, key: a.key || a.ref || a.id };
}
function chosenOptions(rs, ent) {
  const out = [];
  for (const grp of rs.choices || []) {
    const k = ent.choices && ent.choices[grp.key];
    const opt = (grp.options || []).find((o) => o.key === k);
    if (opt) out.push({ group: grp, opt });
  }
  return out;
}
function statusDef(rs, key) { return (rs.statuses || []).find((s) => s.key === key); }

/** Collect modifiers from every source. mod = {target, add, label} */
function collectMods(rs, ent) {
  const mods = [];
  for (const { opt } of chosenOptions(rs, ent)) for (const m of opt.mods || []) mods.push({ ...m, label: opt.name });
  for (const [k, v] of Object.entries(ent.asi || {})) mods.push({ target: k, add: v, label: 'Ability Score Increase' });
  for (const inv of ent.inventory || []) {
    if (!inv.equipped) continue;
    const it = resolveItem(rs, inv);
    for (const m of it.mods || []) mods.push({ ...m, label: it.name });
  }
  for (const st of ent.status || []) {
    const def = statusDef(rs, st.key);
    if (def) for (const m of def.mods || []) mods.push({ ...m, label: def.name });
  }
  for (const m of ent.mods || []) mods.push({ ...m, label: m.label || 'Custom bonus' });
  return mods;
}

/** compute(rs, ent) -> everything derived from the raw entity data */
function compute(rs, ent) {
  const T = rs.tables || {};
  const scope = { level: ent.level || 1, ...(rs.varDefaults || {}) };
  const mods = collectMods(rs, ent);
  const opts = chosenOptions(rs, ent);
  const deferred = [];
  for (const { opt } of opts) for (const [k, v] of Object.entries(opt.vars || {})) (typeof v === 'number' ? (scope[k] = v) : deferred.push([k, v]));
  for (const inv of ent.inventory || []) {
    if (!inv.equipped) continue;
    const it = resolveItem(rs, inv);
    for (const [k, v] of Object.entries(it.vars || {})) if (typeof v === 'number') scope[k] = v;
  }
  const sumMods = (target, sc) => mods.filter((m) => m.target === target).reduce((a, m) => a + calc(m.add, sc, T), 0);

  // abilities
  const abilities = {};
  for (const a of rs.abilities || []) {
    let base = ent.abilities && ent.abilities[a.key];
    if (base == null || isNaN(base)) base = a.default ?? 10;
    scope[a.key] = base;
    scope[a.key] = base;
    const score = Math.round(base + sumMods(a.key, scope));
    const mod = calc(rs.abilityMod || 'floor((score-10)/2)', { score }, T);
    abilities[a.key] = { score, mod, base };
    scope[a.key] = score; scope[a.key + '_mod'] = mod;
  }
  for (const [k, v] of deferred) scope[k] = calc(v, scope, T);

  const fixed = ent.fixed || {};
  const derived = {}; const derivedVisible = {};
  const doDerived = (late) => {
    for (const dd of rs.derived || []) {
      if (!!dd.late !== late) continue;
      let v = fixed.derived && fixed.derived[dd.key] != null ? fixed.derived[dd.key] : calc(dd.formula, scope, T);
      v += sumMods(dd.key, scope);
      derived[dd.key] = Math.round(v * 100) / 100; scope[dd.key] = derived[dd.key];
      derivedVisible[dd.key] = dd.show == null || dd.show === '' ? true : !!calc(dd.show, scope, T);
    }
  };
  doDerived(false);

  // skills
  const grants = new Set(); const classSkills = new Set(); const proficientSaves = new Set();
  for (const { opt } of opts) { (opt.skills || []).forEach((s) => grants.add(s)); (opt.classSkills || []).forEach((s) => classSkills.add(s)); (opt.saves || []).forEach((s) => proficientSaves.add(s)); }
  const skills = {};
  const abilVal = (key) => (abilities[key] ? abilities[key].mod : 0);
  for (const s of rs.skills || []) {
    const sc = { ...scope, abil: abilVal(s.ability), prof: Math.max((ent.skillProf && ent.skillProf[s.key]) || 0, grants.has(s.key) ? 1 : 0), rank: (ent.skillRanks && ent.skillRanks[s.key]) || 0, cls: classSkills.has(s.key) ? 1 : 0 };
    sc.base = calc(s.base ?? 0, scope, T);
    let v = calc(rs.skillFormula || 'abil + prof*pb', sc, T);
    v += sumMods('skill:' + s.key, scope) + sumMods('skills', scope);
    skills[s.key] = Math.round(v); scope['s_' + s.key] = skills[s.key];
  }
  const saves = {};
  for (const s of rs.saves || []) {
    const sc = { ...scope, abil: abilVal(s.ability), proficient: proficientSaves.has(s.key) ? 1 : 0 };
    let v = calc(rs.saveFormula || 'abil + proficient*pb', sc, T);
    v += sumMods('save:' + s.key, scope) + sumMods('saves', scope);
    saves[s.key] = Math.round(v); scope['sv_' + s.key] = saves[s.key];
  }
  doDerived(true);

  // resources
  const resources = {};
  for (const r of rs.resources || []) {
    let max = fixed.resourceMax && fixed.resourceMax[r.key] != null ? fixed.resourceMax[r.key] : calc(r.max, scope, T) + sumMods('max:' + r.key, scope);
    max = Math.max(0, Math.floor(max));
    let cur = ent.res ? ent.res[r.key] : undefined;
    if (cur == null) cur = r.start != null && r.start !== '' ? calc(r.start, scope, T) : max;
    cur = Math.max(0, Math.min(max, Math.floor(cur)));
    const visible = r.show == null || r.show === '' ? true : !!calc(r.show, { ...scope, [r.key + '_max']: max }, T);
    resources[r.key] = { cur, max, visible };
    scope[r.key + '_cur'] = cur; scope[r.key + '_max'] = max;
  }
  const rolls = {};
  for (const r of rs.rolls || []) rolls[r.key] = Math.round(calc(r.target, scope, T));
  return { scope, abilities, derived, derivedVisible, skills, saves, resources, rolls, mods };
}

/** All actions an entity can take: explicit ones + attacks generated by equipped weapons. */
function allActions(rs, ent) {
  const out = (ent.actions || []).map((a) => resolveAction(rs, a));
  for (const inv of ent.inventory || []) {
    if (!inv.equipped) continue;
    const it = resolveItem(rs, inv);
    if (it.damage || it.attack != null && it.attack !== '') {
      out.push({ id: 'item:' + inv.id, key: 'item:' + inv.id, name: it.name, kind: 'weapon', attack: it.attack, damage: it.damage, damageType: it.damageType, uses: it.uses || (rs.combat && rs.combat.weaponUses) || 'action', desc: it.desc, crit: it.crit, range: it.range, fromItem: true });
    }
  }
  return out;
}

// ------------------------------------------------------------------ rolling
function rollDie(sides) { return d(sides); }
function d100Check(target, mode) {
  const units = randomInt(0, 10);
  const extra = Math.abs(mode || 0);
  const tens = [randomInt(0, 10) * 10]; for (let i = 0; i < extra; i++) tens.push(randomInt(0, 10) * 10);
  let t = mode > 0 ? Math.min(...tens) : mode < 0 ? Math.max(...tens) : tens[0];
  let value = t + units; if (value === 0) value = 100;
  let level = 'Failure', crit = null;
  if (value === 1) { level = 'Critical Success'; crit = 'crit'; }
  else if (value <= Math.floor(target / 5)) level = 'Extreme Success';
  else if (value <= Math.floor(target / 2)) level = 'Hard Success';
  else if (value <= target) level = 'Success';
  else if ((target < 50 && value >= 96) || value === 100) { level = 'Fumble'; crit = 'fail'; }
  return { value, level, crit, tens, units };
}
const LEVEL_RANK = { 'Fumble': 0, 'Failure': 1, 'Success': 2, 'Hard Success': 3, 'Extreme Success': 4, 'Critical Success': 5 };

/** Combine advantage state from a request and the entity's status effects. */
function rollState(rs, ent, kind, adv) {
  let a = adv === 'adv' ? 1 : 0, dis = adv === 'dis' ? 1 : 0;
  for (const st of ent.status || []) {
    const def = statusDef(rs, st.key); const m = def && def.rollMods && def.rollMods[kind];
    if (m === 'adv') a++; if (m === 'dis') dis++;
  }
  return a && !dis ? 'adv' : dis && !a ? 'dis' : null;
}

/**
 * Resolve a check. req: {value, label, system, adv, bonus, dc, crit:{min}, difficulty, kind}
 * system 'd20' => value is a modifier. system 'd100' => value is the target number.
 */
function resolveCheck(rs, req) {
  const system = rs.rollSystem || 'd20';
  const bonus = Number(req.bonus) || 0;
  const parts = [];
  if (system === 'd100') {
    const target = Math.max(0, Math.round(req.value + bonus));
    const mode = req.adv === 'adv' ? 1 : req.adv === 'dis' ? -1 : 0;
    const r = d100Check(target, mode);
    parts.push({ label: req.label || 'Target', value: req.value });
    if (bonus) parts.push({ label: 'Bonus', value: bonus });
    let success = r.level !== 'Failure' && r.level !== 'Fumble';
    if (req.difficulty && LEVEL_RANK[req.difficulty] != null) success = LEVEL_RANK[r.level] >= LEVEL_RANK[req.difficulty];
    return { system, die: 'd100', rolls: [r.value], tens: r.tens, units: r.units, mode, target, total: r.value, level: r.level, crit: r.crit, success, parts, adv: req.adv || null, difficulty: req.difficulty || null };
  }
  const n = req.adv ? 2 : 1;
  const rolls = []; for (let i = 0; i < n; i++) rolls.push(d(20));
  const nat = req.adv === 'adv' ? Math.max(...rolls) : req.adv === 'dis' ? Math.min(...rolls) : rolls[0];
  parts.push({ label: 'd20', value: nat });
  parts.push({ label: req.label || 'Modifier', value: req.value });
  if (bonus) parts.push({ label: 'Bonus', value: bonus });
  const total = nat + req.value + bonus;
  const critMin = (req.crit && req.crit.min) || (rs.crit && rs.crit.max) || 20;
  const critFail = (rs.crit && rs.crit.min) || 1;
  let crit = null;
  if (nat >= critMin) crit = 'crit'; else if (nat <= critFail) crit = 'fail';
  let success = null;
  if (req.dc != null && req.dc !== '') {
    success = total >= Number(req.dc);
    if (rs.crit && rs.crit.autoSuccess && req.kind === 'attack') { if (nat === 20) success = true; if (nat === 1) success = false; }
  }
  return { system, die: 'd20', rolls, nat, adv: req.adv || null, total, mod: req.value, bonus, crit, success, dc: req.dc ?? null, parts };
}

module.exports = { evaluate, calc, validateFormula, compute, allActions, resolveItem, resolveAction, findItem, findAction, statusDef, chosenOptions, collectMods, resolveCheck, rollState, rollDie, rollDice, d100Check, LEVEL_RANK };
