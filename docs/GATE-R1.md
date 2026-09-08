# Gate R1 — matriks bukti (F6-08)

Tanggal: **8 September 2026**. Basis: commit `549b7f0` + seluruh perubahan Fase 6
(F6-02…F6-07), **belum di-commit**.

Kriteria gate (plan.md F6-08 / PRD §14 poin 4):

1. Suite data/editor dan 100 siklus save/reload lulus.
2. PR-01…PR-07 memenuhi acceptance criteria PRD §8.
3. Tidak ada bug kehilangan data, lock bypass, atau migrasi kritis yang terbuka.

**Kesimpulan: gate R1 LULUS**, dengan dua catatan yang tidak menghalangi (§5) dan satu
batas kesimpulan yang wajib dibaca bersama hasil ini (§6).

---

## 1. Hasil eksekusi

| Perintah | Hasil | Catatan |
|---|---|---|
| `npm test` | **112/112 lulus** | naik dari 83 (Fase 3); tambahan 29 test: metrik lokal (15), flag/ekspor v1/kemampuan (14) |
| `npm run build` | **lulus** (Vite 7.3.6) | `dashboard` 15,9 kB, `main` ~99 kB, `three` 494,5 kB — dashboard tetap tidak menarik Three.js |
| `npm run preview` | **lulus** | build produksi diverifikasi manual: editor, dashboard, tanpa error halaman (`docs/ROLLOUT.md` §1) |
| `npm run test:browser` | **9/9 suite lulus** | daftar di §2 |
| 100 siklus edit/save/reload | **lulus** | `tests/repository-browser.mjs` bagian 8 — sudah ada sejak Fase 2, diverifikasi ulang dan dijalankan 3× berturut tanpa kegagalan |
| `npm run test:perf` | terukur | `docs/PERF-BASELINE.md` §6 |

### Suite browser

| Berkas | Cakupan |
|---|---|
| `tests/browser-smoke.mjs` | 3D, edit aktor, keyframe, kamera, playback, simpan/impor JSON, persistensi, ekspor video, 390 px |
| `tests/editor-regression.mjs` | undo/redo bercabang, lock, hide/POV, picking aman, drag tergabung, rotasi di final view, rekaman |
| `tests/walk-doors-delete.mjs` | langkah kaki deterministik, pintu, hapus semua objek + undo, peringatan menembus dinding |
| `tests/migration-browser.mjs` | migrasi v1→v2, kesetaraan pose baseline, impor invalid tidak menimpa, schema lebih baru tidak ditimpa |
| `tests/repository-browser.mjs` | autosave atomik, ≥10 revisi, session state, dua tab, isolasi proyek, kegagalan simpan, **100 siklus save/reload** |
| `tests/dashboard-browser.mjs` | 13 bagian perjalanan dashboard |
| `tests/capability-browser.mjs` | **baru** — context loss, fallback no-WebGL, metrik lokal, feature flag, ekspor v1 |
| `tests/a11y-browser.mjs` | **baru** — nama aksesibel, focus, urutan tab, padanan keyboard, kontras, 390 px, target sentuh |
| `tests/gate-r1-browser.mjs` | **baru** — perburuan lock bypass, kehilangan data, migrasi rusak, latensi simpan PR-03 |

---

## 2. Matriks PR-01 … PR-07

Status: **Terpenuhi** / **Terpenuhi sebagian** / **Belum**. Setiap baris menyebut berkas
bukti; klaim tanpa bukti tidak ditulis.

### PR-01 · Dashboard proyek — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Daftar menampilkan judul, thumbnail, jumlah scene, `updatedAt` | `src/dashboard.js` `card()`; `tests/dashboard-browser.mjs` bagian 3 (thumbnail tersimpan dan dipakai kartu; proyek tanpa thumbnail memakai placeholder) |
| Buat | bagian 2 (template kosong dan demo); `tests/dashboard.test.js` |
| Buka | bagian 2; `tests/perf-browser.mjs` mengukur 20 siklus buka dari kartu |
| Rename | bagian 10 — rename inline memperbarui metadata **dan** dokumen |
| Duplikasi | bagian 5 — judul bersufiks, isi setara, seluruh UUID berbeda, mengedit salinan tidak mengubah asal |
| Pencarian judul | bagian 4 |
| Urutan terbaru | bagian 4 — "terbaru diubah" dan "terakhir dibuka" |
| Empty / loading / error states | bagian 1 (empty), bagian 13 (error state + tombol coba lagi saat IndexedDB mati) |
| Tidak memuat semua scene ke memori | `docs/PERF-BASELINE.md` §6: **0 transaksi store `documents`** saat 102 kartu tampil |

### PR-02 · Isolasi proyek — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Setiap proyek UUID berbeda | `tests/dashboard.test.js`; `tests/repository-browser.mjs` bagian 5 |
| Membuat/mengedit B tidak mengubah A | `tests/dashboard-browser.mjs` bagian 2 dan 5 |
| Uji otomatis dua proyek berjudul **sama** | `tests/dashboard-browser.mjs` bagian 6; `tests/repository-browser.mjs` bagian 5 (judul dibuat persis sama, lalu isolasi diuji) |
| Duplicate menyalin ID referensi secara konsisten | `tests/dashboard-browser.mjs` bagian 5 — target kamera dan `objectId` track tetap konsisten setelah seluruh ID dipetakan ulang |
| Isolasi **antar-scene** dalam satu proyek | `tests/gate-r1-browser.mjs` bagian 2 — mengedit scene 1 tidak mengubah satu byte pun scene 2, termasuk flag lock, dan dokumen tersimpan setuju dengan layar |

### PR-03 · Autosave — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Simpan atomik **≤1 detik** setelah gestur selesai | **terukur**: `tests/gate-r1-browser.mjs` bagian 7 — p50 199 ms, p95 **261 ms**, maks 261 ms (n=10), dari `keyup` sampai status `saved` |
| Atomik | `src/repository.js` `transaction()` — metadata + dokumen + revisi dalam satu transaksi IndexedDB; `tests/repository-browser.mjs` bagian 1 |
| Status "tersimpan" hanya setelah transaksi berhasil | status di-resolve pada `tx.oncomplete`; `tests/repository-browser.mjs` bagian 1 |
| Kegagalan mempertahankan state di memori dan menawarkan cadangan | `tests/repository-browser.mjs` bagian 7 (kegagalan buatan → status error → tombol unduh cadangan → pemulihan) |
| Tidak menampilkan "tersimpan" pada error kuota | `AutosaveController.run()` `catch` → `SAVE_STATUS.error`; `tests/repository.test.js` |

### PR-04 · Recovery & trash — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Snapshot recovery minimal 10 revisi/proyek | `MIN_REVISIONS = 10`, `REVISION_LIMIT = 20`; `tests/repository-browser.mjs` bagian 2 |
| Saat buka, pilih pulihkan / buka terakhir | panel "Riwayat versi" + "Buka versi tersimpan terakhir"; pemulihan menjadi **satu langkah undo** (bagian 2) |
| Delete proyek masuk trash 30 hari, restore menjaga isi | `TRASH_RETENTION_DAYS = 30`; `tests/dashboard-browser.mjs` bagian 9; `tests/dashboard.test.js` |
| Hapus permanen memakai konfirmasi eksplisit | bagian 9 — konfirmasi dua langkah di dalam halaman, dapat dibatalkan |
| Perubahan terakhir sebelum tab ditutup dipulihkan | `tests/gate-r1-browser.mjs` bagian 4 — 30 gestur keyboard lalu reload **tanpa menunggu** status tersimpan, seluruh keyframe kembali |

### PR-05 · Banyak scene — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Tambah, nama, duplikasi, urutkan, hapus scene | `src/document.js`; 4 unit test scene di `tests/document.test.js` + `tests/dashboard.test.js`; `tests/dashboard-browser.mjs` bagian 2 |
| Tiap scene menyimpan actors/set/timeline sendiri | `tests/dashboard-browser.mjs` bagian 2; `tests/gate-r1-browser.mjs` bagian 2 |
| Scene aktif dipulihkan setelah reload | `tests/dashboard-browser.mjs` bagian 2 (reload dua kali, termasuk setelah pindah scene) |
| Menghapus scene terakhir ditolak, bukan diganti diam-diam | `removeScene` + validator `scenes.length ≥ 1`; tombol hapus dinonaktifkan saat hanya ada satu scene |

### PR-06 · Migrasi & paket — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| JSON v1 → satu proyek / satu scene / satu shot tanpa perubahan pose | `tests/migration-browser.mjs` (kesetaraan pose terhadap fixture baseline); `tests/migrate.test.js` |
| Input invalid tidak menimpa data | `tests/migration-browser.mjs`; `tests/gate-r1-browser.mjs` bagian 6 — JSON v1 terpotong tidak mengubah satu byte pun dokumen aktif dan tetap memberi pesan |
| Paket berisi manifest, scene dan aset beserta checksum | `src/package.js` (SHA-256 per bagian); 4 unit test paket |
| Roundtrip ekuivalen | `tests/dashboard-browser.mjs` bagian 7 — ekspor → impor setara; paket dengan checksum diubah **ditolak** tanpa mengubah proyek mana pun |
| Impor v1 sebagai proyek baru | bagian 8 |
| Schema lebih baru tidak ditimpa | `SchemaTooNewError`; `tests/migration-browser.mjs` |
| Jalan balik ke v1 untuk rollback | `exportAsV1` — `tests/rollout.test.js` (v1→v2→v1 `deepEqual`), `tests/capability-browser.mjs` bagian 5 (unduh dari editor lalu impor kembali) |

### PR-07 · Banyak tab — **Terpenuhi**

| Acceptance criteria | Bukti |
|---|---|
| Satu tab menjadi writer per proyek | `src/tab-lock.js` (Web Locks + heartbeat `localStorage`); `tests/repository-browser.mjs` bagian 4 |
| Tab lain baca-saja atau membuka salinan | bagian 4 dan 5 — banner dengan dua tombol, "Buka salinan" membuat proyek baru |
| Tidak terjadi silent last-write-wins | bagian 4 — tab baca-saja tidak menulis; `tests/gate-r1-browser.mjs` bagian 3 membuktikan penolakan ada di **lapisan command**, bukan hanya di UI (tombol diaktifkan paksa lewat DOM, penulisan tetap ditolak) |
| Pesan konflik menjelaskan pilihan pengguna | banner `role="alert"` dengan "Buka salinan" / "Ambil alih"; `docs/A11Y-AUDIT.md` §6 |
| Kunci dilepas saat kembali ke dashboard | `tests/dashboard-browser.mjs` bagian 12 |

---

## 3. NFR PRD §9 yang termasuk gate R1

| Area | Target | Hasil | Status |
|---|---|---|---|
| Interaksi | p95 input→viewport <100 ms | drag **11,6 ms**, keyboard 21,1 ms, scrub 18,4 ms, pindah scene 44,4 ms | Terpenuhi *pada perangkat referensi* (§6) |
| Playback | ≥30 fps selama 60 detik | frame-time p95 **9,3 ms**, maks 16,6 ms, 1 dropped frame dari ±7 200 | Terpenuhi *pada perangkat referensi* |
| Buka proyek | p95 ≤2 detik, metadata ≤5 MB | **317 ms** untuk dokumen 5 023 714 B / 165 scene; 333 ms untuk fixture beban | Terpenuhi *pada perangkat referensi* |
| Buka proyek | dashboard 100 proyek tidak memuat semua scene | **0** transaksi store `documents` | Terpenuhi |
| Ketahanan | 100 siklus edit/save/reload tanpa beda data | lulus, 3× berturut | Terpenuhi |
| Memori | 20 siklus tanpa pertumbuhan GPU | geometries 194→194, textures 1→1, programs 7→7 | Terpenuhi |
| Aksesibilitas | WCAG 2.2 AA pada UI biasa | kontras, nama, fokus, keyboard, status non-warna lulus otomatis; belum diuji pembaca layar | **Terpenuhi sebagian** — `docs/A11Y-AUDIT.md` T-01…T-06 |
| Responsif | tanpa overflow 390 px, target sentuh ≥44 px | tanpa overflow; target sentuh inti ≥44 px kecuali penanda keyframe 10 px | **Terpenuhi sebagian** — T-01 |
| Kompatibilitas | Chrome/Edge diuji; Safari/Firefox capability detection | Chrome diuji penuh; **Edge belum diuji**; capability detection + fallback ada dan diuji | **Terpenuhi sebagian** — `docs/BROWSER-SUPPORT.md` |
| Keamanan | validasi schema & referensi ID, batas file, escape teks | `validateDocument`, batas paket, `esc()` di seluruh render | Terpenuhi |
| Privasi | lokal tanpa akun, telemetry opt-in tanpa isi scene | metrik lokal berskema tertutup; **tidak ada pengiriman apa pun** | Terpenuhi |

---

## 4. Bug yang ditemukan dan diperbaiki pada gate ini

### B-01 · `ReadOnlyError` tidak tertangkap pada tab baca-saja (kelas: lock bypass — **tidak** bypass, tetapi error terbuka)

**Ditemukan oleh** `tests/gate-r1-browser.mjs` bagian 3 (5 uncaught error per gestur).

Menekan panah atau memulai drag di tab baca-saja memanggil `session.begin()`, yang
melempar `ReadOnlyError`. Error itu keluar sebagai **uncaught error** dari handler
`keydown`/`pointerdown`.

Data tidak pernah tertulis (penolakan memang bekerja), jadi ini bukan lock bypass. Tetapi
handler berhenti di tengah jalan, `keysDown` tidak pernah dibersihkan, dan console
peserta pilot akan penuh error — cukup untuk mengaburkan bug lain saat pilot.

**Perbaikan** (`src/main.js`): kedua handler memeriksa `session.readOnly` lebih dahulu dan
menolak dengan pesan yang sama seperti jalur lain, bukan dengan exception.

### B-02 · Atribut `hidden` tidak berfungsi pada tombol mana pun (kelas: UI/kebenaran state)

**Ditemukan oleh** `tests/a11y-browser.mjs` saat menguji feature flag dashboard.

`button{display:inline-flex}` mengalahkan `[hidden]{display:none}` milik browser.
Akibat nyata: `#download-backup` — tombol darurat yang seharusnya hanya muncul saat
penyimpanan gagal — **selalu terlihat**, sehingga sinyal "ada yang salah" kehilangan arti.

**Perbaikan** (`src/style.css`): `button[hidden]{display:none!important}`.

### B-03 · Kebocoran geometri jalur gerakan (kelas: memori/GPU)

**Ditemukan oleh** `tests/perf-browser.mjs` — `renderer.info.memory.geometries` = 532
pada scene berisi 30 objek.

`buildPaths()` membuat `SphereGeometry` + material baru untuk setiap titik keyframe
(±480 objek), dan dipanggil pada **setiap** `pointermove`. Bukan kebocoran yang tumbuh
tanpa batas (`clearGroup` men-dispose-nya), tetapi churn alokasi GPU yang besar dan
sia-sia pada jalur terpanas aplikasi.

**Perbaikan** (`src/scene-renderer.js`): geometri dan material bersama, `dispose()` penuh
pada renderer. Geometries 532 → 194, program shader 11 → 7.

### B-04 · Uji `repository-browser` bagian 5 gagal secara acak (kelas: keandalan gate)

`waitForFunction(() => window.blockingRoom.getProjectId() !== id)` dapat dievaluasi pada
dokumen baru sebelum `src/app.js` selesai memasang kait uji, karena "Buka salinan" memuat
ulang halaman. Terjadi 1 dari 4 kali pada jalan suite penuh.

**Perbaikan** (`tests/repository-browser.mjs`): optional chaining pada predikat.
Asersi isolasinya sendiri tidak diubah. Gate yang flaky tidak dapat dipakai sebagai gate.

---

## 5. Catatan yang TIDAK menghalangi gate

| # | Catatan | Mengapa tidak menghalangi |
|---|---|---|
| C-01 | Penanda keyframe timeline 10 × 10 px, di bawah target sentuh 44 px | Setiap penanda adalah tombol dengan nama aksesibel, dapat dicapai Tab; menambah/menghapus keyframe tersedia sebagai tombol besar di inspector. Perbaikan sebenarnya adalah TL-01 (Fase 4). `docs/A11Y-AUDIT.md` T-01 |
| C-02 | Edge belum diuji meskipun PRD §9 menyebutnya | Edge adalah Chromium dengan kemampuan identik dengan Chrome yang diuji penuh; seluruh keputusan fitur lewat capability detection, bukan user agent. Tetap **wajib diuji sebelum pilot** — `docs/BROWSER-SUPPORT.md` §5 |
| C-03 | Perubahan drag yang belum selesai hilang bila tab mati **di tengah** drag | Konsekuensi yang disengaja dari optimasi F6-02 §8.1 dan sama dengan perilaku mode rekam sejak R0. PR-03 berbicara tentang "setelah gestur selesai"; gestur yang belum selesai bukan cakupannya |
| C-04 | Rename dari dashboard tidak memeriksa kunci writer | Diwarisi dari Fase 3. Akibat terburuk: judul lama ditulis kembali oleh tab yang memegang kunci — tidak ada kehilangan isi scene, dan kartu sudah menandai "sedang dibuka di tab lain" |
| C-05 | Belum ada versi build yang terlihat di UI | Menyulitkan triase saat pilot, bukan cacat produk. `docs/ROLLOUT.md` §8 |

---

## 6. Batas kesimpulan gate ini

Yang **tidak** dibuktikan oleh gate ini, dan karena itu tidak boleh diklaim:

1. **Performa pada perangkat kelas PRD.** Seluruh angka §3 berasal dari Apple M5 / 16 GiB
   dengan layar 120 Hz. PRD §9 menetapkan target untuk "laptop 8 GB RAM, GPU terintegrasi".
   Margin memang besar (6–8×), tetapi margin bukan pengukuran.
   `docs/PERF-BASELINE.md` §1 dan §7.
2. **Aksesibilitas dengan pembaca layar dan pengguna sungguhan.** Yang dibuktikan adalah
   nama aksesibel **ada**, fokus terlihat, kontras cukup, dan seluruh aksi punya padanan
   keyboard. Itu bukan kepatuhan WCAG 2.2 AA. `docs/A11Y-AUDIT.md` §1.
3. **Browser selain Chrome.** `docs/BROWSER-SUPPORT.md` §2 memisahkan "Diuji" dari
   "Diperkirakan" secara eksplisit; hanya satu baris berstatus "Diuji".
4. **Perilaku dengan pengguna nyata.** Seluruh target PRD §11 (keberhasilan tugas, waktu
   ke video pertama, kembali mengedit) memerlukan F6-10…F6-12. Protokolnya siap di
   `docs/PILOT-PROTOCOL.md`, **belum dijalankan**.
5. **Kuota penyimpanan penuh pada perangkat nyata.** Jalur `StorageQuotaError` diuji lewat
   kegagalan buatan, bukan lewat kuota yang benar-benar habis.

---

## 7. Keputusan

**Gate R1 dinyatakan LULUS** untuk keperluan F3-11 (dashboard siap dilanjutkan ke pilot):

- kriteria 1 (suite + 100 siklus) — terpenuhi penuh;
- kriteria 2 (PR-01…PR-07) — ketujuhnya **Terpenuhi**, dengan bukti per acceptance
  criterion di §2;
- kriteria 3 (tidak ada bug kehilangan data / lock bypass / migrasi kritis terbuka) —
  terpenuhi: empat bug ditemukan dan **seluruhnya diperbaiki** (§4); tidak ada bug dari
  ketiga kelas itu yang masih terbuka.

Yang tetap **belum** dan tidak boleh dicentang: F6-09 (gate R2), F6-10, F6-11, F6-12.
C-02 (uji Edge) dan pengukuran perangkat kelas PRD harus diselesaikan **sebelum** pilot
manusia dimulai, meskipun keduanya tidak menghalangi gate ini.
