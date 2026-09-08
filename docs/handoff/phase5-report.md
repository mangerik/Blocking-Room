# Laporan Fase 5 — ekspor presisi dan referensi produksi — 2026-09-08

Lingkup: **F5-02 s.d. F5-07**. F5-01 sudah selesai sebelumnya (`docs/SPIKE-ENCODER.md`,
`docs/handoff/phase5-spike-report.md`). **F5-08 (gate R2 + pilot) sengaja TIDAK dikerjakan
dan tidak dicentang.**

## Status task

| Task | Status | Bukti |
|---|---|---|
| F5-02 · dialog ekspor (EX-01) | **Selesai** | `src/export/ui.js`; `tests/export-browser.mjs` bagian 1–2; `tests/export.test.js` (nama berkas, rentang, ukuran) |
| F5-03 · snapshot revision immutable | **Selesai** | `src/export/frame-source.js`, `repository.saveRevision`; `tests/export-browser.mjs` bagian 4 (edit selama job berjalan tidak mengubah hasil; encoder/muxer/DOM dilepas) |
| F5-04 · pipeline deterministik + muxer (EX-02) | **Selesai** | `src/export/webm-muxer.js`, `src/export/encoder.js`, `src/export/export-service.js`; `ffprobe`: `vp9 1280x720 nb_read_frames=300 duration=10.000000` |
| F5-05 · fallback MediaRecorder berlabel | **Selesai** | `src/export/realtime.js`; `tests/export-browser.mjs` bagian 7 (nama berkas `_realtime`, pesan “tidak dijamin”) |
| F5-06 · batch, burn-in, storyboard, shot list (EX-03) | **Selesai** | `ExportQueue`, `src/export/burn-in.js`, `src/export/shot-list.js`; `tests/export-browser.mjs` bagian 6 (2 shot → 2 webm + 6 PNG + JSON + CSV) |
| F5-07 · verifikasi frame dan kegagalan | **Selesai** | `tests/export-browser.mjs` (7 bagian) + `tests/export.test.js` (20 unit test) |
| F5-08 · gate R2 + pilot | **Tidak dikerjakan (di luar lingkup)** | — |

## Bukti utama

**Jumlah frame dan durasi (EX-02).** Shot 10 detik, 30 fps, VP9, 1280×720:

```
ffprobe -count_frames  →  codec_name=vp9  width=1280  height=720
                          nb_read_frames=300  duration=10.000000
```

Decode ulang di Chrome pada berkas yang sama: `video.duration === 10`, seek ke 0 s / 4,967 s /
9,967 s mendarat dalam 0,2 s dari target, dan frame hasil seek dapat digambar ke canvas.
Waktu render+encode 300 frame 720p pada mesin ini: **865 ms**.

**Kesetaraan pose preview ↔ ekspor (EX-02).** Frame hasil **decode** dibandingkan dengan
render preview pada waktu yang sama, diturunkan ke 48×27 piksel, diukur sebagai rata-rata
selisih kanal RGB (0–255):

| Frame | t | Selisih vs preview | Ambang uji |
|---|---|---|---|
| awal | 0 s | **0,534** | < 3 |
| tengah | 149/30 s | **0,642** | < 3 |
| akhir | 299/30 s | **0,667** | < 3 |

Angka ini sekaligus menutup langkah kaki (`gait` berubah sepanjang waktu), pintu, framing
dan lensa: ketiganya digambar oleh `sampleScene`/`sampleCamera` yang sama.

**Objek tersembunyi.** Referensi “aktor tampil” vs “aktor disembunyikan” berbeda **6,27** —
membuktikan aktor memang tergambar sehingga uji ini bermakna. Ekspor dengan aktor
disembunyikan cocok dengan referensi tersembunyi (**0,70**) dan jauh dari referensi tampil.

**Snapshot immutable (F5-03).** Job 300 frame dijalankan; **selama job berjalan** aktor
digeser lewat inspector ke `x=7,5 z=−4` pada playhead akhir. Frame 299 hasil decode:
selisih **0,53** terhadap referensi snapshot dan jelas lebih besar terhadap referensi
dokumen yang sudah diedit. Setelah job: `job.encoder === null`, 0 elemen
`[data-export-host]` tersisa, dan `renderer.info.memory` editor (geometri + texture) tidak
bergerak dibanding sebelum ekspor.

## Perubahan file

Baru:

- `src/export/webm-muxer.js` — muxer WebM (EBML writer murni byte, CodecPrivate, cluster
  per keyframe, Cues, pemecahan cluster pada batas int16). Port dari prototipe spike.
- `src/export/encoder.js` — kandidat codec, `probeDeterministicCodecs`, `ChunkEncoder`
  (backpressure `encodeQueueSize > 8`, error asinkron `configure()` ditangkap).
- `src/export/export-service.js` — `ExportJob`, `ExportQueue`, `resolveRange`,
  `buildFileName`, `exportSize`, `createYielder`.
- `src/export/frame-source.js` — `ShotFrameSource`: `SceneRenderer` terpisah pada
  penampung di luar layar, render dari snapshot, komposit burn-in, PNG storyboard, dispose.
- `src/export/realtime.js` — `RealtimeExportJob` (memakai kembali `ExportService` lama).
- `src/export/burn-in.js`, `src/export/shot-list.js`, `src/export/ui.js`.
- `tests/export.test.js` (20 unit test), `tests/export-browser.mjs` (suite browser ke-11).
- `docs/handoff/phase5-report.md` (berkas ini).

Diubah:

- `src/main.js` — jalur ekspor lama (MediaRecorder + playback real-time) dicabut dan
  diganti pemanggilan `createExportDialog`; `.export-progress` beserta `#cancel-export`
  dihapus dari markup; `animate()` tidak lagi memaksa render POV saat ekspor; tombol
  `#export` hanya dimatikan bila **WebCodecs maupun MediaRecorder** tidak ada;
  `window.blockingRoom` mendapat `exportDialog` dan `getSnapshot()`.
- `src/scene-renderer.js` — `setExportSize(ratio, width, height)` dan opsi
  `renderPOV(view, renderer, {keepOverlays})`. Perilaku default tidak berubah.
- `src/repository.js` — `saveRevision(doc, {label})`, transaksi hanya ke store `revisions`.
- `src/style.css` — blok `.export-dialog` (token warna yang sama dengan panel lain).
- `tests/browser-smoke.mjs`, `tests/walk-doors-delete.mjs` — mengeklik `#export-start`
  setelah dialog terbuka; asersi unduhan `.webm` tidak diubah.
- `package.json` — `tests/export-browser.mjs` masuk `npm run test:browser`.
- `plan.md`, `README.md`, `docs/SPIKE-ENCODER.md`, `docs/DATA-MODEL.md`.

## Keputusan & asumsi

1. **Tanpa dependency baru.** Muxer WebM ditulis sendiri sesuai rekomendasi spike §4.
   `mp4-muxer` **tidak** dipasang: D-04 belum menyetujuinya, jadi MP4 tampil sebagai opsi
   nonaktif berlabel “belum tersedia — butuh muxer” beserta alasannya. H.264 ditawarkan
   di dalam WebM dengan catatan eksplisit bahwa dukungan pemutarnya terbatas.
2. **Renderer ekspor terpisah, bukan renderer preview.** Ini yang membuat F5-03 benar
   secara struktural: tidak ada objek yang dibagi dengan editor, dan buffer 1080p tidak
   pernah mengubah ukuran preview yang dilihat pengguna. Biayanya satu konteks WebGL
   tambahan selama job berjalan; dilepas pada `dispose()` (diuji).
3. **`MessageChannel` untuk melepas event loop.** `setTimeout` dibatasi 1×/detik pada tab
   tersembunyi dan akan mematahkan janji “ekspor jalan walau tab tidak terlihat”
   (`docs/SPIKE-ENCODER.md` §9). rAF tidak dipakai sama sekali di jalur deterministik.
4. **`ExportJob` tidak disimpan ke IndexedDB.** Job hanya hidup selama tab terbuka dan
   hasilnya langsung menjadi unduhan. Yang disimpan adalah snapshot yang dirender sebagai
   `Revision` berlabel `export`. Alasan dicatat di `docs/DATA-MODEL.md`.
5. **Rentang detik memakai `end` eksklusif, rentang frame inklusif.** 0–10 detik pada
   30 fps = 300 frame; frame 0–299 = 300 frame. Keduanya didokumentasikan di JSDoc dan
   diuji.
6. **Label resolusi metrik mengikuti preset (`720p`/`1080p`), bukan tinggi buffer.**
   Untuk 9:16 tinggi buffer adalah 1280/1920, yang tidak ada dalam enum tertutup
   `src/metrics.js`; preset adalah nama yang benar secara semantik dan tetap lolos enum.

## Hasil verifikasi

- `npm test` — **176/176 lulus** (156 lama + 20 baru). Tidak ada test lama yang diubah.
- `npm run build` — lulus.
- `npm run test:browser` — **11/11 suite lulus** (10 lama + `export-browser.mjs`).
  `browser-smoke` dan `walk-doors-delete` tetap mengunduh video `.webm`.
- `ffprobe` tersedia di mesin ini (`/opt/homebrew/bin/ffprobe`) dan dipakai. Bila tidak
  ada, test tetap lulus dengan verifikasi decode ulang lewat `<video>` di Chrome.
- Lingkungan: macOS (Darwin 25.2.0, arm64), Node v22.21.1, Chrome 152 headless
  (`channel:'chrome'`), dev server `http://localhost:5174`.

## Yang belum selesai / catatan untuk fase berikutnya

- **F5-08 gate R2 + pilot** belum dikerjakan (di luar lingkup tugas ini). Bahan yang sudah
  tersedia untuk gate: hitungan frame, kesetaraan pose, codec fallback dan pembatalan
  semuanya sudah punya bukti otomatis di `tests/export-browser.mjs`; F6-09 tinggal
  merangkumnya ke `docs/GATE-R2.md` bersama hasil F6-08 yang tetap lulus.
- **Audio, MP4, dan streaming ke disk** belum ada. Buffer chunk masih di memori, jadi shot
  sangat panjang pada 1080p dibatasi RAM (perkiraan di `docs/SPIKE-ENCODER.md` §8).
  Jalur `showSaveFilePicker` + `FileSystemWritableFileStream` adalah perbaikan susulan.
- **Muxer belum menulis SeekHead.** Cues sudah cukup untuk seek (dibuktikan `ffprobe` dan
  `<video>`), tetapi SeekHead akan mempercepat pembukaan berkas besar di beberapa pemutar.
- **Worker.** Batas modul sudah dijaga bebas DOM (`webm-muxer.js`, `encoder.js`,
  `export-service.js`), jadi memindahkan encode+mux ke Worker tinggal memindahkan tiga
  berkas itu. Belum dilakukan karena encode hanya ~2,9 ms/frame dan UI sudah responsif
  berkat `createYielder`.
- **Satu browser, satu mesin.** Safari/Firefox belum diukur; `docs/BROWSER-SUPPORT.md`
  perlu diperbarui bila F6-05 diperluas.
- **Ekspor tidak dapat berjalan dua job paralel** (disengaja): `ExportQueue` menjalankan
  job berurutan supaya hanya ada satu encoder aktif.

## Risiko

- Menjalankan batch shot yang sangat banyak akan memicu beberapa unduhan berturut-turut;
  Chrome dapat meminta izin “unduh beberapa berkas”. Belum ada penanganan khusus (mis.
  membungkusnya menjadi satu ZIP) — dicatat, bukan diperbaiki diam-diam.
- Revisi berlabel `export` ikut menghitung batas 20 revisi per proyek, sehingga ekspor
  yang sangat sering dapat memangkas revisi recovery yang lebih tua. Batas minimum 10
  revisi tetap dijaga oleh `prune`.
