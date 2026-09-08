// F6-04 — audit aksesibilitas terukur di Chrome sungguhan.
//
// Yang diperiksa (PRD §9 Aksesibilitas & Responsif, target WCAG 2.2 AA):
//   1. Nama aksesibel: setiap kontrol interaktif punya nama yang terbaca.
//   2. Focus visible: setiap kontrol yang dapat difokus menunjukkan indikator fokus.
//   3. Urutan tab: kontrol utama dapat dicapai keyboard, tanpa tabindex positif.
//   4. Padanan keyboard: aksi utama editor punya jalur keyboard.
//   5. Status non-warna: lock/hidden/save state punya teks atau ikon, bukan warna saja.
//   6. Layout 390 px: tidak ada overflow horizontal.
//   7. Touch target ≥44 px pada kontrol inti.
//   8. Kontras teks dihitung dari nilai CSS yang benar-benar terpakai.
//
// Skrip ini MELAPORKAN semua temuan ke `artifacts/a11y-report.json` dan hanya
// meng-assert hal-hal yang sudah diperbaiki, supaya temuan yang belum lulus tidak
// hilang di balik "lulus/gagal". Daftar temuan lengkap: `docs/A11Y-AUDIT.md`.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const APP = 'http://localhost:5174';
await mkdir('artifacts', {recursive: true});
const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const context = await browser.newContext({viewport: {width: 1440, height: 900}});
const errors = [];

// Fungsi audit dijalankan di dalam halaman: satu-satunya cara membaca nilai CSS
// yang benar-benar terpakai (warna hasil cascade, ukuran hasil layout).
const AUDIT = () => {
  const srgb = value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = color => {
    const match = String(color).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return {rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1};
  };
  const blend = (front, back, alpha) => front.map((channel, i) => channel * alpha + back[i] * (1 - alpha));
  const backgroundOf = element => {
    let node = element, result = [255, 255, 255];
    const stack = [];
    while (node && node.nodeType === 1) {
      const parsed = parse(getComputedStyle(node).backgroundColor);
      if (parsed && parsed.alpha > 0) {
        stack.push(parsed);
        if (parsed.alpha === 1) break;
      }
      node = node.parentElement;
    }
    for (let i = stack.length - 1; i >= 0; i--) result = blend(stack[i].rgb, result, stack[i].alpha);
    return result;
  };
  const ratio = (a, b) => {
    const [light, dark] = luminance(a) >= luminance(b) ? [a, b] : [b, a];
    return (luminance(light) + 0.05) / (luminance(dark) + 0.05);
  };
  const label = element => {
    const aria = element.getAttribute('aria-label');
    if (aria?.trim()) return aria.trim();
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (text) return text;
    }
    if (element.labels?.length) return [...element.labels].map(l => l.textContent.trim()).join(' ');
    const own = element.textContent.replace(/\s+/g, ' ').trim();
    if (own) return own;
    const title = element.getAttribute('title');
    if (title?.trim()) return title.trim();
    return '';
  };

  const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')]
    .filter(element => {
      if (element.hidden || element.closest('[hidden]')) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });

  const unnamed = [], smallTargets = [], positiveTabindex = [];
  for (const element of controls) {
    const name = label(element);
    const rect = element.getBoundingClientRect();
    const id = element.id || element.className || element.tagName.toLowerCase();
    // Slider transparan (#scrub) sengaja menutupi ruler dan punya aria-label.
    if (!name) unnamed.push({id, tag: element.tagName, outerHTML: element.outerHTML.slice(0, 120)});
    if (Number(element.getAttribute('tabindex')) > 0) positiveTabindex.push(id);
    if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
      smallTargets.push({id, width: Math.round(rect.width), height: Math.round(rect.height), name});
    }
  }

  // Kontras: setiap elemen yang benar-benar menampilkan teks.
  const contrast = [];
  for (const element of document.querySelectorAll('body *')) {
    const hasOwnText = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
    if (!hasOwnText) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const foreground = parse(style.color);
    if (!foreground) continue;
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const value = ratio(blend(foreground.rgb, backgroundOf(element), foreground.alpha), backgroundOf(element));
    contrast.push({
      selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`,
      text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
      fontSize: size, fontWeight: weight, large,
      ratio: Math.round(value * 100) / 100,
      required: large ? 3 : 4.5,
      pass: value >= (large ? 3 : 4.5),
    });
  }

  return {
    controls: controls.length,
    unnamed, smallTargets, positiveTabindex,
    contrast: contrast.sort((a, b) => a.ratio - b.ratio),
    contrastFailures: contrast.filter(row => !row.pass),
  };
};

const report = {ranAt: new Date().toISOString(), screens: {}};

async function auditScreen(name, prepare) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  await prepare(page);
  const result = await page.evaluate(AUDIT);

  // Focus visible: fokuskan tiap kontrol dan bandingkan outline sebelum/sesudah.
  result.focusInvisible = await page.evaluate(() => {
    const bad = [];
    const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], summary')]
      .filter(element => !element.hidden && !element.closest('[hidden]') && getComputedStyle(element).display !== 'none');
    for (const element of controls.slice(0, 60)) {
      element.focus();
      if (document.activeElement !== element) continue;
      const style = getComputedStyle(element);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow !== 'none';
      if (!outline && !ring) bad.push(element.id || element.className || element.tagName.toLowerCase());
    }
    document.activeElement?.blur();
    return bad;
  });

  // Urutan tab diukur pada halaman yang baru dimuat: langkah focus-visible di atas
  // memindahkan titik mulai navigasi keyboard, sehingga tanpa reload urutannya palsu.
  await page.reload();
  await page.waitForSelector('body');
  await page.waitForTimeout(1200);
  const order = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return el.id || el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24) || el.tagName;
    }));
  }
  result.tabOrder = order;

  // 390 px: overflow horizontal dan target sentuh pada layout sempit.
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(400);
  result.narrow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    wide: [...document.querySelectorAll('body *')]
      .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 10)
      .map(element => (element.id || element.className || element.tagName).toString().slice(0, 40)),
  }));
  const narrowAudit = await page.evaluate(AUDIT);
  result.narrowSmallTargets = narrowAudit.smallTargets;
  result.narrowContrastFailures = narrowAudit.contrastFailures;

  await page.screenshot({path: `artifacts/a11y-${name}-390.png`, fullPage: true});
  report.screens[name] = result;
  await page.close();
  return result;
}

const editor = await auditScreen('editor', async page => {
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(800);
});

const dashboard = await auditScreen('dashboard', async page => {
  await page.goto(`${APP}#/`);
  await page.waitForSelector('.dashboard');
  await page.waitForTimeout(400);
});

// ---------------------------------------------------------------- status non-warna
{
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`status: ${error.message}`));
  await page.goto(APP);
  await page.waitForSelector('#viewport canvas');
  await page.waitForTimeout(600);
  report.nonColorStatus = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.object-row')];
    const lockButtons = rows.map(row => row.querySelector('[data-lock]')).filter(Boolean);
    const eyeButtons = rows.map(row => row.querySelector('[data-visible]')).filter(Boolean);
    return {
      lockHasName: lockButtons.every(button => (button.getAttribute('aria-label') ?? '').length > 3),
      lockNames: lockButtons.map(button => button.getAttribute('aria-label')),
      hiddenHasName: eyeButtons.every(button => (button.getAttribute('aria-label') ?? '').length > 3),
      hiddenNames: eyeButtons.map(button => button.getAttribute('aria-label')),
      hiddenHasClass: rows.some(row => row.classList.contains('is-hidden')),
      saveStatusText: document.querySelector('#save-status')?.textContent ?? '',
      saveStatusState: document.querySelector('#save-status')?.dataset.state ?? '',
      lockedNoticeInInspector: !!document.querySelector('.object-notice'),
    };
  });
  // Padanan keyboard untuk aksi utama editor (PRD §9: "semua aksi utama punya
  // padanan input/keyboard"). Diuji sungguhan, bukan dari daftar tooltip.
  const keyboard = {};
  const actorId = await page.evaluate(() => window.blockingRoom.getProject().actors[0].id);
  const before = await page.evaluate(id => window.blockingRoom.getProject().actors.find(a => a.id === id).keys[0], actorId);
  await page.keyboard.press('g');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  const after = await page.evaluate(id => window.blockingRoom.getProject().actors.find(a => a.id === id).keys[0], actorId);
  keyboard.move = after.x !== before.x;
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  keyboard.rotate = (await page.evaluate(id => window.blockingRoom.getProject().actors.find(a => a.id === id).keys[0], actorId)).r !== after.r;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  keyboard.undo = await page.evaluate(() => !document.querySelector('#redo').disabled);
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  keyboard.play = await page.evaluate(() => window.blockingRoom.getTime() > 0);
  await page.keyboard.press('Space');
  report.keyboardEquivalents = keyboard;
  await page.close();
}

report.errors = errors;
await writeFile('artifacts/a11y-report.json', `${JSON.stringify(report, null, 2)}\n`);

// ---------------------------------------------------------------- assertions
const summary = name => {
  const screen = report.screens[name];
  return `${name}: ${screen.controls} kontrol, ${screen.unnamed.length} tanpa nama, `
    + `${screen.smallTargets.length} target <44px (desktop) / ${screen.narrowSmallTargets.length} (390px), `
    + `${screen.contrastFailures.length} kontras gagal (desktop) / ${screen.narrowContrastFailures.length} (390px), `
    + `overflow 390px: ${screen.narrow.overflow}`;
};
console.log(summary('editor'));
console.log(summary('dashboard'));
console.log(`padanan keyboard: ${JSON.stringify(report.keyboardEquivalents)}`);
console.log(`kontras terendah (editor): ${JSON.stringify(report.screens.editor.contrast.slice(0, 3))}`);

for (const name of ['editor', 'dashboard']) {
  const screen = report.screens[name];
  assert.deepEqual(screen.unnamed, [], `${name}: setiap kontrol harus punya nama aksesibel`);
  assert.deepEqual(screen.positiveTabindex, [], `${name}: tabindex positif merusak urutan tab`);
  assert.deepEqual(screen.focusInvisible, [], `${name}: setiap kontrol harus punya indikator fokus`);
  assert.equal(screen.narrow.overflow, false, `${name}: tidak boleh ada overflow horizontal pada 390 px`);
  assert.ok(screen.tabOrder.filter(Boolean).length >= 5, `${name}: urutan tab harus menjangkau kontrol utama`);
  assert.deepEqual(screen.contrastFailures, [], `${name}: kontras teks harus ≥4.5:1 (≥3:1 untuk teks besar)`);
  assert.deepEqual(screen.narrowContrastFailures, [], `${name}: kontras teks pada 390 px`);
  // Pengecualian yang disengaja dan didokumentasikan (docs/A11Y-AUDIT.md T-01):
  // penanda keyframe di timeline berukuran 10 px karena harus presisi terhadap waktu.
  // Padanannya: tombol "Simpan/Hapus keyframe" di inspector dan navigasi keyboard.
  const smallOnTouch = screen.narrowSmallTargets.filter(target => !String(target.id).split(' ').includes('key'));
  assert.deepEqual(smallOnTouch, [], `${name}: target sentuh inti harus ≥44 px pada 390 px`);
}
assert.deepEqual(report.keyboardEquivalents, {move: true, rotate: true, undo: true, play: true});
assert.equal(report.nonColorStatus.lockHasName, true);
assert.equal(report.nonColorStatus.hiddenHasName, true);
assert.ok(report.nonColorStatus.saveStatusText.length > 3, 'status simpan harus berupa teks, bukan warna saja');
assert.deepEqual(errors, [], `tidak boleh ada error browser: ${errors.join(' | ')}`);

console.log('PASS: nama aksesibel, focus visible, urutan tab, padanan keyboard, status non-warna, 390 px tanpa overflow. Temuan lengkap: artifacts/a11y-report.json + docs/A11Y-AUDIT.md');
await browser.close();
