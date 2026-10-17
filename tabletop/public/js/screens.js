/* Lobby (campaign select), new-campaign dialog, and the DM / player gate. */
(function () {
  'use strict';
  const { h, mount } = TT;
  TT.screens = TT.screens || {};

  const topbar = (right) => h('div', { class: 'topbar' }, h('div', { class: 'brand' }, '🎲 Tabletop ', h('b', null, 'Hall')), right || null);

  TT.screens.lobby = async function (root) {
    const r = await Promise.all([TT.do({ t: 'list' }), TT.do({ t: 'presets' })]);
    const camps = (r[0] && r[0].campaigns) || [], presets = (r[1] && r[1].presets) || [];
    mount(root,
      topbar(),
      h('div', { class: 'lobby' }, h('div', { class: 'lobby-inner' },
        h('div', { class: 'hero' }, h('h1', null, 'Choose Your ', h('b', null, 'Campaign')),
          h('p', null, 'Join a table below, or start a new campaign with D&D 5.5e, Pathfinder, Call of Cthulhu — or build your own homebrew ruleset.')),
        h('div', { class: 'camp-grid' },
          camps.map((c) => h('div', { class: 'card camp', tabindex: 0, onclick: () => TT.ui.go('gate', c.id), onkeydown: (e) => { if (e.key === 'Enter') TT.ui.go('gate', c.id); } },
            h('div', { class: 'card-b' },
              h('div', { class: 'row between' }, h('h2', { style: { fontSize: '20px', color: '#fff' } }, c.name), h('span', { class: 'pill gold' }, c.rulesetShort || c.ruleset)),
              h('div', { class: 'muted small', style: { marginTop: '4px' } }, c.ruleset),
              h('div', { class: 'muted small', style: { marginTop: '8px' } }, c.characters.length ? `${c.characters.length} playable character${c.characters.length > 1 ? 's' : ''}` : 'No characters yet — be the first!'),
              h('div', { class: 'chars' }, c.characters.map((ch) => h('div', { class: 'cc', title: [ch.classLabel, 'Level ' + ch.level].filter(Boolean).join(' · ') }, TT.avatar(ch, 24), h('span', null, ch.name))))))),
          h('button', { class: 'new-camp', onclick: () => newCampaign(presets) }, '＋ New Campaign')))));
  };

  function newCampaign(presets) {
    let sel = 'dnd5e', customRs = null, customLabel = null;
    const name = h('input', { class: 'inp', placeholder: 'e.g. The Sunless Citadel' });
    const dmpw = h('input', { class: 'inp', type: 'text', placeholder: 'dm123 (default)' });
    const grid = h('div', { class: 'rs-grid' });
    const note = h('div', { class: 'muted small' });
    const paint = () => {
      mount(grid, presets.map((p) => h('div', { class: 'rs-card' + (sel === p.id ? ' sel' : ''), tabindex: 0, onclick: () => { sel = p.id; customRs = null; paint(); } },
        h('h3', null, p.id === 'custom' ? '🛠 Custom / Homebrew' : p.short), h('div', { class: 'muted small' }, p.desc))));
      note.textContent = customRs ? `Using your customized version of ${customLabel}.` : '';
    };
    paint();
    const customize = async () => {
      const r = customRs ? { ruleset: customRs } : await TT.do({ t: 'preset', id: sel }); if (!r) return;
      TT.rulesetEditor(r.ruleset, { title: 'Customize Ruleset', saveLabel: 'Use This Ruleset', onSave: (rs) => { customRs = rs; customLabel = (presets.find((p) => p.id === sel) || {}).short || 'ruleset'; paint(); return true; } });
    };
    const importJson = () => {
      const ta = h('textarea', { class: 'inp', rows: 12, placeholder: 'Paste a ruleset JSON here…', style: { fontFamily: 'monospace', fontSize: '12px' } });
      TT.modal({ title: 'Import Ruleset', body: ta, actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: () => { try { customRs = JSON.parse(ta.value); customLabel = customRs.short || customRs.name || 'imported ruleset'; paint(); } catch (e) { TT.toast('That is not valid JSON: ' + e.message, 'error'); return false; } } }] });
    };
    TT.modal({
      title: 'New Campaign', wide: true,
      body: h('div', { class: 'col', style: { gap: '14px' } },
        h('div', { class: 'grid2' }, h('label', { class: 'lbl' }, 'Campaign name', name), h('label', { class: 'lbl' }, 'DM password (optional)', dmpw)),
        h('div', null, h('div', { class: 'lbl', style: { marginBottom: '6px' } }, 'Ruleset'), grid),
        note,
        h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: customize }, '✏️ Customize this ruleset…'), h('button', { class: 'btn', onclick: importJson }, '⇪ Import JSON'),
          h('span', { class: 'muted small' }, 'Edit attributes, resources, skills, items, abilities, status effects, creatures and custom tabs.'))),
      actions: [{ label: 'Cancel' }, { label: 'Create Campaign', primary: true, close: false, onClick: async (close) => {
        if (!name.value.trim()) { TT.toast('Give your campaign a name.', 'error'); return false; }
        const msg = { t: 'createCampaign', name: name.value.trim(), dmPassword: dmpw.value.trim() || undefined };
        if (customRs) msg.ruleset = customRs; else msg.rulesetId = sel;
        const r = await TT.do(msg); if (!r) return false; close(); TT.ui.go('gate', r.campaign.id);
      } }],
    });
  }

  TT.screens.gate = async function (root, cid) {
    const r = await TT.do({ t: 'list' }); const camp = r && r.campaigns.find((c) => c.id === cid);
    if (!camp) { TT.toast('That campaign could not be found.', 'error'); return TT.ui.go('lobby'); }
    const enter = async (res, extra) => { TT.session = { token: res.token, role: res.role, charId: res.charId, cid, ...extra }; TT.ls.set('session', TT.session); TT.ui.go('game'); };
    const dmPw = h('input', { class: 'inp', type: 'password', placeholder: 'DM password' });
    const dmLogin = async () => { const x = await TT.do({ t: 'login', campaignId: cid, role: 'dm', password: dmPw.value }); if (x) enter(x); };
    dmPw.addEventListener('keydown', (e) => { if (e.key === 'Enter') dmLogin(); });
    let picked = null; const pw = h('input', { class: 'inp', type: 'password', placeholder: 'Character password' }); const pwBox = h('div', { class: 'col hidden' });
    const login = async () => { const x = await TT.do({ t: 'login', campaignId: cid, role: 'player', characterId: picked.id, password: pw.value }); if (x) enter(x); };
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    const list = h('div', { class: 'col' });
    const paint = () => {
      mount(list, camp.characters.length ? camp.characters.map((ch) => h('div', { class: 'char-pick' + (picked && picked.id === ch.id ? ' sel' : ''), tabindex: 0, onclick: () => { picked = ch; paint(); pwBox.classList.remove('hidden'); pw.focus(); }, onkeydown: (e) => { if (e.key === 'Enter') { picked = ch; paint(); pwBox.classList.remove('hidden'); pw.focus(); } } },
        TT.avatar(ch, 40), h('div', null, h('b', null, ch.name), h('div', { class: 'muted small' }, [ch.classLabel, 'Level ' + ch.level].filter(Boolean).join(' · '))))) : h('p', { class: 'muted' }, 'No characters yet. Create the first one!'));
    };
    paint(); mount(pwBox, h('div', { class: 'row' }, pw, h('button', { class: 'btn primary', onclick: login }, 'Play')));
    mount(root,
      topbar(h('button', { class: 'btn', style: { marginLeft: 'auto' }, onclick: () => TT.ui.go('lobby') }, '← All campaigns')),
      h('div', { class: 'lobby' }, h('div', { class: 'gate' },
        h('div', { style: { gridColumn: '1 / -1', textAlign: 'center' } }, h('h1', null, camp.name), h('div', { class: 'muted' }, camp.ruleset)),
        h('div', { class: 'card' }, h('h3', { class: 'panel-h' }, 'Players'), h('div', { class: 'card-b col' },
          list, pwBox, h('button', { class: 'btn primary', onclick: () => TT.ui.go('creator', camp) }, '＋ Create a new character'))),
        h('div', { class: 'card' }, h('h3', { class: 'panel-h' }, 'Dungeon Master'), h('div', { class: 'card-b col' },
          h('p', { class: 'muted small' }, 'Run the table: edit characters, spawn creatures, control combat and the map.'),
          h('div', { class: 'row' }, dmPw, h('button', { class: 'btn primary', onclick: dmLogin }, 'Enter')),
          h('div', { class: 'muted tiny' }, 'The default DM password is dm123.'),
          h('hr', { style: { border: 0, borderTop: '1px solid var(--line)', width: '100%' } }),
          h('button', { class: 'btn danger sm', onclick: async () => {
            const p = await TT.prompt('Delete campaign', `Enter the DM password to permanently delete "${camp.name}".`, '', { type: 'password', ok: 'Delete' });
            if (p == null) return; const x = await TT.do({ t: 'deleteCampaign', campaignId: cid, password: p }); if (x) { TT.toast('Campaign deleted.'); TT.ui.go('lobby'); }
          } }, 'Delete this campaign'))))));
    TT.enterAfterCreate = enter;
  };
})();
