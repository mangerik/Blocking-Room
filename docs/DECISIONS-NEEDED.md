# Keputusan yang dibutuhkan dari pemilik produk

Tanggal: **8 September 2026**. Ditulis setelah gate R2 lulus (`docs/GATE-R2.md`).

Dokumen ini adalah **satu-satunya daftar** hal yang menghentikan pekerjaan berikutnya.
Semua yang tidak ada di sini sudah dapat dikerjakan tanpa keputusan tambahan.

Aturan yang dipakai sepanjang proyek ini dan tetap berlaku: *keputusan yang belum ada
tidak menghentikan semua pekerjaan*. Task independen dilanjutkan dengan **asumsi kerja
yang ditulis**, dan hanya implementasi yang benar-benar bergantung pada keputusan itu yang
ditunda. Karena itu tabel di bawah membedakan tiga status:

- **Diputuskan** — sudah menjadi keputusan tercatat dengan bukti implementasinya.
- **Asumsi kerja** — belum diputuskan pemilik produk, tetapi sudah dijalankan sebagai
  asumsi tertulis; membalikkannya berbiaya, dan biaya itu disebutkan.
- **Terbuka** — menghentikan task tertentu. Task yang tertahan disebutkan namanya.

---

## 1. Ringkasan status D-01 … D-07

| ID | Pertanyaan | Status | Yang menahan / biaya membalikkan |
|---|---|---|---|
| D-01 | Lokal dahulu atau cloud wajib? | **Asumsi kerja: lokal dahulu** | Menahan seluruh **Fase 7** |
| D-02 | Makna proyek dan ownership shot | **Diputuskan** | — |
| D-03 | Prioritas R2 | **Diputuskan** | — |
| D-04 | MP4 wajib? resolusi dan fps target? | **Terbuka** | Menahan MP4; UI sudah menampilkannya nonaktif |
| D-05 | Hide global atau editor/render terpisah? | **Diputuskan: global** | Membaliknya = migrasi flag `visible` |
| D-06 | Rig, putaran >360°, batas beban nyata | **Sebagian diputuskan** | Menahan **F8-02**; batas beban nyata masih terbuka |
| D-07 | Provider, region, budget, akses tim | **Terbuka** | Menahan **F7-01…F7-07** |

---

## 2. Rincian per keputusan

### D-01 · Lokal dahulu atau akses lintas perangkat wajib sejak awal?

**Status: asumsi kerja "lokal dahulu", sudah dijalankan penuh.**

Bukti bahwa asumsi ini benar-benar diimplementasikan, bukan sekadar ditulis:

- Penyimpanan sepenuhnya di perangkat: `src/repository.js` (IndexedDB, 5 object store),
  autosave transaksional `src/autosave.js`, snapshot recovery ≥10 revisi, tempat sampah
  30 hari. Tanpa akun, tanpa jaringan.
- **Tidak ada satu pun kode jaringan** di jalur data. `tests/metrics.test.js` memuat uji
  struktural yang menolak `fetch`/`sendBeacon`/`WebSocket` di `src/metrics.js`;
  `tests/capability-browser.mjs` bagian 3 memverifikasi tidak ada request keluar setelah
  opt-in metrik.
- Jalan keluar data selalu tersedia: ekspor paket `.blockingroom.json` berchecksum,
  ekspor JSON v2 dan v1 (`docs/ROLLOUT.md` §4).

**Yang tertahan:** seluruh Fase 7. **Yang dibutuhkan untuk membuka:** jawaban atas
"apakah akses lintas perangkat sudah menjadi kebutuhan yang terbukti dari pilot?" — data
untuk menjawabnya justru dihasilkan F6-10/F6-11.

**Rekomendasi:** jangan putuskan sebelum pilot. Pilot dirancang untuk menghasilkan
sinyalnya (Tugas 2 "buka kembali dan lanjutkan", metrik "kembali mengedit dalam 7 hari").

---

### D-02 · Apakah satu proyek mewakili satu film atau satu sequence?

**Status: DIPUTUSKAN — Proyek (film) → banyak Scene → banyak Shot.**

Diambil pada Fase 1 sebagai keputusan struktur data dan sudah menjadi kontrak tertulis:
`docs/DATA-MODEL.md` §1–§4, `src/schema.js` (`schemaVersion: 3`). Identitas aktor dan set
milik **scene**; durasi, fps, aspect ratio, kamera dan track milik **shot**
(`src/document.js#syncShotTracks`, `src/shots.js`).

Bukti bahwa pemisahan itu nyata: `tests/gate-r2-browser.mjs` §3 membuktikan mengedit
shot B tidak mengubah satu keyframe pun milik shot A — juga setelah 6 undo, 6 redo, reload
penuh dan penghapusan shot B.

Tidak ada yang tertahan oleh keputusan ini.

---

### D-03 · Prioritas R2: shot list/timeline atau import GLB?

**Status: DIPUTUSKAN — shot workflow dan export lebih dahulu.**

Sudah selesai dan lulus gate: SH-01, TL-01, TL-02, SC-01, CA-01, EX-01, EX-02, EX-03
(`docs/GATE-R2.md` §3). Import GLB tetap **F8-01**, belum dikerjakan.

Tidak ada yang tertahan.

---

### D-04 · Apakah MP4 wajib? Target resolusi dan fps? — **TERBUKA**

Ini satu-satunya keputusan terbuka yang **berdampak langsung pada pengalaman pilot**:
peserta akan melihat opsi MP4 yang nonaktif.

**Yang sudah dikerjakan sebagai asumsi kerja** (usulan spike F5-01,
`docs/SPIKE-ENCODER.md` §11):

| Aspek | Asumsi kerja yang berjalan sekarang | Bukti |
|---|---|---|
| Format default | **WebM / VP9** lewat WebCodecs + muxer WebM buatan sendiri | `ffprobe`: `vp9 1280x720 nb_read_frames=300 duration=10.000000`, 3 jalan |
| fps | 24 / 25 / 30, **hanya integer** | `TimestampScale` milidetik tidak cocok untuk 23,976/29,97 |
| Resolusi | default 1280×720, opsi 1920×1080, dimensi dibulatkan kelipatan 2 | `timeline-engine.js#aspectSize`, `tests/export.test.js` |
| MP4 | **tidak diimplementasikan**; tampil sebagai opsi nonaktif berlabel "belum tersedia — butuh muxer" | `tests/export-browser.mjs` bagian 1 |
| Fallback | MediaRecorder real-time, berlabel "tidak frame-akurat", nama berkas berakhiran `_realtime` | `tests/export-browser.mjs` bagian 7 |

**Keputusan yang diminta, tiga bagian terpisah:**

1. **Apakah MP4 wajib?** Satu-satunya konsekuensi teknis dari "ya" adalah menambah
   dependency `mp4-muxer` (MIT, ±156 KB unpacked, tanpa dependency runtime nyata) — proyek
   ini sampai sekarang **nol dependency baru**, jadi ini keputusan kebijakan, bukan
   keputusan teknis. Menulis ISO BMFF sendiri **tidak** dianjurkan (`docs/SPIKE-ENCODER.md`).
   Perkiraan bila disetujui: 1–2 hari termasuk uji `ffprobe` dan pembaruan matriks codec.
2. **Resolusi target.** 720p dan 1080p sudah ada. Bila 4K diperlukan, biayanya memori
   (C-09 `docs/GATE-R2.md`) dan perlu jalur streaming ke disk lebih dahulu.
3. **fps target.** Bila 23,976/29,97 (fps drop-frame) diperlukan untuk pipeline hilir,
   muxer harus pindah dari `TimestampScale` milidetik ke mikrodetik — perubahan format,
   bukan penyesuaian angka. Perkiraan: 1 hari + uji ulang seluruh berkas ekspor.

**Yang tertahan:** hanya MP4. Ekspor WebM sudah lulus gate.
**Batas waktu yang disarankan:** sebelum F6-10, supaya peserta pilot tidak menemukan opsi
nonaktif tanpa jawaban.

---

### D-05 · Hide global atau editor/render terpisah?

**Status: DIPUTUSKAN pada Fase 4 — tetap global.**

`visible: false` berarti hilang dari editor **dan** dari video, sesuai PRD ED-03. Alasan
dan syarat migrasi bila kelak dipisahkan tercatat di `docs/DATA-MODEL.md` §8.

Bukti perilakunya: `tests/export-browser.mjs` bagian 3 dan `tests/gate-r2-browser.mjs` §1
— aktor tersembunyi memang tidak ikut terekam, dibuktikan dengan dua referensi render yang
berbeda 6,27 pada skala 0–255 (kalau aktor tidak digambar, uji ini tidak akan bermakna).

**Biaya membalikkan:** migrasi flag `visible` lama menjadi `hiddenInEditor` +
`includeInRender` (hidden lama → keduanya), plus kontrol UI eksplisit. F4-09 sengaja
**tidak dicentang** di `plan.md` karena kontrol itu memang tidak dibuat.

---

### D-06 · Rig, putaran >360°, dan batas beban nyata

**Status: sebagian diputuskan.**

| Bagian | Status |
|---|---|
| Rig karakter | **Asumsi kerja: manekin + langkah prosedural + yaw.** Rig eksternal adalah F8-02, belum dikerjakan |
| Putaran >360° | **Diputuskan: tidak didukung.** Rotasi selalu jalur terpendek; dua keyframe 0°/360° **bukan** padanan putaran penuh. Prasyaratnya (track rotasi terpisah dari posisi) sudah ada sejak Fase 4b, tetapi mendukungnya menuntut track yaw tak dinormalisasi yang **mengubah arti setiap keyframe rotasi yang sudah tersimpan**. `docs/DATA-MODEL.md` §2 Track |
| **Batas beban nyata** | **TERBUKA** — lihat di bawah |

**Yang masih dibutuhkan:** jawaban atas PRD §16 pertanyaan 7 — *berapa banyak karakter,
berapa panjang shot, dan berapa besar aset pada proyek nyata yang paling sering dibuat?*

Angka yang dipakai sekarang adalah **asumsi** yang tertanam di `src/schema.js` `LIMITS`:
50 aktor, 80 objek set per scene, 2 400 keyframe per track, durasi shot 1–120 detik,
dokumen 5 000 000 B. Fixture beban menguji 20 aktor / 10 ruang / 500 keyframe / 60 detik
— jauh di bawah batas itu. Bila proyek nyata ternyata jauh lebih besar, yang pertama
menabrak adalah memori buffer ekspor (C-09) dan jumlah lane timeline, bukan validator.

Pilot adalah kesempatan mengumpulkan angka ini: `docs/PILOT-PROTOCOL.md` §6 sudah meminta
fasilitator mencatat perangkat peserta; tambahkan pertanyaan ukuran proyek nyata mereka.

---

### D-07 · Provider, region, budget dan akses tim — **TERBUKA**

Menahan seluruh Fase 7. Rinciannya di §4.

---

## 3. Menjalankan pilot (F6-10 dan F6-11)

Protokolnya **sudah lengkap** di [`docs/PILOT-PROTOCOL.md`](PILOT-PROTOCOL.md): kriteria
peserta, naskah pengantar yang dibaca sama untuk semua orang, tiga tugas, lembar catatan,
cara menghitung kelima metrik PRD §11 dari metrik lokal, kriteria keputusan yang
ditetapkan **sebelum** pilot, dan aturan etika/data peserta. Tidak perlu merancang ulang
apa pun.

Yang belum ada bukan dokumen, melainkan hal-hal berikut:

### 3.1 Yang wajib diselesaikan lebih dahulu (teknis, sudah jelas caranya)

| # | Pekerjaan | Perkiraan | Rujukan |
|---|---|---|---|
| 1 | **Uji Edge.** PRD §9 menuntutnya; sekarang berstatus "Diperkirakan", bukan "Diuji" | 1–2 jam manual | `docs/BROWSER-SUPPORT.md` §5 |
| 2 | **Ukur `npm run test:perf` pada perangkat kelas PRD** (8 GB RAM, GPU terintegrasi). Angka sekarang dari Apple M5 / 16 GiB — batas atas optimistis | 1 jam pada perangkat itu | `PERF_LABEL=<perangkat> npm run test:perf`, lalu tambahkan baris di `docs/PERF-BASELINE.md` §6 |
| 3 | **Keputusan D-04** supaya opsi MP4 nonaktif tidak menjadi pertanyaan peserta | keputusan, bukan pekerjaan | §2 D-04 |

### 3.2 Yang hanya dapat disediakan pemilik produk

| # | Kebutuhan | Mengapa tidak dapat disiapkan tim teknis |
|---|---|---|
| 1 | **5–8 pembuat film** yang belum pernah memakai produk ini dan tidak ikut membangunnya | Rekrutmen. Di bawah 5 peserta, satu kegagalan menggeser angka >15% dan kesimpulannya tidak berarti |
| 2 | **Fasilitator** yang menjalankan sesi dan tidak membantu peserta kecuali benar-benar buntu | Netralitas; yang diuji alatnya, bukan pesertanya |
| 3 | **Jendela waktu 2 minggu** untuk F6-11 setelah sesi tugas | Metrik "kembali mengedit dalam 7 hari" tidak dapat dipercepat |
| 4 | **Cara menyajikan build** kepada peserta (URL yang dapat diakses, atau paket lokal) | Bergantung keputusan hosting yang belum ada — lihat §4.1 |
| 5 | **Persetujuan tertulis** perekaman layar dan kutipan | `docs/PILOT-PROTOCOL.md` §8 |
| 6 | **Setelan feature flag dashboard** yang sama untuk semua peserta (`on` atau `off`) dan dicatat | Mencampur keduanya membuat angka tidak dapat dibandingkan |

### 3.3 Yang harus disepakati sebelum sesi pertama, bukan sesudah

`docs/PILOT-PROTOCOL.md` §7 sudah menetapkan kriteria keputusan F6-12. Konfirmasikan
bahwa pemilik produk **menyetujui kriteria itu apa adanya** sebelum peserta pertama
datang — terutama baris pertama: *satu* kejadian kehilangan data tersimpan yang tidak
dapat dijelaskan **menghentikan rollout**, bukan menjadi bahan diskusi.

### 3.4 Kapan F6-12 dapat dicentang

Setelah F6-10 dan F6-11 punya hasil, dan keputusan "iterasi atau perluasan" ditulis
beserta alasannya. F6-12 juga memuat "tentukan dan jalankan deployment produksi" — itu
menunggu §4.1.

---

## 4. Prasyarat Fase 7 (F7-01) — opsi konkret, tanpa memilih vendor

F7-01 berbunyi: *"Putuskan auth, database metadata, object storage, model biaya dan
kebijakan akses. Dokumentasikan jalur pengguna lokal tanpa akun."*

Bagian **terakhir** sudah selesai: jalur pengguna lokal tanpa akun adalah produk yang ada
sekarang, dan sudah terdokumentasi (`README.md`, `docs/ROLLOUT.md` §4). Empat bagian
lainnya adalah keputusan pemilik produk. Di bawah ini opsi beserta trade-off-nya —
**tidak ada vendor yang dipilih di sini**, dan tidak ada satu pun yang sudah diimplementasikan.

**Prasyarat mutlak sebelum F7-01 dibuka:** hasil pilot (F6-10/F6-11). Membangun cloud
sebelum tahu apakah orang kembali mengedit karyanya berarti membayar biaya operasional
untuk kebutuhan yang belum terbukti — dan PRD §16 secara eksplisit menempatkan cloud
sesudah "async review terbukti dibutuhkan".

### 4.1 Hosting aplikasi (dibutuhkan bahkan untuk pilot, sebelum cloud apa pun)

Aplikasi ini **statis** (`npm run build` → `dist/`, tanpa server). Pilihannya:

| Opsi | Keuntungan | Biaya / risiko |
|---|---|---|
| **Berkas lokal / dev server di perangkat peserta** | Nol biaya, nol keputusan, privasi maksimal | Fasilitator harus memasang di setiap perangkat; menyulitkan F6-11 (pemantauan 2 minggu) |
| **Static hosting apa pun** (object storage + CDN, atau layanan halaman statis) | Satu URL untuk semua peserta; `npm run preview` sudah membuktikan build produksi berjalan tanpa server | Perlu domain, TLS, dan penanggung jawab. Biaya kecil tetapi bukan nol |
| **Intranet/organisasi** | Kendali penuh | Perlu akses jaringan peserta eksternal |

**Keputusan yang diminta:** cara menyajikan build untuk pilot. Ini **tidak** memerlukan
cloud, database, atau akun — jangan menggabungkannya dengan keputusan §4.2–§4.5.

### 4.2 Auth

| Opsi | Keuntungan | Trade-off |
|---|---|---|
| **Tanpa auth (status sekarang)** | Tidak ada data pribadi yang disimpan; tidak ada permukaan serangan akun | Tidak ada lintas perangkat, tidak ada berbagi |
| **Magic link e-mail** | Tanpa kata sandi untuk dijaga; identitas cukup untuk owner/editor/viewer | Butuh pengirim e-mail dan penanganan deliverability; e-mail menjadi data pribadi |
| **OAuth pihak ketiga** (identitas yang sudah dimiliki pengguna) | Tidak menyimpan kredensial sama sekali; pendaftaran cepat | Ketergantungan pada penyedia identitas; sebagian pengguna menolaknya |
| **E-mail + kata sandi** | Tidak bergantung pihak lain | Kewajiban keamanan penuh: hashing, reset, rate limit, kebocoran |

**Yang perlu diputuskan bersamaan:** apakah pengguna lokal tanpa akun tetap menjadi jalur
kelas satu selamanya. PRD asumsi A2 mengatakan ya; kalau itu bertahan, setiap fitur cloud
harus opsional dan produk harus tetap berfungsi penuh offline.

### 4.3 Database metadata

Yang perlu disimpan: metadata proyek (judul, `updatedAt`, jumlah scene, thumbnail ref),
keanggotaan/izin, dan pointer revisi. **Bukan** isi scene, yang jauh lebih besar.

| Opsi | Keuntungan | Trade-off |
|---|---|---|
| **Relasional terkelola** | Izin per baris mudah diaudit; transaksi kuat; ekspor mudah | Perlu migrasi schema server dan penanggung jawab operasional |
| **Dokumen terkelola** | Bentuknya dekat dengan `Project`/`Scene` yang sudah ada | Query izin lintas koleksi lebih mudah salah |
| **Backend-as-a-service** | Auth + DB + storage sekaligus, tercepat sampai jalan | Aturan akses hidup di konfigurasi vendor, bukan di kode yang dapat di-review; kunci vendor paling kuat |

**Syarat yang tidak boleh ditawar apa pun pilihannya** (F7-02, F7-07): pemeriksaan izin
terjadi **di server per resource**, bukan di klien. Uji kebocoran antaruser adalah kriteria
keluar Fase 7, bukan pekerjaan tambahan.

### 4.4 Object storage (dokumen scene, aset, hasil render)

| Opsi | Keuntungan | Trade-off |
|---|---|---|
| **Object storage + URL bertanda tangan berumur pendek** | Standar industri; biaya per GB rendah; aset tidak melewati server aplikasi | Kebocoran URL = kebocoran data selama URL hidup; perlu kebijakan masa berlaku |
| **Blob di dalam database** | Satu sistem izin, satu cadangan | Mahal dan lambat untuk berkas besar; batas ukuran baris |
| **Tetap di perangkat, cloud hanya untuk metadata** | Biaya minimum; privasi karya terjaga | "Akses lintas perangkat" tidak terpenuhi — praktis membatalkan alasan Fase 7 |

**Angka yang dibutuhkan sebelum memilih:** ukuran proyek nyata (D-06 bagian "batas beban
nyata") dan apakah hasil render ikut disimpan. Dokumen scene sekarang berkisar puluhan KB
sampai beberapa MB; satu video ekspor 10 detik 720p ≈ ratusan KB sampai beberapa MB.

### 4.5 Model biaya dan kebijakan akses

Yang harus dijawab sebagai **angka**, bukan sebagai prinsip:

1. **Berapa penyimpanan per pengguna yang ditanggung**, dan apa yang terjadi saat habis?
2. **Apakah render di server ditanggung?** F7-06 sengaja memberi syarat "hanya bila model
   render/biaya disepakati". Ekspor sekarang berjalan **di perangkat pengguna** dengan
   biaya nol — memindahkannya ke server mengubah struktur biaya secara mendasar.
3. **Region data.** Menentukan penyedia yang mungkin dan kewajiban hukum.
4. **Siapa boleh melihat proyek** (PRD §16 pertanyaan 8): pribadi saja, undangan
   per-proyek, atau tautan review yang dapat dicabut. CL-02 mengasumsikan yang ketiga —
   snapshot immutable, read-only, dengan expiry/revoke.
5. **Retensi dan penghapusan.** Tempat sampah lokal 30 hari sudah ada; kebijakan cloud
   harus dinyatakan sebelum data pertama masuk, bukan sesudah.

### 4.6 Urutan yang disarankan bila Fase 7 dibuka

Urutan ini mengikuti dependensi teknis, bukan preferensi:

1. F7-01 keputusan (§4.2–§4.5) → 2. F7-02 izin per resource → 3. F7-03 sinkronisasi
revision-aware (konflik menjadi salinan/revisi yang dapat ditinjau, **tidak pernah**
overwrite diam-diam) → 4. F7-04 revision history cloud + restore → 5. F7-05 review link →
6. F7-06 antrean render tim (hanya bila §4.5 poin 2 disetujui) → 7. F7-07 uji isolasi.

Yang sudah tersedia dan **tidak** perlu dibangun ulang: `revisionToken` monoton
(`src/repository.js`), `Revision` per proyek, kunci writer per proyek (`src/tab-lock.js`),
dan format paket berchecksum (`src/package.js`). Konsep "konflik menjadi salinan, bukan
overwrite" sudah punya padanan lokalnya pada banner tab baca-saja ("Buka salinan" /
"Ambil alih"), jadi F7-03 dapat meniru pola yang sudah diuji.

---

## 5. Cara memulai Fase 8, per item

Semua task Fase 8 berstatus **P2 dan belum menjadi komitmen rilis**. Aturannya (dari
`plan.md`): dahului implementasi dengan **validasi kebutuhan** dan **spike terukur** —
bukan langsung membangun. Tabel di bawah menyebut untuk setiap item: sinyal apa yang
membuktikan ia layak dikerjakan, spike apa yang mendahuluinya, dan apa yang sudah ada.

| Task | Sinyal yang harus muncul lebih dahulu | Langkah pertama (spike, bukan implementasi) | Yang sudah tersedia |
|---|---|---|---|
| **F8-01** Import GLB | Peserta pilot menyebut "manekin tidak cukup untuk menjelaskan skala/set" pada Tugas 1 | Ukur: batas ukuran berkas, jumlah poligon dan tekstur yang masih menjaga p95 drag <100 ms pada perangkat kelas PRD; kebijakan lisensi aset | Store `assets` + `putAsset/getAsset/listAssets` sudah ada dan dipakai thumbnail; `LIMITS` siap diperluas |
| **F8-02** Rig idle/walk/run/crouch, look-at, foot IK, rotasi penuh | Bukti bahwa langkah prosedural yang ada **salah dibaca** oleh peserta, bukan sekadar "kurang bagus" | Bandingkan pemahaman blocking antara manekin+langkah prosedural dan rig — bila tidak ada bedanya, jangan kerjakan. Rotasi >360° menuntut keputusan D-06 lebih dahulu | Track rotasi sudah terpisah dari posisi (prasyarat), interpolasi per track sudah ada |
| **F8-03** Denah gambar sebagai underlay terukur | Peserta membawa denah lokasi nyata ke sesi | Buktikan satu set nyata dapat direkonstruksi dari satu denah: butuh import image, satuan dan kalibrasi skala | Snap grid 0,5 m sudah ada dan dapat dimatikan |
| **F8-04** Collision/clearance lanjutan, auto-routing, daun pintu beranimasi | Peringatan tembus dinding yang ada terbukti **tidak cukup** (peserta melewatkannya) | Uji pintu sempit, tinggi aktor, dinding berimpit. **Pertahankan opsi blocking bebas** — jangan mengubah peringatan menjadi collision fisik tanpa opsi | `spatial.js#wallCrossings` sudah memperhitungkan pintu **dan** dinding modular |
| **F8-05** Audio/dialog cue dan anotasi | Peserta menyebut kesulitan menyelaraskan timing tindakan | Satu shot dialog dari ujung ke ujung: aset audio, timecode, dan bagaimana audio berperilaku saat scrub mundur | Timeline sudah berbasis frame dengan timecode `MM:SS:FF` |
| **F8-06** Continuity, garis 180°, eyeline | Peserta membuat ≥3 shot percakapan dalam satu scene | Uji tiga shot percakapan: apakah alat garis 180° mengubah keputusan mereka | Multi-shot per scene dan target aktor sudah ada |
| **F8-07** AI-assisted blocking | Peserta menyebut "memulai dari nol" sebagai hambatan terbesar, bukan "mengedit" | Sebelum model apa pun: buktikan setiap draft dapat **ditinjau, diubah dan di-undo**, dan tidak pernah menimpa scene secara otomatis | Command/history sudah terpusat (`src/commands.js`); daftar `command_type` tertutup di `src/metrics.js` |
| **F8-08** Paket referensi untuk pipeline generasi video | Ada pipeline hilir nyata yang menerimanya | Definisikan manifest (kamera per frame, timecode, pose) lalu evaluasi kecocokan hasil pipeline dengan referensi | Ekspor frame PNG, shot list JSON/CSV dan burn-in timecode sudah ada |
| **F8-09** Kolaborasi simultan | **Async review terbukti dibutuhkan lebih dahulu** (F7-05), bukan diminta di awal | Jangan spike sebelum Fase 7 berjalan; presence dan CRDT/OT adalah keputusan arsitektur besar | — |
| **F8-10** Eksperimen monetisasi | Data penggunaan nyata tersedia | Jangan jadikan proyeksi pasar atau harga yang belum divalidasi sebagai requirement MVP | Metrik lokal sudah mencatat 10 event PRD §11 |

**Satu aturan yang berlaku untuk seluruh Fase 8:** jangan mengerjakan item apa pun hanya
karena ia ada di daftar. Daftar ini adalah kandidat, dan setiap barisnya punya kolom
"sinyal yang harus muncul lebih dahulu" justru supaya tidak menjadi rencana kerja.

---

## 6. Ringkas: apa yang menghentikan apa

| Yang tertahan | Ditahan oleh | Dapat dikerjakan sekarang tanpa keputusan? |
|---|---|---|
| MP4 sebagai format ekspor | **D-04** | Tidak |
| F6-10 / F6-11 pilot | Peserta, fasilitator, jendela 2 minggu, cara menyajikan build (§3.2) | Tidak — tetapi §3.1 (uji Edge, ukur perangkat kelas PRD) dapat dan **harus** dikerjakan sekarang |
| F6-12 keputusan iterasi/perluasan + deployment produksi | Hasil F6-10/F6-11 + keputusan hosting (§4.1) | Tidak |
| F7-01 … F7-07 cloud dan review tim | **D-01** dan **D-07** + hasil pilot | Tidak |
| F8-01 … F8-10 backlog | Sinyal dari pilot (§5) | Tidak — dan sengaja tidak ada asumsi kerja yang dijalankan diam-diam |
| Tindak lanjut teknis yang tidak murah (ZIP batch, SeekHead, streaming ke disk, Worker, marquee select) | Tidak ada keputusan produk — hanya prioritas waktu | **Ya**, kapan saja. Daftar + perkiraan di `docs/GATE-R2.md` §7 |
