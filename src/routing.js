// Rute berbasis hash (F3-01). Modul murni agar dapat diuji tanpa DOM.
//
//   #/            daftar proyek
//   #/trash       tempat sampah
//   #/project/ID  editor proyek tertentu
//   selain itu    editor untuk proyek yang terakhir dibuka
const PROJECT_ROUTE = /^#\/project\/([^/?#]+)$/;

export function parseRoute(hash) {
  const value = String(hash ?? '');
  const project = PROJECT_ROUTE.exec(value);
  if (project) return {name: 'editor', projectId: decodeURIComponent(project[1])};
  if (value === '#/trash') return {name: 'dashboard', view: 'trash'};
  if (value === '#/' || value === '#' || value === '#/projects') return {name: 'dashboard', view: 'projects'};
  return {name: 'editor', projectId: null};
}

/** Hash untuk membuka sebuah proyek di editor. */
export const projectRoute = id => `#/project/${encodeURIComponent(id)}`;
export const DASHBOARD_ROUTE = '#/';
export const TRASH_ROUTE = '#/trash';
