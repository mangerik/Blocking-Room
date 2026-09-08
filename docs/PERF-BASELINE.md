# Baseline performa — perangkat referensi, fixture beban dan protokol ukur

Status: **F6-01 selesai** (definisi + fixture). **F6-02 dan F6-03 sudah diukur** pada 8 September 2026 — hasil di §6, optimasi dan bukti sebelum/sesudah di §8.

> Semua angka pada kolom **Target** berasal dari PRD §9 dan merupakan **target usulan**.
> Kolom **Baseline** dan **Hasil** hanya berisi angka yang benar-benar terukur pada
> perangkat referensi di bawah; sumber mentahnya `artifacts/perf-baseline.json`.
> Jangan menyatakan target tercapai karena test otomatis lulus (plan.md, kriteria keluar Fase 6).
>
> **Batas kesimpulan yang berlaku untuk seluruh dokumen ini:** angka §6 diukur pada
> Apple M5 / 16 GiB, jauh di atas perangkat referensi PRD (laptop 8 GB, GPU terintegrasi).
> "Tercapai" pada tabel §6 berarti **tercapai pada perangkat ini**, bukan pada kelas
> perangkat sasaran. Lihat §1 dan §7.

---

## 1. Perangkat referensi

Diambil pada 2026-09-08 di mesin pengembangan utama proyek.

| Item | Nilai | Cara mengambil ulang |
|---|---|---|
| Model | Mac17,2 (Apple silicon) | `sysctl -n hw.model` |
| CPU | Apple M5 — 10 core (10 fisik / 10 logis) | `sysctl -n machdep.cpu.brand_string`, `sysctl -n hw.physicalcpu hw.logicalcpu` |
| RAM | 17 179 869 184 B = **16 GiB** | `sysctl hw.memsize` |
| Arsitektur | arm64 | `uname -m` |
| OS | macOS 26.2 (build 25C56, Darwin 25.2.0) | `sw_vers` |
| Browser | **Google Chrome 152.0.7977.76** (stable) | `/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "/Applications/Google Chrome.app/Contents/Info.plist"` |
| Runner browser | Playwright 1.63.0, `channel:'chrome'` (memakai Chrome terpasang, bukan Chromium bundel) | `npx playwright --version` |
| Node | v22.21.1 (npm 11.7.0) | `node -v`, `npm -v` |
| Toolchain | Vite 7.3.6, Three.js 0.180.0 | `node -e "..."` / `package.json` |
| GPU (WebGL) | `ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)`, vendor `Google Inc. (Apple)`, `WebGL 2.0 (OpenGL ES 3.0 Chromium)` | `WEBGL_debug_renderer_info` di dalam halaman |
| `navigator.hardwareConcurrency` | 10 | evaluasi di halaman |

### Selisih terhadap perangkat referensi PRD

PRD §9 menyebut perangkat referensi awal **"laptop 8 GB RAM, GPU terintegrasi, Chrome stabil, 1280×720"**.
Mesin di atas jauh lebih kuat (16 GiB, GPU Apple M5). Konsekuensi yang **wajib** ditulis
di setiap hasil ukur:

- Angka dari mesin ini adalah **batas atas optimistis**, bukan bukti bahwa target terpenuhi
  pada perangkat kelas PRD.
- Sebelum gate R1 (F6-08) diklaim lulus, ulangi F6-02/F6-03 pada perangkat kelas bawah
  (8 GB RAM, GPU terintegrasi Intel/AMD, Windows atau Linux) dan catat sebagai baris terpisah.
- Sampai itu tersedia, isi tabel hasil dengan label `M5/16GiB` pada kolom perangkat.

---

## 2. Kondisi pengukuran

| Parameter | Nilai yang dipakai |
|---|---|
| Resolusi viewport uji | **1280 × 720** (`newPage({viewport:{width:1280,height:720}})`) |
| `deviceScaleFactor` | **1** (default Playwright; `devicePixelRatio` terukur = 1 headless maupun headed) |
| Mode | **headed** untuk angka resmi; headless hanya untuk uji regresi cepat |
| Flag GPU | `args: ['--enable-webgl', '--ignore-gpu-blocklist']` — sama dengan `tests/browser-smoke.mjs` |
| Server | `npm run dev -- --port 5174 --strictPort` (build dev) — jika mengukur build produksi, catat `npm run build && npm run preview` sebagai kondisi terpisah |
| Throttling | tidak ada CPU/network throttling kecuali dicatat eksplisit |
| Warm-up | buang 3 detik pertama setelah `#viewport canvas` muncul sebelum mulai mengukur |
| Ulangan | 3 kali jalan per skenario; laporkan median antar-jalan dan p95 dalam jalan. **Belum dipenuhi pada pengukuran 2026-09-08:** setiap label (`baseline`, `final`) dijalankan **satu kali**, dengan 200 sampel input per skenario dan playback 60 detik penuh di dalam jalan itu. Margin terhadap target besar (6–8×), tetapi variasi antar-jalan belum terukur. |

**Headless vs headed.** Probe pada mesin ini menunjukkan Chrome headless dan headed
sama-sama mendapat renderer Metal yang nyata (`ANGLE Metal Renderer: Apple M5`), bukan
SwiftShader — jadi headless tidak otomatis membatalkan hasil. Tetap gunakan **headed**
untuk angka resmi karena compositing, vsync dan frame pacing headless bisa berbeda.
Wajib mencatat mode di setiap baris hasil; **jangan** mencampur angka headless dan headed
dalam satu baris.

---

## 3. Fixture beban

Generator deterministik tanpa dependency: `tests/fixtures/load/generate.mjs`
(seed tetap; menjalankan ulang menghasilkan byte identik). Regenerasi:

```
node tests/fixtures/load/generate.mjs
```

| File | Isi | Ukuran |
|---|---|---|
| `tests/fixtures/load/load-20a-10r-500k.json` | Dokumen schema v2: 1 scene, 1 shot **60 detik**, **20 aktor**, **10 ruang** (5 berpintu, 1 di antaranya berpintu ganda), **500 keyframe** total (460 aktor `x/z/r` + 40 kamera `x/y/z/tx/ty/tz`), kamera `focal 35` mengikuti aktor pertama, 4 objek terkunci/tersembunyi | 97 088 B (≈95 KB) |
| `tests/fixtures/load/projects-100.json` | Array **100 dokumen v2 ringkas** (1–3 scene, 1–2 shot per scene, 2–4 aktor, 12–60 keyframe per track) untuk dashboard F6-03; ditulis compact | 2 355 943 B (≈2,25 MB) — batas 5 000 000 B |

Fixture beban memakai profil persis dari PRD §9 ("20 aktor, 10 ruang, 500 keyframe total")
dan durasi 60 detik supaya uji playback 60 detik (F6-02) bisa dijalankan pada satu shot
tanpa loop.

Dikunci oleh `tests/load-fixtures.test.js` (bagian dari `npm test`): jumlah aktor/ruang/
keyframe, durasi, validitas `validateDocument`, ukuran file, dan `sampleScene` pada
t = 0 / 30 / 60 berjalan tanpa error, tidak memutasi view, dan menghasilkan output identik
pada dua kali sampling.

### Catatan batas schema

- `LIMITS` di `src/schema.js` **cukup** untuk fixture ini: aktor 20/50, ruang 10/30,
  keyframe per track maksimum 27 dari batas 2400, durasi 60 dari rentang 1–120,
  pintu 2/2. Tidak ada perubahan `src/schema.js` yang diperlukan untuk F6-01.
- **Konflik `documentBytes` — SUDAH DIPUTUSKAN pada F6-03.** `LIMITS.documentBytes`
  dinaikkan dari 3 000 000 B menjadi **5 000 000 B** agar sejajar dengan target PRD §9
  ("proyek metadata ≤5 MB"). Angka PRD yang dimenangkan karena itulah yang dijanjikan
  kepada pengguna. Nilai tetap **deklaratif**: `validateDocument` tidak menolak dokumen
  yang melewatinya, karena menolak dokumen yang sudah tersimpan berarti mengunci
  pengguna dari karyanya sendiri. Alasan lengkap: `docs/DATA-MODEL.md` §3.
- **Fixture proyek besar dibangun saat pengukuran**, bukan disimpan sebagai berkas:
  `tests/perf-browser.mjs` menggandakan scene fixture beban (semua id diberi sufiks)
  sampai dokumen mencapai **5 023 714 B / 165 scene**, lalu membukanya dari dashboard.
  Alasan tidak menyimpannya: berkas 5 MB di repo memperlambat setiap `git clone` untuk
  satu angka yang dapat dibangkitkan ulang secara deterministik.

---

## 4. Definisi metrik

Semua metrik diukur pada fixture beban di §3, resolusi dan kondisi di §2.

### 4.1 p95 input → viewport (F6-02, target <100 ms)

Rentang waktu dari **event input mentah** sampai **frame yang memuat akibat input itu
selesai dipresentasikan**.

- Mulai: `event.timeStamp` pointer/keyboard yang memicu perubahan pose (drag aktor,
  nudge keyboard, scrub playhead).
- Selesai: callback `requestAnimationFrame` **pertama sesudah** render yang memakai
  input tersebut, diambil lewat pasangan `performance.mark` → `performance.measure`.
  Jika tersedia, konfirmasi dengan `PerformanceObserver` `event`/`first-input` untuk
  latensi event, dan gunakan nilai yang lebih besar.
- Sampel: minimal **200 event** per skenario (drag panjang dihitung per pointermove).
- Agregat: **p95** = persentil ke-95 dari daftar sampel yang sudah diurutkan
  (`sorted[Math.ceil(0.95 * n) - 1]`). Laporkan juga p50 dan maksimum.
- Skenario wajib: (a) drag satu aktor, (b) nudge keyboard, (c) scrub playhead,
  (d) pindah shot/scene.

### 4.2 Frame-time dan fps (F6-02, target ≥30 fps selama 60 detik)

- Frame-time = selisih timestamp antar callback `requestAnimationFrame` berurutan (ms).
- Jalankan playback penuh **60 detik** pada `load-20a-10r-500k.json` tanpa interaksi.
- Laporkan: fps rata-rata (`1000 / mean`), frame-time **p95**, frame-time maksimum,
  dan jumlah sampel. fps sesaat minimum dilaporkan sebagai `1000 / max frame-time`.
- Target ≥30 fps setara frame-time rata-rata ≤33,3 ms.

### 4.3 Dropped frames (F6-02)

- **Budget frame** = `1000 / refreshRate` (ukur `refreshRate` dari median frame-time saat
  idle; catat nilainya — pada display 60 Hz budget = 16,7 ms).
- **Dropped frame** = setiap frame dengan frame-time > `1,5 × budget`; jumlah frame yang
  hilang untuk frame itu = `round(frameTime / budget) - 1`.
- Laporkan: total dropped, persentase terhadap frame yang diharapkan
  (`60 s × refreshRate`), dan dropped terpanjang berturut-turut.
- Catat juga `long task` (>50 ms) via `PerformanceObserver('longtask')` bila tersedia.

### 4.4 Waktu buka proyek (F6-03, target p95 ≤2 detik)

- Mulai: klik/aksi buka proyek di dashboard.
- Selesai: frame pertama viewport yang sudah menampilkan scene aktif (bukan sekadar
  dokumen selesai di-parse).
- Ulang **20 kali** open → close; laporkan p50 dan p95.

### 4.5 Dashboard 100 proyek (F6-03)

- Muat `projects-100.json` sebagai isi repository, lalu buka dashboard.
- Bukti "tidak memuat semua scene": hitung berapa dokumen yang benar-benar dibaca penuh
  (instrumentasi repository) — harus **0 scene** dibaca sampai proyek dibuka; hanya
  metadata `id/title/createdAt/updatedAt/thumbnailRef`.
- Catat waktu render daftar dan `JS heap` sesudah dashboard tampil.

### 4.6 Memori / GPU (F6-03, target tidak ada tren naik)

- 20 siklus buka → tutup → rebuild scene.
- Setelah setiap siklus catat `performance.memory.usedJSHeapSize` (Chrome) dan
  `renderer.info.memory.{geometries,textures}` + `renderer.info.programs.length` dari
  Three.js.
- Kriteria lulus: regresi linear terhadap 20 titik tidak menunjukkan kenaikan monoton;
  nilai siklus ke-20 ≤ nilai siklus ke-5 + 10%. Catat angka mentah, bukan hanya lulus/gagal.

---

## 5. Cara menjalankan

```bash
# 0. Harness pengukuran: tests/perf-browser.mjs (npm run test:perf)
#    Variabel lingkungan: PERF_HEADLESS=1, PERF_LABEL=..., PERF_PLAYBACK_MS=...,
#    PERF_SAMPLES=..., PERF_OPEN_CYCLES=..., PERF_REBUILD_CYCLES=..., PERF_BIG_CYCLES=...

# 1. Regenerasi fixture beban (opsional; hasilnya deterministik)
node tests/fixtures/load/generate.mjs

# 2. Kunci bentuk fixture (bagian dari npm test)
node --test tests/load-fixtures.test.js

# 3. Suite penuh
npm test
npm run build

# 4. Pengukuran browser (F6-02 / F6-03)
npm run dev -- --port 5174 --strictPort   # jalankan di background
PERF_LABEL=baseline node tests/perf-browser.mjs   # headed bila ada display
# hasil: artifacts/perf-baseline.json + ringkasan di stdout
# matikan dev server setelah selesai
```

Harness berjalan **headed secara bawaan** dan jatuh ke headless bila peluncuran headed
gagal; mode yang benar-benar dipakai dicatat pada field `mode` di JSON hasil dan pada
baris pertama keluaran. Harness **tidak** meng-assert target PRD: menyatakan target
tercapai adalah keputusan manusia yang dicatat di §6.

Setiap sesi ukur wajib mencatat: tanggal, commit SHA, mode (headed/headless), build
(dev/preview), dan perangkat. Tanpa itu angka tidak boleh dimasukkan ke tabel §6.

---

## 6. Tabel hasil — Baseline / Target / Hasil

Semua angka di bawah **terukur**, bukan target. Sumber mentah:
`artifacts/perf-baseline.json` (ditulis ulang setiap kali harness dijalankan).

**Kondisi kedua jalan:** perangkat referensi §1 (Apple M5 / 16 GiB / macOS 26.2),
Chrome 152 `channel:'chrome'`, **headed**, viewport 1280×720, `deviceScaleFactor` 1,
dev server `npm run dev -- --port 5174 --strictPort`, tanpa throttling, warm-up 3 detik
dibuang, fixture `tests/fixtures/load/load-20a-10r-500k.json`.

> **Display 120 Hz.** Frame-time median saat idle adalah 8,3 ms, jadi budget frame yang
> dipakai perhitungan dropped frame adalah 8,33 ms — bukan 16,7 ms. Angka fps di bawah
> (≈120) mencerminkan refresh rate layar uji, bukan batas atas aplikasi. Yang relevan
> terhadap target PRD (≥30 fps) adalah frame-time p95 dan maksimum.

| Jalan | Tanggal | Commit | Keterangan |
|---|---|---|---|
| **Baseline** | 2026-09-08 | `549b7f0` + perubahan kerja F6 belum ada | sebelum optimasi apa pun |
| **Hasil** | 2026-09-08 | `549b7f0` + seluruh perubahan Fase 6 (F6-02…F6-07) | sesudah optimasi §8 |

### F6-02 — interaksi dan playback

| Metrik | Perangkat / mode | Baseline | Target (PRD) | Hasil | Status |
|---|---|---|---|---|---|
| p95 input → viewport, drag aktor | M5/16GiB, headed | **49,1 ms** (p50 11,0; maks 66,0; n=360) | <100 ms | **11,6 ms** (p50 10,4; maks 29,2; n=201) | tercapai |
| p95 input → viewport, nudge keyboard | M5/16GiB, headed | **22,3 ms** (p50 13,1; maks 38,6; n=219) | <100 ms | **21,1 ms** (p50 14,2; maks 25,6; n=200) | tercapai |
| p95 input → viewport, scrub playhead | M5/16GiB, headed | **17,4 ms** (p50 16,6; maks 20,8; n=200) | <100 ms | **18,4 ms** (p50 16,7; maks 21,4; n=200) | tercapai |
| p95 input → viewport, pindah scene | M5/16GiB, headed | **53,5 ms** (p50 19,0; maks 83,3; n=40) | <100 ms | **44,4 ms** (p50 16,9; maks 50,2; n=40) | tercapai |
| fps rata-rata, playback 60 s | M5/16GiB, headed | 119,43 | ≥30 fps | **119,99** | tercapai |
| frame-time p95, playback 60 s | M5/16GiB, headed | 9,2 ms | ≤33,3 ms | **9,3 ms** | tercapai |
| frame-time maksimum, playback 60 s | M5/16GiB, headed | **307,4 ms** | dilaporkan | **16,6 ms** | membaik 18× |
| dropped frames, playback 60 s | M5/16GiB, headed | **38** dari ±7 200 (0,52%), long task 0 | dilaporkan | **1** (0,01%), long task 0 | membaik |

**Catatan metode yang wajib dibaca bersama angka di atas.** Latensi diukur dengan pola
dua `requestAnimationFrame` (§4.1): rAF pertama adalah frame yang merender akibat input,
rAF kedua menandai frame itu sudah diserahkan. Pola ini menambahkan sampai satu interval
frame (8,3 ms pada layar uji) ke setiap sampel, sehingga angka di atas **melebih-lebihkan**
latensi sebenarnya — bukan mengecilkannya. Drag memakai pointer sungguhan
(`page.mouse.move`, event tepercaya); scrub dan pindah scene memakai event yang
di-dispatch dari halaman, dicatat sebagai perbedaan metode.

Harness juga memverifikasi bahwa tiap skenario **benar-benar mengubah scene**
(`interaction.*.effective` pada `artifacts/perf-baseline.json`); tanpa itu angka latensi
rendah bisa berarti "tidak terjadi apa-apa", bukan "cepat".

### F6-03 — buka proyek, dashboard dan memori

| Metrik | Perangkat / mode | Baseline | Target (PRD) | Hasil | Status |
|---|---|---|---|---|---|
| p95 buka proyek — fixture beban (97 088 B) | M5/16GiB, headed | 426,1 ms (p50 285,9; n=20) | ≤2 detik | **333,1 ms** (p50 266,5; n=20) | tercapai |
| p95 buka proyek — **metadata 5 023 714 B / 165 scene** | M5/16GiB, headed | tidak diukur pada baseline | ≤2 detik | **317,1 ms** (p50 246,9; n=5) | tercapai |
| Waktu render dashboard 100 proyek (102 kartu) | M5/16GiB, headed | 116 ms | dilaporkan | **176 ms** | dilaporkan |
| Transaksi store `documents` saat dashboard tampil | M5/16GiB, headed | **0** | 0 | **0** (`projects` 2, `assets` 26) | tercapai |
| `renderer.info.memory.geometries`, 20 siklus rebuild | M5/16GiB, headed | 532 → 530 | tanpa tren naik | **194 → 194** | tercapai |
| `renderer.info.memory.textures`, 20 siklus rebuild | M5/16GiB, headed | 1 → 1 | tanpa tren naik | **1 → 1** | tercapai |
| `renderer.info.programs`, 20 siklus rebuild | M5/16GiB, headed | 11 → 11 | tanpa tren naik | **7 → 7** | tercapai |
| p95 buka proyek diulang 20× (proxy kebocoran memori) | M5/16GiB, headed | tidak ada tren naik | tanpa tren naik | tidak ada tren naik | tercapai |

**Cara "0 dokumen dibaca" dibuktikan.** `IDBDatabase.prototype.transaction` di-instrumentasi
lewat `addInitScript` **sebelum** skrip aplikasi mana pun berjalan, lalu setiap nama object
store yang dibuka dihitung. Saat dashboard menampilkan 102 kartu, store `documents` tidak
pernah dibuka sama sekali; yang dibaca hanya `projects` (metadata) dan `assets` (thumbnail).
Ini bukti perilaku, bukan pembacaan kode.

**Catatan `performance.memory`.** Nilai `usedJSHeapSize` ikut direkam per siklus
(`memory.rebuild[].heap` dan `open.heap` di `artifacts/perf-baseline.json`), tetapi angka
ini **tidak dipakai sebagai kriteria lulus**: Chrome membulatkannya dan waktu GC tidak
dapat dikendalikan, sehingga naik-turunnya tidak membedakan kebocoran dari sampah yang
belum dikumpulkan. Kriteria yang dipakai adalah penghitung Three.js
(`geometries`/`textures`/`programs`) yang deterministik dan langsung mencerminkan
`dispose()`.

## 8. Optimasi yang dilakukan (F6-02) — hanya pada bottleneck terukur

Tiga perubahan, semuanya berasal dari angka baseline di §6, bukan dari tebakan.

### 8.1 Frekuensi save dan render UI saat drag pointer

**Gejala terukur:** p95 drag 49,1 ms sementara scrub hanya 17,4 ms — padahal keduanya
menggerakkan objek yang sama. Selisihnya ada di jalur yang hanya dilalui drag.

**Penyebab:** `moveSelected()`/`rotateSelected()` memanggil `persist()` pada **setiap**
`pointermove`. Satu pointermove berarti: `store.snapshot()` (flush + deep clone seluruh
dokumen) → `validateDocument()` atas seluruh dokumen → `autosave.schedule()` (satu
`structuredClone` lagi) → `renderTimeline()` (membangun ulang ±500 tombol keyframe di DOM)
→ `renderInspector()`. Seluruh pekerjaan itu terbuang, karena `history.commit()` memang
tidak menyimpan apa pun selama gestur berlangsung (`grouping === true`).

**Perubahan** (`src/main.js`): selama `drag` aktif, jalur itu dilewati — persis perlakuan
yang sudah diterima mode `recording`. Yang tetap berjalan tiap pointermove hanyalah
`updateScene()` dan `buildPaths()`. `endDrag()` yang menutup gestur: `session.end()`
(satu langkah undo), `persist(false)`, `syncCameraUI()`, `renderInspector()`,
`renderTimeline()`.

**Yang tidak berubah:** satu drag tetap satu langkah undo, dokumen tetap divalidasi
sebelum masuk history, dan penyimpanan tetap terjadi ≤1 detik setelah gestur selesai
(PR-03). **Yang berubah dan harus disadari:** bila tab mati **di tengah** drag, gerakan
drag itu belum tersimpan — sama seperti perilaku mode rekam yang sudah ada sejak R0.

**Hasil:** p95 drag 49,1 → **11,6 ms**; maksimum 66,0 → 29,2 ms.

### 8.2 Material dan geometri jalur gerakan dipakai ulang

**Gejala terukur:** `renderer.info.memory.geometries` = 532 pada fixture 20 aktor,
padahal scene hanya berisi 20 aktor + 10 ruang. Sisanya titik jalur.

**Penyebab:** `buildPaths()` membuat `SphereGeometry` dan `MeshBasicMaterial` **baru untuk
setiap titik keyframe** (±480 objek), dan fungsi ini dipanggil pada setiap pointermove.

**Perubahan** (`src/scene-renderer.js`): satu `SphereGeometry` bersama dan satu material
per warna, di-cache pada instance dan ditandai `userData.shared`. `clearGroup()` memeriksa
tanda itu pada **geometri dan material**, bukan pada objek — sehingga geometri garis jalur
(yang memang unik per build) tetap di-dispose sementara sumber daya bersama tidak.

**Hasil:** geometries 532 → **194**, program shader 11 → **7**, tanpa perubahan visual.
Ditambah `dispose()` penuh pada `SceneRenderer` (dipakai saat kembali ke dashboard).

### 8.3 Preview kamera dibatasi 30 fps

**Gejala terukur:** frame-time maksimum 307,4 ms dan 38 dropped frame selama playback 60 s.

**Penyebab:** `renderViewport()` selalu memanggil `renderPOV()`, yaitu render **kedua**
atas seluruh scene ke renderer 1280×720 dengan shadow map — jadi scene digambar dua kali
setiap frame, hanya untuk kotak preview kecil di panel kanan.

**Perubahan** (`src/scene-renderer.js`): preview dibatasi `povFps = 30`. Ekspor memakai
`forcePov: true` sehingga setiap frame yang direkam tetap digambar (frame-count ekspor
tidak berubah), dan `preserveDrawingBuffer` membuat thumbnail tetap dapat diambil kapan
saja di antara render.

**Hasil:** frame-time maksimum 307,4 → **16,6 ms**; dropped frame 38 → **1**.

### 8.4 Yang sengaja TIDAK dioptimalkan

- **Transform incremental** (memperbarui hanya aktor yang berubah alih-alih memanggil
  `sampleScene()` untuk seluruh scene tiap frame). Tidak dikerjakan karena tidak muncul
  sebagai bottleneck: frame-time p95 playback sudah 9,3 ms pada beban penuh, dan mengubah
  jalur sampling berisiko memutus jaminan "preview dan ekspor memakai angka yang sama".
  Kandidat pertama bila pengukuran pada perangkat kelas PRD nanti gagal.
- **Virtualisasi daftar keyframe di timeline.** Setelah 8.1, `renderTimeline()` tidak lagi
  berjalan per pointermove, sehingga biayanya tidak lagi terukur pada jalur panas.
- **Web Worker untuk validasi dokumen.** Tidak ada bukti bahwa validasi menjadi bottleneck
  setelah 8.1.

## 7. Keterbatasan yang diketahui

- Satu mesin, satu browser (Chrome 152 macOS arm64). Edge, Safari dan Firefox belum diuji;
  dukungannya diturunkan dari capability detection, bukan dari klaim uji — lihat
  `docs/BROWSER-SUPPORT.md`.
- **Layar uji 120 Hz.** Semua angka fps mencerminkan refresh rate itu. Pada layar 60 Hz
  angka fps akan mentok di 60; yang harus dibandingkan dengan target adalah frame-time.
- **Perangkat lebih kuat daripada kelas referensi PRD** (lihat §1) — hasil bersifat
  optimistis. Ini keterbatasan terpenting dari seluruh dokumen ini: target PRD dinyatakan
  untuk "laptop 8 GB RAM, GPU terintegrasi", dan angka §6 **tidak** membuktikan target
  terpenuhi di sana. Margin terhadap target memang besar (drag 11,6 ms vs 100 ms → 8,6×;
  buka proyek 333 ms vs 2 000 ms → 6×), tetapi margin bukan pengukuran. Ulangi §5 pada
  perangkat kelas PRD sebelum pilot dan tambahkan barisnya di §6.
- Fixture beban memakai satu scene dan satu shot. Beban multi-scene/multi-shot
  (perpindahan shot berulang) belum punya fixture khusus; tambahkan bila F6-02 menemukan
  bottleneck di jalur `activate()`.
- `projects-100.json` berukuran 2,25 MB total. Skenario "satu proyek metadata 5 MB"
  kini diuji dengan dokumen yang dibangun saat pengukuran (§3) — 165 scene hasil
  penggandaan, bukan proyek yang dibuat manusia. Bentuk bebannya (banyak scene kecil)
  belum tentu sama dengan proyek nyata berukuran sama (mis. satu scene dengan ribuan
  keyframe).
- **Penanda keyframe timeline belum diuji beban ekstrem.** Fixture memakai ≤27 keyframe
  per aktor; `LIMITS.keys` mengizinkan 2 400.
