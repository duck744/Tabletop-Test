'use strict';
// Pathfinder 1st Edition (d20pfsrd / Open Game License content). Starter content.
const A = (k, n) => ({ key: k, name: n, abbr: k.toUpperCase(), default: 10, roll: '4d6dl1' });
const abilities = [A('str', 'Strength'), A('dex', 'Dexterity'), A('con', 'Constitution'), A('int', 'Intelligence'), A('wis', 'Wisdom'), A('cha', 'Charisma')];

const sk = (key, name, ability) => ({ key, name, ability });
const skills = [
  sk('acrobatics', 'Acrobatics', 'dex'), sk('appraise', 'Appraise', 'int'), sk('bluff', 'Bluff', 'cha'), sk('climb', 'Climb', 'str'), sk('craft', 'Craft', 'int'),
  sk('diplomacy', 'Diplomacy', 'cha'), sk('disable_device', 'Disable Device', 'dex'), sk('disguise', 'Disguise', 'cha'), sk('escape_artist', 'Escape Artist', 'dex'),
  sk('fly', 'Fly', 'dex'), sk('handle_animal', 'Handle Animal', 'cha'), sk('heal', 'Heal', 'wis'), sk('intimidate', 'Intimidate', 'cha'),
  sk('k_arcana', 'Knowledge (arcana)', 'int'), sk('k_dungeoneering', 'Knowledge (dungeoneering)', 'int'), sk('k_engineering', 'Knowledge (engineering)', 'int'),
  sk('k_geography', 'Knowledge (geography)', 'int'), sk('k_history', 'Knowledge (history)', 'int'), sk('k_local', 'Knowledge (local)', 'int'),
  sk('k_nature', 'Knowledge (nature)', 'int'), sk('k_nobility', 'Knowledge (nobility)', 'int'), sk('k_planes', 'Knowledge (planes)', 'int'), sk('k_religion', 'Knowledge (religion)', 'int'),
  sk('linguistics', 'Linguistics', 'int'), sk('perception', 'Perception', 'wis'), sk('perform', 'Perform', 'cha'), sk('profession', 'Profession', 'wis'),
  sk('ride', 'Ride', 'dex'), sk('sense_motive', 'Sense Motive', 'wis'), sk('sleight_of_hand', 'Sleight of Hand', 'dex'), sk('spellcraft', 'Spellcraft', 'int'),
  sk('stealth', 'Stealth', 'dex'), sk('survival', 'Survival', 'wis'), sk('swim', 'Swim', 'str'), sk('use_magic_device', 'Use Magic Device', 'cha'),
];
const K = skills.filter((s) => s.key.startsWith('k_')).map((s) => s.key);

const raceO = (key, name, speed, mods, desc, extra = {}) => ({ key, name, desc, vars: { speed, bonusranks: extra.bonusranks || 0 }, mods, ...(extra.asi ? { asi: extra.asi } : {}) });
const races = [
  raceO('human', 'Human', 30, [], '+2 to one ability score, 1 bonus feat, 1 extra skill rank per level.', { asi: { from: 'any', patterns: [[2]] }, bonusranks: 1 }),
  raceO('dwarf', 'Dwarf', 20, [{ target: 'con', add: 2 }, { target: 'wis', add: 2 }, { target: 'cha', add: -2 }], 'Darkvision 60 ft, slow and steady, defensive training, stability.'),
  raceO('elf', 'Elf', 30, [{ target: 'dex', add: 2 }, { target: 'int', add: 2 }, { target: 'con', add: -2 }], 'Low-light vision, elven immunities, keen senses (+2 Perception).', {}),
  raceO('gnome', 'Gnome', 20, [{ target: 'con', add: 2 }, { target: 'cha', add: 2 }, { target: 'str', add: -2 }], 'Low-light vision, defensive training, illusion resistance.'),
  raceO('half_elf', 'Half-Elf', 30, [], '+2 to one ability score, low-light vision, adaptability, multitalented.', { asi: { from: 'any', patterns: [[2]] } }),
  raceO('half_orc', 'Half-Orc', 30, [], '+2 to one ability score, darkvision 60 ft, orc ferocity.', { asi: { from: 'any', patterns: [[2]] } }),
  raceO('halfling', 'Halfling', 20, [{ target: 'dex', add: 2 }, { target: 'cha', add: 2 }, { target: 'str', add: -2 }], 'Fearless, halfling luck, sure-footed.'),
];
races[2].mods.push({ target: 'skill:perception', add: 2 });

const cl = (key, name, hd, bab, good, sp, cs, desc, o = {}) => ({ key, name, desc, saves: good, classSkills: cs, vars: { hitdie: hd, babf: bab, skillpts: sp, ...(o.vars || {}) }, items: o.items || [], actions: o.actions || [], currency: o.gold ? { gp: o.gold } : undefined });
const classes = [
  cl('barbarian', 'Barbarian', 12, 'level', ['fort'], 4, ['acrobatics', 'climb', 'craft', 'handle_animal', 'intimidate', 'k_nature', 'perception', 'ride', 'survival', 'swim'], 'd12 · full BAB · Rage, fast movement.', { items: [{ ref: 'greataxe', qty: 1, equipped: true }, { ref: 'hide_armor', qty: 1, equipped: true }], gold: 105, actions: ['rage_pf'] }),
  cl('bard', 'Bard', 8, 'floor(level*3/4)', ['ref', 'will'], 6, ['acrobatics', 'appraise', 'bluff', 'climb', 'craft', 'diplomacy', 'disguise', 'escape_artist', 'intimidate', ...K, 'linguistics', 'perception', 'perform', 'profession', 'sense_motive', 'sleight_of_hand', 'spellcraft', 'stealth', 'use_magic_device'], 'd8 · 3/4 BAB · Bardic performance, spells.', { items: [{ ref: 'rapier', qty: 1, equipped: true }, { ref: 'leather_armor', qty: 1, equipped: true }], gold: 70, actions: ['cure_light_wounds'] }),
  cl('cleric', 'Cleric', 8, 'floor(level*3/4)', ['fort', 'will'], 2, ['appraise', 'craft', 'diplomacy', 'heal', 'k_arcana', 'k_history', 'k_nobility', 'k_planes', 'k_religion', 'linguistics', 'profession', 'sense_motive', 'spellcraft'], 'd8 · 3/4 BAB · Channel energy, domains, divine spells.', { items: [{ ref: 'heavy_mace', qty: 1, equipped: true }, { ref: 'scale_mail', qty: 1, equipped: true }, { ref: 'heavy_steel_shield', qty: 1, equipped: true }], gold: 140, actions: ['cure_light_wounds', 'channel_positive'] }),
  cl('druid', 'Druid', 8, 'floor(level*3/4)', ['fort', 'will'], 4, ['climb', 'craft', 'fly', 'handle_animal', 'heal', 'k_geography', 'k_nature', 'perception', 'profession', 'ride', 'spellcraft', 'survival', 'swim'], 'd8 · 3/4 BAB · Nature bond, wild shape, divine spells.', { items: [{ ref: 'quarterstaff', qty: 1, equipped: true }, { ref: 'leather_armor', qty: 1, equipped: true }], gold: 70 }),
  cl('fighter', 'Fighter', 10, 'level', ['fort'], 2, ['climb', 'craft', 'handle_animal', 'intimidate', 'k_dungeoneering', 'k_engineering', 'profession', 'ride', 'survival', 'swim'], 'd10 · full BAB · Bonus feats, weapon & armor training.', { items: [{ ref: 'longsword', qty: 1, equipped: true }, { ref: 'chainmail', qty: 1, equipped: true }, { ref: 'heavy_steel_shield', qty: 1, equipped: true }, { ref: 'longbow', qty: 1 }], gold: 175 }),
  cl('monk', 'Monk', 8, 'floor(level*3/4)', ['fort', 'ref', 'will'], 4, ['acrobatics', 'climb', 'craft', 'escape_artist', 'intimidate', 'k_history', 'k_religion', 'perception', 'perform', 'profession', 'ride', 'sense_motive', 'stealth', 'swim'], 'd8 · 3/4 BAB · Flurry of blows, unarmed strike, AC bonus.', { items: [{ ref: 'quarterstaff', qty: 1 }], gold: 35, actions: ['unarmed_pf'] }),
  cl('paladin', 'Paladin', 10, 'level', ['fort', 'will'], 2, ['craft', 'diplomacy', 'handle_animal', 'heal', 'k_nobility', 'k_religion', 'profession', 'ride', 'sense_motive', 'spellcraft'], 'd10 · full BAB · Smite evil, lay on hands, divine grace.', { items: [{ ref: 'longsword', qty: 1, equipped: true }, { ref: 'chainmail', qty: 1, equipped: true }, { ref: 'heavy_steel_shield', qty: 1, equipped: true }], gold: 175, actions: ['smite_evil'] }),
  cl('ranger', 'Ranger', 10, 'level', ['fort', 'ref'], 6, ['climb', 'craft', 'handle_animal', 'heal', 'intimidate', 'k_dungeoneering', 'k_geography', 'k_nature', 'perception', 'profession', 'ride', 'spellcraft', 'stealth', 'survival', 'swim'], 'd10 · full BAB · Favored enemy, track, wild empathy.', { items: [{ ref: 'longbow', qty: 1, equipped: true }, { ref: 'studded_leather', qty: 1, equipped: true }, { ref: 'shortsword', qty: 1 }], gold: 175 }),
  cl('rogue', 'Rogue', 8, 'floor(level*3/4)', ['ref'], 8, ['acrobatics', 'appraise', 'bluff', 'climb', 'craft', 'diplomacy', 'disable_device', 'disguise', 'escape_artist', 'intimidate', 'k_dungeoneering', 'k_local', 'linguistics', 'perception', 'perform', 'profession', 'sense_motive', 'sleight_of_hand', 'stealth', 'swim', 'use_magic_device'], 'd8 · 3/4 BAB · Sneak attack, trapfinding, evasion.', { items: [{ ref: 'shortsword', qty: 1, equipped: true }, { ref: 'leather_armor', qty: 1, equipped: true }, { ref: 'dagger', qty: 2 }], gold: 140, actions: ['sneak_attack_pf'] }),
  cl('sorcerer', 'Sorcerer', 6, 'floor(level/2)', ['will'], 2, ['appraise', 'bluff', 'craft', 'fly', 'intimidate', 'k_arcana', 'profession', 'spellcraft', 'use_magic_device'], 'd6 · 1/2 BAB · Bloodline, arcane spells (CHA).', { items: [{ ref: 'dagger', qty: 1, equipped: true }, { ref: 'light_crossbow', qty: 1 }], gold: 70, actions: ['magic_missile_pf', 'scorching_ray_pf'] }),
  cl('wizard', 'Wizard', 6, 'floor(level/2)', ['will'], 2, ['appraise', 'craft', 'fly', ...K, 'linguistics', 'profession', 'spellcraft'], 'd6 · 1/2 BAB · Arcane school, spellbook, arcane spells (INT).', { items: [{ ref: 'quarterstaff', qty: 1, equipped: true }, { ref: 'dagger', qty: 1 }], gold: 70, actions: ['magic_missile_pf', 'burning_hands_pf'] }),
];

const resources = [
  { key: 'hp', name: 'Hit Points', color: '#d64550', max: 'max(1, hitdie + con_mod + (level-1)*(floor(hitdie/2)+1+con_mod))', primary: true },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ key: 'sp' + n, name: `Level ${n} Spells/Day`, color: '#4f7de0', max: '0', show: `sp${n}_max > 0` })),
  { key: 'channel', name: 'Channel / Special Uses', color: '#c9a227', max: '0', show: 'channel_max > 0' },
  { key: 'rage', name: 'Rage Rounds', color: '#e07a2f', max: '0', show: 'rage_max > 0' },
];

const weapon = (key, name, dmg, type, crit, kind, price, desc = '') => ({
  key, name, type: 'weapon', equipSlot: 'hand', price: { gp: price }, crit,
  attack: kind === 'ranged' ? 'bab+dex_mod' : kind === 'finesse' ? 'bab+max(str_mod,dex_mod)' : 'bab+str_mod',
  damage: kind === 'ranged' ? dmg : `${dmg}+str_mod`, damageType: type,
  desc: `Crit ${crit.min === 20 ? '20' : crit.min + '-20'}/×${crit.mult}. ${desc}`,
});
const C = (min, mult) => ({ min, mult });
const armor = (key, name, ac, maxdex, price, desc) => ({ key, name, type: 'armor', equipSlot: 'body', price: { gp: price }, vars: { armorbonus: ac, maxdex }, desc });
const items = [
  weapon('dagger', 'Dagger', '1d4', 'piercing', C(19, 2), 'finesse', 2, 'Light, thrown (10 ft)'),
  weapon('club', 'Club', '1d6', 'bludgeoning', C(20, 2), 'melee', 0),
  weapon('quarterstaff', 'Quarterstaff', '1d6', 'bludgeoning', C(20, 2), 'melee', 0, 'Double weapon'),
  weapon('shortsword', 'Short Sword', '1d6', 'piercing', C(19, 2), 'melee', 10, 'Light'),
  weapon('rapier', 'Rapier', '1d6', 'piercing', C(18, 2), 'finesse', 20),
  weapon('longsword', 'Longsword', '1d8', 'slashing', C(19, 2), 'melee', 15),
  weapon('scimitar', 'Scimitar', '1d6', 'slashing', C(18, 2), 'melee', 15),
  weapon('battleaxe', 'Battleaxe', '1d8', 'slashing', C(20, 3), 'melee', 10),
  weapon('heavy_mace', 'Heavy Mace', '1d8', 'bludgeoning', C(20, 2), 'melee', 12),
  weapon('warhammer', 'Warhammer', '1d8', 'bludgeoning', C(20, 3), 'melee', 12),
  weapon('greataxe', 'Greataxe', '1d12', 'slashing', C(20, 3), 'melee', 20, 'Two-handed'),
  weapon('greatsword', 'Greatsword', '2d6', 'slashing', C(19, 2), 'melee', 50, 'Two-handed'),
  weapon('falchion', 'Falchion', '2d4', 'slashing', C(18, 2), 'melee', 75, 'Two-handed'),
  weapon('spear', 'Spear', '1d8', 'piercing', C(20, 3), 'melee', 1),
  weapon('light_crossbow', 'Light Crossbow', '1d8', 'piercing', C(19, 2), 'ranged', 35, 'Range 80 ft'),
  weapon('heavy_crossbow', 'Heavy Crossbow', '1d10', 'piercing', C(19, 2), 'ranged', 50, 'Range 120 ft'),
  weapon('shortbow', 'Shortbow', '1d6', 'piercing', C(20, 3), 'ranged', 30, 'Range 60 ft'),
  weapon('longbow', 'Longbow', '1d8', 'piercing', C(20, 3), 'ranged', 75, 'Range 100 ft'),
  armor('padded', 'Padded Armor', 1, 8, 5, 'Light armor +1'),
  armor('leather_armor', 'Leather Armor', 2, 6, 10, 'Light armor +2'),
  armor('studded_leather', 'Studded Leather', 3, 5, 25, 'Light armor +3'),
  armor('chain_shirt', 'Chain Shirt', 4, 4, 100, 'Light armor +4'),
  armor('hide_armor', 'Hide Armor', 4, 4, 15, 'Medium armor +4'),
  armor('scale_mail', 'Scale Mail', 4, 3, 50, 'Medium armor +4'),
  armor('chainmail', 'Chainmail', 5, 2, 150, 'Medium armor +5'),
  armor('breastplate', 'Breastplate', 5, 3, 200, 'Medium armor +5'),
  armor('splint_mail', 'Splint Mail', 6, 0, 200, 'Heavy armor +6'),
  armor('banded_mail', 'Banded Mail', 6, 1, 250, 'Heavy armor +6'),
  armor('half_plate', 'Half-Plate', 7, 0, 600, 'Heavy armor +7'),
  armor('full_plate', 'Full Plate', 8, 1, 1500, 'Heavy armor +8'),
  { key: 'light_wooden_shield', name: 'Light Wooden Shield', type: 'armor', equipSlot: 'offhand', price: { gp: 3 }, vars: { shield: 1 }, desc: '+1 shield bonus' },
  { key: 'heavy_steel_shield', name: 'Heavy Steel Shield', type: 'armor', equipSlot: 'offhand', price: { gp: 20 }, vars: { shield: 2 }, desc: '+2 shield bonus' },
  { key: 'buckler', name: 'Buckler', type: 'armor', equipSlot: 'offhand', price: { gp: 15 }, vars: { shield: 1 }, desc: '+1 shield bonus' },
  { key: 'potion_clw', name: 'Potion of Cure Light Wounds', type: 'consumable', price: { gp: 50 }, use: { heal: '1d8+1' }, desc: 'Heals 1d8+1.' },
  { key: 'potion_cmw', name: 'Potion of Cure Moderate Wounds', type: 'consumable', price: { gp: 300 }, use: { heal: '2d8+3' }, desc: 'Heals 2d8+3.' },
  { key: 'ring_prot1', name: 'Ring of Protection +1', type: 'magic', equipSlot: 'ring', price: { gp: 2000 }, mods: [{ target: 'ac', add: 1 }], desc: '+1 deflection bonus to AC.' },
  { key: 'cloak_resist1', name: 'Cloak of Resistance +1', type: 'magic', equipSlot: 'cloak', price: { gp: 1000 }, mods: [{ target: 'saves', add: 1 }], desc: '+1 resistance bonus on saves.' },
  { key: 'belt_giant_str2', name: 'Belt of Giant Strength +2', type: 'magic', equipSlot: 'belt', price: { gp: 4000 }, mods: [{ target: 'str', add: 2 }], desc: '+2 enhancement to Strength.' },
  { key: 'bp', name: 'Backpack', type: 'gear', price: { gp: 2 } },
  { key: 'rope', name: 'Silk Rope (50 ft)', type: 'gear', price: { gp: 10 } },
  { key: 'torch', name: 'Torch', type: 'gear', price: { cp: 1 } },
  { key: 'rations', name: 'Trail Rations (1 day)', type: 'gear', price: { sp: 5 } },
  { key: 'thieves_tools', name: "Thieves' Tools", type: 'gear', price: { gp: 30 } },
  { key: 'holy_symbol', name: 'Holy Symbol', type: 'gear', price: { gp: 1 } },
  { key: 'spell_component_pouch', name: 'Spell Component Pouch', type: 'gear', price: { gp: 5 } },
  { key: 'arrows', name: 'Arrows (20)', type: 'gear', price: { gp: 1 } },
];

const actions = [
  { key: 'rage_pf', name: 'Rage', kind: 'feature', uses: 'free', applies: ['raging_pf'], desc: '+4 STR/CON, +2 Will saves, -2 AC for rounds per day.' },
  { key: 'smite_evil', name: 'Smite Evil', kind: 'feature', uses: 'free', desc: 'Add CHA to attack and paladin level to damage vs evil target.' },
  { key: 'sneak_attack_pf', name: 'Sneak Attack', kind: 'feature', uses: 'free', damage: 'dice(ceil(level/2),6)', damageType: 'precision', desc: 'Extra precision damage vs flat-footed or flanked foes.' },
  { key: 'channel_positive', name: 'Channel Positive Energy', kind: 'feature', uses: 'standard', save: { ability: 'will', dc: '10+floor(level/2)+cha_mod', half: true }, heal: 'dice(ceil(level/2),6)', damage: 'dice(ceil(level/2),6)', desc: 'Heal living or harm undead, 30-ft burst.' },
  { key: 'unarmed_pf', name: 'Unarmed Strike', kind: 'weapon', uses: 'standard', attack: 'bab+str_mod', damage: '1d6+str_mod', damageType: 'bludgeoning', crit: { min: 20, mult: 2 }, desc: 'Monk unarmed strike.' },
  { key: 'cure_light_wounds', name: 'Cure Light Wounds', kind: 'spell', level: 1, uses: 'standard', cost: { res: 'sp1', amount: 1 }, heal: '1d8+min(level,5)', desc: 'Touch to heal 1d8 + caster level (max +5).' },
  { key: 'magic_missile_pf', name: 'Magic Missile', kind: 'spell', level: 1, uses: 'standard', cost: { res: 'sp1', amount: 1 }, auto: true, damage: 'dice(1+floor((level-1)/2),4)+dice(1+floor((level-1)/2),1)', damageType: 'force', desc: 'Auto-hit darts: 1d4+1 each, more at higher levels.' },
  { key: 'burning_hands_pf', name: 'Burning Hands', kind: 'spell', level: 1, uses: 'standard', cost: { res: 'sp1', amount: 1 }, save: { ability: 'ref', dc: '10+1+int_mod', half: true }, damage: 'dice(min(level,5),4)', damageType: 'fire', desc: '15-ft cone of fire; Reflex half.' },
  { key: 'scorching_ray_pf', name: 'Scorching Ray', kind: 'spell', level: 2, uses: 'standard', cost: { res: 'sp2', amount: 1 }, attack: 'bab+dex_mod', damage: '4d6', damageType: 'fire', desc: 'Ranged touch attack; rays scale with level.' },
  { key: 'fireball_pf', name: 'Fireball', kind: 'spell', level: 3, uses: 'standard', cost: { res: 'sp3', amount: 1 }, save: { ability: 'ref', dc: '10+3+int_mod', half: true }, damage: 'dice(min(level,10),6)', damageType: 'fire', desc: '20-ft-radius burst.' },
  { key: 'dodge_pf', name: 'Total Defense', kind: 'feature', uses: 'standard', desc: '+4 dodge bonus to AC this round.' },
  { key: 'charge', name: 'Charge', kind: 'feature', uses: 'full', desc: 'Move up to double speed and attack with +2.' },
];

const statuses = [
  { key: 'blinded', name: 'Blinded', desc: '-2 AC, loses Dex bonus; 50% miss chance.', mods: [{ target: 'ac', add: -2 }] },
  { key: 'confused', name: 'Confused', desc: 'Acts randomly.', blocks: ['standard'] },
  { key: 'dazed', name: 'Dazed', desc: 'Unable to act.', blocks: ['standard', 'move', 'swift'] },
  { key: 'entangled', name: 'Entangled', desc: '-2 attack, -4 Dex; half speed.', mods: [{ target: 'dex', add: -4 }], rollMods: { attack: 'dis' } },
  { key: 'exhausted', name: 'Exhausted', desc: '-6 Str and Dex; half speed.', mods: [{ target: 'str', add: -6 }, { target: 'dex', add: -6 }] },
  { key: 'fatigued', name: 'Fatigued', desc: '-2 Str and Dex.', mods: [{ target: 'str', add: -2 }, { target: 'dex', add: -2 }] },
  { key: 'frightened', name: 'Frightened', desc: '-2 on attacks, saves, skill checks.', mods: [{ target: 'skills', add: -2 }, { target: 'saves', add: -2 }] },
  { key: 'grappled', name: 'Grappled', desc: '-4 Dex, no movement.', mods: [{ target: 'dex', add: -4 }], blocks: ['move'] },
  { key: 'nauseated', name: 'Nauseated', desc: 'Only a single move action per turn.', blocks: ['standard'] },
  { key: 'paralyzed', name: 'Paralyzed', desc: 'Helpless; Str and Dex 0.', blocks: ['standard', 'move', 'swift', 'free', 'full', 'immediate'] },
  { key: 'prone', name: 'Prone', desc: '-4 melee attack; +4 AC vs ranged, -4 AC vs melee.', rollMods: { attack: 'dis' } },
  { key: 'shaken', name: 'Shaken', desc: '-2 attack, saves, skills.', mods: [{ target: 'skills', add: -2 }, { target: 'saves', add: -2 }] },
  { key: 'sickened', name: 'Sickened', desc: '-2 attack, damage, saves, skills.', mods: [{ target: 'skills', add: -2 }, { target: 'saves', add: -2 }] },
  { key: 'stunned', name: 'Stunned', desc: 'Drops items, no actions, -2 AC.', mods: [{ target: 'ac', add: -2 }], blocks: ['standard', 'move', 'swift', 'free', 'full', 'immediate'] },
  { key: 'unconscious', name: 'Unconscious', desc: 'Helpless.', blocks: ['standard', 'move', 'swift', 'free', 'full', 'immediate'] },
  { key: 'raging_pf', name: 'Raging', desc: '+4 Str/Con, -2 AC.', mods: [{ target: 'str', add: 4 }, { target: 'con', add: 4 }, { target: 'ac', add: -2 }, { target: 'save:will', add: 2 }], tags: ['buff'] },
  { key: 'bleed', name: 'Bleeding', desc: 'Takes 1 bleed damage each round.', tick: { res: 'hp', amount: '-1', when: 'turnStart', type: 'bleed' } },
  { key: 'burning_pf', name: 'On Fire', desc: 'Takes 1d6 fire damage each round.', tick: { res: 'hp', amount: '-1d6', when: 'turnStart', type: 'fire' }, defaultTurns: 4 },
  { key: 'poisoned_pf', name: 'Poisoned', desc: 'Takes 1d3 poison damage each round.', tick: { res: 'hp', amount: '-1d3', when: 'turnStart', type: 'poison' }, defaultTurns: 4 },
];

const N = (key, name, cr, align, ab, ac, hp, speed, acts, desc, icon, color, init) => {
  const [str, dex, con, int, wis, cha] = ab;
  return { key, name, cr, alignment: align, recLevel: Math.max(1, Math.ceil(cr)), level: Math.max(1, Math.ceil(cr)), desc, abilities: { str, dex, con, int, wis, cha }, fixed: { derived: { ac, speed }, resourceMax: { hp } }, actions: acts, icon, color };
};
const at = (name, bonus, dmg, type, crit, desc = '') => ({ name, kind: 'weapon', uses: 'standard', attack: String(bonus), damage: dmg, damageType: type, crit, desc });
const npcs = [
  N('goblin', 'Goblin', 0.33, 'Neutral Evil', [11, 15, 12, 10, 9, 6], 16, 6, 30, [at('Short Sword', 2, '1d4', 'piercing', C(19, 2)), at('Shortbow', 4, '1d4', 'piercing', C(20, 3))], 'CR 1/3. Small humanoid.', '👺', '#4a8a3a'),
  N('kobold', 'Kobold', 0.33, 'Lawful Evil', [9, 13, 10, 10, 9, 8], 15, 5, 30, [at('Spear', 1, '1d6-1', 'piercing', C(20, 3))], 'CR 1/4. Crafty trapmakers.', '🦎', '#a05a30'),
  N('skeleton', 'Human Skeleton', 0.33, 'Neutral Evil', [15, 14, 10, 0, 10, 10], 16, 4, 30, [at('Claw', 0, '1d4+2', 'slashing', C(20, 2))], 'CR 1/3. DR 5/bludgeoning.', '💀', '#c8c8b0'),
  N('zombie', 'Human Zombie', 0.5, 'Neutral Evil', [19, 8, 10, 0, 10, 10], 12, 12, 30, [at('Slam', 4, '1d6+4', 'bludgeoning', C(20, 2))], 'CR 1/2. Staggers.', '🧟', '#5a7a4a'),
  N('wolf', 'Wolf', 1, 'Neutral', [13, 15, 15, 2, 12, 6], 14, 13, 50, [at('Bite', 2, '1d6+1', 'piercing', C(20, 2), 'Trip.')], 'CR 1. Pack hunter.', '🐺', '#8a8a8a'),
  N('orc', 'Orc Warrior', 0.33, 'Chaotic Evil', [17, 11, 12, 7, 8, 6], 15, 6, 30, [at('Falchion', 5, '2d4+4', 'slashing', C(18, 2))], 'CR 1/3. Ferocity.', '🪓', '#4a6a3a'),
  N('bugbear', 'Bugbear', 2, 'Chaotic Evil', [15, 14, 13, 10, 12, 9], 17, 16, 30, [at('Morningstar', 5, '1d8+2', 'piercing', C(20, 2))], 'CR 2. Stealthy brutes.', '🐻', '#7a5a3a'),
  N('giant_spider', 'Giant Spider', 1, 'Neutral', [11, 17, 12, 0, 10, 2], 14, 16, 30, [at('Bite', 3, '1d6', 'piercing', C(20, 2), 'Poison: Fort DC 14 or 1d2 Str damage.')], 'CR 1. Webs.', '🕷️', '#3a3a3a'),
  N('ogre', 'Ogre', 3, 'Chaotic Evil', [21, 8, 15, 6, 10, 7], 17, 30, 30, [at('Greatclub', 7, '2d8+7', 'bludgeoning', C(20, 2))], 'CR 3. Reach 10 ft.', '👹', '#8a7a4a'),
  N('troll', 'Troll', 5, 'Chaotic Evil', [23, 14, 23, 6, 9, 6], 16, 63, 30, [at('Claw', 9, '1d6+6', 'slashing', C(20, 2)), at('Bite', 9, '1d6+6', 'piercing', C(20, 2))], 'CR 5. Regeneration 5.', '🧌', '#4a7a4a'),
];

module.exports = {
  id: 'pf1e', name: 'Pathfinder 1e', short: 'Pathfinder',
  desc: 'Pathfinder First Edition (OGL). BAB, ranked skills, good/poor saves, touch AC, critical threats and confirmation.',
  rollSystem: 'd20', crit: { max: 20, min: 1 },
  grid: { unit: 'ft', cell: 5, distance: 'chebyshev' },
  currency: [{ key: 'pp', name: 'PP' }, { key: 'gp', name: 'GP' }, { key: 'sp', name: 'SP' }, { key: 'cp', name: 'CP' }],
  abilities, abilityMod: 'floor((score-10)/2)',
  varDefaults: { hitdie: 8, speed: 30, babf: 0, skillpts: 2, bonusranks: 0, armorbonus: 0, maxdex: 99, shield: 0 },
  derived: [
    { key: 'bab', name: 'Base Attack Bonus', formula: 'babf', fmt: '+' },
    { key: 'ac', name: 'Armor Class', formula: '10+armorbonus+shield+min(dex_mod,maxdex)' },
    { key: 'touch', name: 'Touch AC', formula: '10+min(dex_mod,maxdex)' },
    { key: 'flat', name: 'Flat-Footed AC', formula: '10+armorbonus+shield' },
    { key: 'speed', name: 'Speed', formula: 'speed', unit: 'ft' },
    { key: 'init', name: 'Initiative', formula: 'dex_mod', fmt: '+' },
    { key: 'cmb', name: 'CMB', formula: 'bab+str_mod', fmt: '+' },
    { key: 'cmd', name: 'CMD', formula: '10+bab+str_mod+dex_mod' },
  ],
  skillFormula: 'abil + rank + if(cls*(rank>0), 3, 0)', skills, skillMode: 'ranks',
  saveFormula: 'abil + if(proficient, 2+floor(level/2), floor(level/3))',
  saves: [{ key: 'fort', name: 'Fortitude', ability: 'con' }, { key: 'ref', name: 'Reflex', ability: 'dex' }, { key: 'will', name: 'Will', ability: 'wis' }],
  resources, tables: {},
  initiative: { roll: 'd20', stat: 'init' },
  combat: { defense: 'ac', hp: 'hp', autoResolve: true, critMode: 'mult', critConfirm: true, weaponUses: 'standard', moveStat: 'speed', hideNpcStats: true,
    turn: [{ key: 'standard', name: 'Standard', count: 1 }, { key: 'move', name: 'Move', count: 1 }, { key: 'swift', name: 'Swift', count: 1 }, { key: 'immediate', name: 'Immediate', count: 1 }] },
  creation: {
    startLevel: 1, abilityMethods: ['pointbuy', 'standard', 'roll', 'manual'], standardArray: [15, 14, 13, 12, 10, 8], pointBuy: { budget: 15, min: 7, max: 18, cost: { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 } },
    steps: ['basics', 'class', 'race', 'abilities', 'skills', 'equipment', 'actions', 'review'],
    skillBudget: 'max(1, skillpts+int_mod+bonusranks)*level', skillBudgetLabel: 'Skill ranks', startItemsFromOptions: true,
  },
  choices: [
    { key: 'class', name: 'Class', required: true, options: classes },
    { key: 'race', name: 'Race', required: true, options: races },
  ],
  items, actions, statuses, npcs,
  alignments: ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'],
  tabs: [{ id: 'shop', name: 'Shop', icon: '🛒', type: 'shop' }, { id: 'quests', name: 'Quests', icon: '📜', type: 'quests' }],
  customLogName: 'Gifts & Trade',
};
