/* Dialogs for using actions/items, log panels, floating windows (notes + dice) and the combat tracker. */
(function () {
  'use strict';
  const { h, mount } = TT;

  // =================================================================== action + item dialogs
  function targetPicker(preselect, single) {
    const state = TT.state; const eids = [...new Set(Object.values(state.tokens).map((t) => t.eid))].filter((id) => state.entities[id]);
    const chosen = new Set(preselect || []);
    const box = h('div', { class: 'col gap4', style: { maxHeight: '28vh', overflow: 'auto' } });
    const paint = () => mount(box, eids.length ? eids.map((id) => { const e = state.entities[id]; const hp = e.res && e.res[TT.rs().combat.hp]; const lab = hp ? (hp.label !== undefined ? hp.label : `${hp.cur}/${hp.max}`) : '';
      return h('label', { class: 'itemrow' }, h('input', { type: single ? 'radio' : 'checkbox', name: 'tgt', checked: chosen.has(id), onchange: (ev) => { if (single) chosen.clear(); if (ev.target.checked) chosen.add(id); else chosen.delete(id); } }), TT.avatar(e, 24), h('span', { class: 'grow' }, e.name), h('span', { class: 'muted small' }, lab)); }) : h('p', { class: 'muted small' }, 'Nobody is on the map yet.'));
    paint(); return { el: box, get: () => [...chosen] };
  }

  TT.actionDialog = function (ent, a) {
    const rs = TT.rs(); const d100 = rs.rollSystem === 'd100';
    const needsTargets = !!(a.attack || a.damage || a.save || (a.applies || []).length || a.heal); const tp = needsTargets ? targetPicker(TT.ui.targets && TT.ui.targets.length ? TT.ui.targets : [], false) : null;
    // spell slot choices for upcasting
    let slotSel = null;
    if (a.cost && a.upcast && a.level) {
      const prefix = a.cost.res.replace(/\d+$/, ''); const opts = [];
      for (let l = a.level; l <= 9; l++) { const r = ent.res[prefix + l]; if (r && r.cur > 0) opts.push(l); }
      if (opts.length > 1) slotSel = h('select', { class: 'inp' }, opts.map((l) => h('option', { value: l }, 'Level ' + l)));
    }
    const adv = h('select', { class: 'inp' }, [h('option', { value: '' }, 'Normal'), h('option', { value: 'adv' }, d100 ? 'Bonus die' : 'Advantage'), h('option', { value: 'dis' }, d100 ? 'Penalty die' : 'Disadvantage')]);
    const bonus = h('input', { class: 'inp', type: 'number', value: 0 });
    const hidden = h('input', { type: 'checkbox', checked: TT.ls.get('dmHidden', false) });
    const body = h('div', { class: 'col' }, h('div', { class: 'muted small' }, a.desc || ''),
      tp ? h('div', null, h('div', { class: 'lbl', style: { marginBottom: '4px' } }, 'Targets'), tp.el) : null, slotSel ? h('label', { class: 'lbl' }, 'Cast at', slotSel) : null,
      a.attack ? h('div', { class: 'grid2' }, h('label', { class: 'lbl' }, 'Roll mode', adv), h('label', { class: 'lbl' }, 'Extra bonus', bonus)) : null,
      TT.isDM() ? h('label', { class: 'chk' }, hidden, 'Keep this action hidden from players') : null);
    TT.modal({ title: a.name, body, actions: [{ label: 'Cancel' }, { label: 'Use ' + a.name, primary: true, onClick: async () => {
      if (TT.isDM()) TT.ls.set('dmHidden', hidden.checked);
      const r = await TT.do({ t: 'action', eid: ent.id, actionId: a.id || a.key, targets: tp ? tp.get() : [], slot: slotSel ? Number(slotSel.value) : 0, adv: adv.value || undefined, bonus: Number(bonus.value) || 0, hidden: TT.isDM() && hidden.checked });
      return r ? true : false; } }] });
  };
  TT.itemDialog = function (ent, it) {
    const tp = targetPicker([ent.id], false); const hidden = h('input', { type: 'checkbox', checked: TT.ls.get('dmHidden', false) });
    TT.modal({ title: 'Use ' + (it.name || it.ref), body: h('div', { class: 'col' }, h('div', { class: 'muted small' }, it.desc || ''), h('div', { class: 'lbl' }, 'On'), tp.el, TT.isDM() ? h('label', { class: 'chk' }, hidden, 'Keep hidden from players') : null),
      actions: [{ label: 'Cancel' }, { label: 'Use', primary: true, onClick: async () => { const r = await TT.do({ t: 'item', eid: ent.id, itemId: it.id, targets: tp.get(), hidden: TT.isDM() && hidden.checked }); return r ? true : false; } }] });
  };

  // =================================================================== logs
  function nameOf(eid, fallback) { const e = eid && TT.ent(eid); return e ? e.name : fallback; }
  function rollEntry(l) {
    const hdr = h('div', { class: 'hd' }, h('div', null, h('div', { class: 'who' }, (l.hidden ? '🕶 ' : '') + l.who), h('div', { class: 'muted small' }, l.label || '')), null);
    if (l.kind2 === 'dice') {
      return h('div', { class: 'log ' + (l.hidden ? 'hiddenlog' : '') }, h('div', { class: 'hd' }, h('div', null, h('div', { class: 'who' }, (l.hidden ? '🕶 ' : '') + l.who), h('div', { class: 'muted small' }, l.label)), h('div', { class: 'tot' }, l.total)),
        h('div', { class: 'brk' }, l.groups.map((g) => `${g.count}d${g.sides}[${g.results.join(', ')}]`).join(' + ') + (l.mod ? ` ${l.mod > 0 ? '+' : '−'} ${Math.abs(l.mod)}` : '')));
    }
    if (l.kind2 === 'damage') return h('div', { class: 'log dmg ' + (l.hidden ? 'hiddenlog' : '') }, h('div', { class: 'hd' }, h('div', null, h('div', { class: 'who' }, (l.hidden ? '🕶 ' : '') + l.who), h('div', { class: 'muted small' }, l.label)), h('div', { class: 'tot' }, l.total)), h('div', { class: 'brk' }, l.diceText || l.expr));
    if (l.system === 'd100') {
      const cls = l.crit === 'crit' || l.level === 'Extreme Success' ? 'crit' : l.success ? 'ok' : 'fail';
      return h('div', { class: 'log ' + cls + (l.hidden ? ' hiddenlog' : '') }, h('div', { class: 'hd' }, hdr.firstChild, h('div', { class: 'tot ' + (l.crit || '') }, l.total)),
        h('div', { class: 'brk' }, `rolled ${l.total} vs ${l.target}${l.mode ? (l.mode > 0 ? ' (bonus die)' : ' (penalty die)') : ''}`), h('span', { class: 'badge ' + (l.success ? 'ok' : 'fail') }, l.level));
    }
    const cls = l.crit === 'crit' ? 'crit' : l.crit === 'fail' ? 'fail' : l.success === true ? 'ok' : l.success === false ? 'fail' : '';
    const parts = (l.parts || []).map((p) => (p.label === 'd20' ? `d20(${l.rolls && l.rolls.length > 1 ? l.rolls.join('/') + '→' : ''}${p.value})` : `${p.label} ${p.value >= 0 ? '+' : '−'}${Math.abs(p.value)}`)).join('  ');
    return h('div', { class: 'log ' + cls + (l.hidden ? ' hiddenlog' : '') }, h('div', { class: 'hd' }, hdr.firstChild, h('div', { class: 'tot ' + (l.crit || '') }, l.total)),
      h('div', { class: 'brk' }, parts + (l.adv ? ` · ${l.adv === 'adv' ? 'advantage' : 'disadvantage'}` : '')),
      h('div', { class: 'row', style: { gap: '4px', marginTop: '2px', flexWrap: 'wrap' } }, l.crit === 'crit' ? h('span', { class: 'badge crit' }, 'Critical!') : l.crit === 'fail' ? h('span', { class: 'badge fail' }, 'Natural 1') : null,
        l.dc != null ? h('span', { class: 'badge ' + (l.success ? 'ok' : 'fail') }, (l.success ? 'Success' : 'Fail') + ' vs ' + l.dc) : null, l.confirm ? h('span', { class: 'badge ' + (l.confirm.ok ? 'crit' : '') }, 'Confirm ' + l.confirm.total + (l.confirm.ok ? ' ✓' : ' ✗')) : null));
  }
  function actionEntry(l) {
    const cls = { damage: 'dmg', heal: 'heal', status: 'status', turn: 'ok' }[l.kind2] || '';
    return h('div', { class: 'log ' + cls + (l.hidden ? ' hiddenlog' : '') }, (l.hidden ? '🕶 ' : '') + l.text);
  }
  TT.logPanel = function () {
    let tab = TT.ls.get('logTab', 'rolls'), who = '', kind = '';
    const list = h('div', { class: 'log-list' }); const tabsEl = h('div', { class: 'log-tabs' }); const filt = h('div', { class: 'filterbar' });
    const names = () => { const o = new Map(); for (const k of ['rolls', 'actions', 'custom']) for (const l of TT.logs[k]) if (l.eid && TT.ent(l.eid)) o.set(l.eid, TT.ent(l.eid).name); return [...o.entries()]; };
    const KINDS = { rolls: [['', 'All rolls'], ['attack', 'Attacks'], ['damage', 'Damage'], ['save', 'Saves'], ['skill', 'Skills'], ['dice', 'Dice'], ['init', 'Initiative']], actions: [['', 'Everything'], ['damage', 'Damage'], ['heal', 'Healing'], ['status', 'Status'], ['action', 'Actions'], ['turn', 'Turns']], custom: [['', 'Everything'], ['gift', 'Gifts'], ['buy', 'Purchases'], ['note', 'Notes']] };
    const pass = (l) => (!who || l.eid === who) && (!kind || l.kind2 === kind);
    const entryEl = (k, l) => (k === 'rolls' ? rollEntry(l) : actionEntry(l));
    const paint = (stick) => {
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
      mount(list, TT.logs[tab].filter(pass).slice(-200).map((l) => entryEl(tab, l))); if (stick || atBottom) list.scrollTop = list.scrollHeight;
    };
    const chrome = () => {
      mount(tabsEl, [['rolls', 'Rolls'], ['actions', 'Actions'], ['custom', TT.rs().customLogName || 'Custom']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; kind = ''; TT.ls.set('logTab', k); chrome(); paint(true); } }, l)));
      mount(filt, h('select', { class: 'inp sm', onchange: (e) => { who = e.target.value; paint(true); } }, [h('option', { value: '' }, 'Everyone'), ...names().map(([id, n]) => h('option', { value: id, selected: who === id }, n))]),
        h('select', { class: 'inp sm', onchange: (e) => { kind = e.target.value; paint(true); } }, KINDS[tab].map(([v, l]) => h('option', { value: v, selected: kind === v }, l))));
    };
    const el = h('div', { class: 'col', style: { gap: 0, flex: 1, minHeight: 0 } }, tabsEl, filt, list);
    chrome(); paint(true);
    const onLog = (k, l) => { if (k !== tab || !pass(l)) return; const e = entryEl(k, l); e.classList.add('new'); const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 40; list.appendChild(e); if (atBottom) list.scrollTop = list.scrollHeight; };
    const onState = (s, full) => { if (full) { chrome(); paint(true); } };
    TT.on('log', onLog); TT.on('state', onState);
    el.destroy = () => { TT.off('log', onLog); TT.off('state', onState); };
    return el;
  };
  // Big roll popups the DM can broadcast to everyone
  TT.on('log', (k, l) => {
    if (k !== 'rolls' || !l.popup) return;
    const el = h('div', { class: 'popup-roll' }, h('div', { class: 'muted small' }, l.who + ' rolls ' + (l.label || '')), h('div', { class: 'tot' }, l.total), h('div', { class: 'muted small' }, l.groups.map((g) => `${g.count}d${g.sides}[${g.results.join(',')}]`).join(' + ') + (l.mod ? (l.mod > 0 ? ' + ' : ' − ') + Math.abs(l.mod) : '')));
    document.body.appendChild(el); setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = 0; }, 4200); setTimeout(() => el.remove(), 4800);
  });

  // =================================================================== floating windows
  TT.floats = TT.floats || new Map();
  TT.float = function (id, { title, build, w = 360, h: ht = 360, x, y, onClose }) {
    if (TT.floats.has(id)) { const f = TT.floats.get(id); f.el.style.zIndex = ++TT.z; return f; }
    const saved = TT.ls.get('float_' + id, {}); TT.z = TT.z || 600;
    const el = h('div', { class: 'float' + (saved.min ? ' min' : ''), style: { left: Math.max(0, Math.min(window.innerWidth - 120, saved.x ?? x ?? window.innerWidth - w - 80)) + 'px', top: Math.max(40, Math.min(window.innerHeight - 60, saved.y ?? y ?? 90)) + 'px', width: (saved.w || w) + 'px', height: (saved.h || ht) + 'px', zIndex: ++TT.z } });
    const bodyEl = h('div', { class: 'float-b' }); const save = TT.debounce(() => TT.ls.set('float_' + id, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, min: el.classList.contains('min') }), 300);
    const head = h('div', { class: 'float-h' }, h('span', { class: 't' }, title), h('button', { title: 'Minimize', 'aria-label': 'Minimize', onclick: () => { el.classList.toggle('min'); save(); } }, '–'), h('button', { title: 'Close', 'aria-label': 'Close', onclick: () => f.close() }, '×'));
    el.append(head, bodyEl); TT.$('#floaters').appendChild(el);
    el.addEventListener('mousedown', () => { el.style.zIndex = ++TT.z; });
    head.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'BUTTON') return; const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop; head.setPointerCapture(e.pointerId);
      const mv = (ev) => { el.style.left = Math.max(-el.offsetWidth + 80, Math.min(window.innerWidth - 80, ev.clientX - ox)) + 'px'; el.style.top = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - oy)) + 'px'; };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); save(); }; head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); });
    if (window.ResizeObserver) new ResizeObserver(save).observe(el);
    const f = { el, body: bodyEl, close() { if (f.destroy) f.destroy(); el.remove(); TT.floats.delete(id); TT.ls.set('open_' + id, false); if (onClose) onClose(); TT.emit('floatsChanged'); } };
    TT.floats.set(id, f); TT.ls.set('open_' + id, true); build(bodyEl, f); TT.emit('floatsChanged'); return f;
  };
  TT.destroyFloats = () => { for (const f of [...TT.floats.values()]) { if (f.destroy) f.destroy(); f.el.remove(); } TT.floats.clear(); };

  // ---------------------------------------------------------------- notes
  TT.openNotes = function () {
    TT.float('notes', { title: '📝 Notes', w: 420, h: 440, build(body, f) {
      const dm = TT.isDM(); const me = TT.myEntity();
      let target = dm ? 'session' : me ? me.id : 'session'; let saveTimer = null; let dirty = false;
      const status = h('span', { class: 'muted tiny', style: { marginLeft: 'auto' } }, '');
      const sel = h('select', { onchange: () => { flush(); target = sel.value; load(); }, style: { maxWidth: '150px' } });
      const ed = h('div', { class: 'rte', contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Notes editor' });
      const view = h('div', { class: 'notes-view hidden', style: { flex: 1, overflow: 'auto' } });
      const cmd = (c, v) => { ed.focus(); document.execCommand(c, false, v); queue(); };
      const B = (label, c, title, v) => h('button', { title, onmousedown: (e) => e.preventDefault(), onclick: () => cmd(c, v) }, label);
      const bar = h('div', { class: 'rte-bar' }, sel,
        B(h('b', null, 'B'), 'bold', 'Bold (Ctrl+B)'), B(h('i', null, 'I'), 'italic', 'Italic (Ctrl+I)'), B(h('u', null, 'U'), 'underline', 'Underline (Ctrl+U)'), B(h('s', null, 'S'), 'strikeThrough', 'Strikethrough'),
        h('select', { title: 'Font', onchange: (e) => { if (e.target.value) cmd('fontName', e.target.value); e.target.value = ''; } }, [['', 'Font'], ['Georgia', 'Georgia'], ['Arial', 'Arial'], ['Courier New', 'Mono'], ['Trebuchet MS', 'Trebuchet'], ['Palatino Linotype', 'Palatino']].map(([v, l]) => h('option', { value: v }, l))),
        h('select', { title: 'Size', onchange: (e) => { if (e.target.value) cmd('fontSize', e.target.value); e.target.value = ''; } }, [['', 'Size'], ['2', 'Small'], ['3', 'Normal'], ['5', 'Large'], ['6', 'Huge']].map(([v, l]) => h('option', { value: v }, l))),
        h('select', { title: 'Heading', onchange: (e) => { if (e.target.value) cmd('formatBlock', e.target.value); e.target.value = ''; } }, [['', 'Style'], ['h1', 'Title'], ['h2', 'Heading'], ['h3', 'Subheading'], ['p', 'Normal']].map(([v, l]) => h('option', { value: v }, l))),
        h('label', { title: 'Text color', style: { display: 'flex', alignItems: 'center' } }, h('input', { type: 'color', value: '#b00020', oninput: (e) => cmd('foreColor', e.target.value) })),
        h('label', { title: 'Highlight', style: { display: 'flex', alignItems: 'center' } }, h('input', { type: 'color', value: '#ffe066', oninput: (e) => cmd('hiliteColor', e.target.value) })),
        B('≡', 'justifyLeft', 'Align left'), B('☰', 'justifyCenter', 'Center'), B('•', 'insertUnorderedList', 'Bulleted list (Ctrl+Shift+L)'), B('1.', 'insertOrderedList', 'Numbered list'), B('⎚', 'removeFormat', 'Clear formatting'), B('↶', 'undo', 'Undo (Ctrl+Z)'), B('↷', 'redo', 'Redo'), status);
      const options = () => { const o = []; if (dm) { o.push(['session', '📣 Session notes (shared)']); for (const e of Object.values(TT.state.entities)) if (e.kind === 'pc') o.push([e.id, '📝 ' + e.name]); } else { if (me) o.push([me.id, '📝 My notes']); o.push(['session', '📣 Session notes (from DM)']); } return o; };
      const fill = () => mount(sel, options().map(([v, l]) => h('option', { value: v, selected: v === target }, l)));
      const current = () => (target === 'session' ? TT.state.sessionNotes : (TT.ent(target) || {}).notes) || '';
      const readOnly = () => !dm && target === 'session';
      function load() { fill(); const ro = readOnly(); ed.classList.toggle('hidden', ro); view.classList.toggle('hidden', !ro); bar.querySelectorAll('button,select:not(:first-child),input').forEach((x) => { if (x !== sel) x.disabled = ro; });
        if (ro) view.innerHTML = TT.sanitize(current()) || '<p style="color:#777">The DM has not shared any session notes yet.</p>'; else { ed.innerHTML = TT.sanitize(current()); } status.textContent = ''; dirty = false; }
      function flush() { if (!dirty || readOnly() || !target) return; clearTimeout(saveTimer); dirty = false; const html = TT.sanitize(ed.innerHTML); status.textContent = 'Saving…'; TT.do({ t: 'notes', eid: target, html }, true).then((r) => { status.textContent = r ? 'Saved ✓' : 'Could not save'; });
        if (target === 'session') TT.state.sessionNotes = html; else if (TT.ent(target)) TT.ent(target).notes = html; }
      function queue() { dirty = true; status.textContent = 'Editing…'; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 800); }
      ed.addEventListener('input', queue);
      ed.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); flush(); } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'l') { e.preventDefault(); cmd('insertUnorderedList'); }
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'h') { e.preventDefault(); cmd('hiliteColor', '#ffe066'); } else if ((e.ctrlKey || e.metaKey) && e.altKey && ['1', '2', '3'].includes(k)) { e.preventDefault(); cmd('formatBlock', 'h' + k); }
      });
      ed.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
      const onState = () => { if (readOnly()) view.innerHTML = TT.sanitize(current()) || view.innerHTML; };
      const onNotes = (m) => { if (m.eid === target && !dirty && document.activeElement !== ed) { ed.innerHTML = TT.sanitize(m.html); } };
      TT.on('state', onState); TT.on('notesChanged', onNotes);
      body.append(bar, ed, view); load();
      f.destroy = () => { flush(); TT.off('state', onState); TT.off('notesChanged', onNotes); };
      window.addEventListener('beforeunload', flush);
    } });
  };

  // ---------------------------------------------------------------- dice
  const DICE = [2, 3, 4, 6, 8, 10, 12, 20, 100];
  TT.openDice = function () {
    TT.float('dice', { title: '🎲 Dice', w: 320, h: 430, x: window.innerWidth - 360, y: 120, build(body, f) {
      const counts = {}; let mod = 0; let busy = false;
      const stage = h('div', { class: 'dice-stage' }, h('span', { class: 'muted small' }, 'Click dice to add them to the tray'));
      const btns = h('div', { class: 'dice-btns' }); const modInp = h('input', { class: 'inp num', type: 'number', value: 0, oninput: (e) => { mod = Number(e.target.value) || 0; summary(); } });
      const label = h('input', { class: 'inp', placeholder: 'What is this roll for? (optional)' }); const sum = h('div', { class: 'muted small center' });
      const dmOpt = TT.isDM() ? h('div', { class: 'row' }, h('label', { class: 'chk small' }, h('input', { type: 'checkbox', id: 'dice-pop' }), 'Show to everyone'), h('label', { class: 'chk small' }, h('input', { type: 'checkbox', id: 'dice-hid' }), 'Hide from players')) : null;
      const summary = () => { const parts = DICE.filter((s) => counts[s]).map((s) => `${counts[s]}d${s}`); sum.textContent = parts.length ? parts.join(' + ') + (mod ? (mod > 0 ? ' + ' : ' − ') + Math.abs(mod) : '') : ''; };
      const paintBtns = () => { mount(btns, DICE.map((s) => h('button', { title: `Add d${s} (right-click removes)`, onclick: () => { counts[s] = Math.min(50, (counts[s] || 0) + 1); paintBtns(); summary(); }, oncontextmenu: (e) => { e.preventDefault(); if (counts[s]) counts[s]--; paintBtns(); summary(); } }, 'd' + s, counts[s] ? h('b', null, counts[s]) : null))); };
      const roll = async () => {
        const groups = DICE.filter((s) => counts[s]).map((s) => ({ count: counts[s], sides: s }));
        if (!groups.length || busy) return !groups.length && TT.toast('Add some dice first.');
        busy = true; const pieces = groups.flatMap((g) => Array.from({ length: Math.min(g.count, 12) }, () => g.sides));
        mount(stage, pieces.map((s) => h('div', { class: 'die rolling' }, '?'))); const flick = setInterval(() => TT.$$('.die.rolling', stage).forEach((d, i) => { d.textContent = 1 + Math.floor(Math.random() * pieces[i]); }), 70);
        let entry = null; const grab = (k, l) => { if (k === 'rolls' && l.kind2 === 'dice' && !entry) entry = l; }; TT.on('log', grab);
        const r = await TT.do({ t: 'dice', groups, mod, label: label.value.trim() || undefined, popup: dmOpt ? TT.$('#dice-pop').checked : false, hidden: dmOpt ? TT.$('#dice-hid').checked : false });
        await new Promise((res) => setTimeout(res, 650)); clearInterval(flick); TT.off('log', grab); busy = false;
        if (!r || !entry) return mount(stage, h('span', { class: 'muted small' }, 'Roll failed'));
        mount(stage, entry.groups.flatMap((g) => g.results.map((v) => h('div', { class: 'die' }, v))), mod ? h('div', { class: 'die', style: { background: '#444' } }, (mod > 0 ? '+' : '−') + Math.abs(mod)) : null, h('div', { style: { width: '100%', textAlign: 'center', fontFamily: 'var(--head)', fontSize: '22px' } }, '= ' + entry.total));
      };
      body.append(h('div', { class: 'dice-tray' }, stage, btns, h('div', { class: 'row' }, h('label', { class: 'lbl', style: { width: '90px' } }, 'Modifier', modInp), h('label', { class: 'lbl grow' }, 'Label', label)), sum, dmOpt,
        h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: roll }, '🎲 Roll'), h('button', { class: 'btn', onclick: () => { for (const k of Object.keys(counts)) delete counts[k]; mod = 0; modInp.value = 0; paintBtns(); summary(); mount(stage, h('span', { class: 'muted small' }, 'Tray cleared')); } }, 'Clear'))));
      body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') roll(); });
      paintBtns();
    } });
  };

  // =================================================================== tracker (turn order)
  TT.tracker = function () {
    const root = h('div', { class: 'col', style: { gap: 0, flex: 1, minHeight: 0 } }); const list = h('div', { class: 'scroll', style: { flex: 1 } }); const head = h('div', { class: 'dock-h' });
    const expanded = new Set(TT.ls.get('trk_open', []));
    const rs = () => TT.rs();
    function card(o, idx, cb) {
      const e = TT.ent(o.eid); if (!e) return null; const now = cb.active && idx === cb.turn; const mine = TT.canControl(e); const dm = TT.isDM(); const open = expanded.has(e.id) || (now && mine);
      const hpKey = rs().combat.hp; const hp = e.res[hpKey];
      const hdr = h('div', { class: 'turn-h', onclick: () => { if (expanded.has(e.id)) expanded.delete(e.id); else expanded.add(e.id); TT.ls.set('trk_open', [...expanded]); paint(); } },
        h('div', { class: 'init' }, o.total), TT.avatar(e, 34), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, e.name, now ? h('span', { class: 'pill gold', style: { marginLeft: '6px' } }, 'turn') : null), h('div', { class: 'muted tiny' }, e.kind === 'pc' ? e.classLabel : e.owner ? 'Summon of ' + ((TT.ent(e.owner) || {}).name || '?') : e.kind === 'inst' ? 'Creature' : ''),
          hp && hp.label === undefined ? h('div', { class: 'bar thin', style: { '--c': '#d64550' } }, h('i', { style: { width: (hp.max ? Math.max(0, hp.cur / hp.max * 100) : 0) + '%' } })) : hp ? h('div', { class: 'muted tiny' }, hp.label) : null),
        dm ? h('button', { class: 'btn sm ghost', title: 'Menu', onclick: (ev) => { ev.stopPropagation(); dmMenu(ev, e); } }, '⋯') : null);
      const body = h('div', { class: 'turn-b' });
      if (open) {
        body.appendChild(TT.resourceBars(e, null, (r) => !r.primary || true));
        if (e.status.length) body.appendChild(TT.statusChips(e, dm ? (k) => TT.do({ t: 'status', eid: e.id, key: k, op: 'remove', hidden: TT.ls.get('dmHidden', false) }) : null));
        if (e.defense != null && e.defense !== undefined && rs().combat.defense) body.appendChild(h('div', { class: 'muted small' }, 'Defense ' + e.defense));
        if (mine && e.mode === 'full') {
          const eco = rs().combat.turn || []; if (eco.length) body.appendChild(h('div', { class: 'eco' }, eco.map((t) => { const allowed = e.allowed[t.key] ?? t.count; const used = e.used[t.key] || 0; return h('span', { class: used >= allowed ? 'used' : '', title: t.name }, t.name + (allowed > 1 && allowed < 50 ? ` ${Math.max(0, allowed - used)}/${allowed}` : '')); })));
          const acts = e.actions; if (acts.length) { body.appendChild(h('div', { class: 'lbl', style: { margin: '6px 0 3px' } }, 'Actions')); body.appendChild(h('div', { class: 'chips' }, acts.map((a) => h('button', { class: 'btn sm', title: a.desc || '', onclick: () => TT.actionDialog(e, a) }, a.name)))); }
          const items = e.inventory.filter((i) => i.use); if (items.length) { body.appendChild(h('div', { class: 'lbl', style: { margin: '6px 0 3px' } }, 'Items')); body.appendChild(h('div', { class: 'chips' }, items.map((i) => h('button', { class: 'btn sm', onclick: () => TT.itemDialog(e, i) }, `${i.name || i.ref}${i.qty > 1 ? ' ×' + i.qty : ''}`)))); }
          const rolls = h('select', { class: 'inp sm', style: { marginTop: '6px' }, onchange: (ev) => { const [kind, key] = ev.target.value.split(':'); ev.target.value = ''; if (kind) TT.roll(e, kind, key); } },
            [h('option', { value: '' }, 'Roll a check…'), h('optgroup', { label: 'Skills' }, rs().skills.map((s) => h('option', { value: 'skill:' + s.key }, `${s.name} (${rs().rollSystem === 'd100' ? e.comp.skills[s.key] + '%' : TT.mod(e.comp.skills[s.key])})`))),
              rs().saves.length ? h('optgroup', { label: 'Saves' }, rs().saves.map((s) => h('option', { value: 'save:' + s.key }, `${s.name} (${TT.mod(e.comp.saves[s.key])})`))) : null,
              h('optgroup', { label: 'Attributes' }, rs().abilities.map((a) => h('option', { value: 'ability:' + a.key }, a.name))), (rs().rolls || []).length ? h('optgroup', { label: 'Other' }, rs().rolls.map((r) => h('option', { value: 'roll:' + r.key }, r.name))) : null]);
          body.appendChild(rolls);
        }
        const summons = Object.values(TT.state.entities).filter((x) => x.owner === e.id && x.id !== e.id);
        if (summons.length) { body.appendChild(h('div', { class: 'lbl', style: { margin: '8px 0 3px' } }, 'Minions & summons')); summons.forEach((s) => body.appendChild(h('div', { class: 'itemrow' }, TT.avatar(s, 22), h('span', { class: 'grow' }, s.name), s.res[hpKey] && s.res[hpKey].label === undefined ? h('span', { class: 'small' }, `${s.res[hpKey].cur}/${s.res[hpKey].max}`) : null, s.status.length ? h('span', { class: 'pill red' }, s.status.length + ' fx') : null))); }
      }
      return h('div', { class: 'turn' + (now ? ' now' : '') + (mine ? ' mine' : '') + (e.down ? ' down' : '') }, hdr, open ? body : null);
    }
    function dmMenu(ev, e) {
      const cb = TT.state.combat; const hid = () => TT.ls.get('dmHidden', false);
      const items = [['▶ Set as current turn', () => TT.do({ t: 'combat', op: 'setTurn', eid: e.id })], ['↻ Refresh actions this turn', () => TT.do({ t: 'combat', op: 'refresh', eid: e.id })],
        ['🎯 Set initiative…', async () => { const v = await TT.prompt('Initiative', 'New initiative value', (cb.order.find((o) => o.eid === e.id) || {}).total); if (v != null) TT.do({ t: 'combat', op: 'setInit', eid: e.id, total: Number(v) }); }],
        ['❤️ Damage / heal…', async () => { const v = await TT.prompt('Adjust ' + (rs().resources.find((r) => r.primary) || rs().resources[0]).name, 'Negative = damage, positive = healing', '-1'); if (v != null && !isNaN(Number(v))) TT.do({ t: 'adjust', eid: e.id, res: rs().combat.hp, delta: Number(v), hidden: hid() }); }],
        ['✨ Add status effect…', () => statusDialog(e)], ['⏱ Set action budget…', () => budgetDialog(e)], ['✕ Remove from combat', () => TT.do({ t: 'combat', op: 'remove', eid: e.id })]];
      TT.menuAt(ev.clientX, ev.clientY, items);
    }
    function paint() {
      const cb = TT.state.combat; const dm = TT.isDM();
      const myTurn = cb.active && cb.order[cb.turn] && TT.canControl(TT.ent(cb.order[cb.turn].eid));
      mount(head, h('div', { class: 'row between' }, h('h3', { style: { fontSize: '16px' } }, cb.active ? `Round ${cb.round}` : 'Turn order'), h('span', { class: 'row' },
        dm && !cb.active ? h('button', { class: 'btn sm primary', onclick: () => TT.do({ t: 'combat', op: 'start', hidden: TT.ls.get('dmHidden', false) }) }, '⚔ Roll initiative') : null,
        dm && cb.active ? [h('button', { class: 'btn sm', title: 'Previous turn', onclick: () => TT.do({ t: 'combat', op: 'prev' }) }, '◀'), h('button', { class: 'btn sm primary', onclick: () => TT.do({ t: 'combat', op: 'next' }) }, 'Next ▶'), h('button', { class: 'btn sm danger', onclick: async () => { if (await TT.confirm('End combat', 'End the encounter and clear the turn order?', 'End combat')) TT.do({ t: 'combat', op: 'end' }); } }, 'End')] : null,
        !dm && myTurn ? h('button', { class: 'btn sm primary', onclick: () => TT.do({ t: 'combat', op: 'next' }) }, 'End my turn') : null)),
        dm ? h('label', { class: 'chk tiny muted' }, h('input', { type: 'checkbox', checked: TT.ls.get('dmHidden', false), onchange: (e) => TT.ls.set('dmHidden', e.target.checked) }), 'Hide my actions from players') : null);
      mount(list, cb.active ? cb.order.map((o, i) => card(o, i, cb)) : h('p', { class: 'muted', style: { padding: '14px' } }, dm ? 'Place characters and creatures on the map, then roll initiative to begin combat.' : 'Waiting for the DM to start combat.'));
    }
    TT.mount(root, head, list); const on = () => paint(); TT.on('state', on); paint(); root.destroy = () => TT.off('state', on); return root;
  };

  function statusDialog(e) {
    const sel = h('select', { class: 'inp' }, (TT.rs().statuses || []).map((s) => h('option', { value: s.key }, s.name))); const turns = h('input', { class: 'inp', type: 'number', min: 1, placeholder: 'Default / until removed' });
    const desc = h('div', { class: 'muted small' }); const upd = () => { desc.textContent = (TT.statusDef(sel.value) || {}).desc || ''; }; sel.addEventListener('change', upd); upd();
    TT.modal({ title: 'Add effect to ' + e.name, body: h('div', { class: 'col' }, h('label', { class: 'lbl' }, 'Effect', sel), desc, h('label', { class: 'lbl' }, 'Duration (turns)', turns)), actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: async () => { const r = await TT.do({ t: 'status', eid: e.id, key: sel.value, turns: turns.value ? Number(turns.value) : undefined, hidden: TT.ls.get('dmHidden', false) }); return !!r; } }] });
  }
  function budgetDialog(e) {
    const eco = TT.rs().combat.turn || []; const cur = (e.allowed || {}); const inputs = eco.map((t) => h('input', { class: 'inp num', type: 'number', min: 0, max: 99, value: cur[t.key] ?? t.count }));
    TT.modal({ title: 'Actions per turn — ' + e.name, body: h('div', { class: 'col' }, h('p', { class: 'muted small' }, 'Normally set automatically by the ruleset and status effects. Override here for special creatures (extra attacks, legendary actions…).'), eco.map((t, i) => h('label', { class: 'row between' }, t.name, inputs[i]))),
      actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => { const budget = {}; eco.forEach((t, i) => { budget[t.key] = Number(inputs[i].value); }); const r = await TT.do({ t: 'combat', op: 'budget', eid: e.id, budget }); return !!r; } }] });
  }
  TT.statusDialog = statusDialog; TT.budgetDialog = budgetDialog;

  // simple context menu
  TT.menuAt = function (x, y, items) {
    TT.$$('.token-menu').forEach((m) => m.remove());
    const m = h('div', { class: 'token-menu', style: { position: 'fixed', left: Math.min(x, window.innerWidth - 220) + 'px', top: Math.min(y, window.innerHeight - items.length * 34 - 20) + 'px', zIndex: 2500 } }, items.map(([l, fn]) => h('button', { onclick: () => { m.remove(); fn(); } }, l)));
    document.body.appendChild(m); const off = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }; setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  };
})();
