# Tabletop Hall — progress

Run: `node server/index.js` (no npm install needed) → http://localhost:3000 · DM password `dm123`.

## Done
- Zero-dependency Node server (HTTP + hand-written WebSocket), JSON persistence in `data/`.
- Rules engine (formulas, dice, d20 + d100 systems) and presets: D&D 5.5e, Pathfinder 1e, Call of Cthulhu 7e, custom/blank.
- Campaign select, DM/player login, step-by-step character creator with live calculations (browser-tested).
- Player sheet (read-only), resource bars, rolls, floating notes + dice windows (browser-tested).
- Combat tab: canvas map, drawing tools, tokens, turn-order tracker, logs, initiative animation (browser-tested).
- DM tools: characters, creature library, catalog, shop/quests tabs, settings, ruleset editor.

- Browser-tested: D&D, Pathfinder, Call of Cthulhu creation; two-browser combat; shop; notes; dice; phone layout. 61/61 server checks pass.

## To do / polish
- Richer preset content (more creatures/items/spells, real recommended levels on creatures).
- Mobile polish for DM screens.
