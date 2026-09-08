import { createIcons, Box, FolderOpen, Download, Film, Layers, Plus, CircleHelp, Scan, MousePointer2, Move, Route, Focus, SlidersHorizontal, Video, SkipBack, Play, Pause, Circle, PersonStanding, Cuboid, Eye, Diamond, Minus, Trash2, Undo2, Redo2, LockKeyhole, LockKeyholeOpen, EyeOff, RotateCw, History, LifeBuoy, ArrowLeft, ChevronUp, ChevronDown, Copy, PencilLine, Clapperboard, Activity } from 'lucide';
const icons={Box,FolderOpen,Download,Film,Layers,Plus,CircleHelp,Scan,MousePointer2,Move,Route,Focus,SlidersHorizontal,Video,SkipBack,Play,Pause,Circle,PersonStanding,Cuboid,Eye,Diamond,Minus,Trash2,Undo2,Redo2,LockKeyhole,LockKeyholeOpen,EyeOff,RotateCw,History,LifeBuoy,ArrowLeft,ChevronUp,ChevronDown,Copy,PencilLine,Clapperboard,Activity};
import { initialProject, palette, sample } from './model.js';
import { validDoors, wallCrossings } from './spatial.js';
import { DocumentStore, cloneProjectDocument, addScene, duplicateScene, moveScene, removeScene, renameScene } from './document.js';
import { EditorSession, ReadOnlyError, partitionByLock, describeSkipped } from './commands.js';
import { addShot, duplicateShot, moveShot, removeShot, renameShot, setShotSettings, compareShots } from './shots.js';
import { TimelineWindow, rulerTicks, snapTime, frameOf, lastFrame, formatTimecode, indexAtTime, keyTolerance, moveKeys, copyKeys, pasteKeys, deleteKeys, describeReplaced, MIN_ZOOM, MAX_ZOOM } from './timeline-view.js';
import { exportAsV1, exportAsV2, openProjectData } from './migrate.js';
import { SchemaTooNewError, LIMITS, PROP_SHAPES, INTERPOLATIONS } from './schema.js';
import { clearPendingDocument, setActiveProjectId, writePendingDocument } from './storage.js';
import { DASHBOARD_ROUTE, projectRoute } from './routing.js';
import { bootstrap } from './bootstrap.js';
import { AutosaveController, SAVE_STATUS } from './autosave.js';
import { SessionTracker, restoreSession } from './session-state.js';
import { StorageQuotaError, StorageUnavailableError, requestPersistentStorage } from './repository.js';
import { SceneRenderer } from './scene-renderer.js';
import { capabilities } from './capabilities.js';
import { readFlag } from './flags.js';
import { metrics } from './metrics.js';
import { createExportDialog } from './export/ui.js';
import { buildLabel, buildTitle } from './build-info.js';
import { formatTime, trimTrackToDuration, aspectValue, aspectSize, sampleActor, refreshCombined } from './timeline-engine.js';
import './style.css';
const $=s=>document.querySelector(s),icon=n=>`<i data-lucide="${n}"></i>`,esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Document state (schema v2) dipegang DocumentStore; editor bekerja pada scene view aktif.
// Penyimpanan (Fase 2) ada di IndexedDB lewat ProjectRepository; bootstrap juga
// mengurus migrasi localStorage, kunci writer antartab dan session state.
const stored=await bootstrap({fallbackDocument:()=>openProjectData(initialProject()).document,onLockChange:info=>onLockChange(info)});
const storageBlocked=stored.error instanceof SchemaTooNewError;
const repository=stored.repository;
const store=new DocumentStore(stored.document);
const session=new EditorSession(store);
session.readOnly=stored.readOnly;
const autosave=new AutosaveController({repository,onStatus:(status,detail)=>renderSaveStatus(status,detail)});
const sessionTracker=new SessionTracker({repository});
autosave.setEnabled(!!repository&&!storageBlocked&&!session.readOnly);
sessionTracker.setEnabled(!!repository&&!session.readOnly);
const restored=restoreSession(store.doc,stored.sessionState);
// F3-04/PR-05: scene aktif dipulihkan dari SessionState (fallback aman bila scene hilang).
if(restored.sceneId!==store.sceneId||restored.shotId!==store.shotId){try{store.activate(restored.sceneId,restored.shotId);}catch{/* scene/shot tersimpan sudah tidak ada */}}
let project=store.view;
// UI state: tidak pernah masuk history dan tidak pernah disimpan ke dokumen.
let tab='actors',selected=project.actors[0]?.id||'camera',time=0,playing=false,mode='orbit',view='perspective',walls=true,paths=true,exporting=false,recording=false;
let toastTimer,recordPose=null,recordFrom=0;
// UI state Fase 4: seleksi keyframe, papan salin, snapping, jendela zoom/pan dan
// shot pembanding. Semuanya UI state — tidak pernah masuk dokumen maupun history.
let snapEnabled=true,safeArea=true,keySelection=[],keyClipboard=null,compareWith=null,renamingShot=null,keyDrag=null,panDrag=null;
// F4-08: snap grid penataan set. Default MATI supaya perilaku geser lama tidak berubah
// diam-diam; PRD SC-01 menuntut grid ini dapat dimatikan, jadi ia memang sebuah pilihan.
let gridSnap=false;
// F4-05/TL-02: track mana yang ditulis saat menyimpan keyframe aktor.
let keyTarget='both';
let propShape='box';
const GRID_STEP=0.5;
// Rekaman gerak adalah performance capture yang menerus; menguncinya ke grid akan
// mematahkan langkah kaki, jadi grid sengaja tidak berlaku selama merekam.
const onGrid=value=>(gridSnap&&!recording?Math.round(value/GRID_STEP)*GRID_STEP:value);
/** Besar satu langkah panah: mengikuti grid saat snap aktif, kalau tidak 0,2 m.
 *  Tanpa ini langkah 0,2 m selalu dibulatkan kembali ke titik semula (0,2 < grid/2)
 *  dan objek tidak pernah bergerak sama sekali. */
const nudgeStep=()=>(gridSnap?GRID_STEP:0.2);
const timelineWindow=new TimelineWindow(project.duration);
$('#app').innerHTML=`
<header><div class="header-left"><div class="brand"><div class="brand-mark">${icon('box')}</div><div>blocking room<small>A SPACE FOR YOUR NEXT SCENE</small></div></div><div class="header-divider"></div><nav class="breadcrumb" id="breadcrumb" aria-label="Lokasi proyek"><button class="crumb-link" id="crumb-dashboard">Semua proyek</button><span class="crumb-sep">/</span><b id="crumb-project"></b><span class="crumb-sep">/</span><span id="crumb-scene"></span><span class="crumb-sep">/</span><span id="crumb-shot"></span></nav></div><div class="header-actions"><button class="icon" id="back-dashboard" title="Kembali ke daftar proyek" aria-label="Kembali ke daftar proyek">${icon('arrow-left')}</button><button class="icon" id="undo" title="Undo (⌘/Ctrl Z)" aria-label="Undo" disabled>${icon('undo-2')}</button><button class="icon" id="redo" title="Redo (⌘/Ctrl Shift Z)" aria-label="Redo" disabled>${icon('redo-2')}</button><span class="saved" id="save-status" data-state="idle">Menyiapkan…</span><button class="icon" id="download-backup" title="Unduh cadangan JSON" aria-label="Unduh cadangan JSON" hidden>${icon('life-buoy')}</button><button class="icon" id="revisions" title="Riwayat versi tersimpan" aria-label="Riwayat versi tersimpan">${icon('history')}</button><button class="icon" id="metrics-open" title="Lihat metrik lokal" aria-label="Lihat metrik lokal">${icon('activity')}</button><button id="import">${icon('folder-open')}<span class="button-text">Buka</span></button><button id="save">${icon('download')}<span class="button-text">Simpan proyek</span></button><button class="primary" id="export">${icon('film')}<span>Ekspor video</span></button></div></header>
<div class="project-bar"><div><div class="eyebrow" id="scene-eyebrow"></div><div class="title-line"><input class="project-title-input" aria-label="Judul proyek" id="project-title" maxlength="100" value="${esc(project.title)}"/><span class="badge">PRE-VISUALIZATION</span></div></div><div class="steps"><span class="current"><i>1</i> Tata scene</span><span>—</span><span><i>2</i> Atur gerakan</span><span>—</span><span><i>3</i> Jadikan referensi</span></div></div>
<main class="studio"><aside class="left-panel"><div class="panel-heading">Scene explorer ${icon('layers')}</div><div class="section-caption"><span>SCENE DALAM PROYEK</span><span id="scene-total"></span></div><div class="scene-list" id="scene-list"></div><div class="scene-actions" id="scene-actions" aria-label="Aksi scene aktif"></div><button class="add-object" id="add-scene" aria-label="Tambah scene baru">${icon('plus')} Tambah scene</button><div class="panel-split"></div><div class="section-caption"><span>SHOT DALAM SCENE</span><span id="shot-total"></span></div><div class="shot-list" id="shot-list"></div><div class="scene-actions" id="shot-actions" aria-label="Aksi shot aktif"></div><button class="add-object" id="add-shot" aria-label="Tambah shot baru">${icon('plus')} Tambah shot</button><textarea class="scene-note shot-note" id="shot-notes" rows="2" maxlength="2000" aria-label="Catatan shot aktif" placeholder="Catatan shot ini…"></textarea><div class="shot-compare" id="shot-compare" hidden></div><div class="panel-split"></div><nav class="tabs" aria-label="Jenis objek"><button data-tab="actors" class="active">Karakter</button><button data-tab="rooms">Lokasi</button><button data-tab="props">Props</button><button data-tab="camera">Kamera</button></nav><div class="section-caption"><span id="list-caption">KARAKTER DALAM SCENE</span><span id="object-count"></span></div><div class="object-list" id="objects"></div><div class="prop-add-row" id="prop-add-row" hidden><label class="field">Jenis<select id="prop-shape" aria-label="Jenis props yang ditambahkan"><option value="box">Box</option><option value="table">Meja</option><option value="chair">Kursi</option><option value="decor">Dekorasi</option><option value="wall">Dinding modular</option></select></label></div><button class="add-object" id="add-object" aria-label="Tambah objek ke scene">${icon('plus')} Tambah karakter</button><div class="left-bottom"><div class="eyebrow">DIRECTOR’S NOTE</div><textarea class="scene-note" id="scene-notes" rows="3" maxlength="2000" aria-label="Director’s note scene ini" placeholder="Catatan pengarahan untuk scene ini…"></textarea><div class="legend-row"><i></i><span id="scene-count"></span></div><button class="ghost small" id="help" style="margin:14px 0 0 -7px">${icon('circle-help')} Panduan singkat</button></div></aside>
<section class="workarea" aria-label="Editor scene 3D"><div class="view-toolbar"><span class="view-title">${icon('box')} OBSERVER VIEW</span><div class="view-options"><button class="ghost active" data-view="perspective">Perspektif</button><button class="ghost" data-view="top">Atas</button><button class="ghost" data-view="camera">Kamera / final</button><button class="ghost" id="toggle-walls" title="Dinding transparan">${icon('scan')}<span>Dinding</span></button></div></div><div class="viewport" id="viewport"><div class="scene-labels" id="labels"></div></div><div class="tools-vertical"><button class="active" id="orbit-tool" title="Orbit scene (O)">${icon('mouse-pointer-2')}</button><button id="move-tool" title="Geser objek di lantai (G)">${icon('move')}</button><button id="rotate-tool" title="Putar karakter (R) — drag kiri/kanan">${icon('rotate-cw')}</button><button id="paths-tool" class="active" title="Tampilkan jalur gerakan" aria-label="Tampilkan jalur gerakan">${icon('route')}</button><button id="grid-tool" title="Snap ke grid 0,5 m (mati)" aria-label="Snap ke grid 0,5 m" aria-pressed="false">${icon('scan')}</button><button id="reset-view" title="Reset sudut pandang">${icon('focus')}</button></div><div class="viewport-hint"><kbd>Drag</kbd> Putar tampilan <span>·</span> <kbd>Scroll</kbd> Zoom <span>·</span> <kbd>G</kbd> Geser objek</div><div class="path-warning" id="path-warning" role="status" hidden></div><div class="compass">↗</div><div class="help-panel" hidden><h3>Dari blocking ke film.</h3><p><b>1. Tata scene.</b> Tambah karakter dan ruangan. Pilih objek lalu ubah posisinya di panel kanan.</p><p><b>2. Buat gerakan.</b> Geser playhead ke waktu tujuan, pindahkan objek dengan tool G atau input posisi. Keyframe tersimpan otomatis.</p><p><b>3. Preview & ekspor.</b> Tekan Space untuk memutar. Ekspor merekam sudut pandang Kamera A.</p><p><b>Rotasi:</b> R lalu drag karakter ke kiri/kanan, atau Q/E untuk putar 5°. Panah menggeser tanpa mengubah arah hadap. Semua bekerja di Kamera / final.</p><p><b>Lock & hide:</b> gunakan gembok dan mata di daftar objek. Lokasi terkunci secara default. Item tersembunyi juga tidak tampil di video; kamera hanya menyembunyikan penandanya.</p><p><b>Undo/redo:</b> ⌘/Ctrl Z dan ⌘/Ctrl Shift Z. Satu drag atau rekaman = satu langkah.</p><p><b>Rekam gerak:</b> aktifkan tombol rekam, lalu gunakan panah untuk bergerak dan Q/E untuk berputar.</p><p class="help-build">Versi build: <span class="build-badge" id="build-version" title="${esc(buildTitle())}">${esc(buildLabel())}</span> — sebutkan angka ini saat melaporkan bug.</p><button class="small" id="close-help">Mengerti</button></div><div class="context-banner" id="context-banner" role="alert" hidden><b>Grafik 3D terputus</b><p id="context-banner-text">Browser melepas konteks WebGL (biasanya karena GPU sibuk, driver reset atau tab lama di latar). Data proyek tidak terpengaruh dan tetap tersimpan.</p><button class="primary" id="context-retry">Coba pulihkan tampilan</button></div></section>
<aside class="right-panel"><div class="panel-heading">Camera & properties ${icon('sliders-horizontal')}</div><div class="camera-section"><div class="camera-title"><span>${icon('video')} <b id="camera-name-label">Kamera A</b></span><span class="live-dot">LIVE PREVIEW</span></div><div class="camera-frame" id="camera-preview"><div class="frame-guide"></div><div class="safe-area" id="safe-area"><i class="safe-action"></i><i class="safe-title"></i></div><div id="no-camera" hidden>Belum ada kamera<br><small>Tambah kamera melalui Scene explorer.</small></div><button class="preview-edit" id="edit-camera-view" title="Edit karakter pada sudut pandang kamera">Edit final view ↗</button></div><div class="camera-meta"><span id="lens-label">35 mm · Perspective</span><span id="format-label">16:9 · 24 fps</span><button class="ghost small active" id="toggle-safe" aria-pressed="true" title="Tampilkan safe area (action/title)" aria-label="Tampilkan safe area">Safe area</button></div></div><div class="inspector-title"><span id="inspector-name">Properti karakter</span><span class="eyebrow" id="inspector-kind">ACTOR</span></div><div class="inspector" id="inspector"></div></aside>
<section class="timeline" aria-label="Timeline gerakan"><div class="timeline-head"><div class="transport"><button class="ghost icon small" id="rewind" title="Kembali ke awal">${icon('skip-back')}</button><button class="play" id="play" title="Putar / jeda (Space)">${icon('play')}</button><button class="ghost icon small" id="record" title="Rekam gerakan karakter dengan tombol panah">${icon('circle')}</button><span class="mode-cue" id="mode-cue" data-mode="edit" role="status" aria-live="polite">EDIT · f0</span><div class="timecode"><b id="time-display">00:00.0</b> <span id="total-display">/ 00:12</span></div></div><div class="duration"><span>Durasi</span><input id="duration" type="number" min="1" max="120" value="${project.duration}" aria-label="Durasi scene"/><span>dtk</span><select id="shot-fps" aria-label="fps shot" title="fps shot">${[12,24,25,30,50,60].map(f=>`<option value="${f}">${f} fps</option>`).join('')}</select><select id="shot-aspect" aria-label="Aspect ratio shot" title="Aspect ratio shot">${['16:9','9:16','2.39:1','4:3','1:1'].map(r=>`<option value="${r}">${r}</option>`).join('')}</select></div><div class="timeline-tools"><label class="frame-field"><span>Frame</span><input id="frame-input" type="number" min="0" step="1" value="0" aria-label="Nomor frame playhead"/></label><span class="smpte" id="timecode-display" title="Timecode menit:detik:frame">00:00:00</span><button class="ghost small active" id="snap-toggle" aria-pressed="true" title="Kunci ke frame (snapping)" aria-label="Kunci ke frame (snapping)">Snap</button><button class="ghost small" id="zoom-out" title="Perkecil timeline" aria-label="Perkecil timeline">−</button><span class="zoom-label" id="zoom-label">1×</span><button class="ghost small" id="zoom-in" title="Perbesar timeline" aria-label="Perbesar timeline">+</button><button class="ghost small" id="key-copy" title="Salin keyframe terpilih (Ctrl/⌘ C)" aria-label="Salin keyframe terpilih">Salin</button><button class="ghost small" id="key-paste" title="Tempel keyframe di playhead (Ctrl/⌘ V)" aria-label="Tempel keyframe di playhead">Tempel</button><button class="ghost small" id="key-delete" title="Hapus keyframe terpilih (Delete)" aria-label="Hapus keyframe terpilih">Hapus key</button><span class="key-count" id="key-count" role="status"></span></div></div><div class="timeline-body" id="timeline-body"><div class="ruler" id="ruler"></div><input class="scrub" type="range" min="0" max="${project.duration}" step="0.1" value="0" aria-label="Waktu timeline" id="scrub"/><div id="tracks"></div><div class="playhead" id="playhead"></div></div></section></main><div class="toast" role="status" id="toast"></div>
<div class="tab-banner" id="tab-banner" role="alert" hidden><span id="tab-banner-text"></span><span class="tab-banner-actions"><button class="small" id="open-copy">Buka salinan</button><button class="small" id="take-over">Ambil alih</button></span></div>
<div class="revision-dialog" id="revision-panel" role="dialog" aria-label="Riwayat versi tersimpan" hidden><div class="revision-head"><b>Riwayat versi</b><button class="ghost small" id="close-revisions">Tutup</button></div><div class="revision-list" id="revision-list"></div><button class="small" id="open-last-saved">Buka versi tersimpan terakhir</button><button class="small" id="export-v2">Unduh JSON v2 (build R1)</button><button class="small" id="export-v1">Unduh JSON v1 (build lama)</button><p class="hint">Snapshot dibuat otomatis saat menyimpan. Memulihkan versi menjadi satu langkah undo yang dapat dibatalkan.</p></div>
<div class="metrics-dialog" id="metrics-panel" role="dialog" aria-label="Metrik lokal" hidden><div class="metrics-head"><b>Metrik lokal</b><button class="ghost small" id="metrics-close">Tutup</button></div><p class="hint">Disimpan hanya di perangkat ini. Tidak memuat nama proyek, nama karakter maupun isi scene — lihat <code>src/metrics.js</code>.</p><div class="metrics-actions"><button class="small" id="metrics-export">Ekspor JSON</button><button class="small" id="metrics-clear">Hapus riwayat</button></div><div class="metrics-list" id="metrics-list"></div><label class="metrics-optin"><input type="checkbox" id="metrics-optin"/><span>Izinkan telemetry eksternal bila nanti tersedia. <b>Belum ada pengiriman apa pun</b> — pilihan ini hanya disimpan di perangkat ini.</span></label></div>
<input type="file" accept=".json,application/json" id="file-input" hidden/>`;
const refreshIcons=()=>createIcons({icons});
function notify(message){$('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',3800);}
const SAVE_TEXT={idle:'Tersimpan lokal',saving:'Menyimpan…',saved:'Tersimpan lokal',error:'Gagal menyimpan'};
let statusOverride=null,saveStartedAt=performance.now();
// Status hanya boleh berkata "tersimpan" setelah transaksi IndexedDB commit (F2-04).
function renderSaveStatus(status,detail){
  const el=$('#save-status');if(!el)return;
  // Titipan darurat dibuang segera setelah ada transaksi yang benar-benar commit.
  if(status===SAVE_STATUS.saved)clearPendingDocument();
  const text=statusOverride??SAVE_TEXT[status]??SAVE_TEXT.idle;
  el.textContent=text;el.dataset.state=statusOverride?'error':status;
  $('#download-backup').hidden=!(statusOverride||status==='error');
  if(status===SAVE_STATUS.saved)metrics.record('autosave_completed',{revision:autosave.saveCount,duration_ms:Math.round(performance.now()-saveStartedAt)});
  if(status===SAVE_STATUS.saving)saveStartedAt=performance.now();
  if(status==='error'&&detail?.error){
    metrics.record('autosave_failed',{revision:autosave.saveCount,duration_ms:Math.round(performance.now()-saveStartedAt),
      error_code:detail.quota?'quota':detail.unavailable?'unavailable':detail.error?.name==='ReadOnlyError'?'readonly':'unknown'});
    notify(detail.quota||detail.unavailable?detail.error.message:`Gagal menyimpan: ${detail.error.message} Perubahan masih ada di memori — unduh cadangan.`);
  }
}
function setStatusOverride(text){statusOverride=text;renderSaveStatus(autosave.status);}
// Satu-satunya pemicu penyimpanan: autosave dengan coalesce + revision token.
function saveNow(options){
  if(storageBlocked||!repository||session.readOnly)return;
  autosave.schedule(store.doc,options);
}
let lastSessionSignature='';
// SessionState ditulis throttled dan hanya bila benar-benar berubah, supaya memutar
// timeline tidak membanjiri IndexedDB. Ini UI state: bukan langkah undo.
function recordSession(){
  if(!repository||session.readOnly||exporting)return;
  const pose=renderer3d.getObserverPose();
  const signature=`${store.sceneId}|${store.shotId}|${selected}|${time.toFixed(2)}|${mode}|${[pose.x,pose.y,pose.z,pose.targetX,pose.targetY,pose.targetZ].map(n=>n.toFixed(2)).join(',')}`;
  if(signature===lastSessionSignature)return;
  lastSessionSignature=signature;
  sessionTracker.record({projectId:store.doc.id,sceneId:store.sceneId,shotId:store.shotId,
    selectedId:selected,playhead:time,observerPose:pose,activeTool:mode});
}
// Satu-satunya jalur penyimpanan: scene view → dokumen v2 → validasi → history → storage.
function persist(track=true){
  // Tab baca-saja: perubahan apa pun dibatalkan di lapisan command, bukan hanya di UI.
  if(session.readOnly){project=store.load(session.lastValidDocument());notify('Tab ini baca-saja. Pilih “Buka salinan” atau “Ambil alih” pada banner.');updateHistoryUI();rebuild();return false;}
  if(track){
    try{session.commit();}
    catch(err){project=store.load(session.lastValidDocument());notify(err instanceof ReadOnlyError?err.message:`Perubahan ditolak: ${err.message}`);saveNow();updateHistoryUI();rebuild();return false;}
  }else store.flush();
  saveNow();scheduleThumbnail();updateHistoryUI();return true;
}
function updateHistoryUI(){
  $('#undo').disabled=exporting||recording||session.readOnly||!session.canUndo;
  $('#redo').disabled=exporting||recording||session.readOnly||!session.canRedo;
}
function restoreHistory(direction){
  if(exporting||recording||drag||session.readOnly)return;
  pause();finishKeyboardGesture();
  const next=session[direction]();if(!next)return;
  metrics.record('history_used',{direction,depth:session.history.entries.length});
  project=next;time=Math.min(time,project.duration);
  if(![...project.actors,...project.rooms,...setPieces(),project.camera].filter(Boolean).some(o=>o.id===selected))selected=project.actors[0]?.id||'camera';
  tab=kind();$('#project-title').value=project.title;
  persist(false);syncCameraUI();if(!project.camera&&view==='camera')resetView();renderTabs();rebuild();
}
function editable(o=objectData()){return !exporting&&o&&!o.locked&&o.visible!==false;}
// ---------- F4-03: grid waktu editor adalah grid FRAME shot ----------
// Grid lama 0,1 detik tidak dapat hidup berdampingan dengan snapping ke frame: pada
// 24 fps jarak antarframe 0,0417 detik, lebih kecil daripada toleransi lama 0,05 detik.
// `setKey` memakai grid frame shot dan toleransi setengah frame. Fungsi lama pada
// `src/model.js` sengaja dibiarkan apa adanya karena ia bagian dari model v1.
function shotFps(){return store.shot?.fps??24;}
function snapT(t){return snapTime(t,{fps:shotFps(),duration:project.duration,snap:snapEnabled});}
// ---------- F4-05 (TL-02): dua track independen per aktor ----------
// Aktor scene view membawa `position` ({t,x,z}) dan `rotation` ({t,r}) yang berdiri
// sendiri; `actor.keys` gabungan hanyalah CACHE turunan untuk hal-hal yang bekerja
// pada jalur gerak (jalur viewport, langkah kaki, peringatan tembus dinding).
// Kamera tetap memakai satu track `pose` — arah pandang dan posisi kamera adalah
// satu gerak, dan memecahnya tidak diminta TL-02.
const TRACK_LABEL={position:'Posisi',rotation:'Orientasi',pose:'Kamera'};
const INTERPOLATION_LABEL={linear:'Linear',hold:'Hold',ease:'Ease'};
/** ID lane timeline: `<objectId>#<property>` untuk aktor, `<cameraId>` untuk kamera. */
const laneId=(id,property)=>`${id}#${property}`;
const ownerOf=id=>String(id).split('#')[0];
/** Menyegarkan cache `keys` gabungan seluruh aktor scene view. */
function syncKeys(){for(const a of project.actors)refreshCombined(a);}
/** Menulis satu keyframe ke sebuah track (ganti bila waktunya sama). */
function putTrackKey(track,values,time,fps){
  const key={...values,t:time};
  const i=indexAtTime(track.keys,time,fps);
  if(i>=0)track.keys[i]=key;else track.keys.push(key);
  track.keys.sort((a,b)=>a.t-b.t);
}
/**
 * Menyimpan pose sebagai keyframe pada objek `o`.
 * `tracks` menentukan track aktor mana yang ditulis: 'both' | 'position' | 'rotation'.
 * Kamera selalu menulis track pose-nya.
 */
function setKey(o,pose,t,tracks='both'){
  const fps=shotFps(),time=snapT(t);
  if(o.position&&o.rotation){
    if(tracks!=='rotation')putTrackKey(o.position,{x:pose.x,z:pose.z},time,fps);
    if(tracks!=='position')putTrackKey(o.rotation,{r:pose.r},time,fps);
    refreshCombined(o);
  }else putTrackKey(o,{...pose},time,fps);
}
/** Pose objek pada waktu tertentu (aktor memakai dua track, kamera track pose). */
const poseAt=(o,t)=>(o?.position&&o?.rotation?sampleActor(o,t):sample(o.keys,t));
/**
 * "Lane" timeline: pembungkus tipis sebuah track dengan metadata tampilan.
 * Sengaja BUKAN `Object.assign` ke track aslinya — scene view tidak boleh ikut
 * membawa field tampilan. Getter/setter meneruskan tulisan ke track sebenarnya,
 * sehingga operasi keyframe massal (`timeline-view.js`) tetap memutasi dokumen.
 */
function lane(owner,track,property,name){
  return {
    id:property==='pose'?owner.id:laneId(owner.id,property),ownerId:owner.id,property,name,
    color:owner.color,locked:owner.locked,visible:owner.visible,
    get keys(){return track.keys;},set keys(value){track.keys=value;},
    get interpolation(){return track.interpolation??'linear';},set interpolation(value){track.interpolation=value;},
  };
}
const actorLanes=a=>['position','rotation'].map(property=>lane(a,a[property],property,`${a.name} · ${TRACK_LABEL[property]}`));
/** Lane yang memiliki track pada shot aktif (dua per aktor + kamera shot). */
function keyObjects(){
  const lanes=project.actors.flatMap(actorLanes);
  if(project.camera)lanes.push(lane(project.camera,project.camera,'pose',project.camera.name));
  return lanes;
}
const isKeySelected=(id,t)=>keySelection.some(s=>s.id===id&&Math.abs(s.t-t)<keyTolerance(shotFps()));
function toggleKeySelection(id,t){
  const i=keySelection.findIndex(s=>s.id===id&&Math.abs(s.t-t)<keyTolerance(shotFps()));
  if(i>=0)keySelection.splice(i,1);else keySelection.push({id,t});
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
// SceneRenderer memiliki seluruh batas Three.js; main.js hanya memberi scene view dan waktu.
const renderer3d=new SceneRenderer({viewport:$('#viewport'),labelLayer:$('#labels'),povContainer:$('#camera-preview')});
function buildScene(){syncKeys();renderer3d.selected=selected;renderer3d.build(project,time);}
function buildPaths(){syncKeys();renderer3d.buildPaths(project);}
function updateScene(){syncKeys();renderer3d.selected=selected;renderer3d.update(project,time);}
function setView(next){view=next;renderer3d.viewMode=next;}
function resize(){renderer3d.resize();updateTimeUI();}
// F6-05: konteks WebGL dapat hilang kapan saja. Pemulihan membangun ulang scene dari
// dokumen (sumber kebenaran tetap dokumen, bukan isi GPU), jadi tidak ada data yang hilang.
const caps=capabilities();
// F6-07: saat flag dashboard mati, seluruh jalan menuju daftar proyek disembunyikan
// (bukan sekadar dinonaktifkan) supaya pilot benar-benar menguji alur editor tunggal.
const dashboardEnabled=readFlag('dashboard');
if(!dashboardEnabled){$('#back-dashboard').hidden=true;$('#crumb-dashboard').hidden=true;$('#breadcrumb').querySelector('.crumb-sep').hidden=true;}
renderer3d.onContextChange=({lost})=>{
  const banner=$('#context-banner');if(banner)banner.hidden=!lost;
  if(lost){playing=false;notify('Tampilan 3D terputus sementara. Perubahan tetap tersimpan.');return;}
  buildScene();updateScene();renderer3d.resize();notify('Tampilan 3D berhasil dipulihkan.');
};
$('#context-retry').onclick=()=>{if(!renderer3d.restoreContext())location.reload();};
// Ekspor video butuh MediaRecorder + canvas.captureStream. Bila tidak ada, tombolnya
// dinonaktifkan dengan alasan yang terbaca, bukan gagal saat ditekan.
// F5-02: ekspor deterministik memakai WebCodecs; MediaRecorder tinggal fallback
// real-time (F5-05). Tombol hanya mati bila KEDUANYA tidak ada.
if(!caps.videoEncoder&&(!caps.mediaRecorder.supported||!caps.mediaRecorder.preferred)){
  const button=$('#export');
  button.disabled=true;
  button.title='Browser ini tidak mendukung perekaman maupun encoding video. Gunakan Chrome atau Edge.';
  button.setAttribute('aria-label',button.title);
}
new ResizeObserver(resize).observe($('#viewport'));
/** Prop dan dinding modular berbagi satu tab; keduanya objek set ber-ID (F4-07/F4-08). */
function setPieces(){return [...(project.props??[]),...(project.walls??[])];}
function objectData(){return project.actors.find(a=>a.id===selected)||project.rooms.find(r=>r.id===selected)||setPieces().find(o=>o.id===selected)||project.camera;}
function kind(){return project.actors.some(a=>a.id===selected)?'actors':project.rooms.some(r=>r.id===selected)?'rooms':setPieces().some(o=>o.id===selected)?'props':'camera';}
/** Daftar yang ditampilkan pada sebuah tab. */
function tabItems(t=tab){return t==='camera'?(project.camera?[project.camera]:[]):t==='props'?setPieces():project[t];}
function renderList(){
 const items=tabItems();
 $('#objects').innerHTML=items.map(o=>`<div class="object-row ${selected===o.id?'selected':''} ${o.visible===false?'is-hidden':''}"><button class="object" data-select="${esc(o.id)}"><span class="swatch" style="--c:${o.color||'#65775d'}">${icon(tab==='actors'?'person-standing':tab==='rooms'?'cuboid':tab==='props'?(o.type==='wall'?'scan':'box'):'video')}</span><span><strong>${esc(o.name)}</strong><small>${tab==='actors'?`${o.height.toFixed(2)} m · ${o.position.keys.length} posisi / ${o.rotation.keys.length} orientasi`:tab==='rooms'?`${o.w} × ${o.d} m`:tab==='props'?(o.type==='wall'?`dinding ${o.length} m · ${o.height} m`:`${{box:'Box',table:'Meja',chair:'Kursi',decor:'Dekorasi'}[o.shape]??o.shape} · ${o.w} × ${o.d} m`):`${o.focal} mm · ${o.keys.length} keyframe`}</small></span></button><div class="object-actions"><button class="ghost icon ${o.locked?'locked':''}" data-lock="${esc(o.id)}" aria-label="${o.locked?'Buka kunci':'Kunci'} ${esc(o.name)}" title="${o.locked?'Buka kunci':'Kunci'} ${esc(o.name)}" aria-pressed="${!!o.locked}">${icon(o.locked?'lock-keyhole':'lock-keyhole-open')}</button><button class="ghost icon" data-visible="${esc(o.id)}" aria-label="${o.visible===false?'Tampilkan':'Sembunyikan'} ${esc(o.name)}" title="${tab==='camera'?'Tampilkan/sembunyikan penanda kamera':o.visible===false?'Tampilkan di scene dan video':'Sembunyikan dari scene dan video'}" aria-pressed="${o.visible!==false}">${icon(o.visible===false?'eye-off':'eye')}</button><button class="ghost icon" data-delete="${esc(o.id)}" title="Hapus ${esc(o.name)}" aria-label="Hapus ${esc(o.name)}" ${o.locked?'disabled':''}>${icon('trash-2')}</button></div></div>`).join('');
 $('#object-count').textContent=String(items.length).padStart(2,'0');$('#list-caption').textContent={actors:'KARAKTER DALAM SCENE',rooms:'ZONA & RUANGAN',props:'PROPS & DINDING MODULAR',camera:'SCENE CAMERA'}[tab];$('#add-object').hidden=tab==='camera'&&!!project.camera;
 const addLabel=tab==='actors'?'Tambah karakter':tab==='camera'?'Tambah kamera':tab==='props'?`Tambah ${{box:'box',table:'meja',chair:'kursi',decor:'dekorasi',wall:'dinding modular'}[propShape]}`:'Tambah ruangan';
 $('#add-object').innerHTML=icon('plus')+' '+addLabel;$('#add-object').setAttribute('aria-label',addLabel);
 $('#prop-add-row').hidden=tab!=='props';if($('#prop-shape')){$('#prop-shape').value=propShape;$('#prop-shape').onchange=e=>{propShape=e.target.value;renderList();};}
 $('#scene-count').textContent=`${project.rooms.length} lokasi · ${project.actors.length} karakter · ${setPieces().length} props · ${project.camera?1:0} kamera`;
 document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>select(b.dataset.select));
 for(const [attribute,property] of [['lock','locked'],['visible','visible']])document.querySelectorAll(`[data-${attribute}]`).forEach(b=>b.onclick=()=>{
   if(exporting||recording)return;pause();finishKeyboardGesture();const o=items.find(o=>o.id===b.dataset[attribute]);o[property]=!o[property];changed();
 });
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteItem(b.dataset.delete));refreshIcons();
}
$('#inspector').addEventListener('focusin',()=>{if(playing&&!recording&&!exporting){playing=false;$('#play').innerHTML=icon('play');refreshIcons();}});
const field=(label,content)=>`<label class="field">${label}${content}</label>`;
const num=(key,value,min=-100,max=100,step=.1)=>`<input type="number" data-prop="${key}" value="${Math.round(value*100)/100}" min="${min}" max="${max}" step="${step}" aria-label="${key}"/>`;
const axes=(keys,pose)=>`<div class="input-row ${keys.length===2?'two':''}">${keys.map(k=>`<div class="axis-field"><span>${k.toUpperCase()}</span>${num(k,pose[k])}</div>`).join('')}</div>`;
function renderInspector(){const o=objectData();if(!o){$('#inspector-name').textContent='Belum ada kamera';$('#inspector-kind').textContent='CAMERA';$('#inspector').innerHTML='<p class="hint">Kamera telah dihapus. Pilih Tambah kamera untuk membuat kamera baru, atau Undo untuk memulihkannya. Ekspor memerlukan kamera.</p>';return;}const k=kind(),p=o.keys?poseAt(o,time):o;$('#inspector-name').textContent=o.name;$('#inspector-kind').textContent={actors:'CHARACTER',rooms:'LOCATION',camera:'CAMERA A'}[k];let html=(o.locked?'<p class="object-notice">Objek terkunci. Buka gembok di daftar untuk mengedit.</p>':o.visible===false?'<p class="object-notice">Objek tersembunyi. Tampilkan kembali untuk mengedit.</p>':'')+field('Nama',`<input data-prop="name" maxlength="100" value="${esc(o.name)}"/>`);
 if(k==='actors'){html+=field('Warna penanda',`<div class="color-row">${palette.map(c=>`<button class="color-choice ${o.color===c?'chosen':''}" data-color="${c}" style="--c:${c}" title="Warna ${c}" aria-label="Warna ${c}"></button>`).join('')}</div>`)+`<div class="divider"></div>`+field('Posisi di lantai · meter',axes(['x','z'],p))+`<div class="input-row two">${field('Rotasi · derajat',num('r',p.r,-360,360,5))}${field('Tinggi · meter',num('height',o.height,.5,3,.01))}</div><div class="rotation-actions"><button class="small" data-turn="-15">↶ −15°</button><button class="small" data-turn="15">↷ +15°</button><button class="small" id="face-camera">Hadap kamera</button></div><p class="hint">0° → +Z · 90° → +X. Q/E untuk putar; panah untuk geser. Arah hadap tetap saat bergeser.</p>`;}
 if(k==='rooms'){html+=field('Posisi pusat · meter',axes(['x','z'],o))+`<div class="input-row two">${field('Lebar · m',num('w',o.w,1,40))}${field('Panjang · m',num('d',o.d,1,40))}</div>`+field('Tinggi dinding · m',num('h',o.h,1,10))+field('Warna ruangan',`<input type="color" data-prop="color" value="${o.color}"/>`);}
 if(k==='props'&&o.type==='prop'){html+=field('Bentuk',`<select data-prop="shape">${PROP_SHAPES.map(sh=>`<option value="${sh}" ${o.shape===sh?'selected':''}>${{box:'Box',table:'Meja',chair:'Kursi',decor:'Dekorasi'}[sh]}</option>`).join('')}</select>`)
   +field('Posisi di lantai · meter',axes(['x','z'],o))
   +`<div class="input-row two">${field('Tinggi dari lantai · m',num('y',o.y,0,10,.05))}${field('Rotasi · derajat',num('r',o.r,-360,360,5))}</div>`
   +`<div class="input-row">${['w','d','h'].map(key=>field(`${{w:'Lebar',d:'Panjang',h:'Tinggi'}[key]} · m`,num(key,o[key],.05,40,.05))).join('')}</div>`
   +field('Warna',`<input type="color" data-prop="color" value="${o.color}"/>`)
   +`<p class="hint">Props adalah objek ber-ID: transform, lock, hide, duplikasi dan hapus memakai jalur perintah yang sama dengan karakter dan ruangan. Snap grid viewport juga berlaku.</p>`;}
 if(k==='props'&&o.type==='wall'){html+=field('Posisi pusat · meter',axes(['x','z'],o))
   +`<div class="input-row two">${field('Panjang · m',num('length',o.length,.2,40,.1))}${field('Rotasi · derajat',num('r',o.r,-360,360,5))}</div>`
   +`<div class="input-row two">${field('Tinggi · m',num('height',o.height,.2,10,.1))}${field('Tebal · m',num('thickness',o.thickness,.02,2,.02))}</div>`
   +field('Warna',`<input type="color" data-prop="color" value="${o.color}"/>`)
   +`<p class="hint">0° membentang searah +Z, 90° searah +X. Jalur karakter yang menembus segmen ini menjadi <b>peringatan</b>, bukan tabrakan fisik. Pintu ruangan tidak terpengaruh.</p>`;}
 if(k==='camera'){html+=field('Posisi kamera · meter',axes(['x','y','z'],p))+field('Lensa · focal length',`<select data-prop="focal">${[14,18,24,35,50,85,120].map(f=>`<option value="${f}" ${o.focal===f?'selected':''}>${f} mm${f===35?' — Natural':f===24?' — Wide':f===85?' — Portrait':''}</option>`).join('')}</select>`)+field('Arah pandang',`<select data-prop="target"><option value="">Titik manual</option>${project.actors.map(a=>`<option value="${esc(a.id)}" ${o.target===a.id?'selected':''}>Ikuti ${esc(a.name)}</option>`).join('')}</select>`);html+=`<div class="lens-presets" role="group" aria-label="Preset lensa">${[[18,'Wide'],[35,'Normal'],[85,'Tele']].map(([f,l])=>`<button class="small ${o.focal===f?'active':''}" data-lens="${f}" aria-pressed="${o.focal===f}" title="Preset ${l} ${f} mm">${l} · ${f} mm</button>`).join('')}</div>`;
  if(!o.target)html+=field('Titik pandang · X / Y / Z',`<div class="input-row">${['tx','ty','tz'].map(f=>num(f,p[f])).join('')}</div>`);
  html+=`<button class="ghost small" id="focal-key">${icon('diamond')} Keyframe lensa di frame ${frameOf(snapT(time),shotFps())}</button><p class="hint">${o.keys.some(k=>k.focal!==undefined)?`Lensa sudah di-key; nilai aktif ${Math.round(p.focal??o.focal)} mm.`:'Arah pandang “Ikuti karakter” adalah target lock; “Titik manual” memakai keyframe tx/ty/tz.'}</p>`;}
 if(k==='rooms')html+=`<div class="divider"></div><div class="eyebrow">Pintu / bukaan dinding</div><p class="hint">Dinding belakang berada di −Z, dinding kiri di −X. Posisi pintu dihitung dari pusat dinding.</p>${(o.doors||[]).map((d,i)=>`<div class="door-editor"><label class="field">Dinding<select data-door="${i}" data-door-prop="wall"><option value="back" ${d.wall==='back'?'selected':''}>Belakang (−Z)</option><option value="left" ${d.wall==='left'?'selected':''}>Kiri (−X)</option></select></label><div class="input-row">${[['offset','Posisi'],['width','Lebar'],['height','Tinggi']].map(([key,label])=>`<label class="field">${label} · m<input type="number" step="0.1" data-door="${i}" data-door-prop="${key}" value="${d[key]}" aria-label="Pintu ${i+1} ${label}"/></label>`).join('')}</div><button class="ghost small" data-remove-door="${i}">Hapus pintu</button></div>`).join('')}<button class="small" id="add-door" ${(o.doors||[]).length>=2?'disabled':''}>${icon('plus')} Tambah pintu</button><p class="hint">Bukaan selalu terbuka. Arahkan jalur karakter melalui pintu; pintu tidak otomatis mengubah jalur.</p>`;
 if(k==='props')html+=`<button class="ghost small" id="duplicate-object">${icon('copy')} Duplikasi ${o.type==='wall'?'dinding':'props'}</button>`;
 if(k==='actors')html+=`<div class="divider"></div><div class="eyebrow">TRACK KEYFRAME</div><div class="key-target" role="group" aria-label="Track yang ditulis saat menyimpan keyframe">${[['both','Posisi + orientasi'],['position','Posisi saja'],['rotation','Orientasi saja']].map(([value,label])=>`<button class="small ${keyTarget===value?'active':''}" data-key-target="${value}" aria-pressed="${keyTarget===value}">${label}</button>`).join('')}</div><div class="input-row two">${['position','rotation'].map(prop=>field(`Interpolasi ${TRACK_LABEL[prop].toLowerCase()}`,`<select data-interpolation="${prop}">${INTERPOLATIONS.map(i=>`<option value="${i}" ${o[prop].interpolation===i?'selected':''}>${INTERPOLATION_LABEL[i]}</option>`).join('')}</select>`)).join('')}</div><p class="hint">Rotasi selalu mengambil jalur terpendek; putaran penuh &gt;360° belum didukung (D-06).</p>`;
 if(k!=='rooms'&&k!=='props')html+=`<button class="key-btn" id="add-key">${icon('diamond')} Simpan keyframe di ${time.toFixed(1)}s</button><p class="hint">Pindahkan playhead, lalu ubah posisi. Perubahan otomatis menjadi keyframe.</p><button class="ghost small" id="remove-key">${icon('minus')} Hapus keyframe saat ini</button>`;
 html+=`<button class="ghost delete-btn" id="delete-object">${icon('trash-2')} Hapus ${k==='actors'?'karakter':k==='camera'?'kamera':k==='props'?(o.type==='wall'?'dinding':'props'):'ruangan'}</button>`;
 $('#inspector').innerHTML=html;document.querySelectorAll('#inspector input,#inspector select,#inspector button').forEach(el=>el.disabled=!editable(o)||recording);document.querySelectorAll('[data-turn]').forEach(b=>b.onclick=()=>rotateSelected(Number(b.dataset.turn)));if($('#face-camera'))$('#face-camera').onclick=()=>{if(!editable())return;const pose=poseAt(o,time),cam=renderer3d.camera.position;rotateSelected(Math.atan2(cam.x-pose.x,cam.z-pose.z)*180/Math.PI-pose.r);};$('#lens-label').textContent=`${project.camera?.focal||'—'} mm · Perspective`;refreshIcons();
 if($('#add-door')){const room=o;$('#add-door').disabled=!editable(o)||recording||(o.doors||[]).length>=2;
   $('#add-door').onclick=()=>{if(!editable(room))return;const wall=room.doors?.some(d=>d.wall==='back')?'left':'back';const span=wall==='back'?room.w:room.d;const door={wall,offset:0,width:Math.min(1.4,span-.2),height:Math.min(2.2,room.h-.1)};room.doors??=[];room.doors.push(door);if(!validDoors(room)){room.doors.pop();notify('Ruangan terlalu kecil untuk pintu.');return;}changed();};
   document.querySelectorAll('[data-door]').forEach(el=>el.onchange=()=>{if(!editable(room))return;const doors=structuredClone(room.doors),door=doors[Number(el.dataset.door)],key=el.dataset.doorProp;door[key]=key==='wall'?el.value:Number(el.value);if(!validDoors({...room,doors})){notify('Pintu harus berada di dalam dinding; satu pintu per dinding.');renderInspector();return;}room.doors=doors;changed();});
   document.querySelectorAll('[data-remove-door]').forEach(b=>b.onclick=()=>{if(!editable(room))return;room.doors.splice(Number(b.dataset.removeDoor),1);changed();});
 }
 document.querySelectorAll('[data-prop]').forEach(el=>el.onchange=()=>{if(!editable(o)||recording)return;const key=el.dataset.prop;let value=el.type==='number'||key==='focal'?Number(el.value):el.value;if(el.type==='number'&&(!Number.isFinite(value)||value<Number(el.min)||value>Number(el.max))){notify('Nilai di luar rentang yang diperbolehkan.');renderInspector();return;}if(key==='name'){value=value.trim();if(!value){renderInspector();return;}}
 if(k==='rooms'&&['w','d','h'].includes(key)&&!validDoors({...o,[key]:value})){notify('Ukuran baru tidak cukup untuk pintu. Atur pintu dahulu.');renderInspector();return;}if(o.keys&&['x','y','z','r','tx','ty','tz'].includes(key)){setKey(o,{...poseAt(o,time),[key]:value},time,o.position?(key==='r'?'rotation':'position'):'both');}else o[key]=value;persist();metrics.record('editor_command',{command_type:key==='name'?'rename':o.keys&&['x','y','z','r','tx','ty','tz'].includes(key)?'keyframe':'property',source:'inspector',affected_count:1});syncCameraUI();buildScene();renderList();renderTimeline();renderInspector();});
 document.querySelectorAll('[data-lens]').forEach(el=>el.onclick=()=>{if(!editable(o)||recording)return;o.focal=Number(el.dataset.lens);
   // Bila lensa sudah di-key, preset ikut menulis keyframe pada playhead — kalau tidak,
   // nilai hasil sampling akan langsung menutupi pilihan pengguna.
   if(o.keys?.some(k=>k.focal!==undefined))setKey(o,{...sample(o.keys,time),focal:o.focal},time);
   persist();metrics.record('editor_command',{command_type:'camera_preset',source:'inspector',affected_count:1});syncCameraUI();buildScene();rebuild();});
 if($('#focal-key'))$('#focal-key').onclick=()=>{if(!editable(o)||recording)return;
   // Interpolasi memerlukan field yang sama pada semua keyframe; tanpa ini `sample`
   // menghasilkan NaN begitu satu keyframe memiliki `focal` dan yang lain tidak.
   for(const key of o.keys)if(key.focal===undefined)key.focal=o.focal;
   setKey(o,{...sample(o.keys,time),focal:o.focal},time);
   persist();metrics.record('editor_command',{command_type:'focal_key',source:'inspector',affected_count:1});
   notify(`Keyframe lensa ${o.focal} mm disimpan pada frame ${frameOf(snapT(time),shotFps())}.`);rebuild();};
 document.querySelectorAll('[data-color]').forEach(el=>el.onclick=()=>{if(!editable(o)||recording)return;o.color=el.dataset.color;persist();syncCameraUI();buildScene();renderInspector();renderList();renderTimeline();});
 if($('#add-key'))$('#add-key').onclick=()=>{if(!editable(o)||recording)return;setKey(o,poseAt(o,time),time,keyTarget);changed();notify(`Keyframe ${o.position?{both:'posisi + orientasi',position:'posisi',rotation:'orientasi'}[keyTarget]:'kamera'} disimpan pada frame ${frameOf(snapT(time),shotFps())}.`);};
 document.querySelectorAll('[data-key-target]').forEach(b=>b.onclick=()=>{keyTarget=b.dataset.keyTarget;renderInspector();});
 if($('#remove-key'))$('#remove-key').onclick=()=>{if(!editable(o)||recording)return;
   const fps=shotFps(),at=snapT(time);
   const targets=o.position?(keyTarget==='both'?[o.position,o.rotation]:[o[keyTarget]]):[o];
   const hit=targets.filter(track=>indexAtTime(track.keys,at,fps)>=0);
   if(!hit.length){notify('Tidak ada keyframe pada waktu ini.');return;}
   const kept=hit.filter(track=>track.keys.length===1);
   const removable=hit.filter(track=>track.keys.length>1);
   if(!removable.length){notify('Setiap track memerlukan minimal satu keyframe.');return;}
   for(const track of removable)track.keys.splice(indexAtTime(track.keys,at,fps),1);
   if(o.position)refreshCombined(o);
   changed();
   notify(kept.length?'Keyframe dihapus; satu track dipertahankan karena hanya punya satu keyframe.':'Keyframe dihapus.');};
 document.querySelectorAll('[data-interpolation]').forEach(el=>el.onchange=()=>{if(!editable(o)||recording)return;
   const property=el.dataset.interpolation;o[property].interpolation=el.value;refreshCombined(o);
   persist();metrics.record('editor_command',{command_type:'track_interpolation',source:'inspector',affected_count:1});
   notify(`Interpolasi ${TRACK_LABEL[property].toLowerCase()} ${esc(o.name)}: ${INTERPOLATION_LABEL[el.value]}.`);rebuild();buildPaths();updateScene();});
 if($('#duplicate-object')){$('#duplicate-object').disabled=exporting||recording||session.readOnly||!!o.locked;$('#duplicate-object').onclick=()=>duplicateSetPiece(o.id);}
 if($('#delete-object')){$('#delete-object').disabled=exporting||recording||o.locked;$('#delete-object').onclick=()=>deleteItem(o.id);}
}
/** Duplikasi prop atau dinding modular — satu langkah undo, jalur command yang sama. */
function duplicateSetPiece(id){
  if(exporting||recording)return;
  const source=setPieces().find(o=>o.id===id);
  if(!source){notify('Objek tidak ditemukan.');return;}
  // Lock ditegakkan di lapisan command, bukan hanya lewat tombol yang dinonaktifkan:
  // salinan lahir tidak terkunci dan hanya bergeser 0,5 m, sehingga bagi pengguna ia
  // terbaca seperti objek terkunci yang berpindah. Aturan yang sama dengan hapus (ED-02).
  if(source.locked){notify(`${source.name} terkunci. Buka gembok di daftar untuk menduplikasinya.`);return;}
  if(project.rooms.length+setPieces().length>=LIMITS.setObjects){notify(`Maksimal ${LIMITS.setObjects} objek set per scene.`);return;}
  pause();finishKeyboardGesture();
  const copy={...structuredClone(source),id:crypto.randomUUID(),name:`${source.name} (salinan)`.slice(0,100),locked:false};
  copy.x=Math.max(-100,Math.min(100,copy.x+(gridSnap?GRID_STEP:0.5)));
  (source.type==='wall'?project.walls:project.props).push(copy);
  selected=copy.id;tab='props';
  changed();renderTabs();
  metrics.record('editor_command',{command_type:'duplicate_prop',source:'inspector',affected_count:1});
  notify(`${source.name} diduplikasi. Gunakan Undo untuk membatalkan.`);
}
function deleteItem(id){
 if(exporting||recording)return;
 const item=[...project.actors,...project.rooms,...setPieces(),project.camera].filter(Boolean).find(o=>o.id===id);
 if(!item||item.locked){notify('Buka kunci item sebelum menghapusnya.');return;}
 pause();finishKeyboardGesture();
 // F4-02/PRD §11: identitas aktor milik scene, kamera milik shot. Menghapus aktor
 // karena itu menyentuh SETIAP shot. Aturannya eksplisit: kamera terkunci yang
 // mengikuti aktor ini MENOLAK penghapusan; kamera tidak terkunci jatuh ke titik
 // pandang manual dan shot mana saja yang berubah dilaporkan ke pengguna.
 let fallback=[];
 if(project.actors.some(a=>a.id===id)){
   store.flush();
   const shots=store.scene.shots;
   const locked=shots.filter(sh=>sh.camera&&sh.camera.locked&&sh.camera.targetId===id);
   if(locked.length){notify(`Kamera terkunci pada ${locked.map(sh=>sh.name).join(', ')} sedang mengikuti ${item.name}. Buka kunci kamera itu atau pilih arah pandang manual sebelum menghapus.`);return;}
   fallback=shots.filter(sh=>sh.camera&&sh.camera.targetId===id&&sh.id!==store.shotId).map(sh=>sh.name);
 }
 if(id===project.camera?.id){project.camera=null;if(view==='camera')resetView();}
 else {project.actors=project.actors.filter(a=>a.id!==id);project.rooms=project.rooms.filter(r=>r.id!==id);project.props=project.props.filter(o=>o.id!==id);project.walls=project.walls.filter(o=>o.id!==id);if(project.camera?.target===id)project.camera.target='';}
 if(selected===id)selected=(tab==='camera'?project.camera:tabItems()[0])?.id||'camera';
 keySelection=keySelection.filter(sel=>ownerOf(sel.id)!==id);
 changed();renderTabs();
 notify(`${item.name} dihapus.${fallback.length?` Kamera pada ${fallback.join(', ')} kembali ke titik pandang manual.`:''} Gunakan Undo untuk memulihkan.`);
}
function syncCameraUI(){
 const absent=!project.camera;$('#no-camera').hidden=!absent;$('#export').disabled=absent||exporting;$('#edit-camera-view').disabled=absent;
 document.querySelector('[data-view="camera"]').disabled=absent;
 $('.frame-guide').hidden=absent;$('#lens-label').textContent=absent?'Belum ada kamera':`${project.camera.focal} mm · Perspective`;
 // F4-08: dinding modular ikut diperiksa. Tetap PERINGATAN, bukan collision fisik.
 const collisions=project.actors.filter(a=>a.visible!==false).flatMap(a=>wallCrossings(a,project.rooms,project.walls).map(c=>({...c,name:a.name})));
 $('#path-warning').hidden=!collisions.length;$('#path-warning').textContent=collisions.length?`Jalur ${collisions[0].name} melewati ${collisions[0].wall==='segment'?'dinding modular':'dinding'} pada ${collisions[0].t.toFixed(1)}s. Tambahkan pintu, geser dinding, atau atur keyframe.`:'';
}
function rebuild(){syncCameraUI();syncShotUI();buildScene();renderList();renderInspector();renderTimeline();renderScenes();renderShots();renderCompare();renderBreadcrumb();}
function changed(){persist();rebuild();}
function select(id){if(exporting||recording)return;finishKeyboardGesture();selected=id;tab=kind();renderTabs();renderList();renderInspector();updateScene();}
function renderTabs(){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
// ---------- F4-03/F4-04: ruler frame, zoom/pan, seleksi & edit keyframe ----------
const laneLabel=()=>window.innerWidth<=540?70:138;
const laneWidth=()=>Math.max(1,$('#timeline-body').clientWidth-laneLabel()-16);
/** Menggeser jendela agar playhead tetap terlihat; ini UI state, bukan perubahan kreatif. */
function ensureVisible(rerender=true){
  if(timelineWindow.contains(time))return false;
  timelineWindow.start=time-timelineWindow.span*0.35;timelineWindow.clamp();
  if(rerender)renderTimeline();
  return true;
}
function setZoom(zoom,anchor){timelineWindow.setZoom(zoom,anchor);renderTimeline();}
function renderTimeline(){
  const dur=project.duration,fps=shotFps(),win=timelineWindow;
  win.setDuration(dur);
  $('#ruler').innerHTML=rulerTicks(win,fps).map(t=>`<span class="tick" style="left:${(t.fraction*100).toFixed(4)}%">${t.frame}</span>`).join('');
  // F4-05: satu LANE per track. Aktor punya dua (posisi + orientasi) dengan penanda
  // keyframe berbeda bentuk, kamera tetap satu lane pose.
  syncKeys();
  $('#tracks').innerHTML=keyObjects().map(o=>{
    const color=o.color||'#7d8c6d';
    const from=win.fractionOf(o.keys[0].t)*100,to=win.fractionOf(o.keys.at(-1).t)*100;
    const keys=o.keys.filter(k=>win.contains(k.t)).map(k=>`<button class="key ${o.property} ${isKeySelected(o.id,k.t)?'selected':''}" style="left:${(win.fractionOf(k.t)*100).toFixed(4)}%" data-time="${k.t}" data-object="${esc(o.id)}" title="${esc(o.name)} · frame ${frameOf(k.t,fps)}" aria-label="Keyframe ${esc(o.name)} frame ${frameOf(k.t,fps)}"></button>`).join('');
    const interpolation=`<select class="lane-interp" data-lane="${esc(o.id)}" aria-label="Interpolasi track ${esc(o.name)}" title="Interpolasi track ${esc(o.name)}">${INTERPOLATIONS.map(i=>`<option value="${i}" ${(o.interpolation??'linear')===i?'selected':''}>${INTERPOLATION_LABEL[i]}</option>`).join('')}</select>`;
    return `<div class="track track-${o.property}"><div class="track-label" style="--c:${color}"><i></i><span class="track-name">${esc(o.name)}</span>${interpolation}</div><div class="track-lane" style="--c:${color}" data-track="${esc(o.id)}"><div class="track-line" style="left:${Math.max(-5,from)}%;width:${Math.max(0,Math.min(110,to)-Math.max(-5,from))}%"></div>${keys}</div></div>`;
  }).join('');
  document.querySelectorAll('.key').forEach(b=>b.addEventListener('pointerdown',event=>onKeyPointerDown(event,b)));
  document.querySelectorAll('.lane-interp').forEach(el=>{
    el.disabled=exporting||recording||session.readOnly;
    el.onchange=()=>{
      const lane=keyObjects().find(o=>o.id===el.dataset.lane);
      if(!lane)return;
      if(lane.locked||lane.visible===false){notify(`${lane.name} terkunci atau tersembunyi.`);renderTimeline();return;}
      lane.interpolation=el.value;syncKeys();
      persist();metrics.record('editor_command',{command_type:'track_interpolation',source:'timeline',affected_count:1});
      notify(`Interpolasi ${lane.name}: ${INTERPOLATION_LABEL[el.value]}.`);
      rebuild();buildPaths();updateScene();
    };
  });
  $('#scrub').max=dur;$('#duration').value=dur;$('#total-display').textContent=`/ ${formatTime(dur,false)}`;
  $('#zoom-label').textContent=`${win.zoom<1?win.zoom.toFixed(2):Math.round(win.zoom)}×`;
  $('#zoom-in').disabled=exporting||win.zoom>=MAX_ZOOM;$('#zoom-out').disabled=exporting||win.zoom<=MIN_ZOOM;
  $('#frame-input').max=String(lastFrame(dur,fps));
  const count=keySelection.length;
  $('#key-count').textContent=count?`${count} keyframe terpilih`:'';
  for(const [id,active] of [['#key-copy',count>0],['#key-delete',count>0],['#key-paste',!!keyClipboard]])$(id).disabled=exporting||recording||session.readOnly||!active;
  updateTimeUI();
}
/** Cue mode Edit/Play/Record beserta frame aktif (F4-10). */
function updateModeCue(){
  const el=$('#mode-cue');if(!el)return;
  const state=exporting?'export':recording?'record':playing?'play':'edit';
  el.dataset.mode=state;
  el.textContent=`${{edit:'EDIT',play:'PLAY',record:'REKAM',export:'REKAM VIDEO'}[state]} · f${frameOf(time,shotFps())}`;
}
function updateTimeUI(){
  const fps=shotFps();
  $('#time-display').textContent=formatTime(time);
  $('#timecode-display').textContent=formatTimecode(time,fps);
  if(document.activeElement!==$('#frame-input'))$('#frame-input').value=String(frameOf(time,fps));
  $('#scrub').value=time;
  const label=laneLabel(),fraction=timelineWindow.fractionOf(time);
  const head=$('#playhead');
  head.hidden=fraction<-0.001||fraction>1.001;
  head.style.left=`${label+laneWidth()*Math.max(0,Math.min(1,fraction))}px`;
  updateModeCue();
}
/**
 * Satu perubahan keyframe = satu langkah undo. Bila hasilnya tidak lolos validasi,
 * dokumen kembali ke keadaan valid terakhir dan pengguna diberi tahu alasannya.
 */
function runKeyEdit(apply,{commandType='keyframe',affected=1}={}){
  if(exporting||recording)return null;
  if(session.readOnly){notify('Tab ini baca-saja. Pilih “Buka salinan” atau “Ambil alih” pada banner.');return null;}
  const rollback=session.lastValidDocument();
  let result=null;
  try{result=apply();session.commit();}
  catch(err){project=store.load(rollback);keySelection=[];notify(`Perubahan ditolak: ${err.message}`);afterSceneChange();return null;}
  saveNow();scheduleThumbnail();updateHistoryUI();
  metrics.record('editor_command',{command_type:commandType,source:'timeline',affected_count:affected});
  return result;
}
function onKeyPointerDown(event,button){
  if(exporting||recording||event.button!==0)return;
  event.preventDefault();
  const id=button.dataset.object,t=Number(button.dataset.time);
  // Lebar lane diukur SEBELUM render ulang: `renderTimeline()` mengganti isi #tracks,
  // sehingga elemen ini menjadi lepas dari dokumen dan rect-nya menjadi nol.
  const width=Math.max(1,button.closest('.track-lane')?.getBoundingClientRect().width||laneWidth());
  if(event.shiftKey||event.ctrlKey||event.metaKey){toggleKeySelection(id,t);renderTimeline();return;}
  pause();finishKeyboardGesture();
  if(!isKeySelected(id,t))keySelection=[{id,t}];
  time=snapT(t);select(ownerOf(id));ensureVisible(false);updateScene();renderTimeline();renderInspector();
  if(session.readOnly)return;
  const snapshot=new Map(keyObjects().map(o=>[o.id,structuredClone(o.keys)]));
  keyDrag={startX:event.clientX,width,
    origin:keySelection.map(sel=>({...sel})),snapshot,moved:false,replaced:[],skipped:[]};
  window.addEventListener('pointermove',onKeyPointerMove);
  window.addEventListener('pointerup',onKeyPointerUp,{once:true});
  window.addEventListener('pointercancel',onKeyPointerUp,{once:true});
}
function onKeyPointerMove(event){
  const drag=keyDrag;if(!drag)return;
  const dx=event.clientX-drag.startX;
  if(!drag.moved&&Math.abs(dx)<3)return;
  drag.moved=true;
  // Setiap gerakan dihitung ulang dari snapshot awal, jadi pembulatan snapping tidak
  // pernah menumpuk selama drag berlangsung.
  for(const o of keyObjects())if(drag.snapshot.has(o.id))o.keys=structuredClone(drag.snapshot.get(o.id));
  syncKeys();
  const delta=dx/drag.width*timelineWindow.span;
  const result=moveKeys(keyObjects(),drag.origin,delta,{fps:shotFps(),duration:project.duration,snap:snapEnabled});
  drag.replaced=result.replaced;drag.skipped=result.skipped;
  drag.shifted=result.moved.filter(m=>Math.abs(m.delta)>1e-9).reduce((n,m)=>n+m.count,0);
  syncKeys();
  keySelection=result.selection.length?result.selection:drag.origin.map(sel=>({...sel}));
  updateScene();buildPaths();renderTimeline();
}
function onKeyPointerUp(){
  window.removeEventListener('pointermove',onKeyPointerMove);
  const drag=keyDrag;keyDrag=null;
  if(!drag)return;
  if(!drag.moved){renderTimeline();return;}
  if(!runKeyEdit(()=>drag,{commandType:'keyframe_move',affected:drag.origin.length}))return;
  notify(describeKeyResult('digeser',drag.shifted??0,drag.replaced,drag.skipped));
  rebuild();buildPaths();updateScene();
}
/**
 * Pesan operasi keyframe. Jumlah yang benar-benar berubah, keyframe yang diganti dan
 * item yang dilewati karena terkunci selalu ikut disebutkan — tidak ada yang diam-diam.
 */
function describeKeyResult(verb,count,replaced=[],skipped=[]){
  const parts=[count?`${count} keyframe ${verb}`:`Tidak ada keyframe yang ${verb}`];
  if(replaced.length)parts.push(`keyframe lama diganti: ${describeReplaced(replaced)}`);
  if(skipped.length)parts.push(`dilewati: ${describeSkipped(skipped)}`);
  return `${parts.join('; ')}.${count?' Satu langkah undo.':''}`;
}
function copySelectedKeys(){
  if(!keySelection.length){notify('Pilih keyframe di timeline lebih dahulu (klik penandanya; Shift/Ctrl klik untuk banyak).');return;}
  keyClipboard=copyKeys(keyObjects(),keySelection,{fps:shotFps(),cameraId:project.camera?.id??null});
  metrics.record('editor_command',{command_type:'keyframe_copy',source:'timeline',affected_count:keyClipboard?.count??0});
  notify(keyClipboard?`${keyClipboard.count} keyframe disalin. Tempel dengan Ctrl/⌘ V pada posisi playhead.`:'Tidak ada keyframe yang dapat disalin.');
  renderTimeline();
}
function pasteKeysAtPlayhead(){
  if(!keyClipboard){notify('Belum ada keyframe di papan salin.');return;}
  const fps=shotFps();
  const result=runKeyEdit(()=>pasteKeys(keyObjects(),keyClipboard,snapT(time),
    {fps,duration:project.duration,snap:snapEnabled,cameraId:project.camera?.id??null}),
    {commandType:'keyframe_paste',affected:keyClipboard.count});
  if(!result)return;
  syncKeys();keySelection=result.applied.map(a=>({id:a.id,t:a.t}));
  notify(describeKeyResult(`ditempel pada frame ${frameOf(snapT(time),fps)}`,result.applied.length,result.replaced,result.skipped));
  rebuild();buildPaths();updateScene();
}
function deleteSelectedKeys(){
  if(!keySelection.length){notify('Pilih keyframe di timeline lebih dahulu.');return;}
  const picked=keySelection.length;
  const result=runKeyEdit(()=>deleteKeys(keyObjects(),keySelection,{fps:shotFps()}),{commandType:'keyframe_delete',affected:picked});
  if(!result)return;
  syncKeys();keySelection=[];
  const total=result.removed.reduce((n,r)=>n+r.count,0);
  const kept=result.kept.length?` Satu keyframe dipertahankan untuk ${result.kept.map(k=>k.name).join(', ')} — track wajib punya minimal satu keyframe.`:'';
  notify(describeKeyResult('dihapus',total,[],result.skipped)+kept);
  rebuild();buildPaths();updateScene();
}
function pause(){playing=false;updateModeCue();if(recording){recording=false;session.end();$('#record').classList.remove('recording');persist(false);buildPaths();renderTimeline();}$('#play').innerHTML=icon('play');refreshIcons();renderInspector();}
function play(){if(time>=project.duration)time=0;playing=true;$('#play').innerHTML=icon('pause');refreshIcons();updateModeCue();}
function moveSelected(dx,dz){const o=objectData();if(!editable(o))return;
 // Ruangan, prop dan dinding modular adalah objek statis: posisinya properti biasa,
 // bukan keyframe. Aktor dan kamera menulis keyframe pada track POSISI saja —
 // menggeser tidak boleh menyentuh orientasi (PRD §8 "arah gerak ≠ arah hadap").
 if(kind()==='rooms'||kind()==='props'){o.x=Math.max(-100,Math.min(100,onGrid(o.x+dx)));o.z=Math.max(-100,Math.min(100,onGrid(o.z+dz)));buildScene();}
 else{const p=recording?{...recordPose}:poseAt(o,time);p.x=Math.max(-100,Math.min(100,onGrid(p.x+dx)));p.z=Math.max(-100,Math.min(100,onGrid(p.z+dz)));if(recording)recordPose={...p};setKey(o,p,time,o.position?'position':'both');updateScene();buildPaths();}
 if(!recording&&!drag){persist();syncCameraUI();renderTimeline();renderInspector();}}
function rotateSelected(degrees){
 const o=objectData();if(kind()!=='actors'||!editable(o))return;
 const p=recording?{...recordPose}:poseAt(o,time);p.r=((p.r+degrees)%360+360)%360;if(recording)recordPose={...p};setKey(o,p,time,'rotation');updateScene();
 if(!recording&&!drag){persist();renderInspector();renderTimeline();}
}
/** Melangkah tepat satu frame (F4-03): padanan keyboard untuk playhead presisi. */
function stepFrame(delta){
  if(exporting)return;
  const fps=shotFps();
  pause();
  time=Math.max(0,Math.min(project.duration,(frameOf(time,fps)+delta)/fps));
  ensureVisible();updateScene();updateTimeUI();renderInspector();
}
const keysDown=new Set();let keyboardGesture=false;
function finishKeyboardGesture(){keysDown.clear();if(keyboardGesture){keyboardGesture=false;session.end();persist(false);metrics.record('editor_command',{command_type:'move',source:'keyboard',affected_count:1});}}
window.addEventListener('keydown',e=>{
 const input=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);
 if(input||exporting||drag)return;
 if((e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();restoreHistory(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo');return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='c'&&keySelection.length){e.preventDefault();copySelectedKeys();return;}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v'&&keyClipboard){e.preventDefault();pasteKeysAtPlayhead();return;}
 if(['Delete','Backspace'].includes(e.key)&&keySelection.length){e.preventDefault();deleteSelectedKeys();return;}
 if(e.code==='Space'){e.preventDefault();if(!e.repeat)playing?pause():play();return;}
 if(e.key==='Home'||e.key==='End'){e.preventDefault();pause();time=e.key==='Home'?0:project.duration;ensureVisible();updateScene();updateTimeUI();renderInspector();return;}
 if([',','.'].includes(e.key)){e.preventDefault();stepFrame(e.key===','?-1:1);return;}
 if(e.key.toLowerCase()==='g')setMode('move');if(e.key.toLowerCase()==='o')setMode('orbit');if(e.key.toLowerCase()==='r')setMode('rotate');
 if(e.key.startsWith('Arrow')||['q','e'].includes(e.key.toLowerCase())){
   e.preventDefault();
   // Tab baca-saja: ditolak dengan pesan, bukan dengan exception. `session.begin()`
   // melempar ReadOnlyError, dan sebelum perbaikan ini error itu keluar sebagai
   // uncaught error dari handler keydown (ditemukan oleh tests/gate-r1-browser.mjs).
   if(session.readOnly){notify('Tab ini baca-saja. Pilih “Buka salinan” atau “Ambil alih” pada banner.');return;}
   if(!editable())return;
   if(playing&&!recording)pause();
   if(!recording&&!keyboardGesture){session.begin();keyboardGesture=true;}
   keysDown.add(e.key.toLowerCase());
   if(!recording){if(['q','e'].includes(e.key.toLowerCase()))rotateSelected(e.key.toLowerCase()==='q'?-5:5);else{const step=nudgeStep();moveSelected(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);}}
 }
});
window.addEventListener('keyup',e=>{keysDown.delete(e.key.toLowerCase());if(!keysDown.size)finishKeyboardGesture();});
window.addEventListener('blur',()=>{finishKeyboardGesture();endDrag();if(recording)pause();});
function setMode(m){mode=m;for(const t of ['orbit','move','rotate'])$(`#${t}-tool`).classList.toggle('active',m===t);renderer3d.canvas.style.cursor=m==='orbit'?'grab':m==='rotate'?'ew-resize':'crosshair';renderer3d.controls.enabled=m==='orbit'&&view!=='camera';$('.viewport-hint').innerHTML=m==='rotate'?'<kbd>Drag</kbd> Putar karakter <span>·</span> <kbd>Q / E</kbd> −5° / +5°':m==='move'?'<kbd>Drag</kbd> Geser karakter · Pilih lokasi dahulu untuk menggesernya <span>·</span> <kbd>O</kbd> Orbit':'<kbd>Drag</kbd> Putar tampilan <span>·</span> <kbd>G</kbd> Geser <span>·</span> <kbd>R</kbd> Putar karakter';}
let drag=null,down=null;
// ED-05 "picking aman": objek SET (ruangan, props, dinding modular) hanya menjadi
// target transform setelah dipilih eksplisit. Tanpa aturan ini, drag pada karakter
// dapat menyambar set dressing yang kebetulan berada di bawah pointer.
const hitId=e=>renderer3d.hitId(e,{mode,roomIds:[...project.rooms.map(r=>r.id),...setPieces().map(o=>o.id)]});
renderer3d.canvas.addEventListener('pointerdown',e=>{
 if(exporting||e.button!==0)return;down={x:e.clientX,y:e.clientY};
 if(mode==='orbit')return;
 const id=hitId(e);if(!id)return;
 if(recording&&id!==selected)return;
 if(!recording){pause();select(id);}if(!editable()||(mode==='rotate'&&kind()!=='actors'))return;
 // Alasan sama seperti pada handler keydown: gestur pointer di tab baca-saja ditolak
 // dengan pesan, bukan dengan ReadOnlyError yang tidak tertangkap.
 if(session.readOnly){notify('Tab ini baca-saja. Pilih “Buka salinan” atau “Ambil alih” pada banner.');return;}
 const p=renderer3d.floorPoint(e);
 if(mode==='rotate'||p){const o=objectData(),pose=o.keys?poseAt(o,time):o;
   if(!recording)session.begin();
   drag={id:selected,mode,offsetX:p?pose.x-p.x:0,offsetZ:p?pose.z-p.z:0,lastX:e.clientX};renderer3d.canvas.setPointerCapture(e.pointerId);
 }
});
renderer3d.canvas.addEventListener('pointermove',e=>{
 if(!drag||exporting||drag.id!==selected)return;
 if(drag.mode==='rotate'){rotateSelected((e.clientX-drag.lastX)*.6);drag.lastX=e.clientX;return;}
 const p=renderer3d.floorPoint(e);if(!p)return;
 const o=objectData(),pose=o.keys?poseAt(o,time):o;moveSelected(p.x+drag.offsetX-pose.x,p.z+drag.offsetZ-pose.z);
});
function endDrag(){if(drag&&!recording){session.end();persist(false);syncCameraUI();renderInspector();renderTimeline();metrics.record('editor_command',{command_type:drag.mode==='rotate'?'rotate':'move',source:'pointer',affected_count:1});}drag=null;down=null;}
renderer3d.canvas.addEventListener('pointerup',e=>{if(!drag&&mode==='orbit'&&down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<4){const id=hitId(e);if(id)select(id);}endDrag();});renderer3d.canvas.addEventListener('pointercancel',endDrag);
function resetView(top=false){renderer3d.resetView(top);setView(renderer3d.viewMode);setMode(mode);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(exporting||recording)return;finishKeyboardGesture();tab=b.dataset.tab;selected=(tab==='camera'?project.camera:tabItems()[0])?.id||'camera';renderTabs();renderList();renderInspector();updateScene();});
$('#add-object').onclick=()=>{if(exporting||recording)return;const id=crypto.randomUUID();if(tab==='camera'){project.camera=initialProject().camera;project.camera.target=project.actors[0]?.id||'';project.camera.keys=[{...project.camera.keys[0],t:0}];selected=project.camera.id;changed();return;}if(tab==='actors'){if(project.actors.length>=50){notify('Maksimal 50 karakter per proyek.');return;}project.actors.push({id,name:`Karakter ${String(project.actors.length+1).padStart(2,'0')}`,color:palette[project.actors.length%palette.length],height:1.75,locked:false,visible:true,
   // v3: dua track independen sejak lahir; `keys` gabungan adalah cache turunan.
   position:{property:'position',interpolation:'linear',keys:[{t:0,x:0,z:3}]},
   rotation:{property:'rotation',interpolation:'linear',keys:[{t:0,r:0}]},
   keys:[{t:0,x:0,z:3,r:0}]});}else if(tab==='props'){
   if(project.rooms.length+setPieces().length>=LIMITS.setObjects){notify(`Maksimal ${LIMITS.setObjects} objek set per scene.`);return;}
   const at=renderer3d.observerFocus?.()??{x:0,z:0};
   if(propShape==='wall')project.walls.push({id,type:'wall',name:`Dinding ${project.walls.length+1}`,color:'#b8bcae',x:at.x,z:at.z,r:0,length:4,height:2.6,thickness:.12,locked:false,visible:true});
   else project.props.push({id,type:'prop',shape:propShape,name:`${{box:'Box',table:'Meja',chair:'Kursi',decor:'Dekorasi'}[propShape]} ${project.props.length+1}`,color:{box:'#b9ab8e',table:'#a08767',chair:'#82958b',decor:'#8a927d'}[propShape],
     x:at.x,z:at.z,y:{box:.35,table:.38,chair:.45,decor:.4}[propShape],r:0,
     ...{box:{w:.8,d:.8,h:.7},table:{w:1.4,d:.8,h:.75},chair:{w:.5,d:.5,h:.9},decor:{w:.6,d:.6,h:.6}}[propShape],
     locked:false,visible:true});
 }else{if(project.rooms.length+setPieces().length>=LIMITS.setObjects){notify(`Maksimal ${LIMITS.setObjects} objek set per scene.`);return;}project.rooms.push({id,name:`Ruangan ${project.rooms.length+1}`,x:0,z:8,w:6,d:5,h:3,doors:[],locked:true,visible:true,color:'#c5c8b3'});}selected=id;changed();metrics.record('editor_command',{command_type:tab==='actors'?'add_actor':tab==='props'?'add_prop':'add_room',source:'list',affected_count:1});};
$('#play').onclick=()=>{if(exporting)return;playing?pause():play();};$('#rewind').onclick=()=>{if(exporting)return;pause();time=0;updateScene();updateTimeUI();renderInspector();};$('#scrub').oninput=e=>{if(exporting)return;pause();time=snapT(Number(e.target.value));ensureVisible();updateScene();updateTimeUI();renderInspector();};
$('#record').onclick=()=>{if(exporting)return;if(recording){pause();notify('Gerakan disimpan sebagai keyframe.');return;}if(kind()!=='actors'||!editable()){notify('Pilih karakter yang terlihat dan tidak terkunci.');return;}if(time>=project.duration)time=0;finishKeyboardGesture();session.begin();recordPose=poseAt(objectData(),time);recordFrom=time;setKey(objectData(),recordPose,time,'both');recording=true;setMode('move');updateHistoryUI();renderInspector();$('#record').classList.add('recording');play();notify('Rekam aktif. Gunakan panah untuk bergerak, Q/E untuk berputar.');};
$('#duration').onchange=e=>{if(exporting)return;const n=Number(e.target.value);if(!Number.isFinite(n)||n<1||n>120){e.target.value=project.duration;return;}pause();
 if(n<project.duration){
   const tracked=keyObjects();
   const {skipped}=partitionByLock(tracked.filter(o=>o.keys.some(k=>k.t>n)),{skipHidden:false});
   if(skipped.length){notify(`Buka kunci objek berikut sebelum memendekkan durasi: ${describeSkipped(skipped)}.`);e.target.value=project.duration;return;}
   for(const o of tracked)if(!o.locked)o.keys=trimTrackToDuration(o.keys,n);
   syncKeys();
 }
 project.duration=n;time=Math.min(time,n);keySelection=[];timelineWindow.setDuration(n);timelineWindow.setZoom(MIN_ZOOM);changed();};
$('#project-title').onchange=e=>{if(recording)pause();project.title=e.target.value.trim()||'Scene tanpa judul';e.target.value=project.title;persist();renderBreadcrumb();};
$('#undo').onclick=()=>restoreHistory('undo');$('#redo').onclick=()=>restoreHistory('redo');$('#rotate-tool').onclick=()=>setMode('rotate');$('#orbit-tool').onclick=()=>setMode('orbit');$('#move-tool').onclick=()=>setMode('move');$('#paths-tool').onclick=()=>{paths=!paths;renderer3d.paths=paths;renderer3d.pathsGroup.visible=paths;$('#paths-tool').classList.toggle('active',paths);};$('#grid-tool').onclick=()=>{
  gridSnap=!gridSnap;
  $('#grid-tool').classList.toggle('active',gridSnap);
  $('#grid-tool').setAttribute('aria-pressed',String(gridSnap));
  $('#grid-tool').title=`Snap ke grid ${GRID_STEP} m (${gridSnap?'aktif':'mati'})`;
  notify(gridSnap?`Snap grid ${String(GRID_STEP).replace('.',',')} m aktif untuk memindahkan objek.`:'Snap grid dimatikan.');
};
$('#toggle-walls').onclick=()=>{walls=!walls;renderer3d.walls=walls;$('#toggle-walls').classList.toggle('active',!walls);buildScene();};$('#reset-view').onclick=()=>resetView();document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='camera'){if(!project.camera)return;setView('camera');setMode(mode==='orbit'?'move':mode);document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));}else resetView(b.dataset.view==='top');});$('#edit-camera-view').onclick=()=>document.querySelector('[data-view="camera"]').click();
$('#help').onclick=()=>$('.help-panel').hidden=!$('.help-panel').hidden;$('#close-help').onclick=()=>$('.help-panel').hidden=true;
$('#save').onclick=()=>{if(recording)pause();download(new Blob([JSON.stringify(store.snapshot(),null,2)],{type:'application/json'}),`${project.title.replace(/[^a-z0-9 -]/gi,'')||'scene'}.json`);notify('Proyek diunduh. Buka kembali untuk melanjutkan.');};
$('#import').onclick=()=>{if(recording)pause();$('#file-input').click();};
$('#file-input').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>3e6)throw Error('Ukuran proyek maksimal 3 MB.');const {document:doc,migrated}=openProjectData(JSON.parse(await f.text()));pause();project=session.openDocument(doc);time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';tab=kind();$('#project-title').value=project.title;renderTabs();changed();notify(migrated?'Proyek JSON v1 dimigrasikan dan berhasil dibuka.':'Proyek berhasil dibuka.');}catch(err){notify(`Gagal membuka proyek: ${err.message}`);}e.target.value='';};
// F5-02/F5-03: seluruh UI ekspor ada di `src/export/ui.js`. main.js hanya
// menyediakan snapshot dokumen (deep clone), kait kunci UI dan unduhan.
function setExportLock(locked){for(const el of document.querySelectorAll('header button,.left-panel button,.left-panel textarea,#inspector button,#inspector input,#inspector select,.timeline button,.timeline input,.timeline select,#project-title'))el.disabled=locked;updateHistoryUI();if(!locked){renderInspector();syncCameraUI();}}
const exportDialog=createExportDialog({
 getSnapshot:()=>store.snapshot(),
 getActive:()=>({sceneId:store.sceneId,shotId:store.shotId}),
 notify,download,metrics,
 setBusy:busy=>{if(busy)pause();exporting=busy;setExportLock(busy);updateModeCue();},
 // Snapshot revision berlabel `export` (F5-03): hasil job selalu dapat ditelusuri
 // ke keadaan dokumen yang benar-benar dirender.
 saveRevision:repository&&!storageBlocked?doc=>repository.saveRevision(doc,{label:'export'}):null,
});
$('#export').onclick=()=>{if(exporting)return;if(!project.camera){notify('Tambahkan kamera sebelum mengekspor video.');return;}exportDialog.open();};
let last=performance.now(),recordTick=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.1);last=now;renderer3d.selected=selected;
 if(playing){time=Math.min(project.duration,time+dt);
  if(recording&&now-recordTick>95){recordTick=now;const recorded=objectData();
   // Rekaman menimpa gerak lama di rentang yang sedang direkam — pada KEDUA track.
   for(const track of (recorded.position?[recorded.position,recorded.rotation]:[recorded]))track.keys=track.keys.filter(k=>k.t<=recordFrom||k.t>=snapT(time));
   if(recorded.position)refreshCombined(recorded);const dx=(keysDown.has('arrowright')?1:0)-(keysDown.has('arrowleft')?1:0),dz=(keysDown.has('arrowdown')?1:0)-(keysDown.has('arrowup')?1:0);if(dx||dz)moveSelected(dx*.18,dz*.18);const turn=(keysDown.has('e')?1:0)-(keysDown.has('q')?1:0);if(turn)rotateSelected(turn*6);if(!dx&&!dz&&!turn){const o=objectData();if(editable(o))setKey(o,recordPose,time,'both');}recordFrom=snapT(time);}
  if(!timelineWindow.contains(time)){timelineWindow.start=time-timelineWindow.span*0.1;timelineWindow.clamp();renderTimeline();}
  updateTimeUI();updateScene();if(time>=project.duration)pause();}
 renderer3d.renderViewport(project);recordSession();}
// ---------- F3-04/F3-05: banyak scene, breadcrumb, director's note ----------
// Operasi scene memutasi dokumen (bukan scene view), jadi jalurnya sendiri:
// tulis view aktif → mutasi dokumen → baca ulang view → validasi + satu langkah undo.
// Bila mutasi menghasilkan dokumen tidak valid, dokumen kembali ke keadaan valid terakhir.
let renamingScene=null;
const sceneThumbs=new Map();
function sceneCommand(mutate,message,commandType='scene_add'){
  if(exporting||recording)return false;
  if(session.readOnly){notify('Tab ini baca-saja. Pilih “Buka salinan” atau “Ambil alih” pada banner.');return false;}
  pause();finishKeyboardGesture();
  const rollback=session.lastValidDocument();
  try{
    store.flush();
    const target=mutate(store.doc);
    project=store.reload(target?.id??store.sceneId);
    session.commit();
  }catch(err){
    project=store.load(rollback);
    notify(err.message);
    afterSceneChange();
    return false;
  }
  saveNow();updateHistoryUI();scheduleThumbnail();
  metrics.record('editor_command',{command_type:commandType,source:'list',affected_count:1});
  afterSceneChange();
  if(message)notify(message);
  return true;
}
/** Menyegarkan seluruh UI setelah scene aktif atau daftar scene berubah. */
function afterSceneChange(){
  time=Math.min(time,project.duration);
  if(![...project.actors,...project.rooms,project.camera].filter(Boolean).some(o=>o.id===selected))selected=project.actors[0]?.id||project.camera?.id||'camera';
  // Scene kosong (tanpa aktor dan tanpa kamera) membuka tab Karakter, bukan tab kamera:
  // tindakan pertama yang masuk akal di scene baru adalah menambah karakter.
  tab=kind();if(tab==='camera'&&!project.camera)tab='actors';
  $('#project-title').value=project.title;$('#duration').value=project.duration;
  if(!project.camera&&view==='camera')resetView();
  keySelection=[];timelineWindow.setDuration(project.duration);timelineWindow.setZoom(MIN_ZOOM);
  renderTabs();rebuild();buildPaths();updateTimeUI();updateScene();
}
/** Berpindah scene: navigasi, bukan perubahan kreatif — tidak menambah langkah undo. */
function switchScene(sceneId){
  if(exporting||recording||sceneId===store.sceneId)return;
  pause();finishKeyboardGesture();
  try{project=store.activate(sceneId);}catch(err){notify(err.message);return;}
  time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';
  // `activeSceneId` ada di dalam dokumen, jadi tetap disimpan supaya reload kembali ke scene ini.
  // `rebase()` menyegarkan entri history teratas agar undo berikutnya tidak melompat
  // kembali ke scene sebelumnya — navigasi bukan perubahan kreatif, di kedua arah.
  if(!session.readOnly){session.rebase();saveNow();}
  afterSceneChange();recordSession();scheduleThumbnail();
}
function renderScenes(){
  const scenes=store.doc.scenes,activeScene=store.scene;
  $('#scene-total').textContent=String(scenes.length).padStart(2,'0');
  $('#scene-list').innerHTML=scenes.map((sc,i)=>{
    const isActive=sc.id===store.sceneId,thumb=sceneThumbs.get(sc.id),shot=sc.shots[0];
    if(renamingScene===sc.id)return `<div class="scene-row selected"><input class="scene-rename" id="scene-rename-input" maxlength="100" value="${esc(sc.name)}" aria-label="Nama scene"/></div>`;
    return `<div class="scene-row ${isActive?'selected':''}"><button class="scene-open" data-scene-open="${esc(sc.id)}" aria-current="${isActive?'true':'false'}" aria-label="Buka ${esc(sc.name)}"><span class="scene-thumb">${thumb?`<img src="${esc(thumb)}" alt=""/>`:`<i>${String(i+1).padStart(2,'0')}</i>`}</span><span class="scene-text"><strong>${esc(sc.name)}</strong><small>${sc.actors.length} karakter · ${sc.setObjects.filter(o=>(o.type??'room')==='room').length} lokasi · ${sc.setObjects.filter(o=>o.type==='prop'||o.type==='wall').length} props · ${shot?shot.duration:0}s</small></span></button></div>`;
  }).join('');
  $('#scene-actions').innerHTML=[
    ['scene-move-up','chevron-up','Naikkan urutan scene'],
    ['scene-move-down','chevron-down','Turunkan urutan scene'],
    ['scene-rename','pencil-line',`Ganti nama scene ${activeScene.name}`],
    ['scene-duplicate','copy',`Duplikat scene ${activeScene.name}`],
    ['scene-delete','trash-2',`Hapus scene ${activeScene.name}`],
  ].map(([id,ic,label])=>`<button class="ghost icon" id="${id}" title="${esc(label)}" aria-label="${esc(label)}">${icon(ic)}</button>`).join('');
  const index=scenes.findIndex(sc=>sc.id===store.sceneId),blocked=session.readOnly||exporting||recording;
  document.querySelectorAll('[data-scene-open]').forEach(b=>b.onclick=()=>switchScene(b.dataset.sceneOpen));
  $('#scene-move-up').onclick=()=>sceneCommand(doc=>moveScene(doc,store.sceneId,-1)??store.scene,'Urutan scene diperbarui.','scene_move');
  $('#scene-move-down').onclick=()=>sceneCommand(doc=>moveScene(doc,store.sceneId,1)??store.scene,'Urutan scene diperbarui.','scene_move');
  $('#scene-rename').onclick=()=>{if(blocked)return;renamingScene=store.sceneId;renderScenes();const input=$('#scene-rename-input');input?.focus();input?.select();};
  $('#scene-duplicate').onclick=()=>sceneCommand(doc=>duplicateScene(doc,store.sceneId),'Scene diduplikasi. Aktor, lokasi dan track disalin dengan ID baru.','scene_duplicate');
  $('#scene-delete').onclick=()=>sceneCommand(doc=>removeScene(doc,store.sceneId),'Scene dihapus. Gunakan Undo untuk memulihkan.','scene_remove');
  $('#scene-move-up').disabled=blocked||index<=0;
  $('#scene-move-down').disabled=blocked||index<0||index>=scenes.length-1;
  for(const id of ['#scene-rename','#scene-duplicate'])$(id).disabled=blocked;
  $('#scene-delete').disabled=blocked||scenes.length<=1;
  $('#add-scene').disabled=blocked;
  $('#scene-notes').disabled=blocked;
  if($('#scene-notes').value!==(activeScene.notes??''))$('#scene-notes').value=activeScene.notes??'';
  const input=$('#scene-rename-input');
  if(input){
    const commit=()=>{const value=input.value,id=renamingScene;renamingScene=null;if(!id)return;sceneCommand(doc=>renameScene(doc,id,value),undefined,'scene_rename');};
    input.onblur=commit;
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}if(e.key==='Escape'){renamingScene=null;renderScenes();}};
  }
  refreshIcons();
}
function renderBreadcrumb(){
  const scene=store.scene,shot=store.shot;
  $('#crumb-project').textContent=project.title;
  $('#crumb-scene').textContent=scene.name;
  $('#crumb-shot').textContent=shot.name;
  $('#scene-eyebrow').innerHTML=`${esc(scene.name)} <span style="margin:0 7px;color:#5f6659">/</span> ${esc(shot.name)}`;
  $('#camera-name-label').textContent=project.camera?project.camera.name:'Belum ada kamera';
  document.title=`${project.title} — Blocking Room`;
}
$('#add-scene').onclick=()=>sceneCommand(doc=>addScene(doc),'Scene baru ditambahkan.');
$('#scene-notes').onchange=e=>{const value=e.target.value;sceneCommand(doc=>{const scene=doc.scenes.find(sc=>sc.id===store.sceneId);scene.notes=value;return scene;});};
// ---------- F4-01/F4-02: shot list, alternatif shot, perbandingan A/B ----------
// Shot memiliki kamera dan track; scene memiliki identitas aktor dan set. Operasi
// shot karena itu memutasi SCENE di dalam dokumen (bukan scene view) dan memakai
// jalur yang sama dengan operasi scene: tulis view → mutasi → baca ulang → satu undo.
function shotCommand(mutate,message,commandType='shot_add'){
  if(exporting||recording)return false;
  if(session.readOnly){notify('Tab ini baca-saja. Pilih “Buka salinan” atau “Ambil alih” pada banner.');return false;}
  pause();finishKeyboardGesture();
  const rollback=session.lastValidDocument();
  try{
    store.flush();
    const target=mutate(store.scene,store.doc);
    project=store.reload(store.sceneId,target?.id??store.shotId);
    session.commit();
  }catch(err){
    project=store.load(rollback);
    notify(err.message);
    afterSceneChange();
    return false;
  }
  saveNow();updateHistoryUI();scheduleThumbnail();
  metrics.record('editor_command',{command_type:commandType,source:'list',affected_count:1});
  afterSceneChange();
  if(message)notify(message);
  return true;
}
/** Berpindah shot: navigasi, bukan perubahan kreatif — tidak menambah langkah undo. */
function switchShot(shotId){
  if(exporting||recording||shotId===store.shotId)return;
  pause();finishKeyboardGesture();
  try{project=store.activate(store.sceneId,shotId);}catch(err){notify(err.message);return;}
  time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';
  if(!session.readOnly){session.rebase();saveNow();}
  metrics.record('editor_command',{command_type:'shot_switch',source:'list',affected_count:1});
  afterSceneChange();recordSession();scheduleThumbnail();
}
/** Metadata shot yang tidak diwakili scene view: fps, aspect ratio, catatan. */
function syncShotUI(){
  const shot=store.shot;if(!shot)return;
  if($('#shot-fps').value!==String(shot.fps))$('#shot-fps').value=String(shot.fps);
  if($('#shot-aspect').value!==shot.aspectRatio)$('#shot-aspect').value=shot.aspectRatio;
  renderer3d.setAspect(shot.aspectRatio);
  const size=aspectSize(shot.aspectRatio);
  $('#camera-preview').style.aspectRatio=`${size.width} / ${size.height}`;
  $('#format-label').textContent=`${shot.aspectRatio} · ${shot.fps} fps · ${size.height}p`;
  if($('#shot-notes').value!==(shot.notes??''))$('#shot-notes').value=shot.notes??'';
  const blocked=session.readOnly||exporting||recording;
  for(const id of ['#shot-fps','#shot-aspect','#shot-notes','#add-shot'])$(id).disabled=blocked;
  $('#safe-area').hidden=!safeArea||!project.camera;
  $('#toggle-safe').classList.toggle('active',safeArea);
  $('#toggle-safe').setAttribute('aria-pressed',String(safeArea));
}
function renderShots(){
  const scene=store.scene,shots=scene.shots;
  $('#shot-total').textContent=String(shots.length).padStart(2,'0');
  $('#shot-list').innerHTML=shots.map((sh,i)=>{
    if(renamingShot===sh.id)return `<div class="shot-row selected"><input class="scene-rename" id="shot-rename-input" maxlength="100" value="${esc(sh.name)}" aria-label="Nama shot"/></div>`;
    const isActive=sh.id===store.shotId,lens=sh.camera?`${sh.camera.focal} mm`:'tanpa kamera';
    const keys=sh.tracks.reduce((n,t)=>n+t.keys.length,0);
    return `<div class="shot-row ${isActive?'selected':''} ${compareWith===sh.id?'compared':''}"><button class="shot-open" data-shot-open="${esc(sh.id)}" aria-current="${isActive?'true':'false'}" aria-label="Buka ${esc(sh.name)}"><span class="shot-no">${String(i+1).padStart(2,'0')}</span><span class="scene-text"><strong>${esc(sh.name)}</strong><small>${lens} · ${sh.duration}s · ${sh.fps} fps · ${esc(sh.aspectRatio)} · ${keys} key</small></span></button><button class="ghost icon shot-ab" data-shot-compare="${esc(sh.id)}" aria-pressed="${compareWith===sh.id}" title="Bandingkan ${esc(sh.name)} dengan shot aktif" aria-label="Bandingkan ${esc(sh.name)} dengan shot aktif">B</button></div>`;
  }).join('');
  $('#shot-actions').innerHTML=[
    ['shot-move-up','chevron-up','Naikkan urutan shot'],
    ['shot-move-down','chevron-down','Turunkan urutan shot'],
    ['shot-rename','pencil-line','Ganti nama shot aktif'],
    ['shot-duplicate','copy','Duplikat shot aktif'],
    ['shot-delete','trash-2','Hapus shot aktif'],
  ].map(([id,ic,label])=>`<button class="ghost icon" id="${id}" title="${esc(label)}" aria-label="${esc(label)}">${icon(ic)}</button>`).join('');
  const index=shots.findIndex(sh=>sh.id===store.shotId),blocked=session.readOnly||exporting||recording;
  document.querySelectorAll('[data-shot-open]').forEach(b=>b.onclick=()=>switchShot(b.dataset.shotOpen));
  document.querySelectorAll('[data-shot-compare]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.shotCompare;
    compareWith=compareWith===id?null:id;
    renderShots();renderCompare();
  });
  $('#shot-move-up').onclick=()=>shotCommand(scene=>moveShot(scene,store.shotId,-1)??store.shot,'Urutan shot diperbarui.','shot_move');
  $('#shot-move-down').onclick=()=>shotCommand(scene=>moveShot(scene,store.shotId,1)??store.shot,'Urutan shot diperbarui.','shot_move');
  $('#shot-rename').onclick=()=>{if(blocked)return;renamingShot=store.shotId;renderShots();const input=$('#shot-rename-input');input?.focus();input?.select();};
  $('#shot-duplicate').onclick=()=>shotCommand(scene=>duplicateShot(scene,store.shotId),'Shot diduplikasi. Kamera dan seluruh track disalin dengan ID kamera baru; aktor tetap milik scene.','shot_duplicate');
  $('#shot-delete').onclick=()=>shotCommand(scene=>removeShot(scene,store.shotId),'Shot dihapus. Gunakan Undo untuk memulihkan.','shot_remove');
  $('#shot-move-up').disabled=blocked||index<=0;
  $('#shot-move-down').disabled=blocked||index<0||index>=shots.length-1;
  for(const id of ['#shot-rename','#shot-duplicate'])$(id).disabled=blocked;
  $('#shot-delete').disabled=blocked||shots.length<=1;
  const input=$('#shot-rename-input');
  if(input){
    const commit=()=>{const value=input.value,id=renamingShot;renamingShot=null;if(!id)return;shotCommand(scene=>renameShot(scene,id,value),undefined,'shot_rename');};
    input.onblur=commit;
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}if(e.key==='Escape'){renamingShot=null;renderShots();}};
  }
  refreshIcons();
}
/** Perbandingan alternatif A/B: ringkasan perbedaan + tukar cepat ke shot pembanding. */
function renderCompare(){
  const panel=$('#shot-compare');
  if(!compareWith||compareWith===store.shotId||!store.scene.shots.some(sh=>sh.id===compareWith)){
    panel.hidden=true;panel.innerHTML='';return;
  }
  let diff;
  try{diff=compareShots(store.scene,store.shotId,compareWith);}catch{panel.hidden=true;panel.innerHTML='';return;}
  panel.hidden=false;
  panel.innerHTML=`<div class="compare-head"><b>A/B: ${esc(diff.a.name)} vs ${esc(diff.b.name)}</b></div><table class="compare-table"><thead><tr><th>Aspek</th><th>A</th><th>B</th></tr></thead><tbody>${diff.rows.map(r=>`<tr class="${r.same?'':'differs'}"><td>${esc(r.label)}</td><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join('')}</tbody></table><p class="hint" id="compare-summary">${diff.differences.length?`${diff.differences.length} perbedaan: ${esc(diff.differences.map(d=>d.label).join(', '))}.`:'Kedua alternatif setara pada dimensi yang dibandingkan.'}</p><div class="compare-actions"><button class="small" id="compare-swap" aria-label="Buka shot pembanding ${esc(diff.b.name)}">Tukar ke B</button><button class="ghost small" id="compare-close" aria-label="Tutup perbandingan shot">Tutup</button></div>`;
  $('#compare-swap').onclick=()=>{const target=compareWith;compareWith=store.shotId;switchShot(target);};
  $('#compare-close').onclick=()=>{compareWith=null;renderShots();renderCompare();};
  refreshIcons();
}
$('#add-shot').onclick=()=>shotCommand(scene=>addShot(scene),'Shot baru ditambahkan. Kamera dan track disalin sebagai keyframe awal; shot lain tidak berubah.','shot_add');
$('#shot-notes').onchange=e=>{const notes=e.target.value;shotCommand(scene=>setShotSettings(scene,store.shotId,{notes}),undefined,'shot_settings');};
$('#shot-fps').onchange=e=>{
  const fps=Number(e.target.value);
  shotCommand(scene=>setShotSettings(scene,store.shotId,{fps}),
    `fps shot menjadi ${fps}. Waktu keyframe tidak digeser (tetap dalam detik); hanya penggarisan frame yang berubah.`,'shot_settings');
};
$('#shot-aspect').onchange=e=>{
  const aspectRatio=e.target.value;
  shotCommand(scene=>setShotSettings(scene,store.shotId,{aspectRatio}),
    `Aspect ratio shot menjadi ${aspectRatio}. Preview dan ekspor memakai crop yang sama.`,'shot_settings');
};
$('#toggle-safe').onclick=()=>{safeArea=!safeArea;syncShotUI();};
// ---------- F4-03: playhead presisi, snapping, zoom/pan ----------
$('#frame-input').onchange=e=>{
  if(exporting)return;
  const fps=shotFps(),max=lastFrame(project.duration,fps),raw=Math.round(Number(e.target.value));
  if(!Number.isFinite(raw)){updateTimeUI();return;}
  const frame=Math.max(0,Math.min(max,raw));
  if(frame!==raw)notify(`Frame dijepit ke rentang shot (0–${max}).`);
  pause();time=Math.max(0,Math.min(project.duration,frame/fps));
  ensureVisible();updateScene();updateTimeUI();renderInspector();
};
$('#snap-toggle').onclick=()=>{
  snapEnabled=!snapEnabled;
  $('#snap-toggle').classList.toggle('active',snapEnabled);
  $('#snap-toggle').setAttribute('aria-pressed',String(snapEnabled));
  if(snapEnabled){time=snapT(time);updateScene();}
  updateTimeUI();
  notify(snapEnabled?'Snapping ke frame aktif.':'Snapping dimatikan: keyframe dapat diletakkan di antara frame.');
};
$('#zoom-in').onclick=()=>setZoom(timelineWindow.zoom*2,time);
$('#zoom-out').onclick=()=>setZoom(timelineWindow.zoom/2,time);
$('#key-copy').onclick=()=>copySelectedKeys();
$('#key-paste').onclick=()=>pasteKeysAtPlayhead();
$('#key-delete').onclick=()=>deleteSelectedKeys();
$('#timeline-body').addEventListener('wheel',event=>{
  if(exporting)return;
  const body=$('#timeline-body').getBoundingClientRect(),label=laneLabel(),width=laneWidth();
  const fraction=Math.max(0,Math.min(1,(event.clientX-body.left-label)/width));
  if(event.ctrlKey||event.metaKey){
    event.preventDefault();
    setZoom(timelineWindow.zoom*(event.deltaY<0?1.25:0.8),timelineWindow.timeAt(fraction));
    return;
  }
  if(timelineWindow.zoom<=MIN_ZOOM)return;
  event.preventDefault();
  timelineWindow.panBy((event.deltaX||event.deltaY)/width*timelineWindow.span);
  renderTimeline();
},{passive:false});
// Pan dengan tombol tengah / Alt+drag pada badan timeline (alternatif wheel).
$('#timeline-body').addEventListener('pointerdown',event=>{
  if(exporting||timelineWindow.zoom<=MIN_ZOOM)return;
  if(event.button!==1&&!(event.button===0&&event.altKey))return;
  event.preventDefault();
  panDrag={x:event.clientX,start:timelineWindow.start};
  const move=e=>{timelineWindow.start=panDrag.start-(e.clientX-panDrag.x)/laneWidth()*timelineWindow.span;timelineWindow.clamp();renderTimeline();};
  const up=()=>{panDrag=null;window.removeEventListener('pointermove',move);};
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',up,{once:true});
});
// Kembali ke dashboard: pastikan penyimpanan selesai dan kunci writer dilepas dahulu.
async function goDashboard(){
  try{await autosave.flush();await sessionTracker.flush();}catch{/* status sudah dilaporkan */}
  stored.lock?.dispose();
  renderer3d.dispose();
  location.hash=DASHBOARD_ROUTE;
  location.reload();
}
$('#back-dashboard').onclick=goDashboard;$('#crumb-dashboard').onclick=goDashboard;
// ---------- F3-06: thumbnail per scene ----------
// Diambil dari canvas kamera final (preserveDrawingBuffer) setelah perubahan mereda.
// Ditulis ke store `assets`, bukan ke dokumen: kegagalannya tidak dapat menggagalkan
// penyimpanan dokumen dan tidak pernah membuat langkah undo.
let thumbTimer=null;
export const THUMBNAIL_SIZE={width:320,height:180};
function scheduleThumbnail(){
  if(!repository||session.readOnly||exporting||storageBlocked)return;
  clearTimeout(thumbTimer);
  thumbTimer=setTimeout(()=>{captureThumbnail();},1500);
}
async function captureThumbnail(){
  try{
    if(!repository||session.readOnly||exporting||!project.camera)return;
    const source=renderer3d.povCanvas;
    if(!source?.width)return;
    const canvas=document.createElement('canvas');
    canvas.width=THUMBNAIL_SIZE.width;canvas.height=THUMBNAIL_SIZE.height;
    canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
    const dataUrl=canvas.toDataURL('image/jpeg',0.6);
    if(!dataUrl.startsWith('data:image/jpeg'))return;
    const sceneId=store.sceneId;
    await repository.putThumbnail(store.doc.id,{id:`thumb-${sceneId}`,sceneId,dataUrl,byteSize:dataUrl.length,mimeType:'image/jpeg'});
    sceneThumbs.set(sceneId,dataUrl);
    renderScenes();
  }catch{/* F3-06: kegagalan thumbnail tidak boleh menggagalkan apa pun */}
}
async function loadThumbnails(){
  if(!repository)return;
  try{
    for(const asset of await repository.listAssets(store.doc.id))if(asset.sceneId&&asset.dataUrl)sceneThumbs.set(asset.sceneId,asset.dataUrl);
    renderScenes();
  }catch{/* daftar scene tetap memakai placeholder */}
}
// ---------- F2-04/F2-05/F2-07: cadangan, riwayat versi, banner antartab ----------
function backupName(){return `${project.title.replace(/[^a-z0-9 -]/gi,'')||'scene'}-cadangan.json`;}
$('#download-backup').onclick=()=>{download(new Blob([JSON.stringify(store.snapshot(),null,2)],{type:'application/json'}),backupName());notify('Cadangan diunduh. Buka kembali berkas ini untuk melanjutkan.');};
const stamp=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?iso:d.toLocaleString('id-ID',{dateStyle:'short',timeStyle:'medium'});};
async function renderRevisions(){
  const list=$('#revision-list');
  if(!repository){list.innerHTML='<p class="hint">Penyimpanan tidak tersedia, jadi belum ada versi tersimpan.</p>';return;}
  await autosave.flush();
  let rows=[];
  try{rows=await repository.listRevisions(store.doc.id);}catch(err){list.innerHTML=`<p class="hint">Gagal membaca riwayat: ${esc(err.message)}</p>`;return;}
  list.innerHTML=rows.length?rows.map((r,i)=>`<div class="revision-row"><span><b>${esc(stamp(r.createdAt))}</b><small>${i===0?'Versi terbaru':`${Math.round(r.byteSize/1024)} kB`}</small></span><button class="small" data-revision="${esc(r.id)}"${session.readOnly?' disabled':''}>Pulihkan</button></div>`).join(''):'<p class="hint">Belum ada snapshot. Snapshot dibuat otomatis saat menyimpan.</p>';
  list.querySelectorAll('[data-revision]').forEach(b=>b.onclick=()=>restoreRevision(b.dataset.revision));
}
async function restoreRevision(id){
  if(session.readOnly){notify('Tab baca-saja tidak dapat memulihkan versi.');return;}
  try{
    const row=await repository.getRevision(id);
    if(!row?.snapshot){notify('Versi tidak ditemukan.');return;}
    pause();finishKeyboardGesture();
    project=session.openDocument(openProjectData(row.snapshot).document);
    time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';tab=kind();
    $('#project-title').value=project.title;$('#duration').value=project.duration;
    renderTabs();changed();updateTimeUI();
    $('#revision-panel').hidden=true;
    metrics.record('recovery_used',{action:'restore',snapshot_age:Math.max(0,Math.round((Date.now()-new Date(row.createdAt).getTime())/1000))});
    notify(`Versi ${stamp(row.createdAt)} dipulihkan. Tekan ⌘/Ctrl Z untuk membatalkan.`);
  }catch(err){notify(`Gagal memulihkan versi: ${err.message}`);}
}
// ---------- F6-06: panel metrik lokal ----------
function renderMetrics(){
  const list=$('#metrics-list');if(!list)return;
  const entries=Object.entries(metrics.summary()).sort((a,b)=>b[1]-a[1]);
  list.innerHTML=entries.length
    ?entries.map(([name,count])=>`<div class="metrics-row"><span>${esc(name)}</span><b>${count}</b></div>`).join('')
      +`<div class="metrics-row"><small>Total tersimpan</small><small>${metrics.list().length} / ${metrics.limit}</small></div>`
    :'<p class="hint">Belum ada metrik pada perangkat ini.</p>';
  $('#metrics-optin').checked=metrics.telemetryOptIn;
}
$('#metrics-open').onclick=()=>{const panel=$('#metrics-panel');panel.hidden=!panel.hidden;if(!panel.hidden)renderMetrics();};
$('#metrics-close').onclick=()=>{$('#metrics-panel').hidden=true;};
$('#metrics-export').onclick=()=>{download(new Blob([JSON.stringify(metrics.toExport(),null,2)],{type:'application/json'}),'blocking-room-metrik-lokal.json');notify('Metrik lokal diunduh sebagai JSON.');};
$('#metrics-clear').onclick=()=>{metrics.clear();renderMetrics();notify('Riwayat metrik lokal dihapus.');};
$('#metrics-optin').onchange=e=>{metrics.setTelemetryOptIn(e.target.checked);notify(e.target.checked?'Pilihan disimpan. Pengiriman telemetry eksternal belum diimplementasikan sama sekali.':'Telemetry eksternal tetap mati.');};
// F6-07/PRD §14: rollback aplikasi harus punya jalan keluar data yang dapat dipakai
// build lama. Dokumen v2 tetap utuh; berkas v1 adalah salinan tambahan.
// docs/ROLLOUT.md §6: build R1 hanya mengenal schema v2, dan `exportAsV1` hanya membawa
// satu scene + satu shot. Unduhan v2 mempertahankan seluruh scene, shot dan keyframe.
$('#export-v2').onclick=()=>{
  try{
    const {data,dropped}=exportAsV2(store.snapshot());
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${project.title.replace(/[^a-z0-9 -]/gi,'')||'scene'}-v2.json`);
    notify(dropped.length?`JSON v2 diunduh (seluruh scene & shot). Tidak ikut terbawa: ${dropped.join(', ')}.`:'JSON v2 diunduh (seluruh scene & shot).');
  }catch(err){notify(`Gagal membuat JSON v2: ${err.message}`);}
};
$('#export-v1').onclick=()=>{
  try{
    const {data,dropped}=exportAsV1(store.snapshot(),{sceneId:store.sceneId,shotId:store.shotId});
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${project.title.replace(/[^a-z0-9 -]/gi,'')||'scene'}-v1.json`);
    notify(dropped.length?`JSON v1 diunduh (scene & shot aktif). Tidak ikut terbawa: ${dropped.join(', ')}.`:'JSON v1 diunduh (scene & shot aktif).');
  }catch(err){notify(`Gagal membuat JSON v1: ${err.message}`);}
};
$('#revisions').onclick=()=>{const panel=$('#revision-panel');panel.hidden=!panel.hidden;if(!panel.hidden)renderRevisions();};
$('#close-revisions').onclick=()=>{$('#revision-panel').hidden=true;};
$('#open-last-saved').onclick=async()=>{
  if(!repository){notify('Penyimpanan tidak tersedia.');return;}
  await autosave.flush();
  const saved=await repository.getDocument(store.doc.id);
  if(!saved){notify('Belum ada versi tersimpan untuk proyek ini.');return;}
  if(session.readOnly){notify('Tab baca-saja tidak dapat mengganti dokumen.');return;}
  // Dokumen tersimpan bisa saja schema lama; ia harus melewati migrator.
  pause();project=session.openDocument(openProjectData(saved).document);time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';tab=kind();
  $('#project-title').value=project.title;$('#duration').value=project.duration;renderTabs();changed();updateTimeUI();
  metrics.record('recovery_used',{action:'open_last',snapshot_age:Math.max(0,Math.round((Date.now()-new Date(saved.updatedAt).getTime())/1000))});
  $('#revision-panel').hidden=true;notify('Versi tersimpan terakhir dibuka.');
};
// F2-07: satu writer per proyek. Read-only diblokir di lapisan command; banner memberi pilihan.
function applyReadOnly(readOnly,message){
  session.readOnly=readOnly;
  autosave.setEnabled(!readOnly&&!!repository&&!storageBlocked);
  sessionTracker.setEnabled(!readOnly&&!!repository);
  $('#tab-banner').hidden=!readOnly;
  if(readOnly)$('#tab-banner-text').textContent=message??'Tab ini baca-saja: proyek sedang dibuka di tab lain. Perubahan tidak akan disimpan.';
  for(const el of document.querySelectorAll('#add-object,#add-scene,#add-shot,#scene-notes,#shot-notes,#duration,#shot-fps,#shot-aspect,#project-title,#record,#scene-actions button,#shot-actions button,.timeline-tools button,#inspector input,#inspector select,#inspector button'))el.disabled=readOnly;
  if(!readOnly)renderTimeline();
  updateHistoryUI();
  if(!readOnly){setStatusOverride(null);renderSaveStatus(autosave.status);}
  else setStatusOverride('Baca-saja — tidak disimpan');
}
function onLockChange(info){
  if(!document.getElementById('tab-banner'))return;
  if(info?.writerGone&&session.readOnly)$('#tab-banner-text').textContent='Tab penulis sebelumnya sudah menutup proyek ini. Pilih “Ambil alih” untuk melanjutkan mengedit di tab ini.';
}
$('#take-over').onclick=async()=>{
  if(!stored.lock){notify('Kunci tulis tidak tersedia di browser ini.');return;}
  const result=await stored.lock.takeOver();
  if(!result.ok){notify(result.reason);return;}
  const fresh=repository?await repository.getDocument(store.doc.id).then(d=>d?openProjectData(d).document:null).catch(()=>null):null;
  if(fresh){project=store.load(fresh);session.useHistoryFor(store.doc);}
  applyReadOnly(false);
  renderTabs();rebuild();updateTimeUI();saveNow();
  notify('Tab ini sekarang menjadi penulis proyek.');
};
$('#open-copy').onclick=async()=>{
  if(!repository){notify('Penyimpanan tidak tersedia, salinan tidak dapat dibuat.');return;}
  try{
    const copy=cloneProjectDocument(store.snapshot(),{title:`${project.title} (salinan)`});
    await repository.saveDocument(copy,{revision:true,revisionToken:1});
    setActiveProjectId(copy.id);
    // Hash adalah target navigasi, bukan sumber kebenaran; samakan bila memang dipakai.
    if(location.hash.startsWith('#/project/'))history.replaceState(null,'',projectRoute(copy.id));
    stored.lock?.dispose();
    notify('Salinan dibuat. Memuat ulang editor…');
    setTimeout(()=>location.reload(),200);
  }catch(err){notify(`Gagal membuat salinan: ${err.message}`);}
};
// Simpan terakhir saat tab ditutup/di-reload: jadwal yang belum jatuh tempo tidak boleh hilang.
let unloaded=false;
function onUnload(){if(unloaded)return;unloaded=true;try{
  // localStorage sinkron dipakai sebagai titipan: transaksi IndexedDB yang baru
  // dimulai di sini belum tentu sempat commit sebelum halaman dibongkar.
  const pending=autosave.unconfirmed();
  if(pending&&!session.readOnly)writePendingDocument(pending.doc);
  autosave.flushOnUnload();sessionTracker.flush();stored.lock?.release();
}catch{/* penutupan tab */}}
window.addEventListener('pagehide',onUnload);
window.addEventListener('beforeunload',onUnload);
// ---------- pesan pembuka ----------
if(stored.unavailable){setStatusOverride('Penyimpanan tidak tersedia');notify('Penyimpanan browser tidak tersedia (mode privat atau diblokir). Proyek tetap dapat diedit di memori — unduh cadangan sebelum menutup tab.');}
else if(stored.error&&!storageBlocked)notify(`Data tersimpan tidak terbaca; salinan mentah disimpan sebagai cadangan. (${stored.error.message})`);
if(storageBlocked){setStatusOverride('Tidak disimpan — schema lebih baru');notify(stored.error.message);}
if(stored.migrated)notify('Proyek lama (schema v1) dimigrasikan ke IndexedDB. Sumber lama dan salinan cadangan tetap disimpan.');
if(stored.recoveredPending)notify('Perubahan terakhir sebelum tab ditutup berhasil dipulihkan.');
if(stored.readOnly&&!storageBlocked)applyReadOnly(true);
if(restored.recovered&&stored.sessionState)notify('Sebagian state sesi tidak ditemukan lagi; editor kembali ke scene dan seleksi yang aman.');
// F2-06: pulihkan session state (playhead, seleksi, tool, pose observer).
time=restored.playhead;
if(restored.selectedId)selected=restored.selectedId;
tab=kind();
renderTabs();syncShotUI();buildScene();renderList();renderInspector();renderTimeline();renderScenes();renderShots();renderCompare();renderBreadcrumb();resize();refreshIcons();updateHistoryUI();syncCameraUI();
if(restored.observerPose)renderer3d.setObserverPose(restored.observerPose);
if(restored.activeTool!=='orbit')setMode(restored.activeTool);
updateTimeUI();updateScene();
renderSaveStatus(autosave.status);
// Penyimpanan persisten boleh diminta, tetapi bukan pengganti cadangan (F2-08).
if(repository&&!storageBlocked)requestPersistentStorage();
// F3-01: urutan “terakhir dibuka” di dashboard; kegagalannya tidak penting.
if(repository)repository.touchProject(store.doc.id).catch(()=>{});
loadThumbnails();scheduleThumbnail();
// F6-06: proyek dibuka. Hanya angka dan label tertutup — tanpa judul proyek.
metrics.record('project_opened',{
  storage:repository&&!storageBlocked?'local':'memory',
  duration_ms:Math.round(performance.now()),
  schemaVersion:store.doc.schemaVersion,
  scenes:store.doc.scenes.length,
  bytes:JSON.stringify(store.doc).length,
});
if(stored.createdNew)metrics.record('project_created',{storage:repository?'local':'memory',template:'demo',duration_ms:Math.round(performance.now()),schemaVersion:store.doc.schemaVersion});
if(stored.recoveredPending)metrics.record('recovery_used',{action:'pending',snapshot_age:0});
requestAnimationFrame(animate);
// Read-only diagnostics for browser smoke checks.
window.blockingRoom={exportDialog,getProject:()=>structuredClone(project),getDocument:()=>structuredClone(store.doc),getSnapshot:()=>store.snapshot(),getTime:()=>time,getSceneObjectCount:()=>renderer3d.actorMeshes.size+renderer3d.roomMeshes.size, getObjectState:id=>{const o=renderer3d.actorMeshes.get(id)||renderer3d.roomMeshes.get(id)||renderer3d.propMeshes.get(id)||renderer3d.cameraMarker;return {visible:o.visible,rotation:o.rotation.y,position:o.position.toArray()};},getWalk:id=>{const g=renderer3d.actorMeshes.get(id);return [g.getObjectByName('leg-0').rotation.x,g.getObjectByName('leg-1').rotation.x];},getWalls:id=>{const panels=[];renderer3d.roomMeshes.get(id)?.traverse(o=>{if(o.userData.wallPanel)panels.push({wall:o.userData.wallPanel,position:o.position.toArray(),size:[o.geometry.parameters.width,o.geometry.parameters.height,o.geometry.parameters.depth]});});return panels;},getView:()=>view,projectPoint:(x,y,z)=>renderer3d.projectPoint(x,y,z), cameraDebug:()=>renderer3d.cameraDebug(),
 // Kait uji Fase 2 (tests/repository-browser.mjs): status penyimpanan, revisi, kunci tab.
 getSaveStatus:()=>({status:autosave.status,text:$('#save-status').textContent,error:autosave.lastError?.name??null}),
 isReadOnly:()=>session.readOnly,
 flushSave:()=>autosave.flush(),
 saveRevisionNow:()=>{autosave.schedule(store.doc,{revision:true});return autosave.flush();},
 listRevisions:()=>repository?repository.listRevisions(store.doc.id):Promise.resolve([]),
 getProjectId:()=>store.doc.id,
 listProjects:()=>repository?repository.listProjects():Promise.resolve([]),
 getStoredDocument:id=>repository?repository.getDocument(id??store.doc.id):Promise.resolve(null),
 getStoredSession:()=>repository?repository.getSession(store.doc.id):Promise.resolve(null),
 flushSession:()=>sessionTracker.flush(),
 getScenes:()=>store.doc.scenes.map(s=>({id:s.id,name:s.name,order:s.order,notes:s.notes,actors:s.actors.length,rooms:s.setObjects.filter(o=>(o.type??'room')==='room').length,props:s.setObjects.filter(o=>o.type==='prop'||o.type==='wall').length,shot:s.shots[0]?.name})),
 // Kait uji Fase 4b (props, dinding modular, interpolasi track).
 getProps:()=>structuredClone([...(project.props??[]),...(project.walls??[])]),
 addProp:shape=>{propShape=shape;tab='props';renderTabs();renderList();$('#add-object').click();return selected;},
 duplicateProp:id=>duplicateSetPiece(id),
 setInterpolation:(actorId,property,value)=>{
   const actor=project.actors.find(a=>a.id===actorId);
   if(!actor)return null;
   actor[property].interpolation=value;syncKeys();persist();rebuild();buildPaths();updateScene();
   return actor[property].interpolation;
 },
 setKeyTarget:target=>{keyTarget=target;renderInspector();return keyTarget;},
 getPathWarning:()=>($('#path-warning').hidden?null:$('#path-warning').textContent),
 // Kait uji Fase 4 (tests/shot-timeline-browser.mjs).
 getShots:()=>store.scene.shots.map(sh=>({id:sh.id,name:sh.name,order:sh.order,duration:sh.duration,fps:sh.fps,aspectRatio:sh.aspectRatio,notes:sh.notes,
   cameraId:sh.cameraId,focal:sh.camera?.focal??null,target:sh.camera?.targetId??null,locked:sh.camera?.locked??null,
   tracks:sh.tracks.map(t=>({objectId:t.objectId,property:t.property,interpolation:t.interpolation,keys:structuredClone(t.keys)}))})),
 getActiveShotId:()=>store.shotId,
 switchShot:id=>switchShot(id),
 addShot:()=>$('#add-shot').click(),
 duplicateShot:()=>$('#shot-duplicate').click(),
 removeShot:()=>$('#shot-delete').click(),
 compareShots:other=>compareShots(store.scene,store.shotId,other),
 setShotSetting:(key,value)=>shotCommand(scene=>setShotSettings(scene,store.shotId,{[key]:value}),undefined,'shot_settings'),
 getTimeline:()=>({fps:shotFps(),frame:frameOf(time,shotFps()),time,snap:snapEnabled,zoom:timelineWindow.zoom,
   start:timelineWindow.start,span:timelineWindow.span,duration:project.duration,lastFrame:lastFrame(project.duration,shotFps()),
   selection:structuredClone(keySelection),clipboard:keyClipboard?keyClipboard.count:0}),
 setFrame:frame=>{$('#frame-input').value=String(frame);$('#frame-input').dispatchEvent(new Event('change'));return frameOf(time,shotFps());},
 // v3: seleksi bekerja per LANE (`<objectId>#position` / `#rotation`, atau ID kamera).
 // Memberi ID objek telanjang berarti "seluruh track objek itu pada waktu tersebut",
 // sehingga kait uji lama tetap punya arti yang sama.
 selectKeys:list=>{
   const lanes=keyObjects();
   keySelection=list.flatMap(k=>{
     if(lanes.some(o=>o.id===k.id))return [{id:k.id,t:k.t}];
     const owned=lanes.filter(o=>o.ownerId===k.id);
     return owned.length?owned.map(o=>({id:o.id,t:k.t})):[{id:k.id,t:k.t}];
   });
   renderTimeline();return structuredClone(keySelection);},
 copyKeys:()=>copySelectedKeys(),
 pasteKeys:()=>pasteKeysAtPlayhead(),
 deleteKeys:()=>deleteSelectedKeys(),
 nudgeKeys:seconds=>{
   // Padanan program untuk drag keyframe: memakai jalur yang sama dengan pointer.
   const origin=keySelection.map(sel=>({...sel}));
   const result=moveKeys(keyObjects(),origin,seconds,{fps:shotFps(),duration:project.duration,snap:snapEnabled});
   keySelection=result.selection.length?result.selection:origin;
   if(!runKeyEdit(()=>result,{commandType:'keyframe_move',affected:origin.length}))return null;
   rebuild();buildPaths();updateScene();
   return {replaced:result.replaced,skipped:result.skipped,selection:structuredClone(keySelection)};
 },
 setSnap:on=>{if(snapEnabled!==on)$('#snap-toggle').click();return snapEnabled;},
 setZoom:z=>{setZoom(z,time);return timelineWindow.zoom;},
 getModeCue:()=>({mode:$('#mode-cue').dataset.mode,text:$('#mode-cue').textContent}),
 getGridSnap:()=>({on:gridSnap,step:GRID_STEP}),
 setGridSnap:on=>{if(gridSnap!==on)$('#grid-tool').click();return gridSnap;},
 getAspect:()=>({ratio:renderer3d.aspectRatio,value:renderer3d.aspect,
   pov:[renderer3d.povCanvas.width,renderer3d.povCanvas.height],safeArea:!$('#safe-area').hidden}),
 getActiveSceneId:()=>store.sceneId,
 switchScene:id=>switchScene(id),
 captureThumbnail:()=>captureThumbnail(),
 getProjectMeta:()=>repository?repository.getProject(store.doc.id):Promise.resolve(null),
 goDashboard:()=>goDashboard(),
 // Kait uji performa (tests/perf-browser.mjs).
 select:id=>select(id),
 getCapabilities:()=>caps,
 getMetrics:()=>metrics.list(),
 metricsSummary:()=>metrics.summary(),
 clearMetrics:()=>metrics.clear(),
 loseWebGLContext:()=>renderer3d.loseContext(),
 restoreWebGLContext:()=>renderer3d.restoreContext(),
 isContextLost:()=>renderer3d.contextLost,
 disposeRenderer:()=>renderer3d.dispose(),
 rebuildScene:()=>{buildScene();renderList();renderInspector();renderTimeline();},
 getRendererInfo:()=>({geometries:renderer3d.renderer.info.memory.geometries,textures:renderer3d.renderer.info.memory.textures,programs:renderer3d.renderer.info.programs?.length??0,calls:renderer3d.renderer.info.render.calls,triangles:renderer3d.renderer.info.render.triangles}),
 breakStorage:()=>{repository.saveDocument=()=>Promise.reject(new Error('kegagalan buatan'));},
 restoreStorage:()=>{delete repository.saveDocument;}};
