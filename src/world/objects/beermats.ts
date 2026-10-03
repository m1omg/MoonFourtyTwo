import {
  BackSide,
  CanvasTexture,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import type { Game } from '../../app/Game.ts';
import type { Scope } from '../../core/scope.ts';

/**
 * Twelve beer mats, one hidden in every reality. On the back of each Ežo wrote a few lines: together
 * they tell the whole history of the universe, from the first hot moment to the last light.
 */
export interface BeerMatNote {
  /** Number printed on the mat (1..12). */
  n: number;
  title: string;
  body: string;
}

export const MAT_COUNT = 12;

export const BEER_MATS: Record<string, BeerMatNote> = {
  r1: {
    n: 1,
    title: 'Podtácka č. 1',
    body: 'Vraj na začiatku bolo všetko v jednom bode. Horúce a natlačené ako U Kolesa v piatok večer. Potom sa to rozbehlo a už sa to nezastavilo.\n\n– E.',
  },
  r2: {
    n: 2,
    title: 'Podtácka č. 2',
    body: 'Čas je zvláštna vec. Keď sa nič nehýbe, nemá ho čím merať. Zamrznutá krčma je presne taká: bez hodín, bez času. Len my.\n\n– E.',
  },
  r3: {
    n: 3,
    title: 'Podtácka č. 3',
    body: 'Prvé hviezdy sa zapálili, keď mal vesmír pár sto miliónov rokov. Mladé, veľké, žili krátko a hlučne. Ako my dvaja kedysi.\n\n– E.',
  },
  r4: {
    n: 4,
    title: 'Podtácka č. 4',
    body: 'Uhlík v tvojich kostiach sa uvaril vo hviezde, čo vybuchla dávno pred Slnkom. Sme z popola, starý. Preto kúrim tak rád.\n\n– E.',
  },
  r5: {
    n: 5,
    title: 'Podtácka č. 5',
    body: 'Vodík vo vode je z prvých minút sveta. Keď sa kúpeš, kúpeš sa v začiatku všetkého. Nezabudni si vziať uterák.\n\n– E.',
  },
  r6: {
    n: 6,
    title: 'Podtácka č. 6',
    body: 'Hviezdy sa budú rodiť ešte sto biliónov rokov. Desať na štrnástu. Potom už nebude z čoho. Posledné budú malé, červené a budú svietiť dlhšie, ako si vieš predstaviť.\n\n– E.',
  },
  r7: {
    n: 7,
    title: 'Podtácka č. 7',
    body: 'Potom zostanú len zvyšky: biele trpaslíky, neutrónové hviezdy, čierne diery. Vesmír ako hotel po sezóne. Izby zamknuté, chodby studené.\n\n– E.',
  },
  r8: {
    n: 8,
    title: 'Podtácka č. 8',
    body: 'Raz sa vraj rozpadnú aj protóny. Okolo desať na štyridsiatu. Potom zostanú len čierne diery. Rebrá v snehu, nič iné.\n\n– E.',
  },
  r9: {
    n: 9,
    title: 'Podtácka č. 9',
    body: 'Aj čierne diery sa pomaly vyparujú. Tie najväčšie vydržia do desať na stú. Potom posledný záblesk a konečná. Vystupovať.\n\n– E.',
  },
  r10: {
    n: 10,
    title: 'Podtácka č. 10',
    body: 'Po nich už len tma a pár častíc. Elektrón tu, pozitrón tam, ďaleko od seba ako dva brehy mora. Krúžia a približujú sa.\n\n– E.',
  },
  r11: {
    n: 11,
    title: 'Podtácka č. 11',
    body: 'Keď sa elektrón a pozitrón stretnú, nezostane z nich nič ťažké. Len svetlo. Dva fotóny. Štrng.\n\n– E.',
  },
  r12: {
    n: 12,
    title: 'Podtácka č. 12',
    body: 'Svetlo nemá hodinky ani meter. Keď je všetko len svetlo, nedá sa povedať, či je vesmír obrovský, alebo maličký. A tak taký koniec je zase začiatok. Na zdravie.\n\n– E.',
  },
};

const DOWN = new Vector3(0, -1, 0);
const _ray = new Raycaster();

const shown = (o: Object3D | null): boolean => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

/**
 * Height of the first visible, opaque surface below `from` (colliders of props are shrunk a little,
 * so they would hide a mat inside a table top), or null if there is none.
 */
function surfaceBelow(game: Game, from: Vector3, far: number): number | null {
  const scene = game.scene;
  if (!scene) return null;
  scene.updateMatrixWorld(true);
  _ray.set(from, DOWN);
  _ray.far = far;
  // sprites need a camera to be hit-tested at all
  _ray.camera = game.renderer.camera;
  for (const h of _ray.intersectObject(scene, true)) {
    const o = h.object as Mesh;
    if (!o.isMesh) continue;
    const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as Material | undefined;
    if (!mat || mat.transparent || mat.side === BackSide || !shown(o)) continue;
    return h.point.y;
  }
  return null;
}

/**
 * Lays one of the twelve mats somewhere in a reality (unless it was already found). It drops from
 * `pos` onto whatever is below (a table, a bench, the floor), so call it from the reality's start,
 * once the colliders exist. Picking it up shows Ežo's note and counts it; the count is kept in the
 * save with the next checkpoint.
 */
export function placeBeerMat(
  game: Game,
  scope: Scope,
  id: keyof typeof BEER_MATS & string,
  from: Vector3,
  opts: { rotY?: number; visible?: () => boolean } = {},
): Mesh | null {
  const note = BEER_MATS[id];
  if (!note || game.mats.includes(id)) return null;
  const top = surfaceBelow(game, from, 6);
  const hit = game.world.raycast(from, DOWN, 6);
  const y = top ?? (hit === Infinity ? from.y : from.y - hit);
  const pos = from.clone().setY(y + 0.003);
  const face = scope.add(new MeshStandardMaterial({ map: scope.add(matTexture(note.n)), roughness: 0.85 }));
  const edge = scope.add(new MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }));
  const mesh = new Mesh(scope.add(new CylinderGeometry(0.052, 0.052, 0.004, 28)), [edge, face, edge]);
  mesh.position.copy(pos);
  mesh.rotation.y = opts.rotY ?? 0;
  game.scene?.add(mesh);
  game.interactions.add({
    id: `beermat:${id}`,
    pos: pos.clone().setY(pos.y + 0.02),
    radius: 0.12,
    prompt: 'Zobrať podtácku',
    enabled: () => mesh.visible && (opts.visible?.() ?? true),
    onUse: () => {
      mesh.visible = false;
      if (!game.mats.includes(id)) game.mats.push(id);
      game.keepMats();
      game.synth.click(pos, 1400, 0.08);
      game.ui.toast(`Podtácka ${game.mats.length}/${MAT_COUNT}`, 3000);
      void game.readDocument(note.title, note.body);
    },
  });
  return mesh;
}

/** The pub's mat: the wheel, „U KOLESA", and its number. */
function matTexture(n: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe4c8';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#8a2a1a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  // the wheel
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 54, 22, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.beginPath();
    g.moveTo(64, 54);
    g.lineTo(64 + Math.cos(a) * 22, 54 + Math.sin(a) * 22);
    g.stroke();
  }
  g.fillStyle = '#8a2a1a';
  g.font = "bold 15px 'IBM Plex Sans Condensed', Arial";
  g.textAlign = 'center';
  g.fillText('U KOLESA', 64, 96);
  g.font = "bold 13px 'IBM Plex Sans Condensed', Arial";
  g.fillText(`${n} / 12`, 64, 112);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
