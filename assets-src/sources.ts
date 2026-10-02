/**
 * Declarative list of CC0 assets fetched from Poly Haven (https://polyhaven.com, CC0).
 * Keys are the Poly Haven asset ids; they are also the local names under public/assets/.
 */

/** PBR texture sets used by kit materials (public/assets/tex/<id>/{1k,512}_{diff,nor,arm}.jpg). */
export const TEXTURES: string[] = [
  'brown_floor_tiles',
  'dark_paneled_wood',
  'yellow_plaster_02',
  'white_plaster_rough_01',
  'wood_table_worn',
  'dark_wooden_planks',
  'old_wood_floor',
  'cobblestone_floor_04',
  'plastered_wall_04',
  'concrete_floor_worn_001',
  'grey_tiles',
  'rusty_metal_02',
];

/** Models (public/assets/models/<id>.glb), textures capped at maxTex. */
export const MODELS: Array<{ id: string; maxTex?: number }> = [
  { id: 'WoodenChair_01' },
  { id: 'WoodenTable_01' },
  { id: 'WoodenTable_03' },
  { id: 'round_wooden_table_01' },
  { id: 'bar_chair_round_01' },
  { id: 'wooden_stool_02' },
  { id: 'Television_01' },
  { id: 'dartboard', maxTex: 512 },
  { id: 'wall_clock', maxTex: 512 },
  { id: 'CashRegister_01', maxTex: 512 },
  { id: 'wine_bottles_01' },
  { id: 'hanging_picture_frame_01', maxTex: 512 },
  { id: 'hanging_picture_frame_02', maxTex: 512 },
  { id: 'standing_chalkboard_01', maxTex: 512 },
  { id: 'scandinavian_masonry_heater' },
  { id: 'hanging_industrial_lamp', maxTex: 512 },
  { id: 'industrial_wall_lamp', maxTex: 512 },
  { id: 'Shelf_01' },
  { id: 'wooden_display_shelves_01' },
  { id: 'Barrel_01', maxTex: 512 },
  { id: 'street_lamp_01', maxTex: 512 },
  { id: 'plastic_monobloc_chair_01', maxTex: 512 },
  { id: 'covered_car' },
  { id: 'vintage_lighter', maxTex: 512 },
  { id: 'cigarette_pack', maxTex: 512 },
  { id: 'metal_trash_can', maxTex: 512 },
  { id: 'bull_head', maxTex: 512 },
];

/** HDR environments (public/assets/hdri/<id>_1k.hdr). */
export const HDRIS: string[] = ['moonless_golf'];

/** Extra furniture for the pub (added after the first layout pass). */
export const MODELS_EXTRA: Array<{ id: string; maxTex?: number }> = [
  { id: 'gallinera_chair', maxTex: 512 },
  { id: 'painted_wooden_chair_02', maxTex: 512 },
  { id: 'dining_chair_02', maxTex: 512 },
  { id: 'gallinera_table', maxTex: 1024 },
  { id: 'wooden_stool_01', maxTex: 512 },
];
