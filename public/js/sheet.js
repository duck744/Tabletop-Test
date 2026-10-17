/* Character sheet: fully calculated by the server and rendered read-only for players (only the DM can edit). */
(function () {
  'use strict';
  const { h, mount } = TT;

  // ---------- shared small pieces
  // Show formulas with this character's numbers filled in: "1d12+str_mod" -> "1d12+2".
  TT.fmtF = (ent, f) => {
    if (f == null || !ent || !ent.comp) return f; const c = ent.comp; const sc = { level: ent.level || 1 };
    for (const [k, v] of Object.entries(c.derived || {})) if (typeof v === 'number') sc[k] = v;
    for (const [k, v] of Object.entries(c.abilities || {})) { sc[k] = v.score; sc[k + '_mod'] = v.mod; }
    const src = String(f).replace(/\b[a-z_][a-z0-9_]*\b/gi, (w) => (/^d\d+$/i.test(w) ? w : w in sc ? String(sc[w]) : w));
    if (!/^[\dd+\-\s]+$/i.test(src)) return String(f);
    let sum = 0; const keep = [];
    for (const t of src.replace(/\s+/g, '').replace(/\+-/g, '-').split(/(?=[+-])/)) { if (!t) continue; if (/d/i.test(t)) keep.push(t.replace(/^\+/, '')); else sum += Number(t) || 0; }
    return (keep.join('+').replace(/\+-/g, '-') + (sum ? (sum > 0 && keep.length ? '+' : '') + sum : '')) || '0';
  };
  TT.rollSummary = (c) => {
    if (!c) return '';
    if (c.system === 'd100') return `${c.label || 'Roll'}: ${c.total} vs ${c.target} → ${c.level}`;
    const dice = c.rolls && c.rolls.length > 1 ? `[${c.rolls.join(', ')}]→${c.nat}` : c.nat;
    return `${c.label || 'Roll'}: ${dice} ${c.mod >= 0 ? '+' : '−'} ${Math.abs(c.mod)}${c.bonus ? ' ' + (c.bonus > 0 ? '+' : '−') + ' ' + Math.abs(c.bonus) : ''} = ${c.total}${c.crit === 'crit' ? ' — CRITICAL!' : c.crit === 'fail' ? ' — natural fail' : ''}`;
  };
  TT.roll = async (ent, kind, key, extra) => {
    const r = await TT.do({ t: 'roll', eid: ent.id, kind, key, ...(extra || {}) });
    if (r && r.check) TT.toast(TT.rollSummary(r.check), r.check.crit === 'fail' || r.check.level === 'Fumble' ? 'error' : '');
    return r;
  };
  TT.statusChips = (ent, onRemove) => h('div', { class: 'chips' }, (ent.status || []).map((s) => { const d = TT.statusDef(s.key); return h('span', { class: 'status-chip' + ((d.tags || []).includes('buff') ? ' buff' : ''), title: (d.desc || '') + (s.turns != null ? ` (${s.turns} turns left)` : '') }, d.name, s.turns != null ? h('span', { class: 'muted tiny' }, ' ' + s.turns + 't') : null, onRemove ? h('button', { style: { background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }, onclick: () => onRemove(s.key), 'aria-label': 'Remove ' + d.name }, '×') : null); }));
  const hasLabel = (r) => r && r.label !== undefined;
  // Resource bars / pips. `onClick(key)` makes them editable (DM).
  TT.resourceBars = (ent, onClick, only) => {
    const rs = TT.rs(); const wrap = h('div');
    for (const r of rs.resources) {
      const v = ent.res[r.key]; if (!v || (only && !only(r))) continue;
      const click = onClick ? () => onClick(r) : null;
      if (hasLabel(v)) { wrap.appendChild(h('div', { class: 'res-row' }, h('div', { class: 'nm' }, h('span', null, r.name), h('span', null, v.label)))); continue; }
      const pct = v.max ? Math.max(0, Math.min(100, (v.cur / v.max) * 100)) : 0;
      if (!r.primary && v.max <= 12 && v.max > 0) wrap.appendChild(h('div', { class: 'res-row', style: { cursor: click ? 'pointer' : 'default' }, onclick: click }, h('div', { class: 'nm' }, h('span', null, r.name), h('span', null, `${v.cur}/${v.max}`)), h('div', { class: 'pips', style: { '--c': r.color } }, Array.from({ length: v.max }, (_, i) => h('div', { class: 'pip' + (i < v.cur ? ' on' : '') })))));
      else wrap.appendChild(h('div', { class: 'res-row', style: { cursor: click ? 'pointer' : 'default' }, onclick: click }, h('div', { class: 'nm' }, h('span', null, r.name), h('span', null, `${v.cur}/${v.max}`)), h('div', { class: 'bar', style: { '--c': r.color } }, h('i', { style: { width: pct + '%' } }), h('span', null, `${v.cur} / ${v.max}`))));
    }
    return wrap;
  };

  const grantedSkills = (ent) => { const rs = TT.rs(); const s = new Set(); for (const g of rs.choices || []) { const o = (g.options || []).find((x) => x.key === (ent.choices || {})[g.key]); if (o) (o.skills || []).forEach((k) => s.add(k)); } return s; };

  TT.sheetTab = TT.ls.get('sheetTab', 'actions');
  TT.renderSheet = function (ent, opts = {}) {
    const rs = TT.rs(); const c = ent.comp; const d100 = rs.rollSystem === 'd100'; const dm = TT.isDM();
    const abilCard = (a) => { const x = c.abilities[a.key]; return h('div', { class: 'stat', tabindex: 0, title: 'Roll ' + a.name, onclick: () => TT.roll(ent, 'ability', a.key), onkeydown: (e) => { if (e.key === 'Enter') TT.roll(ent, 'ability', a.key); } }, h('div', { class: 'k' }, a.abbr || a.name), h('div', { class: 'v' }, d100 ? x.score : TT.mod(x.mod)), h('div', { class: 's' }, d100 ? `${Math.floor(x.score / 2)} / ${Math.floor(x.score / 5)}` : x.score)); };
    const grants = grantedSkills(ent);
    const left = h('div', { class: 'col' },
      h('div', { class: 'panel hero-card' }, TT.avatar(ent, 64), h('div', { class: 'grow' }, h('h2', null, ent.name), h('div', { class: 'muted' }, ent.classLabel), h('div', { class: 'muted small' }, (rs.creation && rs.creation.hideLevel ? '' : 'Level ' + ent.level) + (ent.alignment ? ' · ' + ent.alignment : '')), ent.owner ? h('div', { class: 'pill gold' }, 'Summon / companion') : null)),
      ent.status.length ? h('div', { class: 'panel' }, h('h3', null, 'Conditions'), h('div', { class: 'panel-b' }, TT.statusChips(ent))) : null,
      h('div', { class: 'panel' }, h('h3', null, 'Resources'), h('div', { class: 'panel-b' }, TT.resourceBars(ent, opts.onResource))),
      h('div', { class: 'panel' }, h('h3', null, d100 ? 'Characteristics' : 'Abilities'), h('div', { class: 'panel-b stat-grid' }, rs.abilities.map(abilCard))),
      c.derived && Object.keys(c.derived).length ? h('div', { class: 'panel' }, h('h3', null, 'Combat stats'), h('div', { class: 'panel-b stat-grid' }, rs.derived.filter((x) => c.derivedVisible[x.key] !== false).map((x) => {
        const v = c.derived[x.key]; const txt = x.map && x.map[String(v)] != null ? x.map[String(v)] : x.fmt === '+' ? TT.mod(v) : v;
        const clickable = x.key === (rs.initiative || {}).stat; return h('div', { class: 'stat' + (clickable ? '' : ' plain'), onclick: clickable ? () => TT.roll(ent, 'init') : null }, h('div', { class: 'k' }, x.name), h('div', { class: 'v', style: { fontSize: '22px' } }, txt, x.unit ? h('span', { class: 's' }, ' ' + x.unit) : null)); }))) : null);

    const mid = h('div', { class: 'col' },
      rs.saves.length ? h('div', { class: 'panel' }, h('h3', null, 'Saving throws'), h('div', { class: 'panel-b' }, rs.saves.map((s) => h('div', { class: 'list-row', onclick: () => TT.roll(ent, 'save', s.key) }, h('span', { class: 'prof-dot' + (c.saves[s.key] > (c.abilities[s.ability] ? c.abilities[s.ability].mod : 0) ? ' on' : '') }), h('span', null, s.name), h('span', { class: 'val' }, TT.mod(c.saves[s.key])))))) : null,
      h('div', { class: 'panel' }, h('h3', null, 'Skills'), h('div', { class: 'panel-b' }, rs.skills.map((s) => {
        const prof = Math.max(ent.skillProf[s.key] || 0, grants.has(s.key) ? 1 : 0); const rank = ent.skillRanks[s.key] || 0; const ab = (rs.abilities.find((a) => a.key === s.ability) || {}).abbr;
        return h('div', { class: 'list-row', onclick: () => TT.roll(ent, 'skill', s.key), title: 'Roll ' + s.name }, rs.skillMode === 'prof' ? h('span', { class: 'prof-dot' + (prof >= 2 ? ' dbl' : prof ? ' on' : '') }) : null,
          h('span', null, s.name, ab ? h('span', { class: 'muted tiny' }, ' ' + ab) : null), rs.skillMode !== 'prof' && rank ? h('span', { class: 'muted tiny' }, ' ·' + rank) : null,
          h('span', { class: 'val' }, d100 ? c.skills[s.key] + '%' : TT.mod(c.skills[s.key]))); }))),
      (rs.rolls || []).length ? h('div', { class: 'panel' }, h('h3', null, 'Special rolls'), h('div', { class: 'panel-b' }, rs.rolls.map((r) => h('div', { class: 'list-row', onclick: () => TT.roll(ent, 'roll', r.key) }, h('span', null, r.name), h('span', { class: 'val' }, c.rolls[r.key] + '%'))))) : null);

    // ---- right column: tabs
    const tabs = [['actions', 'Actions'], ['inventory', 'Inventory'], ['details', 'Details']]; let cur = TT.sheetTab; if (!tabs.some((t) => t[0] === cur)) cur = 'actions';
    const body = h('div', { class: 'panel-b', style: { maxHeight: opts.fullHeight ? 'none' : '70vh', overflow: 'auto' } });
    const bar = h('div', { class: 'tabbar' });
    const paintTab = () => {
      TT.mount(bar, tabs.map(([k, l]) => h('button', { class: cur === k ? 'on' : '', onclick: () => { cur = k; TT.sheetTab = k; TT.ls.set('sheetTab', k); paintTab(); } }, l)));
      mount(body, cur === 'actions' ? actionsTab() : cur === 'inventory' ? inventoryTab() : detailsTab());
    };
    const actionsTab = () => {
      const groups = { weapon: [], spell: [], feature: [], other: [] };
      for (const a of ent.actions) (groups[a.kind] || groups.other).push(a);
      const out = [];
      const sec = (title, list) => { if (!list.length) return; out.push(h('h4', { style: { margin: '10px 0 6px', color: 'var(--muted)' } }, title)); list.sort((x, y) => (x.level || 0) - (y.level || 0)).forEach((a) => out.push(actCard(a))); };
      sec('Attacks', groups.weapon); sec('Spells & powers', groups.spell); sec('Features', [...groups.feature, ...groups.other]);
      return out.length ? out : h('p', { class: 'muted' }, 'No abilities yet. Your DM can add some.');
    };
    const actCard = (a) => {
      const meta = [a.kind === 'spell' ? (a.level === 0 ? 'Cantrip' : a.level ? 'Level ' + a.level : 'Spell') : null, a.uses ? a.uses : null, a.atkVal != null ? (d100 ? a.atkVal + '%' : TT.mod(a.atkVal) + ' to hit') : null, a.damage ? TT.fmtF(ent, a.damage) + (a.damageType ? ' ' + a.damageType : '') : null, a.heal ? 'heals ' + TT.fmtF(ent, a.heal) : null, a.dcVal != null ? `DC ${a.dcVal} ${a.save.ability.toUpperCase()}` : null, a.range, a.cost ? `costs ${a.cost.amount} ${(rs.resources.find((r) => r.key === a.cost.res) || { name: a.cost.res }).name}` : null].filter(Boolean).join(' · ');
      return h('div', { class: 'act' }, h('div', { class: 'row between' }, h('span', { class: 'nm' }, a.name), TT.canControl(ent) ? h('button', { class: 'btn sm primary', onclick: () => TT.actionDialog(ent, a) }, 'Use') : null), h('div', { class: 'meta' }, meta), a.desc ? h('div', { class: 'd' }, a.desc) : null);
    };
    const inventoryTab = () => {
      const items = ent.inventory; const out = [h('div', { class: 'row between', style: { marginBottom: '8px' } }, h('b', null, 'Money'), h('span', null, TT.moneyText(ent.currency)))];
      if (!items.length) out.push(h('p', { class: 'muted' }, 'Your pack is empty.'));
      for (const it of items) {
        const stats = [it.damage ? TT.fmtF(ent, it.damage) + (it.damageType ? ' ' + it.damageType : '') : null, it.attack ? 'atk ' + TT.fmtF(ent, it.attack) : null, it.vars && it.vars.armorbase ? 'AC ' + it.vars.armorbase : null, it.vars && it.vars.armorbonus ? 'AC +' + it.vars.armorbonus : null].filter(Boolean).join(' · ');
        out.push(h('div', { class: 'act' }, h('div', { class: 'row between' }, h('span', { class: 'nm' }, it.name || it.ref, it.qty > 1 ? ' ×' + it.qty : '', it.equipped ? h('span', { class: 'pill green', style: { marginLeft: '6px' } }, 'equipped') : null),
          h('span', { class: 'row' }, it.use && TT.canControl(ent) ? h('button', { class: 'btn sm', onclick: () => TT.itemDialog(ent, it) }, 'Use') : null, !TT.isDM() && TT.myEntity() && TT.myEntity().id === ent.id ? h('button', { class: 'btn sm', onclick: () => giftDialog(it) }, 'Give') : null)),
          h('div', { class: 'meta' }, [it.type, stats].filter(Boolean).join(' · ')), it.desc ? h('div', { class: 'd' }, it.desc) : null));
      }
      if (!TT.isDM() && TT.myEntity() && TT.myEntity().id === ent.id) out.push(h('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: () => giftDialog(null) }, '💰 Give money to a party member'));
      return out;
    };
    const giftDialog = (it) => {
      const others = Object.values(TT.state.entities).filter((e) => e.kind === 'pc' && e.id !== ent.id);
      if (!others.length) return TT.toast('There is nobody else to give to yet.');
      const to = h('select', { class: 'inp' }, others.map((o) => h('option', { value: o.id }, o.name)));
      const qty = h('input', { class: 'inp', type: 'number', min: 1, max: it ? it.qty : 999, value: 1 });
      const cur = (rs.currency || [])[Math.min(1, (rs.currency || []).length - 1)]; const ck = h('select', { class: 'inp' }, (rs.currency || []).map((x) => h('option', { value: x.key, selected: cur && x.key === cur.key }, x.name)));
      TT.modal({ title: it ? 'Give ' + (it.name || it.ref) : 'Give money', body: h('div', { class: 'col' }, h('label', { class: 'lbl' }, 'To', to), it ? null : h('label', { class: 'lbl' }, 'Currency', ck), h('label', { class: 'lbl' }, it ? 'Quantity' : 'Amount', qty)),
        actions: [{ label: 'Cancel' }, { label: 'Give', primary: true, onClick: async () => { const m = { t: 'gift', to: to.value }; if (it) { m.itemId = it.id; m.qty = Number(qty.value); } else m.currency = { [ck.value]: Number(qty.value) }; const r = await TT.do(m); return r ? true : false; } }] });
    };
    const detailsTab = () => {
      const out = [];
      if (ent.desc) out.push(h('p', null, ent.desc));
      const bio = ent.bio || {}; for (const k of Object.keys(bio)) out.push(h('div', null, h('h4', { style: { color: 'var(--muted)', margin: '8px 0 2px' } }, k), h('p', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, bio[k])));
      for (const g of rs.choices) { const o = (g.options || []).find((x) => x.key === (ent.choices || {})[g.key]); if (o) out.push(h('div', { class: 'act' }, h('div', { class: 'nm' }, g.name + ': ' + o.name), h('div', { class: 'd' }, o.desc || ''))); }
      if (ent.recLevel != null) out.push(h('p', { class: 'muted' }, 'Recommended level: ' + ent.recLevel));
      return out.length ? out : h('p', { class: 'muted' }, 'Nothing here yet.');
    };
    paintTab();
    const right = h('div', { class: 'panel' }, bar, body);
    return h('div', { class: 'sheet' }, left, mid, right);
  };
})();
