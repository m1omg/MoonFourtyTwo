/** Fails if the built game exceeds the size budgets (GitHub Pages friendliness, phones). */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const MAX_TOTAL = 150 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ missing: run the build first');
  process.exit(1);
}
let total = 0;
const big: string[] = [];
for (const f of walk(DIST)) {
  const s = fs.statSync(f).size;
  total += s;
  if (s > MAX_FILE) big.push(`${f} (${(s / 1048576).toFixed(1)} MB)`);
}
console.log(`dist total: ${(total / 1048576).toFixed(1)} MB`);
if (big.length) {
  console.error(`files over ${MAX_FILE / 1048576} MB:\n${big.join('\n')}`);
  process.exit(1);
}
if (total > MAX_TOTAL) {
  console.error(`total over ${MAX_TOTAL / 1048576} MB`);
  process.exit(1);
}
