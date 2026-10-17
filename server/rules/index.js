'use strict';
const PRESETS = { dnd5e: require('./dnd5e'), pf1e: require('./pf1e'), coc7e: require('./coc7e'), custom: require('./blank') };
const clone = (o) => JSON.parse(JSON.stringify(o));
function listPresets() { return Object.values(PRESETS).map((r) => ({ id: r.id, name: r.name, short: r.short, desc: r.desc })); }
function getPreset(id) { return PRESETS[id] ? clone(PRESETS[id]) : null; }
/** Fill any missing sections so a hand-edited ruleset never crashes the engine. */
function normalizeRuleset(rs) {
  rs = clone(rs || {});
  const arr = ['abilities', 'derived', 'skills', 'saves', 'resources', 'choices', 'items', 'actions', 'statuses', 'npcs', 'tabs', 'currency', 'rolls', 'alignments'];
  for (const k of arr) if (!Array.isArray(rs[k])) rs[k] = [];
  rs.name = String(rs.name || 'Custom Ruleset').slice(0, 80);
  rs.short = String(rs.short || rs.name).slice(0, 40);
  rs.rollSystem = rs.rollSystem === 'd100' ? 'd100' : 'd20';
  rs.crit = rs.crit || (rs.rollSystem === 'd100' ? { max: 1, min: 100 } : { max: 20, min: 1 });
  rs.grid = { unit: 'ft', cell: 5, distance: 'chebyshev', ...(rs.grid || {}) };
  rs.tables = rs.tables || {}; rs.varDefaults = rs.varDefaults || {};
  rs.abilityMod = rs.abilityMod || 'floor((score-10)/2)';
  rs.initiative = { roll: 'd20', stat: 'init', ...(rs.initiative || {}) };
  rs.combat = { autoResolve: true, hp: (rs.resources[0] || {}).key, defense: null, critMode: 'dice', moveStat: 'speed', weaponUses: 'action', hideNpcStats: true, turn: [{ key: 'action', name: 'Action', count: 1 }], ...(rs.combat || {}) };
  rs.creation = { startLevel: 1, abilityMethods: ['manual', 'roll'], standardArray: [15, 14, 13, 12, 10, 8], steps: ['basics', 'class', 'abilities', 'skills', 'equipment', 'actions', 'review'], ...(rs.creation || {}) };
  rs.skillMode = rs.skillMode || 'ranks';
  rs.skillFormula = rs.skillFormula || 'abil + rank';
  rs.saveFormula = rs.saveFormula || 'abil';
  rs.customLogName = rs.customLogName || 'Gifts & Trade';
  if (!rs.currency.length) rs.currency = [{ key: 'gold', name: 'Gold' }];
  for (const grp of rs.choices) { grp.options = Array.isArray(grp.options) ? grp.options : []; }
  return rs;
}
module.exports = { listPresets, getPreset, normalizeRuleset, PRESETS };
