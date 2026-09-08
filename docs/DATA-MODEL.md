# Kontrak data — Blocking Room schema v2

Status: berlaku sejak Fase 1 (F1-01, F1-02, F1-08). Sumber requirement: [PRD §11](PRD.md). Rencana: [plan.md](../plan.md).

Dokumen ini adalah kontrak yang dipakai `src/schema.js` (validator), `src/migrate.js` (migrasi v1 → v2), `src/document.js` (selector scene/shot) dan `src/commands.js` (command/history). Bila dokumen ini dan kode berbeda, perbaiki keduanya dalam satu perubahan.

## 1. Prinsip

1. **Dokumen adalah sumber kebenaran.** DOM dan mesh Three.js hanya turunan. Mesh dibangun ulang dari dokumen, tidak pernah sebaliknya.
2. **Document state ≠ UI state.** Judul, scene, shot, objek, track dan flag lock/hide adalah document state. Seleksi, playhead, tool aktif, pose observer, mode tampilan dan status tombol adalah UI state; UI state tidak pernah masuk dokumen maupun history undo.
3. **Ownership tegas.** Set dan identitas aktor dimiliki scene. Gerakan (track) dan framing kamera dimiliki shot. R1 memakai satu scene dan satu shot default agar R2 tidak perlu memindahkan ownership.
4. **Semua foreign ID harus berada dalam lingkup yang sesuai.** Referensi lintas proyek atau lintas scene ditolak validator, bukan diperbaiki diam-diam.
5. **Copy-first.** Migrasi dan impor tidak pernah memutasi sumber; hasil divalidasi sebelum menggantikan dokumen aktif.

## 2. Entitas dan kepemilikan field

### Project

| Field | Tipe | Wajib | Pemilik / catatan |
|---|---|---|---|
| `schemaVersion` | integer | ya | Selalu `2` untuk aplikasi ini. Nilai lebih besar ditolak (lihat §6). |
| `id` | string ID | ya | UUID v4 (`crypto.randomUUID`). Identitas proyek; tidak pernah berubah setelah dibuat. |
| `title` | string 1–100 | ya | Judul yang diedit pengguna. |
| `createdAt` | ISO-8601 UTC | ya | Ditulis sekali saat proyek dibuat atau dimigrasikan. |
| `updatedAt` | ISO-8601 UTC | ya | Distempel **saat menyimpan** (`src/storage.js`), bukan saat mengedit, agar snapshot history tidak berubah hanya karena waktu. |
| `activeSceneId` | ID scene | ya | Scene aktif; wajib menunjuk scene di dalam proyek ini. Ikut dipulihkan saat undo. |
| `thumbnailRef` | string \| null | ya | Referensi thumbnail. **Sejak Fase 3 field dokumen ini tetap `null`**: thumbnail hidup di store `assets` dan ditunjuk oleh metadata proyek, bukan oleh dokumen (lihat §2 Asset). |
| `assets` | Asset[] | ya | Tetap kosong pada R1. Aset (thumbnail) disimpan di store `assets` repository, bukan di dalam dokumen, supaya kegagalan gambar tidak dapat menggagalkan penyimpanan dokumen. |
| `scenes` | Scene[] | ya | Minimal 1, maksimal 200. |

### Scene

| Field | Tipe | Wajib | Pemilik / catatan |
|---|---|---|---|
| `id` | string ID | ya | UUID; unik dalam proyek. |
| `projectId` | ID proyek | ya | **Harus** sama dengan `project.id`; berbeda → ditolak sebagai referensi lintas proyek. |
| `name` | string 1–100 | ya | Nama scene. |
| `order` | integer ≥ 0 | ya | Urutan tampil. |
| `notes` | string ≤ 2000 | ya | Director’s note milik scene; editable di panel kiri editor (F3-05). |
| `thumbnailRef` | string \| null | tidak | Diisi `null` oleh operasi scene Fase 3. Thumbnail scene sesungguhnya dicari di store `assets` dengan id `thumb-<sceneId>`. |
| `activeShotId` | ID shot | ya | Shot aktif di scene ini. |
| `actors` | Object(actor)[] | ya | **Identitas aktor milik scene**; maksimal 50. |
| `setObjects` | Object(room)[] | ya | Set/lokasi milik scene; maksimal 30. |
| `shots` | Shot[] | ya | Minimal 1, maksimal 100. |

### Object — aktor

`{ id, type: 'actor', name, color, height, locked, visible, assetRef }`

| Field | Batas | Catatan |
|---|---|---|
| `id` | ≤ 64 karakter, unik dalam scene | UUID untuk objek baru; ID lama dari JSON v1 (`a1`, `r1`) dipertahankan apa adanya saat migrasi. |
| `name` | 1–100 | |
| `color` | `#rrggbb` | |
| `height` | 0,5–3 m | |
| `locked` | boolean | Melarang edit pengguna, **tidak** membekukan playback. |
| `visible` | boolean | `false` menghilangkan objek dari scene, label, jalur, picking **dan** video. |
| `assetRef` | string \| null | Slot untuk Fase 8 (import GLB). |

### Object — set/ruangan

`{ id, type: 'room', name, color, x, z, w, d, h, doors[], locked, visible, assetRef }`

| Field | Batas |
|---|---|
| `x`, `z` | −100…100 m (pusat ruangan) |
| `w`, `d` | 1–40 m |
| `h` | 1–10 m |
| `doors` | ≤ 2, maksimal satu per dinding |
| `locked` | Ruangan **default terkunci** (`true`) untuk mencegah pergeseran tidak sengaja. |

**Door**: `{ wall: 'back' | 'left', offset, width, height }`. `back` adalah dinding −Z, `left` adalah −X. `offset` dihitung dari pusat dinding. Aturan: `width ≥ 0,6`, `0,8 ≤ height ≤ h − 0,1`, dan `|offset| + width/2 ≤ span/2 − 0,1` (validasi di `src/spatial.js#validDoors`).

### Shot

| Field | Tipe | Catatan |
|---|---|---|
| `id` | string ID | Unik dalam scene. |
| `sceneId` | ID scene | **Harus** sama dengan scene pemiliknya; berbeda → ditolak. |
| `name`, `order`, `notes` | string / integer / string | Metadata shot. |
| `duration` | 1–120 detik | **Durasi milik shot**, bukan proyek. |
| `fps` | 1–120 | Default hasil migrasi: **24**. Belum dipakai untuk sampling pada R1 (lihat §5). |
| `aspectRatio` | `16:9`, `9:16`, `2.39:1`, `4:3`, `1:1` | Default `16:9`. |
| `cameraId` | ID kamera \| null | Harus konsisten dengan `camera`. |
| `camera` | Camera \| null | **Kamera opsional**: `null` adalah keadaan sah (proyek tanpa kamera). Ekspor menolak, editor tetap berjalan. |
| `tracks` | Track[] | **Gerakan milik shot.** |

### Camera

`{ id, type: 'camera', name, focal, targetId, locked, visible }`

- `focal` 14–120 mm.
- `targetId` `''` (titik pandang manual dari keyframe `tx/ty/tz`) atau ID aktor **di scene yang sama**. Menghapus aktor target mengubah `targetId` menjadi `''` (kembali ke titik manual), kecuali kamera terkunci — penghapusan lalu ditolak dengan penjelasan.
- `visible: false` hanya menyembunyikan gizmo/jalur kamera, tidak mengubah hasil render.

### Track

`{ objectId, property: 'pose', interpolation: 'linear', keys: Keyframe[] }`

- Satu track pose per objek per shot; setiap aktor dan kamera pada shot **wajib** punya track (minimal satu keyframe).
- `objectId` harus aktor di scene yang sama atau kamera shot tersebut. Referensi ke objek scene lain ditolak.
- Keyframe aktor: `{ t, x, z, r }`. Keyframe kamera: `{ t, x, y, z, tx, ty, tz }`.
- `t` dalam detik, `0 ≤ t ≤ shot.duration`, unik dalam track, selalu terurut naik. Maksimal 2400 keyframe per track.
- `property` dan `interpolation` sengaja eksplisit agar R2 (F4-05) dapat menambah track posisi/orientasi terpisah dan `hold`/`ease` tanpa mengubah bentuk dokumen.

### Asset, Revision, ExportJob, SessionState

Semuanya milik repository, **bukan** bagian dari dokumen:

- `Asset { id, projectId, sceneId, kind, contentHash, mimeType, byteSize, dataUrl, createdAt }` — store `assets`. Fase 3 mengisinya dengan **thumbnail** (`kind: 'thumbnail'`, JPEG 320×180 sebagai data URL, id `thumb-<sceneId>`). Thumbnail ditulis lewat `repository.putThumbnail()` dalam transaksi `assets` + `projects` yang **tidak menyentuh store `documents`**: kegagalan thumbnail tidak dapat menggagalkan penyimpanan dokumen dan tidak pernah membuat langkah undo. `projects.thumbnailRef` menunjuk thumbnail scene yang terakhir dirender; aset yang hilang ditampilkan dashboard sebagai placeholder, bukan error.
- `Revision { id, projectId, parentId, createdAt, schemaVersion, title, snapshot }` — snapshot recovery, **berbeda** dari undo sesi. Store `revisions`, index `projectId_createdAt`; minimal 10 revisi per proyek dipertahankan, batas simpan 20 dan kelebihan tertua dipangkas dalam transaksi save yang sama (Fase 2, F2-05).
- `ExportJob { id, projectId, revisionId, shotIds[], settings, status, outputRef? }` — merender dari revision immutable (Fase 5, belum ada store).
- `SessionState { projectId, sceneId, shotId, selectedId, playhead, observerPose, activeTool }` — **UI state**, store `session` (keyPath `projectId`), throttle 1 detik, tidak pernah masuk undo (Fase 2, F2-06). `observerPose = { x, y, z, targetX, targetY, targetZ }`.

### Penyimpanan sejak Fase 2

Sumber kebenaran adalah IndexedDB `blocking-room` (`src/repository.js`). Satu transaksi
menulis `documents` + `projects` + `revisions` sekaligus, sehingga metadata dashboard
tidak pernah menunjuk isi yang gagal ditulis.

localStorage (`src/storage.js`) hanya menyimpan hal kecil yang harus dibaca sinkron:

| Kunci | Isi |
|---|---|
| `blocking-room` | Dokumen lama (v1/v2) sebagai sumber migrasi. **Tidak pernah ditimpa** oleh hasil migrasi. |
| `blocking-room.backup` | Salinan mentah sumber sebelum migrasi (copy-first). |
| `blocking-room.migrated` | Id proyek hasil migrasi; ditulis hanya setelah transaksi commit sehingga migrasi ulang tidak membuat duplikat. |
| `blocking-room.activeProject` | Proyek yang dibuka editor. **Tetap sumber kebenaran sejak Fase 3**: rute hash `#/project/<id>` hanya menuliskannya sebelum editor dimuat. |
| `blocking-room.pending` | Titipan sinkron saat tab ditutup: transaksi IndexedDB yang baru dimulai pada `pagehide` tidak dijamin commit. Diambil dan dibuang oleh bootstrap berikutnya. |
| `blocking-room.writer.<projectId>` | Heartbeat writer untuk fallback kunci antartab. |

### Metadata proyek (store `projects`, Fase 3)

Dashboard hanya membaca store ini; membuka daftar 100 proyek tidak pernah memuat satu
dokumen pun.

| Field | Isi |
|---|---|
| `id`, `title`, `createdAt`, `updatedAt` | Cerminan dokumen; `title` dan `updatedAt` selalu ditulis dalam transaksi yang sama dengan dokumen. |
| `sceneCount` | Jumlah scene, untuk kartu dashboard. |
| `thumbnailRef` | Id aset thumbnail atau `null`. |
| `lastOpenedAt` | ISO-8601 saat proyek terakhir dibuka dari dashboard/editor (`repository.touchProject`). Dipakai urutan “terakhir dibuka”; dipertahankan oleh setiap penyimpanan berikutnya. |
| `deletedAt` | `null` atau ISO-8601 saat proyek dipindahkan ke tempat sampah. |
| `revisionToken` | Token monoton terakhir yang menang; menolak respons save yang datang terlambat. |

### Tempat sampah 30 hari (F3-03)

- `repository.deleteProject(id)` **hanya** mengisi `deletedAt`. Dokumen, revisi dan session
  state tidak disentuh, sehingga `restoreProject(id)` mengembalikan isi apa adanya.
- `repository.deleteProject(id, {permanent: true})` menghapus metadata, dokumen, session
  state dan seluruh revisi proyek dalam satu transaksi. UI menuntut konfirmasi eksplisit
  (klik kedua pada tombol konfirmasi), bukan hanya satu klik.
- **Kapan pembersihan otomatis berjalan:** aplikasi lokal tidak punya proses latar, jadi
  `repository.purgeExpiredTrash()` dijalankan **setiap kali dashboard dibuka**
  (`src/dashboard.js`, fungsi `load()`). Item dengan `deletedAt` lebih tua dari
  `TRASH_RETENTION_DAYS` (30 hari) dihapus permanen, dan pengguna diberi tahu berapa item
  yang dibersihkan. Proyek yang tidak pernah membuka dashboard tidak akan pernah
  kehilangan isi tempat sampahnya — itu disengaja: penghapusan permanen hanya terjadi
  pada sesi yang benar-benar melihat daftar proyek.

### Paket proyek `.blockingroom.json` (F3-07)

Format ekspor/impor satu berkas. JSON, bukan ZIP: ZIP menuntut library kompresi dan proyek
ini tidak menambah dependency.

```jsonc
{
  "manifest": {
    "format": "blockingroom.package", "packageVersion": 1, "schemaVersion": 2,
    "app": {"name": "blocking-room", "version": "1.0.0"},
    "createdAt": "ISO-8601",
    "counts": {"scenes": 2, "assets": 0},
    "checksums": {"project": "sha256 hex", "scenes": "…", "assets": "…"}
  },
  "project": { /* dokumen tanpa `scenes` */ },
  "scenes":  [ /* Scene[] */ ],
  "assets":  [ /* {id, sceneId, kind, mimeType, byteSize, dataUrl} — boleh kosong */ ]
}
```

- Checksum SHA-256 dihitung `crypto.subtle` atas JSON kanonik **tiap bagian**; ketiganya
  diperiksa sebelum dokumen digabung dan divalidasi, jadi paket rusak ditolak **sebelum**
  state aktif tersentuh.
- Paket tanpa aset tetap valid (`assets: []` punya checksum sendiri).
- Batas ukuran `MAX_PACKAGE_BYTES` = 8 MB, diperiksa sebelum parsing lanjutan.
- `packageVersion` lebih baru ditolak; `schemaVersion` lebih baru melempar
  `SchemaTooNewError` dan tidak pernah menimpa apa pun.
- Impor selalu menjadi **proyek baru**. Bila ID sudah dipakai, seluruh ID internal
  dipetakan ulang (`cloneProjectDocument`) dan judul diberi sufiks; bila ID bebas, ID
  dipertahankan sehingga roundtrip ekspor→impor menghasilkan dokumen identik.

## 3. Invariant yang dijaga validator

`src/schema.js#validateDocument` menolak dokumen bila salah satu berikut terjadi:

1. `scene.projectId !== project.id` → referensi lintas proyek.
2. `shot.sceneId !== scene.id` → referensi lintas scene.
3. `track.objectId` bukan aktor scene tersebut dan bukan kamera shot tersebut.
4. `camera.targetId` menunjuk aktor yang tidak ada di scene tersebut.
5. `activeSceneId` / `activeShotId` menunjuk entitas yang tidak ada.
6. ID ganda: antar scene, antar shot dalam scene, atau antar objek (aktor dan set berbagi ruang nama dalam satu scene); ID kamera tidak boleh bentrok dengan aktor.
7. Aktor atau kamera tanpa track pose, atau track dengan keyframe kosong/di luar durasi/waktu ganda.
8. `locked` atau `visible` bukan boolean.
9. Pintu di luar dinding, lebih dari dua per ruangan, atau lebih dari satu per dinding.
10. Batas ukuran terlampaui (lihat `LIMITS`): 200 scene, 100 shot/scene, 50 aktor/scene, 30 set/scene, 2400 keyframe/track, nama ≤ 100 karakter, catatan ≤ 2000 karakter, berkas impor ≤ 3 MB.

Validator murni: melempar `Error` berbahasa Indonesia dan tidak pernah menulis ke penyimpanan. Satu-satunya perubahan yang dilakukannya adalah normalisasi default opsional (`normalizeDocument`) dan pengurutan keyframe.

## 4. Scene view — jembatan editor

Editor tidak bekerja langsung pada dokumen. `src/document.js` memproyeksikan satu pasang **scene + shot aktif** menjadi *scene view*:

```text
{ title, duration, actors: [{id,name,color,height,locked,visible,keys}], rooms: [...], camera: {…,keys} | null }
```

- `readSceneView` menghasilkan salinan penuh; memutasinya tidak mengubah dokumen.
- `writeSceneView` menulis kembali **hanya** scene dan shot yang disebut, sehingga scene lain secara struktural tidak mungkin ikut berubah. Field yang tidak diwakili view (nama scene, notes, fps, aspect ratio, `assetRef`) dipertahankan.
- Bentuk view sengaja identik dengan JSON v1 supaya baseline pose Fase 0 dapat diukur dengan fungsi yang sama sebelum dan sesudah migrasi.

Alur satu perubahan kreatif: **mutasi scene view → `flush` ke dokumen → validasi → commit history → simpan**. Navigasi observer, seleksi dan playhead tidak melewati alur ini.

## 5. Strategi waktu keyframe (F1-08)

**Kebijakan R1: waktu keyframe disimpan dalam detik (float), bukan nomor frame.**

| Aturan | Nilai | Alasan |
|---|---|---|
| Satuan penyimpanan | detik (`t`) | Sama dengan JSON v1; migrasi tidak perlu mengubah satu angka pun, sehingga pose sebelum/sesudah migrasi identik bit-per-bit. |
| Grid input editor | 0,1 detik (`putKey` membulatkan `Math.round(t*10)/10`) | Cukup halus untuk blocking, cukup kasar agar drag tidak menghasilkan ribuan keyframe. |
| Toleransi pencocokan | 0,05 detik (`TIME_TOLERANCE`, `keyIndexAt`) | Dua keyframe dianggap sama bila selisih < 0,05 detik; nilai ini setengah grid sehingga tidak pernah menggabungkan dua slot 0,1 detik yang berbeda. |
| `fps` shot | 24 (default migrasi) | Metadata; **belum** dipakai untuk sampling pada R1. Playback R1 memakai waktu wall-clock. |
| Rentang valid | `0 ≤ t ≤ shot.duration` | Keyframe di luar durasi ditolak validator. |

**Kebijakan konversi ke frame pada R2 (F4-03/F4-05, EX-02):**

1. Konversi hanya dilakukan pada **lapisan tampilan dan render**: `frame = round(t × fps)`. Nilai `t` dalam detik tetap menjadi penyimpanan kanonik sampai ada migrasi eksplisit yang disepakati.
2. Bila kelak keyframe benar-benar dipindahkan ke satuan frame, migrasi wajib:
   - mencatat `fps` yang dipakai untuk konversi pada shot;
   - membandingkan pose hasil sampling sebelum dan sesudah pada minimal tiga titik (awal/tengah/akhir) untuk setiap track;
   - **menolak** migrasi bila selisih posisi > 1 mm atau selisih sudut > 0,05° pada titik uji; grid 0,1 detik pada 24/30 fps tidak jatuh tepat pada batas frame, jadi pembulatan diam-diam adalah risiko nyata;
   - menyimpan sisa pembulatan (`t − frame/fps`) atau menaikkan `fps` dokumen, bukan membuang selisihnya.
3. Mengubah `fps` shot **tidak boleh** menggeser waktu keyframe yang sudah ada; hanya penggarisan timeline yang berubah.
4. Ekspor deterministik (EX-02) mengambil sampel pada `t = frame / fps` untuk `frame = 0…duration×fps − 1`, memakai `sampleScene` yang sama dengan preview.

## 6. Versi schema dan kompatibilitas

| Situasi | Perilaku |
|---|---|
| `version: 1` (JSON v1 lama) | Dimigrasikan ke v2: satu proyek, satu scene (`Scene 01`), satu shot (`Shot 01`). Keyframe, focal length, target kamera, kamera `null`, pintu, flag lock/hide dan seluruh nama dipertahankan. Impor v1 tetap didukung tanpa batas waktu. |
| `schemaVersion: 2` | Dibuka apa adanya; ID proyek/scene/shot dipertahankan sehingga menyimpan lalu membuka kembali menghasilkan dokumen identik. |
| `schemaVersion > 2` | Ditolak dengan `SchemaTooNewError`. Dokumen **tidak** dibuka dan **tidak** ditimpa; editor menampilkan pesan agar pengguna memperbarui aplikasi, dan penyimpanan otomatis dinonaktifkan selama sesi tersebut supaya data yang lebih baru tidak hilang. |
| Data tidak terbaca / tidak valid | Dokumen aktif dipertahankan. Salinan mentah sumber disalin ke kunci cadangan `blocking-room.backup` sebelum apa pun ditulis. |

**Copy-first (F1-07).** `openProjectData` meng-clone input, membangun hasil, lalu memvalidasinya. Bila validasi gagal, fungsi melempar dan pemanggil tetap memegang dokumen lamanya — tidak ada penulisan parsial. `EditorSession.run` menambahkan lapisan kedua: bila sebuah command menghasilkan dokumen tidak valid, dokumen dikembalikan ke snapshot valid terakhir.

## 7. Penyimpanan Fase 1

Sementara masih `localStorage` dengan kunci `blocking-room` (isinya kini dokumen v2). `blocking-room.backup` menyimpan salinan mentah terakhir yang gagal dibaca atau yang dimigrasikan. Repository IndexedDB, autosave transaksional, revision recovery dan isolasi antartab adalah Fase 2 (F2-01…F2-09) dan tidak boleh dianggap sudah ada.
