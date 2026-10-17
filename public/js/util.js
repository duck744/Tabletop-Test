/* Shared helpers: DOM builder, networking, toasts, modals, avatars, rich-text sanitizer. */
(function () {
  'use strict';
  const TT = (window.TT = { state: null, logs: { rolls: [], actions: [], custom: [] }, session: null, ui: {}, E: window.Engine });
  const bus = {};
  TT.on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); return fn; };
  TT.off = (ev, fn) => { bus[ev] = (bus[ev] || []).filter((f) => f !== fn); };
  TT.emit = (ev, ...a) => (bus[ev] || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } });

  const h = (TT.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'open') { if (v) el[k] = true; }
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c.nodeType ? c : document.createTextNode(String(c))); };
    kids.forEach(add);
    return el;
  });
  TT.$ = (s, r) => (r || document).querySelector(s);
  TT.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  TT.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  TT.mount = (el, ...kids) => { TT.clear(el); kids.flat(Infinity).forEach((k) => k && el.appendChild(k.nodeType ? k : document.createTextNode(String(k)))); return el; };
  TT.mod = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
  TT.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TT.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  TT.clone = (o) => JSON.parse(JSON.stringify(o));
  TT.ls = {
    get(k, d) { try { const v = localStorage.getItem('tt_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tt_' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem('tt_' + k); } catch (e) { /* ignore */ } },
  };

  // ---- toasts & modals
  TT.toast = (msg, kind) => {
    const t = h('div', { class: 'toast ' + (kind || '') }, msg); TT.$('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), kind === 'error' ? 5200 : 2600); setTimeout(() => t.remove(), kind === 'error' ? 5600 : 3000);
  };
  TT.modal = ({ title, body, actions, wide, onClose }) => {
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } },
      h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title || '' },
        title ? h('div', { class: 'modal-h' }, h('h3', null, title), h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×')) : null,
        h('div', { class: 'modal-b' }, body),
        actions ? h('div', { class: 'modal-f' }, actions.map((a) => h('button', { class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''), onclick: async () => { if (a.onClick) { const r = await a.onClick(close); if (r === false) return; } if (a.close !== false) close(); } }, a.label))) : null));
    TT.$('#overlay').appendChild(back); document.addEventListener('keydown', esc);
    const first = back.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 30);
    return close;
  };
  TT.prompt = (title, label, def, opts = {}) => new Promise((res) => {
    const inp = h(opts.multiline ? 'textarea' : 'input', { class: 'inp', value: def || '', type: opts.type || 'text', placeholder: opts.placeholder || '', rows: 4 });
    let answered = false; const fin = (v) => { if (!answered) { answered = true; res(v); } };
    const close = TT.modal({ title, body: h('label', { class: 'lbl' }, label, inp), onClose: () => fin(null), actions: [{ label: 'Cancel', onClick: () => fin(null) }, { label: opts.ok || 'OK', primary: true, onClick: () => fin(inp.value) }] });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !opts.multiline) { fin(inp.value); close(); } });
  });
  TT.confirm = (title, text, ok = 'Yes') => new Promise((res) => { let done = false; const fin = (v) => { if (!done) { done = true; res(v); } }; TT.modal({ title, body: h('p', null, text), onClose: () => fin(false), actions: [{ label: 'Cancel', onClick: () => fin(false) }, { label: ok, danger: true, onClick: () => fin(true) }] }); });

  // ---- networking
  const net = (TT.net = { ws: null, open: false, rid: 0, pending: new Map(), retry: 0 });
  net.connect = () => {
    const ws = (net.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host));
    ws.onopen = async () => {
      net.open = true; net.retry = 0; TT.$('#conn').classList.add('hidden'); TT.emit('open');
      if (TT.session && TT.session.token) {
        try { const r = await net.req({ t: 'resume', token: TT.session.token }); TT.session = { ...TT.session, ...r }; TT.emit('resumed', r); }
        catch (e) { TT.session = null; TT.ls.del('session'); TT.emit('sessionLost', e.message); }
      }
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'reply') { const p = net.pending.get(m.rid); if (p) { net.pending.delete(m.rid); m.ok ? p.res(m.data) : p.rej(new Error(m.error)); } return; }
      if (m.t === 'state') { TT.state = m.s; if (m.full && m.s.logs) TT.logs = { rolls: m.s.logs.rolls.slice(), actions: m.s.logs.actions.slice(), custom: m.s.logs.custom.slice() }; TT.emit('state', m.s, !!m.full); return; }
      if (m.t === 'log') { const arr = TT.logs[m.kind]; arr.push(m.entry); if (arr.length > 400) arr.shift(); TT.emit('log', m.kind, m.entry); return; }
      if (m.t === 'kicked') { TT.session = null; TT.ls.del('session'); TT.emit('sessionLost', 'You were removed from the campaign.'); return; }
      TT.emit(m.t, m);
    };
    ws.onclose = () => {
      net.open = false; for (const p of net.pending.values()) p.rej(new Error('Connection lost.')); net.pending.clear();
      TT.$('#conn').classList.remove('hidden'); setTimeout(net.connect, Math.min(5000, 800 + 600 * net.retry++));
    };
  };
  net.req = (msg) => new Promise((res, rej) => {
    if (!net.open) return rej(new Error('Not connected to the server yet.'));
    const rid = ++net.rid; net.pending.set(rid, { res, rej }); net.ws.send(JSON.stringify({ ...msg, rid }));
    setTimeout(() => { if (net.pending.has(rid)) { net.pending.delete(rid); rej(new Error('The server took too long to respond.')); } }, 15000);
  });
  // Send a command; errors become toasts and resolve to null.
  TT.do = async (msg, quiet) => { try { return await net.req(msg); } catch (e) { if (!quiet) TT.toast(e.message, 'error'); return null; } };
  TT.upload = async (file, kind) => {
    const tok = TT.session && TT.session.token ? TT.session.token : '';
    const r = await fetch(`/upload?kind=${kind || 'icon'}&token=${tok}`, { method: 'POST', body: file });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Upload failed.'); return j.url;
  };

  // ---- game helpers
  TT.rs = () => (TT.state && TT.state.ruleset) || TT.previewRs || null;
  TT.me = () => (TT.state ? TT.state.me : null);
  TT.isDM = () => !!(TT.state && TT.state.me.role === 'dm');
  TT.myEntity = () => (TT.state && TT.state.me.charId ? TT.state.entities[TT.state.me.charId] : null);
  TT.ent = (id) => (TT.state ? TT.state.entities[id] : null);
  TT.canControl = (e) => { const me = TT.me(); return !!e && !!me && (me.role === 'dm' || e.id === me.charId || (e.owner && e.owner === me.charId)); };
  TT.ctrlList = () => Object.values(TT.state.entities).filter((e) => e.kind !== 'npc' && TT.canControl(e));
  TT.itemDef = (key) => (TT.rs().items || []).find((i) => i.key === key);
  TT.actDef = (key) => (TT.rs().actions || []).find((a) => a.key === key);
  TT.statusDef = (key) => (TT.rs().statuses || []).find((s) => s.key === key) || { key, name: key, desc: '' };
  TT.curName = (k) => { const c = (TT.rs().currency || []).find((x) => x.key === k); return c ? c.name : k.toUpperCase(); };
  TT.priceText = (p) => Object.entries(p || {}).map(([k, v]) => v + ' ' + TT.curName(k)).join(', ') || 'Free';
  TT.moneyText = (cur) => (TT.rs().currency || []).map((c) => (cur && cur[c.key] ? Math.round(cur[c.key] * 100) / 100 + ' ' + c.name : null)).filter(Boolean).join(' · ') || '—';
  TT.avatar = (e, size = 36) => {
    const icon = (e && e.icon) || ''; const color = (e && e.color) || '#c53131';
    const st = { width: size + 'px', height: size + 'px', borderColor: color, fontSize: Math.round(size * 0.55) + 'px' };
    if (icon.startsWith('/assets/')) return h('span', { class: 'avatar', style: { ...st, backgroundImage: `url(${icon})` } });
    return h('span', { class: 'avatar', style: { ...st, background: color + '33' } }, icon || ((e && e.name) || '?').charAt(0).toUpperCase());
  };

  // ---- rich text sanitizer (notes are rendered into other people's browsers)
  const TAGS = new Set(['B', 'I', 'U', 'S', 'STRONG', 'EM', 'SPAN', 'DIV', 'P', 'BR', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'HR', 'SUB', 'SUP', 'STRIKE', 'FONT']);
  const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i;
  const STYLE_OK = { color: COLOR, 'background-color': COLOR, 'font-family': /^[\w\s,'"-]+$/, 'font-size': /^[\d.]+(px|pt|em|rem|%)$/, 'font-weight': /^(bold|normal|[1-9]00)$/, 'font-style': /^(italic|normal)$/, 'text-decoration': /^[a-z\s-]+$/, 'text-decoration-line': /^[a-z\s-]+$/, 'text-align': /^(left|right|center|justify)$/ };
  TT.sanitize = (html) => {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    const walk = (node) => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 3) continue;
        if (ch.nodeType !== 1 || !TAGS.has(ch.tagName)) { if (ch.nodeType === 1 && ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(ch.tagName)) ch.remove(); else { walk(ch); while (ch.firstChild) node.insertBefore(ch.firstChild, ch); ch.remove(); } continue; }
        for (const a of Array.from(ch.attributes)) if (a.name !== 'style' && !(ch.tagName === 'FONT' && (a.name === 'color' || a.name === 'face' || a.name === 'size'))) ch.removeAttribute(a.name);
        if (ch.hasAttribute('color') && !COLOR.test(ch.getAttribute('color'))) ch.removeAttribute('color');
        if (ch.hasAttribute('face') && !/^[\w\s,'-]+$/.test(ch.getAttribute('face'))) ch.removeAttribute('face');
        if (ch.hasAttribute('style')) {
          const keep = []; for (const part of ch.getAttribute('style').split(';')) { const i = part.indexOf(':'); if (i < 0) continue; const k = part.slice(0, i).trim().toLowerCase(), v = part.slice(i + 1).trim(); if (STYLE_OK[k] && STYLE_OK[k].test(v) && !/url\(|expression|javascript/i.test(v)) keep.push(k + ':' + v); }
          if (keep.length) ch.setAttribute('style', keep.join(';')); else ch.removeAttribute('style');
        }
        walk(ch);
      }
    };
    walk(doc.body); return doc.body.innerHTML;
  };

  // distance in ruleset units between two map points (pixels)
  TT.distance = (dxPx, dyPx) => {
    const rs = TT.rs(); const g = rs.grid || { cell: 5, distance: 'chebyshev' }; const cell = TT.state.scene.cell;
    const cx = Math.abs(dxPx) / cell, cy = Math.abs(dyPx) / cell;
    const cells = g.distance === 'euclid' ? Math.hypot(cx, cy) : Math.max(cx, cy);
    return Math.round(cells * g.cell * 10) / 10;
  };
  TT.EMOJI = ['⚔️', '🛡️', '🏹', '🗡️', '🪄', '🔮', '📖', '🧙', '🧝', '🧛', '🧟', '🧚', '🐉', '🐺', '🦅', '🐻', '🦊', '🐱', '💀', '👑', '🔥', '❄️', '⚡', '🌿', '🌙', '☀️', '🕯️', '🗝️', '🎭', '🎲', '🧪', '🪓', '🔨', '🕷️', '🐍', '🦉', '👹', '👺', '🤖', '🕵️'];
})();
