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
import {capabilities} from './capabilities.js';
import {readFlag} from './flags.js';
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

// F6-07: dashboard berada di balik feature flag selama pilot (PRD §14). Bila flag
// dimatikan, rute dashboard dialihkan ke editor proyek terakhir; data tidak diubah
// sama sekali, jadi menyalakan flag kembali memunculkan seluruh daftar proyek.
const dashboardEnabled = readFlag('dashboard');
// URL harus jujur: bila dashboard dimatikan, hash rute dashboard dibuang supaya
// pengguna tidak melihat `#/` sementara yang tampil adalah editor.
if (route.name === 'dashboard' && !dashboardEnabled) {
  history.replaceState(null, '', location.pathname + location.search);
}

if (route.name === 'dashboard' && dashboardEnabled) {
  const {mountDashboard} = await import('./dashboard.js');
  await mountDashboard({route: route.view});
} else if (!capabilities().webgl) {
  // F6-05: tanpa WebGL2 editor tidak dapat dibuka. Router memutuskan lebih dahulu
  // supaya Three.js tidak pernah diunduh dan `new WebGLRenderer()` tidak melempar
  // error mentah ke layar kosong. Dashboard dan ekspor JSON tetap bisa dipakai.
  if (route.projectId) setActiveProjectId(route.projectId);
  const {mountNoWebGL} = await import('./no-webgl.js');
  await mountNoWebGL({projectId: route.projectId ?? null});
} else {
  // Editor: `blocking-room.activeProject` adalah kontrak yang sudah dipakai bootstrap.
  if (route.projectId) setActiveProjectId(route.projectId);
  await import('./main.js');
}
