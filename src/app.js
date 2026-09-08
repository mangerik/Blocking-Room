// Router aplikasi (F3-01).
//
// Rute berbasis hash, tanpa framework:
//   #/            daftar proyek (dashboard)
//   #/trash       tempat sampah
//   #/project/ID  editor untuk proyek tertentu
//   (tanpa hash)  buka kembali proyek terakhir — lihat catatan di bawah
//
// KEPUTUSAN (dicatat di docs/handoff/phase3-report.md): URL tanpa hash membuka
// EDITOR untuk proyek yang terakhir dibuka, bukan dashboard. Alasannya dua:
//   1. "Melanjutkan pekerjaan" (PRD §5) adalah jalur yang paling sering dipakai;
//      pengguna lokal hampir selalu ingin kembali ke proyek yang sedang dikerjakan.
//   2. Suite regresi R0 (`browser-smoke`, `editor-regression`, `walk-doors-delete`,
//      `migration-browser`, `repository-browser`) membuka `http://localhost:5174`
//      tanpa hash dan mengharapkan editor. Menjadikan dashboard layar awal untuk URL
//      polos akan memaksa perubahan asersi di lima berkas uji sekaligus.
// Saat penyimpanan masih kosong, `bootstrap()` membuat proyek demo dan editor
// terbuka di atasnya, persis seperti sebelum Fase 3. Dashboard selalu satu klik
// dari editor (tombol “Semua proyek”) dan memiliki empty state sendiri.
import {parseRoute} from './routing.js';
import {setActiveProjectId} from './storage.js';
import './style.css';

const route = parseRoute(location.hash);

// Navigasi antar-rute selalu memuat ulang halaman (lihat main.js/dashboard.js),
// jadi hashchange hanya perlu menangani tombol maju/mundur browser.
let navigating = false;
window.addEventListener('hashchange', () => {
  if (navigating) return;
  navigating = true;
  location.reload();
});

if (route.name === 'dashboard') {
  const {mountDashboard} = await import('./dashboard.js');
  await mountDashboard({route: route.view});
} else {
  // Editor: `blocking-room.activeProject` adalah kontrak yang sudah dipakai bootstrap.
  if (route.projectId) setActiveProjectId(route.projectId);
  await import('./main.js');
}
