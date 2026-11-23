import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createSceneryPlacement } from '../../src/world/sceneryPlacement.js';

const rectangle = (x, z, width, depth, minY = 0, maxY = 4) => ({
  minX: x - width / 2, maxX: x + width / 2,
  minZ: z - depth / 2, maxZ: z + depth / 2, minY, maxY,
  polygon: [
    { x: x - width / 2, z: z - depth / 2 }, { x: x + width / 2, z: z - depth / 2 },
    { x: x + width / 2, z: z + depth / 2 }, { x: x - width / 2, z: z + depth / 2 },
  ],
});

// Sparse road points used to miss obstacles halfway along a segment.
const sparse = createSceneryPlacement([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }], 7.2);
assert.equal(sparse.reserve([rectangle(0, -50, 1, 1)], 'tree'), false);
assert.equal(sparse.reserve([rectangle(7, -50, 2, 2)], 'tree'), true);
assert.equal(sparse.reserve([rectangle(7.5, -50, 2, 2)], 'rock'), false);
assert.equal(sparse.reserve([rectangle(7, -50, 2, 2, 12, 15)], 'turbine'), true);
// The opening beneath a banner remains clear, while its pillars are checked.
assert.equal(sparse.reserve([
  rectangle(-4.1, -25, 0.46, 0.46, -2.2, 5.4),
  rectangle(4.1, -25, 0.46, 0.46, -2.2, 5.4),
  rectangle(0, -25, 8.7, 0.65, 4.725, 5.875),
], 'arch'), true);
// Clearance includes roads above an object's base and all switchback segments.
const raised = createSceneryPlacement([{ x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: -100 }], 7.2);
assert.equal(raised.reserve([rectangle(0, -50, 2, 2, 0, 15)], 'tree'), false);
assert.equal(raised.reserve([rectangle(0, -50, 2, 2, 0, 4)], 'rock'), true);
assert.equal(sparse.reserve([rectangle(12, -60, 2, 2)], 'tent', false), true);
assert.equal(sparse.reserve([rectangle(12, -60, 2, 2)], 'tent'), true);
const joints = createSceneryPlacement([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }], 7.2);
assert.equal(joints.reserve([rectangle(7, -50, 1, 4)], 'guardrail', true, [48, 52]), true);
assert.equal(joints.reserve([rectangle(7, -54, 1, 4)], 'guardrail', true, [52, 56]), true);
assert.equal(joints.reserve([rectangle(7, -50, 1, 4)], 'guardrail', true, [200, 204]), false);
console.log('Placement regression checks passed.');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');
  const report = await page.evaluate(async () => {
    const THREE = await import('/grafika/vendor/three.module.js');
    const { buildRouteWorld } = await import('/src/world/worldBuilder.js');
    const { generatePresetRoute, parseGPXToRoute, detectClimbs, smoothRouteHorizontalArcs } = await import('/src/gpx/gpxParser.js');
    const cases = [];
    const gpx = parseGPXToRoute(await (await fetch('/przelecz-gorska.gpx')).text());
    const synthetic = (coords) => {
      let dist = 0;
      return coords.map(([x, y, z], i) => {
        if (i) dist += Math.hypot(x - coords[i - 1][0], z - coords[i - 1][2]);
        return { x, y, z, dist, ele: y, grade: 0, turnAngleDeg: 0 };
      });
    };
    const hairpin = synthetic([[0, 0, 0], [0, 0, -120], [12, 0, -140], [24, 0, -120], [24, 0, 0], [36, 0, 20], [48, 0, 0], [48, 0, -150]]);
    const short = synthetic([[0, 0, 0], [0, 0, -15], [0, 0, -30]]);
    for (const name of ['mountain', 'switchbacks', 'rolling', 'flat', 'gpx', 'hairpin', 'short']) {
      for (const quality of ['eco', 'medium', 'ultra']) {
        const points = name === 'gpx' ? gpx : name === 'hairpin' ? hairpin : name === 'short' ? short : generatePresetRoute(name);
        const scene = new THREE.Scene();
        const start = performance.now();
        const built = buildRouteWorld(scene, points, null, { quality, climbs: detectClimbs(points) });
        const buildMs = performance.now() - start;
        const kinds = {};
        let meshes = 0;
        const labels = [];
        built.routeGroup.traverse(object => {
          if (object.isMesh) {
            meshes++;
            const data = object.geometry.attributes.position?.array;
            if (data && !data.every(Number.isFinite)) throw new Error(`${name}: non-finite geometry`);
          }
          const kind = object.userData.sceneryKind;
          if (kind) kinds[kind] = (kinds[kind] || 0) + 1;
          if (object.userData.labelText) labels.push(object.userData.labelText);
        });
        const startUpdate = performance.now();
        for (let i = 0; i <= 3000; i++) built.updateVisibleWindow(built.totalDistanceM * i / 3000);
        const updateMs = (performance.now() - startUpdate) / 3001;
        // Check indexed draw ranges at the finish, including very short windows.
        for (const object of built.routeGroup.children) {
          if (!object.isMesh || !object.geometry.index) continue;
          const { start, count } = object.geometry.drawRange;
          if (Number.isFinite(count) && start + count > object.geometry.index.count) throw new Error(`${name}: invalid draw range`);
        }
        cases.push({ name, quality, buildMs, updateMs, meshes, kinds, labels, placement: { ...built.routeGroup.userData.placementStats } });
        const geometries = new Set(), materials = new Set();
        built.routeGroup.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) materials.add(material);
        });
        for (const fan of built.animatedObjects.spectators) fan.dispose?.();
        geometries.forEach(g => g.dispose());
        materials.forEach(m => m.dispose());
        scene.clear();
      }
    }
    // A long route verifies bounded smoothing work and exact endpoint retention.
    const long = Array.from({ length: 25001 }, (_, i) => ({ x: i * 4, y: 0, z: Math.sin(i / 20), rawEle: 0 }));
    const start = performance.now();
    const smoothed = smoothRouteHorizontalArcs(long, 49.25, 19.95);
    if (smoothed[0].x !== 0 || smoothed.at(-1).x !== 100000) throw new Error('Smoothing moved an endpoint');
    return { cases, smoothing100kmMs: performance.now() - start };
  });
  assert.deepEqual(errors, [], 'Browser errors');
  for (const result of report.cases) {
    if (result.name !== 'short') assert.ok(result.kinds.tree > 0, `${result.name}/${result.quality}: missing trees`);
    assert.ok(result.kinds.arch >= 2, `${result.name}/${result.quality}: missing start/finish arches`);
    assert.ok(result.labels.includes('START'), `${result.name}/${result.quality}: missing start`);
    assert.ok(result.labels.includes('🏁 META / FINISH'), `${result.name}/${result.quality}: missing finish`);
    if (result.name === 'flat') assert.ok(result.kinds.tunnel > 0, 'No tunnels on a gentle route');
    assert.ok(result.updateMs < 16, `${result.name}/${result.quality}: window update exceeds frame budget`);
  }
  const outputDir = 'output/route-world';
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(`${outputDir}/route-world-verification.json`, JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({
    cases: report.cases.length,
    buildMs: [Math.min(...report.cases.map(c => c.buildMs)), Math.max(...report.cases.map(c => c.buildMs))],
    worstWindowUpdateMs: Math.max(...report.cases.map(c => c.updateMs)),
    smoothing100kmMs: report.smoothing100kmMs,
  }, null, 2));
  await page.locator('#btn-settings-close').click();
  await page.waitForFunction(() => document.querySelector('#settings-modal').classList.contains('hidden'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outputDir}/route-world-verification.png` });
  assert.deepEqual(errors, [], 'Errors after starting the ride');
} finally {
  await browser.close();
}
