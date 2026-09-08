// Dashboard proyek (F3-01 … F3-03, F3-07, F3-08, F3-09).
//
// Dashboard hanya membaca store `projects` (metadata) dan `assets` (thumbnail).
// Store `documents` disentuh HANYA saat sebuah proyek benar-benar dibuka, diduplikasi
// atau diekspor — membuka daftar 100 proyek tidak pernah memuat 100 dokumen.
//
// Rute: `#/` daftar proyek, `#/trash` tempat sampah, `#/project/<id>` editor.
// Perpindahan ke editor memuat ulang halaman supaya kunci writer, autosave dan
// SessionState selalu dimulai dari keadaan yang bersih (lihat src/app.js).
import {createIcons, Box, Plus, Search, Trash2, RotateCcw, Copy, PencilLine, FolderOpen, Download, Film, ArrowLeft, TriangleAlert} from 'lucide';
import {StorageQuotaError, TRASH_RETENTION_DAYS} from './repository.js';
import {bootstrapDashboard} from './bootstrap.js';
import {cloneProjectDocument, emptyDocument} from './document.js';
import {initialProject} from './model.js';
import {openProjectData} from './migrate.js';
import {metrics} from './metrics.js';
import {SchemaTooNewError} from './schema.js';
import {DASHBOARD_ROUTE, TRASH_ROUTE, projectRoute} from './routing.js';
import {setActiveProjectId} from './storage.js';
import {projectWriterStatus} from './tab-lock.js';
import {buildPackage, isPackage, packageFileName, readPackage, MAX_PACKAGE_BYTES} from './package.js';
import {stamp, trashRemaining, uniqueTitle} from './dashboard-support.js';

const icons = {Box, Plus, Search, Trash2, RotateCcw, Copy, PencilLine, FolderOpen, Download, Film, ArrowLeft, TriangleAlert};
const icon = name => `<i data-lucide="${name}"></i>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const TEMPLATES = [
  {id: 'demo', label: 'Scene demo (Pertemuan di galeri)', build: () => openProjectData(initialProject()).document},
  {id: 'empty', label: 'Kosong (tanpa aktor dan lokasi)', build: () => emptyDocument({title: 'Proyek tanpa judul'})},
];

export const SORTS = [
  {id: 'updated', label: 'Terbaru diubah', key: p => p.updatedAt ?? ''},
  {id: 'opened', label: 'Terakhir dibuka', key: p => p.lastOpenedAt ?? ''},
];

const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

const PLACEHOLDER = 'placeholder';

/**
 * Merender dashboard ke dalam `root`.
 * @param {{root:HTMLElement, route?:string, boot?:Function, reload?:Function}} options
 */
export async function mountDashboard({
  root = document.querySelector('#app'),
  route = 'projects',
  boot = bootstrapDashboard,
  navigate = href => {location.hash = href; location.reload();},
} = {}) {
  let repository = null;
  let projects = [];
  let assets = new Map();
  let state = 'loading';
  let fatal = null;
  let query = '';
  let sort = 'updated';
  let view = route === 'trash' ? 'trash' : 'projects';
  let confirmId = null;      // proyek yang menunggu konfirmasi hapus permanen
  let renamingId = null;
  let toastTimer = null;

  root.innerHTML = shell();
  const $ = selector => root.querySelector(selector);
  const refreshIcons = () => createIcons({icons});

  function notify(message) {
    const el = $('#dash-toast');
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {el.textContent = '';}, 5200);
  }

  function shell() {
    return `
<header>
  <div class="header-left">
    <div class="brand"><div class="brand-mark">${icon('box')}</div><div>blocking room<small>A SPACE FOR YOUR NEXT SCENE</small></div></div>
    <div class="header-divider"></div>
    <nav class="breadcrumb" aria-label="Navigasi"><b id="dash-crumb">Semua proyek</b></nav>
  </div>
  <div class="header-actions">
    <button id="dash-import" aria-label="Impor proyek atau paket">${icon('folder-open')}<span class="button-text">Impor</span></button>
    <button id="dash-trash-toggle" aria-label="Buka tempat sampah">${icon('trash-2')}<span class="button-text">Sampah</span></button>
    <button class="primary" id="dash-new" aria-label="Buat proyek baru">${icon('plus')}<span>Proyek baru</span></button>
  </div>
</header>
<main class="dashboard" id="dash-main">
  <section class="dash-bar">
    <div class="dash-search">
      ${icon('search')}
      <input id="dash-query" type="search" placeholder="Cari judul proyek…" aria-label="Cari judul proyek" autocomplete="off"/>
    </div>
    <label class="dash-sort">Urutkan
      <select id="dash-sort" aria-label="Urutan daftar proyek">${SORTS.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
    </label>
  </section>
  <div class="dash-banner" id="dash-banner" role="alert" hidden></div>
  <section class="dash-new-panel" id="dash-new-panel" hidden>
    <label class="field">Judul proyek<input id="dash-new-title" maxlength="100" value="Proyek tanpa judul"/></label>
    <label class="field">Mulai dari
      <select id="dash-new-template">${TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}</select>
    </label>
    <div class="dash-new-actions">
      <button class="primary" id="dash-create">Buat dan buka</button>
      <button id="dash-cancel-new">Batal</button>
    </div>
  </section>
  <section id="dash-list" class="dash-grid" aria-live="polite"></section>
</main>
<input type="file" accept=".json,application/json" id="dash-file" hidden/>
<div class="toast" role="status" id="dash-toast"></div>`;
  }

  // ------------------------------------------------------------------ data

  async function load() {
    state = 'loading';
    render();
    const booted = await boot();
    repository = booted.repository;
    if (!repository) {
      state = 'error';
      fatal = booted.error ?? new Error('Penyimpanan tidak tersedia.');
      render();
      return;
    }
    if (booted.migrated) notify('Proyek lama (schema v1) dimigrasikan ke penyimpanan baru.');
    if (booted.error && !(booted.error instanceof SchemaTooNewError)) notify(`Sebagian data lama tidak terbaca: ${booted.error.message}`);
    try {
      // F3-03: pembersihan trash >30 hari dijalankan saat dashboard dibuka.
      const purged = await repository.purgeExpiredTrash();
      if (purged.length) notify(`${purged.length} proyek di tempat sampah melewati ${TRASH_RETENTION_DAYS} hari dan dihapus permanen.`);
      await refresh();
    } catch (error) {
      state = 'error';
      fatal = error;
      render();
    }
  }

  async function refresh() {
    projects = await repository.listProjects({includeDeleted: true});
    assets = new Map();
    const refs = projects.map(p => p.thumbnailRef).filter(Boolean);
    for (const ref of refs) {
      // Aset hilang (F3-09) tidak boleh menggagalkan daftar: kartu memakai placeholder.
      const asset = await repository.getAsset(ref).catch(() => null);
      assets.set(ref, asset?.dataUrl ?? PLACEHOLDER);
    }
    state = 'ready';
    render();
  }

  const visible = () => {
    const needle = query.trim().toLowerCase();
    const sorter = SORTS.find(s => s.id === sort) ?? SORTS[0];
    return projects
      .filter(p => (view === 'trash' ? !!p.deletedAt : !p.deletedAt))
      .filter(p => !needle || String(p.title).toLowerCase().includes(needle))
      .sort((a, b) => String(sorter.key(b)).localeCompare(String(sorter.key(a))) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  };

  // ------------------------------------------------------------------ render

  function render() {
    const list = $('#dash-list');
    $('#dash-crumb').textContent = view === 'trash' ? 'Tempat sampah' : 'Semua proyek';
    $('#dash-trash-toggle').classList.toggle('active', view === 'trash');
    $('#dash-trash-toggle').setAttribute('aria-pressed', String(view === 'trash'));
    if (state === 'loading') {
      list.innerHTML = `<p class="dash-state" data-state="loading">Memuat daftar proyek…</p>`;
      refreshIcons();
      return;
    }
    if (state === 'error') {
      list.innerHTML = `<div class="dash-state" data-state="error">${icon('triangle-alert')}
        <b>Daftar proyek tidak dapat dibaca.</b>
        <p>${esc(fatal?.message ?? 'Penyimpanan browser tidak tersedia.')}</p>
        <button id="dash-retry">Coba lagi</button></div>`;
      $('#dash-retry').onclick = () => load();
      refreshIcons();
      return;
    }
    const rows = visible();
    if (!rows.length) {
      list.innerHTML = `<div class="dash-state" data-state="empty">
        <b>${view === 'trash' ? 'Tempat sampah kosong.' : query ? 'Tidak ada proyek yang cocok.' : 'Belum ada proyek.'}</b>
        <p>${view === 'trash'
          ? `Proyek yang dihapus disimpan ${TRASH_RETENTION_DAYS} hari sebelum dibersihkan otomatis.`
          : query ? 'Coba kata kunci lain, atau kosongkan pencarian.' : 'Buat proyek kosong atau mulai dari scene demo.'}</p>
        ${view === 'trash' || query ? '' : `<button class="primary" id="dash-empty-new">${icon('plus')} Proyek baru</button>`}</div>`;
      if ($('#dash-empty-new')) $('#dash-empty-new').onclick = () => toggleNewPanel(true);
      refreshIcons();
      return;
    }
    list.innerHTML = rows.map(card).join('');
    wireCards();
    refreshIcons();
  }

  function card(project) {
    const thumb = project.thumbnailRef ? assets.get(project.thumbnailRef) : null;
    const missing = !thumb || thumb === PLACEHOLDER;
    const writer = projectWriterStatus(project.id);
    const busy = writer.present && !writer.stale;
    const scenes = Number(project.sceneCount ?? 0);
    return `<article class="dash-card" data-project="${esc(project.id)}">
      <div class="dash-thumb${missing ? ' is-missing' : ''}">${missing
        ? `<span>${icon('film')}<small>Belum ada pratinjau</small></span>`
        : `<img src="${esc(thumb)}" alt="Pratinjau ${esc(project.title)}" width="320" height="180"/>`}</div>
      <div class="dash-card-body">
        ${renamingId === project.id
          ? `<input class="dash-rename" data-rename-input="${esc(project.id)}" maxlength="100" value="${esc(project.title)}" aria-label="Nama baru proyek"/>`
          : `<h2 title="${esc(project.title)}">${esc(project.title)}</h2>`}
        <p class="dash-meta">${scenes} scene · diubah ${esc(stamp(project.updatedAt))}${project.lastOpenedAt ? ` · dibuka ${esc(stamp(project.lastOpenedAt))}` : ''}</p>
        ${project.deletedAt ? `<p class="dash-meta warn">Di tempat sampah · dibersihkan ${esc(trashRemaining(project.deletedAt))}</p>` : ''}
        ${busy ? `<p class="dash-meta warn">Sedang dibuka di tab lain — tab baru akan baca-saja.</p>` : ''}
      </div>
      <div class="dash-card-actions">${project.deletedAt
        ? `<button data-restore="${esc(project.id)}" aria-label="Pulihkan ${esc(project.title)}">${icon('rotate-ccw')}<span>Pulihkan</span></button>
           ${confirmId === project.id
             ? `<button class="danger" data-purge-confirm="${esc(project.id)}" aria-label="Konfirmasi hapus permanen ${esc(project.title)}">Ya, hapus permanen</button>
                <button data-purge-cancel="${esc(project.id)}" aria-label="Batalkan hapus permanen">Batal</button>`
             : `<button data-purge="${esc(project.id)}" aria-label="Hapus permanen ${esc(project.title)}">${icon('trash-2')}<span>Hapus permanen</span></button>`}`
        : `<button class="primary" data-open="${esc(project.id)}" aria-label="Buka ${esc(project.title)}">Buka</button>
           <button data-rename="${esc(project.id)}" aria-label="Ganti nama ${esc(project.title)}" title="Ganti nama">${icon('pencil-line')}</button>
           <button data-duplicate="${esc(project.id)}" aria-label="Duplikat ${esc(project.title)}" title="Duplikat">${icon('copy')}</button>
           <button data-export="${esc(project.id)}" aria-label="Ekspor paket ${esc(project.title)}" title="Ekspor paket">${icon('download')}</button>
           <button data-delete="${esc(project.id)}" aria-label="Hapus ${esc(project.title)}" title="Pindahkan ke tempat sampah">${icon('trash-2')}</button>`}
      </div>
    </article>`;
  }

  function wireCards() {
    const on = (attribute, handler) => root.querySelectorAll(`[data-${attribute}]`).forEach(button => {
      button.onclick = () => handler(button.dataset[attribute.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]);
    });
    on('open', openProject);
    on('rename', id => {renamingId = id; render(); const input = root.querySelector(`[data-rename-input="${CSS.escape(id)}"]`); input?.focus(); input?.select();});
    on('duplicate', duplicate);
    on('export', exportPackage);
    on('delete', softDelete);
    on('restore', restore);
    on('purge', id => {confirmId = id; render();});
    on('purge-cancel', () => {confirmId = null; render();});
    on('purge-confirm', purge);
    root.querySelectorAll('[data-rename-input]').forEach(input => {
      const commit = () => finishRename(input.dataset.renameInput, input.value);
      input.onblur = commit;
      input.onkeydown = event => {
        if (event.key === 'Enter') {event.preventDefault(); input.blur();}
        if (event.key === 'Escape') {renamingId = null; render();}
      };
    });
  }

  // ------------------------------------------------------------------ aksi

  function fail(error, prefix) {
    if (error instanceof StorageQuotaError) {
      notify(error.message);
      banner(error.message);
      return;
    }
    notify(`${prefix}: ${error.message}`);
  }

  function banner(message) {
    const el = $('#dash-banner');
    el.textContent = message;
    el.hidden = !message;
  }

  async function openProject(id) {
    const meta = projects.find(p => p.id === id);
    if (meta?.deletedAt) {notify('Proyek ini ada di tempat sampah. Pulihkan dahulu sebelum membukanya.'); return;}
    try {await repository.touchProject(id);} catch {/* urutan "terakhir dibuka" bukan data kritis */}
    setActiveProjectId(id);
    navigate(projectRoute(id));
  }

  async function create() {
    const title = ($('#dash-new-title').value || '').trim().slice(0, 100) || 'Proyek tanpa judul';
    const templateId = $('#dash-new-template').value;
    const template = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0];
    try {
      const started = performance.now();
      const doc = template.build();
      doc.title = uniqueTitle(title, projects.map(p => p.title));
      await repository.saveDocument(doc, {revision: true, revisionToken: Date.now()});
      // F6-06: hanya label template dan angka; judul proyek tidak pernah dicatat.
      metrics.record('project_created', {
        storage: 'local', template: template.id === 'demo' ? 'demo' : 'blank',
        duration_ms: Math.round(performance.now() - started), schemaVersion: doc.schemaVersion,
      });
      await openProject(doc.id);
    } catch (error) {fail(error, 'Gagal membuat proyek');}
  }

  async function duplicate(id) {
    try {
      const raw = await repository.getDocument(id);
      if (!raw) {notify('Dokumen proyek tidak ditemukan.'); return;}
      // Dokumen tersimpan boleh saja berasal dari schema lama: duplikasi selalu
      // melewati migrator supaya salinannya lahir sebagai dokumen versi sekarang.
      const doc = openProjectData(raw).document;
      const copy = cloneProjectDocument(doc, {title: uniqueTitle(`${doc.title} (salinan)`.slice(0, 100), projects.map(p => p.title))});
      await repository.saveDocument(copy, {revision: true, revisionToken: Date.now()});
      metrics.record('project_created', {storage: 'local', template: 'duplicate', schemaVersion: copy.schemaVersion});
      await refresh();
      notify(`Salinan dibuat: ${copy.title}.`);
    } catch (error) {fail(error, 'Gagal menduplikasi proyek');}
  }

  async function finishRename(id, value) {
    const title = String(value ?? '').trim().slice(0, 100);
    renamingId = null;
    const current = projects.find(p => p.id === id);
    if (!title || title === current?.title) {render(); return;}
    try {
      await repository.renameProject(id, title);
      await refresh();
      notify('Nama proyek diperbarui.');
    } catch (error) {fail(error, 'Gagal mengganti nama'); render();}
  }

  async function softDelete(id) {
    try {
      await repository.deleteProject(id);
      await refresh();
      notify(`Proyek dipindahkan ke tempat sampah. Dapat dipulihkan dalam ${TRASH_RETENTION_DAYS} hari.`);
    } catch (error) {fail(error, 'Gagal menghapus proyek');}
  }

  async function restore(id) {
    try {
      await repository.restoreProject(id);
      await refresh();
      notify('Proyek dipulihkan dari tempat sampah.');
    } catch (error) {fail(error, 'Gagal memulihkan proyek');}
  }

  async function purge(id) {
    confirmId = null;
    try {
      await repository.deleteProject(id, {permanent: true});
      await refresh();
      notify('Proyek dihapus permanen.');
    } catch (error) {fail(error, 'Gagal menghapus permanen');}
  }

  async function exportPackage(id) {
    try {
      const raw = await repository.getDocument(id);
      if (!raw) {notify('Dokumen proyek tidak ditemukan.'); return;}
      const doc = openProjectData(raw).document;
      const list = await repository.listAssets(id).catch(() => []);
      const pkg = await buildPackage(doc, list);
      download(new Blob([JSON.stringify(pkg, null, 2)], {type: 'application/json'}), packageFileName(doc.title));
      notify('Paket proyek diunduh.');
    } catch (error) {fail(error, 'Gagal mengekspor paket');}
  }

  /**
   * Impor berkas: paket (F3-07) atau JSON v1/v2 telanjang (F3-08).
   * Selalu menjadi proyek BARU — ID dipetakan ulang bila bentrok dan judul diberi
   * sufiks. Berkas rusak ditolak sebelum apa pun ditulis.
   */
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > MAX_PACKAGE_BYTES) throw new Error(`Ukuran berkas ${Math.round(file.size / 1000)} kB melebihi batas ${Math.round(MAX_PACKAGE_BYTES / 1000)} kB.`);
      const text = await file.text();
      const raw = JSON.parse(text);
      let document_ = null;
      let migrated = false;
      let importedAssets = [];
      if (isPackage(raw)) {
        const pack = await readPackage(raw, {rawSize: text.length});
        document_ = pack.document;
        importedAssets = pack.assets;
      } else {
        const opened = openProjectData(raw);
        document_ = opened.document;
        migrated = opened.migrated;
      }
      const taken = new Set(projects.map(p => p.id));
      const titles = projects.map(p => p.title);
      if (taken.has(document_.id)) {
        // Konflik ID: seluruh ID internal dipetakan ulang, nama diberi sufiks.
        document_ = cloneProjectDocument(document_, {title: uniqueTitle(`${document_.title} (impor)`.slice(0, 100), titles)});
        importedAssets = [];
      } else {
        document_.title = uniqueTitle(document_.title, titles);
      }
      await repository.saveDocument(document_, {revision: true, revisionToken: Date.now()});
      metrics.record('project_created', {storage: 'local', template: 'import', schemaVersion: document_.schemaVersion});
      for (const asset of importedAssets) {
        if (!asset?.dataUrl) continue;
        await repository.putThumbnail(document_.id, asset).catch(() => {/* aset opsional */});
      }
      await refresh();
      notify(migrated ? `Proyek JSON v1 diimpor sebagai proyek baru: ${document_.title}.` : `Proyek diimpor: ${document_.title}.`);
    } catch (error) {
      // Impor gagal tidak boleh menyentuh proyek mana pun yang sudah ada.
      notify(error instanceof SchemaTooNewError ? error.message : `Impor ditolak: ${error.message}`);
    }
  }

  function toggleNewPanel(open) {
    $('#dash-new-panel').hidden = !open;
    if (open) {$('#dash-new-title').focus(); $('#dash-new-title').select();}
  }

  // ------------------------------------------------------------------ event

  $('#dash-query').oninput = event => {query = event.target.value; render();};
  $('#dash-sort').onchange = event => {sort = event.target.value; render();};
  $('#dash-new').onclick = () => toggleNewPanel($('#dash-new-panel').hidden);
  $('#dash-cancel-new').onclick = () => toggleNewPanel(false);
  $('#dash-create').onclick = () => create();
  $('#dash-import').onclick = () => $('#dash-file').click();
  $('#dash-file').onchange = async event => {
    await importFile(event.target.files[0]);
    event.target.value = '';
  };
  $('#dash-trash-toggle').onclick = () => {
    view = view === 'trash' ? 'projects' : 'trash';
    confirmId = null;
    history.replaceState(null, '', view === 'trash' ? TRASH_ROUTE : DASHBOARD_ROUTE);
    render();
  };

  await load();

  // Kait uji (tests/dashboard-browser.mjs).
  const api = {
    listProjects: () => repository?.listProjects({includeDeleted: true}) ?? Promise.resolve([]),
    getDocument: id => repository?.getDocument(id) ?? Promise.resolve(null),
    getState: () => state,
    refresh,
    importText: async (name, text) => importFile(new File([text], name, {type: 'application/json'})),
    view: () => view,
  };
  window.blockingRoomDashboard = api;
  return api;
}
