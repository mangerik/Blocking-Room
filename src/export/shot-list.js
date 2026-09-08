// Shot list dan storyboard (F5-06 / EX-03).
//
// Keduanya dihitung dari SNAPSHOT dokumen yang sama dengan yang dirender, bukan
// dari state editor yang sedang berjalan — jadi daftar dan video selalu bercerita
// tentang keadaan yang sama.
//
// Modul ini tidak menyentuh DOM; pemanggil yang mengunduh Blob-nya.

/** Baris shot list untuk seluruh proyek, urut scene lalu urutan shot. */
export function collectShots(doc) {
  const rows = [];
  for (const scene of [...(doc.scenes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    for (const shot of [...(scene.shots ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const fps = shot.fps ?? 24;
      rows.push({
        sceneId: scene.id,
        sceneName: scene.name ?? '',
        shotId: shot.id,
        shotName: shot.name ?? '',
        order: shot.order ?? 0,
        durationSeconds: shot.duration ?? 0,
        fps,
        frames: Math.round((shot.duration ?? 0) * fps),
        aspectRatio: shot.aspectRatio ?? '16:9',
        focalMm: shot.camera?.focal ?? null,
        hasCamera: !!shot.camera,
        actors: (scene.actors ?? []).length,
        notes: shot.notes ?? '',
      });
    }
  }
  return rows;
}

export const SHOT_LIST_COLUMNS = [
  ['sceneName', 'Scene'],
  ['shotName', 'Shot'],
  ['durationSeconds', 'Durasi (detik)'],
  ['fps', 'fps'],
  ['frames', 'Frame'],
  ['aspectRatio', 'Aspect ratio'],
  ['focalMm', 'Lensa (mm)'],
  ['hasCamera', 'Kamera'],
  ['actors', 'Karakter'],
  ['notes', 'Catatan'],
];

/** Escape CSV: kutip ganda, dan bungkus bila ada koma/kutip/baris baru. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'boolean' ? (value ? 'ya' : 'tidak') : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function shotListCsv(rows) {
  const head = SHOT_LIST_COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const body = rows.map(row => SHOT_LIST_COLUMNS.map(([key]) => csvCell(row[key])).join(','));
  // BOM supaya Excel membaca UTF-8 dengan benar; baris CRLF sesuai RFC 4180.
  return `﻿${[head, ...body].join('\r\n')}\r\n`;
}

export function shotListJson(doc, rows = collectShots(doc)) {
  return JSON.stringify({
    project: doc.title ?? '',
    projectId: doc.id ?? null,
    exportedAt: new Date().toISOString(),
    shotCount: rows.length,
    shots: rows,
  }, null, 2);
}

/**
 * Waktu frame awal/tengah/akhir sebuah shot untuk PNG storyboard.
 * Frame akhir adalah frame terakhir yang benar-benar ada (`total − 1`), bukan
 * `duration` — pada `duration` tepat, frame itu sudah di luar rentang render.
 */
export function storyboardFrames({duration, fps}) {
  const total = Math.max(1, Math.round(duration * fps));
  const last = total - 1;
  const middle = Math.floor(last / 2);
  return [
    {label: 'awal', frame: 0, time: 0},
    {label: 'tengah', frame: middle, time: middle / fps},
    {label: 'akhir', frame: last, time: last / fps},
  ];
}
