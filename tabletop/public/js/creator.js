/* Character creation wizard. Follows the ruleset's own steps and recalculates everything live. */
(function () {
  'use strict';
  const { h, mount, clone } = TT;
  const E = () => TT.E;

  TT.screens.creator = function (root, camp) {
    // Rulesets are only sent to logged-in users, so fetch it through a throwaway preview of the campaign.
    TT.do({ t: 'campaignRuleset', campaignId: camp.id }, true).then((r) => {
      if (!r) return TT.toast('Could not load that campaign\'s ruleset.', 'error');
      build(root, camp, r.ruleset);
    });
  };

  function build(root, camp, rs) {
    TT.previewRs = rs; const cr = rs.creation || {};
    const d = {
      name: '', password: '', icon: '', color: '#c53131', alignment: '', level: cr.startLevel || 1, choices: {}, abilityMethod: (cr.abilityMethods || ['manual'])[0],
      abilities: Object.fromEntries(rs.abilities.map((a) => [a.key, a.default ?? 10])), asi: {}, asiPattern: 0, asiSlots: [], skillProf: {}, skillRanks: {},
      inventory: [], actions: [], bio: { Backstory: '', Appearance: '', Personality: '' }, standard: {}, rolled: false,
    };
    const pbStart = () => { const c = (cr.pointBuy && cr.pointBuy.cost) || {}; const z = Object.keys(c).map(Number).filter((k) => c[k] === 0).sort((a, b) => b - a)[0]; return cr.pointBuy.cost[10] === 0 ? 10 : z != null && cr.pointBuy.min <= 10 ? z : cr.pointBuy.min; };
    const stepKeys = (cr.steps || []).slice();
    for (const g of rs.choices) if (!stepKeys.includes(g.key)) stepKeys.splice(Math.max(1, stepKeys.indexOf('abilities')), 0, g.key);
    let step = 0; const visited = new Set([0]);
    const content = h('div'), side = h('div'), stepsEl = h('div', { class: 'steps' });

    // ---------- derived state
    const opts = () => rs.choices.map((g) => (g.options || []).find((o) => o.key === d.choices[g.key])).filter(Boolean);
    const entity = () => ({ level: d.level, abilities: d.abilities, choices: d.choices, asi: d.asi, skillProf: d.skillProf, skillRanks: d.skillRanks, inventory: d.inventory.map((i) => ({ ...i })), actions: [], status: [], res: {}, mods: [] });
    const comp = () => E().compute(rs, entity());
    const budget = () => Math.max(0, Math.floor(E().calc(cr.skillBudget || '0', comp().scope, rs.tables)));
    const itemDef = (k) => (rs.items || []).find((i) => i.key === k);
    const startMoney = () => { const m = {}; for (const o of opts()) for (const [k, v] of Object.entries(o.currency || {})) m[k] = (m[k] || 0) + v; for (const [k, v] of Object.entries(cr.startCurrency || {})) m[k] = (m[k] || 0) + v; return m; };
    const VAL = { pp: 1000, gp: 100, sp: 10, cp: 1 }; const base = (o) => Object.entries(o || {}).reduce((a, [k, v]) => a + (Number(v) || 0) * (VAL[k] || 1), 0);
    const spent = () => d.inventory.filter((i) => !i.kit).reduce((a, i) => a + base((itemDef(i.ref) || {}).price) * i.qty, 0);
    const money = () => base(startMoney()) - spent();
    const showMoney = (b) => { const keys = (rs.currency || []).map((c) => c.key).sort((a, b2) => (VAL[b2] || 1) - (VAL[a] || 1)); const out = []; for (const k of keys) { const v = VAL[k] || 1; const n = Math.floor(b / v + 1e-9); if (n > 0) { out.push(n + ' ' + TT.curName(k)); b -= n * v; } } if (b > 0.001 && keys.length) out.push(Math.round(b / (VAL[keys[keys.length - 1]] || 1) * 100) / 100 + ' ' + TT.curName(keys[keys.length - 1])); return out.join(' ') || '0'; };
    const skillsUsed = () => (rs.skillMode === 'prof' ? Object.values(d.skillProf).filter((v) => v >= 1).length : Object.values(d.skillRanks).reduce((a, b) => a + (b || 0), 0));
    const granted = () => new Set(opts().flatMap((o) => o.skills || []));
    const grantedActions = () => new Set(opts().flatMap((o) => o.actions || []));

    // kit: free starting items from chosen options
    function rebuildKit() {
      d.inventory = d.inventory.filter((i) => !i.kit);
      if (cr.startItemsFromOptions !== false) for (const o of opts()) for (const it of o.items || []) d.inventory.unshift({ ref: it.ref, qty: it.qty || 1, equipped: !!it.equipped, kit: true });
    }
    function syncActions() { const g = grantedActions(); for (const k of g) if (!d.actions.includes(k)) d.actions.push(k); }
    function setChoice(gk, ok) {
      d.choices[gk] = ok; d.asi = {}; d.asiSlots = []; d.asiPattern = 0; rebuildKit(); syncActions();
      d.actions = d.actions.filter((k) => { const a = (rs.actions || []).find((x) => x.key === k); return !a || !a.classes || grantedActions().has(k) || opts().some((o) => a.classes.includes(o.key)); });
      if (rs.skillMode === 'prof') for (const k of Object.keys(d.skillProf)) if (granted().has(k)) delete d.skillProf[k];
    }

    // ---------- step renderers
    const R = {};
    R.basics = () => {
      const nm = h('input', { class: 'inp', value: d.name, placeholder: 'Character name', oninput: (e) => { d.name = e.target.value; } });
      const pw = h('input', { class: 'inp', type: 'password', value: d.password, placeholder: 'At least 3 characters', oninput: (e) => { d.password = e.target.value; } });
      const iconBox = h('div');
      const paintIcons = () => mount(iconBox, h('div', { class: 'icon-grid' }, TT.EMOJI.map((em) => h('button', { class: d.icon === em ? 'sel' : '', onclick: () => { d.icon = em; paintIcons(); refreshSide(); } }, em))),
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('label', { class: 'btn sm' }, '⇪ Upload image', h('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { d.icon = await TT.upload(f, 'icon'); paintIcons(); refreshSide(); } catch (er) { TT.toast(er.message, 'error'); } } })),
          d.icon ? h('button', { class: 'btn sm', onclick: () => { d.icon = ''; paintIcons(); refreshSide(); } }, 'Clear') : null));
      paintIcons();
      return h('div', { class: 'col' }, h('h2', null, 'Who are you?'),
        h('div', { class: 'grid2' }, h('label', { class: 'lbl' }, 'Name', nm), h('label', { class: 'lbl' }, 'Character password', pw)),
        h('p', { class: 'muted small' }, 'You will need this password to play this character again.'),
        h('div', { class: 'grid2' },
          h('label', { class: 'lbl' }, 'Token color', h('input', { type: 'color', value: d.color, oninput: (e) => { d.color = e.target.value; refreshSide(); } })),
          (rs.alignments || []).length ? h('label', { class: 'lbl' }, 'Alignment', h('select', { class: 'inp', onchange: (e) => { d.alignment = e.target.value; } }, [h('option', { value: '' }, '—'), ...rs.alignments.map((a) => h('option', { value: a, selected: d.alignment === a }, a))])) : null),
        (cr.startLevel || 1) > 1 && !cr.hideLevel ? h('label', { class: 'lbl' }, 'Level', h('input', { class: 'inp num', type: 'number', min: 1, max: cr.startLevel, value: d.level, oninput: (e) => { d.level = Math.max(1, Math.min(cr.startLevel, Number(e.target.value) || 1)); refreshSide(); } })) : null,
        h('div', null, h('div', { class: 'lbl', style: { marginBottom: '4px' } }, 'Token icon'), iconBox),
        Object.keys(d.bio).map((k) => h('label', { class: 'lbl' }, k, h('textarea', { class: 'inp', rows: 2, value: d.bio[k], oninput: (e) => { d.bio[k] = e.target.value; } }))));
    };
    function choiceStep(g) {
      return () => {
        const wrap = h('div', { class: 'col' }, h('h2', null, 'Choose your ' + g.name));
        const grid = h('div', { class: 'opt-grid' });
        const det = h('div', { class: 'panel' });
        const paint = () => {
          mount(grid, (g.options || []).map((o) => h('div', { class: 'opt' + (d.choices[g.key] === o.key ? ' sel' : ''), tabindex: 0, onclick: () => { setChoice(g.key, o.key); paint(); refreshSide(); }, onkeydown: (e) => { if (e.key === 'Enter') { setChoice(g.key, o.key); paint(); refreshSide(); } } }, h('h4', null, o.name), h('div', { class: 'muted small' }, (o.desc || '').slice(0, 90) + ((o.desc || '').length > 90 ? '…' : '')))));
          const o = (g.options || []).find((x) => x.key === d.choices[g.key]);
          mount(det, o ? [h('h3', null, o.name), h('div', { class: 'panel-b' }, h('p', null, o.desc || ''), o.mods && o.mods.length ? h('div', { class: 'small' }, '⚙ ', o.mods.map((m) => `${m.target} ${m.add > 0 ? '+' : ''}${m.add}`).join(', ')) : null, o.items && o.items.length && cr.startItemsFromOptions !== false ? h('div', { class: 'small muted' }, 'Starting kit: ', o.items.map((i) => ((itemDef(i.ref) || {}).name || i.ref) + (i.qty > 1 ? ' ×' + i.qty : '')).join(', ')) : null)] : [h('div', { class: 'panel-b muted' }, 'Pick an option to see details.')]);
        };
        paint(); wrap.append(grid, det); return wrap;
      };
    }
    for (const g of rs.choices) R[g.key] = choiceStep(g);

    R.abilities = () => {
      const wrap = h('div', { class: 'col' }, h('h2', null, 'Attributes'));
      const methods = cr.abilityMethods || ['manual']; const labels = { standard: 'Standard array', pointbuy: 'Point buy', roll: 'Roll dice', manual: 'Enter manually' };
      wrap.appendChild(h('div', { class: 'row wrap' }, methods.map((m) => h('button', { class: 'btn' + (d.abilityMethod === m ? ' active' : ''), onclick: () => { d.abilityMethod = m; resetAbilities(); paint(); refreshSide(); } }, labels[m] || m))));
      const area = h('div', { class: 'col' }); wrap.appendChild(area);
      function resetAbilities() {
        d.standard = {};
        if (d.abilityMethod === 'pointbuy' && cr.pointBuy) for (const a of rs.abilities) d.abilities[a.key] = pbStart(); else for (const a of rs.abilities) d.abilities[a.key] = a.default ?? 10;
        d.rolled = false;
      }
      const boxes = (inner) => h('div', { class: 'ab-grid' }, rs.abilities.map((a) => { const c = comp().abilities[a.key]; return h('div', { class: 'ab-box' }, h('div', { class: 'lbl' }, a.name), inner(a), h('div', { class: 'muted small' }, 'Total ', h('b', null, c.score), rs.rollSystem === 'd20' ? ` (${TT.mod(c.mod)})` : '')); }));
      function paint() {
        const m = d.abilityMethod; let body;
        if (m === 'standard') {
          const arr = cr.standardArray || [15, 14, 13, 12, 10, 8]; const used = Object.values(d.standard);
          body = [h('p', { class: 'muted small' }, 'Assign each value in the array once: ' + arr.join(', ')), boxes((a) => h('select', { class: 'inp', onchange: (e) => { if (e.target.value === '') delete d.standard[a.key]; else d.standard[a.key] = Number(e.target.value); d.abilities[a.key] = d.standard[a.key] ?? 10; paint(); refreshSide(); } }, [h('option', { value: '' }, '—'), ...arr.map((v, i) => { const cnt = arr.filter((x) => x === v).length, u = used.filter((x) => x === v).length; const mine = d.standard[a.key] === v; return h('option', { value: v, selected: mine, disabled: !mine && u >= cnt }, v); })]))];
        } else if (m === 'pointbuy' && cr.pointBuy) {
          const pb = cr.pointBuy; const cost = rs.abilities.reduce((a, x) => a + (pb.cost[d.abilities[x.key]] ?? 0), 0);
          body = [h('p', null, 'Points spent: ', h('b', null, cost), ' / ', pb.budget, cost > pb.budget ? h('span', { class: 'err' }, '  Over budget!') : ''),
            boxes((a) => h('div', { class: 'row', style: { justifyContent: 'center' } }, h('button', { class: 'btn sm', disabled: d.abilities[a.key] <= pb.min, onclick: () => { d.abilities[a.key]--; paint(); refreshSide(); } }, '−'), h('span', { class: 'big' }, d.abilities[a.key]),
              h('button', { class: 'btn sm', disabled: d.abilities[a.key] >= pb.max || cost - (pb.cost[d.abilities[a.key]] ?? 0) + (pb.cost[d.abilities[a.key] + 1] ?? 99) > pb.budget, onclick: () => { d.abilities[a.key]++; paint(); refreshSide(); } }, '+')))];
        } else if (m === 'roll') {
          body = [h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { for (const a of rs.abilities) d.abilities[a.key] = Math.max(1, Math.round(E().evaluate(a.roll || '3d6').value)); d.rolled = true; paint(); refreshSide(); } }, '🎲 ' + (d.rolled ? 'Reroll all' : 'Roll attributes')), h('span', { class: 'muted small' }, 'Uses each attribute\'s own dice formula.')), boxes((a) => h('div', { class: 'big' }, d.abilities[a.key]))];
        } else {
          body = [boxes((a) => h('input', { class: 'inp', type: 'number', min: 1, max: 200, value: d.abilities[a.key], oninput: (e) => { d.abilities[a.key] = Math.max(1, Math.min(200, Number(e.target.value) || 1)); refreshSide(); } }))];
        }
        // attribute increases from species / background
        const spec = opts().find((o) => o.asi);
        const asiBox = h('div');
        if (spec) {
          const allowed = spec.asi.from === 'any' ? rs.abilities.map((a) => a.key) : spec.asi.from; const pats = spec.asi.patterns; const pat = pats[Math.min(d.asiPattern, pats.length - 1)];
          if (d.asiSlots.length !== pat.length) d.asiSlots = pat.map(() => '');
          const apply = () => { d.asi = {}; d.asiSlots.forEach((k, i) => { if (k) d.asi[k] = (d.asi[k] || 0) + pat[i]; }); };
          apply();
          asiBox.appendChild(h('div', { class: 'panel' }, h('h3', null, 'Attribute increases'), h('div', { class: 'panel-b col' },
            pats.length > 1 ? h('div', { class: 'row' }, pats.map((p, i) => h('button', { class: 'btn sm' + (i === d.asiPattern ? ' active' : ''), onclick: () => { d.asiPattern = i; d.asiSlots = []; paint(); refreshSide(); } }, p.map((x) => '+' + x).join(' / ')))) : null,
            h('div', { class: 'row wrap' }, pat.map((v, i) => h('label', { class: 'lbl' }, '+' + v, h('select', { class: 'inp', onchange: (e) => { d.asiSlots[i] = e.target.value; apply(); paint(); refreshSide(); } }, [h('option', { value: '' }, 'Choose…'), ...allowed.map((k) => h('option', { value: k, selected: d.asiSlots[i] === k, disabled: d.asiSlots.some((s, j) => j !== i && s === k) }, (rs.abilities.find((a) => a.key === k) || {}).name || k))])))))));
        }
        mount(area, body, asiBox);
      }
      resetAbilitiesIfNeeded(); paint();
      function resetAbilitiesIfNeeded() { if (d.abilityMethod === 'pointbuy' && cr.pointBuy && Object.values(d.abilities).every((v, i) => v === (rs.abilities[i].default ?? 10))) resetAbilities(); }
      return wrap;
    };

    R.skills = () => {
      const wrap = h('div', { class: 'col' }); const info = h('div'); const list = h('div', { class: 'col gap4' });
      const o = opts(); const cls = new Set(o.flatMap((x) => [...(x.skillChoices || []), ...(x.classSkills || [])])); const g = granted();
      const paint = () => {
        const c = comp(); const left = budget() - skillsUsed();
        mount(info, h('p', null, h('b', null, cr.skillBudgetLabel || 'Skill points'), ': ', h('b', { class: left < 0 ? 'err' : '' }, left), ' left of ', budget()), rs.skillMode === 'prof' ? h('p', { class: 'muted small' }, '★ = suggested for your class. Backgrounds already grant some skills.') : null);
        mount(list, rs.skills.map((s) => {
          const val = c.skills[s.key]; const ab = (rs.abilities.find((a) => a.key === s.ability) || {}).abbr;
          if (rs.skillMode === 'prof') {
            const on = g.has(s.key) || d.skillProf[s.key] >= 1;
            return h('label', { class: 'itemrow', style: { cursor: g.has(s.key) ? 'default' : 'pointer' } }, h('input', { type: 'checkbox', checked: on, disabled: g.has(s.key) || (!on && left <= 0), onchange: (e) => { if (e.target.checked) d.skillProf[s.key] = 1; else delete d.skillProf[s.key]; paint(); refreshSide(); } }), h('span', { class: 'grow' }, (cls.has(s.key) ? '★ ' : '') + s.name, ab ? h('span', { class: 'muted small' }, ' (' + ab + ')') : null, g.has(s.key) ? h('span', { class: 'pill gold', style: { marginLeft: '6px' } }, 'granted') : null), h('b', null, TT.mod(val)));
          }
          const r = d.skillRanks[s.key] || 0; const max = rs.skillMode === 'ranks' ? d.level : 99; const step2 = rs.skillMode === 'points' ? 5 : 1;
          return h('div', { class: 'itemrow' }, h('span', { class: 'grow' }, s.name, ab ? h('span', { class: 'muted small' }, ' (' + ab + ')') : null, cls.has(s.key) ? h('span', { class: 'pill gold', style: { marginLeft: '6px' } }, rs.skillMode === 'ranks' ? 'class' : 'occupation') : null),
            h('button', { class: 'btn sm', disabled: r <= 0, onclick: () => { d.skillRanks[s.key] = Math.max(0, r - step2); paint(); refreshSide(); } }, '−'), h('span', { style: { minWidth: '24px', textAlign: 'center' } }, r),
            h('button', { class: 'btn sm', disabled: left < step2 || r + step2 > max, onclick: () => { d.skillRanks[s.key] = r + step2; paint(); refreshSide(); } }, '+'), h('b', { style: { minWidth: '42px', textAlign: 'right' } }, rs.skillMode === 'points' ? val + '%' : TT.mod(val)));
        }));
      };
      paint(); wrap.append(h('h2', null, 'Skills'), info, list); return wrap;
    };

    R.equipment = () => {
      const wrap = h('div', { class: 'col' }); const mine = h('div', { class: 'col gap4' }), shop = h('div', { class: 'col gap4', style: { maxHeight: '46vh', overflow: 'auto' } }), purse = h('div');
      let q = '', type = '';
      const paintMine = () => {
        mount(purse, h('div', { class: 'panel-b row between' }, h('span', null, 'Money left: ', h('b', { class: money() < 0 ? 'err' : '' }, showMoney(Math.max(0, money())))), h('span', { class: 'muted small' }, 'Starting: ' + showMoney(base(startMoney())))));
        mount(mine, d.inventory.length ? d.inventory.map((it, i) => { const def = itemDef(it.ref) || { name: it.ref };
          return h('div', { class: 'itemrow' }, h('span', { class: 'grow' }, def.name, it.kit ? h('span', { class: 'pill green', style: { marginLeft: '6px' } }, 'kit') : null, def.desc ? h('div', { class: 'muted tiny' }, def.desc) : null),
            ['weapon', 'armor', 'magic'].includes(def.type) ? h('label', { class: 'chk small' }, h('input', { type: 'checkbox', checked: it.equipped, onchange: (e) => { it.equipped = e.target.checked; refreshSide(); } }), 'equipped') : null,
            h('span', null, '×', it.qty), h('button', { class: 'btn sm', onclick: () => { d.inventory.splice(i, 1); paintMine(); refreshSide(); } }, '✕')); }) : h('p', { class: 'muted' }, 'Empty.'));
      };
      const paintShop = () => {
        const items = (rs.items || []).filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!type || i.type === type));
        mount(shop, items.slice(0, 120).map((i) => { const cost = base(i.price); return h('div', { class: 'itemrow' }, h('span', { class: 'grow' }, i.name, h('div', { class: 'muted tiny' }, [i.type, i.damage ? i.damage + ' ' + (i.damageType || '') : '', i.desc].filter(Boolean).join(' · '))), h('span', { class: 'muted small' }, TT.priceText(i.price)),
          h('button', { class: 'btn sm primary', disabled: money() < cost, onclick: () => { const ex = d.inventory.find((x) => x.ref === i.key && !x.kit); if (ex) ex.qty++; else d.inventory.push({ ref: i.key, qty: 1, equipped: false }); paintMine(); paintShop(); refreshSide(); } }, 'Add')); }));
      };
      const search = h('input', { class: 'inp sm', placeholder: 'Search items…', oninput: (e) => { q = e.target.value.toLowerCase(); paintShop(); } });
      const typeSel = h('select', { class: 'inp sm', onchange: (e) => { type = e.target.value; paintShop(); } }, [h('option', { value: '' }, 'All types'), ...['weapon', 'armor', 'consumable', 'magic', 'gear'].map((t) => h('option', { value: t }, t))]);
      paintMine(); paintShop();
      wrap.append(h('h2', null, 'Equipment'), h('div', { class: 'panel' }, purse), h('div', { class: 'grid2' }, h('div', null, h('h4', { style: { marginBottom: '6px' } }, 'Your gear'), mine), h('div', null, h('h4', { style: { marginBottom: '6px' } }, 'Available'), h('div', { class: 'row', style: { marginBottom: '6px' } }, search, typeSel), shop)));
      return wrap;
    };

    R.actions = () => {
      const wrap = h('div', { class: 'col' }); const list = h('div', { class: 'col gap4' }); const gr = grantedActions(); let q = '';
      const avail = (rs.actions || []).filter((a) => !a.classes || gr.has(a.key) || opts().some((o) => a.classes.includes(o.key)));
      const paint = () => mount(list, avail.filter((a) => !q || a.name.toLowerCase().includes(q)).sort((a, b) => (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name)).map((a) => { const on = d.actions.includes(a.key), lock = gr.has(a.key);
        return h('label', { class: 'itemrow', style: { alignItems: 'flex-start' } }, h('input', { type: 'checkbox', checked: on, disabled: lock, onchange: (e) => { if (e.target.checked) d.actions.push(a.key); else d.actions = d.actions.filter((k) => k !== a.key); paint(); } }),
          h('div', { class: 'grow' }, h('b', null, a.name), ' ', h('span', { class: 'pill' }, a.kind + (a.level != null && a.kind === 'spell' ? (a.level === 0 ? ' · cantrip' : ' · L' + a.level) : '')), lock ? h('span', { class: 'pill gold', style: { marginLeft: '4px' } }, 'granted') : null,
            h('div', { class: 'muted small' }, [a.damage ? a.damage + ' ' + (a.damageType || '') : '', a.heal ? 'heals ' + a.heal : '', a.save ? 'DC save' : '', a.range].filter(Boolean).join(' · ')), h('div', { class: 'small' }, a.desc || ''))); }));
      paint(); wrap.append(h('h2', null, 'Abilities, spells & features'), h('p', { class: 'muted small' }, 'Pick the abilities your character knows. Your DM can add or remove any later.'), h('input', { class: 'inp sm', placeholder: 'Search…', oninput: (e) => { q = e.target.value.toLowerCase(); paint(); } }), list); return wrap;
    };

    R.review = () => {
      const c = comp(); const wrap = h('div', { class: 'col' }, h('h2', null, 'Review'));
      const probs = problems();
      wrap.append(h('div', { class: 'row' }, TT.avatar({ icon: d.icon, color: d.color, name: d.name }, 60), h('div', null, h('h2', null, d.name || '(unnamed)'), h('div', { class: 'muted' }, opts().map((o) => o.name).join(' · ')))),
        h('div', { class: 'stat-grid' }, rs.abilities.map((a) => h('div', { class: 'stat plain' }, h('div', { class: 'k' }, a.abbr || a.name), h('div', { class: 'v' }, c.abilities[a.key].score), rs.rollSystem === 'd20' ? h('div', { class: 's' }, TT.mod(c.abilities[a.key].mod)) : null))),
        probs.length ? h('div', { class: 'panel' }, h('h3', null, 'Before you can finish'), h('div', { class: 'panel-b' }, probs.map((p) => h('div', { class: 'err' }, '• ' + p.text, ' ', h('button', { class: 'btn sm', onclick: () => go(p.step) }, 'Fix')))) ) : h('p', { class: 'muted' }, 'Everything looks good!'),
        h('button', { class: 'btn primary', style: { fontSize: '16px', padding: '10px 18px' }, disabled: probs.length > 0, onclick: create }, '✔ Create character & enter the table'));
      return wrap;
    };

    function problems() {
      const p = []; const idx = (k) => Math.max(0, stepKeys.indexOf(k));
      if (!d.name.trim()) p.push({ text: 'Your character needs a name.', step: idx('basics') });
      if (d.password.length < 3) p.push({ text: 'Set a password of at least 3 characters.', step: idx('basics') });
      for (const g of rs.choices) if (g.required && !d.choices[g.key]) p.push({ text: `Choose a ${g.name}.`, step: idx(g.key) });
      if (d.abilityMethod === 'standard' && cr.standardArray && rs.abilities.some((a) => d.standard[a.key] == null)) p.push({ text: 'Assign every value of the standard array.', step: idx('abilities') });
      if (d.abilityMethod === 'pointbuy' && cr.pointBuy && rs.abilities.reduce((a, x) => a + (cr.pointBuy.cost[d.abilities[x.key]] ?? 99), 0) > cr.pointBuy.budget) p.push({ text: 'You have overspent your attribute points.', step: idx('abilities') });
      if (d.abilityMethod === 'roll' && !d.rolled) p.push({ text: 'Roll your attributes.', step: idx('abilities') });
      const spec = opts().find((o) => o.asi); if (spec && d.asiSlots.some((s) => !s) || (spec && !d.asiSlots.length)) p.push({ text: 'Choose your attribute increases.', step: idx('abilities') });
      if (skillsUsed() > budget()) p.push({ text: 'You assigned too many skill points.', step: idx('skills') });
      if (money() < -0.001) p.push({ text: 'You cannot afford your equipment.', step: idx('equipment') });
      return p;
    }
    async function create() {
      const character = { name: d.name.trim(), password: d.password, icon: d.icon, color: d.color, alignment: d.alignment, level: d.level, choices: d.choices, abilityMethod: d.abilityMethod, abilities: d.abilities, asi: d.asi, skillProf: d.skillProf, skillRanks: d.skillRanks,
        inventory: d.inventory.map((i) => ({ ref: i.ref, qty: i.qty, equipped: i.equipped })), actions: d.actions, bio: Object.fromEntries(Object.entries(d.bio).filter(([, v]) => v.trim())) };
      const r = await TT.do({ t: 'createCharacter', campaignId: camp.id, character }); if (!r) return;
      TT.session = { token: r.token, role: 'player', charId: r.charId, cid: camp.id }; TT.ls.set('session', TT.session); TT.ui.go('game');
    }

    // ---------- chrome
    const STEP_NAMES = { basics: 'Basics', abilities: 'Attributes', skills: 'Skills', equipment: 'Equipment', actions: 'Abilities', review: 'Review' };
    const stepName = (k) => STEP_NAMES[k] || (rs.choices.find((g) => g.key === k) || {}).name || k;
    function go(i) { step = Math.max(0, Math.min(stepKeys.length - 1, i)); visited.add(step); paintAll(); }
    function paintSteps() { mount(stepsEl, stepKeys.map((k, i) => h('div', { class: 'step' + (i === step ? ' on' : visited.has(i) && i !== step ? ' done' : ''), onclick: () => go(i) }, (i + 1) + '. ' + stepName(k)))); }
    function refreshSide() {
      const c = comp(); const primary = rs.resources.find((r) => r.primary) || rs.resources[0];
      mount(side, h('div', { class: 'panel' }, h('h3', null, 'Live preview'), h('div', { class: 'panel-b col' },
        h('div', { class: 'row' }, TT.avatar({ icon: d.icon, color: d.color, name: d.name }, 46), h('div', null, h('b', null, d.name || 'Unnamed'), h('div', { class: 'muted small' }, opts().map((o) => o.name).join(' · ') || 'Choose your options'))),
        primary ? h('div', { class: 'res-row' }, h('div', { class: 'nm' }, h('span', null, primary.name), h('span', null, c.resources[primary.key].max)), h('div', { class: 'bar' }, h('i', { style: { width: '100%', '--c': primary.color } }))) : null,
        h('div', { class: 'stat-grid' }, rs.derived.filter((x) => c.derivedVisible[x.key] !== false && !['init'].includes(x.key)).slice(0, 6).map((x) => h('div', { class: 'stat plain' }, h('div', { class: 'k' }, x.name.replace('Armor Class', 'AC').replace('Proficiency Bonus', 'Prof').slice(0, 12)), h('div', { class: 'v', style: { fontSize: '20px' } }, x.fmt === '+' ? TT.mod(c.derived[x.key]) : c.derived[x.key])))),
        h('div', { class: 'stat-grid' }, rs.abilities.map((a) => h('div', { class: 'stat plain' }, h('div', { class: 'k' }, a.abbr || a.name.slice(0, 3)), h('div', { class: 'v', style: { fontSize: '20px' } }, c.abilities[a.key].score), rs.rollSystem === 'd20' ? h('div', { class: 's' }, TT.mod(c.abilities[a.key].mod)) : null))))));
    }
    function paintAll() { paintSteps(); const k = stepKeys[step]; mount(content, (R[k] || (() => h('p', { class: 'err' }, 'Unknown step: ' + k)))(), h('div', { class: 'row between', style: { marginTop: '16px' } }, h('button', { class: 'btn', disabled: step === 0, onclick: () => go(step - 1) }, '← Back'), step < stepKeys.length - 1 ? h('button', { class: 'btn primary', onclick: () => go(step + 1) }, 'Next →') : null)); refreshSide(); content.scrollIntoView({ block: 'start' }); }

    mount(root, h('div', { class: 'topbar' }, h('div', { class: 'brand' }, '🎲 New ', h('b', null, 'Character')), h('span', { class: 'muted' }, camp.name + ' · ' + camp.rulesetShort), h('button', { class: 'btn', style: { marginLeft: 'auto' }, onclick: () => TT.ui.go('gate', camp.id) }, '← Cancel')),
      h('div', { class: 'page' }, h('div', { class: 'wiz' }, stepsEl, h('div', { class: 'panel' }, h('div', { class: 'panel-b' }, content)), side)));
    paintAll();
  }
})();
