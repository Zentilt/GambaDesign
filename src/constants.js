// Game constants

export const CANVAS_WIDTH  = 440;
export const CANVAS_HEIGHT = 680;

export const GRAVITY   = 0.35;
export const DAMPING   = 0.62;   // energy kept after peg bounce
export const FRICTION  = 0.995;  // horizontal friction per frame
export const BALL_RADIUS = 9;
export const PEG_RADIUS  = 7;
export const BUMPER_RADIUS = 18;

export const PEG_ROWS    = 12;
export const PEG_COLS    = 10;
export const PEG_SPACING = 38;
export const BOARD_OFFSET_X = 30;
export const BOARD_OFFSET_Y = 80;

export const SLOT_COUNT  = 9;
export const SLOT_HEIGHT = 50;

export const MAX_BALLS_PER_RUN = 3;

export const STAGE_COUNT       = 10;
export const BOSS_STAGE_EVERY  = 5;

export const THEMES = ['Forest', 'Ocean', 'Volcano', 'Sky', 'Crystal Cave', 'Ancient Ruins', 'Mechanical Factory', 'Space Station'];

export const RARITY = {
  COMMON:    'common',
  UNCOMMON:  'uncommon',
  RARE:      'rare',
  EPIC:      'epic',
  LEGENDARY: 'legendary',
};

export const RARITY_WEIGHTS = {
  [RARITY.COMMON]:    60,
  [RARITY.UNCOMMON]:  25,
  [RARITY.RARE]:      10,
  [RARITY.EPIC]:       4,
  [RARITY.LEGENDARY]:  1,
};

export const RARITY_COLORS = {
  [RARITY.COMMON]:    '#888888',
  [RARITY.UNCOMMON]:  '#44aa99',
  [RARITY.RARE]:      '#4499ff',
  [RARITY.EPIC]:      '#9944ff',
  [RARITY.LEGENDARY]: '#ff8844',
};

export const PATH = {
  SAFE:   'safe',
  DANGER: 'danger',
};

export const UPGRADE_TYPE = {
  BUMPER:     'bumper',
  PORTAL:     'portal',
  WHEEL:      'wheel',
  FLIPPER:    'flipper',
  MULTIPLIER: 'multiplier',
  SPLIT:      'split',
  EXTRA_BALL: 'extra_ball',
};
