'use strict';
// End-to-end smoke test over real WebSockets (needs Node 22+ for the global WebSocket client).
const os = require('os'), fs = require('fs'), path = require('path');
process.env.TABLETOP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
const { server } = require('./index');
const assert = require('assert');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✓ ' + m); };

function client(port) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port); let n = 0; const waits = new Map(); const events = []; const o = { events, state: null, ws };
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
      if (m.t === 'reply') { const w = waits.get(m.rid); if (w) { waits.delete(m.rid); m.ok ? w.res(m.data) : w.rej(new Error(m.error)); } }
      else { if (m.t === 'state') o.state = m.s; events.push(m); } };
    o.req = (msg) => new Promise((rs, rj) => { const id = ++n; waits.set(id, { res: rs, rej: rj }); ws.send(JSON.stringify({ ...msg, rid: id })); });
    o.fails = async (msg) => { try { await o.req(msg); return null; } catch (e) { return e.message; } };
    ws.onopen = () => res(o);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r)); const port = server.address().port;
  console.log('Smoke test on port ' + port);
  const lobby = await client(port);
  const { presets } = await lobby.req({ t: 'presets' }); ok(presets.length === 4, '4 rulesets available');
  const { campaign } = await lobby.req({ t: 'createCampaign', name: 'Test Campaign', rulesetId: 'dnd5e' }); ok(campaign.id, 'campaign created');
  ok((await lobby.req({ t: 'list' })).campaigns[0].ruleset.includes('D&D'), 'campaign listed with ruleset');
  for (const id of ['pf1e', 'coc7e', 'custom']) { const r = await lobby.req({ t: 'createCampaign', name: id, rulesetId: id }); ok(r.campaign.id, `${id} campaign creates`); }
  ok(/formula errors/i.test(await lobby.fails({ t: 'createCampaign', name: 'bad', ruleset: { name: 'x', abilities: [{ key: 'a', name: 'A' }], derived: [{ key: 'z', formula: '2+*' }] } })), 'bad custom formula rejected');

  // character creation + validation
  const p1 = await client(port);
  const base = { name: 'Brakka', password: 'pw1', abilityMethod: 'standard', level: 1, choices: { class: 'fighter', species: 'human', background: 'soldier' },
    abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 }, asi: { str: 2, con: 1 }, skillProf: { perception: 1, insight: 1, survival: 1 },
    inventory: [{ ref: 'chain_mail', qty: 1, equipped: true }, { ref: 'longsword', qty: 1, equipped: true }, { ref: 'shield', qty: 1, equipped: true }, { ref: 'light_crossbow', qty: 1 }], actions: ['second_wind'], icon: '⚔️', color: '#c53131' };
  ok(/point-buy|Standard array/i.test(await p1.fails({ t: 'createCharacter', campaignId: campaign.id, character: { ...base, abilities: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 } } })), 'cheated ability scores rejected');
  ok(/skill points/i.test(await p1.fails({ t: 'createCharacter', campaignId: campaign.id, character: { ...base, skillProf: { perception: 1, insight: 1, survival: 1, stealth: 1, arcana: 1 } } })), 'too many skills rejected');
  ok(/password/i.test(await p1.fails({ t: 'createCharacter', campaignId: campaign.id, character: { ...base, password: '' } })), 'password required');
  const made = await p1.req({ t: 'createCharacter', campaignId: campaign.id, character: base }); ok(made.charId && made.token, 'character created and logged in');
  await sleep(80);
  const me = p1.state.entities[made.charId];
  ok(me.defense === 18, `AC computed (chain mail + shield = ${me.defense})`);
  ok(me.comp.abilities.str.score === 17 && me.comp.abilities.str.mod === 3, 'ability scores incl. background ASI (STR 17, +3)');
  ok(me.res.hp.max === 12, `HP computed (${me.res.hp.max}) — d10 + CON mod 2`);
  ok(me.comp.skills.perception >= 3, `perception proficient (${me.comp.skills.perception})`);
  ok(me.actions.some((a) => a.name === 'Longsword' && a.atkVal === 5), 'equipped longsword generates attack (+5)');
  ok(Object.keys(p1.state.tokens).length === 1, 'character token placed on map');
  ok(p1.state.entities && !Object.values(p1.state.entities).some((e) => e.kind === 'npc'), 'players do not receive the NPC library');
  ok(p1.state.ruleset.npcs.length === 0, 'players do not receive ruleset NPC data');

  // login rules
  const p1b = await client(port);
  ok(/Wrong password/.test(await p1b.fails({ t: 'login', campaignId: campaign.id, role: 'player', characterId: made.charId, password: 'nope' })), 'wrong character password rejected');
  ok((await p1b.req({ t: 'login', campaignId: campaign.id, role: 'player', characterId: made.charId, password: 'pw1' })).role === 'player', 'player logs back in');
  const dm = await client(port);
  ok(/Wrong DM/.test(await dm.fails({ t: 'login', campaignId: campaign.id, role: 'dm', password: 'x' })), 'wrong DM password rejected');
  await dm.req({ t: 'login', campaignId: campaign.id, role: 'dm', password: 'dm123' }); await sleep(80);
  ok(Object.values(dm.state.entities).filter((e) => e.kind === 'npc').length >= 20, 'DM receives the NPC library (20 creatures)');

  // permissions
  ok(/Only the DM/.test(await p1.fails({ t: 'entityEdit', eid: made.charId, patch: { level: 20 } })), 'player cannot edit own sheet');
  ok(/Only the DM/.test(await p1.fails({ t: 'sceneSet', patch: { cell: 20 } })), 'player cannot change map');
  ok(/Only the DM/.test(await p1.fails({ t: 'spawn', npcId: 'n_goblin' })), 'player cannot spawn creatures');
  ok(/Only the DM/.test(await p1.fails({ t: 'give', eid: made.charId, currency: { gp: 999 } })), 'player cannot give themselves gold');

  // DM spawns goblins, starts combat
  await dm.req({ t: 'spawn', npcId: 'n_goblin', count: 2 }); await sleep(80);
  const insts = Object.values(dm.state.entities).filter((e) => e.kind === 'inst'); ok(insts.length === 2 && insts[0].name === 'Goblin Warrior 1', 'DM spawned 2 goblins (numbered automatically)');
  ok(Object.values(p1.state.entities).filter((e) => e.kind === 'inst').length === 2, 'players see spawned goblins');
  const goblin = insts[0];
  ok(p1.state.entities[goblin.id].res.hp.label && p1.state.entities[goblin.id].res.hp.cur === undefined, 'players see goblin health as a label, not numbers');
  await dm.req({ t: 'combat', op: 'start' }); await sleep(80);
  ok(dm.state.combat.active && dm.state.combat.order.length === 3, 'combat started with 3 combatants in initiative order');
  ok(p1.events.some((e) => e.t === 'initAnim'), 'initiative animation event broadcast');
  const t0 = dm.state.combat.order[dm.state.combat.turn].eid;

  // player acts: only on own turn
  const own = made.charId; const sword = me.actions.find((a) => a.name === 'Longsword');
  if (t0 !== own) ok(/turn/i.test(await p1.fails({ t: 'action', eid: own, actionId: sword.id, targets: [goblin.id] })), 'player blocked from acting out of turn');
  while (dm.state.combat.order[dm.state.combat.turn].eid !== own) { await dm.req({ t: 'combat', op: 'next' }); await sleep(30); }
  ok(/own character/.test(await p1.fails({ t: 'action', eid: goblin.id, actionId: 'x' })), "player can't act for a goblin");
  await p1.req({ t: 'action', eid: own, actionId: sword.id, targets: [goblin.id] }); await sleep(80);
  const rollLogs = p1.events.filter((e) => e.t === 'log' && e.kind === 'rolls'); ok(rollLogs.some((e) => e.entry.kind2 === 'attack'), 'attack roll appears in the roll log');
  const atk = rollLogs.find((e) => e.entry.kind2 === 'attack').entry; ok(atk.total === atk.nat + 5 && atk.dc === 15, `attack = d20(${atk.nat}) + 5 vs goblin AC 15 → ${atk.total}`);
  ok(/No action left|action/i.test(await p1.fails({ t: 'action', eid: own, actionId: sword.id, targets: [goblin.id] })), 'second action blocked (1 action per turn)');
  // end turn, status ticking
  await p1.req({ t: 'combat', op: 'next' }); ok(true, 'player can end their own turn');
  await dm.req({ t: 'status', eid: goblin.id, key: 'burning', turns: 2 }); await sleep(60);
  const hp1 = dm.state.entities[goblin.id].res.hp.cur;
  do { await dm.req({ t: 'combat', op: 'next' }); await sleep(30); } while (dm.state.combat.order[dm.state.combat.turn].eid !== goblin.id);
  await sleep(60);
  ok(dm.state.entities[goblin.id].res.hp.cur < hp1 || hp1 === 0, `Burning ticks automatically at turn start (${hp1} → ${dm.state.entities[goblin.id].res.hp.cur})`);
  await dm.req({ t: 'status', eid: made.charId, key: 'stunned' }); await sleep(60);
  ok(dm.state.entities[made.charId].allowed.action === 0, 'Stunned status removes the action budget automatically');
  await dm.req({ t: 'status', eid: made.charId, key: 'stunned', op: 'remove' });

  // spells, saves, slots (wizard)
  const w = await client(port);
  const wiz = await w.req({ t: 'createCharacter', campaignId: campaign.id, character: { name: 'Mirel', password: 'abc', abilityMethod: 'standard', choices: { class: 'wizard', species: 'elf', background: 'sage' }, abilities: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 }, asi: { int: 2, con: 1 }, skillProf: { investigation: 1, medicine: 1 }, inventory: [{ ref: 'quarterstaff', qty: 1 }, { ref: 'dagger', qty: 1 }, { ref: 'spellbook', qty: 1 }, { ref: 'arcane_focus', qty: 1 }], actions: ['fire_bolt', 'magic_missile', 'shield', 'burning_hands'] } }); await sleep(80);
  const wv = w.state.entities[wiz.charId]; ok(wv.res.slot1.max === 2 && !wv.res.slot2, 'wizard L1 has 2 first-level slots, no level 2');
  ok(wv.comp.derived.spelldc === 8 + 2 + 3 && wv.comp.derived.spellatk === 5, `spell DC ${wv.comp.derived.spelldc} / attack +${wv.comp.derived.spellatk}`);
  await dm.req({ t: 'combat', op: 'add', eid: wiz.charId }); await dm.req({ t: 'combat', op: 'setTurn', eid: wiz.charId }); await sleep(60);
  const mm = wv.actions.find((a) => a.name === 'Magic Missile');
  const gHp = () => dm.state.entities[insts[1].id].res.hp.cur; const g2 = gHp();
  await w.req({ t: 'action', eid: wiz.charId, actionId: mm.id, targets: [insts[1].id] }); await sleep(80);
  ok(w.state.entities[wiz.charId].res.slot1.cur === 1, 'Magic Missile spent a spell slot'); ok(gHp() < g2 || g2 <= 0, `Magic Missile auto-hit damaged the goblin (${g2} → ${gHp()})`);
  await dm.req({ t: 'combat', op: 'refresh', eid: wiz.charId });
  await w.req({ t: 'action', eid: wiz.charId, actionId: wv.actions.find((a) => a.name === 'Burning Hands').id, targets: [insts[0].id, insts[1].id] }); await sleep(80);
  ok(w.events.some((e) => e.t === 'log' && e.entry.kind2 === 'save'), 'Burning Hands rolled a Dex save for each target');
  await dm.req({ t: 'combat', op: 'refresh', eid: wiz.charId });
  ok(/Not enough/.test(await w.fails({ t: 'action', eid: wiz.charId, actionId: mm.id, targets: [] })), 'slots run out');

  // hidden DM logs
  await dm.req({ t: 'adjust', eid: insts[1].id, res: 'hp', delta: -1, hidden: true }); await sleep(60);
  ok(!p1.events.some((e) => e.t === 'log' && e.entry.hidden), 'hidden DM actions are not sent to players');
  ok(dm.events.some((e) => e.t === 'log' && e.entry.hidden), 'hidden DM actions are sent to the DM');
  // dice tray
  await p1.req({ t: 'dice', groups: [{ count: 2, sides: 6 }, { count: 1, sides: 20 }], mod: 3 }); await sleep(60);
  const dl = p1.events.filter((e) => e.t === 'log' && e.entry.kind2 === 'dice').pop().entry; ok(dl.total === dl.groups[0].results.reduce((a, b) => a + b) + dl.groups[1].results[0] + 3, `dice tray total correct (${dl.total})`);
  await dm.req({ t: 'dice', groups: [{ count: 1, sides: 100 }], popup: true }); await sleep(60);
  ok(p1.events.some((e) => e.t === 'log' && e.entry.popup), 'DM broadcast roll reaches players');
  // shop / gifts
  await dm.req({ t: 'give', eid: made.charId, currency: { gp: 100 } }); await sleep(40);
  const shop = dm.state.tabData.shop.items[0]; const gp0 = dm.state.entities[made.charId].currency.gp;
  await p1.req({ t: 'buy', tabId: 'shop', itemId: shop.id, qty: 1 }); await sleep(60);
  ok(dm.state.entities[made.charId].currency.gp < gp0, 'shop purchase deducted currency');
  await p1.req({ t: 'gift', to: wiz.charId, currency: { gp: 5 } }); await sleep(60);
  ok(dm.state.entities[wiz.charId].currency.gp >= 5, 'player-to-player gift works');
  // map
  await p1.req({ t: 'drawAdd', shape: { kind: 'circle', x: 100, y: 100, r: 150, color: '#00ff88' } }); await sleep(60); ok(dm.events.some((e) => e.t === 'drawAdded'), 'drawing shared with DM');
  const tok = Object.values(p1.state.tokens).find((t) => t.eid === made.charId);
  await p1.req({ t: 'tokenMove', id: tok.id, x: 333, y: 212 }); await sleep(40); ok(dm.events.some((e) => e.t === 'tokenMoved' && e.x === 350 && e.y === 210), 'token move snapped to grid and broadcast');
  const goblinTok = Object.values(p1.state.tokens).find((t) => t.eid === goblin.id);
  ok(/own character/.test(await p1.fails({ t: 'tokenMove', id: goblinTok.id, x: 0, y: 0 })), "player can't move creatures");
  const { db } = require('./store'); ok(Object.keys(db.campaigns).length === 4, 'campaigns held in the store');
  // other rulesets
  const camps = (await lobby.req({ t: 'list' })).campaigns; const pfc = camps.find((c) => c.name === 'pf1e'), cocc = camps.find((c) => c.name === 'coc7e');
  const pf = await client(port);
  await pf.req({ t: 'createCharacter', campaignId: pfc.id, character: { name: 'Valeros', password: 'pf!', abilityMethod: 'pointbuy', choices: { class: 'fighter', race: 'human' }, abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 10, cha: 8 }, asi: { str: 2 }, skillRanks: { climb: 1, swim: 1 }, inventory: [{ ref: 'longsword', equipped: true }, { ref: 'chainmail', equipped: true }, { ref: 'heavy_steel_shield', equipped: true }], actions: [] } }); await sleep(80);
  const pv = Object.values(pf.state.entities)[0]; ok(pv.defense === 18, `Pathfinder AC computed (${pv.defense} = 10 + 5 chainmail + 2 shield + 1 dex cap)`); ok(pv.comp.derived.bab === 1 && pv.res.hp.max === 12, `Pathfinder BAB +1, HP ${pv.res.hp.max}`);
  const coc = await client(port);
  await coc.req({ t: 'createCharacter', campaignId: cocc.id, character: { name: 'Dr. Armitage', password: 'miskatonic', abilityMethod: 'manual', choices: { occupation: 'professor', age: 'young' }, abilities: { str: 50, con: 60, siz: 65, dex: 55, app: 50, int: 75, pow: 65, edu: 80, luck: 55 }, skillRanks: { library: 40, history: 30, occult: 20, psychology: 20, lang_other: 30 }, inventory: [{ ref: 'notebook', qty: 1 }], actions: [] } }); await sleep(80);
  const cv = Object.values(coc.state.entities)[0]; ok(cv.res.hp.max === 12 && cv.res.mp.max === 13 && cv.res.san.cur === 65, `CoC derived: HP ${cv.res.hp.max}, MP ${cv.res.mp.max}, SAN ${cv.res.san.cur}`);
  ok(cv.comp.skills.library === 60 && cv.comp.skills.dodge === 27, `CoC skills: Library Use ${cv.comp.skills.library}, Dodge ${cv.comp.skills.dodge} (half DEX)`);
  await coc.req({ t: 'roll', eid: cv.id, kind: 'skill', key: 'library' }); await sleep(50);
  const cr = coc.events.filter((e) => e.t === 'log').pop().entry; ok(cr.system === 'd100' && ['Critical Success', 'Extreme Success', 'Hard Success', 'Success', 'Failure', 'Fumble'].includes(cr.level), `CoC d100 roll resolved: ${cr.total} vs ${cr.target} → ${cr.level}`);
  console.log(`\nAll ${pass} checks passed.`); process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e.message); console.error(e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); });
