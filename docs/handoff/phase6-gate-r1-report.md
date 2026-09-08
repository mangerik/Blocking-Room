# Laporan Fase 6 — Gate R1 (F6-02 … F6-08 + F3-11) — 8 September 2026

Cakupan yang ditugaskan: F6-02, F6-03, F6-04, F6-05, F6-06, F6-07, F6-08, lalu F3-11.
**Tidak dikerjakan dan tidak dicentang:** F6-09 (gate R2, menunggu Fase 4–5),
F6-10/F6-11/F6-12 (pilot manusia). Tidak ada commit. Tidak ada dependency npm baru.

Berhenti karena batas konteks: **tidak** — seluruh cakupan selesai.

## Status task

| Task | Status | Bukti |
|---|---|---|
| F6-02 ukur + optimalkan interaksi/playback | Selesai | `tests/perf-browser.mjs`, `artifacts/perf-baseline.json`, `docs/PERF-BASELINE.md` §6 (angka) dan §8 (optimasi sebelum/sesudah) |
| F6-03 buka proyek, dashboard 100 proyek, memori | Selesai | `docs/PERF-BASELINE.md` §6; keputusan `LIMITS.documentBytes` di `src/schema.js` + `docs/DATA-MODEL.md` §3 |
| F6-04 audit aksesibilitas | Selesai | `docs/A11Y-AUDIT.md`, `tests/a11y-browser.mjs`, `artifacts/a11y-report.json` |
| F6-05 no-WebGL, context loss, capability detection | Selesai | `src/capabilities.js`, `src/no-webgl.js`, `src/scene-renderer.js`, `tests/capability-browser.mjs` bagian 1–2, `docs/BROWSER-SUPPORT.md` |
| F6-06 metrik lokal | Selesai | `src/metrics.js`, `tests/metrics.test.js` (15 test), `tests/capability-browser.mjs` bagian 3 |
| F6-07 preview, feature flag, rollback, ekspor v1 | Selesai | `src/flags.js`, `exportAsV1` di `src/migrate.js`, `docs/ROLLOUT.md`, `tests/rollout.test.js` (14 test), `tests/capability-browser.mjs` bagian 4–5 |
| F6-08 gate R1 | **Lulus** | `docs/GATE-R1.md`, `tests/gate-r1-browser.mjs` |
| F3-11 gate R1 untuk dashboard | Selesai | dicentang setelah gate lulus dengan matriks bukti (`docs/GATE-R1.md` §2) |
| F6-09 gate R2 | Belum — di luar cakupan | menunggu Fase 4–5 |
| F6-10/F6-11/F6-12 pilot | **Belum, sengaja tidak dicentang** | tidak dapat diotomasi; protokol disiapkan di `docs/PILOT-PROTOCOL.md` |

## Angka hasil ukur vs target

Perangkat: Apple M5 10-core / 16 GiB / macOS 26.2 / Chrome 152 / **headed** /
viewport 1280×720 / layar 120 Hz. Fixture `tests/fixtures/load/load-20a-10r-500k.json`
(20 aktor, 10 ruang, 500 keyframe, shot 60 detik).

| Metrik | Target PRD §9 | Baseline | Hasil | |
|---|---|---|---|---|
| p95 input→viewport, drag aktor | <100 ms | 49,1 ms | **11,6 ms** | tercapai |
| p95 input→viewport, nudge keyboard | <100 ms | 22,3 ms | **21,1 ms** | tercapai |
| p95 input→viewport, scrub playhead | <100 ms | 17,4 ms | **18,4 ms** | tercapai |
| p95 input→viewport, pindah scene | <100 ms | 53,5 ms | **44,4 ms** | tercapai |
| fps rata-rata playback 60 s | ≥30 fps | 119,4 | **120,0** | tercapai |
| frame-time p95 playback | ≤33,3 ms | 9,2 ms | **9,3 ms** | tercapai |
| frame-time maksimum playback | dilaporkan | 307,4 ms | **16,6 ms** | membaik 18× |
| dropped frames playback 60 s | dilaporkan | 38 (0,52%) | **1 (0,01%)** | membaik |
| p95 buka proyek, metadata 5 023 714 B / 165 scene | ≤2 detik | — | **317 ms** | tercapai |
| p95 buka proyek, fixture beban | ≤2 detik | 426 ms | **333 ms** | tercapai |
| Transaksi store `documents` saat dashboard 102 kartu | 0 | 0 | **0** | tercapai |
| `geometries` setelah 20 siklus rebuild | tanpa tren naik | 532→530 | **194→194** | tercapai |
| `textures` / `programs` setelah 20 siklus | tanpa tren naik | 1 / 11 | **1 / 7** | tercapai |
| Simpan setelah gestur selesai (PR-03) | ≤1 detik | — | **p95 261 ms** (p50 199 ms) | tercapai |
| Kontras teks gagal (editor + dashboard) | 0 | 61 | **0** | tercapai |
| Target sentuh <44 px pada 390 px (editor) | 0 | 57 | **10** (semuanya penanda keyframe) | sebagian |

**Batas kesimpulan yang wajib dibawa:** perangkat uji jauh di atas kelas referensi PRD
(laptop 8 GB, GPU terintegrasi) dan layarnya 120 Hz. "Tercapai" berarti tercapai
**pada perangkat ini**. Margin memang 6–8× terhadap target, tetapi margin bukan
pengukuran. Ulangi `npm run test:perf` pada perangkat kelas PRD sebelum pilot.

## Bug yang ditemukan dan diperbaiki

| # | Kelas | Ringkasan | Perbaikan |
|---|---|---|---|
| B-01 | error terbuka pada jalur lock | `session.begin()` melempar `ReadOnlyError` yang **tidak tertangkap** dari handler `keydown`/`pointerdown` di tab baca-saja. Data tidak pernah tertulis (bukan bypass), tetapi handler berhenti di tengah dan console peserta pilot akan penuh error | `src/main.js`: kedua handler memeriksa `session.readOnly` lebih dahulu dan menolak dengan pesan, bukan exception |
| B-02 | kebenaran state UI | `button{display:inline-flex}` mengalahkan `[hidden]{display:none}` milik browser, sehingga **setiap** tombol dengan atribut `hidden` tetap terlihat — termasuk `#download-backup` yang seharusnya hanya muncul saat penyimpanan gagal | `src/style.css`: `button[hidden]{display:none!important}` |
| B-03 | memori/GPU | `buildPaths()` membuat ±480 `SphereGeometry` + material baru **setiap pointermove**; `geometries` 532 pada scene berisi 30 objek | `src/scene-renderer.js`: geometri/material bersama bertanda `userData.shared`, `clearGroup` memeriksa tanda pada resource (bukan objek), plus `dispose()` penuh |
| B-04 | keandalan gate | `tests/repository-browser.mjs` bagian 5 gagal ±1 dari 4 jalan penuh: predikat `waitForFunction` dievaluasi pada dokumen baru sebelum kait uji terpasang (karena "Buka salinan" memuat ulang halaman) | optional chaining pada predikat; asersi isolasi tidak diubah |

Tidak ditemukan bug kelas **kehilangan data**, **lock bypass** atau **migrasi kritis**
yang masih terbuka. Yang diuji secara khusus untuk mencarinya: lock bypass lewat
keyboard, inspector, pengaktifan paksa input lewat DOM, tombol hapus, ruangan terkunci
dan objek tersembunyi; isolasi lock lintas scene; penolakan tab baca-saja di lapisan
command; 30 gestur lalu reload segera; pindah scene saat save berjalan; impor v1 rusak.

## Perubahan file

**Baru — `src/`**

- `src/capabilities.js` — deteksi kemampuan terpusat (WebGL2/1, IndexedDB, Web Locks,
  BroadcastChannel, MediaRecorder + mime, VideoEncoder, persistent storage, localStorage)
  dan `capabilityWarnings()` dalam Bahasa Indonesia. Tanpa sniffing user agent, tidak
  pernah melempar, satu canvas per probe konteks.
- `src/no-webgl.js` — layar fallback tanpa WebGL2. Tidak mengimpor Three.js.
- `src/metrics.js` — metrik lokal berskema tertutup + ring buffer + opt-in tanpa pengiriman.
- `src/flags.js` — feature flag lokal (`blocking-room.flags.*`).

**Baru — `tests/`**

- `tests/perf-browser.mjs` — harness F6-02/F6-03 (`npm run test:perf`).
- `tests/capability-browser.mjs` — F6-05/F6-06/F6-07 di Chrome.
- `tests/a11y-browser.mjs` — audit F6-04 dengan laporan JSON.
- `tests/gate-r1-browser.mjs` — perburuan bug gate R1 + pengukuran PR-03.
- `tests/metrics.test.js` (15), `tests/rollout.test.js` (14).

**Baru — `docs/`**

- `docs/A11Y-AUDIT.md`, `docs/BROWSER-SUPPORT.md`, `docs/ROLLOUT.md`,
  `docs/GATE-R1.md`, `docs/PILOT-PROTOCOL.md`, `docs/handoff/phase6-gate-r1-report.md`.

**Diubah**

- `src/main.js` — lewati `persist()`/`renderTimeline()`/`renderInspector()` saat drag
  pointer; `syncCameraUI()` dipindah ke `endDrag()`; banner context loss + tombol
  pulihkan; tombol ekspor dimatikan bila MediaRecorder tidak ada; panel metrik lokal +
  tombol header; tombol "Unduh JSON v1"; flag dashboard menyembunyikan jalan ke daftar
  proyek; guard read-only pada `keydown` dan `pointerdown`; pencatatan 10 event metrik;
  kait uji baru (`select`, `rebuildScene`, `getRendererInfo`, `getCapabilities`,
  `loseWebGLContext`, `restoreWebGLContext`, `isContextLost`, `disposeRenderer`,
  `getMetrics`, `metricsSummary`, `clearMetrics`); perbaikan warna pemisah breadcrumb.
- `src/scene-renderer.js` — sumber daya jalur dipakai ulang, `clearGroup` sadar
  `userData.shared`, throttle preview kamera 30 fps (`renderViewport(view,{forcePov})`),
  penanganan `webglcontextlost`/`webglcontextrestored`, `restoreContext()`,
  `loseContext()`, `dispose()`.
- `src/app.js` — cabang no-WebGL sebelum memuat editor; feature flag dashboard;
  pembersihan hash saat flag mati.
- `src/dashboard.js` — mencatat `project_created` (buat, duplikat, impor).
- `src/migrate.js` — `exportAsV1(doc, {sceneId, shotId})`.
- `src/schema.js` — `LIMITS.documentBytes` 3 000 000 → 5 000 000 B + alasannya.
- `src/style.css` — perbaikan `button[hidden]`, palet kontras, gaya fallback/banner/panel
  metrik, blok target sentuh `@media(max-width:540px)`.
- `tests/repository-browser.mjs` — optional chaining pada satu predikat (B-04).
- `package.json` — `test:browser` menambah 3 suite; `test:perf` baru.
- `docs/PERF-BASELINE.md` — §6 tabel hasil terisi, §8 optimasi, §3/§5/§7 diperbarui.
- `docs/DATA-MODEL.md` — keputusan `documentBytes`.
- `README.md` — struktur berkas, cakupan uji, harness performa, koreksi "tidak ada dashboard".
- `plan.md` — F6-02…F6-08 dan F3-11 dicentang + 8 baris log; "Langkah berikutnya" diperbarui.

## Keputusan & asumsi

1. **`LIMITS.documentBytes` = 5 000 000 B, tetap deklaratif.** PRD §9 menjanjikan
   "proyek metadata ≤5 MB" kepada pengguna, jadi angka PRD yang menang atas batas internal
   3 MB. Validator sengaja **tidak** menolak dokumen yang melewatinya: menolak dokumen
   yang sudah tersimpan berarti mengunci pengguna dari karyanya — persis kegagalan yang
   paling ingin dihindari PRD.
2. **Fixture 5 MB dibangun saat pengukuran, tidak disimpan di repo.** Berkas 5 MB
   memperlambat setiap `git clone` untuk satu angka yang dapat dibangkitkan ulang.
   Konsekuensi yang dicatat: bentuk bebannya (165 scene kecil) belum tentu sama dengan
   proyek nyata berukuran sama.
3. **Optimasi drag menukar satu jaminan.** Perubahan yang belum selesai hilang bila tab
   mati **di tengah** drag. Ini sama dengan perilaku mode rekam sejak R0, dan PR-03
   berbicara tentang "setelah gestur selesai". Ditulis di `docs/PERF-BASELINE.md` §8.1
   dan `docs/GATE-R1.md` C-03, bukan disembunyikan.
4. **Preview kamera 30 fps, ekspor tetap penuh.** `forcePov: exporting` menjaga
   frame-count ekspor tidak berubah; `preserveDrawingBuffer` menjaga thumbnail tetap valid.
5. **Metrik memakai skema tertutup, bukan penyaringan kata.** Properti asing dibuang,
   angka dipaksa angka, teks hanya menerima nilai dari daftar tertutup dan nilai asing
   menjadi `other`. Teks bebas tidak punya jalur masuk — itu jaminan struktural yang dapat
   diuji, bukan disiplin pemanggil.
6. **Metrik disimpan di localStorage, bukan IndexedDB.** Harus dapat ditulis dari jalur
   sinkron dan tidak boleh mengantre di belakang transaksi dokumen; metrik tidak pernah
   boleh memperlambat penyimpanan karya.
7. **Telemetry eksternal tidak diimplementasikan sama sekali.** Hanya penanda opt-in yang
   disimpan. Ada unit test struktural yang menolak `fetch`/`sendBeacon`/`WebSocket` di
   `src/metrics.js`.
8. **Feature flag hanya boleh mematikan permukaan UI, tidak pernah mengubah data.**
   Ditulis sebagai aturan di kepala `src/flags.js` supaya flag berikutnya tidak menjadi
   cabang perilaku data.
9. **Header boleh membungkus pada ≤540 px.** Memaksa delapan tombol 44 px pada satu baris
   390 px menghasilkan overflow horizontal — yang justru dilarang PRD. Membungkus adalah
   satu-satunya cara memenuhi kedua syarat sekaligus.
10. **Kontras diperbaiki lewat token, bukan per elemen.** Menggelapkan `--muted`,
    `--accent` dan `.primary` menyelesaikan mayoritas pelanggaran sekaligus dan menjaga
    identitas visual; sisanya (13 aturan) diperbaiki satu per satu.
11. **Harness performa tidak meng-assert target PRD.** Menyatakan target tercapai adalah
    keputusan manusia yang dicatat di `docs/PERF-BASELINE.md` §6 bersama perangkatnya.
12. **`tests/a11y-browser.mjs` melaporkan semua temuan tetapi hanya meng-assert yang sudah
    diperbaiki**, supaya temuan yang belum lulus tidak hilang di balik hasil "PASS".

## Hasil verifikasi

Lingkungan: macOS 26.2 (Darwin 25.2.0, arm64), Node v22.21.1, Chrome 152
(`channel:'chrome'`), Vite 7.3.6, dev server `--port 5174 --strictPort`.

- `npm test` — **112/112 lulus** (dari 83; +15 metrik, +14 rollout/kemampuan).
- `npm run build` — lulus. `dashboard` 15,9 kB tetap tidak menarik Three.js.
- `npm run preview` — build produksi diverifikasi (editor, dashboard, tanpa error halaman).
- `npm run test:browser` — **9/9 suite lulus** berurutan:
  `browser-smoke`, `editor-regression`, `walk-doors-delete`, `migration-browser`,
  `repository-browser` (termasuk 100 siklus save/reload), `dashboard-browser`,
  `capability-browser` (baru), `a11y-browser` (baru), `gate-r1-browser` (baru).
- `tests/repository-browser.mjs` dijalankan **3× terpisah** setelah perbaikan B-04:
  lulus 3 dari 3.
- `npm run test:perf` — hasil di `artifacts/perf-baseline.json` dan
  `docs/PERF-BASELINE.md` §6.
- **Tidak ada commit.**

## Yang belum selesai / cara melanjutkan

1. **F6-09 (gate R2)** — belum bisa dijalankan; menunggu Fase 4 (shot, timeline) dan
   Fase 5 (ekspor deterministik). Pola yang dapat diikuti: `docs/GATE-R1.md` (matriks per
   acceptance criterion + daftar bug + batas kesimpulan) dan `tests/gate-r1-browser.mjs`
   (suite yang mencoba merusak, bukan membuktikan).
2. **F6-10/F6-11/F6-12 (pilot manusia)** — `docs/PILOT-PROTOCOL.md` siap dipakai apa
   adanya: kriteria peserta, naskah pengantar, tiga tugas, lembar catatan, cara menghitung
   kelima metrik PRD §11 dari metrik lokal, dan kriteria keputusan yang ditetapkan
   sebelum pilot. **Jangan dicentang tanpa peserta sungguhan.**
3. **Sebelum pilot dimulai (tidak menghalangi gate R1, tetapi wajib):**
   - **Uji Edge** — PRD §9 menuntutnya; langkah manual minimum di
     `docs/BROWSER-SUPPORT.md` §5. Perbarui baris Edge dari "Diperkirakan" ke "Diuji".
   - **Ukur ulang F6-02/F6-03 pada perangkat kelas PRD** (8 GB RAM, GPU terintegrasi):
     `PERF_LABEL=<perangkat> node tests/perf-browser.mjs`, lalu tambahkan barisnya di
     `docs/PERF-BASELINE.md` §6. Bila drag p95 melewati 100 ms di sana, kandidat optimasi
     berikutnya adalah transform incremental (`docs/PERF-BASELINE.md` §8.4).
   - **Tampilkan versi build di UI** (`docs/ROLLOUT.md` §8) supaya laporan bug pilot dapat
     ditelusuri ke build tertentu. Perbaikan murah, belum dikerjakan.
4. **Temuan aksesibilitas yang masih terbuka** — `docs/A11Y-AUDIT.md` T-01…T-06. T-01
   (penanda keyframe 10 px) diselesaikan oleh TL-01 pada Fase 4, bukan dengan memperbesar
   penanda.
5. **Ulangan pengukuran** — `docs/PERF-BASELINE.md` §2 meminta 3 jalan per skenario;
   yang dijalankan baru 1 jalan per label. Variasi antar-jalan belum terukur.

## Risiko / catatan untuk fase berikutnya

- **Jangan mengembalikan `persist()` ke dalam `pointermove`.** Itu jalur terpanas
  aplikasi dan penyebab p95 drag 49 ms. Bila Fase 4 menambah operasi timeline yang harus
  menyimpan saat drag, tambahkan throttle eksplisit — jangan menyimpan per event.
- **Jangan men-dispose sumber daya bertanda `userData.shared`.** `SceneRenderer.clearGroup`
  memeriksa tanda itu pada geometri dan material. Menambah sumber daya bersama baru tanpa
  tanda akan menghasilkan crash "buffer sudah di-dispose" yang sulit dilacak.
- **`renderViewport` kini menerima opsi.** Pemanggil yang membutuhkan frame POV setiap
  frame (ekspor, render deterministik Fase 5) **wajib** mengirim `{forcePov: true}`,
  kalau tidak frame-count ekspor akan meleset.
- **Menambah event metrik berarti menambah entri di `EVENT_SCHEMA`.** Event tanpa skema
  dibuang secara diam-diam (dan dihitung di `dropped`) — itu disengaja, tetapi berarti
  event baru yang lupa didaftarkan tidak akan pernah muncul.
- **Feature flag berikutnya:** tambahkan ke `DEFAULT_FLAGS` di `src/flags.js`, jangan
  membaca `localStorage` langsung dari UI.
- **`window.blockingRoom` bertambah 11 kait uji Fase 6.** Menghapusnya berarti memperbarui
  `tests/perf-browser.mjs`, `tests/capability-browser.mjs`, `tests/a11y-browser.mjs` dan
  `tests/gate-r1-browser.mjs`.
- **Perubahan palet kontras terlihat.** Teks sekunder kini lebih gelap dan tombol primer
  lebih pekat. Ini keputusan aksesibilitas yang disengaja (`docs/A11Y-AUDIT.md` P-02);
  bila desain diubah kembali, jalankan `node tests/a11y-browser.mjs` sebelum menyimpulkan.
- **`artifacts/` diabaikan Git.** `perf-baseline.json` dan `a11y-report.json` adalah bukti
  yang ditulis ulang setiap kali harness dijalankan; angka yang bertahan ada di
  `docs/PERF-BASELINE.md` dan `docs/A11Y-AUDIT.md`.
