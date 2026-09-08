// Dialog ekspor (F5-02, EX-01) — seluruh UI ekspor ada di modul ini supaya
// `src/main.js` hanya menyediakan snapshot dokumen dan beberapa kait kecil.
//
// Prinsip yang dijaga dialog ini:
//
// 1. **Hanya menawarkan yang benar-benar tersedia.** Dua daftar kapabilitas yang
//    TERPISAH: `VideoEncoder.isConfigSupported` (deterministik) dan
//    `MediaRecorder.isTypeSupported` (real-time). Spike §5 membuktikan keduanya
//    tidak dapat saling menyimpulkan, jadi keduanya diperiksa sendiri-sendiri.
// 2. **Format yang belum ada dikatakan belum ada.** MP4 muncul sebagai opsi
//    nonaktif dengan alasannya, bukan hilang diam-diam dan bukan dijanjikan.
// 3. **"Ekspor selesai" hanya setelah Blob siap.** Pesan sukses dan metrik
//    `export_completed` ditulis setelah `job.run()` resolve.
// 4. **Snapshot immutable.** Dokumen di-deep-clone saat tombol ekspor ditekan;
//    seluruh job memakai salinan itu (F5-03).

import {readSceneView} from '../document.js';
import {aspectValue} from '../timeline-engine.js';
import {
  DEFAULT_RESOLUTION, ExportJob, ExportQueue, FPS_CHOICES, RESOLUTION_PRESETS,
  buildFileName, estimateBufferBytes, exportSize, formatBytes, resolveRange, sanitizeSegment,
} from './export-service.js';
import {UNAVAILABLE_FORMATS, probeDeterministicCodecs} from './encoder.js';
import {ShotFrameSource} from './frame-source.js';
import {RealtimeExportJob, realtimeExtension, realtimeMimeTypes} from './realtime.js';
import {collectShots, shotListCsv, shotListJson, storyboardFrames} from './shot-list.js';

const MARKUP = `
<div class="export-head"><b>Ekspor video</b><button class="ghost small" id="export-close" type="button">Tutup</button></div>
<div class="export-body">
  <fieldset class="export-group">
    <legend>Shot yang diekspor</legend>
    <div class="export-shots" id="export-shots"></div>
    <p class="hint" id="export-shot-hint"></p>
  </fieldset>
  <fieldset class="export-group">
    <legend>Rentang</legend>
    <label class="field">Bagian shot
      <select id="export-range-mode">
        <option value="all">Seluruh shot</option>
        <option value="frames">Rentang frame</option>
        <option value="seconds">Rentang detik</option>
      </select>
    </label>
    <div class="input-row two" id="export-range-inputs" hidden>
      <label class="field"><span id="export-range-start-label">Frame awal</span><input id="export-range-start" type="number" step="1" min="0" value="0"/></label>
      <label class="field"><span id="export-range-end-label">Frame akhir</span><input id="export-range-end" type="number" step="1" min="0" value="0"/></label>
    </div>
  </fieldset>
  <fieldset class="export-group">
    <legend>Format</legend>
    <label class="field">Resolusi<select id="export-resolution"></select></label>
    <label class="field">Frame rate<select id="export-fps"></select></label>
    <label class="field">Codec<select id="export-codec"></select></label>
    <p class="hint" id="export-codec-note"></p>
  </fieldset>
  <fieldset class="export-group">
    <legend>Referensi produksi</legend>
    <label class="export-check"><input type="checkbox" id="export-burnin"/><span>Burn-in nama shot, timecode dan lensa</span></label>
    <label class="export-check"><input type="checkbox" id="export-overlay"/><span>Sertakan overlay editor (jalur gerak, grid, safe area)</span></label>
    <label class="export-check"><input type="checkbox" id="export-storyboard"/><span>PNG storyboard: frame awal, tengah dan akhir</span></label>
    <label class="export-check"><input type="checkbox" id="export-shotlist"/><span>Shot list proyek (JSON + CSV)</span></label>
  </fieldset>
  <p class="export-summary" id="export-summary"></p>
  <div class="export-progress-row" id="export-progress-row" hidden>
    <progress id="export-progress" max="100" value="0"></progress>
    <span id="export-progress-text"></span>
  </div>
  <p class="export-message" id="export-message" role="status"></p>
  <div class="export-files" id="export-files" hidden>
    <p class="hint" id="export-files-hint"></p>
    <ul id="export-files-list"></ul>
  </div>
</div>
<div class="export-actions">
  <button class="primary" id="export-start" type="button">Mulai ekspor</button>
  <button id="export-retry" type="button" hidden>Coba lagi</button>
  <button class="ghost" id="export-cancel" type="button" hidden>Batalkan</button>
</div>`;

/** Label codec tertutup untuk `src/metrics.js` (tidak ada mime mentah di metrik). */
export const metricsCodec = value => (/vp9|vp09/i.test(value) ? 'vp9'
  : /vp8|vp08/i.test(value) ? 'vp8'
  : /avc|h\.?264/i.test(value) ? 'h264'
  : /av01|av1/i.test(value) ? 'av1' : 'unknown');

/**
 * Membuat dialog ekspor dan mengembalikan kait untuk `src/main.js`.
 *
 * @param {{
 *   getSnapshot:()=>object,           salinan dokumen (deep clone)
 *   getActive:()=>{sceneId:string, shotId:string},
 *   notify:(message:string)=>void,
 *   download:(blob:Blob, name:string)=>void,
 *   setBusy:(busy:boolean)=>void,
 *   metrics:object,
 *   saveRevision?:(doc:object)=>Promise<any>,
 *   scope?:object
 * }} deps
 */
export function createExportDialog(deps) {
  const scope = deps.scope ?? globalThis;
  const doc = scope.document;
  const root = doc.createElement('div');
  root.className = 'export-dialog';
  root.id = 'export-dialog';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Ekspor video');
  root.hidden = true;
  root.innerHTML = MARKUP;
  doc.body.appendChild(root);

  const $ = id => root.querySelector(`#${id}`);
  const els = {
    shots: $('export-shots'), shotHint: $('export-shot-hint'),
    rangeMode: $('export-range-mode'), rangeInputs: $('export-range-inputs'),
    rangeStart: $('export-range-start'), rangeEnd: $('export-range-end'),
    rangeStartLabel: $('export-range-start-label'), rangeEndLabel: $('export-range-end-label'),
    resolution: $('export-resolution'), fps: $('export-fps'), codec: $('export-codec'),
    codecNote: $('export-codec-note'), summary: $('export-summary'),
    burnIn: $('export-burnin'), overlay: $('export-overlay'),
    storyboard: $('export-storyboard'), shotList: $('export-shotlist'),
    progressRow: $('export-progress-row'), progress: $('export-progress'), progressText: $('export-progress-text'),
    message: $('export-message'),
    files: $('export-files'), filesHint: $('export-files-hint'), filesList: $('export-files-list'),
    start: $('export-start'), retry: $('export-retry'), cancel: $('export-cancel'), close: $('export-close'),
  };

  // ------------------------------------------------------------------ pengiriman berkas
  //
  // Batch shot menghasilkan banyak berkas (video + PNG storyboard + shot list). Memanggil
  // `download()` beberapa kali dalam satu tick membuat Chrome menampilkan izin "Unduh
  // beberapa berkas" dan dapat MENJATUHKAN unduhan berikutnya tanpa pesan apa pun
  // (risiko yang dicatat `docs/handoff/phase5-report.md`). Dua penanganan di sini:
  //
  // 1. Unduhan diserialkan dengan jeda `DOWNLOAD_GAP_MS`, jadi tidak pernah ada dua
  //    unduhan dalam satu tick.
  // 2. Setiap berkas yang dihasilkan tetap disimpan di dialog sebagai tombol "Unduh
  //    ulang", sehingga berkas yang diblokir browser tidak hilang bersama job-nya.
  //
  // Blob ditahan dengan batas jumlah dan ukuran supaya batch panjang tidak menghabiskan
  // memori; entri terlama dibuang lebih dahulu dan dinyatakan pada UI.
  const DOWNLOAD_GAP_MS = 300;
  const KEEP_FILES = 24;
  const KEEP_BYTES = 250 * 1024 * 1024;
  let produced = [];        // [{name, blob, bytes}] hasil job terakhir
  let deliverChain = Promise.resolve();

  const wait = ms => new Promise(resolve => scope.setTimeout(resolve, ms));

  function rememberFile(name, blob) {
    produced.push({name, blob, bytes: blob.size ?? 0});
    let dropped = 0;
    const total = () => produced.reduce((sum, item) => sum + item.bytes, 0);
    while (produced.length > KEEP_FILES || (produced.length > 1 && total() > KEEP_BYTES)) {
      produced.shift();
      dropped += 1;
    }
    renderFiles(dropped);
  }

  function renderFiles(dropped = 0) {
    if (!produced.length) {els.files.hidden = true; els.filesList.textContent = ''; return;}
    els.files.hidden = false;
    els.filesHint.textContent = produced.length === 1
      ? 'Berkas hasil ekspor. Bila browser memblokir unduhan otomatis, unduh ulang dari sini.'
      : `${produced.length} berkas hasil ekspor. Browser dapat meminta izin “unduh beberapa berkas”; `
        + `yang tertahan dapat diunduh ulang dari daftar ini${dropped ? ' (berkas terlama dilepas agar tidak menghabiskan memori)' : ''}.`;
    els.filesList.textContent = '';
    for (const item of produced) {
      const li = doc.createElement('li');
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'ghost small';
      button.dataset.redownload = item.name;
      button.textContent = `Unduh ulang ${item.name}`;
      button.title = `${item.name} · ${formatBytes(item.bytes)}`;
      button.onclick = () => deps.download(item.blob, item.name);
      li.appendChild(button);
      els.filesList.appendChild(li);
    }
  }

  /** Mengunduh satu berkas, diserialkan terhadap unduhan lain, dan mencatatnya di dialog. */
  function deliver(blob, name) {
    rememberFile(name, blob);
    deliverChain = deliverChain
      .then(() => deps.download(blob, name))
      .then(() => wait(DOWNLOAD_GAP_MS))
      .catch(() => {/* kegagalan satu unduhan tidak boleh menghentikan sisanya */});
    return deliverChain;
  }

  let snapshot = null;      // dokumen yang sedang ditampilkan dialog
  let entries = [];         // seluruh shot proyek
  let running = null;       // {queue, sources[]} saat job berjalan
  let probeToken = 0;

  for (const [id, preset] of Object.entries(RESOLUTION_PRESETS)) {
    const option = doc.createElement('option');
    option.value = id;
    option.textContent = preset.label;
    els.resolution.appendChild(option);
  }
  els.resolution.value = DEFAULT_RESOLUTION;

  function selectedEntries() {
    const checked = new Set([...els.shots.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value));
    return entries.filter(entry => checked.has(entry.shotId));
  }

  function activeFps(entry) {
    return els.fps.value === 'shot' ? entry.fps : Number(els.fps.value);
  }

  function rangeSetting() {
    const mode = els.rangeMode.value;
    if (mode === 'all') return {mode: 'all'};
    return {mode, start: Number(els.rangeStart.value), end: Number(els.rangeEnd.value)};
  }

  function setMessage(text, tone = 'info') {
    els.message.textContent = text ?? '';
    els.message.dataset.tone = tone;
  }

  function renderShots() {
    els.shots.innerHTML = '';
    const active = deps.getActive();
    for (const entry of entries) {
      const label = doc.createElement('label');
      label.className = 'export-check';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.value = entry.shotId;
      input.checked = entry.shotId === active.shotId;
      input.addEventListener('change', () => {onSelectionChanged();});
      const span = doc.createElement('span');
      span.textContent = `${entry.sceneName} · ${entry.shotName} — ${entry.durationSeconds}s @ ${entry.fps} fps, ${entry.aspectRatio}`
        + (entry.hasCamera ? '' : ' (tanpa kamera)');
      if (!entry.hasCamera) {
        input.disabled = true;
        input.checked = false;
        label.classList.add('is-blocked');
      }
      label.append(input, span);
      els.shots.appendChild(label);
    }
  }

  function updateRangeUi() {
    const picked = selectedEntries();
    const single = picked.length === 1;
    els.rangeMode.disabled = !single;
    if (!single && els.rangeMode.value !== 'all') els.rangeMode.value = 'all';
    const mode = els.rangeMode.value;
    els.rangeInputs.hidden = mode === 'all';
    if (mode === 'all' || !single) return;
    const entry = picked[0];
    const fps = activeFps(entry);
    const lastFrame = Math.max(0, Math.round(entry.durationSeconds * fps) - 1);
    if (mode === 'frames') {
      els.rangeStartLabel.textContent = 'Frame awal';
      els.rangeEndLabel.textContent = `Frame akhir (maks ${lastFrame})`;
      els.rangeStart.step = '1';
      els.rangeEnd.step = '1';
      if (els.rangeEnd.dataset.mode !== 'frames') {
        els.rangeStart.value = '0';
        els.rangeEnd.value = String(lastFrame);
      }
    } else {
      els.rangeStartLabel.textContent = 'Detik awal';
      els.rangeEndLabel.textContent = `Detik akhir (maks ${entry.durationSeconds})`;
      els.rangeStart.step = '0.1';
      els.rangeEnd.step = '0.1';
      if (els.rangeEnd.dataset.mode !== 'seconds') {
        els.rangeStart.value = '0';
        els.rangeEnd.value = String(entry.durationSeconds);
      }
    }
    els.rangeEnd.dataset.mode = mode;
  }

  function renderFpsOptions() {
    const picked = selectedEntries();
    const shotFps = picked.length ? [...new Set(picked.map(e => e.fps))] : [];
    const previous = els.fps.value;
    els.fps.innerHTML = '';
    const follow = doc.createElement('option');
    follow.value = 'shot';
    follow.textContent = shotFps.length === 1 ? `Ikuti shot (${shotFps[0]} fps)` : 'Ikuti setiap shot';
    els.fps.appendChild(follow);
    for (const value of FPS_CHOICES) {
      const option = doc.createElement('option');
      option.value = String(value);
      option.textContent = `${value} fps`;
      els.fps.appendChild(option);
    }
    els.fps.value = previous && [...els.fps.options].some(o => o.value === previous) ? previous : 'shot';
  }

  /**
   * Mengisi ulang daftar codec dari kapabilitas nyata browser untuk ukuran dan
   * fps yang sedang dipilih. Dipanggil ulang setiap kali salah satunya berubah —
   * `avc1.640028` misalnya lolos di 1080p tetapi `avc1.42E01E` tidak lolos di 720p30.
   */
  async function refreshCodecs() {
    const token = ++probeToken;
    const picked = selectedEntries();
    const entry = picked[0] ?? entries[0];
    if (!entry) return;
    const fps = activeFps(entry);
    const {width, height} = exportSize(entry.aspectRatio, els.resolution.value);
    const previous = els.codec.value;
    els.codec.innerHTML = '';
    els.codec.disabled = true;
    const deterministic = await probeDeterministicCodecs({width, height, fps, scope});
    if (token !== probeToken) return;
    const groupDet = doc.createElement('optgroup');
    groupDet.label = 'Deterministik (frame-akurat)';
    let firstSupported = null;
    for (const row of deterministic) {
      const option = doc.createElement('option');
      option.value = `det:${row.id}`;
      option.textContent = `${row.label}${row.supported ? '' : ' — tidak didukung di sini'}`;
      option.disabled = !row.supported;
      option.dataset.note = row.supported ? row.note : (row.reason ?? '');
      groupDet.appendChild(option);
      if (row.supported && !firstSupported) firstSupported = option.value;
    }
    if (deterministic.length) els.codec.appendChild(groupDet);
    if (!deterministic.length) {
      const option = doc.createElement('option');
      option.value = 'none';
      option.disabled = true;
      option.textContent = 'Deterministik tidak tersedia (browser tanpa WebCodecs)';
      els.codec.appendChild(option);
    }

    const groupRt = doc.createElement('optgroup');
    groupRt.label = 'Real-time (tidak frame-akurat)';
    let firstRealtime = null;
    for (const mime of realtimeMimeTypes(scope)) {
      const option = doc.createElement('option');
      option.value = `rt:${mime}`;
      option.textContent = `${mime} — Real-time (tidak frame-akurat)`;
      option.dataset.note = 'Perekaman mengikuti jam: jumlah frame tidak dijamin. '
        + 'Nama berkas diberi akhiran _realtime dan hasilnya tidak memenuhi gate deterministik.';
      groupRt.appendChild(option);
      if (!firstRealtime) firstRealtime = option.value;
    }
    if (groupRt.children.length) els.codec.appendChild(groupRt);

    const groupNa = doc.createElement('optgroup');
    groupNa.label = 'Belum tersedia';
    for (const row of UNAVAILABLE_FORMATS) {
      const option = doc.createElement('option');
      option.value = `na:${row.id}`;
      option.disabled = true;
      option.textContent = row.label;
      option.dataset.note = row.reason;
      groupNa.appendChild(option);
    }
    els.codec.appendChild(groupNa);

    const usable = [...els.codec.options].filter(o => !o.disabled).map(o => o.value);
    els.codec.value = usable.includes(previous) ? previous : (firstSupported ?? firstRealtime ?? '');
    els.codec.disabled = usable.length === 0;
    els.start.disabled = usable.length === 0 || !selectedEntries().length;
    updateCodecNote();
    updateSummary();
  }

  function updateCodecNote() {
    const option = els.codec.selectedOptions[0];
    els.codecNote.textContent = option?.dataset.note ?? '';
  }

  function updateSummary() {
    const picked = selectedEntries();
    if (!picked.length) {
      els.summary.textContent = 'Pilih minimal satu shot yang memiliki kamera.';
      els.start.disabled = true;
      return;
    }
    els.start.disabled = els.codec.disabled || !els.codec.value;
    let frames = 0;
    let bytes = 0;
    let notice = '';
    for (const entry of picked) {
      const fps = activeFps(entry);
      const {width, height} = exportSize(entry.aspectRatio, els.resolution.value);
      try {
        const range = resolveRange({duration: entry.durationSeconds, fps, range: picked.length === 1 ? rangeSetting() : {mode: 'all'}});
        frames += range.frameCount;
        bytes += estimateBufferBytes({width, height, fps, frameCount: range.frameCount});
        if (range.notice) notice = range.notice;
      } catch (error) {
        els.summary.textContent = error.message;
        els.start.disabled = true;
        return;
      }
    }
    const first = picked[0];
    const size = exportSize(first.aspectRatio, els.resolution.value);
    const name = buildFileName({
      project: snapshot?.title, scene: first.sceneName, shot: first.shotName,
      extension: els.codec.value.startsWith('rt:') ? realtimeExtension(els.codec.value.slice(3)) : 'webm',
      realtime: els.codec.value.startsWith('rt:'),
    });
    const fileCount = picked.length * (1 + (els.storyboard.checked ? 3 : 0)) + (els.shotList.checked ? 2 : 0);
    els.summary.textContent = `${picked.length} shot · ${frames} frame · ${size.width}×${size.height}`
      + ` · perkiraan ${formatBytes(bytes)} · berkas pertama: ${name}`
      + (fileCount > 1 ? ` · ${fileCount} berkas akan diunduh (browser dapat meminta izin “unduh beberapa berkas”)` : '')
      + (notice ? ` · ${notice}` : '');
  }

  function onSelectionChanged() {
    renderFpsOptions();
    updateRangeUi();
    refreshCodecs();
  }

  els.resolution.addEventListener('change', () => {updateRangeUi(); refreshCodecs();});
  els.fps.addEventListener('change', () => {els.rangeEnd.dataset.mode = ''; updateRangeUi(); refreshCodecs();});
  els.codec.addEventListener('change', () => {updateCodecNote(); updateSummary();});
  els.rangeMode.addEventListener('change', () => {els.rangeEnd.dataset.mode = ''; updateRangeUi(); updateSummary();});
  els.rangeStart.addEventListener('input', updateSummary);
  els.rangeEnd.addEventListener('input', updateSummary);
  els.storyboard.addEventListener('change', updateSummary);
  els.shotList.addEventListener('change', updateSummary);
  els.close.addEventListener('click', () => close());
  els.cancel.addEventListener('click', () => {
    running?.queue.cancelAll();
    running?.realtime?.cancel();
    setMessage('Membatalkan ekspor…', 'warn');
  });
  els.retry.addEventListener('click', () => {els.retry.hidden = true; start();});
  els.start.addEventListener('click', () => start());
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !running) close();
  });

  function open() {
    snapshot = deps.getSnapshot();
    entries = collectShots(snapshot);
    if (!entries.some(e => e.hasCamera)) {
      setMessage('Tidak ada shot yang memiliki kamera. Tambahkan kamera sebelum mengekspor.', 'error');
    } else {
      setMessage('');
    }
    els.shotHint.textContent = 'Shot tanpa kamera tidak dapat diekspor.';
    renderShots();
    renderFpsOptions();
    els.rangeEnd.dataset.mode = '';
    updateRangeUi();
    root.hidden = false;
    els.progressRow.hidden = true;
    els.retry.hidden = true;
    els.cancel.hidden = true;
    els.start.hidden = false;
    refreshCodecs();
    els.close.focus();
  }

  function close() {
    if (running) return;
    root.hidden = true;
  }

  function setProgress({label, percent}) {
    els.progressRow.hidden = false;
    els.progress.value = Math.max(0, Math.min(100, percent ?? 0));
    els.progressText.textContent = label;
  }

  /** Membangun satu job (deterministik atau real-time) beserta sumber framenya. */
  function buildJob(entry, {index, total}) {
    const fps = activeFps(entry);
    const {width, height} = exportSize(entry.aspectRatio, els.resolution.value);
    const view = readSceneView(snapshot, entry.sceneId, entry.shotId);
    const source = new ShotFrameSource({
      view, aspectRatio: entry.aspectRatio, width, height, fps,
      shotName: entry.shotName, sceneName: entry.sceneName,
      burnIn: els.burnIn.checked, includeEditorOverlay: els.overlay.checked,
      documentRef: doc,
    });
    const naming = {project: snapshot.title, scene: entry.sceneName, shot: entry.shotName};
    const onProgress = info => setProgress({
      label: `Shot ${index + 1}/${total} · ${entry.shotName} · frame ${info.frame}/${info.total} (${info.percent}%)`,
      percent: info.percent,
    });
    if (els.codec.value.startsWith('rt:')) {
      const job = new RealtimeExportJob({
        source, mimeType: els.codec.value.slice(3), fps,
        duration: entry.durationSeconds, naming, onProgress, scope,
      });
      return {job, source, entry, fps, width, height, realtime: true};
    }
    const job = new ExportJob({
      naming,
      settings: {
        width, height, fps, codecId: els.codec.value.slice(4),
        duration: entry.durationSeconds,
        range: total === 1 ? rangeSetting() : {mode: 'all'},
      },
      renderFrame: (time, _index, absoluteFrame) => source.render(time, absoluteFrame),
      onProgress,
      scope,
    });
    return {job, source, entry, fps, width, height, realtime: false};
  }

  async function emitStoryboard(unit) {
    const frames = storyboardFrames({duration: unit.entry.durationSeconds, fps: unit.fps});
    for (const item of frames) {
      const blob = await unit.source.toPng(item.time, item.frame);
      await deliver(blob, buildFileName({
        project: snapshot.title, scene: unit.entry.sceneName, shot: unit.entry.shotName,
        extension: 'png', suffix: `${item.label}-f${item.frame}`,
      }));
    }
  }

  function emitShotList() {
    const rows = collectShots(snapshot);
    const base = sanitizeSegment(snapshot.title, 'proyek');
    deliver(new Blob([shotListJson(snapshot, rows)], {type: 'application/json'}), `${base}_shot-list.json`);
    deliver(new Blob([shotListCsv(rows)], {type: 'text/csv;charset=utf-8'}), `${base}_shot-list.csv`);
  }

  async function start() {
    if (running) return;
    const picked = selectedEntries();
    if (!picked.length) {setMessage('Pilih minimal satu shot.', 'error'); return;}
    if (!els.codec.value || els.codec.disabled) {
      setMessage('Browser ini tidak menyediakan satu pun format video yang dapat dipakai. Gunakan Chrome atau Edge terbaru.', 'error');
      return;
    }
    // F5-03: satu snapshot untuk seluruh antrean. Sejak baris ini, mengedit scene
    // tidak lagi dapat mengubah hasil job mana pun.
    snapshot = deps.getSnapshot();
    entries = collectShots(snapshot);
    const chosen = new Set(picked.map(p => p.shotId));
    const jobsFor = entries.filter(e => chosen.has(e.shotId) && e.hasCamera);
    if (!jobsFor.length) {setMessage('Shot yang dipilih tidak memiliki kamera.', 'error'); return;}

    const realtime = els.codec.value.startsWith('rt:');
    const resolutionLabel = els.resolution.value;
    const codecMetric = metricsCodec(realtime ? els.codec.value.slice(3) : els.codec.value.slice(4));
    deps.metrics?.record('export_started', {codec: codecMetric, resolution: resolutionLabel, fps: activeFps(jobsFor[0])});
    const startedAt = scope.performance.now();

    els.start.hidden = true;
    els.retry.hidden = true;
    els.cancel.hidden = false;
    els.close.disabled = true;
    setMessage(realtime
      ? 'Merekam real-time. Biarkan tab ini terlihat sampai selesai — jumlah frame tidak dijamin.'
      : 'Ekspor deterministik berjalan. Tab boleh berada di latar belakang.', 'info');
    deps.setBusy(true);

    produced = [];
    renderFiles();
    const queue = new ExportQueue();
    const units = [];
    running = {queue, realtime: null};
    let ok = 0;
    let failure = null;
    try {
      if (deps.saveRevision) {
        try {await deps.saveRevision(snapshot);} catch {/* revisi ekspor bersifat bonus */}
      }
      for (let i = 0; i < jobsFor.length; i += 1) {
        if (queue.cancelled) break;
        const unit = buildJob(jobsFor[i], {index: i, total: jobsFor.length});
        units.push(unit);
        // Job didaftarkan ke antrean SEBELUM dijalankan supaya tombol "Batalkan"
        // benar-benar mengenai job yang sedang berjalan, bukan antrean kosong.
        queue.add(unit.job);
        queue.current = unit.job;
        running.realtime = unit.realtime ? unit.job : null;
        try {
          const result = await unit.job.run();
          await deliver(result.blob, result.fileName);
          if (els.storyboard.checked) await emitStoryboard(unit);
          ok += 1;
          setMessage(result.realtime
            ? `Rekaman real-time ${result.fileName} selesai (${formatBytes(result.byteSize)}). Jumlah frame tidak dijamin.`
            : `Ekspor selesai: ${result.fileName} — ${result.frameCount} frame, ${formatBytes(result.byteSize)}.`, 'ok');
        } catch (error) {
          failure = error;
          if (unit.job.status === 'cancelled' || queue.cancelled) break;
        } finally {
          unit.source.dispose();
          running.realtime = null;
        }
      }
      if (els.shotList.checked && !queue.cancelled) emitShotList();
      // Dialog baru boleh dianggap selesai setelah rantai unduhan berjeda habis;
      // kalau tidak, "Tutup" dapat aktif sementara berkas terakhir belum terkirim.
      await deliverChain;
    } finally {
      for (const unit of units) unit.source.dispose();
      running = null;
      deps.setBusy(false);
      els.cancel.hidden = true;
      els.start.hidden = false;
      els.close.disabled = false;
    }

    const tookMs = Math.round(scope.performance.now() - startedAt);
    if (queue.cancelled || (failure && /dibatalkan/i.test(failure.message ?? ''))) {
      deps.metrics?.record('export_failed', {codec: codecMetric, resolution: resolutionLabel, duration_ms: tookMs, error_code: 'aborted'});
      setMessage('Ekspor dibatalkan. Tidak ada berkas yang diunduh untuk shot yang sedang berjalan.', 'warn');
      els.retry.hidden = false;
      return;
    }
    if (failure) {
      const code = failure.name === 'UnsupportedCodecError' ? 'unsupported' : 'unknown';
      deps.metrics?.record('export_failed', {codec: codecMetric, resolution: resolutionLabel, duration_ms: tookMs, error_code: code});
      setMessage(`Ekspor gagal: ${failure.message}`, 'error');
      els.retry.hidden = false;
      deps.notify?.(`Ekspor gagal: ${failure.message}`);
      return;
    }
    deps.metrics?.record('export_completed', {codec: codecMetric, resolution: resolutionLabel, fps: activeFps(jobsFor[0]), duration_ms: tookMs});
    deps.notify?.(ok > 1 ? `${ok} shot berhasil diekspor.` : 'Video referensi berhasil diunduh.');
  }

  return {
    element: root, open, close, start,
    get busy() {return !!running;},
    /** Hanya untuk uji browser: keadaan internal dialog. */
    debug: () => ({
      shots: entries.length,
      selected: selectedEntries().map(e => e.shotId),
      codec: els.codec.value,
      codecs: [...els.codec.options].map(o => ({value: o.value, disabled: o.disabled, text: o.textContent})),
      summary: els.summary.textContent,
      message: els.message.textContent,
      aspect: aspectValue(entries[0]?.aspectRatio ?? '16:9'),
    }),
  };
}
