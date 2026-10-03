/**
 * Declarative list of CC0 assets fetched from Poly Haven (https://polyhaven.com, CC0).
 * Keys are the Poly Haven asset ids; they are also the local names under public/assets/.
 */

/**
 * PBR texture sets used by kit materials (public/assets/tex/<id>/{1k,512}_{diff,nor,arm}.jpg).
 * Sets that come in colour variants name the one to use after a colon.
 */
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
  'brick_wall_02',
  'metal_grate_rusty',
  'concrete_wall_004',
  'long_white_tiles',
  'rounded_square_tiled_wall',
  'anti_skid_tiles',
  'terrazzo_tiles',
  'old_linoleum_flooring_01',
  'herringbone_parquet',
  'decrepit_wallpaper',
  'fabric_pattern_07:col_1',
  'peeling_painted_wall',
  'painted_plaster_wall',
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
/** `simplify` keeps that fraction of a model's triangles (for heavy decorative meshes). */
export const MODELS_EXTRA: Array<{ id: string; maxTex?: number; simplify?: number }> = [
  { id: 'gallinera_chair', maxTex: 512 },
  { id: 'painted_wooden_chair_02', maxTex: 512 },
  { id: 'dining_chair_02', maxTex: 512 },
  { id: 'gallinera_table', maxTex: 1024 },
  { id: 'wooden_stool_01', maxTex: 512 },
  { id: 'wooden_barrels_01' },
  { id: 'wine_barrel_01', maxTex: 512 },
  { id: 'caged_hanging_light', maxTex: 512 },
  { id: 'industrial_caged_sconce', maxTex: 512 },
  { id: 'metal_office_desk', maxTex: 512 },
  { id: 'rusted_spade_01', maxTex: 512 },
  { id: 'propane_tank', maxTex: 512 },
  { id: 'wooden_crate_01', maxTex: 512 },
  { id: 'steel_frame_shelves_01', maxTex: 512 },
  { id: 'boombox', maxTex: 512 },
  { id: 'rubber_duck_toy', maxTex: 512 },
  { id: 'WetFloorSign_01', maxTex: 512 },
  { id: 'lifebuoy', maxTex: 512, simplify: 0.35 },
  { id: 'potted_plant_02', maxTex: 512, simplify: 0.15 },
  { id: 'mounted_fluorescent_lights', maxTex: 512, simplify: 0.4 },
  { id: 'painted_wooden_bench', maxTex: 512 },
  { id: 'vintage_cabinet_01', maxTex: 512, simplify: 0.3 },
  { id: 'painted_wooden_cabinet', maxTex: 512 },
  { id: 'vintage_electric_kettle', maxTex: 256, simplify: 0.3 },
  // reality 7: the mountain hotel
  { id: 'mid_century_lounge_chair', maxTex: 512, simplify: 0.4 },
  { id: 'sofa_03', maxTex: 512, simplify: 0.4 },
  { id: 'Chandelier_02', maxTex: 512, simplify: 0.4 },
  { id: 'old_bed_frame', maxTex: 512, simplify: 0.12 },
  { id: 'vintage_oil_lamp', maxTex: 512, simplify: 0.5 },
  { id: 'ornate_mirror_01', maxTex: 512, simplify: 0.5 },
  { id: 'portable_cassette_player', maxTex: 256, simplify: 0.5 },
  { id: 'painted_wooden_nightstand', maxTex: 512 },
  { id: 'vintage_grandfather_clock_01', maxTex: 512, simplify: 0.5 },
];
