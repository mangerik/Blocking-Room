// SessionState (F2-06) — scene/shot terakhir, playhead, seleksi dan pose observer.
//
// Ini UI state, bukan perubahan kreatif: tidak pernah masuk history dan tidak pernah
// ikut ke dalam dokumen. Penulisan di-throttle (bukan debounce) supaya menggeser
// playhead atau memutar kamera observer tidak membanjiri IndexedDB.
import {activeScene, activeShot, findScene, findShot} from './document.js';

export const SESSION_THROTTLE_MS = 1000;

const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export class SessionTracker {
  /** @param {{repository:import('./repository.js').ProjectRepository, throttle?:number, now?:()=>number}} options */
  constructor({repository, throttle = SESSION_THROTTLE_MS, now = () => Date.now()} = {}) {
    this.repository = repository;
    this.throttle = throttle;
    this.now = now;
    this.enabled = true;
    this.lastWriteAt = 0;
    this.pending = null;
    this.timer = null;
    this.inflight = null;
    this.lastNavigation = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {clearTimeout(this.timer); this.timer = null; this.pending = null;}
  }

  /**
   * Mencatat state terbaru; penulisan sebenarnya paling cepat setiap `throttle` ms.
   *
   * Pengecualian yang disengaja: perpindahan **navigasi** (scene, shot atau seleksi) ditulis
   * seketika. Yang dilindungi throttle adalah field berfrekuensi tinggi — playhead dan pose
   * observer — bukan tiga field yang menentukan "editor terbuka di mana". Tanpa pengecualian
   * ini, pindah scene lalu reload dalam <1 detik memulihkan scene yang salah (PRD PR-05
   * "scene aktif dipulihkan setelah reload"), karena transaksi IndexedDB yang dimulai pada
   * `pagehide` tidak dijamin commit (lihat `docs/handoff/phase2-report.md` keputusan 5).
   */
  record(state) {
    if (!this.enabled || !this.repository || !state?.projectId) return;
    this.pending = {...state};
    const navigation = `${state.projectId}|${state.sceneId}|${state.shotId}|${state.selectedId ?? ''}`;
    const navigated = this.lastNavigation !== null && this.lastNavigation !== navigation;
    this.lastNavigation = navigation;
    const elapsed = this.now() - this.lastWriteAt;
    if (navigated || elapsed >= this.throttle) {this.write(); return;}
    if (!this.timer) this.timer = setTimeout(() => {this.timer = null; this.write();}, this.throttle - elapsed);
  }

  write() {
    const state = this.pending;
    this.pending = null;
    if (!state) return this.inflight ?? Promise.resolve();
    clearTimeout(this.timer);
    this.timer = null;
    this.lastWriteAt = this.now();
    // Kegagalan session state tidak boleh menggagalkan apa pun: ini hanya kenyamanan.
    this.inflight = this.repository.putSession(state).catch(() => {});
    return this.inflight;
  }

  /** Menunggu penulisan terakhir benar-benar commit (dipakai saat menutup tab dan uji). */
  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    await this.write();
    await this.inflight;
  }
}

/**
 * Memulihkan session state dengan fallback aman.
 * ID scene/shot/seleksi yang sudah dihapus tidak boleh membuat editor gagal dibuka:
 * scene/shot jatuh ke yang aktif di dokumen, seleksi menjadi `null`, playhead
 * dijepit ke durasi shot.
 * @returns {{sceneId:string, shotId:string, selectedId:string|null, playhead:number,
 *            observerPose:object|null, activeTool:string, recovered:boolean}}
 */
export function restoreSession(doc, state) {
  const fallbackScene = activeScene(doc);
  const fallbackShot = activeShot(doc);
  const scene = findScene(doc, state?.sceneId) ?? fallbackScene;
  const shot = findShot(scene, state?.shotId) ?? (scene === fallbackScene ? fallbackShot : scene.shots[0]);
  const ids = new Set([
    ...scene.actors.map(a => a.id),
    ...scene.setObjects.map(o => o.id),
    ...(shot.camera ? [shot.camera.id] : []),
  ]);
  const selectedId = state?.selectedId && ids.has(state.selectedId) ? state.selectedId : null;
  const playhead = Math.min(Math.max(num(state?.playhead), 0), shot.duration);
  const pose = state?.observerPose;
  const observerPose = pose && ['x', 'y', 'z', 'targetX', 'targetY', 'targetZ'].every(k => Number.isFinite(pose[k]))
    ? {...pose} : null;
  const recovered = !!state && (scene.id !== state.sceneId || shot.id !== state.shotId || selectedId !== (state.selectedId ?? null));
  return {
    sceneId: scene.id,
    shotId: shot.id,
    selectedId,
    playhead,
    observerPose,
    activeTool: ['orbit', 'move', 'rotate'].includes(state?.activeTool) ? state.activeTool : 'orbit',
    recovered,
  };
}
