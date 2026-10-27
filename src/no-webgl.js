// Fallback tanpa WebGL (F6-05, PRD §10 "states wajib: no WebGL").
//
// Editor 3D memerlukan WebGL2. Bila tidak tersedia, halaman TIDAK boleh menjadi
// layar kosong atau error mentah: pengguna tetap harus dapat (a) membaca alasannya,
// (b) membuka daftar proyek, dan (c) mengunduh proyeknya sebagai JSON supaya
// pekerjaan tidak terkurung di dalam browser yang tidak didukung.
//
// Modul ini sengaja tidak mengimpor Three.js sama sekali.
import {bootstrapDashboard} from './bootstrap.js';
import {openProjectData} from './migrate.js';
import {capabilities, capabilityWarnings} from './capabilities.js';
import {readFlag} from './flags.js';
import {DASHBOARD_ROUTE} from './routing.js';
import {activeProjectId} from './storage.js';
import {createIcons, Moon, Sun} from 'lucide';
import {currentTheme, toggleTheme} from './theme.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const icon = name => `<i data-lucide="${name}"></i>`;

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Menggambar layar fallback. Mengembalikan objek kait uji.
 * @param {{projectId?:string|null, mount?:HTMLElement}} options
 */
export async function mountNoWebGL({projectId = null, mount = document.querySelector('#app')} = {}) {
  const caps = capabilities();
  const warnings = capabilityWarnings(caps);
  mount.innerHTML = `
<main class="fallback" role="main">
  <h1>Viewport 3D tidak dapat dijalankan di browser ini</h1>
  <p class="fallback-lead">Blocking Room menggambar scene memakai <b>WebGL2</b>. Browser atau perangkat ini
  tidak menyediakannya, jadi editor 3D dimatikan. Data proyek tidak terpengaruh dan tetap tersimpan.</p>
  <ul class="fallback-list">${warnings.map(w => `<li data-warning="${esc(w.id)}" data-level="${esc(w.level)}">${esc(w.message)}</li>`).join('')}</ul>
  <h2>Yang masih bisa dilakukan</h2>
  <ul class="fallback-list">
    <li>Membuka daftar proyek, mengganti nama, menduplikasi dan menghapus proyek.</li>
    <li>Mengunduh proyek sebagai JSON untuk dibuka di perangkat lain.</li>
    <li>Mengimpor kembali JSON tersebut setelah berpindah ke browser yang mendukung WebGL2.</li>
  </ul>
  <div class="fallback-actions">
    <button class="primary" id="fallback-dashboard"${readFlag('dashboard') ? '' : ' hidden'}>Buka daftar proyek</button>
    <button id="fallback-export" disabled>Unduh proyek ini (JSON)</button>
    <button class="ghost" id="fallback-retry">Coba lagi</button>
    <button class="ghost" id="fallback-theme" aria-label="Aktifkan dark mode">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')} <span>Ganti tema</span></button>
  </div>
  <p class="fallback-status" role="status" id="fallback-status">Memeriksa penyimpanan…</p>
  <details class="fallback-details">
    <summary>Rincian kemampuan browser</summary>
    <pre id="fallback-caps">${esc(JSON.stringify(caps, null, 2))}</pre>
  </details>
</main>`;

  const status = message => {document.querySelector('#fallback-status').textContent = message;};
  const renderTheme = () => {
    const dark = currentTheme() === 'dark', button = document.querySelector('#fallback-theme');
    button.innerHTML = `${icon(dark ? 'sun' : 'moon')} <span>${dark ? 'Light mode' : 'Dark mode'}</span>`;
    button.setAttribute('aria-label', dark ? 'Aktifkan light mode' : 'Aktifkan dark mode');
    button.setAttribute('aria-pressed', String(dark));
    createIcons({icons: {Moon, Sun}});
  };
  renderTheme();
  document.querySelector('#fallback-dashboard').onclick = () => {location.hash = DASHBOARD_ROUTE; location.reload();};
  document.querySelector('#fallback-retry').onclick = () => location.reload();
  document.querySelector('#fallback-theme').onclick = () => {toggleTheme(); renderTheme();};

  let document_ = null;
  const {repository, error} = await bootstrapDashboard();
  if (!repository) {
    status(`Penyimpanan lokal tidak dapat dibuka${error ? `: ${error.message}` : '.'} Unduhan JSON tidak tersedia.`);
    return {caps, warnings, document: null};
  }
  try {
    const wanted = projectId ?? activeProjectId();
    const open_ = raw => (raw ? openProjectData(raw).document : null);
    document_ = open_(wanted ? await repository.getDocument(wanted) : null);
    if (!document_) {
      const [newest] = await repository.listProjects();
      document_ = open_(newest ? await repository.getDocument(newest.id) : null);
    }
  } catch (readError) {
    status(`Proyek tidak dapat dibaca: ${readError.message}`);
    return {caps, warnings, document: null};
  }

  if (!document_) {
    status('Belum ada proyek tersimpan di perangkat ini.');
    return {caps, warnings, document: null};
  }
  const button = document.querySelector('#fallback-export');
  button.disabled = false;
  button.onclick = () => {
    download(JSON.stringify(document_, null, 2), `${String(document_.title).replace(/[^a-z0-9 -]/gi, '') || 'proyek'}.json`);
    status('Berkas JSON diunduh.');
  };
  status(`Proyek siap diunduh: ${document_.title} (${document_.scenes.length} scene).`);
  const api = {caps, warnings, document: () => document_};
  window.blockingRoomFallback = api;
  return api;
}
