// DM tools: characters, creature library, catalog, custom tabs (shop/quests/lists), settings, dialogs.
(function () {
  'use strict';
  const { h, mount } = TT;
  const rs = () => TT.rs();
  const opt = (v, l, sel) => h('option', { value: v, selected: sel ? true : undefined }, l);
  const lbl = (t, el) => h('label', { class: 'lbl' }, t, el);
  const inp = (v, o = {}) => h('input', { class: 'inp', value: v == null ? '' : v, ...o });
  const hiddenBox = () => { const c = h('input', { type: 'checkbox' }); return { c, el: h('label', { class: 'chk', title: 'Hidden actions are only visible to you in the logs' }, c, h('span', { class: 'small' }, '🕶 Hidden from players')) }; };
  const json = (v) => JSON.stringify(v == null ? {} : v, null, 1);
  const parseJson = (t, what) => { try { return JSON.parse(t || 'null'); } catch (e) { TT.toast(what + ' is not valid JSON: ' + e.message, 'error'); return undefined; } };
  const itemsOf = () => rs().items || [];
  const actionsOf = () => rs().actions || [];
  const searchBar = (onInput, ph = 'Search…') => h('input', { class: 'inp', placeholder: ph, oninput: (e) => onInput(e.target.value.toLowerCase()), style: { maxWidth: '280px' } });
  const empty = (t) => h('p', { class: 'muted', style: { padding: '14px' } }, t);

  // ------------------------------------------------------------------ dialogs used by the map
  TT.spawnDialog = function (x, y) {
    const lib = Object.values(TT.state.entities).filter((e) => e.kind === 'npc').sort((a, b) => a.name.localeCompare(b.name));
    if (!lib.length) return TT.confirm('Creature library is empty', 'Import the preset creatures from the Creatures tab first. Go there now?', 'Open Creatures').then((ok) => { if (ok && TT.ui.setTab) TT.ui.setTab('library'); });
    let q = ''; const sel = h('select', { class: 'inp', size: 10 }); const count = inp(1, { type: 'number', min: 1, max: 20 }); const hb = hiddenBox();
    const fill = () => { mount(sel, lib.filter((e) => !q || e.name.toLowerCase().includes(q)).map((e) => opt(e.id, e.name + (e.recLevel != null ? ` (lvl ${e.recLevel})` : e.cr != null ? ` (CR ${e.cr})` : '')))); if (sel.options[0]) sel.options[0].selected = true; };
    fill();
    TT.modal({ title: 'Spawn creature', body: h('div', { class: 'col' }, searchBar((v) => { q = v; fill(); }, 'Search creatures…'), sel, h('div', { class: 'row' }, lbl('How many', count), hb.el)),
      actions: [{ label: 'Cancel' }, { label: 'Spawn', primary: true, onClick: async () => { if (!sel.value) return false; const r = await TT.do({ t: 'spawn', npcId: sel.value, count: Number(count.value) || 1, x, y, hidden: hb.c.checked }); return !!r; } }] });
  };
  TT.placeDialog = function (x, y) {
    const onMap = new Set(Object.values(TT.state.tokens).map((t) => t.eid));
    const list = Object.values(TT.state.entities).filter((e) => e.kind === 'pc' && !onMap.has(e.id));
    if (!list.length) return TT.toast('Every character is already on the map.');
    const sel = h('select', { class: 'inp' }, list.map((e) => opt(e.id, e.name)));
    TT.modal({ title: 'Place a character', body: lbl('Character', sel), actions: [{ label: 'Cancel' }, { label: 'Place', primary: true, onClick: async () => !!(await TT.do({ t: 'tokenAdd', eid: sel.value, x, y })) }] });
  };
  TT.sceneDialog = function () {
    const s = TT.state.scene; const w = inp(s.w, { type: 'number' }), hh = inp(s.h, { type: 'number' }), cell = inp(s.cell, { type: 'number' }); const bg = inp(s.bg || '#1a1a1d', { type: 'color' });
    const grid = h('input', { type: 'checkbox', checked: s.grid }), snap = h('input', { type: 'checkbox', checked: s.snap });
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' }); let url = s.mapUrl; const st = h('span', { class: 'muted small' }, url ? 'Map image set.' : 'No map image.');
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return; st.textContent = 'Uploading…';
      try { url = await TT.upload(f, 'map'); st.textContent = 'Uploaded.'; const im = new Image(); im.onload = () => { w.value = im.naturalWidth; hh.value = im.naturalHeight; }; im.src = url; } catch (e) { st.textContent = ''; TT.toast(e.message, 'error'); }
    });
    TT.modal({ title: 'Map & grid', body: h('div', { class: 'col' }, lbl('Map image', file), h('div', { class: 'row' }, st, url ? h('button', { class: 'btn sm', onclick: () => { url = null; st.textContent = 'Image will be removed.'; } }, 'Remove image') : null),
      h('div', { class: 'row' }, lbl('Width (px)', w), lbl('Height (px)', hh), lbl('Cell (px)', cell)), h('div', { class: 'row' }, lbl('Background', bg), h('label', { class: 'chk' }, grid, 'Show grid'), h('label', { class: 'chk' }, snap, 'Snap to grid (lock)'))),
      actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: async () => !!(await TT.do({ t: 'sceneSet', patch: { mapUrl: url, w: +w.value, h: +hh.value, cell: +cell.value, grid: grid.checked, snap: snap.checked, bg: bg.value } })) }] });
  };

  // ------------------------------------------------------------------ give / adjust dialogs
  function giveDialog(ent) {
    let q = ''; const list = h('select', { class: 'inp', size: 8 }); const qty = inp(1, { type: 'number', min: 1 }); const hb = hiddenBox();
    const fill = () => { mount(list, itemsOf().filter((i) => !q || i.name.toLowerCase().includes(q)).map((i) => opt(i.key, `${i.name}${i.type ? ' · ' + i.type : ''}`))); if (list.options[0]) list.options[0].selected = true; };
    fill();
    const cur = (rs().currency || []).map((c) => ({ c, el: inp(0, { type: 'number', class: 'inp num' }) }));
    const cname = inp(''); const cdesc = inp('');
    TT.modal({ title: 'Give to ' + ent.name, wide: true, body: h('div', { class: 'col' },
      h('h4', null, 'Item from the catalog'), h('div', { class: 'row' }, searchBar((v) => { q = v; fill(); }, 'Search items…'), lbl('Qty', qty)), list,
      h('h4', null, 'Or a custom item'), h('div', { class: 'row' }, lbl('Name', cname), lbl('Description', cdesc)),
      h('h4', null, 'Money'), h('div', { class: 'row wrap' }, cur.map((x) => lbl(x.c.name, x.el))), hb.el),
      actions: [{ label: 'Cancel' }, { label: 'Give', primary: true, onClick: async () => {
        let did = false; const hidden = hb.c.checked;
        if (cname.value.trim()) { const r = await TT.do({ t: 'give', eid: ent.id, item: { name: cname.value.trim(), desc: cdesc.value, type: 'gear' }, qty: Number(qty.value) || 1, hidden }); if (!r) return false; did = true; }
        else if (list.selectedIndex >= 0) { const r = await TT.do({ t: 'give', eid: ent.id, ref: list.value, qty: Number(qty.value) || 1, hidden }); if (!r) return false; did = true; }
        const money = {}; for (const x of cur) if (Number(x.el.value)) money[x.c.key] = Number(x.el.value);
        if (Object.keys(money).length) { const r = await TT.do({ t: 'give', eid: ent.id, currency: money, hidden }); if (!r) return false; did = true; }
        if (!did) { TT.toast('Pick something to give.'); return false; } return true; } }] });
  }
  async function adjustDialog(ent, r) {
    const v = ent.res[r.key]; const hb = hiddenBox(); const amt = inp('', { placeholder: 'e.g. -7 or 5', type: 'number' }); const set = inp(v ? v.cur : 0, { type: 'number' });
    TT.modal({ title: `${r.name} — ${ent.name}`, body: h('div', { class: 'col' }, h('div', { class: 'muted' }, v && v.max != null ? `Currently ${v.cur} / ${v.max}` : ''), lbl('Change by (negative = damage / spend)', amt), lbl('…or set exactly to', set), hb.el),
      actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: async () => {
        const msg = { t: 'adjust', eid: ent.id, res: r.key, hidden: hb.c.checked }; if (amt.value !== '') msg.delta = Number(amt.value); else msg.set = Number(set.value); return !!(await TT.do(msg)); } }] });
  }

  // ------------------------------------------------------------------ the generic creature / character editor
  function entityEditor(ent, { isNew, onDone } = {}) {
    const R = rs(); const d = ent ? JSON.parse(JSON.stringify(ent)) : { name: 'New Creature', level: 1, color: '#9b2c2c', icon: '👹', abilities: {}, choices: {}, rawActions: [], inventory: [], mods: [], fixed: {}, skillProf: {}, skillRanks: {}, currency: {} };
    const name = inp(d.name), icon = inp(d.icon || '', { style: { width: '80px' } }), color = inp(d.color || '#c53131', { type: 'color' }), level = inp(d.level, { type: 'number', min: 1, max: 30 });
    const align = h('select', { class: 'inp' }, opt('', '—'), (R.alignments || []).map((a) => opt(a, a, a === d.alignment)));
    const rec = inp(d.recLevel == null ? '' : d.recLevel, { type: 'number' }), cr = inp(d.cr == null ? '' : d.cr);
    const pcs = Object.values(TT.state.entities).filter((e) => e.kind === 'pc');
    const owner = h('select', { class: 'inp' }, opt('', '— none —'), pcs.map((p) => opt(p.id, p.name, p.id === d.owner)));
    const desc = h('textarea', { class: 'inp', rows: 3 }, d.desc || '');
    const abil = (R.abilities || []).map((a) => ({ a, el: inp((d.abilities || {})[a.key] ?? '', { type: 'number', class: 'inp num', placeholder: String(a.base != null ? a.base : 10) }) }));
    const choices = (R.choices || []).map((g) => ({ g, el: h('select', { class: 'inp' }, opt('', '—'), (g.options || []).map((o) => opt(o.key, o.name, (d.choices || {})[g.key] === o.key))) }));
    const skills = (R.skills || []).map((s) => ({ s, el: R.skillMode === 'prof'
      ? h('select', { class: 'inp sm' }, [[0, '—'], [1, 'Proficient'], [2, 'Expertise']].map(([v, l]) => opt(v, l, (d.skillProf[s.key] || 0) === v)))
      : inp(d.skillRanks[s.key] || 0, { type: 'number', class: 'inp num' }) }));
    let actions = (d.rawActions || []).map((a) => (typeof a === 'string' ? { ref: a } : a)); let inventory = (d.inventory || []).map((i) => (i.ref ? { id: i.id, ref: i.ref, qty: i.qty, equipped: i.equipped } : { ...i }));
    const actBox = h('div'), invBox = h('div');
    const paintAct = () => mount(actBox, [actions.length ? actions.map((a, i) => h('div', { class: 'row between list-row' }, h('span', null, a.ref ? ((actionsOf().find((x) => x.key === a.ref) || {}).name || a.ref) : a.name || a.key || 'Custom'), h('button', { class: 'btn sm danger', onclick: () => { actions.splice(i, 1); paintAct(); } }, '✕'))) : h('p', { class: 'muted small' }, 'No extra abilities.')]);
    const paintInv = () => mount(invBox, [inventory.length ? inventory.map((it, i) => h('div', { class: 'row between list-row' }, h('span', null, ((itemsOf().find((x) => x.key === it.ref) || {}).name) || it.name || it.ref || 'Item'), h('span', { class: 'row' },
      inp(it.qty, { type: 'number', class: 'inp num sm', onchange: (e) => { it.qty = Number(e.target.value) || 0; } }), h('label', { class: 'chk small' }, h('input', { type: 'checkbox', checked: !!it.equipped, onchange: (e) => { it.equipped = e.target.checked; } }), 'equipped'),
      h('button', { class: 'btn sm danger', onclick: () => { inventory.splice(i, 1); paintInv(); } }, '✕')))) : h('p', { class: 'muted small' }, 'Empty.')]);
    paintAct(); paintInv();
    const addAct = h('select', { class: 'inp' }, actionsOf().map((a) => opt(a.key, a.name))); const addInv = h('select', { class: 'inp' }, itemsOf().map((a) => opt(a.key, a.name)));
    const customAct = h('textarea', { class: 'inp', rows: 4, placeholder: '{ "name": "Claw", "kind": "weapon", "attack": "5", "damage": "1d6+3", "damageType": "slashing", "cost": {"action": 1} }' });
    const mods = h('textarea', { class: 'inp', rows: 4 }, json(d.mods && d.mods.length ? d.mods : [])); const fixed = h('textarea', { class: 'inp', rows: 3 }, json(d.fixed));
    const hpNote = !isNew && R.combat ? null : null; void hpNote;
    const sec = (t, ...k) => h('div', { class: 'panel', style: { marginBottom: '10px' } }, h('h3', null, t), h('div', { class: 'panel-b col' }, ...k));
    const body = h('div', null,
      sec('Identity', h('div', { class: 'row wrap' }, lbl('Name', name), lbl('Icon (emoji)', icon), lbl('Color', color), lbl('Level', level)), h('div', { class: 'row wrap' }, lbl('Alignment', align), lbl('Recommended level', rec), lbl('Challenge', cr), d.kind !== 'pc' ? lbl('Summon owner', owner) : null), lbl('Description / lore', desc)),
      choices.length ? sec('Build choices', h('div', { class: 'row wrap' }, choices.map((c) => lbl(c.g.name, c.el)))) : null,
      sec(R.rollSystem === 'd100' ? 'Characteristics (blank = ruleset default)' : 'Ability scores (blank = ruleset default)', h('div', { class: 'row wrap' }, abil.map((x) => lbl(x.a.abbr || x.a.name, x.el)))),
      sec(R.skillMode === 'prof' ? 'Skill proficiencies' : 'Skill ranks / points', h('div', { class: 'row wrap' }, skills.map((x) => lbl(x.s.name, x.el)))),
      sec('Abilities, attacks & spells', actBox, h('div', { class: 'row' }, addAct, h('button', { class: 'btn', onclick: () => { actions.push({ ref: addAct.value }); paintAct(); } }, 'Add')), lbl('Or a custom action (JSON)', customAct), h('button', { class: 'btn sm', onclick: () => { const v = parseJson(customAct.value, 'Custom action'); if (v) { actions.push(v); customAct.value = ''; paintAct(); } } }, 'Add custom action')),
      sec('Inventory', invBox, h('div', { class: 'row' }, addInv, h('button', { class: 'btn', onclick: () => { inventory.push({ ref: addInv.value, qty: 1, equipped: false }); paintInv(); } }, 'Add'))),
      h('details', { class: 'panel', style: { marginBottom: '10px' } }, h('summary', { class: 'panel-h', style: { cursor: 'pointer' } }, 'Advanced: custom modifiers & stat overrides'),
        h('div', { class: 'panel-b col' }, h('p', { class: 'muted small' }, 'Mods use the same format as ruleset options, e.g. [{"target":"ac","op":"add","value":"1","label":"Ring"}]. Overrides pin a derived stat or resource max to a value, e.g. {"max:hp":"40"}.'), lbl('Modifiers (JSON list)', mods), lbl('Overrides (JSON)', fixed))));
    const save = async () => {
      const m = parseJson(mods.value, 'Modifiers'); if (m === undefined) return false; const f = parseJson(fixed.value, 'Overrides'); if (f === undefined) return false;
      const abilities = {}; for (const x of abil) if (x.el.value !== '') abilities[x.a.key] = Number(x.el.value);
      const chs = {}; for (const c of choices) if (c.el.value) chs[c.g.key] = c.el.value;
      const prof = {}, ranks = {}; for (const x of skills) { const v = Number(x.el.value) || 0; if (v) (R.skillMode === 'prof' ? prof : ranks)[x.s.key] = v; }
      const patch = { name: name.value, icon: icon.value, color: color.value, level: Number(level.value) || 1, alignment: align.value, desc: desc.value, abilities, choices: chs, skillProf: prof, skillRanks: ranks, actions, inventory, mods: m || [], fixed: f || {}, recLevel: rec.value === '' ? undefined : Number(rec.value), cr: cr.value === '' ? undefined : cr.value };
      if (d.kind !== 'pc') patch.owner = owner.value || null;
      const r = isNew ? await TT.do({ t: 'npcCreate', data: patch }) : await TT.do({ t: 'entityEdit', eid: ent.id, patch }); if (!r) return false; TT.toast('Saved.'); if (onDone) onDone(r); return true;
    };
    TT.modal({ title: isNew ? 'New creature' : 'Edit ' + ent.name, wide: true, body, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: save }] });
  }
  TT.entityEditor = entityEditor;

  // ------------------------------------------------------------------ Characters tab
  TT.dmCharacters = function () {
    const root = h('div', { class: 'dmgrid' }); let sel = TT.ls.get('dmSel', null);
    const left = h('div', { class: 'panel dmlist' }); const right = h('div', { class: 'scroll', style: { minWidth: 0 } });
    root.style.cssText = 'display:grid;grid-template-columns:260px 1fr;gap:12px;padding:12px;height:100%;min-height:0;';
    left.style.cssText = 'overflow:auto;min-height:0;';
    const paint = () => {
      const all = Object.values(TT.state.entities); const pcs = all.filter((e) => e.kind === 'pc'); const insts = all.filter((e) => e.kind === 'inst');
      if (!sel || !TT.ent(sel) || TT.ent(sel).kind === 'npc') sel = (pcs[0] || insts[0] || {}).id || null;
      const row = (e) => h('div', { class: 'char-pick' + (e.id === sel ? ' on' : ''), style: e.id === sel ? { borderColor: 'var(--red2)' } : {}, tabindex: 0, onclick: () => { sel = e.id; TT.ls.set('dmSel', sel); paint(); }, onkeydown: (ev) => { if (ev.key === 'Enter') { sel = e.id; paint(); } } }, TT.avatar(e, 34), h('div', { class: 'grow' }, h('div', null, e.name), h('div', { class: 'muted tiny' }, e.classLabel || (e.kind === 'inst' ? 'On the map' : ''))), e.down ? h('span', { class: 'pill red' }, 'down') : null);
      mount(left, [h('h3', null, 'Party'), h('div', { class: 'panel-b col gap4' }, pcs.length ? pcs.map(row) : h('p', { class: 'muted small' }, 'No player characters yet. Players create them from the campaign login screen.')),
        h('h3', null, 'Creatures in play'), h('div', { class: 'panel-b col gap4' }, insts.length ? insts.map(row) : h('p', { class: 'muted small' }, 'Spawn creatures from the Combat tab or the Creatures library.'))]);
      const e = sel ? TT.ent(sel) : null;
      const top = right.scrollTop;
      if (!e || e.mode !== 'full') { mount(right, empty('Select a character.')); return; }
      const bar = h('div', { class: 'panel', style: { margin: '0 0 10px' } }, h('div', { class: 'panel-b row wrap' },
        h('button', { class: 'btn', onclick: () => entityEditor(TT.ent(sel)) }, '✎ Edit'), h('button', { class: 'btn', onclick: () => giveDialog(TT.ent(sel)) }, '🎁 Give'), h('button', { class: 'btn', onclick: () => TT.statusDialog(TT.ent(sel)) }, '✨ Add effect'),
        h('button', { class: 'btn', onclick: () => TT.do({ t: 'rest', eid: sel, type: 'short' }) }, 'Short rest'), h('button', { class: 'btn', onclick: () => TT.do({ t: 'rest', eid: sel, type: 'long' }) }, 'Long rest'),
        !Object.values(TT.state.tokens).some((t) => t.eid === sel) ? h('button', { class: 'btn', onclick: () => TT.do({ t: 'tokenAdd', eid: sel }) }, '📍 Put on map') : null,
        e.kind === 'pc' ? h('button', { class: 'btn', onclick: async () => { const p = await TT.prompt('Reset password', 'New password for ' + e.name + ' (min. 3 characters)', '', { type: 'text' }); if (p) { if (await TT.do({ t: 'setCharPassword', eid: sel, password: p })) TT.toast('Password changed.'); } } }, '🔑 Password') : null,
        e.kind === 'pc' ? h('button', { class: 'btn danger', onclick: async () => { if (await TT.confirm('Delete character', `Permanently delete ${e.name}?`, 'Delete')) TT.do({ t: 'deleteCharacter', eid: sel }); } }, 'Delete') : h('button', { class: 'btn danger', onclick: () => TT.do({ t: 'tokenRemove', eid: sel }) }, 'Remove from map'),
        h('span', { class: 'muted small', style: { marginLeft: 'auto' } }, 'Click any stat or resource to roll / adjust it.')));
      mount(right, [bar, TT.renderSheet(e, { onResource: (r) => adjustDialog(TT.ent(sel), r) })]); right.scrollTop = top;
    };
    mount(root, [left, right]); paint();
    const f = () => paint(); TT.on('state', f); root.destroy = () => TT.off('state', f);
    return root;
  };

  // ------------------------------------------------------------------ Creature library
  TT.dmLibrary = function () {
    const root = h('div', { style: { padding: '14px', maxWidth: '1200px', margin: '0 auto' } }); let q = '', al = '', lvl = '';
    const list = h('div', { class: 'col' });
    const paint = () => {
      const lib = Object.values(TT.state.entities).filter((e) => e.kind === 'npc').filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!al || e.alignment === al) && (lvl === '' || (e.recLevel != null && e.recLevel <= Number(lvl)))).sort((a, b) => (a.recLevel ?? 99) - (b.recLevel ?? 99) || a.name.localeCompare(b.name));
      mount(list, lib.length ? lib.map((e) => h('div', { class: 'act' }, h('div', { class: 'row between' }, h('div', { class: 'row' }, TT.avatar(e, 34), h('div', null, h('div', { class: 'nm' }, e.name), h('div', { class: 'meta' }, [e.alignment, e.recLevel != null ? 'Rec. level ' + e.recLevel : null, e.cr != null ? 'CR ' + e.cr : null, e.owner ? 'Summon of ' + ((TT.ent(e.owner) || {}).name || '?') : null].filter(Boolean).join(' · ')))),
        h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: () => TT.spawnDialog() , title: 'Opens the spawner' }, 'Spawn…'), h('button', { class: 'btn sm', onclick: () => entityEditor(e) }, 'Edit'), h('button', { class: 'btn sm', onclick: () => TT.do({ t: 'npcDuplicate', eid: e.id }) }, 'Duplicate'),
          h('button', { class: 'btn sm danger', onclick: async () => { if (await TT.confirm('Delete creature', `Remove ${e.name} from the library?`, 'Delete')) TT.do({ t: 'npcDelete', eid: e.id }); } }, '✕'))), e.desc ? h('div', { class: 'd' }, e.desc) : null)) : empty('No creatures match. Import the presets or create your own.'));
    };
    const alSel = h('select', { class: 'inp', style: { maxWidth: '180px' }, onchange: (e) => { al = e.target.value; paint(); } }, opt('', 'Any alignment'), (rs().alignments || []).map((a) => opt(a, a)));
    mount(root, [h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('h2', { class: 'grow' }, 'Creature library'), searchBar((v) => { q = v; paint(); }, 'Search…'), alSel, inp('', { type: 'number', placeholder: 'Max level', class: 'inp num', oninput: (e) => { lvl = e.target.value; paint(); } }),
      h('button', { class: 'btn', onclick: async () => { const r = await TT.do({ t: 'importNpcs' }); if (r) TT.toast(r.imported ? `Imported ${r.imported} preset creatures.` : 'All preset creatures are already in your library.'); } }, '⬇ Import preset creatures'), h('button', { class: 'btn primary', onclick: () => entityEditor(null, { isNew: true }) }, '＋ New creature')), list]);
    paint(); const f = () => paint(); TT.on('state', f); root.destroy = () => TT.off('state', f); return root;
  };

  // ------------------------------------------------------------------ Catalog (items & skills/actions)
  TT.dmCatalog = function () {
    const root = h('div', { style: { padding: '14px', maxWidth: '1200px', margin: '0 auto' } }); let kind = 'items', q = '', type = '';
    const list = h('div', { class: 'col' });
    const targetPicker = (title, onPick) => {
      const pcs = Object.values(TT.state.entities).filter((e) => e.kind === 'pc'); if (!pcs.length) return TT.toast('No characters yet.');
      const sel = h('select', { class: 'inp' }, pcs.map((p) => opt(p.id, p.name))); const hb = hiddenBox();
      TT.modal({ title, body: h('div', { class: 'col' }, lbl('Character', sel), hb.el), actions: [{ label: 'Cancel' }, { label: 'Give', primary: true, onClick: async () => !!(await onPick(sel.value, hb.c.checked)) }] });
    };
    const shopPick = (it) => {
      const shops = (rs().tabs || []).filter((t) => t.type === 'shop'); if (!shops.length) return TT.toast('This ruleset has no shop tab. Add one in Settings → Ruleset.');
      const sel = h('select', { class: 'inp' }, shops.map((t) => opt(t.id, t.name)));
      TT.modal({ title: 'Add to shop', body: lbl('Shop', sel), actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: async () => { const data = JSON.parse(JSON.stringify(TT.state.tabData[sel.value] || { items: [] })); data.items = data.items || []; data.items.push({ id: 's_' + Math.random().toString(36).slice(2, 9), ref: it.key, price: it.price || {}, stock: null }); const r = await TT.do({ t: 'tabSet', tabId: sel.value, data }); if (r) TT.toast('Added to ' + shops.find((s) => s.id === sel.value).name + '.'); return !!r; } }] });
    };
    const paint = () => {
      const src = kind === 'items' ? itemsOf() : actionsOf();
      const rows = src.filter((x) => (!q || x.name.toLowerCase().includes(q) || (x.desc || '').toLowerCase().includes(q)) && (!type || (kind === 'items' ? x.type : x.kind) === type)).slice(0, 150);
      mount(list, rows.length ? [h('div', { class: 'muted small' }, `${rows.length}${rows.length === 150 ? '+' : ''} shown of ${src.length}`), rows.map((x) => h('div', { class: 'act' }, h('div', { class: 'row between' }, h('span', { class: 'nm' }, x.name), h('span', { class: 'row' },
        kind === 'items' ? [x.price ? h('span', { class: 'pill gold' }, TT.priceText(x.price)) : null, h('button', { class: 'btn sm', onclick: () => targetPicker('Give ' + x.name, (eid, hidden) => TT.do({ t: 'give', eid, ref: x.key, qty: 1, hidden })) }, 'Give'), h('button', { class: 'btn sm', onclick: () => shopPick(x) }, 'To shop')]
          : h('button', { class: 'btn sm', onclick: () => targetPicker('Teach ' + x.name, async (eid, hidden) => { const e = TT.ent(eid); const acts = [...(e.rawActions || []).map((a) => (typeof a === 'string' ? { ref: a } : a)), { ref: x.key }]; const r = await TT.do({ t: 'entityEdit', eid, patch: { actions: acts } }); if (r) TT.do({ t: 'customLog', text: `DM grants ${e.name} the ${x.name} ability.`, hidden }, true); return r; }) }, 'Add to character'))),
        h('div', { class: 'meta' }, [kind === 'items' ? x.type : x.kind, x.damage, x.level != null ? 'Level ' + x.level : null, x.uses].filter(Boolean).join(' · ')), x.desc ? h('div', { class: 'd' }, x.desc) : null))] : empty('Nothing matches.'));
    };
    const types = () => [...new Set((kind === 'items' ? itemsOf() : actionsOf()).map((x) => (kind === 'items' ? x.type : x.kind)).filter(Boolean))].sort();
    const typeSel = h('select', { class: 'inp', style: { maxWidth: '180px' }, onchange: (e) => { type = e.target.value; paint(); } });
    const fillTypes = () => mount(typeSel, [opt('', 'All types'), types().map((t) => opt(t, t))]);
    const kb = (k, l) => h('button', { class: 'btn' + (kind === k ? ' active' : ''), onclick: () => { kind = k; type = ''; fillTypes(); paint(); mount(bar, barKids()); } }, l);
    const bar = h('div', { class: 'row wrap', style: { marginBottom: '12px' } }); const barKids = () => [h('h2', { class: 'grow' }, 'Catalog'), kb('items', 'Items'), kb('actions', 'Skills & spells'), searchBar((v) => { q = v; paint(); }), typeSel];
    mount(bar, barKids()); fillTypes(); paint(); mount(root, [bar, list]); return root;
  };

  // ------------------------------------------------------------------ Custom tabs
  TT.customTab = function (tabId) {
    const def = (rs().tabs || []).find((t) => t.id === tabId); const dm = TT.isDM(); const root = h('div', { style: { padding: '14px', maxWidth: '1000px', margin: '0 auto' } });
    if (!def) return empty('This tab no longer exists.');
    const data = () => JSON.parse(JSON.stringify(TT.state.tabData[tabId] || {}));
    const write = (d) => TT.do({ t: 'tabSet', tabId, data: d });
    const uid = () => 'r_' + Math.random().toString(36).slice(2, 9);
    const paint = () => {
      const top = root.parentElement ? root.parentElement.scrollTop : 0; const d = data();
      if (def.type === 'shop') {
        const me = TT.myEntity(); const items = d.items || [];
        const shopRow = (row) => { const it = row.ref ? itemsOf().find((i) => i.key === row.ref) : row.item; if (!it) return null; const price = row.price || it.price || {};
          return h('div', { class: 'act' + (row.hidden ? ' hiddenlog' : '') }, h('div', { class: 'row between' }, h('span', { class: 'nm' }, it.name, row.stock != null ? h('span', { class: 'muted small' }, `  (${row.stock} left)`) : null, row.hidden ? h('span', { class: 'pill' }, 'hidden') : null),
            h('span', { class: 'row' }, h('span', { class: 'pill gold' }, TT.priceText(price)),
              !dm && me ? h('button', { class: 'btn sm primary', disabled: row.stock === 0, onclick: async () => { const r = await TT.do({ t: 'buy', tabId, itemId: row.id, qty: 1 }); if (r) TT.toast('Purchased ' + it.name + '.'); } }, 'Buy') : null,
              dm ? [h('button', { class: 'btn sm', onclick: async () => { const p = await TT.prompt('Price', `Price of ${it.name} as JSON, e.g. {"gp": 10}`, JSON.stringify(price)); if (p == null) return; const v = parseJson(p, 'Price'); if (v) { const n = data(); n.items.find((x) => x.id === row.id).price = v; write(n); } } }, '$'),
                h('button', { class: 'btn sm', onclick: async () => { const p = await TT.prompt('Stock', 'Units in stock (blank = unlimited)', row.stock == null ? '' : row.stock); if (p == null) return; const n = data(); n.items.find((x) => x.id === row.id).stock = p === '' ? null : Math.max(0, Number(p) || 0); write(n); } }, '#'),
                h('button', { class: 'btn sm', title: 'Hide / show to players', onclick: () => { const n = data(); const r2 = n.items.find((x) => x.id === row.id); r2.hidden = !r2.hidden; write(n); } }, row.hidden ? '👁' : '🕶'),
                h('button', { class: 'btn sm danger', onclick: () => { const n = data(); n.items = n.items.filter((x) => x.id !== row.id); write(n); } }, '✕')] : null)),
            h('div', { class: 'meta' }, [it.type, it.damage].filter(Boolean).join(' · ')), it.desc ? h('div', { class: 'd' }, it.desc) : null); };
        mount(root, [h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('h2', null, def.icon + ' ' + def.name), me ? h('span', null, 'Your money: ', h('b', null, TT.moneyText(me.currency))) : null),
          items.length ? items.map(shopRow) : empty('The shop is empty.'),
          dm ? h('div', { class: 'row wrap', style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: () => { if (TT.ui.setTab) TT.ui.setTab('catalog'); } }, '📚 Add from catalog'), h('button', { class: 'btn', onclick: () => customShopItem() }, '＋ Custom item')) : null]);
      } else {
        const key = def.type === 'quests' ? 'quests' : 'rows'; const rows = d[key] || [];
        const card = (r) => h('div', { class: 'act' + (r.hidden ? ' hiddenlog' : '') }, h('div', { class: 'row between' }, h('span', { class: 'nm' }, r.title, def.type === 'quests' ? h('span', { class: 'pill ' + (r.status === 'done' ? 'green' : r.status === 'failed' ? 'red' : 'gold'), style: { marginLeft: '8px' } }, r.status || 'open') : null, r.hidden ? h('span', { class: 'pill' }, 'hidden') : null),
          dm ? h('span', { class: 'row' }, def.type === 'quests' ? h('select', { class: 'inp sm', onchange: (e) => { const n = data(); n[key].find((x) => x.id === r.id).status = e.target.value; write(n); } }, ['open', 'done', 'failed'].map((s) => opt(s, s, (r.status || 'open') === s))) : null,
            h('button', { class: 'btn sm', onclick: () => editRow(r) }, 'Edit'), h('button', { class: 'btn sm', onclick: () => { const n = data(); const x = n[key].find((y) => y.id === r.id); x.hidden = !x.hidden; write(n); } }, r.hidden ? '👁' : '🕶'), h('button', { class: 'btn sm danger', onclick: () => { const n = data(); n[key] = n[key].filter((x) => x.id !== r.id); write(n); } }, '✕')) : null),
          r.reward ? h('div', { class: 'meta' }, 'Reward: ' + r.reward) : null, r.text ? h('div', { class: 'd', style: { whiteSpace: 'pre-wrap' } }, r.text) : null);
        mount(root, [h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('h2', null, def.icon + ' ' + def.name), dm ? h('button', { class: 'btn primary', onclick: () => editRow(null) }, '＋ Add') : null), rows.length ? rows.map(card) : empty(dm ? 'Nothing here yet — add the first entry.' : 'Nothing has been shared yet.')]);
      }
      if (root.parentElement) root.parentElement.scrollTop = top;
    };
    const editRow = (r) => {
      const key = def.type === 'quests' ? 'quests' : 'rows'; const title = inp(r ? r.title : ''); const text = h('textarea', { class: 'inp', rows: 5 }, r ? r.text || '' : ''); const reward = inp(r ? r.reward || '' : ''); const hb = h('input', { type: 'checkbox', checked: !!(r && r.hidden) });
      TT.modal({ title: r ? 'Edit entry' : 'New entry', body: h('div', { class: 'col' }, lbl('Title', title), lbl('Details', text), def.type === 'quests' ? lbl('Reward', reward) : null, h('label', { class: 'chk' }, hb, 'Hidden from players')),
        actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => { if (!title.value.trim()) return false; const n = data(); n[key] = n[key] || []; const o = r ? n[key].find((x) => x.id === r.id) : { id: uid(), status: 'open' }; Object.assign(o, { title: title.value.trim(), text: text.value, reward: reward.value, hidden: hb.checked }); if (!r) n[key].push(o); return !!(await write(n)); } }] });
    };
    const customShopItem = () => {
      const name = inp(''), desc = inp(''), price = inp('{"gp": 1}'), stock = inp('', { type: 'number', placeholder: 'unlimited' });
      TT.modal({ title: 'Custom shop item', body: h('div', { class: 'col' }, lbl('Name', name), lbl('Description', desc), lbl('Price (JSON)', price), lbl('Stock', stock)), actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: async () => { const p = parseJson(price.value, 'Price'); if (!p || !name.value.trim()) return false; const n = data(); n.items = n.items || []; n.items.push({ id: uid(), item: { name: name.value.trim(), desc: desc.value, type: 'gear' }, price: p, stock: stock.value === '' ? null : Number(stock.value) }); return !!(await write(n)); } }] });
    };
    paint(); const f = () => paint(); TT.on('state', f); root.destroy = () => TT.off('state', f); return root;
  };

  // ------------------------------------------------------------------ Settings
  TT.dmSettings = function () {
    const root = h('div', { style: { padding: '14px', maxWidth: '900px', margin: '0 auto' } });
    const card = (t, ...k) => h('div', { class: 'panel', style: { marginBottom: '12px' } }, h('h3', null, t), h('div', { class: 'panel-b col' }, ...k));
    const note = h('textarea', { class: 'inp', rows: 2, placeholder: 'e.g. The party donates 50 gp to the temple.' }); const hb = hiddenBox();
    mount(root, [h('h2', { style: { marginBottom: '12px' } }, 'Campaign settings'),
      card('Rests', h('p', { class: 'muted small' }, 'Restores resources for the whole party according to the ruleset.'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => TT.do({ t: 'rest', type: 'short' }) }, 'Party short rest'), h('button', { class: 'btn', onclick: () => TT.do({ t: 'rest', type: 'long' }) }, 'Party long rest'))),
      card('Map', h('button', { class: 'btn', onclick: () => TT.sceneDialog() }, '🗺 Map image, size & grid…')),
      card('Custom log entry', h('p', { class: 'muted small' }, 'Adds a line to the ' + (rs().customLogName || 'custom') + ' log (gifts, donations, house rules…).'), note, h('div', { class: 'row between' }, hb.el, h('button', { class: 'btn', onclick: async () => { if (!note.value.trim()) return; if (await TT.do({ t: 'customLog', text: note.value, hidden: hb.c.checked })) note.value = ''; } }, 'Add to log'))),
      card('Ruleset', h('p', { class: 'muted small' }, `Currently: ${rs().name}. Edit anything — abilities, formulas, classes, creation steps, statuses, tabs. Existing characters are recalculated instantly.`), h('div', null, h('button', { class: 'btn primary', onclick: () => TT.rulesetEditor(JSON.parse(JSON.stringify(rs())), { title: 'Edit ruleset — ' + rs().name, saveLabel: 'Apply to campaign', onSave: async (r) => { const x = await TT.do({ t: 'rulesetSet', ruleset: r }); if (x) { TT.toast('Ruleset updated.'); return true; } return false; } }) }, '⚙ Edit ruleset…'))),
      card('DM password', h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const p = await TT.prompt('DM password', 'New DM password (min. 3 characters)', '', { type: 'text' }); if (p && await TT.do({ t: 'dmPassword', password: p })) TT.toast('DM password changed.'); } }, '🔑 Change DM password')))]);
    return root;
  };
})();
