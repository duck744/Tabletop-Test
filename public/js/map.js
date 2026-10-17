/* Shared battle map: canvas renderer, pan/zoom, grid, tokens, drawing tools, distance measuring and live sync. */
(function () {
  'use strict';
  const { h, mount } = TT;
  const TOOLS = [['select', '✋', 'Select / move (drag tokens, pan the map)'], ['pen', '✏️', 'Freehand draw'], ['measure', '📏', 'Measure distance (private, not saved)'], ['line', '╱', 'Line'], ['circle', '⭕', 'Circle (drag out the radius)'], ['cone', '◺', 'Cone'], ['rect', '▭', 'Rectangle'], ['text', '🔤', 'Text label'], ['pin', '📍', 'Pin / marker'], ['erase', '⌫', 'Erase your drawings']];
  const imgCache = new Map();

  TT.createMap = function () {
    const wrap = h('div', { class: 'mapwrap' }); const cv = h('canvas'); wrap.appendChild(cv); const g = cv.getContext('2d');
    const view = { s: 1, x: 0, y: 0 }; let W = 0, H = 0, dpr = 1, dirty = true, fitted = false, destroyed = false;
    let tool = 'select', color = TT.ls.get('drawColor', '#ffd23f'), width = TT.ls.get('drawWidth', 4);
    const pointers = new Map(); let drag = null, temp = null, pinch = null, hover = null; const pings = []; let spaceDown = false;
    const st = () => TT.state; const scene = () => st().scene;
    const need = () => { dirty = true; };
    const img = (url) => { let i = imgCache.get(url); if (!i) { i = new Image(); i.onload = need; i.src = url; imgCache.set(url, i); } return i; };
    const w2s = (x, y) => [x * view.s + view.x, y * view.s + view.y]; const s2w = (x, y) => [(x - view.x) / view.s, (y - view.y) / view.s];
    const snapPt = (x, y) => { const sc = scene(); if (!(sc.snap && sc.grid)) return [x, y]; return [Math.round(x / sc.cell) * sc.cell, Math.round(y / sc.cell) * sc.cell]; };
    const unit = () => (TT.rs().grid || {}).unit || '';
    const dist = (dx, dy) => TT.distance(dx, dy) + ' ' + unit();
    const myColor = () => color;
    const fit = () => { const sc = scene(); if (!W) return; view.s = Math.min(W / sc.w, H / sc.h) * 0.96; view.x = (W - sc.w * view.s) / 2; view.y = (H - sc.h * view.s) / 2; fitted = true; need(); };
    const tokenList = () => Object.values(st().tokens);
    const entOf = (t) => st().entities[t.eid];
    const radius = (t) => (t.size || 1) * scene().cell / 2;
    const hitToken = (wx, wy) => { const L = tokenList(); for (let i = L.length - 1; i >= 0; i--) { const t = L[i]; if (Math.hypot(wx - t.x - radius(t), wy - t.y - radius(t)) <= radius(t)) return t; } return null; };
    const tc = (t) => [t.x + radius(t), t.y + radius(t)];

    // ------------------------------------------------------------ drawing
    function drawShape(d, ghost) {
      g.save(); g.globalAlpha = ghost ? 0.7 : 1; g.strokeStyle = d.color; g.fillStyle = d.color; g.lineWidth = (d.width || 3) / view.s * Math.max(1, view.s); g.lineWidth = d.width || 3; g.lineCap = 'round'; g.lineJoin = 'round';
      const lbl = (x, y, text) => { g.save(); g.font = `bold ${14 / view.s}px Roboto, sans-serif`; g.textAlign = 'center'; g.lineWidth = 3 / view.s; g.strokeStyle = '#000'; g.strokeText(text, x, y); g.fillStyle = '#fff'; g.fillText(text, x, y); g.restore(); };
      if (d.kind === 'pen') { g.beginPath(); (d.points || []).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
      else if (d.kind === 'line' || d.kind === 'measure') { g.setLineDash(d.kind === 'measure' ? [10, 8] : []); g.beginPath(); g.moveTo(d.x1, d.y1); g.lineTo(d.x2, d.y2); g.stroke(); g.setLineDash([]); lbl((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2 - 8 / view.s, dist(d.x2 - d.x1, d.y2 - d.y1)); g.beginPath(); g.arc(d.x1, d.y1, 5 / view.s, 0, 7); g.fill(); }
      else if (d.kind === 'circle') { const r = d.r || 0; g.globalAlpha *= 0.22; g.beginPath(); g.arc(d.x, d.y, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = ghost ? 0.7 : 1; g.stroke(); g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x + r, d.y); g.setLineDash([6, 6]); g.stroke(); g.setLineDash([]); lbl(d.x + r / 2, d.y - 8 / view.s, 'r ' + dist(r, 0)); }
      else if (d.kind === 'rect') { g.globalAlpha *= 0.2; g.fillRect(d.x, d.y, d.w, d.h); g.globalAlpha = ghost ? 0.7 : 1; g.strokeRect(d.x, d.y, d.w, d.h); lbl(d.x + d.w / 2, d.y + d.h / 2, `${dist(Math.abs(d.w), 0)} × ${dist(Math.abs(d.h), 0)}`); }
      else if (d.kind === 'cone') { const dx = d.x2 - d.x1, dy = d.y2 - d.y1, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), half = Math.atan(0.5); g.beginPath(); g.moveTo(d.x1, d.y1); g.lineTo(d.x1 + Math.cos(ang - half) * len / Math.cos(half), d.y1 + Math.sin(ang - half) * len / Math.cos(half)); g.lineTo(d.x1 + Math.cos(ang + half) * len / Math.cos(half), d.y1 + Math.sin(ang + half) * len / Math.cos(half)); g.closePath(); g.globalAlpha *= 0.25; g.fill(); g.globalAlpha = ghost ? 0.7 : 1; g.stroke(); lbl(d.x1 + dx / 2, d.y1 + dy / 2 - 8 / view.s, dist(dx, dy)); }
      else if (d.kind === 'text') { g.font = `bold ${Math.max(14, d.size || 22)}px Roboto, sans-serif`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(d.text || '', d.x, d.y); g.fillText(d.text || '', d.x, d.y); }
      else if (d.kind === 'pin') { g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText('📍', d.x, d.y); g.beginPath(); g.arc(d.x, d.y, 4, 0, 7); g.fill(); if (d.label) { g.font = 'bold 14px Roboto, sans-serif'; g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(d.label, d.x, d.y + 20); g.fillStyle = '#fff'; g.fillText(d.label, d.x, d.y + 20); } }
      g.restore();
    }
    function drawToken(t, now) {
      const e = entOf(t); if (!e) return; const r = radius(t); const dg = t.drag; const x = dg ? dg.x : t.x, y = dg ? dg.y : t.y; const cx = x + r, cy = y + r; const cb = st().combat;
      const isTurn = cb.active && cb.order[cb.turn] && cb.order[cb.turn].eid === e.id; const sel = (TT.ui.targets || []).includes(e.id);
      g.save(); if (t.hidden) g.globalAlpha = 0.45; if (e.down) g.globalAlpha *= 0.55;
      if (isTurn) { const p = (Math.sin(now / 280) + 1) / 2; g.beginPath(); g.arc(cx, cy, r + 4 + p * 4, 0, 7); g.strokeStyle = '#d9b24c'; g.lineWidth = 4; g.stroke(); }
      if (sel) { g.beginPath(); g.arc(cx, cy, r + 3, 0, 7); g.strokeStyle = '#4fa3ff'; g.lineWidth = 3; g.setLineDash([8, 5]); g.stroke(); g.setLineDash([]); }
      g.beginPath(); g.arc(cx, cy, r - 2, 0, 7); g.fillStyle = (e.color || '#c53131') + '55'; g.fill(); g.save(); g.clip();
      if ((e.icon || '').startsWith('/assets/')) { const im = img(e.icon); if (im.complete && im.naturalWidth) g.drawImage(im, cx - r, cy - r, r * 2, r * 2); }
      else { g.font = `${r * 1.2}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(e.icon || (e.name || '?').charAt(0).toUpperCase(), cx, cy + r * 0.06); }
      g.restore(); g.beginPath(); g.arc(cx, cy, r - 2, 0, 7); g.strokeStyle = e.color || '#c53131'; g.lineWidth = 4; g.stroke();
      const hp = e.res && e.res[TT.rs().combat.hp]; if (hp && hp.label === undefined && hp.max) { const bw = r * 1.6; g.fillStyle = '#000a'; g.fillRect(cx - bw / 2, cy + r + 3, bw, 6); g.fillStyle = hp.cur / hp.max > 0.5 ? '#4ba867' : hp.cur / hp.max > 0.25 ? '#d9b24c' : '#d64550'; g.fillRect(cx - bw / 2, cy + r + 3, bw * Math.max(0, hp.cur / hp.max), 6); }
      if (e.status && e.status.length) { g.font = `${Math.max(12, r * 0.45)}px sans-serif`; g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText('✦' + (e.status.length > 1 ? e.status.length : ''), cx + r, cy - r + 10); }
      g.font = `bold ${Math.max(12, 13 / view.s)}px Roboto, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineWidth = 3 / Math.max(view.s, 0.4); g.strokeStyle = '#000'; const ny = cy + r + (hp ? 22 : 16); g.strokeText(e.name, cx, ny); g.fillStyle = '#fff'; g.fillText(e.name, cx, ny);
      if (t.hidden) { g.font = '14px sans-serif'; g.fillText('🕶', cx - r, cy - r + 12); }
      g.restore();
      if (dg && dg.snapped) { g.save(); g.globalAlpha = 0.35; g.beginPath(); g.arc(dg.snapped[0] + r, dg.snapped[1] + r, r - 2, 0, 7); g.fillStyle = e.color || '#c53131'; g.fill(); g.restore(); }
    }
    function frame(now) {
      if (destroyed) return; requestAnimationFrame(frame);
      if (!st()) return; const animate = st().combat.active || pings.length || drag; if (!dirty && !animate) return; dirty = false;
      if (!fitted && W) fit();
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, W, H); const sc = scene();
      g.save(); g.translate(view.x, view.y); g.scale(view.s, view.s);
      g.fillStyle = sc.bg || '#1b1917'; g.fillRect(0, 0, sc.w, sc.h);
      if (sc.mapUrl) { const im = img(sc.mapUrl); if (im.complete && im.naturalWidth) g.drawImage(im, 0, 0, sc.w, sc.h); }
      if (sc.grid) { g.beginPath(); const x0 = Math.max(0, Math.floor(-view.x / view.s / sc.cell) * sc.cell), x1 = Math.min(sc.w, Math.ceil((W - view.x) / view.s / sc.cell) * sc.cell), y0 = Math.max(0, Math.floor(-view.y / view.s / sc.cell) * sc.cell), y1 = Math.min(sc.h, Math.ceil((H - view.y) / view.s / sc.cell) * sc.cell);
        for (let x = x0; x <= x1; x += sc.cell) { g.moveTo(x, y0); g.lineTo(x, y1); } for (let y = y0; y <= y1; y += sc.cell) { g.moveTo(x0, y); g.lineTo(x1, y); } g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1 / view.s; g.stroke(); }
      g.strokeStyle = '#555'; g.lineWidth = 2 / view.s; g.strokeRect(0, 0, sc.w, sc.h);
      for (const d of st().drawings) drawShape(d);
      if (temp) drawShape(temp, true);
      const toks = tokenList().slice().sort((a, b) => ((TT.ui.targets || []).includes(a.eid) ? 1 : 0) - ((TT.ui.targets || []).includes(b.eid) ? 1 : 0));
      for (const t of toks) drawToken(t, now);
      if (drag && drag.kind === 'token' && drag.measure) drawShape({ kind: 'measure', color: '#fff', width: 3, ...drag.measure }, true);
      for (let i = pings.length - 1; i >= 0; i--) { const p = pings[i]; const age = (now - p.t) / 1600; if (age > 1) { pings.splice(i, 1); continue; } g.beginPath(); g.arc(p.x, p.y, 20 + age * 90, 0, 7); g.strokeStyle = p.color; g.globalAlpha = 1 - age; g.lineWidth = 5; g.stroke(); g.beginPath(); g.arc(p.x, p.y, 8, 0, 7); g.fillStyle = p.color; g.fill(); g.globalAlpha = 1; }
      g.restore();
    }
    requestAnimationFrame(frame);
    const ro = new ResizeObserver(() => { const r = wrap.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; if (!fitted && st()) fit(); need(); }); ro.observe(wrap);

    // ------------------------------------------------------------ input
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const zoomAt = (sx, sy, f) => { const ns = Math.max(0.08, Math.min(6, view.s * f)); const [wx, wy] = s2w(sx, sy); view.s = ns; view.x = sx - wx * ns; view.y = sy - wy * ns; need(); };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = pos(e); zoomAt(sx, sy, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const [sx, sy] = pos(e); const [wx, wy] = s2w(sx, sy); const t = hitToken(wx, wy); if (t) tokenMenu(e, t); else emptyMenu(e, wx, wy); });
    const keydown = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { spaceDown = true; } };
    const keyup = (e) => { if (e.code === 'Space') spaceDown = false; };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, pos(e)); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 }; drag = null; temp = null; return; }
      if (e.button === 2) return; const [sx, sy] = pos(e); const [wx, wy] = s2w(sx, sy);
      if (e.altKey && !(e.button === 1)) { TT.do({ t: 'ping', x: wx, y: wy, color: myColor() }, true); return; }
      if (e.button === 1 || spaceDown) { drag = { kind: 'pan', sx, sy, vx: view.x, vy: view.y }; return; }
      if (tool === 'select') {
        const t = hitToken(wx, wy);
        if (t) { const ent = entOf(t); const sel = TT.ui.targets || []; if (e.shiftKey) TT.ui.targets = sel.includes(t.eid) ? sel.filter((x) => x !== t.eid) : [...sel, t.eid]; else TT.ui.targets = [t.eid]; TT.emit('targets'); need();
          if (ent && TT.canControl(ent)) drag = { kind: 'token', t, ox: wx - t.x, oy: wy - t.y, sx0: t.x, sy0: t.y, last: 0 }; return; }
        if (!e.shiftKey && (TT.ui.targets || []).length) { TT.ui.targets = []; TT.emit('targets'); need(); }
        drag = { kind: 'pan', sx, sy, vx: view.x, vy: view.y, moved: false }; return;
      }
      if (tool === 'erase') { eraseAt(wx, wy); drag = { kind: 'erase' }; return; }
      if (tool === 'text') { TT.prompt('Text label', 'Text to place on the map', '', { ok: 'Place' }).then((v) => { if (v && v.trim()) TT.do({ t: 'drawAdd', shape: { kind: 'text', x: wx, y: wy, text: v.trim(), color, size: 16 + width * 2 } }, true); }); return; }
      if (tool === 'pin') { const [px, py] = snapPt(wx, wy); TT.prompt('Pin', 'Optional label', '', { ok: 'Drop pin' }).then((v) => { if (v !== null) TT.do({ t: 'drawAdd', shape: { kind: 'pin', x: px, y: py, label: (v || '').trim(), color } }, true); }); return; }
      const [px, py] = tool === 'pen' ? [wx, wy] : snapPt(wx, wy);
      drag = { kind: 'shape', tool, x0: px, y0: py }; temp = tool === 'pen' ? { kind: 'pen', color, width, points: [[wx, wy]] } : null; need();
    });
    cv.addEventListener('pointermove', (e) => {
      const [sx, sy] = pos(e); pointers.set(e.pointerId, [sx, sy]);
      if (pinch && pointers.size >= 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const ns = Math.max(0.08, Math.min(6, pinch.s * d / pinch.d)); const [wx, wy] = s2w(pinch.cx, pinch.cy); view.s = ns; view.x = pinch.cx - wx * ns; view.y = pinch.cy - wy * ns; need(); return; }
      const [wx, wy] = s2w(sx, sy);
      if (!drag) { const t = hitToken(wx, wy); const nh = t ? t.id : null; if (nh !== hover) { hover = nh; cv.style.cursor = t ? (TT.canControl(entOf(t)) ? 'grab' : 'pointer') : tool === 'select' ? 'default' : 'crosshair'; } return; }
      if (drag.kind === 'pan') { view.x = drag.vx + sx - drag.sx; view.y = drag.vy + sy - drag.sy; drag.moved = true; need(); }
      else if (drag.kind === 'token') { const t = drag.t; const nx = wx - drag.ox, ny = wy - drag.oy; t.drag = { x: nx, y: ny, snapped: scene().snap && scene().grid ? snapPt(nx + radius(t), ny + radius(t)).map((v) => v - radius(t)) : null }; const tx = t.drag.snapped || [nx, ny]; drag.measure = { x1: drag.sx0 + radius(t), y1: drag.sy0 + radius(t), x2: tx[0] + radius(t), y2: tx[1] + radius(t) };
        const now = performance.now(); if (now - drag.last > 90) { drag.last = now; TT.do({ t: 'tokenMove', id: t.id, x: nx, y: ny }, true); } need(); }
      else if (drag.kind === 'erase') { eraseAt(wx, wy); }
      else if (drag.kind === 'shape') {
        const tl = drag.tool; const [px, py] = tl === 'pen' ? [wx, wy] : snapPt(wx, wy);
        if (tl === 'pen') temp.points.push([wx, wy]);
        else if (tl === 'line' || tl === 'measure' || tl === 'cone') temp = { kind: tl, color: tl === 'measure' ? '#ffffff' : color, width, x1: drag.x0, y1: drag.y0, x2: px, y2: py };
        else if (tl === 'circle') temp = { kind: 'circle', color, width, x: drag.x0, y: drag.y0, r: Math.hypot(px - drag.x0, py - drag.y0) };
        else if (tl === 'rect') temp = { kind: 'rect', color, width, x: Math.min(drag.x0, px), y: Math.min(drag.y0, py), w: Math.abs(px - drag.x0), h: Math.abs(py - drag.y0) };
        need();
      }
    });
    const finish = (e) => {
      pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!drag) return; const d = drag; drag = null;
      if (d.kind === 'token') { const t = d.t; const dg = t.drag; t.drag = null; if (dg) { const f = dg.snapped || [dg.x, dg.y]; t.x = f[0]; t.y = f[1]; TT.do({ t: 'tokenMove', id: t.id, x: dg.x, y: dg.y }, false); } need(); }
      else if (d.kind === 'shape' && temp) { const s = temp; temp = null; if (s.kind !== 'measure') { const tiny = (s.kind === 'pen' && s.points.length < 2) || (s.kind === 'circle' && s.r < 4) || (s.kind === 'rect' && s.w < 4 && s.h < 4) || ((s.kind === 'line' || s.kind === 'cone') && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 4); if (!tiny) TT.do({ t: 'drawAdd', shape: s }, true); } need(); }
      else if (d.kind === 'pan' && !d.moved) need();
    };
    cv.addEventListener('pointerup', finish); cv.addEventListener('pointercancel', finish);
    cv.addEventListener('dblclick', (e) => { const [sx, sy] = pos(e); const [wx, wy] = s2w(sx, sy); if (!hitToken(wx, wy)) TT.do({ t: 'ping', x: wx, y: wy, color: myColor() }, true); });

    // erasing
    function segDist(px, py, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; const l = dx * dx + dy * dy; let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
    function shapeHit(d, x, y) { const tol = 10 / view.s + (d.width || 3);
      if (d.kind === 'pen') { const p = d.points || []; for (let i = 1; i < p.length; i++) if (segDist(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) < tol) return true; return false; }
      if (d.kind === 'line') return segDist(x, y, d.x1, d.y1, d.x2, d.y2) < tol; if (d.kind === 'cone') return segDist(x, y, d.x1, d.y1, d.x2, d.y2) < tol * 2;
      if (d.kind === 'circle') return Math.hypot(x - d.x, y - d.y) <= d.r + tol; if (d.kind === 'rect') return x >= d.x - tol && x <= d.x + d.w + tol && y >= d.y - tol && y <= d.y + d.h + tol;
      return Math.hypot(x - d.x, y - d.y) < 30 / view.s + 12; }
    function eraseAt(x, y) { const me = TT.me(); const mine = (d) => TT.isDM() || d.byEid === me.charId; for (const d of st().drawings.slice().reverse()) if (mine(d) && shapeHit(d, x, y)) { st().drawings = st().drawings.filter((q) => q.id !== d.id); TT.do({ t: 'drawRemove', id: d.id }, true); need(); break; } }

    // menus & dialogs
    function tokenInfo(e) {
      TT.modal({ title: e.name, body: h('div', { class: 'col' }, h('div', { class: 'row' }, TT.avatar(e, 56), h('div', null, h('div', { class: 'muted' }, e.classLabel || (e.kind === 'inst' ? 'Creature' : '')), e.alignment ? h('div', { class: 'muted small' }, e.alignment) : null)), TT.resourceBars(e), e.status.length ? TT.statusChips(e) : h('div', { class: 'muted small' }, 'No conditions.'), e.defense != null && TT.rs().combat.defense ? h('div', null, 'Defense: ', h('b', null, e.defense)) : null) });
    }
    function tokenMenu(ev, t) {
      const e = entOf(t); if (!e) return; const dm = TT.isDM(); const cb = st().combat; const inOrder = cb.order.some((o) => o.eid === e.id);
      const items = [['👁 Info', () => tokenInfo(e)], ['🎯 Target this', () => { TT.ui.targets = [e.id]; TT.emit('targets'); need(); }]];
      if (e.kind === 'pc' && !dm) { /* players can open own sheet via the Character tab */ }
      if (dm) {
        items.push(['📄 Open sheet', () => TT.ui.openSheet && TT.ui.openSheet(e.id)], [t.hidden ? '👁 Reveal to players' : '🕶 Hide from players', () => TT.do({ t: 'tokenSet', id: t.id, patch: { hidden: !t.hidden } })],
          ['⚔ ' + (inOrder ? 'Remove from combat' : 'Add to combat'), () => TT.do({ t: 'tokenSet', id: t.id, patch: { inCombat: !inOrder } })], ['❤ Damage / heal…', async () => { const hp = TT.rs().combat.hp; const v = await TT.prompt('Adjust ' + e.name, 'Negative = damage, positive = healing', '-1'); if (v != null && !isNaN(Number(v))) TT.do({ t: 'adjust', eid: e.id, res: hp, delta: Number(v), hidden: TT.ls.get('dmHidden', false) }); }],
          ['✨ Add status…', () => TT.statusDialog({ id: e.id, name: e.name })], ['↔ Size…', async () => { const v = await TT.prompt('Token size', 'Size in grid squares (0.5 – 8)', t.size || 1); if (v != null) TT.do({ t: 'tokenSet', id: t.id, patch: { size: Number(v) } }); }],
          ['🗑 Remove from map', async () => { if (await TT.confirm('Remove token', `Remove ${e.name} from the map?${e.kind === 'inst' ? ' This deletes the creature.' : ''}`, 'Remove')) TT.do({ t: 'tokenRemove', id: t.id }); }]);
      }
      TT.menuAt(ev.clientX, ev.clientY, items);
    }
    function emptyMenu(ev, wx, wy) {
      const items = [['📡 Ping here', () => TT.do({ t: 'ping', x: wx, y: wy, color: myColor() }, true)], ['⛶ Fit map to window', fit]];
      if (TT.isDM()) { const [x, y] = snapPt(wx, wy); items.push(['👹 Spawn creature here…', () => TT.spawnDialog && TT.spawnDialog(x, y)], ['🧙 Place a character here…', () => TT.placeDialog && TT.placeDialog(x, y)]); }
      TT.menuAt(ev.clientX, ev.clientY, items);
    }

    // ------------------------------------------------------------ toolbar + hud
    const toolbar = h('div', { class: 'toolbar' }); const hud = h('div', { class: 'map-hud' }, 'Alt+click or double-click to ping · Space+drag to pan · scroll to zoom');
    const paintBar = () => {
      mount(toolbar, TOOLS.map(([k, ico, tip]) => h('button', { class: 'btn' + (tool === k ? ' active' : ''), title: tip, 'aria-label': tip, onclick: () => { tool = k; cv.style.cursor = k === 'select' ? 'default' : 'crosshair'; paintBar(); } }, ico)),
        h('input', { type: 'color', value: color, title: 'Your drawing color', oninput: (e) => { color = e.target.value; TT.ls.set('drawColor', color); } }),
        h('select', { class: 'inp sm', style: { width: '58px' }, title: 'Line width', onchange: (e) => { width = Number(e.target.value); TT.ls.set('drawWidth', width); } }, [2, 4, 7, 12].map((w) => h('option', { value: w, selected: w === width }, w + 'px'))),
        h('button', { class: 'btn', title: 'Erase all of your drawings', onclick: () => TT.do({ t: 'drawClear', scope: 'mine' }) }, '🧹'),
        TT.isDM() ? [h('button', { class: 'btn', title: 'Map & grid settings', onclick: () => TT.sceneDialog && TT.sceneDialog() }, '🗺 Map'), h('button', { class: 'btn', title: 'Spawn a creature', onclick: () => TT.spawnDialog && TT.spawnDialog() }, '👹 Add'), h('button', { class: 'btn danger', title: 'Clear everyone\'s drawings', onclick: async () => { if (await TT.confirm('Clear drawings', 'Remove every drawing from the map?', 'Clear all')) TT.do({ t: 'drawClear', scope: 'all' }); } }, '🗑')] : null);
    };
    paintBar();
    const zoom = h('div', { class: 'zoombox' }, h('button', { class: 'btn', title: 'Zoom in', onclick: () => zoomAt(W / 2, H / 2, 1.25) }, '＋'), h('button', { class: 'btn', title: 'Zoom out', onclick: () => zoomAt(W / 2, H / 2, 0.8) }, '－'), h('button', { class: 'btn', title: 'Fit to window', onclick: fit }, '⛶'));
    wrap.append(toolbar, hud, zoom);

    // ------------------------------------------------------------ live events
    const offs = [];
    const sub = (ev, fn) => { TT.on(ev, fn); offs.push([ev, fn]); };
    sub('state', (s) => { if (s.scene && (scene().w !== view.lastW || scene().h !== view.lastH)) { view.lastW = s.scene.w; view.lastH = s.scene.h; fit(); } const alive = new Set(Object.keys(s.tokens)); for (const id of [...alive]) { /* keep drags */ } TT.ui.targets = (TT.ui.targets || []).filter((id) => s.entities[id]); need(); });
    sub('tokenMoved', (m) => { const t = st().tokens[m.id]; if (t && !(t.drag)) { t.x = m.x; t.y = m.y; need(); } });
    sub('drawAdded', (m) => { if (!st().drawings.some((d) => d.id === m.d.id)) st().drawings.push(m.d); need(); });
    sub('drawRemoved', (m) => { st().drawings = st().drawings.filter((d) => d.id !== m.id); need(); });
    sub('drawingsReset', (m) => { st().drawings = m.drawings; need(); });
    sub('ping', (m) => { pings.push({ x: m.x, y: m.y, color: m.color, t: performance.now() }); need(); });
    sub('targets', need);
    wrap.destroy = () => { destroyed = true; ro.disconnect(); for (const [ev, fn] of offs) TT.off(ev, fn); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); };
    wrap.fit = fit; wrap.center = () => s2w(W / 2, H / 2); wrap.refresh = need;
    return wrap;
  };
})();
