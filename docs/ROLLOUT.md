# Rollout, rollback dan cadangan migrasi — F6-07

Menjabarkan PRD §14 menjadi prosedur yang dapat dijalankan. Prinsip yang mengikat
seluruh dokumen ini: **rollback aplikasi tidak boleh menghapus data schema baru**
(PRD §14 poin 6). Setiap langkah di bawah dirancang supaya membatalkan rilis hanya
menurunkan kemampuan, tidak pernah menghilangkan karya pengguna.

## 1. Build dan lingkungan

| Perintah | Kegunaan | Status |
|---|---|---|
| `npm run dev -- --port 5174 --strictPort` | pengembangan dan seluruh suite browser | dipakai setiap hari |
| `npm run build` | build produksi ke `dist/` | lulus |
| `npm run preview -- --port 4174 --strictPort` | menyajikan `dist/` untuk verifikasi pra-rilis | **diverifikasi 8 Sep 2026** (gate R2) |
| `node tests/preview-check.mjs` | verifikasi otomatis atas build produksi yang sedang di-preview | lulus — menolak setiap `pageerror`, console `error` **dan** respons HTTP ≥400; memastikan versi build terlihat |
| `npm test` | 177 unit test | lulus |
| `npm run test:browser` | 12 suite Playwright (Chrome) | lulus |
| `npm run test:perf` | harness performa F6-02/F6-03 | lihat `docs/PERF-BASELINE.md` §6 (kolom “Setelah v3”) |

Aplikasi ini **statis sepenuhnya**: `dist/` berisi HTML/JS/CSS tanpa backend, tanpa
variabel lingkungan, tanpa kunci API. Rilis berarti menyalin `dist/` ke hosting statis
mana pun; rollback berarti menyalin `dist/` versi sebelumnya. Tidak ada migrasi server.

Verifikasi pra-rilis minimum pada hasil `npm run preview` — jalankan
`node tests/preview-check.mjs` lebih dahulu (ia menutup langkah 1, 2 dan identitas build
secara otomatis), lalu periksa manual sisanya:

1. Buka `/` — editor muncul, viewport menggambar, status "Tersimpan lokal". *(otomatis)*
2. Buka `/#/` — dashboard menampilkan proyek. *(otomatis)*
3. Versi build terlihat di footer dashboard dan panduan editor, dan **cocok dengan commit
   yang dirilis**. *(otomatis)*
4. Buat proyek → tambah aktor → reload → perubahan bertahan.
5. Ekspor paket lalu impor kembali — proyek setara.
6. Ekspor satu shot ke video — berkas terunduh dan dapat diputar.

## 2. Feature flag dashboard (pilot)

PRD §14 poin 3: *"R1 dashboard di balik feature flag selama pilot"*.

```js
// mematikan dashboard (peserta pilot langsung masuk editor proyek terakhir)
localStorage.setItem('blocking-room.flags.dashboard', 'off');
// menyalakan kembali
localStorage.setItem('blocking-room.flags.dashboard', 'on');
// kembali ke nilai bawaan (aktif)
localStorage.removeItem('blocking-room.flags.dashboard');
```

Nilai yang diterima: `on/true/1/yes/aktif` dan `off/false/0/no/mati` (huruf besar-kecil
bebas). Nilai lain diabaikan dan flag kembali ke bawaan. Implementasi: `src/flags.js`,
unit test `tests/rollout.test.js`, uji perilaku `tests/capability-browser.mjs` bagian 4.

**Yang terjadi saat flag mati:**

- Rute `#/` dan `#/trash` dialihkan ke editor proyek terakhir, dan hash dibersihkan dari
  URL supaya alamat yang terlihat jujur.
- Tombol "Semua proyek" dan tombol kembali di header disembunyikan.
- Layar fallback no-WebGL juga menyembunyikan tombol "Buka daftar proyek".

**Yang TIDAK terjadi:** tidak ada satu pun perubahan pada data. Proyek, scene, trash,
revisi dan aset tetap tersimpan seperti biasa; menyalakan flag kembali langsung
memunculkan semuanya. Flag hanya boleh mematikan permukaan UI — aturan ini ditulis di
kepala `src/flags.js` supaya flag berikutnya tidak menjadi cabang perilaku data.

## 3. Cadangan migrasi — apa yang ada dan di mana

Migrasi v1 → v2 memakai aturan **copy-first**: sumber lama tidak pernah dihapus dan
tidak pernah ditimpa.

| Kunci localStorage | Isi | Kapan ditulis |
|---|---|---|
| `blocking-room` | dokumen lama (v1, v2 atau v3) | **tidak pernah** disentuh oleh migrasi; ini sumber aslinya |
| `blocking-room.backup` | salinan **mentah** teks sumber sebelum apa pun dipakai | sebelum dokumen hasil migrasi dipakai, dan juga ketika sumber gagal dibaca |
| `blocking-room.migrated` | id proyek hasil migrasi | **hanya setelah** transaksi IndexedDB commit — sehingga migrasi ulang tidak pernah membuat proyek duplikat |
| `blocking-room.activeProject` | id proyek yang dibuka editor | setiap kali proyek dibuka |
| `blocking-room.pending` | titipan sinkron saat tab ditutup sebelum transaksi commit | pada `pagehide`/`beforeunload` |
| `blocking-room.flags.*` | feature flag | saat diubah |
| `blocking-room.metrics`, `blocking-room.telemetryOptIn` | metrik lokal dan preferensi | saat dipakai |

### Cara membaca `blocking-room.backup`

Isinya adalah **teks JSON mentah persis seperti sebelum migrasi** — bukan format khusus.

```js
// di console browser pada origin aplikasi
const raw = localStorage.getItem('blocking-room.backup');
JSON.parse(raw).version;   // 1  → JSON v1, dapat dibuka build lama maupun build baru
JSON.parse(raw).schemaVersion; // 2 → dokumen v2, 3 → dokumen v3
copy(raw);                 // salin ke clipboard, simpan sebagai .json
```

Berkas hasilnya dapat langsung ditarik ke tombol **Buka** di editor atau **Impor** di
dashboard. Bila `version === 1`, berkas itu juga dapat dibuka oleh build R0 lama tanpa
perubahan apa pun.

Kalau `blocking-room.backup` tidak ada, artinya migrasi memang tidak pernah dijalankan
di perangkat itu (instalasi baru langsung memakai IndexedDB) — bukan kegagalan.

## 4. Jalan keluar data yang selalu tersedia

Empat jalur, dari yang paling lengkap ke yang paling kompatibel:

| Jalur | Isi | Untuk apa |
|---|---|---|
| **Ekspor paket** (dashboard, `.blockingroom.json`) | manifest + dokumen + aset + checksum SHA-256 per bagian | memindahkan proyek utuh antar-perangkat |
| **Simpan proyek** (editor, tombol unduh) | dokumen versi terkini (v3) lengkap | cadangan cepat satu proyek |
| **Unduh JSON v1** (editor → Riwayat versi → "Unduh JSON v1") | scene + shot aktif dalam format v1 | **rollback ke build lama** |
| **Unduh cadangan** (editor, muncul saat penyimpanan gagal) | dokumen yang ada di memori | menyelamatkan pekerjaan saat IndexedDB bermasalah |

### Ekspor kompatibel v1 (`exportAsV1`)

`src/migrate.js` → `exportAsV1(doc, {sceneId, shotId})`. Menghasilkan
`{data, dropped}`: `data` adalah JSON v1 yang dapat dibuka build lama, `dropped`
adalah daftar hal yang tidak terbawa.

Terbukti setara: `v1 → migrateV1ToV2 → exportAsV1` menghasilkan dokumen yang
`deepEqual` dengan v1 aslinya (`tests/rollout.test.js`), dan berkas hasilnya dapat
diimpor kembali oleh aplikasi (`tests/capability-browser.mjs` bagian 5).

**Yang hilang saat menurunkan versi** — dilaporkan ke pengguna lewat toast, bukan
disembunyikan: scene lain, shot lain, `fps`, `aspectRatio`, catatan scene/shot,
thumbnail, dan aset. Format v1 memang hanya menampung satu scene dan satu shot.

## 5. Prosedur rollback aplikasi

**Kapan:** ditemukan bug kehilangan data, lock bypass, atau kegagalan migrasi kritis
(PRD §14 poin 5 — kehilangan data menghentikan rollout).

**Langkah:**

1. **Hentikan rollout.** Jangan sebarkan build baru ke peserta pilot berikutnya.
2. **Kumpulkan bukti sebelum apa pun diubah.** Minta peserta menjalankan
   "Riwayat versi → Unduh JSON v1" **dan** "Ekspor paket" untuk setiap proyek yang
   terpengaruh, serta menyalin `blocking-room.backup` bila ada. Ekspor metrik lokal
   (header → "Lihat metrik lokal" → Ekspor JSON) — berisi `autosave_failed` dengan
   `error_code`, tanpa isi karya.
3. **Kembalikan `dist/` ke build stabil sebelumnya.** Karena aplikasi statis, ini satu
   langkah dan tidak menyentuh data pengguna.
4. **Jangan menghapus apa pun di IndexedDB.** Build R1 lama membaca schema v2; sejak Fase 4b
   dokumen aktif berbentuk v3, jadi minta peserta menekan **"Riwayat versi → Unduh JSON v2
   (build R1)"** lebih dahulu — berkas itulah yang dapat diimpor build lama, dan ia
   mempertahankan seluruh scene, shot dan keyframe (yang hilang hanya prop, dinding modular
   dan interpolasi non-linear, dan ketiganya disebutkan pada toast).
   Database `blocking-room` (store `projects`, `documents`, `revisions`, `assets`,
   `sessions`) dibiarkan utuh.
5. **Bila harus mundur ke build R0 (pra-IndexedDB):** R0 hanya mengenal JSON v1 di
   `localStorage['blocking-room']`. Data v2 di IndexedDB **tidak akan terlihat**, tetapi
   juga **tidak hilang**. Jalannya: impor berkas hasil "Unduh JSON v1" ke build R0.
   Kunci `blocking-room` yang asli juga masih ada bila perangkat itu pernah memakai R0.
6. **Catat di `plan.md`** (tabel "Log pelaksanaan") apa yang di-rollback dan mengapa,
   lalu buat task mitigasi sebelum rollout dilanjutkan (PRD §14 poin 5, F6-12).

### Yang membuat rollback aman

| Jaminan | Mekanismenya |
|---|---|
| Data v2 tidak dihapus oleh rollback | rollback hanya mengganti berkas statis; IndexedDB milik origin, bukan milik build |
| Sumber v1 lama tetap ada | migrasi copy-first tidak pernah menghapus `blocking-room` |
| Dokumen dari build lebih baru tidak dirusak build lama | `SchemaTooNewError`: dokumen dengan `schemaVersion` di atas versi build **tidak dibuka dan tidak ditimpa**, autosave dimatikan untuk sesi itu |
| Selalu ada berkas yang dapat dibaca build lama | `exportAsV2` (seluruh scene/shot, untuk build R1) + `exportAsV1` (satu scene/shot, untuk build R0) + `blocking-room.backup` |
| Kegagalan tulis tidak mengklaim sukses | status "Tersimpan lokal" hanya muncul setelah transaksi IndexedDB commit |

## 6. Pembaca schema baru yang stabil

Kontrak yang tidak boleh dilanggar tanpa menaikkan `SCHEMA_VERSION`:

- `detectVersion()` mengenali `schemaVersion` (v2 dan v3) dan `version: 1` (v1). Bentuk lain
  ditolak dengan pesan, bukan ditebak.
- `openProjectData()` selalu meng-clone input, memvalidasi hasil, dan melempar bila gagal
  — pemanggil tetap memegang dokumen lamanya.
- `validateDocument()` adalah satu-satunya definisi "dokumen sah". Setiap penulisan
  melewatinya (`EditorSession.validatedSnapshot`).
- Field yang tidak dikenal **tidak** dipertahankan. Konsekuensi yang disengaja: dokumen
  yang ditulis build lebih baru tidak akan kehilangan field diam-diam, karena build lama
  menolaknya lebih dahulu lewat `SchemaTooNewError`.

**Schema v3 sudah dilakukan (Fase 4b)** persis dengan aturan itu: `SCHEMA_VERSION = 3`,
`migrateV2ToV3` copy-first, golden pose Fase 0 tetap dibandingkan, dan **`exportAsV2` ditambahkan
bersama migrasinya** — bukan sesudah. Aturan yang sama berlaku untuk kenaikan versi berikutnya:
tulis migrator dan penurun versinya dalam perubahan yang sama, dan lewatkan **setiap** titik
yang membaca dokumen tersimpan melalui `openProjectData` (daftarnya di
`docs/DATA-MODEL.md` §6).

## 7. Pemantauan selama pilot

Tanpa telemetry eksternal (PRD §9 Privasi: lokal tanpa akun pada R1), pemantauan
mengandalkan metrik lokal yang diekspor peserta:

- `autosave_failed` dengan `error_code` (`quota`/`unavailable`/`readonly`/`unknown`) —
  **indikator kehilangan data paling awal.** Satu pun kejadian wajib ditelusuri.
- `export_failed` dengan `codec` dan `error_code` — untuk target keberhasilan ekspor ≥95%.
- `project_opened`/`project_created` `duration_ms` — untuk "waktu ke video pertama".
- `recovery_used` dengan `action` dan `snapshot_age` — seberapa sering pemulihan dipakai.

Metrik **tidak pernah** memuat nama proyek, nama karakter, catatan atau isi scene; itu
dijamin secara struktural oleh skema tertutup di `src/metrics.js` dan diuji di
`tests/metrics.test.js` serta `tests/capability-browser.mjs` bagian 3.

**Telemetry eksternal belum diimplementasikan sama sekali.** Panel metrik menyimpan
preferensi opt-in (`blocking-room.telemetryOptIn`) supaya keputusan peserta tercatat,
tetapi tidak ada kode jaringan di jalur metrik — diuji dengan memantau seluruh request
halaman setelah opt-in dinyalakan.

## 8. Yang belum siap untuk rollout produksi

Ditulis di sini supaya tidak terlewat saat F6-12 memutuskan deployment:

- **Belum ada target hosting yang ditetapkan.** PRD §15 menyebut "deployment produksi
  hanya ketika scope/lingkungan rilis sudah ditetapkan" (F6-12).
- ~~**Belum ada versi build yang terlihat di UI.**~~ **Selesai pada gate R2.**
  `vite.config.js` menyuntikkan versi `package.json` dan hash commit pendek lewat `define`
  (`__APP_VERSION__`, `__APP_COMMIT__`, `__APP_BUILT_AT__`); `src/build-info.js`
  membacanya dengan fallback aman. Ditampilkan sebagai `v1.0.0 · <hash>` di **footer
  dashboard** dan pada panel “Panduan singkat” editor, dengan `title=` yang memuat waktu
  build. Hash diberi sufiks `+lokal` bila working tree kotor, sehingga build dari
  perubahan yang belum di-commit tidak dapat disalahartikan sebagai commit itu sendiri.
  Diverifikasi otomatis oleh `tests/preview-check.mjs`. **Minta angka ini pada setiap
  laporan bug pilot** — `docs/PILOT-PROTOCOL.md` §2 langkah 1 sudah meminta fasilitator
  mencatat hash build.
- **Belum ada uji Edge**, padahal PRD §9 menuntutnya (lihat `docs/BROWSER-SUPPORT.md`).
- **Belum ada pengukuran pada perangkat kelas PRD** (8 GB, GPU terintegrasi).
- **Belum ada pilot manusia** (F6-10…F6-12). Protokolnya siap di `docs/PILOT-PROTOCOL.md`;
  apa yang dibutuhkan untuk memulainya (peserta, fasilitator, jendela dua minggu, cara
  menyajikan build) ada di `docs/DECISIONS-NEEDED.md` §3.
- **Belum ada keputusan D-04** (MP4 wajib atau tidak). Ekspor WebM/VP9 sudah lulus gate R2;
  MP4 tampil sebagai opsi **nonaktif** berlabel alasannya. Putuskan sebelum pilot supaya
  peserta tidak menemukan opsi mati tanpa jawaban — `docs/DECISIONS-NEEDED.md` §2 D-04.
