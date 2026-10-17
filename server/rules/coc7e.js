'use strict';
// Call of Cthulhu 7th Edition mechanics (percentile roll-under). Starter content: skills, weapons, occupations and approximate creatures.
const C = (k, n, roll) => ({ key: k, name: n, abbr: k.toUpperCase(), default: 50, roll });
const abilities = [
  C('str', 'Strength', '3d6*5'), C('con', 'Constitution', '3d6*5'), C('siz', 'Size', '(2d6+6)*5'), C('dex', 'Dexterity', '3d6*5'),
  C('app', 'Appearance', '3d6*5'), C('int', 'Intelligence', '(2d6+6)*5'), C('pow', 'Power', '3d6*5'), C('edu', 'Education', '(2d6+6)*5'), C('luck', 'Luck', '3d6*5'),
];
const sk = (key, name, base, group) => ({ key, name, base, group });
const skills = [
  sk('accounting', 'Accounting', 5), sk('anthropology', 'Anthropology', 1), sk('appraise', 'Appraise', 5), sk('archaeology', 'Archaeology', 1), sk('art_craft', 'Art/Craft', 5),
  sk('charm', 'Charm', 15), sk('climb', 'Climb', 20), sk('credit', 'Credit Rating', 0), sk('mythos', 'Cthulhu Mythos', 0), sk('disguise', 'Disguise', 5),
  sk('dodge', 'Dodge', 'floor(dex/2)'), sk('drive', 'Drive Auto', 20), sk('elec_repair', 'Electrical Repair', 10), sk('fast_talk', 'Fast Talk', 5),
  sk('brawl', 'Fighting (Brawl)', 25), sk('handgun', 'Firearms (Handgun)', 20), sk('rifle', 'Firearms (Rifle/Shotgun)', 25), sk('first_aid', 'First Aid', 30),
  sk('history', 'History', 5), sk('intimidate', 'Intimidate', 15), sk('jump', 'Jump', 20), sk('lang_other', 'Language (Other)', 1), sk('lang_own', 'Language (Own)', 'edu'),
  sk('law', 'Law', 5), sk('library', 'Library Use', 20), sk('listen', 'Listen', 20), sk('locksmith', 'Locksmith', 1), sk('mech_repair', 'Mechanical Repair', 10),
  sk('medicine', 'Medicine', 1), sk('natural_world', 'Natural World', 10), sk('navigate', 'Navigate', 10), sk('occult', 'Occult', 5), sk('hv_machinery', 'Operate Heavy Machinery', 1),
  sk('persuade', 'Persuade', 10), sk('pilot', 'Pilot', 1), sk('psychology', 'Psychology', 10), sk('psychoanalysis', 'Psychoanalysis', 1), sk('ride', 'Ride', 5),
  sk('science', 'Science', 1), sk('sleight', 'Sleight of Hand', 10), sk('spot', 'Spot Hidden', 25), sk('stealth', 'Stealth', 20), sk('survival', 'Survival', 10),
  sk('swim', 'Swim', 20), sk('throw', 'Throw', 20), sk('track', 'Track', 10),
];
const occ = (key, name, pts, creditMin, creditMax, skillKeys, desc) => ({ key, name, desc: `${desc} Credit Rating ${creditMin}-${creditMax}.`, vars: { occpts: pts, crmin: creditMin, crmax: creditMax }, classSkills: skillKeys, skillChoices: skillKeys });
const occupations = [
  occ('antiquarian', 'Antiquarian', 'edu*4', 30, 70, ['appraise', 'art_craft', 'history', 'library', 'lang_other', 'navigate', 'spot', 'charm'], 'Collector and dealer of relics.'),
  occ('doctor', 'Doctor of Medicine', 'edu*4', 30, 80, ['first_aid', 'lang_other', 'medicine', 'psychology', 'science', 'psychoanalysis', 'persuade'], 'Physician or surgeon.'),
  occ('journalist', 'Journalist', 'edu*4', 9, 30, ['art_craft', 'history', 'library', 'lang_own', 'psychology', 'charm', 'persuade', 'fast_talk'], 'Investigative reporter.'),
  occ('police_detective', 'Police Detective', 'edu*2+max(dex,str)*2', 20, 50, ['art_craft', 'disguise', 'law', 'listen', 'psychology', 'spot', 'brawl', 'handgun'], 'Plainclothes investigator.'),
  occ('private_investigator', 'Private Investigator', 'edu*2+max(dex,str)*2', 9, 30, ['art_craft', 'disguise', 'law', 'library', 'psychology', 'spot', 'locksmith', 'fast_talk'], 'Hired to find the truth.'),
  occ('professor', 'Professor', 'edu*4', 20, 70, ['library', 'lang_other', 'lang_own', 'psychology', 'history', 'science', 'persuade'], 'University academic.'),
  occ('criminal', 'Criminal', 'edu*2+max(dex,str)*2', 5, 65, ['art_craft', 'disguise', 'locksmith', 'psychology', 'sleight', 'stealth', 'spot', 'handgun'], 'Lives outside the law.'),
  occ('clergy', 'Member of the Clergy', 'edu*4', 9, 60, ['accounting', 'history', 'library', 'listen', 'lang_other', 'psychology', 'persuade'], 'Priest, minister or monk.'),
  occ('soldier', 'Soldier', 'edu*2+max(dex,str)*2', 9, 30, ['climb', 'dodge', 'brawl', 'rifle', 'first_aid', 'stealth', 'survival', 'swim'], 'Trained combatant.'),
  occ('dilettante', 'Dilettante', 'edu*2+app*2', 50, 99, ['art_craft', 'handgun', 'lang_other', 'ride', 'charm', 'persuade', 'history'], 'Independently wealthy.'),
  occ('author', 'Author', 'edu*4', 9, 30, ['art_craft', 'history', 'library', 'lang_own', 'natural_world', 'occult', 'psychology'], 'Writer of fiction or fact.'),
  occ('occultist', 'Occultist', 'edu*4', 9, 65, ['anthropology', 'history', 'library', 'lang_other', 'occult', 'science', 'psychology'], 'Scholar of the arcane.'),
];
const age = [{ key: 'young', name: 'Age 15–39', desc: 'Typical investigator.' }, { key: 'mature', name: 'Age 40–49', desc: '−5 from STR/CON/DEX, −5 APP, EDU improvement check (DM).', mods: [{ target: 'str', add: -2 }, { target: 'dex', add: -3 }, { target: 'app', add: -5 }] }, { key: 'older', name: 'Age 50+', desc: 'Heavy physical penalties; EDU improvement checks (DM).', mods: [{ target: 'str', add: -5 }, { target: 'con', add: -5 }, { target: 'dex', add: -5 }, { target: 'app', add: -10 }] }];

const w = (key, name, skill, dmg, desc, price = 10, extra = {}) => ({ key, name, type: 'weapon', equipSlot: 'hand', price: { usd: price }, attack: 's_' + skill, damage: dmg, damageType: 'physical', desc, uses: 'action', ...extra });
const DB = 'if(db>0,dice(1,db),db)';
const items = [
  w('fist', 'Fists / Brawl', 'brawl', `1d3+${DB}`, 'Unarmed attack.', 0),
  w('knife', 'Knife (small)', 'brawl', `1d4+${DB}`, 'Impaling on extreme success.', 4),
  w('club', 'Club / Cudgel', 'brawl', `1d6+${DB}`, 'Heavy stick.', 2),
  w('bat', 'Baseball Bat', 'brawl', `1d8+${DB}`, 'Large club.', 6),
  w('axe', 'Hatchet / Axe', 'brawl', `1d6+1+${DB}`, 'Chopping weapon.', 6),
  w('machete', 'Machete', 'brawl', `1d8+${DB}`, 'Long blade.', 15),
  w('revolver38', '.38 Revolver', 'handgun', '1d10', '1 shot/round, malfunction 100. Range 15 yds.', 35),
  w('auto45', '.45 Automatic', 'handgun', '1d10+2', '1 shot/round. Range 15 yds.', 40),
  w('rifle3006', '.30-06 Bolt-Action Rifle', 'rifle', '2d6+4', '1 shot/round. Range 110 yds.', 75),
  w('shotgun12', '12-Gauge Shotgun (double)', 'rifle', '4d6/2d6/1d6', 'Damage falls with range (shown: 4d6).', 40, { damage: '4d6' }),
  { key: 'first_aid_kit', name: 'First Aid Kit', type: 'gear', price: { usd: 10 }, desc: 'Aids First Aid rolls.' },
  { key: 'flashlight', name: 'Flashlight', type: 'gear', price: { usd: 2 } },
  { key: 'lantern', name: 'Oil Lantern', type: 'gear', price: { usd: 3 } },
  { key: 'camera', name: 'Camera', type: 'gear', price: { usd: 12 } },
  { key: 'notebook', name: 'Notebook & Pencils', type: 'gear', price: { usd: 1 } },
  { key: 'pocket_watch', name: 'Pocket Watch', type: 'gear', price: { usd: 5 } },
  { key: 'whiskey', name: 'Flask of Whiskey', type: 'consumable', price: { usd: 2 }, use: { restore: { res: 'mp', amount: '1' } }, desc: 'Steadies the nerves (+1 MP).' },
  { key: 'bandages', name: 'Bandages', type: 'consumable', price: { usd: 1 }, use: { heal: '1d3' }, desc: 'Heals 1d3 HP.' },
  { key: 'elder_sign', name: 'Elder Sign Pendant', type: 'magic', equipSlot: 'neck', price: { usd: 0 }, mods: [{ target: 'max:san', add: 0 }], desc: 'A protective sigil. Effects at the Keeper\'s discretion.' },
];
const actions = [
  { key: 'dodge_a', name: 'Dodge (reaction)', kind: 'feature', uses: 'reaction', attack: 's_dodge', desc: 'Roll Dodge against an incoming melee attack.' },
  { key: 'fight_back', name: 'Fight Back', kind: 'feature', uses: 'reaction', attack: 's_brawl', damage: `1d3+${DB}`, desc: 'Opposed Fighting roll when attacked in melee.' },
  { key: 'first_aid_a', name: 'First Aid', kind: 'feature', uses: 'action', attack: 's_first_aid', heal: '1', desc: 'On success heal 1 HP; stabilises the dying.' },
  { key: 'push', name: 'Pushed Roll', kind: 'feature', uses: null, desc: 'Retry a failed skill roll with a stated consequence for failure.' },
  { key: 'spell_contact', name: 'Mythos Spell (generic)', kind: 'spell', uses: 'action', cost: { res: 'mp', amount: 5 }, desc: 'Spend MP (and Sanity) as the spell dictates.' },
  { key: 'sanity_loss', name: 'Sanity Loss (1d4)', kind: 'feature', uses: null, desc: 'Lose 1d4 Sanity — DM rolls via the log.' },
];
const statuses = [
  { key: 'major_wound', name: 'Major Wound', desc: 'Lost half or more max HP in a single blow. Make a CON roll or fall unconscious.' },
  { key: 'unconscious', name: 'Unconscious', desc: 'Out cold.', blocks: ['action', 'reaction', 'move'] },
  { key: 'dying', name: 'Dying', desc: 'At 0 HP with a major wound. CON roll each round or die.', blocks: ['action', 'reaction', 'move'] },
  { key: 'bleeding', name: 'Bleeding (house)', desc: 'Loses 1 HP each round until treated.', tick: { res: 'hp', amount: '-1', when: 'turnStart', type: 'bleed' } },
  { key: 'temp_insane', name: 'Temporarily Insane', desc: 'Bout of madness. Keeper controls the investigator.', blocks: ['action'] },
  { key: 'indef_insane', name: 'Indefinitely Insane', desc: 'Lost 5+ Sanity in one hour; subject to underlying insanity.' },
  { key: 'pinned', name: 'Pinned / Held', desc: 'Cannot move.', blocks: ['move'] },
  { key: 'prone', name: 'Prone', desc: 'On the ground; penalty die to Dodge.', rollMods: { check: 'dis' } },
  { key: 'bonus_aim', name: 'Aiming (bonus die)', desc: 'Took a round to aim; gets a bonus die on the next attack.', rollMods: { attack: 'adv' }, tags: ['buff'] },
];
const N = (key, name, desc, ab, hp, db, move, acts, icon, color, san) => ({
  key, name, desc: desc + (san ? ` Sanity loss ${san}.` : ''), alignment: 'Hostile', recLevel: 1, level: 1, abilities: ab,
  fixed: { derived: { move, db }, resourceMax: { hp } }, actions: acts, icon, color,
});
const at = (name, skill, dmg, desc = '') => ({ name, kind: 'weapon', uses: 'action', attack: String(skill), damage: dmg, desc });
const npcs = [
  N('cultist', 'Cultist', 'A hooded devotee of a forbidden god.', { str: 60, con: 55, siz: 60, dex: 55, app: 45, int: 55, pow: 55, edu: 50, luck: 50 }, 11, 0, 8, [at('Brawl', 50, '1d3'), at('Knife', 50, '1d4'), at('.38 Revolver', 40, '1d10')], '🕯️', '#703070'),
  N('thug', 'Thug', 'Hired muscle.', { str: 70, con: 60, siz: 65, dex: 50, app: 40, int: 40, pow: 40, edu: 30, luck: 50 }, 12, 1, 8, [at('Brawl', 60, '1d3+1d4'), at('Club', 55, '1d6+1d4')], '🥊', '#7a5a4a'),
  N('guard_dog', 'Guard Dog', 'A trained attack dog.', { str: 55, con: 60, siz: 45, dex: 70, app: 0, int: 20, pow: 50, edu: 0, luck: 50 }, 10, 0, 12, [at('Bite', 40, '1d6')], '🐕', '#8a6a4a'),
  N('zombie', 'Reanimated Corpse', 'A shambling dead thing.', { str: 80, con: 80, siz: 60, dex: 30, app: 0, int: 0, pow: 5, edu: 0, luck: 0 }, 14, 1, 7, [at('Grapple/Strike', 30, '1d8+1d4')], '🧟', '#5a7a4a', '1/1d8'),
  N('ghoul', 'Ghoul', 'Carrion-eating subterranean horror. (approximate stats)', { str: 85, con: 80, siz: 65, dex: 60, app: 0, int: 70, pow: 70, edu: 0, luck: 0 }, 14, 1, 9, [at('Claw', 30, '1d6+1d4'), at('Bite', 30, '1d6')], '🧛', '#6a8a6a', '0/1d6'),
  N('deep_one', 'Deep One', 'Amphibious servant of Dagon. (approximate stats)', { str: 90, con: 65, siz: 90, dex: 50, app: 0, int: 70, pow: 60, edu: 0, luck: 0 }, 15, 1, 8, [at('Claw', 45, '1d6+1d4'), at('Trident', 50, '1d8+1d4')], '🐟', '#3a7a8a', '0/1d6'),
  N('mi_go', 'Mi-Go', 'Fungi from Yuggoth. (approximate stats)', { str: 60, con: 60, siz: 60, dex: 70, app: 0, int: 90, pow: 70, edu: 0, luck: 0 }, 12, 0, 7, [at('Pincer', 40, '1d6'), at('Electric Gun', 50, '3d6')], '🦋', '#9a5a7a', '0/1d6'),
];

module.exports = {
  id: 'coc7e', name: 'Call of Cthulhu 7e', short: 'Call of Cthulhu',
  desc: 'Cosmic-horror investigation. Percentile skills (roll under), Hard/Extreme successes, Sanity, Luck, pushed rolls.',
  rollSystem: 'd100', crit: { max: 1, min: 100 },
  grid: { unit: 'yd', cell: 1, distance: 'euclid' },
  currency: [{ key: 'usd', name: '$' }],
  abilities, abilityMod: 'score',
  varDefaults: { speedbase: 8, occpts: 0, crmin: 0, crmax: 99 },
  derived: [
    { key: 'build', name: 'Build', formula: 'if(str+siz<65,-2,if(str+siz<85,-1,if(str+siz<125,0,if(str+siz<165,1,2))))' },
    { key: 'db', name: 'Damage Bonus', formula: 'if(str+siz<65,-2,if(str+siz<85,-1,if(str+siz<125,0,if(str+siz<165,4,6))))', map: { '-2': '-2', '-1': '-1', '0': 'None', '4': '+1d4', '6': '+1d6' } },
    { key: 'move', name: 'Move Rate', formula: 'if(str<siz&&dex<siz,7,if(str>siz&&dex>siz,9,8))', unit: 'yd' },
    { key: 'init', name: 'Initiative (DEX)', formula: 'dex' },
  ],
  skillFormula: 'base + rank', skills, skillMode: 'points',
  saveFormula: '0', saves: [],
  rolls: [{ key: 'luck', name: 'Luck Roll', target: 'luck' }, { key: 'sanity', name: 'Sanity Roll', target: 'san_cur' }, { key: 'idea', name: 'Idea Roll', target: 'int' }, { key: 'know', name: 'Know Roll', target: 'edu' }],
  resources: [
    { key: 'hp', name: 'Hit Points', color: '#d64550', max: 'floor((con+siz)/10)', primary: true },
    { key: 'mp', name: 'Magic Points', color: '#4f7de0', max: 'floor(pow/5)' },
    { key: 'san', name: 'Sanity', color: '#8a4fe0', max: '99-s_mythos', start: 'pow' },
  ],
  tables: {},
  initiative: { roll: 'none', stat: 'init' },
  combat: { defense: null, hp: 'hp', autoResolve: false, weaponUses: 'action', moveStat: 'move', hideNpcStats: true,
    turn: [{ key: 'action', name: 'Action', count: 1 }, { key: 'reaction', name: 'Fight Back / Dodge', count: 99 }] },
  creation: {
    startLevel: 1, abilityMethods: ['roll', 'manual'], standardArray: [80, 70, 60, 60, 50, 50, 50, 40], pointBuy: null,
    steps: ['basics', 'occupation', 'age', 'abilities', 'skills', 'equipment', 'actions', 'review'],
    skillBudget: 'occpts + int*2', skillBudgetLabel: 'Occupation + interest skill points', startItemsFromOptions: false,
    startCurrency: { usd: 30 }, hideLevel: true,
  },
  choices: [
    { key: 'occupation', name: 'Occupation', required: true, options: occupations },
    { key: 'age', name: 'Age', required: true, options: age },
  ],
  items, actions, statuses, npcs,
  alignments: ['Investigator', 'Hostile', 'Neutral', 'Ally', 'Mythos'],
  tabs: [{ id: 'shop', name: 'Shop', icon: '🛒', type: 'shop' }, { id: 'quests', name: 'Case Notes', icon: '🕵️', type: 'quests' }, { id: 'clues', name: 'Clues', icon: '🔎', type: 'list' }],
  customLogName: 'Handouts & Trade',
};
