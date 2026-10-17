/* Ruleset editor: schema-driven forms for every part of a ruleset, plus raw JSON. Used when creating a campaign and from DM settings. */
(function () {
  'use strict';
  const { h, clone } = TT;

  const KINDS = ['weapon', 'armor', 'consumable', 'magic', 'gear'];
  const FIELD = {
    text: (o, f, ch) => h('input', { class: 'inp', value: o[f.k] ?? '', placeholder: f.ph || '', oninput: (e) => { if (e.target.value === '' && f.optional) delete o[f.k]; else o[f.k] = e.target.value; ch(); } }),
    long: (o, f, ch) => h('textarea', { class: 'inp', rows: 3, value: o[f.k] ?? '', oninput: (e) => { o[f.k] = e.target.value; ch(); } }),
    num: (o, f, ch) => h('input', { class: 'inp', type: 'number', value: o[f.k] ?? '', oninput: (e) => { if (e.target.value === '') delete o[f.k]; else o[f.k] = Number(e.target.value); ch(); } }),
    formula: (o, f, ch) => {
      const err = h('div', { class: 'err' });
      const inp = h('input', { class: 'inp', value: o[f.k] ?? '', placeholder: f.ph || 'e.g. 10 + dex_mod', spellcheck: 'false', oninput: (e) => { if (e.target.value === '' && f.optional) delete o[f.k]; else o[f.k] = e.target.value; const m = TT.E.validateFormula(e.target.value); err.textContent = m && e.target.value ? m : ''; ch(); } });
      return h('div', null, inp, err);
    },
    bool: (o, f, ch) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!o[f.k], onchange: (e) => { if (e.target.checked) o[f.k] = true; else delete o[f.k]; ch(); } }), f.label || 'Yes'),
    color: (o, f, ch) => h('input', { type: 'color', value: o[f.k] || '#c53131', oninput: (e) => { o[f.k] = e.target.value; ch(); } }),
    select: (o, f, ch) => h('select', { class: 'inp', onchange: (e) => { if (e.target.value === '') delete o[f.k]; else o[f.k] = e.target.value; ch(); } }, (typeof f.opts === 'function' ? f.opts() : f.opts).map((x) => { const v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return h('option', { value: v, selected: (o[f.k] ?? '') === v }, l); })),
    list: (o, f, ch) => h('input', { class: 'inp', value: (o[f.k] || []).join(', '), placeholder: 'comma, separated', oninput: (e) => { const v = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); if (v.length) o[f.k] = v; else delete o[f.k]; ch(); } }),
    json: (o, f, ch) => {
      const err = h('div', { class: 'err' });
      const ta = h('textarea', { class: 'inp', rows: f.rows || 3, spellcheck: 'false', style: { fontFamily: 'monospace', fontSize: '12px' }, value: o[f.k] === undefined ? '' : JSON.stringify(o[f.k], null, f.rows > 4 ? 1 : 0) });
      ta.addEventListener('input', () => { if (ta.value.trim() === '') { delete o[f.k]; err.textContent = ''; ch(); return; } try { o[f.k] = JSON.parse(ta.value); err.textContent = ''; ch(); } catch (e) { err.textContent = 'Not valid JSON yet: ' + e.message; } });
      return h('div', null, ta, err);
    },
  };
  const F = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra });

  function fields(obj, schema, onChange) {
    const box = h('div', { class: 'kv' });
    for (const f of schema) {
      if (f.help) box.appendChild(h('span', { title: f.help }, f.label + ' ⓘ')); else box.appendChild(h('span', null, f.label));
      box.appendChild(FIELD[f.type](obj, f, onChange));
    }
    return box;
  }

  // A collapsible list of items: add / duplicate / delete, each item edited with `schema`.
  function listEditor(arr, schema, make, title, onChange, opts = {}) {
    const wrap = h('div');
    const render = () => {
      TT.clear(wrap);
      if (opts.intro) wrap.appendChild(h('p', { class: 'muted small' }, opts.intro));
      const q = h('input', { class: 'inp sm', placeholder: 'Filter…', style: { marginBottom: '8px', maxWidth: '240px' } });
      const list = h('div');
      const paint = () => {
        TT.clear(list); const needle = q.value.toLowerCase();
        arr.forEach((it, i) => {
          const t = title(it, i); if (needle && !String(t).toLowerCase().includes(needle)) return;
          const sum = h('summary', null, h('b', { class: 'grow' }, t),
            h('button', { class: 'btn sm', title: 'Duplicate', onclick: (e) => { e.preventDefault(); const c = clone(it); if (c.key) c.key += '_copy'; if (c.name) c.name += ' (copy)'; arr.splice(i + 1, 0, c); onChange(); render(); } }, '⧉'),
            h('button', { class: 'btn sm danger', title: 'Delete', onclick: (e) => { e.preventDefault(); arr.splice(i, 1); onChange(); render(); } }, '🗑'));
          const body = h('div'); let built = false;
          const det = h('details', { class: 'ed-item' }, sum, body);
          det.addEventListener('toggle', () => { if (det.open && !built) { built = true; body.appendChild(fields(it, schema, () => { const nt = title(it, i); sum.querySelector('b').textContent = nt; onChange(); })); if (opts.extra) body.appendChild(opts.extra(it, onChange, render)); } });
          list.appendChild(det);
        });
        if (!list.children.length) list.appendChild(h('p', { class: 'muted' }, 'Nothing here yet.'));
      };
      q.addEventListener('input', paint); paint();
      wrap.appendChild(h('div', { class: 'row' }, q, h('button', { class: 'btn sm primary', onclick: () => { arr.unshift(make()); onChange(); render(); setTimeout(() => { const d = wrap.querySelector('details'); if (d) d.open = true; }, 0); } }, '＋ Add')));
      wrap.appendChild(list);
    };
    render(); return wrap;
  }

  const slug = (s) => String(s || 'new').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'new';
  let counter = 1; const nk = (p) => p + '_' + Date.now().toString(36) + (counter++);

  TT.rulesetEditor = function (initial, { title = 'Ruleset Editor', onSave, saveLabel = 'Save Ruleset' } = {}) {
    const rs = clone(initial); let dirty = false; const touch = () => { dirty = true; };
    for (const k of ['abilities', 'derived', 'skills', 'saves', 'resources', 'choices', 'items', 'actions', 'statuses', 'npcs', 'tabs', 'alignments']) if (!Array.isArray(rs[k])) rs[k] = [];
    const abilOpts = () => rs.abilities.map((a) => [a.key, a.name]);
    const sections = {
      general: () => h('div', null,
        fields(rs, [F('name', 'Ruleset name'), F('short', 'Short name'), F('desc', 'Description', 'long'),
          F('rollSystem', 'Dice system', 'select', { opts: [['d20', 'd20 — roll + modifier vs DC/defense'], ['d100', 'd100 — roll under a target number']] }),
          F('abilityMod', 'Attribute → modifier', 'formula', { help: 'Uses the variable "score". D&D: floor((score-10)/2). Call of Cthulhu uses "score".' }),
          F('skillFormula', 'Skill formula', 'formula', { help: 'Variables: abil (attribute modifier), prof, rank, cls, base, pb … plus any derived stat.' }),
          F('saveFormula', 'Save formula', 'formula', { help: 'Variables: abil, proficient, level, pb …' }),
          F('skillMode', 'Skill progression', 'select', { opts: [['prof', 'Proficiency (trained / expert)'], ['ranks', 'Ranks (spend points)'], ['points', 'Points (percentile)']] }),
          F('customLogName', 'Custom log tab name'), F('alignments', 'Alignments', 'list')], touch),
        h('h4', { style: { margin: '14px 0 6px' } }, 'Advanced data (JSON)'),
        fields(rs, [F('currency', 'Currencies', 'json', { rows: 3, help: '[{"key":"gp","name":"GP"}] — listed highest value first' }), F('grid', 'Map grid', 'json', { rows: 3, help: '{"unit":"ft","cell":5,"distance":"chebyshev"}' }),
          F('varDefaults', 'Default variables', 'json', { rows: 4, help: 'Variables every character starts with (used by formulas)' }), F('tables', 'Lookup tables', 'json', { rows: 5, help: 'Used as tbl(\'name\', row, column) in formulas' }),
          F('initiative', 'Initiative', 'json', { rows: 2, help: '{"roll":"d20","stat":"init"} — roll "none" sorts by the stat' }), F('crit', 'Critical range', 'json', { rows: 2 })], touch)),
      abilities: () => listEditor(rs.abilities, [F('key', 'Key (formula name)'), F('name', 'Name'), F('abbr', 'Abbreviation'), F('default', 'Default score', 'num'), F('roll', 'Roll method', 'formula', { ph: '4d6dl1', optional: true })],
        () => ({ key: nk('attr'), name: 'New Attribute', abbr: 'NEW', default: 10, roll: '3d6' }), (a) => `${a.name} (${a.key})`, touch, { intro: 'The main attributes. Each also creates a "<key>_mod" variable usable in formulas.' }),
      derived: () => listEditor(rs.derived, [F('key', 'Key'), F('name', 'Name'), F('formula', 'Formula', 'formula'), F('unit', 'Unit', 'text', { optional: true }), F('fmt', 'Format (+ for signed)', 'text', { optional: true }), F('show', 'Show only when…', 'formula', { optional: true }), F('late', 'Calculate after skills', 'bool')],
        () => ({ key: nk('stat'), name: 'New Stat', formula: '10' }), (d) => `${d.name} = ${d.formula}`, touch, { intro: 'Calculated numbers such as AC, speed, initiative or proficiency bonus. Items and effects can add to them by key.' }),
      resources: () => listEditor(rs.resources, [F('key', 'Key'), F('name', 'Name'), F('color', 'Bar color', 'color'), F('max', 'Maximum', 'formula'), F('start', 'Starting value', 'formula', { optional: true }), F('show', 'Show only when…', 'formula', { optional: true }), F('rest', 'Refills on', 'select', { opts: [['', 'Long rest only'], ['short', 'Short & long rest']] }), F('primary', 'Main health bar', 'bool')],
        () => ({ key: nk('res'), name: 'New Resource', color: '#4f7de0', max: '10' }), (r) => `${r.name} — max ${r.max}`, touch, { intro: 'Bars and counters: health, mana, spell slots, sanity, ammo, anything that goes up and down.' }),
      skills: () => listEditor(rs.skills, [F('key', 'Key'), F('name', 'Name'), F('ability', 'Linked attribute', 'select', { opts: () => [['', '—'], ...abilOpts()] }), F('base', 'Base value', 'formula', { optional: true, ph: 'Starting value (percentile systems)' })],
        () => ({ key: nk('skill'), name: 'New Skill', ability: (rs.abilities[0] || {}).key }), (s) => `${s.name}`, touch),
      saves: () => listEditor(rs.saves, [F('key', 'Key'), F('name', 'Name'), F('ability', 'Linked attribute', 'select', { opts: () => [['', '—'], ...abilOpts()] })],
        () => ({ key: nk('save'), name: 'New Save', ability: (rs.abilities[0] || {}).key }), (s) => s.name, touch),
      choices: () => {
        const wrap = h('div');
        const render = () => {
          TT.clear(wrap);
          wrap.appendChild(h('p', { class: 'muted small' }, 'Character creation picks — classes, species, races, backgrounds, occupations, anything. Each option can add modifiers, variables, skills, starting items and abilities.'));
          wrap.appendChild(h('button', { class: 'btn sm primary', onclick: () => { rs.choices.push({ key: nk('group'), name: 'New Category', required: true, options: [] }); touch(); render(); } }, '＋ Add category'));
          rs.choices.forEach((g, gi) => {
            const box = h('div', { class: 'panel', style: { marginTop: '10px' } }, h('div', { class: 'panel-h' }, h('span', null, g.name), h('button', { class: 'btn sm danger', onclick: () => { rs.choices.splice(gi, 1); touch(); render(); } }, 'Delete category')),
              h('div', { class: 'panel-b' }, fields(g, [F('key', 'Key'), F('name', 'Name'), F('required', 'Required', 'bool')], touch),
                listEditor(g.options, [F('key', 'Key'), F('name', 'Name'), F('desc', 'Description', 'long'), F('mods', 'Modifiers', 'json', { rows: 3, help: '[{"target":"dex","add":2}] — targets: attribute keys, derived keys, skill:<key>, skills, save:<key>, saves, max:<resource>' }),
                  F('vars', 'Variables', 'json', { rows: 3, help: '{"hitdie":10,"speed":30} — set numbers your formulas read' }), F('skills', 'Granted skills', 'list'), F('classSkills', 'Class skills', 'list'), F('saves', 'Proficient saves', 'list'),
                  F('items', 'Starting items', 'json', { rows: 3, help: '[{"ref":"longsword","qty":1,"equipped":true}]' }), F('actions', 'Granted abilities', 'list'), F('currency', 'Starting money', 'json', { rows: 2 }), F('asi', 'Attribute increase choice', 'json', { rows: 3, help: '{"from":["str","dex"],"patterns":[[2,1],[1,1,1]]}' })],
                  () => ({ key: nk('opt'), name: 'New Option' }), (o) => o.name, touch)));
            wrap.appendChild(box);
          });
        };
        render(); return wrap;
      },
      items: () => listEditor(rs.items, [F('key', 'Key'), F('name', 'Name'), F('type', 'Type', 'select', { opts: KINDS }), F('equipSlot', 'Slot', 'text', { optional: true, ph: 'hand, body, ring…' }), F('price', 'Price', 'json', { rows: 2, help: '{"gp":15}' }), F('attack', 'Attack bonus', 'formula', { optional: true }), F('damage', 'Damage', 'formula', { optional: true }), F('damageType', 'Damage type', 'text', { optional: true }),
        F('desc', 'Description', 'long'), F('mods', 'Modifiers when equipped', 'json', { rows: 3 }), F('vars', 'Variables when equipped', 'json', { rows: 2, help: '{"armorbase":16}' }), F('use', 'When used (consumables)', 'json', { rows: 2, help: '{"heal":"2d4+2"}' })],
        () => ({ key: nk('item'), name: 'New Item', type: 'gear', price: {} }), (i) => `${i.name} · ${i.type}`, touch, { intro: 'Weapons, armor, magic items, consumables. Equipped weapons create attacks automatically; equipped items apply their modifiers.' }),
      actions: () => listEditor(rs.actions, [F('key', 'Key'), F('name', 'Name'), F('kind', 'Kind', 'select', { opts: ['feature', 'spell', 'weapon', 'skill'] }), F('level', 'Spell level', 'num'), F('uses', 'Uses (turn slot)', 'text', { optional: true, ph: 'action, bonus, reaction…' }), F('attack', 'Attack bonus', 'formula', { optional: true }), F('damage', 'Damage', 'formula', { optional: true }), F('damageType', 'Damage type', 'text', { optional: true }), F('heal', 'Healing', 'formula', { optional: true }), F('upcast', 'Extra per higher level', 'formula', { optional: true }),
        F('save', 'Saving throw', 'json', { rows: 2, help: '{"ability":"dex","dc":"spelldc","half":true}' }), F('cost', 'Cost', 'json', { rows: 2, help: '{"res":"slot1","amount":1}' }), F('applies', 'Applies statuses', 'list'), F('auto', 'Always hits', 'bool'), F('range', 'Range', 'text', { optional: true }), F('classes', 'Available to options', 'list'), F('desc', 'Description', 'long')],
        () => ({ key: nk('act'), name: 'New Ability', kind: 'feature', uses: 'action' }), (a) => `${a.name} · ${a.kind}${a.level ? ' L' + a.level : ''}`, touch, { intro: 'Spells, class features, special attacks and skills a character can use in combat. Everything rolls and resolves automatically.' }),
      statuses: () => listEditor(rs.statuses, [F('key', 'Key'), F('name', 'Name'), F('desc', 'Description', 'long'), F('mods', 'Stat modifiers', 'json', { rows: 2 }), F('rollMods', 'Roll effects', 'json', { rows: 2, help: '{"attack":"dis","check":"dis"} — adv or dis' }), F('blocks', 'Blocks turn slots', 'list'), F('tick', 'Damage/heal over time', 'json', { rows: 2, help: '{"res":"hp","amount":"-1d6","when":"turnStart"}' }), F('defaultTurns', 'Default duration (turns)', 'num'), F('tags', 'Tags (buff…)', 'list')],
        () => ({ key: nk('status'), name: 'New Status', desc: '' }), (s) => s.name, touch, { intro: 'Poison, stun, rage… Effects apply automatically in combat: stat changes, advantage/disadvantage, lost actions, damage each turn.' }),
      npcs: () => listEditor(rs.npcs, [F('key', 'Key'), F('name', 'Name'), F('icon', 'Icon (emoji)'), F('color', 'Color', 'color'), F('cr', 'Challenge / rating', 'num'), F('recLevel', 'Recommended level', 'num'), F('alignment', 'Alignment'), F('desc', 'Description', 'long'), F('abilities', 'Attributes', 'json', { rows: 2 }), F('fixed', 'Fixed stats', 'json', { rows: 3, help: '{"derived":{"ac":15},"resourceMax":{"hp":30}}' }), F('actions', 'Attacks & abilities', 'json', { rows: 6 })],
        () => ({ key: nk('npc'), name: 'New Creature', icon: '👹', color: '#b04040', level: 1, abilities: {}, fixed: { derived: {}, resourceMax: { hp: 10 } }, actions: [] }), (n) => `${n.name}${n.cr != null ? ' · CR ' + n.cr : ''}`, touch, { intro: 'The ruleset\'s starting creature library, copied into the DM\'s NPC tab. Creatures can also be made in the campaign later.' }),
      tabs: () => listEditor(rs.tabs, [F('id', 'Id'), F('name', 'Name'), F('icon', 'Icon (emoji)'), F('type', 'Kind', 'select', { opts: [['shop', 'Shop (items for sale)'], ['quests', 'Quest log'], ['list', 'Notes list']] })],
        () => ({ id: nk('tab'), name: 'New Tab', icon: '📌', type: 'list' }), (t) => `${t.icon || ''} ${t.name}`, touch, { intro: 'Extra tabs shown to everyone: shops, quest boards, clue lists. The DM fills them in during the game.' }),
      rules: () => h('div', null, h('p', { class: 'muted small' }, 'Combat and creation behaviour.'),
        fields(rs, [F('combat', 'Combat rules', 'json', { rows: 12, help: 'defense, hp, temp, critMode (dice|mult), weaponUses, moveStat, hideNpcStats, turn: [{key,name,count}]' }), F('creation', 'Character creation', 'json', { rows: 12, help: 'startLevel, abilityMethods, standardArray, pointBuy, steps, skillBudget, skillBudgetLabel, startItemsFromOptions, startCurrency' })], touch)),
      json: () => {
        const ta = h('textarea', { class: 'inp', rows: 24, spellcheck: 'false', style: { fontFamily: 'monospace', fontSize: '12px' }, value: JSON.stringify(rs, null, 1) });
        const err = h('div', { class: 'err' });
        ta.addEventListener('input', () => { try { const o = JSON.parse(ta.value); for (const k of Object.keys(rs)) delete rs[k]; Object.assign(rs, o); err.textContent = ''; touch(); } catch (e) { err.textContent = e.message; } });
        return h('div', null, h('p', { class: 'muted small' }, 'The complete ruleset as JSON — copy it to share or back up, or paste one in.'), ta, err);
      },
    };
    const NAV = [['general', 'General'], ['abilities', 'Attributes'], ['derived', 'Derived Stats'], ['resources', 'Resources'], ['skills', 'Skills'], ['saves', 'Saves'], ['choices', 'Creation Options'], ['items', 'Items'], ['actions', 'Abilities & Spells'], ['statuses', 'Status Effects'], ['npcs', 'Creatures'], ['tabs', 'Custom Tabs'], ['rules', 'Combat & Creation'], ['json', 'Raw JSON']];
    const pane = h('div', { class: 'scroll', style: { maxHeight: '64vh', paddingRight: '6px' } }); let cur = 'general'; const nav = h('div', { class: 'ed-nav' });
    const show = (k) => { cur = k; TT.mount(pane, sections[k]()); TT.$$('button', nav).forEach((b) => b.classList.toggle('active', b.dataset.k === k)); };
    NAV.forEach(([k, l]) => nav.appendChild(h('button', { class: 'btn', 'data-k': k, onclick: () => show(k) }, l)));
    const body = h('div', { class: 'ed-split' }, nav, pane); show('general');
    return TT.modal({
      title, wide: true, body,
      actions: [{ label: 'Cancel' }, { label: saveLabel, primary: true, close: false, onClick: async (close) => {
        const r = await TT.do({ t: 'validateRuleset', ruleset: rs }, true);
        if (r && r.errors && r.errors.length) { TT.toast('Fix these formulas first:\n' + r.errors.slice(0, 5).join('\n'), 'error'); return false; }
        const ok = await onSave(rs); if (ok !== false) close(); return false;
      } }],
    });
  };
  TT.slug = slug;
})();
