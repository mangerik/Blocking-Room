# Audit aksesibilitas — F6-04

Tanggal audit: **8 September 2026**. Cakupan: editor (`/`) dan dashboard (`#/`).
Target: **WCAG 2.2 AA pada UI biasa** (PRD §9). Viewport 3D bukan "UI biasa" — lihat §5.

Bukti otomatis: `tests/a11y-browser.mjs` (bagian dari `npm run test:browser`), laporan
mentah `artifacts/a11y-report.json`, tangkapan layar `artifacts/a11y-*-390.png`.

## 1. Cara audit ini dikerjakan (dan batasnya)

Semua angka di dokumen ini **diukur di dalam Chrome sungguhan**, bukan dibaca dari
CSS. Rasio kontras dihitung dari `getComputedStyle().color` dan latar belakang efektif
(menelusuri leluhur dan mencampur warna semi-transparan), memakai rumus WCAG 2.x.
Ukuran target sentuh dari `getBoundingClientRect()` setelah layout selesai.

**Yang TIDAK diuji dan karena itu tidak diklaim:**

| Belum diuji | Konsekuensi |
|---|---|
| Pembaca layar sungguhan (VoiceOver, NVDA, JAWS) | Nama aksesibel terbukti **ada**; bagaimana bunyinya dalam alur nyata belum diuji. |
| Perangkat sentuh nyata | Ukuran target terbukti ≥44 px secara geometri; ergonomi sebenarnya belum diuji. |
| Zoom teks 200% / `prefers-reduced-motion` / mode kontras tinggi OS | Tidak diperiksa sama sekali. |
| Safari / Firefox | Audit hanya Chrome. |
| Pengguna dengan disabilitas | Tidak ada pengujian dengan orang. Ini yang paling penting dan paling absen. |

Karena itu status keseluruhan dokumen ini adalah **"lulus pemeriksaan otomatis yang
dilakukan"**, bukan "memenuhi WCAG 2.2 AA". Klaim kepatuhan penuh memerlukan uji manual
dengan pembaca layar dan pengguna sungguhan.

## 2. Hasil ringkas

| Kriteria (PRD §9) | Editor | Dashboard | Status |
|---|---|---|---|
| Nama aksesibel pada setiap kontrol | 76/76 kontrol bernama | 10/10 kontrol bernama | **Lulus** |
| Focus visible pada setiap kontrol | 0 kontrol tanpa indikator fokus | 0 | **Lulus** |
| Urutan tab wajar, tanpa `tabindex` positif | 0 tabindex positif | 0 | **Lulus** |
| Semua aksi utama punya padanan keyboard | geser, putar, undo, play terbukti | — | **Lulus** |
| Status tidak bergantung warna saja | lock/hidden/simpan punya teks + ikon | — | **Lulus** |
| Tidak ada overflow horizontal pada 390 px | tidak ada | tidak ada | **Lulus** |
| Kontras teks ≥4,5:1 (≥3:1 teks besar) | 0 gagal (dari 56 sebelum perbaikan) | 0 gagal (dari 5) | **Lulus** |
| Touch target inti ≥44 px pada layout sentuh | 10 sisa pada gate R1, **17 sisa pada gate R2** — seluruhnya penanda keyframe (T-01) | 0 sisa | **Lulus sebagian** |

## 3. Temuan yang sudah diperbaiki pada F6-04

### P-01 · Atribut `hidden` tidak berfungsi pada semua tombol (bug nyata)

`button{display:inline-flex}` di stylesheet aplikasi mengalahkan `[hidden]{display:none}`
milik browser (asal cascade menang atas spesifisitas). Akibatnya **setiap tombol dengan
atribut `hidden` tetap terlihat** — termasuk `#download-backup`, yang seharusnya hanya
muncul ketika penyimpanan gagal, sehingga pengguna selalu melihat tombol darurat.
Perbaikan: `button[hidden]{display:none!important}` (`src/style.css`).

### P-02 · Kontras teks: 61 pelanggaran → 0

Palet muted terlalu terang untuk teks kecil. Yang diubah di `src/style.css`
(semua rasio diukur ulang setelah perubahan):

| Token / aturan | Sebelum | Sesudah | Rasio terburuk sesudah |
|---|---|---|---|
| `--muted` (dipakai ±20 tempat) | `#777e72` (3,59–3,98) | `#5f6659` | 5,07 |
| `--accent` (label aktor terpilih, outline fokus) | `#b75c3c` (4,37) | `#a75333` | 5,15 |
| `.primary` (tombol Ekspor, Buka, Proyek baru) | `#b65f40` (4,30) | `#a75333` | 5,15 |
| `.axis-field span` (label X/Y/Z) | `#8d9485` (2,94) | `#5f6659` | 5,59 |
| `.ruler` (angka detik timeline) | `#8d9487` (2,94) | `#5f6659` | 5,59 |
| `.scene-thumb i` (nomor scene) | `#7c8574` (3,00) | `#4f5648` | ≥4,5 |
| `.timecode span` (total durasi) | `#8a9182` (3,06) | `#5f6659` | 5,59 |
| `.live-dot` | `#7f8b72` (3,38) | `#59654f` | 5,61 |
| `.viewport-hint` + `kbd` | `#71796b` (3,88) | `#565e50` | ≥4,5 |
| `label.field` | `#747b6f` (4,11) | `#5f6659` | 5,59 |
| `.delete-btn` | `#96715e` (4,10) | `#835b48` | 5,56 |
| `.saved` (status simpan) | `#69765e` (4,38) | `#59654f` | 5,61 |
| `.crumb-sep`, pemisah eyebrow scene | `#b0b5a7` (1,90) | `#5f6659` | 5,40 |
| Ikon status `.object .eye`, `.locked`, tombol hapus | 2,9–3,4 | `#5f6659` / `#8f4527` / `#835b48` | ≥4,5 |

Kontras terendah yang tersisa di editor sekarang **4,55:1** (`#add-key`), di dashboard
**4,66:1**. Perubahan ini menggelapkan teks sekunder; identitas visual (warna dasar,
tipografi, tata letak) tidak diubah.

### P-03 · Target sentuh pada layout ≤540 px: 57 → 10

Ditambahkan blok `@media(max-width:540px)` di `src/style.css`. Yang dinaikkan ke ≥44 px:
tombol header (dengan header dibuat boleh membungkus — memaksa delapan tombol 44 px pada
satu baris 390 px justru menghasilkan overflow horizontal yang dilarang PRD), tab jenis
objek, opsi tampilan + tombol dinding, tool vertikal, transport (rewind/play/record),
input durasi, seluruh input/select/tombol inspector, slider scrub, tombol "Edit final
view", tombol panel riwayat & metrik, judul proyek, tombol panduan, dan tombol pilih objek
(panel kiri dilebarkan 135 → 158 px agar lebarnya sendiri ≥44 px).

Pilihan warna tetap terlihat 22 px tetapi memiliki area sentuh 44 px
(`padding:11px; background-clip:content-box`) — area sentuh boleh lebih besar dari
tampilannya, sebaliknya tidak boleh.

**Layout desktop tidak diubah**: 55 kontrol masih <44 px pada 1440 px, dan itu memang
disengaja — 44 px adalah target sentuh PRD untuk **layout sentuh**, sedangkan ambang WCAG
2.2 AA "Target Size (Minimum)" adalah 24 px. Kontrol desktop yang masih di bawah 24 px
hanya tiga jenis: penanda keyframe 10 × 10 px (posisi/pose) dan 7 × 7 px (orientasi) —
T-01 — pilihan warna 22 × 22 px dan tombol
"Edit final view" setinggi 22 px (T-02). Seluruh kontrol dashboard pada desktop ≥36 px.

## 4. Temuan yang BELUM lulus

### T-01 · Penanda keyframe di timeline berukuran 10 × 10 px

**Status: belum lulus, disengaja, ada padanan.** Penanda keyframe (`.key`) harus presisi
terhadap posisi waktu; membesarkannya menjadi 44 px pada lane setinggi 19 px akan membuat
keyframe yang berdekatan saling menutupi dan mustahil dipilih. Ini melanggar target sentuh
44 px PRD dan juga di bawah 24 px WCAG 2.2 AA.

Padanan yang sudah ada: setiap penanda adalah `<button>` dengan `aria-label`
("Keyframe Alex 5 detik"), dapat dicapai **Tab** dan diaktifkan **Enter/Space**; menambah
dan menghapus keyframe tersedia sebagai tombol besar di inspector ("Simpan keyframe di
X.Xs" / "Hapus keyframe"); playhead dapat digeser dengan slider `#scrub` yang tingginya
44 px pada layout sentuh.

**Pembaruan gate R2 (8 September 2026).** TL-01 sudah mendarat (zoom/pan, multi-select,
snapping ke frame), tetapi temuan ini **tetap terbuka dan jumlahnya naik dari 10 menjadi
17** pada 390 px. Penyebabnya schema v3: setiap aktor kini punya dua lane (posisi dan
orientasi), dan penanda orientasi digambar sebagai lingkaran berongga 7 × 7 px — lebih
kecil daripada penanda posisi 10 × 10 px. Pembedaan posisi vs orientasi memakai **bentuk**,
bukan warna, sehingga tidak bergantung pada persepsi warna.

Perbaikan yang benar tetap bukan memperbesar penanda pada lane setinggi 19 px, melainkan
desain ulang lane timeline (mis. mode “edit keyframe” dengan lane yang lebih tinggi dan
penanda yang dapat disentuh). Sampai itu ada, temuan ini tidak boleh diklaim lulus.
Dicatat juga sebagai `docs/GATE-R2.md` C-01.

### T-02 · Pilihan warna dan "Edit final view" di bawah 24 px pada desktop

Pilihan warna inspector 22 × 22 px dan tombol "Edit final view" setinggi 22 px berada di
bawah ambang 24 px WCAG 2.2 AA. Pada layout sentuh (≤540 px) keduanya sudah ≥44 px.
Perbaikan murah tersedia (memberi padding yang sama pada desktop), tetapi mengubah tata
letak baris warna inspector dan posisi overlay preview; ditunda supaya F6-04 tidak berubah
menjadi pekerjaan desain. Tombol "Edit final view" juga hanya muncul saat hover/fokus,
sehingga ukurannya bukan satu-satunya masalah aksesibilitasnya.

### T-03 · Belum ada uji dengan pembaca layar

Nama aksesibel, `aria-pressed` pada lock/mata, `aria-current` pada scene aktif, dan
`role="status"`/`role="alert"` pada toast/banner sudah ada dan terverifikasi **ada**.
Yang belum: apakah alur "pilih aktor → geser → keyframe tersimpan" benar-benar dapat
diikuti dengan VoiceOver/NVDA. Perubahan dinamis viewport tidak diumumkan sama sekali.

### T-04 · `prefers-reduced-motion` tidak dihormati

Playback, animasi langkah kaki dan transisi tombol berjalan tanpa memeriksa preferensi
gerakan berkurang. Playback adalah inti produk sehingga tidak boleh dimatikan begitu saja,
tetapi transisi UI dan animasi gait pada preview seharusnya menghormati preferensi ini.

### T-05 · Zoom teks 200% belum diuji

Banyak ukuran font 8–10 px dengan tinggi kontainer tetap (header 70 px, lane timeline
19 px). Zoom teks besar kemungkinan menyebabkan pemotongan. Tidak diukur.

### T-06 · Viewport 3D tidak punya padanan non-visual

Isi scene hanya dapat dipahami secara visual. Daftar objek, inspector dan timeline
memberikan seluruh **data** dalam bentuk teks (dan seluruh aksi punya padanan keyboard),
tetapi tidak ada deskripsi tekstual atas komposisi ruang. PRD §9 membatasi target WCAG
pada "UI biasa", jadi ini bukan pelanggaran target — tetapi tetap batas nyata produk.

## 5. Padanan keyboard yang terverifikasi

Diuji dengan menekan tombol sungguhan lalu memeriksa perubahan dokumen
(`tests/a11y-browser.mjs`), bukan dari daftar tooltip:

| Aksi | Keyboard | Bukti |
|---|---|---|
| Geser objek terpilih | `G` lalu panah | posisi keyframe berubah |
| Putar karakter | `Q` / `E` | rotasi keyframe berubah |
| Undo / redo | `⌘/Ctrl Z`, `⌘/Ctrl Shift Z` | tombol redo aktif setelah undo |
| Putar / jeda playback | `Space` | playhead maju |
| Ganti tool | `O` orbit, `G` geser, `R` putar | mode berubah |
| Pilih objek, scene, keyframe | `Tab` + `Enter` | seluruh kontrol berupa `<button>` |

Urutan tab editor dari awal halaman: breadcrumb → tombol header → judul proyek → daftar
scene → aksi scene → tab objek → daftar objek → inspector → timeline. Tidak ada perangkap
fokus dan tidak ada `tabindex` positif.

## 6. Status non-warna

| Status | Penanda selain warna |
|---|---|
| Terkunci | ikon gembok tertutup/terbuka, `aria-pressed`, `aria-label` "Kunci/Buka kunci <nama>", pemberitahuan teks di inspector, tombol hapus dinonaktifkan |
| Tersembunyi | ikon mata tercoret, `aria-pressed`, `aria-label` "Tampilkan/Sembunyikan <nama>", kelas `.is-hidden` yang meredupkan baris, pemberitahuan teks di inspector |
| Status simpan | teks penuh ("Tersimpan lokal" / "Menyimpan…" / "Gagal menyimpan"), `data-state`, plus tombol unduh cadangan yang muncul saat gagal |
| Tab lain sedang menulis | banner teks dengan `role="alert"` dan dua tombol pilihan |
| Konteks 3D terputus | panel teks dengan `role="alert"` + tombol pulihkan |
| Scene aktif | `aria-current="true"` selain penanda visual |

## 7. Cara menjalankan ulang

```bash
npm run dev -- --port 5174 --strictPort   # di background
node tests/a11y-browser.mjs               # bagian dari npm run test:browser
```

Skrip menuliskan seluruh temuan (termasuk yang lulus) ke `artifacts/a11y-report.json`
dan hanya meng-assert kriteria yang sudah diperbaiki, sehingga temuan yang belum lulus
tidak tersembunyi di balik hasil "PASS".
