# Baseline performa — perangkat referensi, fixture beban dan protokol ukur

Status: **F6-01 selesai (definisi + fixture)**. F6-02 dan F6-03 **belum diukur**.

> Semua angka pada kolom **Target** berasal dari PRD §9 dan merupakan **target usulan,
> bukan hasil pengukuran**. Kolom **Baseline** dan **Hasil** masih kosong dan hanya boleh
> diisi dengan angka yang benar-benar terukur pada perangkat referensi di bawah.
> Jangan menyatakan target tercapai karena test otomatis lulus (plan.md, kriteria keluar Fase 6).

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
| Ulangan | 3 kali jalan per skenario; laporkan median antar-jalan dan p95 dalam jalan |

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
- **Konflik yang perlu keputusan (bukan untuk diubah di F6-01):** `LIMITS.documentBytes`
  = 3 000 000 B, sementara PRD §9 menargetkan "buka proyek p95 ≤2 detik untuk proyek
  metadata **≤5 MB** tanpa aset". Dokumen 5 MB melewati batas internal 3 MB.
  Usulan: naikkan `LIMITS.documentBytes` menjadi `5_000_000` agar sejajar dengan PRD,
  atau turunkan target PRD menjadi 3 MB. Saat ini `documentBytes` **belum dipakai** oleh
  `validateDocument` — hanya nilai deklaratif — jadi tidak ada penolakan nyata.
  Selesaikan sebelum F6-03 diukur supaya definisi "proyek ≤5 MB" tidak ambigu.

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
# 1. Regenerasi fixture beban (opsional; hasilnya deterministik)
node tests/fixtures/load/generate.mjs

# 2. Kunci bentuk fixture (bagian dari npm test)
node --test tests/load-fixtures.test.js

# 3. Suite penuh
npm test
npm run build

# 4. Pengukuran browser (F6-02 / F6-03 — harness belum ada, dibuat pada task tersebut)
npm run dev -- --port 5174 --strictPort   # jalankan di background
#   lalu harness Playwright headed, viewport 1280x720,
#   args: --enable-webgl --ignore-gpu-blocklist
# matikan dev server setelah selesai
```

Setiap sesi ukur wajib mencatat: tanggal, commit SHA, mode (headed/headless), build
(dev/preview), dan perangkat. Tanpa itu angka tidak boleh dimasukkan ke tabel §6.

---

## 6. Tabel hasil — Baseline / Target / Hasil

**Belum diisi.** Target berasal dari PRD §9. Baseline = pengukuran pertama sebelum
optimasi apa pun. Hasil = pengukuran sesudah optimasi pada task terkait.

### F6-02 — interaksi dan playback

| Metrik | Perangkat / mode | Baseline | Target (PRD) | Hasil | Tanggal / commit |
|---|---|---|---|---|---|
| p95 input → viewport, drag aktor | — | — | <100 ms | — | — |
| p95 input → viewport, nudge keyboard | — | — | <100 ms | — | — |
| p95 input → viewport, scrub playhead | — | — | <100 ms | — | — |
| fps rata-rata, playback 60 s | — | — | ≥30 fps | — | — |
| frame-time p95, playback 60 s | — | — | ≤33,3 ms | — | — |
| dropped frames, playback 60 s | — | — | dilaporkan (tanpa ambang PRD) | — | — |

### F6-03 — buka proyek, dashboard dan memori

| Metrik | Perangkat / mode | Baseline | Target (PRD) | Hasil | Tanggal / commit |
|---|---|---|---|---|---|
| p95 buka proyek (metadata ≤5 MB) | — | — | ≤2 detik | — | — |
| Waktu render dashboard 100 proyek | — | — | dilaporkan | — | — |
| Scene yang dibaca saat dashboard tampil | — | — | 0 | — | — |
| JS heap sesudah 20 siklus vs siklus ke-5 | — | — | ≤ +10%, tanpa tren naik | — | — |
| `renderer.info.memory.geometries` siklus 20 | — | — | tanpa tren naik | — | — |
| `renderer.info.memory.textures` siklus 20 | — | — | tanpa tren naik | — | — |

---

## 7. Keterbatasan yang diketahui

- Satu mesin, satu browser (Chrome 152 macOS arm64). Edge, Safari dan Firefox belum diuji
  (F6-05 menangani capability detection dan fallback).
- Perangkat lebih kuat daripada kelas referensi PRD (lihat §1) — hasil bersifat optimistis.
- Fixture beban memakai satu scene dan satu shot. Beban multi-scene/multi-shot
  (perpindahan shot berulang) belum punya fixture khusus; tambahkan bila F6-02 menemukan
  bottleneck di jalur `activate()`.
- `projects-100.json` berukuran 2,25 MB total, jauh di bawah plafon 5 MB. Untuk menguji
  langsung skenario "satu proyek metadata 5 MB", perlu fixture tambahan — dan keputusan
  soal `LIMITS.documentBytes` di §3 harus diselesaikan lebih dahulu.
