// F5-01 · spike encoder — probe kapabilitas WebCodecs/MediaRecorder di Chrome.
// Jalankan: node tests/spike/encoder-probe.mjs   (butuh Chrome terpasang + @playwright/test)
// Hasil: artifacts/encoder-probe.json
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const page1 = join(here, 'encoder-probe.html');

// Server http kecil: WebCodecs butuh secure context; localhost dianggap aman.
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(page1);
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end(String(e.message));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const headed = process.env.PROBE_HEADED === '1';
const browser = await chromium.launch({
  headless: !headed, channel: 'chrome',
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--js-flags=--expose-gc']
});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(`http://127.0.0.1:${port}/encoder-probe.html`);
await page.waitForFunction(() => window.__probeDone === true, null, {timeout: 180000});
const result = await page.evaluate(() => window.__probeResult);
result.pageErrors = consoleErrors;
result.probeHost = `http://127.0.0.1:${port}/encoder-probe.html`;
result.chromeVersion = browser.version();
result.headless = !headed;

// Simpan satu file WebM hasil muxer minimal sebagai bukti dapat diputar.
const muxKeys = await page.evaluate(() => Object.keys(window.__muxBlobs || {}));
if (muxKeys.length) {
  const b64 = await page.evaluate(async (k) => {
    const buf = await window.__muxBlobs[k].arrayBuffer();
    let s = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
    return btoa(s);
  }, muxKeys[0]);
  await mkdir(join(root, 'artifacts'), {recursive: true});
  if (!headed) await writeFile(join(root, 'artifacts', 'encoder-probe-webcodecs.webm'), Buffer.from(b64, 'base64'));
  result.savedSample = {key: muxKeys[0], path: 'artifacts/encoder-probe-webcodecs.webm'};
}

await mkdir(join(root, 'artifacts'), {recursive: true});
const out = join(root, 'artifacts', headed ? 'encoder-probe-headed.json' : 'encoder-probe.json');
await writeFile(out, JSON.stringify(result, null, 2));
await browser.close();
server.close();

// Ringkasan ke stdout
const cfg = result.videoEncoderConfigs || [];
const sup = cfg.filter((c) => c.supported);
console.log(`Chrome ${result.chromeVersion} · ${result.ua}`);
console.log(`WebCodecs VideoEncoder: ${result.features?.VideoEncoder} · MediaRecorder: ${result.features?.MediaRecorder} · Worker VideoEncoder: ${JSON.stringify(result.features?.workerVideoEncoder)}`);
console.log(`isConfigSupported: ${sup.length}/${cfg.length} kombinasi didukung`);
const byCodec = new Map();
for (const c of cfg) {
  const e = byCodec.get(c.codec) || {ok: 0, total: 0, label: c.label};
  e.total++; if (c.supported) e.ok++;
  byCodec.set(c.codec, e);
}
for (const [codec, e] of byCodec) console.log(`  ${codec.padEnd(18)} ${e.ok}/${e.total}  ${e.label}`);
console.log('MediaRecorder mime didukung:');
for (const [m, v] of Object.entries(result.mediaRecorder || {})) if (v === true) console.log('  ' + m);
console.log('Encode runs:');
for (const r of result.encodeRuns || []) {
  if (r.skipped || r.failed) { console.log(`  ${r.codec} ${r.width}x${r.height}@${r.fps} — ${r.skipped || r.failed}`); continue; }
  console.log(`  ${r.codec} ${r.width}x${r.height}@${r.fps} x${r.framesSubmitted}: chunk=${r.chunks} key=${r.keyframes} bytes=${r.bytes} ${r.totalMs}ms (${r.msPerFrame} ms/frame, ${r.realtimeRatio}x realtime) ts-monotonic=${r.timestampsMonotonic} spacing-exact=${r.timestampSpacingExact} heapDelta=${r.heapDeltaBytes}`);
}
console.log('Mux (muxer WebM minimal buatan sendiri):');
for (const m of result.muxProbes || []) {
  if (m.failed) { console.log(`  ${m.codec} — GAGAL ${m.failed}`); continue; }
  const p = m.playback || {};
  console.log(`  ${m.codec} ${m.width}x${m.height}@${m.fps} x${m.frames}: file=${m.fileBytes} B overhead=${m.containerOverheadBytes} B mux=${m.muxMs}ms duration=${p.duration} seekOk=${p.seekOk} decodedPx=${p.decodedNonBlackPixels} ${p.error ? 'ERR ' + p.error : ''}`);
}
console.log('Runtime error cases:');
for (const r of result.runtimeErrors || []) console.log(`  ${r.case}: threw=${r.threw} ${r.name || ''} ${r.message || ''}`);
if (consoleErrors.length) console.log('Page errors: ' + JSON.stringify(consoleErrors));
console.log(`\nDitulis ke ${out}`);
