'use strict';
// D&D 5.5e (2024 rules) built from the SRD 5.2 (CC-BY-4.0) structure. Starter content: extend via the DM tools or ruleset editor.
const A = (k, n) => ({ key: k, name: n, abbr: k.toUpperCase(), default: 10, roll: '4d6dl1' });
const abilities = [A('str', 'Strength'), A('dex', 'Dexterity'), A('con', 'Constitution'), A('int', 'Intelligence'), A('wis', 'Wisdom'), A('cha', 'Charisma')];

const skillDefs = [
  ['acrobatics', 'Acrobatics', 'dex'], ['animal_handling', 'Animal Handling', 'wis'], ['arcana', 'Arcana', 'int'], ['athletics', 'Athletics', 'str'],
  ['deception', 'Deception', 'cha'], ['history', 'History', 'int'], ['insight', 'Insight', 'wis'], ['intimidation', 'Intimidation', 'cha'],
  ['investigation', 'Investigation', 'int'], ['medicine', 'Medicine', 'wis'], ['nature', 'Nature', 'int'], ['perception', 'Perception', 'wis'],
  ['performance', 'Performance', 'cha'], ['persuasion', 'Persuasion', 'cha'], ['religion', 'Religion', 'int'], ['sleight_of_hand', 'Sleight of Hand', 'dex'],
  ['stealth', 'Stealth', 'dex'], ['survival', 'Survival', 'wis'],
].map(([key, name, ability]) => ({ key, name, ability }));
const ALLSK = skillDefs.map((s) => s.key);

// spell slot table (full caster) rows by level; pact table rows [slots, slotLevel]
const slots = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const pact = [[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];

const resources = [
  { key: 'hp', name: 'Hit Points', color: '#d64550', max: 'max(1, hitdie + con_mod + (level-1)*(floor(hitdie/2)+1+con_mod))', primary: true },
  { key: 'temp', name: 'Temp HP', color: '#6b8fd6', max: '999', start: '0', show: '0' },
  { key: 'hd', name: 'Hit Dice', color: '#c9a227', max: 'level' },
  { key: 'insp', name: 'Heroic Inspiration', color: '#e8c547', max: '1', start: '0' },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ key: 'slot' + n, name: `Level ${n} Slots`, color: '#4f7de0', max: `tbl('slots', slotlvl, ${n})`, show: `slot${n}_max > 0` })),
  { key: 'pact', name: 'Pact Slots', color: '#8a4fe0', rest: 'short', max: "tbl('pact', pactlvl, 1)", show: 'pact_max > 0' },
];

const DAM = (n) => `dice(1+(level>=5)+(level>=11)+(level>=17),${n})`;

const actions = [
  // ---- class features
  { key: 'second_wind', name: 'Second Wind', kind: 'feature', uses: 'bonus', heal: '1d10+level', desc: 'Regain 1d10 + Fighter level HP. Recharges on a short or long rest.', classes: ['fighter'] },
  { key: 'rage', name: 'Rage', kind: 'feature', uses: 'bonus', applies: ['raging'], desc: 'Advantage on Strength checks/saves, +2 melee damage, resist B/P/S. Lasts 10 minutes.', classes: ['barbarian'] },
  { key: 'bardic_inspiration', name: 'Bardic Inspiration', kind: 'feature', uses: 'bonus', desc: 'Give an ally a d6 (scales) to add to one d20 test within 1 hour.', classes: ['bard'] },
  { key: 'lay_on_hands', name: 'Lay on Hands', kind: 'feature', uses: 'bonus', heal: '5', desc: 'Pool of healing equal to 5 × Paladin level. Restore HP by touch (shown: 5 HP).', classes: ['paladin'] },
  { key: 'sneak_attack', name: 'Sneak Attack', kind: 'feature', uses: null, damage: 'dice(ceil(level/2),6)', damageType: 'weapon', desc: 'Once per turn, extra damage with advantage or an adjacent ally. Roll and add to a hit.', classes: ['rogue'] },
  { key: 'channel_divinity', name: 'Channel Divinity', kind: 'feature', uses: 'action', desc: 'Divine Spark or Turn Undead. Resolve effects with the DM.', classes: ['cleric', 'paladin'] },
  { key: 'wild_shape', name: 'Wild Shape', kind: 'feature', uses: 'bonus', desc: 'Assume a beast form you know. DM adjudicates stats.', classes: ['druid'] },
  { key: 'flurry_of_blows', name: 'Flurry of Blows', kind: 'feature', uses: 'bonus', attack: 'pb+dex_mod', damage: '2d6+dex_mod', damageType: 'bludgeoning', desc: 'Two unarmed strikes (shown as one roll of both).', classes: ['monk'] },
  { key: 'font_of_magic', name: 'Sorcerous Restoration', kind: 'feature', uses: null, desc: 'Convert sorcery points and spell slots.', classes: ['sorcerer'] },
  { key: 'arcane_recovery', name: 'Arcane Recovery', kind: 'feature', uses: null, desc: 'Recover spell slots on a short rest (levels totalling half your wizard level).', classes: ['wizard'] },
  { key: 'hunters_mark', name: "Hunter's Mark", kind: 'spell', level: 1, uses: 'bonus', cost: { res: 'slot1', amount: 1 }, damage: '1d6', damageType: 'force', desc: 'Extra 1d6 damage on hits against the marked target.', classes: ['ranger'] },
  { key: 'eldritch_invocations', name: 'Pact Magic', kind: 'feature', uses: null, desc: 'Your spell slots are all the same level and recharge on a short rest.', classes: ['warlock'] },
  // ---- cantrips
  { key: 'fire_bolt', name: 'Fire Bolt', kind: 'spell', level: 0, uses: 'action', attack: 'spellatk', damage: DAM(10), damageType: 'fire', range: '120 ft', desc: 'Ranged spell attack. Damage scales at levels 5, 11, 17.', classes: ['wizard', 'sorcerer'] },
  { key: 'eldritch_blast', name: 'Eldritch Blast', kind: 'spell', level: 0, uses: 'action', attack: 'spellatk', damage: '1d10', damageType: 'force', range: '120 ft', desc: 'Ranged spell attack; extra beams at levels 5, 11, 17.', classes: ['warlock'] },
  { key: 'sacred_flame', name: 'Sacred Flame', kind: 'spell', level: 0, uses: 'action', save: { ability: 'dex', dc: 'spelldc' }, damage: DAM(8), damageType: 'radiant', range: '60 ft', desc: 'Dex save or radiant damage.', classes: ['cleric'] },
  { key: 'vicious_mockery', name: 'Vicious Mockery', kind: 'spell', level: 0, uses: 'action', save: { ability: 'wis', dc: 'spelldc' }, damage: DAM(6), damageType: 'psychic', range: '60 ft', desc: 'Wis save or psychic damage and disadvantage on next attack.', classes: ['bard'] },
  { key: 'ray_of_frost', name: 'Ray of Frost', kind: 'spell', level: 0, uses: 'action', attack: 'spellatk', damage: DAM(8), damageType: 'cold', range: '60 ft', desc: 'Ranged spell attack; speed reduced by 10 ft.', classes: ['wizard', 'sorcerer'] },
  { key: 'poison_spray', name: 'Poison Spray', kind: 'spell', level: 0, uses: 'action', save: { ability: 'con', dc: 'spelldc' }, damage: DAM(12), damageType: 'poison', range: '30 ft', desc: 'Con save or poison damage.', classes: ['druid', 'sorcerer', 'warlock', 'wizard'] },
  { key: 'shocking_grasp', name: 'Shocking Grasp', kind: 'spell', level: 0, uses: 'action', attack: 'spellatk', damage: DAM(8), damageType: 'lightning', range: 'Touch', desc: 'Melee spell attack; target cannot take reactions.', classes: ['wizard', 'sorcerer'] },
  { key: 'produce_flame', name: 'Produce Flame', kind: 'spell', level: 0, uses: 'action', attack: 'spellatk', damage: DAM(8), damageType: 'fire', range: '60 ft', desc: 'Hurl flame at a creature.', classes: ['druid'] },
  { key: 'guidance', name: 'Guidance', kind: 'spell', level: 0, uses: 'action', desc: 'Touch: target adds 1d4 to one ability check within 1 minute.', classes: ['cleric', 'druid'] },
  { key: 'light', name: 'Light', kind: 'spell', level: 0, uses: 'action', desc: 'Object sheds bright light 20 ft for 1 hour.', classes: ['bard', 'cleric', 'sorcerer', 'wizard'] },
  { key: 'mage_hand', name: 'Mage Hand', kind: 'spell', level: 0, uses: 'action', desc: 'Spectral hand manipulates objects up to 30 ft away.', classes: ['bard', 'sorcerer', 'warlock', 'wizard'] },
  { key: 'prestidigitation', name: 'Prestidigitation', kind: 'spell', level: 0, uses: 'action', desc: 'Minor magical tricks.', classes: ['bard', 'sorcerer', 'warlock', 'wizard'] },
  { key: 'thaumaturgy', name: 'Thaumaturgy', kind: 'spell', level: 0, uses: 'action', desc: 'Manifest a minor wonder.', classes: ['cleric'] },
  // ---- level 1
  { key: 'magic_missile', name: 'Magic Missile', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, auto: true, damage: '3d4+3', upcast: '1d4+1', damageType: 'force', range: '120 ft', desc: 'Three darts that always hit; +1 dart per slot level above 1st.', classes: ['wizard', 'sorcerer'] },
  { key: 'cure_wounds', name: 'Cure Wounds', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, heal: '2d8+spellmod', upcast: '2d8', range: 'Touch', desc: 'Heal a creature you touch.', classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger'] },
  { key: 'healing_word', name: 'Healing Word', kind: 'spell', level: 1, uses: 'bonus', cost: { res: 'slot1', amount: 1 }, heal: '2d4+spellmod', upcast: '2d4', range: '60 ft', desc: 'Heal a creature you can see within range.', classes: ['bard', 'cleric', 'druid'] },
  { key: 'burning_hands', name: 'Burning Hands', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, save: { ability: 'dex', dc: 'spelldc', half: true }, damage: '3d6', upcast: '1d6', damageType: 'fire', range: '15 ft cone', desc: 'Dex save, half on success.', classes: ['wizard', 'sorcerer'] },
  { key: 'thunderwave', name: 'Thunderwave', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, save: { ability: 'con', dc: 'spelldc', half: true }, damage: '2d8', upcast: '1d8', damageType: 'thunder', range: '15 ft cube', desc: 'Con save, half on success; pushed 10 ft on failure.', classes: ['bard', 'druid', 'sorcerer', 'wizard'] },
  { key: 'guiding_bolt', name: 'Guiding Bolt', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, attack: 'spellatk', damage: '4d6', upcast: '1d6', damageType: 'radiant', range: '120 ft', desc: 'Next attack against the target has advantage.', classes: ['cleric'] },
  { key: 'bless', name: 'Bless', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, applies: ['blessed'], desc: 'Up to three creatures add 1d4 to attack rolls and saves for 1 minute.', classes: ['cleric', 'paladin'] },
  { key: 'sleep', name: 'Sleep', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, save: { ability: 'wis', dc: 'spelldc' }, applies: ['incapacitated'], desc: 'Wis save or incapacitated, then unconscious.', classes: ['bard', 'sorcerer', 'wizard'] },
  { key: 'shield', name: 'Shield', kind: 'spell', level: 1, uses: 'reaction', cost: { res: 'slot1', amount: 1 }, desc: '+5 AC until the start of your next turn.', classes: ['sorcerer', 'wizard'] },
  { key: 'mage_armor', name: 'Mage Armor', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, desc: 'AC becomes 13 + Dex mod for 8 hours (unarmored target).', classes: ['sorcerer', 'wizard'] },
  { key: 'command', name: 'Command', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, save: { ability: 'wis', dc: 'spelldc' }, desc: 'Utter a one-word command.', classes: ['cleric', 'paladin'] },
  { key: 'detect_magic', name: 'Detect Magic', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, desc: 'Sense magic within 30 ft (concentration, 10 min).', classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'wizard'] },
  { key: 'entangle', name: 'Entangle', kind: 'spell', level: 1, uses: 'action', cost: { res: 'slot1', amount: 1 }, save: { ability: 'str', dc: 'spelldc' }, applies: ['restrained'], desc: 'Grasping plants restrain creatures in a 20-ft square.', classes: ['druid', 'ranger'] },
  // ---- level 2
  { key: 'scorching_ray', name: 'Scorching Ray', kind: 'spell', level: 2, uses: 'action', cost: { res: 'slot2', amount: 1 }, attack: 'spellatk', damage: '2d6', damageType: 'fire', range: '120 ft', desc: 'Three rays (roll once per ray by reusing).', classes: ['sorcerer', 'wizard'] },
  { key: 'hold_person', name: 'Hold Person', kind: 'spell', level: 2, uses: 'action', cost: { res: 'slot2', amount: 1 }, save: { ability: 'wis', dc: 'spelldc' }, applies: ['paralyzed'], desc: 'Wis save or paralyzed (concentration, 1 minute).', classes: ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'] },
  { key: 'misty_step', name: 'Misty Step', kind: 'spell', level: 2, uses: 'bonus', cost: { res: 'slot2', amount: 1 }, desc: 'Teleport up to 30 ft.', classes: ['sorcerer', 'warlock', 'wizard'] },
  { key: 'spiritual_weapon', name: 'Spiritual Weapon', kind: 'spell', level: 2, uses: 'bonus', cost: { res: 'slot2', amount: 1 }, attack: 'spellatk', damage: '1d8+spellmod', damageType: 'force', desc: 'Floating weapon attacks as a bonus action.', classes: ['cleric'] },
  { key: 'lesser_restoration', name: 'Lesser Restoration', kind: 'spell', level: 2, uses: 'action', cost: { res: 'slot2', amount: 1 }, desc: 'End a disease or a condition on a touched creature.', classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger'] },
  { key: 'invisibility', name: 'Invisibility', kind: 'spell', level: 2, uses: 'action', cost: { res: 'slot2', amount: 1 }, applies: ['invisible'], desc: 'Target is invisible until it attacks or casts.', classes: ['bard', 'sorcerer', 'warlock', 'wizard'] },
  // ---- level 3+
  { key: 'fireball', name: 'Fireball', kind: 'spell', level: 3, uses: 'action', cost: { res: 'slot3', amount: 1 }, save: { ability: 'dex', dc: 'spelldc', half: true }, damage: '8d6', upcast: '1d6', damageType: 'fire', range: '150 ft, 20-ft radius', desc: 'Dex save, half on success. Select multiple targets.', classes: ['sorcerer', 'wizard'] },
  { key: 'lightning_bolt', name: 'Lightning Bolt', kind: 'spell', level: 3, uses: 'action', cost: { res: 'slot3', amount: 1 }, save: { ability: 'dex', dc: 'spelldc', half: true }, damage: '8d6', upcast: '1d6', damageType: 'lightning', range: '100-ft line', desc: 'Dex save, half on success.', classes: ['sorcerer', 'wizard'] },
  { key: 'revivify', name: 'Revivify', kind: 'spell', level: 3, uses: 'action', cost: { res: 'slot3', amount: 1 }, heal: '1', desc: 'Return a creature that died within the last minute to life with 1 HP.', classes: ['cleric', 'paladin', 'druid'] },
  { key: 'counterspell', name: 'Counterspell', kind: 'spell', level: 3, uses: 'reaction', cost: { res: 'slot3', amount: 1 }, desc: 'Interrupt a spell being cast within 60 ft.', classes: ['sorcerer', 'warlock', 'wizard'] },
  { key: 'fly', name: 'Fly', kind: 'spell', level: 3, uses: 'action', cost: { res: 'slot3', amount: 1 }, desc: 'Target gains a 60-ft fly speed (concentration, 10 min).', classes: ['sorcerer', 'warlock', 'wizard'] },
  { key: 'dispel_magic', name: 'Dispel Magic', kind: 'spell', level: 3, uses: 'action', cost: { res: 'slot3', amount: 1 }, desc: 'End spells on a target.', classes: ['bard', 'cleric', 'druid', 'paladin', 'sorcerer', 'warlock', 'wizard'] },
  { key: 'ice_storm', name: 'Ice Storm', kind: 'spell', level: 4, uses: 'action', cost: { res: 'slot4', amount: 1 }, save: { ability: 'dex', dc: 'spelldc', half: true }, damage: '2d8+4d6', damageType: 'cold', desc: 'Hail in a 20-ft radius.', classes: ['druid', 'sorcerer', 'wizard'] },
  { key: 'cone_of_cold', name: 'Cone of Cold', kind: 'spell', level: 5, uses: 'action', cost: { res: 'slot5', amount: 1 }, save: { ability: 'con', dc: 'spelldc', half: true }, damage: '8d8', upcast: '1d8', damageType: 'cold', range: '60-ft cone', desc: 'Con save, half on success.', classes: ['sorcerer', 'wizard'] },
  { key: 'mass_cure_wounds', name: 'Mass Cure Wounds', kind: 'spell', level: 5, uses: 'action', cost: { res: 'slot5', amount: 1 }, heal: '5d8+spellmod', desc: 'Heal up to six creatures within 30 ft.', classes: ['bard', 'cleric', 'druid'] },
  // ---- Unarmed / common
  { key: 'unarmed_strike', name: 'Unarmed Strike', kind: 'weapon', uses: 'action', attack: 'str_mod+pb', damage: '1+str_mod', damageType: 'bludgeoning', desc: 'Punch, kick, headbutt.' },
  { key: 'dodge', name: 'Dodge', kind: 'feature', uses: 'action', desc: 'Attacks against you have disadvantage until your next turn.' },
  { key: 'dash', name: 'Dash', kind: 'feature', uses: 'action', desc: 'Double your movement this turn.' },
  { key: 'help', name: 'Help', kind: 'feature', uses: 'action', desc: 'Give an ally advantage on their next check or attack.' },
  { key: 'opportunity_attack', name: 'Opportunity Attack', kind: 'weapon', uses: 'reaction', attack: 'str_mod+pb', damage: '1d6+str_mod', desc: 'Reaction when a creature leaves your reach.' },
];

const W = (key, name, dmg, type, props, price, extra = {}) => ({ key, name, type: 'weapon', price: { gp: price }, damage: dmg, damageType: type, attack: props === 'finesse' ? 'max(str_mod,dex_mod)+pb' : props === 'ranged' ? 'dex_mod+pb' : 'str_mod+pb', damageBonus: '', desc: props, equipSlot: 'hand', weight: 3, ...extra });
const mod = (props) => (props === 'finesse' ? 'max(str_mod,dex_mod)' : props === 'ranged' ? 'dex_mod' : 'str_mod');
const weapon = (key, name, dice, type, props, price, desc = '') => ({ key, name, type: 'weapon', equipSlot: 'hand', price: { gp: price }, attack: `${mod(props)}+pb`, damage: `${dice}+${mod(props)}`, damageType: type, desc: `${props}${desc ? '. ' + desc : ''}` });
const armor = (key, name, base, dexcap, price, desc) => ({ key, name, type: 'armor', equipSlot: 'body', price: { gp: price }, vars: { armorbase: base, dexcap }, desc });

const items = [
  weapon('dagger', 'Dagger', '1d4', 'piercing', 'finesse', 2, 'Light, thrown (20/60)'),
  weapon('club', 'Club', '1d4', 'bludgeoning', 'melee', 0.1, 'Light'),
  weapon('handaxe', 'Handaxe', '1d6', 'slashing', 'melee', 5, 'Light, thrown (20/60)'),
  weapon('javelin', 'Javelin', '1d6', 'piercing', 'melee', 0.5, 'Thrown (30/120)'),
  weapon('mace', 'Mace', '1d6', 'bludgeoning', 'melee', 5),
  weapon('quarterstaff', 'Quarterstaff', '1d6', 'bludgeoning', 'melee', 0.2, 'Versatile (1d8)'),
  weapon('spear', 'Spear', '1d6', 'piercing', 'melee', 1, 'Thrown (20/60), versatile (1d8)'),
  weapon('shortsword', 'Shortsword', '1d6', 'piercing', 'finesse', 10, 'Light'),
  weapon('scimitar', 'Scimitar', '1d6', 'slashing', 'finesse', 25, 'Light'),
  weapon('rapier', 'Rapier', '1d8', 'piercing', 'finesse', 25),
  weapon('longsword', 'Longsword', '1d8', 'slashing', 'melee', 15, 'Versatile (1d10)'),
  weapon('battleaxe', 'Battleaxe', '1d8', 'slashing', 'melee', 10, 'Versatile (1d10)'),
  weapon('warhammer', 'Warhammer', '1d8', 'bludgeoning', 'melee', 15, 'Versatile (1d10)'),
  weapon('morningstar', 'Morningstar', '1d8', 'piercing', 'melee', 15),
  weapon('trident', 'Trident', '1d8', 'piercing', 'melee', 5, 'Thrown (20/60)'),
  weapon('greataxe', 'Greataxe', '1d12', 'slashing', 'melee', 30, 'Heavy, two-handed'),
  weapon('greatsword', 'Greatsword', '2d6', 'slashing', 'melee', 50, 'Heavy, two-handed'),
  weapon('maul', 'Maul', '2d6', 'bludgeoning', 'melee', 10, 'Heavy, two-handed'),
  weapon('glaive', 'Glaive', '1d10', 'slashing', 'melee', 20, 'Heavy, reach'),
  weapon('shortbow', 'Shortbow', '1d6', 'piercing', 'ranged', 25, 'Range 80/320, two-handed'),
  weapon('longbow', 'Longbow', '1d8', 'piercing', 'ranged', 50, 'Range 150/600, heavy'),
  weapon('light_crossbow', 'Light Crossbow', '1d8', 'piercing', 'ranged', 25, 'Range 80/320'),
  weapon('hand_crossbow', 'Hand Crossbow', '1d6', 'piercing', 'ranged', 75, 'Range 30/120, light'),
  weapon('heavy_crossbow', 'Heavy Crossbow', '1d10', 'piercing', 'ranged', 50, 'Range 100/400, heavy'),
  weapon('sling', 'Sling', '1d4', 'bludgeoning', 'ranged', 0.1, 'Range 30/120'),
  { ...weapon('longsword_1', 'Longsword +1', '1d8', 'slashing', 'melee', 1000, 'Magic weapon'), attack: 'str_mod+pb+1', damage: '1d8+str_mod+1' },
  armor('padded', 'Padded Armor', 11, 99, 5, 'Light armor. AC 11 + Dex'),
  armor('leather', 'Leather Armor', 11, 99, 10, 'Light armor. AC 11 + Dex'),
  armor('studded_leather', 'Studded Leather', 12, 99, 45, 'Light armor. AC 12 + Dex'),
  armor('hide', 'Hide Armor', 12, 2, 10, 'Medium armor. AC 12 + Dex (max 2)'),
  armor('chain_shirt', 'Chain Shirt', 13, 2, 50, 'Medium armor. AC 13 + Dex (max 2)'),
  armor('scale_mail', 'Scale Mail', 14, 2, 50, 'Medium armor. AC 14 + Dex (max 2). Stealth disadvantage'),
  armor('breastplate', 'Breastplate', 14, 2, 400, 'Medium armor. AC 14 + Dex (max 2)'),
  armor('half_plate', 'Half Plate', 15, 2, 750, 'Medium armor. AC 15 + Dex (max 2)'),
  armor('ring_mail', 'Ring Mail', 14, 0, 30, 'Heavy armor. AC 14. Stealth disadvantage'),
  armor('chain_mail', 'Chain Mail', 16, 0, 75, 'Heavy armor. AC 16. Str 13. Stealth disadvantage'),
  armor('splint', 'Splint Armor', 17, 0, 200, 'Heavy armor. AC 17. Str 15'),
  armor('plate', 'Plate Armor', 18, 0, 1500, 'Heavy armor. AC 18. Str 15'),
  { key: 'shield', name: 'Shield', type: 'armor', equipSlot: 'offhand', price: { gp: 10 }, vars: { shield: 2 }, desc: '+2 AC' },
  { key: 'potion_healing', name: 'Potion of Healing', type: 'consumable', price: { gp: 50 }, uses: 'bonus', use: { heal: '2d4+2' }, desc: 'Regain 2d4+2 HP.' },
  { key: 'potion_greater_healing', name: 'Potion of Greater Healing', type: 'consumable', price: { gp: 150 }, uses: 'bonus', use: { heal: '4d4+4' }, desc: 'Regain 4d4+4 HP.' },
  { key: 'antitoxin', name: 'Antitoxin', type: 'consumable', price: { gp: 50 }, use: { removeStatus: 'poisoned' }, desc: 'Cures poison.' },
  { key: 'ring_protection', name: 'Ring of Protection', type: 'magic', equipSlot: 'ring', price: { gp: 3500 }, mods: [{ target: 'ac', add: 1 }, { target: 'saves', add: 1 }], desc: '+1 AC and saving throws.' },
  { key: 'cloak_protection', name: 'Cloak of Protection', type: 'magic', equipSlot: 'cloak', price: { gp: 3500 }, mods: [{ target: 'ac', add: 1 }, { target: 'saves', add: 1 }], desc: '+1 AC and saving throws.' },
  { key: 'gauntlets_ogre', name: 'Gauntlets of Ogre Power', type: 'magic', equipSlot: 'hands', price: { gp: 2000 }, mods: [{ target: 'str', add: 'max(0, 19-str)' }], desc: 'Strength becomes 19.' },
  { key: 'backpack', name: 'Backpack', type: 'gear', price: { gp: 2 } },
  { key: 'bedroll', name: 'Bedroll', type: 'gear', price: { gp: 1 } },
  { key: 'rations', name: 'Rations (1 day)', type: 'gear', price: { sp: 5 } },
  { key: 'rope', name: 'Hempen Rope (50 ft)', type: 'gear', price: { gp: 1 } },
  { key: 'torch', name: 'Torch', type: 'gear', price: { cp: 1 } },
  { key: 'thieves_tools', name: "Thieves' Tools", type: 'gear', price: { gp: 25 } },
  { key: 'healers_kit', name: "Healer's Kit", type: 'gear', price: { gp: 5 } },
  { key: 'holy_symbol', name: 'Holy Symbol', type: 'gear', price: { gp: 5 } },
  { key: 'spellbook', name: 'Spellbook', type: 'gear', price: { gp: 50 } },
  { key: 'arcane_focus', name: 'Arcane Focus', type: 'gear', price: { gp: 10 } },
  { key: 'arrows', name: 'Arrows (20)', type: 'gear', price: { gp: 1 } },
  { key: 'explorers_pack', name: "Explorer's Pack", type: 'gear', price: { gp: 10 } },
];

const species = (key, name, speed, desc, extra = {}) => ({ key, name, desc, vars: { speed, ...(extra.vars || {}) }, ...extra, vars: { speed, ...(extra.vars || {}) } });
const speciesOptions = [
  species('human', 'Human', 30, 'Resourceful (Heroic Inspiration on rests), Skillful (one extra skill), Versatile (an Origin feat).', { vars: { skillextra: 1 } }),
  species('elf', 'Elf', 30, 'Darkvision 60 ft, Fey Ancestry, Keen Senses (Perception proficiency), Trance. Choose a lineage.', { skills: ['perception'] }),
  species('dwarf', 'Dwarf', 30, 'Darkvision 120 ft, Dwarven Resilience (poison), Dwarven Toughness (+1 HP per level), Stonecunning.', { mods: [{ target: 'max:hp', add: 'level' }] }),
  species('halfling', 'Halfling', 30, 'Brave, Halfling Nimbleness, Luck (reroll natural 1s), Naturally Stealthy.'),
  species('gnome', 'Gnome', 30, 'Darkvision 60 ft, Gnomish Cunning (advantage on INT/WIS/CHA saves). Choose a lineage.'),
  species('dragonborn', 'Dragonborn', 30, 'Draconic Ancestry, Breath Weapon, Damage Resistance, Darkvision 60 ft.'),
  species('goliath', 'Goliath', 35, 'Giant Ancestry, Large Form, Powerful Build.'),
  species('orc', 'Orc', 30, 'Adrenaline Rush, Darkvision 120 ft, Relentless Endurance.'),
  species('tiefling', 'Tiefling', 30, 'Darkvision 60 ft, Fiendish Legacy, Otherworldly Presence.'),
];

const bg = (key, name, from, skills, desc, feat, items = [], gold = 50) => ({ key, name, desc: `${desc} Origin feat: ${feat}.`, skills, asi: { from, patterns: [[2, 1], [1, 1, 1]] }, items, currency: { gp: gold } });
const backgrounds = [
  bg('acolyte', 'Acolyte', ['int', 'wis', 'cha'], ['insight', 'religion'], 'Raised in service to a temple.', 'Magic Initiate (Cleric)', [{ ref: 'holy_symbol', qty: 1 }], 8),
  bg('criminal', 'Criminal', ['dex', 'con', 'int'], ['sleight_of_hand', 'stealth'], 'Lived by breaking the law.', 'Alert', [{ ref: 'dagger', qty: 2 }, { ref: 'thieves_tools', qty: 1 }], 16),
  bg('sage', 'Sage', ['con', 'int', 'wis'], ['arcana', 'history'], 'Scholar of lore and mystery.', 'Magic Initiate (Wizard)', [{ ref: 'quarterstaff', qty: 1 }], 8),
  bg('soldier', 'Soldier', ['str', 'dex', 'con'], ['athletics', 'intimidation'], 'Trained in war.', 'Savage Attacker', [{ ref: 'spear', qty: 1 }, { ref: 'shortbow', qty: 1 }, { ref: 'arrows', qty: 1 }], 14),
];

const cls = (key, name, hitdie, saves, pick, from, o = {}) => ({ key, name, desc: o.desc || '', saves, skillCount: pick, skillChoices: from, vars: { hitdie, skillcount: pick, caster: o.caster ? 1 : 0, slotlvl: o.slotlvl || 0, pactlvl: o.pact ? 'level' : 0, spellmod: o.spell || 0, ...(o.vars || {}) }, items: o.items || [], actions: o.actions || [], currency: o.gold ? { gp: o.gold } : undefined });
const classes = [
  cls('barbarian', 'Barbarian', 12, ['str', 'con'], 2, ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'], { desc: 'd12 · Rage, Unarmored Defense, Reckless Attack.', items: [{ ref: 'greataxe', qty: 1, equipped: true }, { ref: 'handaxe', qty: 2 }, { ref: 'javelin', qty: 4 }, { ref: 'explorers_pack', qty: 1 }], actions: ['rage'], gold: 15 }),
  cls('bard', 'Bard', 8, ['dex', 'cha'], 3, ALLSK, { desc: 'd8 · Bardic Inspiration, Spellcasting (CHA).', caster: 1, slotlvl: 'level', spell: 'cha_mod', items: [{ ref: 'leather', qty: 1, equipped: true }, { ref: 'dagger', qty: 2, equipped: true }], actions: ['bardic_inspiration', 'vicious_mockery', 'healing_word'], gold: 19 }),
  cls('cleric', 'Cleric', 8, ['wis', 'cha'], 2, ['history', 'insight', 'medicine', 'persuasion', 'religion'], { desc: 'd8 · Spellcasting (WIS), Divine Order.', caster: 1, slotlvl: 'level', spell: 'wis_mod', items: [{ ref: 'chain_shirt', qty: 1, equipped: true }, { ref: 'shield', qty: 1, equipped: true }, { ref: 'mace', qty: 1, equipped: true }, { ref: 'holy_symbol', qty: 1 }], actions: ['sacred_flame', 'cure_wounds', 'guiding_bolt', 'channel_divinity'], gold: 7 }),
  cls('druid', 'Druid', 8, ['int', 'wis'], 2, ['arcana', 'animal_handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'], { desc: 'd8 · Spellcasting (WIS), Wild Shape.', caster: 1, slotlvl: 'level', spell: 'wis_mod', items: [{ ref: 'leather', qty: 1, equipped: true }, { ref: 'shield', qty: 1, equipped: true }, { ref: 'quarterstaff', qty: 1, equipped: true }], actions: ['produce_flame', 'cure_wounds', 'entangle', 'wild_shape'], gold: 9 }),
  cls('fighter', 'Fighter', 10, ['str', 'con'], 2, ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'persuasion', 'perception', 'survival'], { desc: 'd10 · Fighting Style, Second Wind, Weapon Mastery.', items: [{ ref: 'chain_mail', qty: 1, equipped: true }, { ref: 'longsword', qty: 1, equipped: true }, { ref: 'shield', qty: 1, equipped: true }, { ref: 'light_crossbow', qty: 1 }], actions: ['second_wind'], gold: 4 }),
  cls('monk', 'Monk', 8, ['str', 'dex'], 2, ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'], { desc: 'd8 · Martial Arts, Unarmored Defense, Focus.', items: [{ ref: 'spear', qty: 1 }, { ref: 'dagger', qty: 5 }], actions: ['flurry_of_blows'], gold: 11, vars: { monkdef: 1 } }),
  cls('paladin', 'Paladin', 10, ['wis', 'cha'], 2, ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'], { desc: 'd10 · Lay On Hands, Spellcasting (CHA), Weapon Mastery.', caster: 1, slotlvl: 'ceil(level/2)', spell: 'cha_mod', items: [{ ref: 'chain_mail', qty: 1, equipped: true }, { ref: 'shield', qty: 1, equipped: true }, { ref: 'longsword', qty: 1, equipped: true }, { ref: 'javelin', qty: 6 }, { ref: 'holy_symbol', qty: 1 }], actions: ['lay_on_hands', 'channel_divinity'], gold: 9 }),
  cls('ranger', 'Ranger', 10, ['str', 'dex'], 3, ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'], { desc: 'd10 · Spellcasting (WIS), Favored Enemy, Weapon Mastery.', caster: 1, slotlvl: 'ceil(level/2)', spell: 'wis_mod', items: [{ ref: 'studded_leather', qty: 1, equipped: true }, { ref: 'longbow', qty: 1, equipped: true }, { ref: 'shortsword', qty: 2 }, { ref: 'arrows', qty: 2 }], actions: ['hunters_mark', 'cure_wounds'], gold: 7 }),
  cls('rogue', 'Rogue', 8, ['dex', 'int'], 4, ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'persuasion', 'sleight_of_hand', 'stealth'], { desc: 'd8 · Expertise, Sneak Attack, Thieves\' Cant.', items: [{ ref: 'leather', qty: 1, equipped: true }, { ref: 'shortsword', qty: 1, equipped: true }, { ref: 'dagger', qty: 2 }, { ref: 'shortbow', qty: 1 }, { ref: 'thieves_tools', qty: 1 }], actions: ['sneak_attack'], gold: 8 }),
  cls('sorcerer', 'Sorcerer', 6, ['con', 'cha'], 2, ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'], { desc: 'd6 · Innate Sorcery, Spellcasting (CHA).', caster: 1, slotlvl: 'level', spell: 'cha_mod', items: [{ ref: 'spear', qty: 1 }, { ref: 'dagger', qty: 2 }, { ref: 'arcane_focus', qty: 1 }], actions: ['fire_bolt', 'magic_missile', 'burning_hands', 'font_of_magic'], gold: 28 }),
  cls('warlock', 'Warlock', 8, ['wis', 'cha'], 2, ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'], { desc: 'd8 · Eldritch Invocations, Pact Magic (CHA).', caster: 1, pact: 1, spell: 'cha_mod', items: [{ ref: 'leather', qty: 1, equipped: true }, { ref: 'dagger', qty: 2 }, { ref: 'arcane_focus', qty: 1 }], actions: ['eldritch_blast', 'eldritch_invocations'], gold: 15 }),
  cls('wizard', 'Wizard', 6, ['int', 'wis'], 2, ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'], { desc: 'd6 · Spellbook, Ritual Adept, Arcane Recovery.', caster: 1, slotlvl: 'level', spell: 'int_mod', items: [{ ref: 'quarterstaff', qty: 1 }, { ref: 'dagger', qty: 1 }, { ref: 'spellbook', qty: 1 }, { ref: 'arcane_focus', qty: 1 }], actions: ['fire_bolt', 'magic_missile', 'shield', 'mage_armor', 'arcane_recovery'], gold: 5 }),
];
// numeric vars that are formulas must be strings: fix up caster fields
for (const c of classes) { const v = c.vars; if (v.slotlvl === 0) v.slotlvl = 0; if (v.pactlvl === 0) v.pactlvl = 0; }

const ST = (key, name, desc, o = {}) => ({ key, name, desc, ...o });
const statuses = [
  ST('blinded', 'Blinded', 'Fails sight checks; attacks against have advantage, its attacks have disadvantage.', { rollMods: { attack: 'dis' } }),
  ST('charmed', 'Charmed', 'Cannot attack the charmer; charmer has advantage on social checks.'),
  ST('deafened', 'Deafened', 'Cannot hear; fails hearing checks.'),
  ST('frightened', 'Frightened', 'Disadvantage on ability checks and attacks while the source is in sight.', { rollMods: { attack: 'dis', check: 'dis' } }),
  ST('grappled', 'Grappled', 'Speed 0.', { blocks: ['move'] }),
  ST('incapacitated', 'Incapacitated', 'Cannot take actions, bonus actions or reactions.', { blocks: ['action', 'bonus', 'reaction'] }),
  ST('invisible', 'Invisible', 'Advantage on attacks; attacks against have disadvantage.', { rollMods: { attack: 'adv' } }),
  ST('paralyzed', 'Paralyzed', 'Incapacitated, speed 0; auto-fails Str/Dex saves; hits within 5 ft are critical.', { blocks: ['action', 'bonus', 'reaction', 'move'] }),
  ST('petrified', 'Petrified', 'Turned to stone: incapacitated, speed 0.', { blocks: ['action', 'bonus', 'reaction', 'move'] }),
  ST('poisoned', 'Poisoned', 'Disadvantage on attack rolls and ability checks.', { rollMods: { attack: 'dis', check: 'dis' } }),
  ST('prone', 'Prone', 'Disadvantage on attacks; melee attacks against you have advantage. Standing costs half your speed.', { rollMods: { attack: 'dis' } }),
  ST('restrained', 'Restrained', 'Speed 0; attack rolls against have advantage; disadvantage on Dex saves.', { blocks: ['move'], rollMods: { attack: 'dis' } }),
  ST('stunned', 'Stunned', 'Incapacitated, speed 0, fails Str/Dex saves.', { blocks: ['action', 'bonus', 'reaction', 'move'] }),
  ST('unconscious', 'Unconscious', 'Incapacitated, prone, unaware.', { blocks: ['action', 'bonus', 'reaction', 'move'] }),
  ST('raging', 'Raging', 'Advantage on Strength checks and saves; +2 melee damage; resistance to B/P/S.', { tags: ['buff'] }),
  ST('blessed', 'Blessed', 'Adds 1d4 to attack rolls and saving throws.', { tags: ['buff'] }),
  ST('burning', 'Burning (house)', 'Takes 1d6 fire damage at the start of each turn.', { tick: { res: 'hp', amount: '-1d6', when: 'turnStart', type: 'fire' }, defaultTurns: 3 }),
  ST('poison_dot', 'Venom (house)', 'Takes 1d4 poison damage at the start of each turn.', { tick: { res: 'hp', amount: '-1d4', when: 'turnStart', type: 'poison' }, defaultTurns: 3 }),
  ST('regenerating', 'Regenerating (house)', 'Regains 3 HP at the start of each turn.', { tick: { res: 'hp', amount: '3', when: 'turnStart' }, defaultTurns: 3, tags: ['buff'] }),
];

const N = (key, name, cr, align, ab, ac, hp, speed, acts, desc = '', extra = {}) => {
  const [str, dex, con, int, wis, cha] = ab;
  return { key, name, cr, alignment: align, recLevel: typeof cr === 'number' ? Math.max(1, Math.ceil(cr)) : 1, desc, abilities: { str, dex, con, int, wis, cha }, fixed: { derived: { ac, speed }, resourceMax: { hp } }, actions: acts, icon: extra.icon || '👹', color: extra.color || '#b04040', level: Math.max(1, Math.ceil(typeof cr === 'number' ? cr : 1)) };
};
const atk = (name, bonus, dmg, type, desc = '', o = {}) => ({ name, kind: 'weapon', uses: 'action', attack: String(bonus), damage: dmg, damageType: type, desc, ...o });
const npcs = [
  N('commoner', 'Commoner', 0, 'Any', [10, 10, 10, 10, 10, 10], 10, 4, 30, [atk('Club', 2, '1d4', 'bludgeoning')], 'A farmer, laborer or villager.', { icon: '🧑', color: '#8a8a60' }),
  N('giant_rat', 'Giant Rat', 0.125, 'Unaligned', [7, 15, 11, 2, 10, 4], 12, 7, 30, [atk('Bite', 4, '1d4+2', 'piercing')], 'Keen smell.', { icon: '🐀', color: '#7a6a5a' }),
  N('kobold', 'Kobold', 0.125, 'Lawful Evil', [7, 15, 9, 8, 7, 8], 14, 7, 30, [atk('Dagger', 4, '1d4+2', 'piercing')], 'Pack tactics.', { icon: '🦎', color: '#a05a30' }),
  N('goblin', 'Goblin Warrior', 0.25, 'Chaotic Evil', [8, 15, 10, 10, 8, 8], 15, 10, 30, [atk('Scimitar', 4, '1d6+2', 'slashing'), atk('Shortbow', 4, '1d6+2', 'piercing', 'Range 80/320')], 'Nimble Escape: Disengage or Hide as a bonus action.', { icon: '👺', color: '#4a8a3a' }),
  N('skeleton', 'Skeleton', 0.25, 'Lawful Evil', [10, 16, 15, 6, 8, 5], 14, 13, 30, [atk('Shortsword', 5, '1d6+3', 'piercing'), atk('Shortbow', 5, '1d6+3', 'piercing', 'Range 80/320')], 'Vulnerable to bludgeoning; immune to poison.', { icon: '💀', color: '#c8c8b0' }),
  N('zombie', 'Zombie', 0.25, 'Neutral Evil', [13, 6, 16, 3, 6, 5], 8, 15, 20, [atk('Slam', 3, '1d6+1', 'bludgeoning')], 'Undead Fortitude.', { icon: '🧟', color: '#5a7a4a' }),
  N('wolf', 'Wolf', 0.25, 'Unaligned', [14, 15, 12, 3, 12, 6], 13, 11, 40, [atk('Bite', 4, '1d6+2', 'piercing', 'Target must succeed on a DC 11 Str save or be knocked prone.')], 'Pack Tactics.', { icon: '🐺', color: '#8a8a8a' }),
  N('bandit', 'Bandit', 0.125, 'Any non-lawful', [11, 12, 12, 10, 10, 10], 12, 11, 30, [atk('Scimitar', 3, '1d6+1', 'slashing'), atk('Light Crossbow', 3, '1d8+1', 'piercing', 'Range 80/320')], '', { icon: '🗡️', color: '#6a5a4a' }),
  N('cultist', 'Cultist', 0.125, 'Any non-good', [11, 12, 10, 10, 11, 10], 12, 9, 30, [atk('Scimitar', 3, '1d6+1', 'slashing')], 'Dark Devotion.', { icon: '🕯️', color: '#703070' }),
  N('guard', 'Guard', 0.125, 'Any', [13, 12, 12, 10, 11, 10], 16, 11, 30, [atk('Spear', 3, '1d6+1', 'piercing')], '', { icon: '🛡️', color: '#5a6a8a' }),
  N('orc', 'Orc Warrior', 0.5, 'Chaotic Evil', [16, 12, 16, 7, 11, 10], 13, 15, 30, [atk('Greataxe', 5, '1d12+3', 'slashing'), atk('Javelin', 5, '1d6+3', 'piercing', 'Range 30/120')], 'Aggressive: bonus-action dash toward an enemy.', { icon: '🪓', color: '#4a6a3a' }),
  N('giant_spider', 'Giant Spider', 1, 'Unaligned', [14, 16, 12, 2, 11, 4], 14, 26, 30, [atk('Bite', 5, '1d8+3', 'piercing', 'Plus 2d8 poison (DC 11 Con save for half).')], 'Spider Climb, Web Walker.', { icon: '🕷️', color: '#3a3a3a' }),
  N('ghoul', 'Ghoul', 1, 'Chaotic Evil', [13, 15, 10, 7, 10, 6], 12, 22, 30, [atk('Bite', 2, '2d6+2', 'piercing'), atk('Claws', 4, '2d4+2', 'slashing', 'DC 10 Con save or paralyzed 1 minute.', { applies: ['paralyzed'], save: { ability: 'con', dc: '10' } })], '', { icon: '🧛', color: '#6a8a6a' }),
  N('brown_bear', 'Brown Bear', 1, 'Unaligned', [19, 10, 16, 2, 13, 7], 11, 34, 40, [atk('Bite', 6, '1d8+4', 'piercing'), atk('Claws', 6, '1d6+4', 'slashing')], 'Multiattack: one bite and one claw.', { icon: '🐻', color: '#7a5a3a' }),
  N('ogre', 'Ogre', 2, 'Chaotic Evil', [19, 8, 16, 5, 7, 7], 11, 59, 40, [atk('Greatclub', 6, '2d8+4', 'bludgeoning'), atk('Javelin', 6, '2d6+4', 'piercing', 'Range 30/120')], '', { icon: '👹', color: '#8a7a4a' }),
  N('owlbear', 'Owlbear', 3, 'Unaligned', [20, 12, 17, 3, 12, 7], 13, 59, 40, [atk('Rend', 7, '1d10+5', 'slashing', 'Multiattack: two Rend attacks.')], 'Keen Sight and Smell.', { icon: '🦉', color: '#6a5a4a' }),
  N('troll', 'Troll', 5, 'Chaotic Evil', [18, 13, 20, 7, 9, 7], 15, 94, 30, [atk('Bite', 7, '1d6+4', 'piercing'), atk('Rend', 7, '2d6+4', 'slashing')], 'Regeneration: regains HP each turn unless it takes acid/fire damage.', { icon: '🧌', color: '#4a7a4a' }),
  N('mage', 'Mage', 6, 'Any', [9, 14, 11, 17, 12, 11], 15, 81, 30, [atk('Arcane Burst', 6, '3d8+3', 'force', 'Ranged spell attack, 120 ft.'), { name: 'Fireball', kind: 'spell', uses: 'action', save: { ability: 'dex', dc: '14', half: true }, damage: '8d6', damageType: 'fire', range: '150 ft', desc: 'Dex DC 14 for half.' }], 'Spellcaster (INT).', { icon: '🧙', color: '#4a5aa0' }),
  N('veteran', 'Veteran', 3, 'Any', [16, 13, 14, 10, 11, 10], 17, 58, 30, [atk('Longsword', 5, '1d8+3', 'slashing'), atk('Heavy Crossbow', 3, '1d10+1', 'piercing')], 'Two attacks per action.', { icon: '⚔️', color: '#5a5a7a' }),
  N('young_red_dragon', 'Young Red Dragon', 10, 'Chaotic Evil', [23, 10, 21, 14, 11, 19], 18, 178, 40, [atk('Rend', 10, '2d6+6', 'slashing'), { name: 'Fire Breath', kind: 'feature', uses: 'action', save: { ability: 'dex', dc: '17', half: true }, damage: '16d6', damageType: 'fire', range: '30-ft cone', desc: 'Recharge 5-6.' }], 'Fly 80 ft, climb 40 ft.', { icon: '🐉', color: '#c03020' }),
];

module.exports = {
  id: 'dnd5e', name: 'D&D 5.5e (2024 SRD 5.2)', short: 'D&D 5.5e',
  desc: 'The 2024 revision of the world\'s most popular fantasy RPG. d20 + modifiers, attributes, 12 classes, spells, conditions.',
  rollSystem: 'd20', crit: { max: 20, min: 1 },
  grid: { unit: 'ft', cell: 5, distance: 'chebyshev' },
  currency: [{ key: 'pp', name: 'PP' }, { key: 'gp', name: 'GP' }, { key: 'sp', name: 'SP' }, { key: 'cp', name: 'CP' }],
  abilities, abilityMod: 'floor((score-10)/2)',
  varDefaults: { skillextra: 0, hitdie: 8, speed: 30, armorbase: 0, dexcap: 99, shield: 0, caster: 0, slotlvl: 0, pactlvl: 0, spellmod: 0, monkdef: 0 },
  derived: [
    { key: 'pb', name: 'Proficiency Bonus', formula: '2+floor((level-1)/4)', fmt: '+' },
    { key: 'ac', name: 'Armor Class', formula: 'if(armorbase>0, armorbase+min(dex_mod,dexcap), 10+dex_mod+if(monkdef,wis_mod,0))+shield' },
    { key: 'speed', name: 'Speed', formula: 'speed', unit: 'ft' },
    { key: 'init', name: 'Initiative', formula: 'dex_mod', fmt: '+' },
    { key: 'spellatk', name: 'Spell Attack', formula: 'pb+spellmod', fmt: '+', show: 'caster' },
    { key: 'spelldc', name: 'Spell Save DC', formula: '8+pb+spellmod', show: 'caster' },
    { key: 'passive', name: 'Passive Perception', formula: '10+s_perception', late: true },
  ],
  skillFormula: 'abil + prof*pb', skills: skillDefs, skillMode: 'prof',
  saveFormula: 'abil + proficient*pb', saves: abilities.map((a) => ({ key: a.key, name: a.name, ability: a.key })),
  resources, tables: { slots, pact },
  initiative: { roll: 'd20', stat: 'init' },
  combat: { defense: 'ac', hp: 'hp', temp: 'temp', autoResolve: true, critMode: 'dice', weaponUses: 'action', moveStat: 'speed', hideNpcStats: true,
    turn: [{ key: 'action', name: 'Action', count: 1 }, { key: 'bonus', name: 'Bonus', count: 1 }, { key: 'reaction', name: 'Reaction', count: 1 }] },
  creation: {
    startLevel: 1, abilityMethods: ['standard', 'pointbuy', 'roll', 'manual'], standardArray: [15, 14, 13, 12, 10, 8], pointBuy: { budget: 27, min: 8, max: 15, cost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } },
    steps: ['basics', 'class', 'species', 'background', 'abilities', 'skills', 'equipment', 'actions', 'review'],
    skillBudget: 'skillcount+skillextra', skillBudgetLabel: 'Class skill choices (backgrounds add two more)', startItemsFromOptions: true,
  },
  choices: [
    { key: 'class', name: 'Class', required: true, options: classes },
    { key: 'species', name: 'Species', required: true, options: speciesOptions },
    { key: 'background', name: 'Background', required: true, options: backgrounds },
  ],
  items, actions, statuses, npcs,
  alignments: ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'],
  tabs: [
    { id: 'shop', name: 'Shop', icon: '🛒', type: 'shop' },
    { id: 'quests', name: 'Quests', icon: '📜', type: 'quests' },
  ],
  customLogName: 'Gifts & Trade',
  extraDerived: [],
};
