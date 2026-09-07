# Plan implementasi — Blocking Room

Dibuat: 8 September 2026.
Sumber utama: [PRD v1.1](docs/PRD.md). Konteks implementasi: [audit](docs/AUDIT.md) dan [README](README.md).

Dokumen ini menerjemahkan PRD menjadi fase dan task yang dapat dikerjakan berurutan. Ini adalah rencana pelaksanaan, bukan pernyataan bahwa seluruh fitur sudah tersedia. Pembaruan implementasi pada bagian akhir PRD menjadi acuan jika bertentangan dengan uraian kondisi lama.

## Cara menggunakan plan

- `[x]` berarti sudah diimplementasikan menurut baseline proyek; `[ ]` berarti belum selesai atau masih memerlukan verifikasi pada fase terkait.
- Kerjakan task berdasarkan dependensi. Selesaikan kriteria keluar fase sebelum menyatakan rilis terkait siap.
- P0 adalah syarat rilis fase tersebut; P1 adalah pengembangan setelah fondasi fase stabil; P2 adalah eksplorasi. P0 cloud tidak mendahului P0 proyek lokal.
- Setelah task selesai, centang task dan catat bukti berupa test, file, screenshot, atau keputusan di bagian log pelaksanaan.
- Tanggal, durasi kerja dan nama penanggung jawab belum ditentukan. Owner di bawah adalah peran usulan, bukan alokasi tim yang sudah disepakati.
- Jangan menghapus fitur atau data pengguna untuk menyederhanakan migrasi. Pertahankan undo, lock, visibility, arah hadap independen, langkah kaki, pintu, kondisi tanpa kamera, dan kompatibilitas JSON lama.

## Asumsi pelaksanaan

1. R1 bersifat lokal tanpa akun; penyimpanan cloud bukan dependensi R1.
2. Hierarki target: proyek → scene → shot. R1 memakai satu shot default per scene; UI banyak shot hadir pada R2.
3. Identitas aktor dan set dimiliki scene. Track gerak dan konfigurasi kamera dimiliki shot.
4. Riwayat undo sesi berbeda dari snapshot recovery proyek. Navigasi observer dan seleksi bukan perubahan kreatif dalam undo.
5. Target awal desktop; ponsel tetap mendukung review dan edit sederhana.
6. Target performa dan metrik di PRD adalah target yang perlu diukur, bukan hasil yang sudah dicapai.

## Ringkasan fase dan dependensi

| Fase | Rilis / milestone PRD | Hasil utama | Dependensi | Owner usulan |
|---|---|---|---|---|
| 0 | R0 / M0 | Baseline dan bukti regresi | Implementasi saat ini | Engineering + QA |
| 1 | R1 / M1 | Schema, batas modul, migrasi aman | Fase 0 | Engineering |
| 2 | R1 / M1 | Repository, autosave, recovery, isolasi tab | Fase 1 | Engineering + QA |
| 3 | R1 / M2 | Dashboard, banyak proyek/scene, trash, paket | Fase 2 | Product/design + Engineering |
| 4 | R2 / M3 | Shot, timeline, kamera, props | Fase 3 | Engineering + QA |
| 5 | R2 / M4 | Ekspor presisi dan referensi produksi | Fase 4; riset codec boleh mulai lebih awal | Engineering + QA |
| 6 | R1/R2 / M5 | Quality gate, rollout, pilot | Gate R1 setelah Fase 3; gate R2 setelah Fase 5 | QA + Product |
| 7 | R3 / M6 | Cloud dan review tim opsional | Fase 6 + keputusan cloud | Product + Engineering |
| 8 | Eksplorasi | Fitur lanjutan tervalidasi | Dependensi per fitur | Product + Engineering |

Urutan utama: **0 → 1 → 2 → 3 → gate/pilot R1 → 4 → 5 → gate/pilot R2 → 7 bila dibutuhkan**.

## Fase 0 — Bekukan baseline editor

Tujuan: menjaga fitur yang sudah berjalan selama perubahan arsitektur.
Referensi: ED-01–ED-05, pembaruan implementasi PRD, M0.

### Sudah diimplementasikan

- [x] **F0-01 · P0:** Undo/redo 100 langkah sesi; satu drag, gestur keyboard, atau rekaman menjadi satu langkah.
- [x] **F0-02 · P0:** Lock karakter/lokasi/kamera, lokasi default terkunci, dan picking yang tidak menggeser ruangan tanpa seleksi eksplisit.
- [x] **F0-03 · P0:** Hide/show geometri, label, jalur dan output; status tersimpan dalam JSON.
- [x] **F0-04 · P0:** Rotasi independen dari translasi, tool R, Q/E, hadap kamera, serta manipulasi melalui final view.
- [x] **F0-05 · P0:** Hapus karakter/lokasi/kamera, undo penghapusan, kondisi kamera kosong dan tambah kamera kembali.
- [x] **F0-06 · P1:** Langkah kaki/tangan prosedural deterministik, pintu terbuka kiri/belakang, dan peringatan jalur melewati dinding.
- [x] **F0-07 · P0:** Suite unit dan browser untuk model/history, interaksi editor, pintu, penghapusan, persistence dan ekspor.

### Task sebelum refactor besar

- [ ] **F0-08 · P0:** Simpan fixture JSON v1: scene demo, kamera null, tanpa aktor/ruangan, objek terkunci/hidden, pintu, jalur berjalan, serta import invalid.
- [ ] **F0-09 · P0:** Catat baseline pose pada awal/tengah/akhir shot, screenshot observer/final, dan hasil ekspor dari fixture. Jangan memakai screenshot saja untuk membuktikan kesetaraan data.
- [ ] **F0-10 · P0:** Jalankan ulang suite pada lingkungan yang akan digunakan untuk pengembangan; catat browser, perangkat, hasil dan keterbatasannya.

**Kriteria keluar:** fixture dan hasil baseline tersedia; tidak ada kegagalan kritis pada fitur R0. Fitur yang sudah dicentang tidak dibangun ulang, tetapi diverifikasi setelah perubahan terkait.

## Fase 1 — Fondasi data dan batas modul

Tujuan: mempersiapkan banyak proyek tanpa mengubah hasil scene lama.
Referensi: PR-02, PR-05, PR-06; PRD §11 dan M1.
Dependensi: F0-08–F0-10.

- [ ] **F1-01 · P0:** Catat kontrak data `Project`, `Scene`, `Shot`, `Object`, `Camera`, `Track`, `Asset`, `Revision`, dan `SessionState`. Tentukan UUID, timestamp, schemaVersion dan ownership setiap field.
- [ ] **F1-02 · P0:** Buat validator skema baru, termasuk foreign ID, batas ukuran, kamera opsional, pintu dan flag objek. Tolak referensi lintas proyek/scene yang tidak valid.
- [ ] **F1-03 · P0:** Pisahkan document state dari state UI; buat selector scene/shot aktif. Pastikan tidak ada mutasi scene A ketika scene B aktif.
- [ ] **F1-04 · P0:** Satukan perubahan kreatif melalui command/history. Tetapkan scope undo per proyek, pemulihan scene aktif saat undo, transaksi gestur dan pengecekan lock untuk operasi massal.
- [ ] **F1-05 · P0:** Ekstrak batas `SceneRenderer`, `TimelineEngine`, `ExportService`, dan UI dari entry point secara bertahap. Gunakan scene sampling yang sama untuk preview dan ekspor.
- [ ] **F1-06 · P0:** Implementasikan migrator v1 → schema baru: satu proyek, satu scene, satu shot default. Pertahankan keyframe, focal length, target, kamera null, doors, lock/hide dan semua nama pengguna.
- [ ] **F1-07 · P0:** Migrasi harus copy-first: simpan backup sumber, validasi hasil, jangan menimpa sumber saat gagal. Tentukan penanganan schema yang lebih baru daripada aplikasi.
- [ ] **F1-08 · P0:** Tetapkan strategi waktu keyframe agar konversi detik → frame pada R2 tidak membulatkan gerakan lama tanpa disadari. Catat kebijakan fps dan toleransi migrasi.
- [ ] **F1-09 · P0:** Uji kesetaraan sampling sebelum/sesudah migrasi, roundtrip serialize, dan rollback migrasi gagal menggunakan fixture Fase 0.

**Kriteria keluar:** semua fixture valid termigrasi tanpa perubahan pose; invalid input tidak mengubah sumber; editor dapat membaca scene/shot default dari schema baru; regression R0 lulus.

## Fase 2 — Penyimpanan lokal yang aman

Tujuan: menyimpan banyak proyek, pulih dari kegagalan, dan menghindari overwrite antartab.
Referensi: PR-02, PR-03, PR-04, PR-07; NFR ketahanan/privasi.
Dependensi: Fase 1.

- [ ] **F2-01 · P0:** Implementasikan `ProjectRepository` berbasis IndexedDB: create/read/update/list, revision, asset reference dan transaksi atomik.
- [ ] **F2-02 · P0:** Aktifkan migrasi localStorage melalui repository; simpan penanda migrasi setelah commit sukses. Migrasi ulang tidak membuat proyek duplikat.
- [ ] **F2-03 · P0:** Tambahkan autosave ≤1 detik setelah gestur selesai, penggabungan save, serta revision token untuk menghindari respons lama menimpa save baru.
- [ ] **F2-04 · P0:** Tampilkan status “Menyimpan”, “Tersimpan lokal”, dan “Gagal menyimpan”. Hanya tampilkan sukses setelah transaksi berhasil; pertahankan data di memori dan sediakan download backup saat gagal.
- [ ] **F2-05 · P0:** Simpan minimal 10 snapshot recovery per proyek. Sediakan daftar waktu revisi, preview/pulihkan dan opsi membuka versi tersimpan terakhir.
- [ ] **F2-06 · P0:** Simpan session state: scene/shot terakhir, playhead, seleksi dan observer pose. Pulihkan dengan fallback aman bila ID sudah dihapus.
- [ ] **F2-07 · P0:** Implementasikan satu writer per proyek. Tab kedua menjadi read-only atau membuka salinan; tangani tab writer ditutup/crash dan pergantian kepemilikan tanpa kehilangan edit.
- [ ] **F2-08 · P0:** Tangani quota exceeded, storage unavailable dan kegagalan transaksi. Tawarkan backup; persistent storage tidak boleh dipresentasikan sebagai pengganti backup.
- [ ] **F2-09 · P0:** Uji dua proyek berjudul sama tetap terisolasi, pergantian proyek saat save pending, dua tab, 100 siklus edit/save/reload dan recovery setelah kegagalan buatan.

**Kriteria keluar:** proyek A/B tidak saling berubah; save atomik dan status jujur; restore snapshot bekerja; tidak ada silent last-write-wins pada dua tab; 100 siklus tidak kehilangan data yang dinyatakan tersimpan.

## Fase 3 — Dashboard dan workflow banyak proyek/scene

Tujuan: menyelesaikan R1 lokal yang dapat digunakan tanpa pengelolaan file manual.
Referensi: PR-01–PR-07, PRD §5/§10, M2.
Dependensi: Fase 2.

- [ ] **F3-01 · P0:** Buat dashboard: judul, thumbnail, jumlah scene, updatedAt, pencarian judul, urutan terbaru dan terakhir dibuka. Muat metadata tanpa membaca semua scene.
- [ ] **F3-02 · P0:** Implementasikan buat proyek kosong/template, buka, rename dan duplicate. Remap semua ID internal saat duplicate tanpa mengubah hubungan target/track/aset.
- [ ] **F3-03 · P0:** Implementasikan trash proyek 30 hari, restore, dan hapus permanen dengan konfirmasi. Dokumentasikan kapan pembersihan dijalankan pada aplikasi lokal.
- [ ] **F3-04 · P0:** Tambah scene, rename, duplicate, reorder, delete dan switch. Tiap scene memiliki set/aktor/track independen; menangani scene terakhir yang dihapus.
- [ ] **F3-05 · P0:** Tambahkan breadcrumb proyek/scene/shot dan navigasi kembali ke dashboard. Jadikan director’s note serta nama scene/kamera metadata editable.
- [ ] **F3-06 · P0:** Buat thumbnail tersimpan per proyek/scene setelah perubahan relevan; kegagalan thumbnail tidak menggagalkan penyimpanan dokumen.
- [ ] **F3-07 · P0:** Implementasikan impor/ekspor paket berisi manifest, scene, aset dan checksum. Paket dengan aset kosong tetap valid; cek integritas dan batas ukuran sebelum mengganti state aktif.
- [ ] **F3-08 · P0:** Dukung impor v1 sebagai proyek baru. Tangani konflik ID/nama dan corrupted import tanpa menimpa proyek yang terbuka.
- [ ] **F3-09 · P0:** Lengkapi empty/loading/error states, storage penuh, tab read-only, recovery, asset missing dan no-camera. Perbesar target sentuh inti ≥44 px dan pertahankan keyboard/focus UI.
- [ ] **F3-10 · P0:** Uji perjalanan buat A → tambah scene → simpan → buka B → kembali A → reload; duplicate → edit salinan; delete → restore; paket export/import → data ekuivalen.
- [ ] **F3-11 · P0:** Jalankan gate R1 pada Fase 6 sebelum menyatakan dashboard siap rilis/pilot.

**Kriteria keluar:** seluruh PR-01–PR-07 terpenuhi; proyek/scene aktif pulih setelah reload; paket roundtrip setara; tidak ada kehilangan data atau konflik tab yang belum tertangani.

## Fase 4 — Shot, timeline dan penataan set

Tujuan: menyusun beberapa alternatif shot tanpa merusak set dan shot lain.
Referensi: SH-01, TL-01, TL-02, CA-01, SC-01; M3.
Dependensi: Fase 3 dan gate R1.

- [ ] **F4-01 · P0:** Bangun shot list: ID/nama/nomor, urutan, kamera aktif, durasi, aspect ratio, notes, buat/duplicate/delete/switch dan perbandingan alternatif.
- [ ] **F4-02 · P0:** Pastikan kamera dan track dimiliki shot. Set/identitas aktor tetap milik scene; perubahan gerakan/lensa shot B tidak mengubah shot A.
- [ ] **F4-03 · P0:** Implementasikan frame ruler, snapping, zoom/pan timeline dan playhead presisi. Tetapkan perilaku di awal/akhir durasi dan saat fps berubah.
- [ ] **F4-04 · P0:** Tambahkan drag/multi-select/copy/paste/delete keyframe. Operasi massal satu undo; lock dipatuhi; timestamp bertabrakan memiliki aturan replace yang terlihat.
- [ ] **F4-05 · P1:** Migrasikan keyframe gabungan ke track posisi dan orientasi independen; linear/hold/ease. Buktikan hasil gerak lama tetap setara saat memakai linear.
- [ ] **F4-06 · P1:** Tambah preset kamera dengan focal length nyata, 16:9/9:16/2.39:1, safe area, focal keyframe, target lock dan manual aim. Preview dan ekspor memakai crop yang sama.
- [ ] **F4-07 · P1:** Jadikan box, meja, kursi dan dekorasi sebagai entitas ber-ID; hentikan ketergantungan dekorasi pada urutan ruangan. Transform/duplicate/lock/hide menggunakan command yang sama.
- [ ] **F4-08 · P1:** Tambahkan dinding modular dan snap grid opsional; pertahankan pintu yang sudah ada. Jangan mengubah peringatan tembus dinding menjadi collision fisik tanpa opsi/kebutuhan tervalidasi.
- [ ] **F4-09 · P1:** Jika visibility editor/render dipisahkan, tambahkan kontrol eksplisit dan migrasi flag lama. Hidden lama harus tetap memberi hasil render yang sama.
- [ ] **F4-10 · P0:** Buat cue Edit/Play/Record yang jelas dan uji: dua alternatif shot, keyframe massal, rotasi terpisah, kamera null, langkah deterministik, pintu serta target kamera yang dihapus.

**Kriteria keluar:** alternatif shot terisolasi; timeline dapat diedit dan di-undo; seluruh SH-01/TL-01 terpenuhi. TL-02/CA-01/SC-01 diselesaikan untuk scope R2 penuh atau dicatat eksplisit sebagai rilis susulan—tidak dianggap selesai diam-diam.

## Fase 5 — Ekspor presisi dan referensi produksi

Tujuan: menjadikan hasil output konsisten dengan preview dan siap dibagikan.
Referensi: EX-01–EX-03, M4.
Dependensi: Fase 4. Task riset F5-01 dapat dimulai setelah schema shot F1 tersedia.

- [ ] **F5-01 · P0:** Lakukan spike encoder: WebCodecs, muxer, dukungan codec, memory budget dan error runtime. Catat opsi MP4/WebM, kebutuhan worker/server serta keputusan target fps/resolusi.
- [ ] **F5-02 · P0:** Buat dialog ekspor shot/range, resolution/fps/codec yang didukung, penamaan proyek_scene_shot, progress, cancel, retry dan pesan unsupported.
- [ ] **F5-03 · P0:** Render dari snapshot revision immutable. Edit setelah job dimulai tidak mengubah hasil job tersebut; tutup stream dan resource pada selesai/cancel/error.
- [ ] **F5-04 · P0:** Implementasikan sampling timestamp/frame eksplisit dan pipeline encode/mux. Video 10 detik ×30 fps memiliki tepat 300 frame; output dapat dibuka dan di-seek.
- [ ] **F5-05 · P0:** Pertahankan fallback MediaRecorder real-time dengan label keterbatasan. Jangan menyatakan fallback ini memenuhi gate deterministik.
- [ ] **F5-06 · P1:** Tambah antrean/batch shot lokal, burn-in opsional nama shot/timecode/lensa, PNG storyboard dan shot list. Overlay editor hanya ikut bila dipilih.
- [ ] **F5-07 · P0:** Verifikasi first/middle/last frame: posisi, orientasi, langkah kaki, pintu, visibility dan framing sesuai preview. Uji codec failure, cancellation, kamera hilang dan batas frame/range.
- [ ] **F5-08 · P0:** Jalankan gate R2 dan pilot Fase 6 sebelum rilis output produksi.

**Kriteria keluar:** EX-01 dan EX-02 terbukti melalui hasil file; output deterministik lolos hitungan frame dan kesetaraan pose; fallback jelas. EX-03 selesai atau tercatat sebagai scope susulan yang belum selesai.

## Fase 6 — Quality gate, rollout dan validasi pengguna

Tujuan: membuktikan kelayakan R1/R2 dan menentukan perluasan berikutnya.
Referensi: NFR PRD §9, metrik §11, rollout §14, M5.
Task QA/instrumentasi dimulai pada fase terkait, bukan ditunda sampai semua fitur selesai.

- [ ] **F6-01 · P0:** Tentukan perangkat/browser referensi dan fixture beban: 20 aktor, 10 ruang, 500 keyframe. Catat kondisi pengukuran.
- [ ] **F6-02 · P0:** Ukur p95 input → viewport <100 ms dan playback ≥30 fps selama 60 detik. Optimalkan transform incremental, material reuse dan frekuensi save hanya pada bottleneck yang terukur.
- [ ] **F6-03 · P0:** Uji p95 buka metadata proyek ≤5 MB dalam ≤2 detik; dashboard 100 proyek tidak memuat semua scene. Uji 20 kali open/close/rebuild tanpa tren kebocoran GPU/memori.
- [ ] **F6-04 · P0:** Audit keyboard, focus, nama kontrol, status non-warna, layout 390 px, touch target ≥44 px dan target WCAG 2.2 AA pada UI biasa. Catat temuan yang belum lulus.
- [ ] **F6-05 · P0:** Tambahkan handling no-WebGL/context-loss, retry aman, asset loading/missing, serta capability detection. Uji Chrome/Edge; dokumentasikan fallback Safari/Firefox.
- [ ] **F6-06 · P0:** Tambahkan metrik lokal project open/create, autosave, command/history, export dan recovery. Telemetry eksternal opt-in; jangan kirim nama proyek, script atau data scene.
- [ ] **F6-07 · P0:** Siapkan build preview, flag dashboard saat pilot, backup migrasi, prosedur rollback dan pembaca schema baru yang stabil. Rollback aplikasi tidak menghapus data baru.
- [ ] **F6-08 · P0:** Gate R1: suite data/editor dan 100 siklus save/reload lulus; PR-01–PR-07 terpenuhi; tidak ada bug kehilangan data, lock bypass atau migrasi kritis terbuka.
- [ ] **F6-09 · P0:** Gate R2: gate R1 tetap lulus; shot terisolasi; tidak ada mismatch preview/export kritis; frame-count, codec fallback dan cancellation terbukti.
- [ ] **F6-10 · P0:** Jalankan pilot dengan 5–8 pembuat film: buat dua aktor, gerak kamera, ekspor, reopen dan recovery. Target ≥80% menyelesaikan tugas tanpa bantuan, median video pertama ≤10 menit.
- [ ] **F6-11 · P0:** Pantau dua minggu: export success target ≥95%, kembali mengedit dalam tujuh hari ≥50%, kehilangan data tersimpan =0. Pisahkan baseline, target dan hasil observasi.
- [ ] **F6-12 · P0:** Putuskan iterasi atau perluasan. Hentikan rollout bila kehilangan data; buat task mitigasi sebelum cloud/AI. Tentukan dan jalankan deployment produksi hanya ketika scope/lingkungan rilis sudah ditetapkan.

**Kriteria keluar:** bukti gate dan laporan pilot tersedia; gap memiliki keputusan tindak lanjut. Jangan menyatakan target tercapai hanya karena test otomatis lulus.

## Fase 7 — Cloud dan review tim (opsional)

Tujuan: akses lintas perangkat dan review tanpa mengorbankan privasi/keamanan proyek.
Referensi: CL-01, CL-02, scope R3 dan M6.
Dependensi: hasil Fase 6; keputusan kebutuhan cloud, budget, region dan provider.

- [ ] **F7-01 · P0:** Putuskan auth, database metadata, object storage, model biaya dan kebijakan akses. Dokumentasikan jalur pengguna lokal tanpa akun.
- [ ] **F7-02 · P0:** Implementasikan owner/editor/viewer dengan pemeriksaan server per resource; proyek privat default dan akses aset terbatas.
- [ ] **F7-03 · P0:** Sinkronisasi revision-aware dan antrean perubahan offline; tangani konflik sebagai salinan/revisi yang bisa ditinjau, bukan overwrite diam-diam.
- [ ] **F7-04 · P0:** Bangun revision history cloud dan restore. Bedakan snapshot tersimpan dari undo lokal; uji perpindahan perangkat dan koneksi terputus.
- [ ] **F7-05 · P1:** Buat review link snapshot immutable, read-only, expiry/revoke; komentar timestamp tanpa izin mengedit scene.
- [ ] **F7-06 · P1:** Tambahkan antrean export tim hanya bila model render/biaya disepakati; job mengacu revision tetap, dengan progress/cancel/retry dan akses hasil yang benar.
- [ ] **F7-07 · P0:** Uji isolasi antaruser/proyek, akses link yang dicabut, konflik editor, retry, serta rollback sync. Jangan rilis bila ada kebocoran data atau silent overwrite.

**Kriteria keluar:** CL-01 terpenuhi, CL-02 terbukti untuk rilis review, biaya/operasi disepakati. Kolaborasi simultan belum termasuk fase ini.

## Fase 8 — Backlog eksplorasi setelah MVP

Semua task di fase ini P2 dan belum menjadi komitmen rilis. Dahului implementasi dengan validasi kebutuhan dan spike terukur.

- [ ] **F8-01:** Import GLB karakter/props dan skala manusia — dependensi asset pipeline F3/F4; validasi batas ukuran/poligon/tekstur, lisensi dan tiga scene pengguna.
- [ ] **F8-02:** Rig idle/walk/run/crouch, look-at kepala, foot IK dan rotasi penuh — dependensi F8-01/TL-02; bandingkan pemahaman blocking dengan langkah prosedural yang sudah ada.
- [ ] **F8-03:** Denah gambar sebagai underlay terukur — dependensi import image, unit dan snap; buktikan rekonstruksi satu set nyata.
- [ ] **F8-04:** Collision/clearance lanjutan, auto-routing opsional dan daun pintu beranimasi — dependensi dinding/props eksplisit; uji pintu sempit, tinggi aktor dan dinding berimpit. Pertahankan opsi blocking bebas.
- [ ] **F8-05:** Audio/dialog cue serta anotasi — dependensi timeline frame dan aset audio; uji satu shot dialog.
- [ ] **F8-06:** Continuity tools, garis 180° dan eyeline — dependensi multi-shot/target aktor; uji tiga shot percakapan.
- [ ] **F8-07:** AI-assisted blocking — dependensi schema/commands stabil; draft dapat ditinjau, diubah dan di-undo; tidak otomatis menimpa scene.
- [ ] **F8-08:** Paket referensi untuk pipeline generasi video — dependensi ekspor frame/timecode/manifest; evaluasi kecocokan pose dan kamera hasil.
- [ ] **F8-09:** Kolaborasi simultan — dependensi auth/revisions/presence dan kebutuhan yang terbukti setelah async review.
- [ ] **F8-10:** Eksperimen monetisasi tim/cloud/render setelah data penggunaan tersedia; jangan menjadikan proyeksi pasar atau harga yang belum divalidasi sebagai requirement MVP.

## Pemetaan requirement PRD ke task

| Requirement | Task utama |
|---|---|
| ED-01–ED-05 | F0-01–F0-04, F0-07–F0-10, F1-04, F4-04/F4-10 |
| PR-01 | F3-01/F3-02/F3-06/F3-09 |
| PR-02 | F1-01–F1-03, F2-01/F2-09, F3-02/F3-10 |
| PR-03 | F2-03/F2-04/F2-08/F2-09 |
| PR-04 | F2-05, F3-03, F3-10 |
| PR-05 | F1-03, F3-04/F3-05/F3-10 |
| PR-06 | F1-06–F1-09, F2-02, F3-07/F3-08 |
| PR-07 | F2-07/F2-09, F3-09 |
| SH-01 | F4-01/F4-02/F4-10 |
| TL-01 | F4-03/F4-04/F4-10 |
| TL-02 | F1-08, F4-05/F4-10 |
| SC-01 | F4-07/F4-08; pertahankan pintu F0-06 |
| CA-01 | F4-06/F4-10 |
| EX-01 | F5-02/F5-03/F5-07 |
| EX-02 | F5-01/F5-04/F5-05/F5-07 |
| EX-03 | F5-06 |
| CL-01 | F7-01–F7-04, F7-07 |
| CL-02 | F7-05/F7-07 |
| NFR, metrik, rollout | F2-08/F2-09, F3-09, F6-01–F6-12, F7-07 |

## Keputusan yang perlu dicatat

| ID | Keputusan | Default dari PRD / usulan | Task yang bergantung |
|---|---|---|---|
| D-01 | Lokal dahulu atau cloud wajib? | R1 lokal tanpa akun | F1/F2; cloud sebelum F7 |
| D-02 | Makna proyek dan ownership shot | Proyek film → scene → shot | F1-01 |
| D-03 | Prioritas R2 | Shot/timeline/export sebelum GLB | F4/F5/F8-01 |
| D-04 | MP4 wajib, resolusi dan fps target? | Belum diputuskan; MediaRecorder lama tetap fallback | F1-08, F5-01/F5-04 |
| D-05 | Hide global atau editor/render terpisah? | Pertahankan global sampai migrasi eksplisit | F4-09 |
| D-06 | Rig, putaran >360° dan batas beban nyata | Langkah prosedural + yaw untuk baseline | F6-01, F8-02 |
| D-07 | Provider, region, budget, akses tim | Belum diputuskan | F7-01/F7-06 |

Keputusan yang belum ada tidak menghentikan semua pekerjaan. Lanjutkan task independen dengan asumsi tertulis; tunda hanya implementasi yang benar-benar bergantung pada keputusan tersebut.

## Verifikasi dan definisi selesai per task

Untuk task implementasi, selesai berarti perilaku memenuhi acceptance criteria PRD, bukti uji relevan tersedia, dan dokumentasi/status diperbarui. Jangan centang task hanya karena kode dibuat.

Perintah baseline saat ini:

```sh
npm test
npm run build
# Jalankan server di terminal terpisah untuk browser tests:
npm run dev -- --port 5174 --strictPort
# Chrome harus terpasang; tes memakai port 5174:
node tests/browser-smoke.mjs
node tests/editor-regression.mjs
node tests/walk-doors-delete.mjs
```

Tambahkan suite repository/migrasi, multi-tab, multi-scene/shot dan deterministic export saat fase terkait dibangun. Jalankan pengujian yang relevan terhadap perubahan; jalankan gate lengkap pada akhir fase/rilis.

## Log pelaksanaan

| Tanggal | Task | Status | Bukti / catatan |
|---|---|---|---|
| 2026-09-08 | Penyusunan plan | Selesai | Diterjemahkan dari PRD v1.1 dan pembaruan implementasi; belum memulai task R1 |

## Langkah berikutnya

Mulai **F0-08–F0-10** untuk baseline migrasi, kemudian **F1-01–F1-03** untuk kontrak data proyek/scene/shot. Jangan langsung mengganti localStorage atau membangun dashboard sebelum kontrak dan strategi migrasi aman tersedia.
