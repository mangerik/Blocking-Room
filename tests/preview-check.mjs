// Verifikasi build produksi (F6-07 / gate R1 §1 dan gate R2 §1).
//
// Sampai gate R2, `npm run preview` hanya diperiksa manual — dan pemeriksaan manual itu
// melewatkan satu 404 nyata (favicon) karena hanya `pageerror` yang dilihat. Berkas ini
// membuat pemeriksaan itu dapat diulang: ia memuat **build hasil `npm run build`**,
// bukan dev server, lalu menolak setiap error halaman, error console, dan setiap respons
// HTTP ≥400 — termasuk permintaan yang dibuat browser sendiri.
//
// Tidak masuk `npm run test:browser` karena butuh server yang berbeda:
//
//   npm run build
//   npm run preview -- --port 4174 --strictPort   # terminal lain
//   node tests/preview-check.mjs
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.PREVIEW_URL ?? 'http://localhost:4174';
const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 800}});
const problems = [];
page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
page.on('console', message => {if (message.type() === 'error') problems.push(`console: ${message.text()}`);});
page.on('response', response => {if (response.status() >= 400) problems.push(`http ${response.status()} ${response.url()}`);});

await page.goto(base);
await page.waitForSelector('#viewport canvas');
const project = await page.evaluate(() => window.blockingRoom.getProject());
assert.ok(project.actors.length > 0, 'editor build produksi memuat proyek');
assert.equal(await page.locator('#export').isEnabled(), true, 'tombol ekspor aktif di build produksi');

// Identitas build harus terlihat supaya laporan bug pilot dapat ditelusuri (ROLLOUT §8).
const version = (await page.locator('#build-version').first().textContent())?.trim() ?? '';
assert.match(version, /^v\d+\.\d+\.\d+ · \S+/, 'versi build + hash commit terlihat di UI');

await page.goto(`${base}/#/`);
await page.waitForFunction(() => window.blockingRoomDashboard?.getState() === 'ready', null, {timeout: 15_000});
assert.ok(await page.locator('.dash-card').count() >= 1, 'dashboard build produksi menampilkan proyek');
const dashVersion = (await page.locator('#build-version').first().textContent())?.trim() ?? '';
assert.equal(dashVersion, version, 'dashboard menampilkan versi build yang sama dengan editor');

assert.deepEqual(problems, [], `build produksi tidak boleh memunculkan error atau 404: ${problems.join(' | ')}`);
console.log(`PASS preview (${version}): editor + dashboard build produksi tanpa error halaman, error console, atau respons ≥400.`);
await browser.close();
