// Relic definitions

export const RELICS = [
  {
    id: 'iron_core',
    name: 'Iron Core',
    icon: '⚙️',
    rarity: 'common',
    description: 'Ball weight increases, making it fall more predictably. +10% gold on center slots.',
    effect: 'center_gold_bonus',
    value: 0.10,
  },
  {
    id: 'lucky_coin',
    name: 'Lucky Coin',
    icon: '🪙',
    rarity: 'common',
    description: 'Start each run with +5 gold.',
    effect: 'start_gold',
    value: 5,
  },
  {
    id: 'magnet',
    name: 'Magnetic Core',
    icon: '🧲',
    rarity: 'uncommon',
    description: 'Ball is slightly attracted to the highest-value slot each drop.',
    effect: 'magnetic_attraction',
    value: 0.3,
  },
  {
    id: 'fireball',
    name: 'Fireball Essence',
    icon: '🔥',
    rarity: 'uncommon',
    description: 'Bumpers ignite on hit for 3 seconds, doubling their score value.',
    effect: 'ignite_bumpers',
    value: 3,
  },
  {
    id: 'ice_crystal',
    name: 'Ice Crystal',
    icon: '❄️',
    rarity: 'uncommon',
    description: 'Ball leaves an ice trail that freezes nearby pegs, boosting their value by 1.5×.',
    effect: 'ice_trail',
    value: 1.5,
  },
  {
    id: 'golden_peg',
    name: 'Golden Peg',
    icon: '✨',
    rarity: 'rare',
    description: 'One random peg per run becomes golden, granting +20 gold on contact.',
    effect: 'golden_peg',
    value: 20,
  },
  {
    id: 'splitter',
    name: 'Ball Splitter',
    icon: '⚡',
    rarity: 'rare',
    description: 'Once per run, upon hitting a bumper, the ball splits into 2.',
    effect: 'ball_split',
    value: 1,
  },
  {
    id: 'lucky_portal',
    name: 'Lucky Portal',
    icon: '🌀',
    rarity: 'rare',
    description: 'Adds a portal to the board; entering it teleports the ball to a random high-value position.',
    effect: 'portal',
    value: 1,
  },
  {
    id: 'auto_multiplier',
    name: 'Auto Multiplier',
    icon: '✖️',
    rarity: 'epic',
    description: 'Every 10 seconds during a drop, all active slot multipliers increase by 1.',
    effect: 'auto_multiply',
    value: 1,
  },
  {
    id: 'chain_bomb',
    name: 'Chain Bomb',
    icon: '💥',
    rarity: 'epic',
    description: 'When a combo reaches 8+, nearby bumpers all explode for massive score.',
    effect: 'chain_explosion',
    value: 8,
  },
  {
    id: 'chaos_orb',
    name: 'Chaos Orb',
    icon: '🔮',
    rarity: 'legendary',
    description: 'Randomly reshuffles all slot values at the start of each drop. High risk, high reward.',
    effect: 'chaos_slots',
    value: 1,
  },
  {
    id: 'phoenix_feather',
    name: 'Phoenix Feather',
    icon: '🪶',
    rarity: 'legendary',
    description: 'Once per run, if you would lose, revive with 1 ball and double all multipliers.',
    effect: 'phoenix_revive',
    value: 2,
  },
  {
    id: 'lava_core',
    name: 'Lava Core',
    icon: '🌋',
    rarity: 'rare',
    description: 'Converts the losing slot into a lava slot that generates a bonus ball on contact.',
    effect: 'lava_bonus_ball',
    value: 1,
  },
  {
    id: 'time_crystal',
    name: 'Time Crystal',
    icon: '⏳',
    rarity: 'epic',
    description: 'Slows ball speed to 60% for 2 seconds after each bumper hit.',
    effect: 'time_slow',
    value: 0.6,
  },
  {
    id: 'triple_spring',
    name: 'Triple Spring',
    icon: '🌀',
    rarity: 'uncommon',
    description: 'Ball bounces off the side walls 3 times with no energy loss.',
    effect: 'wall_bounce',
    value: 3,
  },
];

/** Get a relic definition by id */
export function getRelic(id) {
  return RELICS.find(r => r.id === id);
}

/** Synergy definitions: combinations of creatures/relics that produce special effects */
export const SYNERGIES = [
  {
    id: 'lava_phoenix',
    name: 'Lava Phoenix',
    icon: '🌋🔥',
    requires: { creatures: ['phoenix'], relics: ['fireball', 'lava_core'] },
    description: 'Fireballs ignite bumpers. Burning bumpers generate bonus balls. Phoenix relaunches missed balls → cascading chain reaction.',
    effect: 'lava_phoenix_cascade',
  },
  {
    id: 'magnetic_cat',
    name: 'Fortune Magnet',
    icon: '🧲🐱',
    requires: { creatures: ['cat'], relics: ['magnet', 'lucky_coin'] },
    description: 'Gold attraction doubled, gold rewards tripled.',
    effect: 'triple_gold',
  },
  {
    id: 'ghost_portal',
    name: 'Spirit Gate',
    icon: '👻🌀',
    requires: { creatures: ['ghost'], relics: ['lucky_portal'] },
    description: 'Phased balls automatically seek the nearest portal.',
    effect: 'ghost_portal_seek',
  },
  {
    id: 'chain_dragon',
    name: 'Dragon Chain',
    icon: '🐉💥',
    requires: { creatures: ['dragon'], relics: ['chain_bomb'] },
    description: 'Chain reactions from Dragon trigger Chain Bomb explosions simultaneously.',
    effect: 'dragon_chain_bomb',
  },
  {
    id: 'bee_splitter',
    name: 'Golden Swarm',
    icon: '🐝⚡',
    requires: { creatures: ['bee'], relics: ['splitter', 'golden_peg'] },
    description: 'Split balls each seek golden pegs, and each golden peg hit spawns another ball.',
    effect: 'golden_swarm',
  },
];

/** Check which synergies are active given owned creatures and relics */
export function getActiveSynergies(ownedCreatureIds, ownedRelicIds) {
  return SYNERGIES.filter(syn => {
    const creaturesOk = syn.requires.creatures.every(c => ownedCreatureIds.includes(c));
    const relicsOk    = syn.requires.relics.every(r => ownedRelicIds.includes(r));
    return creaturesOk && relicsOk;
  });
}
