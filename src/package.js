// Paket proyek (F3-07) — satu berkas `.blockingroom.json`.
//
// Format JSON, bukan ZIP: ZIP membutuhkan library kompresi dan proyek ini tidak
// menambah dependency. Struktur tetap "paket": manifest + bagian terpisah, sehingga
// integritas tiap bagian dapat diperiksa sebelum apa pun mengganti state aktif.
//
//   {
//     manifest: {format, packageVersion, schemaVersion, app, createdAt,
//                counts:{scenes,assets}, checksums:{project,scenes,assets}},
//     project:  metadata proyek tanpa scenes,
//     scenes:   [Scene...],
//     assets:   [{id, sceneId, kind, mimeType, byteSize, dataUrl}]  // boleh kosong
//   }
//
// Checksum SHA-256 dihitung dengan `crypto.subtle` atas JSON kanonik tiap bagian.
// Paket tanpa aset tetap valid: checksum dihitung atas array kosong.
import {SCHEMA_VERSION, SchemaTooNewError, validateDocument} from './schema.js';

export const PACKAGE_FORMAT = 'blockingroom.package';
export const PACKAGE_VERSION = 1;
export const PACKAGE_EXTENSION = '.blockingroom.json';
export const APP_NAME = 'blocking-room';
export const APP_VERSION = '1.0.0';
/** Batas ukuran paket yang boleh dibaca. Diperiksa SEBELUM state aktif disentuh. */
export const MAX_PACKAGE_BYTES = 8_000_000;

const clone = value => JSON.parse(JSON.stringify(value));

/** SHA-256 heksadesimal dari sebuah string UTF-8. */
export async function sha256(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Browser ini tidak menyediakan crypto.subtle untuk memeriksa integritas paket.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const canonical = value => JSON.stringify(value ?? null);

/**
 * Membangun paket dari dokumen v2 dan daftar aset (boleh kosong).
 * Dokumen tidak dimutasi.
 */
export async function buildPackage(doc, assets = [], {now = () => new Date().toISOString()} = {}) {
  const source = clone(doc);
  const {scenes, ...project} = source;
  const packedAssets = (assets ?? []).map(a => ({
    id: a.id, sceneId: a.sceneId ?? null, kind: a.kind ?? 'thumbnail',
    mimeType: a.mimeType ?? 'image/jpeg', byteSize: a.byteSize ?? 0, dataUrl: a.dataUrl ?? null,
  }));
  const parts = {project, scenes, assets: packedAssets};
  const checksums = {
    project: await sha256(canonical(parts.project)),
    scenes: await sha256(canonical(parts.scenes)),
    assets: await sha256(canonical(parts.assets)),
  };
  return {
    manifest: {
      format: PACKAGE_FORMAT,
      packageVersion: PACKAGE_VERSION,
      schemaVersion: source.schemaVersion ?? SCHEMA_VERSION,
      app: {name: APP_NAME, version: APP_VERSION},
      createdAt: now(),
      counts: {scenes: scenes.length, assets: packedAssets.length},
      checksums,
    },
    ...parts,
  };
}

/** Apakah data mentah terlihat seperti paket (bukan dokumen v1/v2 telanjang)? */
export const isPackage = input =>
  !!input && typeof input === 'object' && !Array.isArray(input) && input.manifest?.format === PACKAGE_FORMAT;

/**
 * Membaca paket: memeriksa format, versi, ukuran, checksum tiap bagian dan schema
 * dokumen hasil gabungan. Melempar sebelum pemanggil menyentuh state aktif.
 * @returns {Promise<{document:object, assets:object[], manifest:object}>}
 */
export async function readPackage(input, {maxBytes = MAX_PACKAGE_BYTES, rawSize} = {}) {
  if (!isPackage(input)) throw new Error('Berkas ini bukan paket Blocking Room.');
  const manifest = input.manifest;
  if (!Number.isInteger(manifest.packageVersion) || manifest.packageVersion > PACKAGE_VERSION) {
    throw new Error(`Paket memakai format versi ${manifest.packageVersion}; perbarui aplikasi sebelum mengimpornya.`);
  }
  if (Number.isInteger(manifest.schemaVersion) && manifest.schemaVersion > SCHEMA_VERSION) throw new SchemaTooNewError(manifest.schemaVersion);
  const size = rawSize ?? JSON.stringify(input).length;
  if (size > maxBytes) throw new Error(`Ukuran paket ${Math.round(size / 1000)} kB melebihi batas ${Math.round(maxBytes / 1000)} kB.`);
  if (!input.project || typeof input.project !== 'object' || Array.isArray(input.project)) throw new Error('Bagian "project" pada paket tidak valid.');
  if (!Array.isArray(input.scenes)) throw new Error('Bagian "scenes" pada paket tidak valid.');
  const assets = Array.isArray(input.assets) ? input.assets : [];

  const checksums = manifest.checksums ?? {};
  for (const [part, value] of [['project', input.project], ['scenes', input.scenes], ['assets', assets]]) {
    const expected = checksums[part];
    if (typeof expected !== 'string' || !expected) throw new Error(`Paket tidak memiliki checksum untuk bagian "${part}".`);
    const actual = await sha256(canonical(value));
    if (actual !== expected) throw new Error(`Bagian "${part}" pada paket rusak (checksum tidak cocok).`);
  }
  const counts = manifest.counts ?? {};
  if (Number.isInteger(counts.scenes) && counts.scenes !== input.scenes.length) throw new Error('Jumlah scene pada manifest tidak cocok dengan isi paket.');
  if (Number.isInteger(counts.assets) && counts.assets !== assets.length) throw new Error('Jumlah aset pada manifest tidak cocok dengan isi paket.');

  const document = validateDocument(clone({...input.project, scenes: input.scenes}));
  return {document, assets: clone(assets), manifest: clone(manifest)};
}

/** Nama berkas paket yang aman untuk sistem berkas. */
export const packageFileName = title =>
  `${String(title).replace(/[^a-z0-9 -]/gi, '').trim() || 'proyek'}${PACKAGE_EXTENSION}`;
