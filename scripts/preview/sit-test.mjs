import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const [model, out] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = http
  .createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  })
  .listen(0);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
page.on('pageerror', (e) => console.log('[err]', e.message));
await page.goto(`http://localhost:${srv.address().port}/scripts/preview/preview.html?m=/${model}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
await page.evaluate(() => {
  const THREE = window.THREE;
  const bones = {};
  window.root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const bind = {};
  for (const [n, b] of Object.entries(bones)) bind[n] = b.quaternion.clone();
  window.root.updateMatrixWorld(true);
  const pq = new THREE.Quaternion(),
    q = new THREE.Quaternion();
  // rotate a bone by a world-space axis/angle, relative to its bind orientation
  function rot(name, axis, angle) {
    const b = bones[name];
    b.parent.getWorldQuaternion(pq);
    q.setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle);
    // local = parentInv * qWorld * parent * local
    const local = pq.clone().invert().multiply(q).multiply(pq).multiply(b.quaternion);
    b.quaternion.copy(local);
    b.updateMatrixWorld(true);
  }
  const D = Math.PI / 180;
  // sitting
  rot('LeftUpLeg', [1, 0, 0], -88 * D);
  rot('RightUpLeg', [1, 0, 0], -88 * D);
  rot('LeftLeg', [1, 0, 0], 92 * D);
  rot('RightLeg', [1, 0, 0], 92 * D);
  rot('Spine02', [1, 0, 0], 6 * D);
  // drinking: right arm raised toward mouth
  rot('RightArm', [0, 0, 1], 22 * D);
  rot('RightArm', [1, 0, 0], -55 * D);
  rot('RightArm', [0, 1, 0], 25 * D);
  rot('RightForeArm', [1, 0, 0], -105 * D);
  rot('RightForeArm', [0, 1, 0], 30 * D);
  // left arm resting on table
  rot('LeftArm', [0, 0, 1], -22 * D);
  rot('LeftArm', [1, 0, 0], -35 * D);
  rot('LeftArm', [0, 1, 0], -15 * D);
  rot('LeftForeArm', [1, 0, 0], -55 * D);
  rot('LeftForeArm', [0, 1, 0], -35 * D);
  rot('Head', [0, 1, 0], -20 * D);
  window.root.position.y = -0.52;
  window.root.updateMatrixWorld(true);
  // floor + chair hint
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshStandardMaterial({ color: 0x553322 }),
  );
  floor.rotation.x = -Math.PI / 2;
  window.scene.add(floor);
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.06, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x332211 }),
  );
  seat.position.set(0, 0.45, -0.1);
  window.scene.add(seat);
  const cam = window.cam;
  cam.position.set(1.6, 1.3, 2.2);
  cam.lookAt(0, 0.8, 0);
  window.renderer.render(window.scene, cam);
});
await page.locator('canvas').screenshot({ path: `${out}_sit.png` });
await page.evaluate(() => {
  const cam = window.cam;
  cam.position.set(0, 1.0, 2.6);
  cam.lookAt(0, 0.85, 0);
  window.renderer.render(window.scene, cam);
});
await page.locator('canvas').screenshot({ path: `${out}_sit_front.png` });
await browser.close();
srv.close();
