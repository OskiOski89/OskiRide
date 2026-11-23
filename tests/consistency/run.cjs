const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const { chromium } = require('../../tools/3d/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const output = process.env.OSKIRIDE_TEST_OUTPUT
  ? path.resolve(root, process.env.OSKIRIDE_TEST_OUTPUT)
  : path.join(root, 'output', 'playwright', 'consistency');
const appUrl = 'http://localhost:8080/index.html';
const suites = ['test-stage1', 'test-stage23', 'test-regression', 'test-session', 'test-storage-sources'];

async function serverReady() {
  try {
    const response = await fetch(appUrl, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.text()).includes('OskiRide');
  } catch {
    return false;
  }
}

function updateStorageTest(source) {
  const original = "if(['oskiride_rider_profile_v1','oskiride_ride_recovery_v1','oskiride_ride_history_v1'].includes(key))";
  const init = 'await page.addInitScript(()=>{const real=Storage.prototype.setItem;';
  const finish = "await page.locator('#btn-end-ride').click();";
  for (const marker of [original, init, finish]) assert.ok(source.includes(marker), `Brak linii testu: ${marker}`);
  return source.replace(original, "if(['oskiride_rider_profile_v1','oskiride_ride_recovery_v1'].includes(key))")
    .replace(init, `await page.addInitScript(()=>{
 const open = IDBFactory.prototype.open;
 IDBFactory.prototype.open = function(name, ...args) {
   if (name === 'oskiride-ride-journal') throw new DOMException('Full', 'QuotaExceededError');
   return open.call(this, name, ...args);
 };
 const real=Storage.prototype.setItem;`)
    .replace(finish, `${finish}
    await page.waitForFunction(() => document.getElementById('history-status-label').textContent.includes('Could not save'));`);
}

async function verifyFiles() {
  const previousHtml = await fs.readFile(path.join(__dirname, 'fixtures', 'index.html'), 'utf8');
  const currentHtml = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const currentIds = ids(currentHtml);
  assert.ok(ids(previousHtml).every(id => currentIds.includes(id)), 'Zachowano identyfikatory interfejsu');
  assert.equal(new Set(currentIds).size, currentIds.length, 'Identyfikatory są unikalne');
  const options = html => [...html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
    .map(([, id, markup]) => [id, [...markup.matchAll(/<option\b[^>]*value="([^"]*)"/g)].map(match => match[1])]);
  const now = new Map(options(currentHtml));
  for (const [id, values] of options(previousHtml)) assert.deepEqual(now.get(id), values, `Zachowano wartości ${id}`);
  const { calculateFitCrc } = await import(pathToFileURL(path.join(root, 'src/export/fitExporter.js')).href);
  const fit = await fs.readFile(path.join(output, 'test-ride.fit'));
  assert.equal(fit.subarray(8, 12).toString('ascii'), '.FIT');
  assert.equal(fit.length, fit.readUInt32LE(4) + fit[0] + 2);
  assert.equal(calculateFitCrc(fit, 0, 12), fit.readUInt16LE(12));
  assert.equal(calculateFitCrc(fit, 0, fit.length - 2), fit.readUInt16LE(fit.length - 2));
  const tcx = await fs.readFile(path.join(output, 'test-ride.tcx'), 'utf8');
  assert.ok(tcx.includes('<TrainingCenterDatabase') && tcx.includes('<Trackpoint>') && /<LatitudeDegrees>-?\d+\.\d+<\/LatitudeDegrees>/.test(tcx));
}

async function run() {
  await fs.mkdir(output, { recursive: true });
  let server;
  let browser;
  const channel = process.env.OSKIRIDE_TEST_BROWSER || 'msedge';
  try {
    if (!await serverReady()) {
      server = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, stdio: 'ignore' });
      for (let attempt = 0; attempt < 30 && !await serverReady(); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
      if (!await serverReady()) throw new Error('Nie udało się uruchomić OskiRide na porcie 8080.');
    }
    browser = await chromium.launch({ channel, headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
    const results = [];
    for (const suite of suites) {
      const file = path.join(__dirname, `${suite}.browser.js`);
      let source = (await fs.readFile(file, 'utf8')).replaceAll('__RESULTS_DIR__', output.replaceAll('\\', '/'));
      if (suite === 'test-storage-sources') source = updateStorageTest(source);
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
      try {
        const test = vm.runInThisContext(`(${source})`, { filename: file });
        const result = await test(page);
        assert.ok(result.passed && !result.errors?.length, suite);
        results.push({ suite, ...result });
        console.log(`${suite}: ${result.passed} kontroli OK`);
      } finally {
        await page.close();
      }
    }
    await verifyFiles();
    const passed = results.reduce((sum, result) => sum + result.passed, 0);
    await fs.writeFile(path.join(output, 'wyniki.json'), JSON.stringify({ channel, passed, results, filesVerified: true }, null, 2));
    console.log(`Razem: ${passed} kontroli przeglądarkowych. Sprawdzono też identyfikatory, ustawienia i pliki FIT/TCX.`);
  } finally {
    await browser?.close();
    server?.kill();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
