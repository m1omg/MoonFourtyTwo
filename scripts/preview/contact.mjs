// node scripts/preview/contact.mjs out.png a.png b.png ... (tiles images horizontally at 256px)
import sharp from 'sharp';
const [out, ...ins] = process.argv.slice(2);
const tiles = await Promise.all(ins.map((f) => sharp(f).resize(256, 256).toBuffer()));
await sharp({ create: { width: 256 * tiles.length, height: 256, channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: i * 256, top: 0 })))
  .png()
  .toFile(out);
