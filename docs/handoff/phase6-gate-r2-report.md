# Laporan Fase 6 — Gate R2 (F6-09 + bagian gate F5-08) — 8 September 2026

Cakupan yang ditugaskan: F6-09 (gate R2) dan bagian gate dari F5-08; perbaikan risiko murah
yang tercatat di laporan-laporan sebelumnya; `docs/DECISIONS-NEEDED.md`; konsolidasi
dokumen. **Tidak dikerjakan dan tidak dicentang:** F6-10, F6-11, F6-12, seluruh Fase 7 dan
Fase 8. Tidak ada commit. Tidak ada dependency npm baru.

Berhenti karena batas konteks: **tidak** — seluruh cakupan selesai.

## Status task

| Task | Status | Bukti |
|---|---|---|
| F6-09 gate R2 | **Lulus, dicentang** | `docs/GATE-R2.md` (matriks bukti per acceptance criterion + verifikasi ulang gate R1) |
| F5-08 (bagian gate) | **Dicentang sebagian** — gate lulus, **pilot belum** | `plan.md` baris F5-08 menyebut keduanya secara eksplisit; pilot dilacak sebagai F6-10/F6-11/F6-12 yang tetap `[ ]` |
| Pengukuran ulang perf pasca schema v3 | Selesai | `docs/PERF-BASELINE.md` §6 kolom “Setelah v3”, sebaran §6.1, penjelasan §6.2 dan §6.3 |
| Suite regresi gate R2 | Selesai | `tests/gate-r2-browser.mjs` (5 bagian), terdaftar pada `npm run test:browser` |
| Perbaikan risiko murah | Selesai (3 dikerjakan, 1 diperiksa tidak perlu, 1 dicatat sebagai tindak lanjut) | §“Perbaikan risiko murah” di bawah |
| `docs/DECISIONS-NEEDED.md` | Selesai | D-01…D-07, kebutuhan pilot, prasyarat F7-01, cara memulai Fase 8 per item |
| Konsolidasi dokumen | Selesai | `README.md`, `docs/AUDIT.md`, `docs/PRD.md`, `docs/ROLLOUT.md`, `docs/A11Y-AUDIT.md`, `plan.md` |
| F6-10/F6-11/F6-12, Fase 7, Fase 8 | **Sengaja tidak dicentang** | alasan per task ditulis langsung di `plan.md` dan dirinci di `docs/DECISIONS-NEEDED.md` |

## Hasil verifikasi

Lingkungan: macOS 26.2 (Darwin 25.2.0, arm64), Node v22.21.1, Chrome 152 (`channel:'chrome'`),
Vite 7.3.6, dev server `--port 5174 --strictPort`, preview server `--port 4174 --strictPort`.

- `npm test` — **177/177 lulus** (dari 176; +1 test unit untuk bug R2-01).
- `npm run build` — lulus. `dashboard` 16,5 kB tetap tidak menarik Three.js.
- `npm run preview` — lulus, dan kini **dapat diulang**: `node tests/preview-check.mjs`.
- `npm run test:browser` — **12/12 suite lulus** berurutan (11 lama + `gate-r2-browser`).
- `tests/repository-browser.mjs` — **3/3** jalan berturut, termasuk 100 siklus edit/save/reload.
- `tests/export-browser.mjs` — **3/3** jalan berturut; `ffprobe` `vp9 1280x720 nb_read_frames=300
  duration=10.000000` pada tiap jalan.
- `npm run test:perf` — **3 jalan berturut**; hasil di `docs/PERF-BASELINE.md` §6.
- **Tidak ada commit.**

### Angka performa pasca schema v3 (median 3 jalan)

| Metrik | Target PRD §9 | Gate R1 (v2) | Gate R2 (v3) | |
|---|---|---|---|---|
| p95 drag aktor | <100 ms | 11,6 ms | **12,5 ms** | tercapai |
| p95 nudge keyboard | <100 ms | 21,1 ms | **22,8 ms** | tercapai |
| p95 scrub playhead | <100 ms | 18,4 ms | **19,0 ms** | tercapai |
| p95 pindah scene | <100 ms | 44,4 ms | **45,1 ms** | tercapai |
| fps playback 60 s | ≥30 | 120,0 | **120,0** | tercapai |
| frame-time p95 playback | ≤33,3 ms | 9,3 ms | **10,0 ms** | tercapai |
| dropped frames 60 s | dilaporkan | 1 (0,01%) | **1** (0,01%) | tercapai |
| p95 buka proyek (fixture beban) | ≤2 s | 333 ms | **324 ms** | tercapai |
| p95 buka dokumen 5 023 714 B / 165 scene | ≤2 s | 317 ms | **554 ms** | tercapai |
| transaksi `documents` saat dashboard 102 kartu | 0 | 0 | **0** | tercapai |
| `geometries` 20 siklus rebuild | tanpa tren naik | 194 → 194 | **264 → 262** | tercapai |

**Tidak ada metrik yang melewati target PRD, jadi tidak ada bottleneck terukur yang
dioptimalkan.** Dua angka yang bergerak paling jauh dijelaskan, bukan diabaikan:

- **Buka dokumen 5 MB 317 → 554 ms.** Fixture 5 MB berformat schema **v2**, dan sejak Fase 4b
  setiap dokumen tersimpan dilewatkan `openProjectData`. Angka itu memuat `migrateV2ToV3` atas
  165 scene plus satu penyimpanan ulang hasil upgrade — biaya **satu kali per dokumen** pada
  pemakaian nyata, dan tetap 3,6× lebih cepat daripada target. Fixture sengaja **tidak** diubah
  menjadi v3: kalau diubah, kasus “dokumen v2 lama milik pengguna” berhenti terukur.
  `docs/PERF-BASELINE.md` §6.2.
- **`geometries` 194 → 264, `programs` 7 → 11.** Bukan kebocoran: kriteria lulusnya “tidak ada
  tren naik setelah 20 siklus”, dan 264 → 262 memenuhinya persis seperti 194 → 194. Angka
  dasarnya naik karena scene demo v3 memang berisi 15 prop ber-ID + dinding modular. §6.3.

Sebaran antar-jalan ≤2,4 ms untuk seluruh metrik interaksi/playback; yang berayun hanya “buka
5 MB” (±94 ms, ≈17%) karena jalur migrasinya. Gate R1 baru menjalankan 1 jalan per skenario;
gate R2 menjalankan 3 seperti yang diminta `docs/PERF-BASELINE.md` §2.

## Bug yang ditemukan dan diperbaiki

### R2-01 · Session state basi setelah reload cepat (kelas: kebenaran state / PR-05)

Ditemukan dari kegagalan **acak** `tests/editor-regression.mjs` ketika suite dijalankan
berurutan: setelah `page.reload()` editor kadang membuka tab “Kamera” padahal seleksi terakhir
adalah karakter. Standalone selalu lulus — jenis kegagalan yang mudah dibuang sebagai “flaky”.

Penyebabnya nyata: `SessionTracker.record()` men-throttle **seluruh** field pada 1 detik,
sementara transaksi IndexedDB yang dimulai pada `pagehide` tidak dijamin commit (temuan Fase 2
keputusan 5). Scene, shot dan seleksi yang berubah <1 detik sebelum reload karena itu tidak
pernah tertulis. Ini menyentuh acceptance criteria **PR-05** “scene aktif dipulihkan setelah
reload” secara langsung: pindah scene lalu reload cepat mengembalikan pengguna ke scene lama.

**Perbaikan** (`src/session-state.js`): perpindahan **navigasi** (`sceneId`, `shotId`,
`selectedId`) menembus throttle dan ditulis seketika; playhead dan pose observer — dua field
berfrekuensi tinggi yang menjadi alasan throttle itu ada — tetap digabung. `write()` juga
membatalkan timer yang menggantung supaya state basi tidak menyusul sesudahnya.

**Uji regresi:** unit “perpindahan scene/shot/seleksi menembus throttle session state”
(`tests/repository.test.js`) dengan jam palsu; ia membuktikan playhead **tetap** ter-throttle,
sehingga perbaikan ini tidak diam-diam membatalkan alasan throttle itu ada.

### R2-02 · Objek set terkunci masih dapat diduplikasi (kelas: lock)

Ditemukan `tests/gate-r2-browser.mjs` §2. Inspector prop/dinding terkunci menampilkan “Objek
terkunci. Buka gembok di daftar untuk mengedit.” sementara `#duplicate-object` tetap aktif.
Salinan lahir **tidak terkunci** dan hanya bergeser 0,5 m, jadi di viewport ia terbaca seperti
objek terkunci yang berpindah — persis kebingungan yang hendak dicegah lock (ED-02). Hapus
sudah dinonaktifkan saat terkunci; duplikasi terlewat.

**Perbaikan** (`src/main.js`): tombol dinonaktifkan saat `o.locked` **dan** `duplicateSetPiece()`
menolak sumber terkunci dengan pesan. Penegakan ada di lapisan command, sehingga memaksa lewat
DOM atau lewat kait uji tetap ditolak.

### R2-03 · Build produksi mengeluarkan 404 (kelas: kebersihan rilis)

Ditemukan `tests/preview-check.mjs` yang baru: `npm run preview` menghasilkan
`Failed to load resource: 404` pada setiap pemuatan karena `index.html` tidak punya
`<link rel="icon">`. Bukan cacat fungsi — tetapi verifikasi `npm run preview` pada gate R1
dinyatakan “tanpa error halaman”, dan pernyataan itu benar hanya karena yang diperiksa
`pageerror`, bukan console. Console yang sudah berisi error membuat error lain lebih mudah
terlewat saat pilot.

**Perbaikan:** favicon SVG **inline** (data URI) — tanpa berkas tambahan dan tanpa permintaan
jaringan.

## Perbaikan risiko murah yang tercatat di laporan sebelumnya

| # | Risiko | Sumber | Tindakan |
|---|---|---|---|
| P-01 | “Belum ada versi build yang terlihat di UI” | `docs/GATE-R1.md` C-05, `docs/ROLLOUT.md` §8 | **Dikerjakan.** `vite.config.js` menyuntikkan versi `package.json` + hash commit pendek lewat `define`; `src/build-info.js` membacanya dengan fallback aman; ditampilkan di footer dashboard dan panel “Panduan singkat” editor sebagai `v1.0.0 · <hash>`, dengan sufiks `+lokal` bila working tree kotor |
| P-02 | “Batch shot memicu beberapa unduhan berturut-turut; Chrome dapat meminta izin” | `docs/handoff/phase5-report.md` | **Dikerjakan (mitigasi, bukan penghapusan).** Unduhan diserialkan berjeda 300 ms; ringkasan dialog menyebut jumlah berkas sebelum mulai; setiap berkas tetap tersedia sebagai tombol “Unduh ulang” (retensi 24 berkas / 250 MB). Menggabungkan menjadi satu ZIP per shot **tidak** dikerjakan — format biner baru tepat sebelum gate; dicatat sebagai tindak lanjut |
| P-03 | “Muxer tanpa SeekHead/Cues” | `docs/handoff/phase5-report.md` | **Diperiksa: Cues sudah ada** sejak F5-04, dan 20 unit test memverifikasi setiap `CueClusterPosition` mendarat tepat pada ID cluster; `ffprobe` membaca durasi tepat dan seek mendarat dalam 0,2 s. **SeekHead** sengaja tidak dikerjakan (manfaat kecil, menuntut penulisan dua-lintasan pada berkas yang sudah terbukti benar) — `docs/GATE-R2.md` C-04 |
| P-04 | “`npm run test:perf` belum diukur ulang pasca v3” | `docs/handoff/phase4b-report.md` risiko 1 | **Dikerjakan**, 3 jalan; lihat tabel di atas |
| P-05 | “`npm run preview` hanya diverifikasi manual” | `docs/GATE-R1.md` §1 | **Dikerjakan.** `tests/preview-check.mjs`; menemukan R2-03 pada jalan pertama |

## Perubahan file

**Baru**

- `src/build-info.js` — identitas build (`BUILD_VERSION`, `BUILD_COMMIT`, `BUILD_TIME`,
  `buildLabel()`, `buildTitle()`) dengan fallback aman sehingga modul tetap dapat diimpor dari
  `node --test` tanpa Vite.
- `tests/gate-r2-browser.mjs` — suite gate R2 (5 bagian), terdaftar pada `npm run test:browser`.
- `tests/preview-check.mjs` — verifikasi build produksi lewat server preview; **tidak** masuk
  `test:browser` karena butuh server yang berbeda.
- `docs/GATE-R2.md` — matriks bukti gate R2.
- `docs/DECISIONS-NEEDED.md` — keputusan D-01…D-07, kebutuhan pilot, prasyarat Fase 7, Fase 8.
- `docs/handoff/phase6-gate-r2-report.md` (berkas ini).

**Diubah — `src/`**

- `src/session-state.js` — perpindahan navigasi menembus throttle (R2-01); `write()` membatalkan
  timer yang menggantung.
- `src/main.js` — duplikasi objek set terkunci ditolak di lapisan command dan tombolnya
  dinonaktifkan (R2-02); baris versi build pada panel “Panduan singkat”.
- `src/dashboard.js` — footer dashboard dengan versi build.
- `src/export/ui.js` — pengiriman berkas diserialkan berjeda + daftar “Unduh ulang” + ringkasan
  jumlah berkas (P-02); dialog menunggu rantai unduhan habis sebelum dianggap selesai.
- `src/style.css` — blok gate R2: `.dash-footer`, `.build-badge`, `.help-build`, `.export-files`.
- `index.html` — favicon SVG inline (R2-03).
- `vite.config.js` — `define` untuk versi/commit/waktu build (P-01).

**Diubah — `tests/`**

- `tests/repository.test.js` — 1 test unit baru untuk R2-01.
- `package.json` — `tests/gate-r2-browser.mjs` masuk `npm run test:browser`.

**Diubah — dokumen**

- `docs/PERF-BASELINE.md` — kolom “Setelah v3” pada kedua tabel §6, jalan baru, §6.1 sebaran
  antar-jalan, §6.2 penjelasan kenaikan buka 5 MB, §6.3 penjelasan penghitung GPU, §7 disegarkan.
- `docs/GATE-R1.md` — **tidak diubah** (matriksnya tetap berlaku dan dirujuk apa adanya).
- `docs/ROLLOUT.md` — §1 (perintah dan verifikasi pra-rilis kini menyertakan `preview-check`),
  §8 (versi build selesai; D-04 ditambahkan sebagai yang belum siap).
- `docs/A11Y-AUDIT.md` — T-01 diperbarui: 10 → 17 penanda pada 390 px karena schema v3
  menggandakan lane, penanda orientasi 7 × 7 px, dan alasan mengapa TL-01 tidak menutup temuan ini.
- `docs/AUDIT.md` — tabel baru “Temuan yang sudah terselesaikan” (11 baris dengan bukti),
  “Prioritas produk berikutnya” ditulis ulang hanya berisi yang tersisa, “Verifikasi yang
  tersedia” dan “Batas kesimpulan” disegarkan.
- `docs/PRD.md` — catatan status di kepala (**bukan** perubahan requirement) dan bagian
  “Pembaruan implementasi berikutnya” ditulis ulang: ringkasan R1/R2 terimplementasi per
  requirement, status NFR §9, dan daftar eksplisit apa yang **belum diverifikasi** karena
  menunggu pilot. **Tidak ada acceptance criterion yang diubah.**
- `README.md` — status proyek, kemampuan ekspor dan build version, alur
  proyek→scene→shot→ekspor sebagai tabel kepemilikan data, detail persistensi v3, daftar
  perintah uji lengkap, struktur berkas, roadmap, dan daftar dokumen terkait.
- `plan.md` — F6-09 dan F5-08 dicentang dengan bukti; alasan ditulis pada setiap `[ ]` yang
  tersisa; tabel keputusan D-01/D-02/D-03/D-07 diperjelas; bagian “Verifikasi dan definisi
  selesai per task” diperbarui; 13 baris log baru; tabel “Log pelaksanaan” yang sempat terpotong
  oleh bagian “Langkah berikutnya” **disatukan kembali** dan “Langkah berikutnya” dipindahkan ke
  akhir berkas serta ditulis ulang.

## Keputusan & asumsi

1. **F5-08 dicentang hanya untuk bagian gate-nya, dan itu ditulis pada barisnya sendiri.**
   Task ini memuat dua pekerjaan (“jalankan gate R2” dan “pilot Fase 6”). Mencentangnya polos
   akan membaca seolah pilot sudah dijalankan. Barisnya karena itu berbunyi “sebagian — hanya
   bagian gate” dan menyebut bahwa **rilis output produksi belum boleh dinyatakan**.
2. **Kegagalan acak diperlakukan sebagai bug, bukan sebagai flake.** `editor-regression` gagal
   1 dari beberapa jalan dan lulus standalone. Menandainya “flaky” akan menyembunyikan R2-01,
   yang menyentuh acceptance criteria PR-05. Preseden yang sama sudah dipakai gate R1 (B-04).
3. **Duplikasi objek terkunci diperlakukan sebagai pelanggaran lock**, meskipun secara harfiah
   ia tidak memutasi objek sumbernya. Yang menentukan adalah apa yang dilihat pengguna: objek
   kedua yang tidak terkunci muncul 0,5 m dari objek yang mereka kunci.
4. **Batch ekspor tidak diubah menjadi ZIP.** Menulis format biner baru tepat sebelum gate
   menukar risiko yang diketahui (izin unduhan browser) dengan risiko yang belum diketahui
   (muxer ZIP sendiri). Mitigasinya justru dibuat sedemikian sehingga tidak ada berkas yang
   dapat hilang diam-diam.
5. **Fixture beban 5 MB tetap berformat v2.** Mengubahnya ke v3 akan menurunkan angka “buka
   proyek” tetapi menghapus satu-satunya pengukuran atas kasus nyata “dokumen v2 lama pengguna
   dibuka oleh build v3”.
6. **`tests/preview-check.mjs` tidak dimasukkan ke `npm run test:browser`.** Ia membutuhkan
   server preview pada port berbeda; memaksanya masuk berarti `test:browser` gagal bagi siapa
   pun yang hanya menjalankan dev server.
7. **Versi build memakai `define` Vite, bukan `import.meta.env`.** `define` bekerja sama baiknya
   dan tidak menuntut penamaan `VITE_*` maupun berkas `.env`; kegagalan `git` ditangkap sehingga
   build dari arsip tarball tetap berhasil (`tanpa-git`).
8. **Tanpa dependency baru.**

## Yang belum selesai / cara melanjutkan

Tidak ada pekerjaan gate R2 yang tertinggal. Yang tersisa **tidak dapat diselesaikan dengan
menulis kode**:

1. **Tiga pekerjaan yang wajib selesai sebelum pilot** — dapat dikerjakan sekarang juga:
   uji Edge (`docs/BROWSER-SUPPORT.md` §5), `PERF_LABEL=<perangkat> npm run test:perf` pada
   perangkat kelas PRD (8 GB, GPU terintegrasi), dan keputusan **D-04**.
2. **Pilot F6-10/F6-11** — protokol siap; yang belum ada adalah peserta, fasilitator, jendela
   dua minggu dan cara menyajikan build (`docs/DECISIONS-NEEDED.md` §3).
3. **F6-12** — menunggu hasil pilot dan keputusan hosting.
4. **Fase 7** — ditahan D-01 dan D-07; opsi konkret tanpa memilih vendor di
   `docs/DECISIONS-NEEDED.md` §4.
5. **Fase 8** — menunggu sinyal dari pilot; sinyal dan spike per item di §5 dokumen yang sama.

Tindak lanjut teknis yang boleh dikerjakan kapan saja tanpa keputusan produk, dengan perkiraan
biaya, ada di `docs/GATE-R2.md` §7: ZIP batch, SeekHead, streaming ekspor ke disk, Worker,
marquee select keyframe, dan pemeriksaan kunci writer pada rename dari dashboard.

## Risiko / catatan untuk fase berikutnya

- **Jangan mengembalikan throttle penuh pada `SessionTracker`.** Perpindahan navigasi harus
  tetap menembus throttle; unit test menjaga keduanya sekaligus (navigasi seketika, playhead
  tetap digabung). Menambah field baru ke `record()` berarti memutuskan secara sadar ia masuk
  kategori navigasi atau kategori berfrekuensi tinggi.
- **Jangan memanggil `deps.download()` langsung dari jalur job ekspor.** Pakai `deliver()`;
  ia yang menyerialkan unduhan dan mencatat berkas ke daftar “Unduh ulang”. Memanggil
  `download()` langsung mengembalikan risiko unduhan yang dijatuhkan browser tanpa pesan.
- **Retensi blob pada dialog ekspor dibatasi 24 berkas / 250 MB.** Batch yang jauh lebih besar
  akan melepas entri terlama (dan menyatakannya di UI). Bila kelak batch besar menjadi normal,
  ganti retensi blob dengan penulisan ke disk, jangan sekadar menaikkan batasnya.
- **`__APP_VERSION__` / `__APP_COMMIT__` / `__APP_BUILT_AT__` hanya ada setelah build Vite.**
  `src/build-info.js` sengaja membungkusnya dengan `try/catch` supaya modul tetap dapat diimpor
  dari Node. Jangan menghapus pembungkus itu.
- **`tests/gate-r2-browser.mjs` §2 mengaktifkan paksa input inspector lewat DOM.** Setiap
  asersi tentang tombol yang dinonaktifkan harus dilakukan **sebelum** langkah itu, atau
  setelah inspector dirender ulang.
- **`docs/PERF-BASELINE.md` kini punya kolom “Setelah v3”.** Pengukuran berikutnya (perangkat
  kelas PRD) sebaiknya menjadi **baris** baru pada tabel jalan, bukan kolom lagi — kolom
  keempat akan membuat tabelnya tidak terbaca.
- **`plan.md` sempat memiliki tabel log yang terpotong** oleh bagian “Langkah berikutnya”
  (baris log ditambahkan di akhir berkas oleh beberapa fase). Sekarang tabel itu utuh dan
  “Langkah berikutnya” ada di paling akhir. Tambahkan baris log **di dalam tabel**, bukan di
  akhir berkas.
- **`artifacts/` diabaikan Git.** `perf-baseline.json` dan `a11y-report.json` ditulis ulang
  setiap kali harness dijalankan; angka yang bertahan ada di `docs/PERF-BASELINE.md` dan
  `docs/A11Y-AUDIT.md`.
