/**
 * Downloads CC0 assets from Poly Haven into .cache/ and writes optimized copies to public/assets/.
 * Usage: node scripts/assets/fetch-assets.ts [--only id1,id2]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, textureCompress, resample, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { TEXTURES, MODELS, MODELS_EXTRA, HDRIS } from '../../assets-src/sources.ts';

const UA = 'MoonFourtyTwo-pipeline/1.0 (+https://github.com/m1omg/MoonFourtyTwo)';
const CACHE = '.cache/ph';
const OUT = 'public/assets';
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1]!.split(',')) : null;

interface PhFile {
  url: string;
  md5?: string;
  size?: number;
  include?: Record<string, { url: string; md5?: string }>;
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

async function download(url: string, dest: string, md5?: string): Promise<void> {
  if (fs.existsSync(dest)) {
    if (!md5) return;
    const h = crypto.createHash('md5').update(fs.readFileSync(dest)).digest('hex');
    if (h === md5) return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (md5) {
        const h = crypto.createHash('md5').update(buf).digest('hex');
        if (h !== md5) throw new Error(`md5 mismatch ${url}`);
      }
      fs.writeFileSync(dest, buf);
      return;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let it = queue.shift(); it !== undefined; it = queue.shift()) await fn(it);
    }),
  );
}

/** A texture entry is a Poly Haven id, optionally with a colour variant: `fabric_pattern_07:col_1`. */
async function fetchTexture(entry: string): Promise<void> {
  const [id, colour] = entry.split(':') as [string, string | undefined];
  const files = await json<Record<string, Record<string, Record<string, PhFile>>>>(
    `https://api.polyhaven.com/files/${id}`,
  );
  const maps: Array<[string, string]> = [
    [colour ?? 'Diffuse', 'diff'],
    ['nor_gl', 'nor'],
    ['arm', 'arm'],
  ];
  const outDir = path.join(OUT, 'tex', id);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [key, short] of maps) {
    const f = files[key]?.['1k']?.['jpg'];
    if (!f) {
      console.warn(`  ${id}: no ${key}`);
      continue;
    }
    const src = path.join(CACHE, 'tex', id, `${short}_1k.jpg`);
    await download(f.url, src, f.md5);
    await sharp(src)
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(path.join(outDir, `1k_${short}.jpg`));
    await sharp(src)
      .resize(512, 512)
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(outDir, `512_${short}.jpg`));
  }
  console.log(`tex ${id}`);
}

async function fetchModel(m: { id: string; maxTex?: number; simplify?: number }): Promise<void> {
  const files = await json<Record<string, Record<string, Record<string, PhFile>>>>(
    `https://api.polyhaven.com/files/${m.id}`,
  );
  const g = files['gltf']?.['1k']?.['gltf'];
  if (!g) throw new Error(`no gltf for ${m.id}`);
  const dir = path.join(CACHE, 'models', m.id);
  const gltfPath = path.join(dir, `${m.id}.gltf`);
  await download(g.url, gltfPath, g.md5);
  for (const [rel, inc] of Object.entries(g.include ?? {}))
    await download(inc.url, path.join(dir, rel), inc.md5);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(gltfPath);
  const max = m.maxTex ?? 1024;
  if (m.simplify) {
    // heavy decorative meshes (plants): keep a fraction of the triangles
    await MeshoptSimplifier.ready;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: m.simplify, error: 0.01 }));
  }
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    resample(),
    textureCompress({ encoder: sharp, resize: [max, max], targetFormat: 'webp', quality: 82 }),
    quantize(),
  );
  fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
  const out = path.join(OUT, 'models', `${m.id}.glb`);
  await io.write(out, doc);
  console.log(`model ${m.id} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

async function fetchHdri(id: string): Promise<void> {
  const files = await json<Record<string, Record<string, Record<string, PhFile>>>>(
    `https://api.polyhaven.com/files/${id}`,
  );
  const f = files['hdri']?.['1k']?.['hdr'];
  if (!f) throw new Error(`no hdri ${id}`);
  const dest = path.join(OUT, 'hdri', `${id}_1k.hdr`);
  await download(f.url, dest, f.md5);
  console.log(`hdri ${id}`);
}

const want = (id: string) => !only || only.has(id);
await pool(
  TEXTURES.filter((t) => want(t.split(':')[0]!)),
  4,
  fetchTexture,
);
await pool(
  [...MODELS, ...MODELS_EXTRA].filter((m) => want(m.id)),
  3,
  fetchModel,
);
await pool(HDRIS.filter(want), 2, fetchHdri);
console.log('done');
