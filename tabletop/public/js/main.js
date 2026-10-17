// Router, game shell and boot.
(function () {
  'use strict';
  const { h, mount } = TT;
  const app = () => TT.$('#app');
  TT.screens = TT.screens || {};
  const ui = (TT.ui = { targets: [], view: null, go: null, openSheet: null });
  let gameCleanup = null; let stateWait = null;

  function cleanup() {
    if (gameCleanup) { try { gameCleanup(); } catch (e) { console.error(e); } gameCleanup = null; }
    if (stateWait) { TT.off('state', stateWait); stateWait = null; }
  }

  ui.go = function (view, arg) {
    cleanup(); ui.view = view; ui.targets = []; if (view !== 'creator') TT.previewRs = null;
    const root = app(); root.innerHTML = '';
    if (view !== 'game') { TT.destroyFloats(); }
    if (view === 'lobby') { TT.session = null; TT.ls.del('session'); TT.do({ t: 'leave' }, true); TT.state = null; return TT.screens.lobby(root); }
    if (view === 'gate') return TT.screens.gate(root, arg);
    if (view === 'creator') return TT.screens.creator(root, arg);
    if (view === 'game') return gameScreen(root);
  };

  // ------------------------------------------------------------------ the game shell
  function tabsFor() {
    const rs = TT.rs(); const dm = TT.isDM(); const out = [];
    if (dm) out.push({ id: 'characters', name: 'Characters', icon: '🧙' }); else out.push({ id: 'sheet', name: 'Character', icon: '📄' });
    out.push({ id: 'combat', name: 'Combat', icon: '⚔️' });
    if (dm) out.push({ id: 'library', name: 'Creatures', icon: '👹' });
    for (const t of rs.tabs || []) out.push({ id: 'x:' + t.id, name: t.name, icon: t.icon, custom: t });
    if (dm) out.push({ id: 'catalog', name: 'Catalog', icon: '📚' }, { id: 'settings', name: 'Settings', icon: '⚙️' });
    return out;
  }

  function gameScreen(root) {
    if (!TT.session || !TT.session.token) return ui.go('lobby');
    const begin = () => buildGame(root);
    if (TT.state && TT.state.campaign && TT.state.campaign.id === TT.session.cid) return begin();
    mount(root, h('div', { class: 'lobby' }, h('div', { class: 'lobby-inner center' }, h('p', { class: 'muted' }, 'Joining the table…'))));
    stateWait = (s) => { TT.off('state', stateWait); stateWait = null; if (ui.view === 'game') begin(); };
    TT.on('state', stateWait);
  }

  function buildGame(root) {
    const subs = []; const sub = (ev, fn) => { TT.on(ev, fn); subs.push([ev, fn]); };
    let tabs = tabsFor(); let cur = TT.ls.get('tab_' + TT.state.me.role, null);
    const valid = () => tabs.some((t) => t.id === cur);
    if (!valid()) cur = tabs[0].id;
    const tabBar = h('div', { class: 'tabs' });
    const page = h('div', { class: 'page' });
    const who = h('div', { class: 'who' });
    const shell = h('div', { class: 'shell' },
      h('div', { class: 'topbar' }, h('div', { class: 'brand' }, '🎲 ', h('span', { id: 'campname' }, TT.state.campaign.name)), tabBar, who), page);
    mount(root, shell);
    let pageCleanup = null; let sig = '';

    const paintTabs = () => {
      mount(tabBar, tabs.map((t) => h('button', { class: 'tab' + (cur === t.id ? ' on' : ''), onclick: () => setTab(t.id) }, (t.icon ? t.icon + ' ' : '') + t.name)));
    };
    const paintWho = () => {
      const me = TT.myEntity(); const dm = TT.isDM();
      mount(who, [
        h('button', { class: 'btn sm', title: 'Notes', onclick: () => TT.openNotes() }, '📝 Notes'),
        h('button', { class: 'btn sm', title: 'Dice roller', onclick: () => TT.openDice() }, '🎲 Dice'),
        dm ? h('span', { class: 'pill gold', style: { whiteSpace: 'nowrap' } }, 'DM') : me ? h('span', { class: 'row gap4' }, TT.avatar(me, 28), h('span', null, me.name)) : null,
        h('button', { class: 'btn sm ghost', title: 'Leave this campaign', onclick: () => ui.go('lobby') }, 'Leave'),
      ]);
    };

    // ---- pages
    const scroller = (el) => h('div', { class: 'scroll', style: { height: '100%' } }, el);
    function buildCombat() {
      const dock = (side, key, title, el, width) => {
        const collapsed = TT.ls.get('dock_' + key, false); const w = TT.ls.get('dockw_' + key, width);
        const d = h('div', { class: 'dock' + (side === 'right' ? ' right' : '') + (collapsed ? ' collapsed' : ''), style: { width: collapsed ? '' : w + 'px' } });
        const tog = h('button', { class: 'dock-toggle', title: 'Collapse / expand ' + title, 'aria-label': 'Toggle ' + title, onclick: () => {
          const c = d.classList.toggle('collapsed'); TT.ls.set('dock_' + key, c); d.style.width = c ? '' : TT.ls.get('dockw_' + key, width) + 'px'; setTimeout(() => window.dispatchEvent(new Event('resize')), 230); } }, side === 'right' ? '⇆' : '⇆');
        const rz = h('div', { class: 'dock-resize', onpointerdown: (e) => {
          if (d.classList.contains('collapsed')) return; e.preventDefault(); rz.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = d.offsetWidth;
          const mv = (ev) => { const nw = Math.max(220, Math.min(640, w0 + (side === 'right' ? x0 - ev.clientX : ev.clientX - x0))); d.style.width = nw + 'px'; };
          const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); TT.ls.set('dockw_' + key, d.offsetWidth); window.dispatchEvent(new Event('resize')); };
          rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); } });
        d.append(tog, rz); if (side === 'left') d.append(h('div', { class: 'dock-h' }, h('h3', null, title))); d.append(el); return d;
      };
      const log = TT.logPanel(); const trk = TT.tracker(); const map = TT.createMap();
      const mapWrap = map;
      const wrap = h('div', { class: 'combat' }, dock('left', 'log', 'Logs', log, 320), mapWrap, dock('right', 'trk', 'Turn order', trk, 330));
      const anim = (m) => runInitAnim(mapWrap, m.rolls);
      TT.on('initAnim', anim);
      wrap.destroy = () => { TT.off('initAnim', anim); for (const x of [log, trk, map]) if (x.destroy) x.destroy(); };
      return wrap;
    }

    function buildPage(id) {
      const dm = TT.isDM();
      if (id === 'sheet') {
        const box = h('div'); const paint = () => { const me = TT.myEntity(); const top = page.scrollTop; mount(box, me ? TT.renderSheet(me, {}) : h('p', { class: 'muted', style: { padding: '30px' } }, 'Your character could not be found.')); page.scrollTop = top; };
        paint(); const f = () => { if (cur === 'sheet') paint(); }; TT.on('state', f); box.destroy = () => TT.off('state', f); return box;
      }
      if (id === 'combat') return buildCombat();
      if (id === 'characters' && TT.dmCharacters) return TT.dmCharacters();
      if (id === 'library' && TT.dmLibrary) return TT.dmLibrary();
      if (id === 'catalog' && TT.dmCatalog) return TT.dmCatalog();
      if (id === 'settings' && TT.dmSettings) return TT.dmSettings();
      if (id.startsWith('x:') && TT.customTab) return TT.customTab(id.slice(2));
      return h('p', { class: 'muted', style: { padding: '30px' } }, 'Nothing here.');
    }

    function setTab(id) {
      if (pageCleanup) { try { pageCleanup(); } catch (e) { console.error(e); } pageCleanup = null; }
      cur = id; TT.ls.set('tab_' + TT.state.me.role, id); paintTabs();
      let el; try { el = buildPage(id); } catch (e) { console.error(e); el = h('pre', { style: { padding: '20px', color: '#ff8d8d' } }, 'This tab failed to load:\n' + e.message); }
      page.innerHTML = ''; page.style.overflow = id === 'combat' ? 'hidden' : 'auto'; page.append(el); pageCleanup = el.destroy || null;
    }
    ui.setTab = setTab;
    ui.openSheet = (eid) => {
      if (TT.isDM()) { TT.ls.set('dmSel', eid); if (cur === 'characters') { setTab('characters'); } else setTab('characters'); return; }
      const e = TT.ent(eid); if (!e) return;
      if (e.mode !== 'full') return TT.toast(e.name + (e.classLabel ? ' — ' + e.classLabel : '') + (e.status.length ? ' · ' + e.status.map((s) => TT.statusDef(s.key).name).join(', ') : ''));
      TT.float('sheet_' + eid, { title: e.name, w: 900, h: 600, build(body, f) { const paint = () => { const en = TT.ent(eid); if (en && en.mode === 'full') mount(body, TT.renderSheet(en, { fullHeight: true })); }; paint(); TT.on('state', paint); f.destroy = () => TT.off('state', paint); } });
    };

    // ---- reactions
    sub('state', () => {
      const s = TT.state; if (!s) return; $('#campname', s.campaign.name);
      const nt = tabsFor(); const ns = nt.map((t) => t.id).join('|') + '|' + (s.ruleset.tabs || []).map((t) => t.name + t.icon).join('|');
      if (ns !== sig) { sig = ns; tabs = nt; if (!valid()) { setTab(tabs[0].id); } else paintTabs(); }
      paintWho();
    });
    sub('sessionLost', (msg) => { TT.toast(msg || 'Your session ended.', 'error'); ui.go('lobby'); });
    sub('resumed', () => { /* server pushes a fresh full state */ });
    const $ = (sel, txt) => { const el = TT.$(sel); if (el && el.textContent !== txt) el.textContent = txt; };

    sig = tabs.map((t) => t.id).join('|') + '|' + (TT.rs().tabs || []).map((t) => t.name + t.icon).join('|');
    paintWho(); setTab(cur);
    // restore floating windows from last time
    setTimeout(() => { if (TT.ls.get('open_notes', false)) TT.openNotes(); if (TT.ls.get('open_dice', false)) TT.openDice(); }, 50);

    gameCleanup = () => { for (const [e, f] of subs) TT.off(e, f); if (pageCleanup) pageCleanup(); pageCleanup = null; TT.destroyFloats(); ui.setTab = null; };
  }

  // ------------------------------------------------------------------ initiative animation
  function runInitAnim(host, rolls) {
    const old = host.querySelector('.init-anim'); if (old) old.remove();
    const rs = TT.rs(); const d100 = rs.rollSystem === 'd100'; const faces = d100 ? 100 : 20;
    const cells = (rolls || []).map((r) => {
      const e = TT.ent(r.eid); const dieEl = h('div', { class: 'd20' }, '?');
      return { r, dieEl, el: h('div', { class: 'who' }, TT.avatar(e || { name: '?' }, 48), h('div', { class: 'small' }, e ? e.name : '???'), dieEl, h('div', { class: 'tot muted' }, '')) };
    });
    const ov = h('div', { class: 'init-anim', onclick: () => ov.remove() }, h('h2', null, 'Roll for initiative!'), h('div', { class: 'grid' }, cells.map((c) => c.el)), h('div', { class: 'muted small' }, 'Click to dismiss'));
    host.append(ov);
    const tick = setInterval(() => { for (const c of cells) if (!c.done) c.dieEl.textContent = 1 + Math.floor(Math.random() * faces); }, 70);
    cells.forEach((c, i) => setTimeout(() => {
      c.done = true; const r = c.r; const first = Array.isArray(r.rolls) ? r.rolls[0] : r.rolls; c.dieEl.textContent = first != null ? first : r.total; c.dieEl.style.animation = 'none';
      const t = c.el.querySelector('.tot'); t.textContent = 'Initiative ' + r.total; t.classList.remove('muted');
    }, 900 + i * 220));
    const end = 900 + cells.length * 220 + 2600;
    setTimeout(() => { clearInterval(tick); if (ov.isConnected) ov.remove(); }, end);
    ov.addEventListener('remove', () => clearInterval(tick));
  }

  // ------------------------------------------------------------------ boot
  document.addEventListener('DOMContentLoaded', () => {
    TT.session = TT.ls.get('session', null);
    let started = false;
    const start = () => { if (started) return; started = true; if (TT.session && TT.session.token && TT.session.cid) { ui.go('game'); } else ui.go('lobby'); };
    TT.on('open', () => { if (!TT.session || !TT.session.token) start(); });
    TT.on('resumed', () => start());
    TT.on('sessionLost', (msg) => { if (!started) { started = true; ui.go('lobby'); } if (msg) TT.toast(msg, 'error'); });
    TT.net.connect();
  });
})();
