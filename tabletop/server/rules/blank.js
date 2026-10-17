'use strict';
// A small, fully editable starting point for homebrew rulesets.
module.exports = {
  id: 'custom', name: 'Custom Homebrew', short: 'Homebrew',
  desc: 'Build your own system from scratch: attributes, resources, skills, items, statuses, creatures and custom tabs.',
  rollSystem: 'd20', crit: { max: 20, min: 1 },
  grid: { unit: 'm', cell: 1.5, distance: 'chebyshev' },
  currency: [{ key: 'gold', name: 'Gold' }],
  abilities: [
    { key: 'might', name: 'Might', abbr: 'MIG', default: 10, roll: '3d6' },
    { key: 'agility', name: 'Agility', abbr: 'AGI', default: 10, roll: '3d6' },
    { key: 'wits', name: 'Wits', abbr: 'WIT', default: 10, roll: '3d6' },
    { key: 'spirit', name: 'Spirit', abbr: 'SPR', default: 10, roll: '3d6' },
  ],
  abilityMod: 'floor((score-10)/2)',
  varDefaults: { speed: 6, armor: 0 },
  derived: [
    { key: 'defense', name: 'Defense', formula: '10+agility_mod+armor' },
    { key: 'speed', name: 'Speed', formula: 'speed+floor(agility_mod/2)', unit: 'm' },
    { key: 'init', name: 'Initiative', formula: 'agility_mod', fmt: '+' },
  ],
  skillFormula: 'abil + rank', skills: [
    { key: 'fight', name: 'Fight', ability: 'might' }, { key: 'shoot', name: 'Shoot', ability: 'agility' },
    { key: 'sneak', name: 'Sneak', ability: 'agility' }, { key: 'lore', name: 'Lore', ability: 'wits' },
    { key: 'persuade', name: 'Persuade', ability: 'spirit' }, { key: 'notice', name: 'Notice', ability: 'wits' },
  ], skillMode: 'ranks',
  saveFormula: 'abil', saves: [{ key: 'body', name: 'Body', ability: 'might' }, { key: 'mind', name: 'Mind', ability: 'wits' }],
  resources: [
    { key: 'hp', name: 'Health', color: '#d64550', max: '10+might_mod*2+level*3', primary: true },
    { key: 'mana', name: 'Mana', color: '#4f7de0', max: '5+spirit_mod*2+level' },
  ],
  tables: {}, initiative: { roll: 'd20', stat: 'init' },
  combat: { defense: 'defense', hp: 'hp', autoResolve: true, critMode: 'dice', weaponUses: 'action', moveStat: 'speed', hideNpcStats: true,
    turn: [{ key: 'action', name: 'Action', count: 1 }, { key: 'bonus', name: 'Bonus', count: 1 }] },
  creation: { startLevel: 1, abilityMethods: ['roll', 'pointbuy', 'manual'], standardArray: [14, 12, 10, 8], pointBuy: { budget: 8, min: 8, max: 16, cost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9, 16: 11 } },
    steps: ['basics', 'class', 'abilities', 'skills', 'equipment', 'actions', 'review'], skillBudget: '4+wits_mod', skillBudgetLabel: 'Skill ranks', startItemsFromOptions: true, startCurrency: { gold: 20 } },
  choices: [{ key: 'class', name: 'Archetype', required: true, options: [
    { key: 'warrior', name: 'Warrior', desc: 'Strong and sturdy.', mods: [{ target: 'might', add: 2 }], items: [{ ref: 'sword', qty: 1, equipped: true }], actions: ['power_strike'] },
    { key: 'rogue', name: 'Rogue', desc: 'Quick and quiet.', mods: [{ target: 'agility', add: 2 }], items: [{ ref: 'dagger', qty: 1, equipped: true }], actions: [] },
    { key: 'mage', name: 'Mage', desc: 'Wielder of arcane power.', mods: [{ target: 'wits', add: 2 }, { target: 'max:mana', add: 5 }], items: [], actions: ['firebolt'] },
  ] }],
  items: [
    { key: 'sword', name: 'Sword', type: 'weapon', equipSlot: 'hand', price: { gold: 15 }, attack: 's_fight', damage: '1d8+might_mod', damageType: 'slashing' },
    { key: 'dagger', name: 'Dagger', type: 'weapon', equipSlot: 'hand', price: { gold: 3 }, attack: 's_fight', damage: '1d4+agility_mod', damageType: 'piercing' },
    { key: 'leather', name: 'Leather Armor', type: 'armor', equipSlot: 'body', price: { gold: 10 }, vars: { armor: 2 }, desc: '+2 Defense' },
    { key: 'potion', name: 'Healing Potion', type: 'consumable', price: { gold: 25 }, use: { heal: '2d6' } },
  ],
  actions: [
    { key: 'power_strike', name: 'Power Strike', kind: 'feature', uses: 'action', attack: 's_fight', damage: '2d6+might_mod', damageType: 'slashing', cost: { res: 'mana', amount: 2 }, desc: 'A heavy blow.' },
    { key: 'firebolt', name: 'Firebolt', kind: 'spell', uses: 'action', attack: 's_lore+spirit_mod', damage: '2d6', damageType: 'fire', cost: { res: 'mana', amount: 2 }, desc: 'Hurl fire.' },
  ],
  statuses: [
    { key: 'poisoned', name: 'Poisoned', desc: 'Loses 2 health each turn.', tick: { res: 'hp', amount: '-2', when: 'turnStart', type: 'poison' }, defaultTurns: 3 },
    { key: 'stunned', name: 'Stunned', desc: 'Cannot act.', blocks: ['action', 'bonus'] },
    { key: 'weakened', name: 'Weakened', desc: '-2 Might.', mods: [{ target: 'might', add: -2 }] },
  ],
  npcs: [
    { key: 'bandit', name: 'Bandit', cr: 1, alignment: 'Hostile', recLevel: 1, level: 1, desc: 'A road thug.', abilities: { might: 12, agility: 12, wits: 9, spirit: 9 }, fixed: { derived: { defense: 12, speed: 6 }, resourceMax: { hp: 12 } }, actions: [{ name: 'Club', kind: 'weapon', uses: 'action', attack: '3', damage: '1d6+1' }], icon: '🗡️', color: '#6a5a4a' },
  ],
  alignments: ['Good', 'Neutral', 'Evil', 'Hostile', 'Ally'],
  tabs: [{ id: 'shop', name: 'Shop', icon: '🛒', type: 'shop' }, { id: 'quests', name: 'Quests', icon: '📜', type: 'quests' }],
  customLogName: 'Gifts & Trade',
};
