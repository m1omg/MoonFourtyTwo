/** Drinks and snacks. Names and descriptions are player-facing (Slovak). */

export type BuffType =
  | 'courage' // fear grows slower
  | 'ward' // juniper: entities lose your trail when line of sight breaks
  | 'warmth' // body heat recovers
  | 'steady' // cancels sway and double vision
  | 'clarity' // dispels hallucinations (cancels absinthe), shows false doors
  | 'reveal' // see hidden passages (and glow to entities)
  | 'absinthe' // hallucination layer
  | 'sober' // faster alcohol elimination
  | 'hangover'; // after okno: light sensitivity, slower

export type Effect =
  | { type: 'buff'; buff: BuffType; seconds: number; strength?: number }
  | { type: 'composure'; amount: number } // reduces fear instantly
  | { type: 'heat'; amount: number } // instant body heat
  | { type: 'eon' }; // special: skip an eon

export type ItemId =
  | 'pivo'
  | 'staleBeer'
  | 'borovicka'
  | 'slivovica'
  | 'medovina'
  | 'hruskovica'
  | 'fernet'
  | 'horskyCaj'
  | 'absint'
  | 'cierne'
  | 'malinovka'
  | 'voda'
  | 'chlieb'
  | 'utopenec'
  | 'pagac'
  | 'flasa'
  | 'kacka';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Short tag shown in the hotbar tooltip. */
  tag: string;
  kind: 'drink' | 'food' | 'throw';
  /** Serving size in ml (0 for food). */
  ml: number;
  /** Alcohol by volume, 0..1. */
  abv: number;
  /** Seconds over which the alcohol is absorbed. */
  absorbSec: number;
  effects: Effect[];
  /** Colour of the liquid (for the glass mesh) as 0xRRGGBB. */
  color: number;
  glass: 'mug' | 'shot' | 'bottle' | 'plate' | 'glass';
  /** Show an infinity sign instead of ‰ after drinking. */
  mystery?: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  pivo: {
    id: 'pivo',
    name: 'Pivo',
    tag: 'odvaha',
    kind: 'drink',
    ml: 500,
    abv: 0.045,
    absorbSec: 40,
    effects: [{ type: 'buff', buff: 'courage', seconds: 90, strength: 0.35 }],
    color: 0xd9a53a,
    glass: 'mug',
  },
  staleBeer: {
    id: 'staleBeer',
    name: 'Zvetrané pivo',
    tag: 'odvaha, trochu',
    kind: 'drink',
    ml: 150,
    abv: 0.04,
    absorbSec: 15,
    effects: [{ type: 'buff', buff: 'courage', seconds: 30, strength: 0.2 }],
    color: 0xb98c34,
    glass: 'glass',
  },
  borovicka: {
    id: 'borovicka',
    name: 'Borovička',
    tag: 'jalovec odháňa zlé',
    kind: 'drink',
    ml: 40,
    abv: 0.4,
    absorbSec: 10,
    effects: [{ type: 'buff', buff: 'ward', seconds: 45 }],
    color: 0xf2f0e6,
    glass: 'shot',
  },
  slivovica: {
    id: 'slivovica',
    name: 'Slivovica',
    tag: 'na všetko',
    kind: 'drink',
    ml: 40,
    abv: 0.52,
    absorbSec: 10,
    effects: [
      { type: 'composure', amount: 1 },
      { type: 'heat', amount: 0.35 },
      { type: 'buff', buff: 'warmth', seconds: 60, strength: 0.5 },
    ],
    color: 0xf6efd8,
    glass: 'shot',
  },
  medovina: {
    id: 'medovina',
    name: 'Medovina',
    tag: 'dlhé teplo',
    kind: 'drink',
    ml: 100,
    abv: 0.13,
    absorbSec: 25,
    effects: [
      { type: 'buff', buff: 'warmth', seconds: 180, strength: 1 },
      { type: 'buff', buff: 'steady', seconds: 30 },
    ],
    color: 0xc98a1e,
    glass: 'glass',
  },
  hruskovica: {
    id: 'hruskovica',
    name: 'Hruškovica',
    tag: 'pevná ruka',
    kind: 'drink',
    ml: 40,
    abv: 0.45,
    absorbSec: 10,
    effects: [{ type: 'buff', buff: 'steady', seconds: 60 }],
    color: 0xfaf6e8,
    glass: 'shot',
  },
  fernet: {
    id: 'fernet',
    name: 'Fernet',
    tag: 'jasná hlava',
    kind: 'drink',
    ml: 40,
    abv: 0.38,
    absorbSec: 10,
    effects: [{ type: 'buff', buff: 'clarity', seconds: 60 }],
    color: 0x2b1a10,
    glass: 'shot',
  },
  horskyCaj: {
    id: 'horskyCaj',
    name: 'Horský čaj 72°',
    tag: 'tretie oko (ale aj oni teba)',
    kind: 'drink',
    ml: 40,
    abv: 0.72,
    absorbSec: 10,
    effects: [{ type: 'buff', buff: 'reveal', seconds: 40 }],
    color: 0x8a3b12,
    glass: 'shot',
  },
  absint: {
    id: 'absint',
    name: 'Absint',
    tag: 'zelená víla',
    kind: 'drink',
    ml: 40,
    abv: 0.7,
    absorbSec: 10,
    effects: [{ type: 'buff', buff: 'absinthe', seconds: 30 }],
    color: 0x7fd14a,
    glass: 'shot',
  },
  cierne: {
    id: 'cierne',
    name: 'Čierne',
    tag: '?',
    kind: 'drink',
    ml: 40,
    abv: 0,
    absorbSec: 1,
    effects: [{ type: 'eon' }],
    color: 0x050505,
    glass: 'shot',
    mystery: true,
  },
  malinovka: {
    id: 'malinovka',
    name: 'Malinovka',
    tag: 'vytriezvenie',
    kind: 'drink',
    ml: 330,
    abv: 0,
    absorbSec: 1,
    effects: [
      { type: 'buff', buff: 'sober', seconds: 40, strength: 0.6 },
      { type: 'composure', amount: 0.15 },
    ],
    color: 0xd8304a,
    glass: 'bottle',
  },
  voda: {
    id: 'voda',
    name: 'Voda',
    tag: 'trochu vytriezvie',
    kind: 'drink',
    ml: 250,
    abv: 0,
    absorbSec: 1,
    effects: [{ type: 'buff', buff: 'sober', seconds: 20, strength: 0.5 }],
    color: 0xcfe7f2,
    glass: 'glass',
  },
  chlieb: {
    id: 'chlieb',
    name: 'Chlieb s masťou',
    tag: 'postaví na nohy',
    kind: 'food',
    ml: 0,
    abv: 0,
    absorbSec: 1,
    effects: [{ type: 'buff', buff: 'sober', seconds: 60, strength: 1.2 }],
    color: 0xe9dcc0,
    glass: 'plate',
  },
  utopenec: {
    id: 'utopenec',
    name: 'Utopenec',
    tag: 'vytriezvenie a odvaha',
    kind: 'food',
    ml: 0,
    abv: 0,
    absorbSec: 1,
    effects: [
      { type: 'buff', buff: 'sober', seconds: 40, strength: 0.8 },
      { type: 'buff', buff: 'courage', seconds: 60, strength: 0.3 },
    ],
    color: 0xb06a4a,
    glass: 'plate',
  },
  kacka: {
    id: 'kacka',
    name: 'Gumená kačička',
    tag: 'hodiť (G) — zapiští, vo vode čľapne',
    kind: 'throw',
    ml: 0,
    abv: 0,
    absorbSec: 1,
    effects: [],
    color: 0xf2c21a,
    glass: 'plate',
  },
  flasa: {
    id: 'flasa',
    name: 'Prázdna fľaša',
    tag: 'hodiť (G) — odlákať pozornosť',
    kind: 'throw',
    ml: 0,
    abv: 0,
    absorbSec: 1,
    effects: [],
    color: 0x2f5d2a,
    glass: 'bottle',
  },
  pagac: {
    id: 'pagac',
    name: 'Pagáč',
    tag: 'malé vytriezvenie',
    kind: 'food',
    ml: 0,
    abv: 0,
    absorbSec: 1,
    effects: [{ type: 'buff', buff: 'sober', seconds: 20, strength: 0.6 }],
    color: 0xd9b26a,
    glass: 'plate',
  },
};
