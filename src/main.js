import { createIcons, Box, FolderOpen, Download, Film, Layers, Plus, CircleHelp, Scan, MousePointer2, Move, Route, Focus, SlidersHorizontal, Video, SkipBack, Play, Pause, Circle, PersonStanding, Cuboid, Eye, Diamond, Minus, Trash2, Undo2, Redo2, LockKeyhole, LockKeyholeOpen, EyeOff, RotateCw, History, LifeBuoy } from 'lucide';
const icons={Box,FolderOpen,Download,Film,Layers,Plus,CircleHelp,Scan,MousePointer2,Move,Route,Focus,SlidersHorizontal,Video,SkipBack,Play,Pause,Circle,PersonStanding,Cuboid,Eye,Diamond,Minus,Trash2,Undo2,Redo2,LockKeyhole,LockKeyholeOpen,EyeOff,RotateCw,History,LifeBuoy};
import { initialProject, palette, sample, putKey } from './model.js';
import { validDoors, wallCrossings } from './spatial.js';
import { DocumentStore, cloneProjectDocument } from './document.js';
import { EditorSession, ReadOnlyError, partitionByLock, describeSkipped } from './commands.js';
import { openProjectData } from './migrate.js';
import { SchemaTooNewError } from './schema.js';
import { clearPendingDocument, setActiveProjectId, writePendingDocument } from './storage.js';
import { bootstrap } from './bootstrap.js';
import { AutosaveController, SAVE_STATUS } from './autosave.js';
import { SessionTracker, restoreSession } from './session-state.js';
import { StorageQuotaError, StorageUnavailableError, requestPersistentStorage } from './repository.js';
import { SceneRenderer } from './scene-renderer.js';
import { ExportService } from './export-service.js';
import { formatTime, keyIndexAt, trimTrackToDuration } from './timeline-engine.js';
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
let project=store.view;
// UI state: tidak pernah masuk history dan tidak pernah disimpan ke dokumen.
let tab='actors',selected=project.actors[0]?.id||'camera',time=0,playing=false,mode='orbit',view='perspective',walls=true,paths=true,exporting=false,recording=false;
let toastTimer,recordPose=null,recordFrom=0;
$('#app').innerHTML=`
<header><div class="header-left"><div class="brand"><div class="brand-mark">${icon('box')}</div><div>blocking room<small>A SPACE FOR YOUR NEXT SCENE</small></div></div><div class="header-divider"></div><div class="breadcrumb">Workspace <span style="margin:0 9px">/</span> <b>Scene studio</b></div></div><div class="header-actions"><button class="icon" id="undo" title="Undo (⌘/Ctrl Z)" aria-label="Undo" disabled>${icon('undo-2')}</button><button class="icon" id="redo" title="Redo (⌘/Ctrl Shift Z)" aria-label="Redo" disabled>${icon('redo-2')}</button><span class="saved" id="save-status" data-state="idle">Menyiapkan…</span><button class="icon" id="download-backup" title="Unduh cadangan JSON" aria-label="Unduh cadangan JSON" hidden>${icon('life-buoy')}</button><button class="icon" id="revisions" title="Riwayat versi tersimpan" aria-label="Riwayat versi tersimpan">${icon('history')}</button><button id="import">${icon('folder-open')}<span class="button-text">Buka</span></button><button id="save">${icon('download')}<span class="button-text">Simpan proyek</span></button><button class="primary" id="export">${icon('film')}<span>Ekspor video</span></button></div></header>
<div class="project-bar"><div><div class="eyebrow">SCENE 01 <span style="margin:0 7px;color:#b0b5a7">/</span> INTERIOR · DAY</div><div class="title-line"><input class="project-title-input" aria-label="Judul proyek" id="project-title" maxlength="100" value="${esc(project.title)}"/><span class="badge">PRE-VISUALIZATION</span></div></div><div class="steps"><span class="current"><i>1</i> Tata scene</span><span>—</span><span><i>2</i> Atur gerakan</span><span>—</span><span><i>3</i> Jadikan referensi</span></div></div>
<main class="studio"><aside class="left-panel"><div class="panel-heading">Scene explorer ${icon('layers')}</div><nav class="tabs" aria-label="Jenis objek"><button data-tab="actors" class="active">Karakter</button><button data-tab="rooms">Lokasi</button><button data-tab="camera">Kamera</button></nav><div class="section-caption"><span id="list-caption">KARAKTER DALAM SCENE</span><span id="object-count"></span></div><div class="object-list" id="objects"></div><button class="add-object" id="add-object">${icon('plus')} Tambah karakter</button><div class="left-bottom"><div class="eyebrow">DIRECTOR’S NOTE</div><p class="scene-note">Dua karakter bertemu di galeri. Kamera mengikuti langkah Alex dari foyer menuju ruang utama.</p><div class="legend-row"><i></i><span id="scene-count"></span></div><button class="ghost small" id="help" style="margin:14px 0 0 -7px">${icon('circle-help')} Panduan singkat</button></div></aside>
<section class="workarea" aria-label="Editor scene 3D"><div class="view-toolbar"><span class="view-title">${icon('box')} OBSERVER VIEW</span><div class="view-options"><button class="ghost active" data-view="perspective">Perspektif</button><button class="ghost" data-view="top">Atas</button><button class="ghost" data-view="camera">Kamera / final</button><button class="ghost" id="toggle-walls" title="Dinding transparan">${icon('scan')}<span>Dinding</span></button></div></div><div class="viewport" id="viewport"><div class="scene-labels" id="labels"></div></div><div class="tools-vertical"><button class="active" id="orbit-tool" title="Orbit scene (O)">${icon('mouse-pointer-2')}</button><button id="move-tool" title="Geser objek di lantai (G)">${icon('move')}</button><button id="rotate-tool" title="Putar karakter (R) — drag kiri/kanan">${icon('rotate-cw')}</button><button id="paths-tool" class="active" title="Tampilkan jalur gerakan">${icon('route')}</button><button id="reset-view" title="Reset sudut pandang">${icon('focus')}</button></div><div class="viewport-hint"><kbd>Drag</kbd> Putar tampilan <span>·</span> <kbd>Scroll</kbd> Zoom <span>·</span> <kbd>G</kbd> Geser objek</div><div class="path-warning" id="path-warning" role="status" hidden></div><div class="compass">↗</div><div class="help-panel" hidden><h3>Dari blocking ke film.</h3><p><b>1. Tata scene.</b> Tambah karakter dan ruangan. Pilih objek lalu ubah posisinya di panel kanan.</p><p><b>2. Buat gerakan.</b> Geser playhead ke waktu tujuan, pindahkan objek dengan tool G atau input posisi. Keyframe tersimpan otomatis.</p><p><b>3. Preview & ekspor.</b> Tekan Space untuk memutar. Ekspor merekam sudut pandang Kamera A.</p><p><b>Rotasi:</b> R lalu drag karakter ke kiri/kanan, atau Q/E untuk putar 5°. Panah menggeser tanpa mengubah arah hadap. Semua bekerja di Kamera / final.</p><p><b>Lock & hide:</b> gunakan gembok dan mata di daftar objek. Lokasi terkunci secara default. Item tersembunyi juga tidak tampil di video; kamera hanya menyembunyikan penandanya.</p><p><b>Undo/redo:</b> ⌘/Ctrl Z dan ⌘/Ctrl Shift Z. Satu drag atau rekaman = satu langkah.</p><p><b>Rekam gerak:</b> aktifkan tombol rekam, lalu gunakan panah untuk bergerak dan Q/E untuk berputar.</p><button class="small" id="close-help">Mengerti</button></div><div class="export-progress" hidden><span id="export-label">Merekam video…</span><progress id="export-meter" max="100" value="0"></progress><button class="small ghost" id="cancel-export">Batalkan</button></div></section>
<aside class="right-panel"><div class="panel-heading">Camera & properties ${icon('sliders-horizontal')}</div><div class="camera-section"><div class="camera-title"><span>${icon('video')} Kamera A</span><span class="live-dot">LIVE PREVIEW</span></div><div class="camera-frame" id="camera-preview"><div class="frame-guide"></div><div id="no-camera" hidden>Belum ada kamera<br><small>Tambah kamera melalui Scene explorer.</small></div><button class="preview-edit" id="edit-camera-view" title="Edit karakter pada sudut pandang kamera">Edit final view ↗</button></div><div class="camera-meta"><span id="lens-label">35 mm · Perspective</span><span>16:9 · 720p</span></div></div><div class="inspector-title"><span id="inspector-name">Properti karakter</span><span class="eyebrow" id="inspector-kind">ACTOR</span></div><div class="inspector" id="inspector"></div></aside>
<section class="timeline" aria-label="Timeline gerakan"><div class="timeline-head"><div class="transport"><button class="ghost icon small" id="rewind" title="Kembali ke awal">${icon('skip-back')}</button><button class="play" id="play" title="Putar / jeda (Space)">${icon('play')}</button><button class="ghost icon small" id="record" title="Rekam gerakan karakter dengan tombol panah">${icon('circle')}</button><div class="timecode"><b id="time-display">00:00.0</b> <span id="total-display">/ 00:12</span></div></div><div class="duration"><span>Durasi</span><input id="duration" type="number" min="1" max="120" value="${project.duration}" aria-label="Durasi scene"/><span>dtk</span></div></div><div class="timeline-body" id="timeline-body"><div class="ruler" id="ruler"></div><input class="scrub" type="range" min="0" max="${project.duration}" step="0.1" value="0" aria-label="Waktu timeline" id="scrub"/><div id="tracks"></div><div class="playhead" id="playhead"></div></div></section></main><div class="toast" role="status" id="toast"></div>
<div class="tab-banner" id="tab-banner" role="alert" hidden><span id="tab-banner-text"></span><span class="tab-banner-actions"><button class="small" id="open-copy">Buka salinan</button><button class="small" id="take-over">Ambil alih</button></span></div>
<div class="revision-dialog" id="revision-panel" role="dialog" aria-label="Riwayat versi tersimpan" hidden><div class="revision-head"><b>Riwayat versi</b><button class="ghost small" id="close-revisions">Tutup</button></div><div class="revision-list" id="revision-list"></div><button class="small" id="open-last-saved">Buka versi tersimpan terakhir</button><p class="hint">Snapshot dibuat otomatis saat menyimpan. Memulihkan versi menjadi satu langkah undo yang dapat dibatalkan.</p></div>
<input type="file" accept=".json,application/json" id="file-input" hidden/>`;
const refreshIcons=()=>createIcons({icons});
function notify(message){$('#toast').textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').textContent='',3800);}
const SAVE_TEXT={idle:'Tersimpan lokal',saving:'Menyimpan…',saved:'Tersimpan lokal',error:'Gagal menyimpan'};
let statusOverride=null;
// Status hanya boleh berkata "tersimpan" setelah transaksi IndexedDB commit (F2-04).
function renderSaveStatus(status,detail){
  const el=$('#save-status');if(!el)return;
  // Titipan darurat dibuang segera setelah ada transaksi yang benar-benar commit.
  if(status===SAVE_STATUS.saved)clearPendingDocument();
  const text=statusOverride??SAVE_TEXT[status]??SAVE_TEXT.idle;
  el.textContent=text;el.dataset.state=statusOverride?'error':status;
  $('#download-backup').hidden=!(statusOverride||status==='error');
  if(status==='error'&&detail?.error){
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
  saveNow();updateHistoryUI();return true;
}
function updateHistoryUI(){
  $('#undo').disabled=exporting||recording||session.readOnly||!session.canUndo;
  $('#redo').disabled=exporting||recording||session.readOnly||!session.canRedo;
}
function restoreHistory(direction){
  if(exporting||recording||drag||session.readOnly)return;
  pause();finishKeyboardGesture();
  const next=session[direction]();if(!next)return;
  project=next;time=Math.min(time,project.duration);
  if(![...project.actors,...project.rooms,project.camera].filter(Boolean).some(o=>o.id===selected))selected=project.actors[0]?.id||'camera';
  tab=kind();$('#project-title').value=project.title;
  persist(false);syncCameraUI();if(!project.camera&&view==='camera')resetView();renderTabs();rebuild();
}
function editable(o=objectData()){return !exporting&&o&&!o.locked&&o.visible!==false;}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
// SceneRenderer memiliki seluruh batas Three.js; main.js hanya memberi scene view dan waktu.
const renderer3d=new SceneRenderer({viewport:$('#viewport'),labelLayer:$('#labels'),povContainer:$('#camera-preview')});
const exportService=new ExportService({canvas:renderer3d.povCanvas});
function buildScene(){renderer3d.selected=selected;renderer3d.build(project,time);}
function buildPaths(){renderer3d.buildPaths(project);}
function updateScene(){renderer3d.selected=selected;renderer3d.update(project,time);}
function setView(next){view=next;renderer3d.viewMode=next;}
function resize(){renderer3d.resize();updateTimeUI();}
new ResizeObserver(resize).observe($('#viewport'));
function objectData(){return project.actors.find(a=>a.id===selected)||project.rooms.find(r=>r.id===selected)||project.camera;}
function kind(){return project.actors.some(a=>a.id===selected)?'actors':project.rooms.some(r=>r.id===selected)?'rooms':'camera';}
function renderList(){
 const items=tab==='camera'?(project.camera?[project.camera]:[]):project[tab];
 $('#objects').innerHTML=items.map(o=>`<div class="object-row ${selected===o.id?'selected':''} ${o.visible===false?'is-hidden':''}"><button class="object" data-select="${esc(o.id)}"><span class="swatch" style="--c:${o.color||'#65775d'}">${icon(tab==='actors'?'person-standing':tab==='rooms'?'cuboid':'video')}</span><span><strong>${esc(o.name)}</strong><small>${tab==='actors'?`${o.height.toFixed(2)} m · ${o.keys.length} keyframe`:tab==='rooms'?`${o.w} × ${o.d} m`:`${o.focal} mm · ${o.keys.length} keyframe`}</small></span></button><div class="object-actions"><button class="ghost icon ${o.locked?'locked':''}" data-lock="${esc(o.id)}" aria-label="${o.locked?'Buka kunci':'Kunci'} ${esc(o.name)}" title="${o.locked?'Buka kunci':'Kunci'} ${esc(o.name)}" aria-pressed="${!!o.locked}">${icon(o.locked?'lock-keyhole':'lock-keyhole-open')}</button><button class="ghost icon" data-visible="${esc(o.id)}" aria-label="${o.visible===false?'Tampilkan':'Sembunyikan'} ${esc(o.name)}" title="${tab==='camera'?'Tampilkan/sembunyikan penanda kamera':o.visible===false?'Tampilkan di scene dan video':'Sembunyikan dari scene dan video'}" aria-pressed="${o.visible!==false}">${icon(o.visible===false?'eye-off':'eye')}</button><button class="ghost icon" data-delete="${esc(o.id)}" title="Hapus ${esc(o.name)}" aria-label="Hapus ${esc(o.name)}" ${o.locked?'disabled':''}>${icon('trash-2')}</button></div></div>`).join('');
 $('#object-count').textContent=String(items.length).padStart(2,'0');$('#list-caption').textContent={actors:'KARAKTER DALAM SCENE',rooms:'ZONA & RUANGAN',camera:'SCENE CAMERA'}[tab];$('#add-object').hidden=tab==='camera'&&!!project.camera;$('#add-object').innerHTML=icon('plus')+(tab==='actors'?' Tambah karakter':tab==='camera'?' Tambah kamera':' Tambah ruangan');$('#scene-count').textContent=`${project.rooms.length} lokasi · ${project.actors.length} karakter · ${project.camera?1:0} kamera`;
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
function renderInspector(){const o=objectData();if(!o){$('#inspector-name').textContent='Belum ada kamera';$('#inspector-kind').textContent='CAMERA';$('#inspector').innerHTML='<p class="hint">Kamera telah dihapus. Pilih Tambah kamera untuk membuat kamera baru, atau Undo untuk memulihkannya. Ekspor memerlukan kamera.</p>';return;}const k=kind(),p=o.keys?sample(o.keys,time):o;$('#inspector-name').textContent=o.name;$('#inspector-kind').textContent={actors:'CHARACTER',rooms:'LOCATION',camera:'CAMERA A'}[k];let html=(o.locked?'<p class="object-notice">Objek terkunci. Buka gembok di daftar untuk mengedit.</p>':o.visible===false?'<p class="object-notice">Objek tersembunyi. Tampilkan kembali untuk mengedit.</p>':'')+field('Nama',`<input data-prop="name" maxlength="100" value="${esc(o.name)}"/>`);
 if(k==='actors'){html+=field('Warna penanda',`<div class="color-row">${palette.map(c=>`<button class="color-choice ${o.color===c?'chosen':''}" data-color="${c}" style="--c:${c}" title="Warna ${c}" aria-label="Warna ${c}"></button>`).join('')}</div>`)+`<div class="divider"></div>`+field('Posisi di lantai · meter',axes(['x','z'],p))+`<div class="input-row two">${field('Rotasi · derajat',num('r',p.r,-360,360,5))}${field('Tinggi · meter',num('height',o.height,.5,3,.01))}</div><div class="rotation-actions"><button class="small" data-turn="-15">↶ −15°</button><button class="small" data-turn="15">↷ +15°</button><button class="small" id="face-camera">Hadap kamera</button></div><p class="hint">0° → +Z · 90° → +X. Q/E untuk putar; panah untuk geser. Arah hadap tetap saat bergeser.</p>`;}
 if(k==='rooms'){html+=field('Posisi pusat · meter',axes(['x','z'],o))+`<div class="input-row two">${field('Lebar · m',num('w',o.w,1,40))}${field('Panjang · m',num('d',o.d,1,40))}</div>`+field('Tinggi dinding · m',num('h',o.h,1,10))+field('Warna ruangan',`<input type="color" data-prop="color" value="${o.color}"/>`);}
 if(k==='camera'){html+=field('Posisi kamera · meter',axes(['x','y','z'],p))+field('Lensa · focal length',`<select data-prop="focal">${[14,18,24,35,50,85,120].map(f=>`<option value="${f}" ${o.focal===f?'selected':''}>${f} mm${f===35?' — Natural':f===24?' — Wide':f===85?' — Portrait':''}</option>`).join('')}</select>`)+field('Arah pandang',`<select data-prop="target"><option value="">Titik manual</option>${project.actors.map(a=>`<option value="${esc(a.id)}" ${o.target===a.id?'selected':''}>Ikuti ${esc(a.name)}</option>`).join('')}</select>`);if(!o.target)html+=field('Titik pandang · X / Y / Z',`<div class="input-row">${['tx','ty','tz'].map(f=>num(f,p[f])).join('')}</div>`);}
 if(k==='rooms')html+=`<div class="divider"></div><div class="eyebrow">Pintu / bukaan dinding</div><p class="hint">Dinding belakang berada di −Z, dinding kiri di −X. Posisi pintu dihitung dari pusat dinding.</p>${(o.doors||[]).map((d,i)=>`<div class="door-editor"><label class="field">Dinding<select data-door="${i}" data-door-prop="wall"><option value="back" ${d.wall==='back'?'selected':''}>Belakang (−Z)</option><option value="left" ${d.wall==='left'?'selected':''}>Kiri (−X)</option></select></label><div class="input-row">${[['offset','Posisi'],['width','Lebar'],['height','Tinggi']].map(([key,label])=>`<label class="field">${label} · m<input type="number" step="0.1" data-door="${i}" data-door-prop="${key}" value="${d[key]}" aria-label="Pintu ${i+1} ${label}"/></label>`).join('')}</div><button class="ghost small" data-remove-door="${i}">Hapus pintu</button></div>`).join('')}<button class="small" id="add-door" ${(o.doors||[]).length>=2?'disabled':''}>${icon('plus')} Tambah pintu</button><p class="hint">Bukaan selalu terbuka. Arahkan jalur karakter melalui pintu; pintu tidak otomatis mengubah jalur.</p>`;
 if(k!=='rooms')html+=`<button class="key-btn" id="add-key">${icon('diamond')} Simpan keyframe di ${time.toFixed(1)}s</button><p class="hint">Pindahkan playhead, lalu ubah posisi. Perubahan otomatis menjadi keyframe.</p><button class="ghost small" id="remove-key">${icon('minus')} Hapus keyframe saat ini</button>`;
 html+=`<button class="ghost delete-btn" id="delete-object">${icon('trash-2')} Hapus ${k==='actors'?'karakter':k==='camera'?'kamera':'ruangan'}</button>`;
 $('#inspector').innerHTML=html;document.querySelectorAll('#inspector input,#inspector select,#inspector button').forEach(el=>el.disabled=!editable(o)||recording);document.querySelectorAll('[data-turn]').forEach(b=>b.onclick=()=>rotateSelected(Number(b.dataset.turn)));if($('#face-camera'))$('#face-camera').onclick=()=>{if(!editable())return;const pose=sample(o.keys,time),cam=renderer3d.camera.position;rotateSelected(Math.atan2(cam.x-pose.x,cam.z-pose.z)*180/Math.PI-pose.r);};$('#lens-label').textContent=`${project.camera?.focal||'—'} mm · Perspective`;refreshIcons();
 if($('#add-door')){const room=o;$('#add-door').disabled=!editable(o)||recording||(o.doors||[]).length>=2;
   $('#add-door').onclick=()=>{if(!editable(room))return;const wall=room.doors?.some(d=>d.wall==='back')?'left':'back';const span=wall==='back'?room.w:room.d;const door={wall,offset:0,width:Math.min(1.4,span-.2),height:Math.min(2.2,room.h-.1)};room.doors??=[];room.doors.push(door);if(!validDoors(room)){room.doors.pop();notify('Ruangan terlalu kecil untuk pintu.');return;}changed();};
   document.querySelectorAll('[data-door]').forEach(el=>el.onchange=()=>{if(!editable(room))return;const doors=structuredClone(room.doors),door=doors[Number(el.dataset.door)],key=el.dataset.doorProp;door[key]=key==='wall'?el.value:Number(el.value);if(!validDoors({...room,doors})){notify('Pintu harus berada di dalam dinding; satu pintu per dinding.');renderInspector();return;}room.doors=doors;changed();});
   document.querySelectorAll('[data-remove-door]').forEach(b=>b.onclick=()=>{if(!editable(room))return;room.doors.splice(Number(b.dataset.removeDoor),1);changed();});
 }
 document.querySelectorAll('[data-prop]').forEach(el=>el.onchange=()=>{if(!editable(o)||recording)return;const key=el.dataset.prop;let value=el.type==='number'||key==='focal'?Number(el.value):el.value;if(el.type==='number'&&(!Number.isFinite(value)||value<Number(el.min)||value>Number(el.max))){notify('Nilai di luar rentang yang diperbolehkan.');renderInspector();return;}if(key==='name'){value=value.trim();if(!value){renderInspector();return;}}
 if(k==='rooms'&&['w','d','h'].includes(key)&&!validDoors({...o,[key]:value})){notify('Ukuran baru tidak cukup untuk pintu. Atur pintu dahulu.');renderInspector();return;}if(o.keys&&['x','y','z','r','tx','ty','tz'].includes(key)){putKey(o.keys,{...sample(o.keys,time),[key]:value},time);}else o[key]=value;persist();syncCameraUI();buildScene();renderList();renderTimeline();renderInspector();});
 document.querySelectorAll('[data-color]').forEach(el=>el.onclick=()=>{if(!editable(o)||recording)return;o.color=el.dataset.color;persist();syncCameraUI();buildScene();renderInspector();renderList();renderTimeline();});
 if($('#add-key'))$('#add-key').onclick=()=>{if(!editable(o)||recording)return;putKey(o.keys,sample(o.keys,time),time);changed();notify(`Keyframe disimpan pada ${time.toFixed(1)} detik.`);};
 if($('#remove-key'))$('#remove-key').onclick=()=>{if(!editable(o)||recording)return;const i=keyIndexAt(o.keys,time);if(i<0){notify('Tidak ada keyframe pada waktu ini.');return;}if(o.keys.length===1){notify('Objek memerlukan setidaknya satu keyframe.');return;}o.keys.splice(i,1);changed();};
 if($('#delete-object')){$('#delete-object').disabled=exporting||recording||o.locked;$('#delete-object').onclick=()=>deleteItem(o.id);}
}
function deleteItem(id){
 if(exporting||recording)return;
 const item=[...project.actors,...project.rooms,project.camera].filter(Boolean).find(o=>o.id===id);
 if(!item||item.locked){notify('Buka kunci item sebelum menghapusnya.');return;}
 if(project.camera?.locked&&project.camera.target===id){notify('Kamera terkunci sedang mengikuti karakter ini. Buka kunci kamera sebelum menghapusnya.');return;}
 pause();finishKeyboardGesture();
 if(id===project.camera?.id){project.camera=null;if(view==='camera')resetView();}
 else {project.actors=project.actors.filter(a=>a.id!==id);project.rooms=project.rooms.filter(r=>r.id!==id);if(project.camera?.target===id)project.camera.target='';}
 if(selected===id)selected=(tab==='camera'?project.camera:project[tab][0])?.id||'camera';
 changed();renderTabs();notify(`${item.name} dihapus. Gunakan Undo untuk memulihkan.`);
}
function syncCameraUI(){
 const absent=!project.camera;$('#no-camera').hidden=!absent;$('#export').disabled=absent||exporting;$('#edit-camera-view').disabled=absent;
 document.querySelector('[data-view="camera"]').disabled=absent;
 $('.frame-guide').hidden=absent;$('#lens-label').textContent=absent?'Belum ada kamera':`${project.camera.focal} mm · Perspective`;
 const collisions=project.actors.filter(a=>a.visible!==false).flatMap(a=>wallCrossings(a,project.rooms).map(c=>({...c,name:a.name})));
 $('#path-warning').hidden=!collisions.length;$('#path-warning').textContent=collisions.length?`Jalur ${collisions[0].name} melewati dinding pada ${collisions[0].t.toFixed(1)}s. Tambahkan pintu atau atur keyframe.`:'';
}
function rebuild(){syncCameraUI();buildScene();renderList();renderInspector();renderTimeline();}
function changed(){persist();rebuild();}
function select(id){if(exporting||recording)return;finishKeyboardGesture();selected=id;tab=kind();renderTabs();renderList();renderInspector();updateScene();}
function renderTabs(){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
function renderTimeline(){const dur=project.duration;$('#ruler').innerHTML=Array.from({length:5},(_,i)=>`<span>${(dur*i/4).toFixed(dur%4?1:0)}s</span>`).join('');$('#tracks').innerHTML=[...project.actors,...(project.camera?[{...project.camera,color:'#7d8c6d'}]:[])].map(o=>`<div class="track"><div class="track-label" style="--c:${o.color}"><i></i>${esc(o.name)}</div><div class="track-lane" style="--c:${o.color}" data-track="${esc(o.id)}"><div class="track-line" style="left:${o.keys[0].t/dur*100}%;width:${(o.keys.at(-1).t-o.keys[0].t)/dur*100}%"></div>${o.keys.map(k=>`<button class="key" style="left:${k.t/dur*100}%" data-time="${k.t}" data-object="${esc(o.id)}" title="${esc(o.name)} · ${k.t}s" aria-label="Keyframe ${esc(o.name)} ${k.t} detik"></button>`).join('')}</div></div>`).join('');document.querySelectorAll('.key').forEach(b=>b.onclick=()=>{if(exporting)return;pause();time=Number(b.dataset.time);select(b.dataset.object);updateTimeUI();updateScene();});$('#scrub').max=dur;$('#duration').value=dur;$('#total-display').textContent=`/ ${formatTime(dur,false)}`;updateTimeUI();}
function updateTimeUI(){$('#time-display').textContent=formatTime(time);$('#scrub').value=time;const label=window.innerWidth<=540?70:108;$('#playhead').style.left=`${label+($('#timeline-body').clientWidth-label-16)*time/project.duration}px`;if(exporting){$('#export-meter').value=time/project.duration*100;$('#export-label').textContent=`Merekam Kamera A… ${Math.round(time/project.duration*100)}%`;}}
function pause(){playing=false;if(recording){recording=false;session.end();$('#record').classList.remove('recording');persist(false);buildPaths();renderTimeline();}$('#play').innerHTML=icon('play');refreshIcons();renderInspector();}
function play(){if(time>=project.duration)time=0;playing=true;$('#play').innerHTML=icon('pause');refreshIcons();}
function moveSelected(dx,dz){const o=objectData();if(!editable(o))return;if(kind()==='rooms'){o.x=Math.max(-100,Math.min(100,o.x+dx));o.z=Math.max(-100,Math.min(100,o.z+dz));buildScene();}else{const p=recording?{...recordPose}:sample(o.keys,time);p.x=Math.max(-100,Math.min(100,p.x+dx));p.z=Math.max(-100,Math.min(100,p.z+dz));if(recording)recordPose={...p};putKey(o.keys,p,time);updateScene();buildPaths();}if(!recording){persist();syncCameraUI();renderTimeline();renderInspector();}}
function rotateSelected(degrees){
 const o=objectData();if(kind()!=='actors'||!editable(o))return;
 const p=recording?{...recordPose}:sample(o.keys,time);p.r=((p.r+degrees)%360+360)%360;if(recording)recordPose={...p};putKey(o.keys,p,time);updateScene();
 if(!recording){persist();renderInspector();renderTimeline();}
}
const keysDown=new Set();let keyboardGesture=false;
function finishKeyboardGesture(){keysDown.clear();if(keyboardGesture){keyboardGesture=false;session.end();persist(false);}}
window.addEventListener('keydown',e=>{
 const input=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName);
 if(input||exporting||drag)return;
 if((e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();restoreHistory(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo');return;}
 if(e.code==='Space'){e.preventDefault();if(!e.repeat)playing?pause():play();return;}
 if(e.key.toLowerCase()==='g')setMode('move');if(e.key.toLowerCase()==='o')setMode('orbit');if(e.key.toLowerCase()==='r')setMode('rotate');
 if(e.key.startsWith('Arrow')||['q','e'].includes(e.key.toLowerCase())){
   e.preventDefault();if(!editable())return;
   if(playing&&!recording)pause();
   if(!recording&&!keyboardGesture){session.begin();keyboardGesture=true;}
   keysDown.add(e.key.toLowerCase());
   if(!recording){if(['q','e'].includes(e.key.toLowerCase()))rotateSelected(e.key.toLowerCase()==='q'?-5:5);else moveSelected(e.key==='ArrowLeft'?-.2:e.key==='ArrowRight'?.2:0,e.key==='ArrowUp'?-.2:e.key==='ArrowDown'?.2:0);}
 }
});
window.addEventListener('keyup',e=>{keysDown.delete(e.key.toLowerCase());if(!keysDown.size)finishKeyboardGesture();});
window.addEventListener('blur',()=>{finishKeyboardGesture();endDrag();if(recording)pause();});
function setMode(m){mode=m;for(const t of ['orbit','move','rotate'])$(`#${t}-tool`).classList.toggle('active',m===t);renderer3d.canvas.style.cursor=m==='orbit'?'grab':m==='rotate'?'ew-resize':'crosshair';renderer3d.controls.enabled=m==='orbit'&&view!=='camera';$('.viewport-hint').innerHTML=m==='rotate'?'<kbd>Drag</kbd> Putar karakter <span>·</span> <kbd>Q / E</kbd> −5° / +5°':m==='move'?'<kbd>Drag</kbd> Geser karakter · Pilih lokasi dahulu untuk menggesernya <span>·</span> <kbd>O</kbd> Orbit':'<kbd>Drag</kbd> Putar tampilan <span>·</span> <kbd>G</kbd> Geser <span>·</span> <kbd>R</kbd> Putar karakter';}
let drag=null,down=null;
const hitId=e=>renderer3d.hitId(e,{mode,roomIds:project.rooms.map(r=>r.id)});
renderer3d.canvas.addEventListener('pointerdown',e=>{
 if(exporting||e.button!==0)return;down={x:e.clientX,y:e.clientY};
 if(mode==='orbit')return;
 const id=hitId(e);if(!id)return;
 if(recording&&id!==selected)return;
 if(!recording){pause();select(id);}if(!editable()||(mode==='rotate'&&kind()!=='actors'))return;
 const p=renderer3d.floorPoint(e);
 if(mode==='rotate'||p){const o=objectData(),pose=o.keys?sample(o.keys,time):o;
   if(!recording)session.begin();
   drag={id:selected,mode,offsetX:p?pose.x-p.x:0,offsetZ:p?pose.z-p.z:0,lastX:e.clientX};renderer3d.canvas.setPointerCapture(e.pointerId);
 }
});
renderer3d.canvas.addEventListener('pointermove',e=>{
 if(!drag||exporting||drag.id!==selected)return;
 if(drag.mode==='rotate'){rotateSelected((e.clientX-drag.lastX)*.6);drag.lastX=e.clientX;return;}
 const p=renderer3d.floorPoint(e);if(!p)return;
 const o=objectData(),pose=o.keys?sample(o.keys,time):o;moveSelected(p.x+drag.offsetX-pose.x,p.z+drag.offsetZ-pose.z);
});
function endDrag(){if(drag&&!recording){session.end();persist(false);renderInspector();renderTimeline();}drag=null;down=null;}
renderer3d.canvas.addEventListener('pointerup',e=>{if(!drag&&mode==='orbit'&&down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<4){const id=hitId(e);if(id)select(id);}endDrag();});renderer3d.canvas.addEventListener('pointercancel',endDrag);
function resetView(top=false){renderer3d.resetView(top);setView(renderer3d.viewMode);setMode(mode);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(exporting||recording)return;finishKeyboardGesture();tab=b.dataset.tab;selected=(tab==='camera'?project.camera:project[tab][0])?.id||'camera';renderTabs();renderList();renderInspector();});
$('#add-object').onclick=()=>{if(exporting||recording)return;const id=crypto.randomUUID();if(tab==='camera'){project.camera=initialProject().camera;project.camera.target=project.actors[0]?.id||'';project.camera.keys=[{...project.camera.keys[0],t:0}];selected=project.camera.id;changed();return;}if(tab==='actors'){if(project.actors.length>=50){notify('Maksimal 50 karakter per proyek.');return;}project.actors.push({id,name:`Karakter ${String(project.actors.length+1).padStart(2,'0')}`,color:palette[project.actors.length%palette.length],height:1.75,locked:false,visible:true,keys:[{t:0,x:0,z:3,r:0}]});}else{if(project.rooms.length>=30){notify('Maksimal 30 ruangan per proyek.');return;}project.rooms.push({id,name:`Ruangan ${project.rooms.length+1}`,x:0,z:8,w:6,d:5,h:3,doors:[],locked:true,visible:true,color:'#c5c8b3'});}selected=id;changed();};
$('#play').onclick=()=>{if(exporting)return;playing?pause():play();};$('#rewind').onclick=()=>{if(exporting)return;pause();time=0;updateScene();updateTimeUI();renderInspector();};$('#scrub').oninput=e=>{if(exporting)return;pause();time=Number(e.target.value);updateScene();updateTimeUI();renderInspector();};
$('#record').onclick=()=>{if(exporting)return;if(recording){pause();notify('Gerakan disimpan sebagai keyframe.');return;}if(kind()!=='actors'||!editable()){notify('Pilih karakter yang terlihat dan tidak terkunci.');return;}if(time>=project.duration)time=0;finishKeyboardGesture();session.begin();recordPose=sample(objectData().keys,time);recordFrom=time;putKey(objectData().keys,recordPose,time);recording=true;setMode('move');updateHistoryUI();renderInspector();$('#record').classList.add('recording');play();notify('Rekam aktif. Gunakan panah untuk bergerak, Q/E untuk berputar.');};
$('#duration').onchange=e=>{if(exporting)return;const n=Number(e.target.value);if(!Number.isFinite(n)||n<1||n>120){e.target.value=project.duration;return;}pause();
 if(n<project.duration){
   const tracked=[...project.actors,...(project.camera?[project.camera]:[])];
   const {skipped}=partitionByLock(tracked.filter(o=>o.keys.some(k=>k.t>n)),{skipHidden:false});
   if(skipped.length){notify(`Buka kunci objek berikut sebelum memendekkan durasi: ${describeSkipped(skipped)}.`);e.target.value=project.duration;return;}
   for(const o of tracked)if(!o.locked)o.keys=trimTrackToDuration(o.keys,n);
 }
 project.duration=n;time=Math.min(time,n);changed();};
$('#project-title').onchange=e=>{if(recording)pause();project.title=e.target.value.trim()||'Scene tanpa judul';e.target.value=project.title;persist();};
$('#undo').onclick=()=>restoreHistory('undo');$('#redo').onclick=()=>restoreHistory('redo');$('#rotate-tool').onclick=()=>setMode('rotate');$('#orbit-tool').onclick=()=>setMode('orbit');$('#move-tool').onclick=()=>setMode('move');$('#paths-tool').onclick=()=>{paths=!paths;renderer3d.paths=paths;renderer3d.pathsGroup.visible=paths;$('#paths-tool').classList.toggle('active',paths);};$('#toggle-walls').onclick=()=>{walls=!walls;renderer3d.walls=walls;$('#toggle-walls').classList.toggle('active',!walls);buildScene();};$('#reset-view').onclick=()=>resetView();document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(b.dataset.view==='camera'){if(!project.camera)return;setView('camera');setMode(mode==='orbit'?'move':mode);document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));}else resetView(b.dataset.view==='top');});$('#edit-camera-view').onclick=()=>document.querySelector('[data-view="camera"]').click();
$('#help').onclick=()=>$('.help-panel').hidden=!$('.help-panel').hidden;$('#close-help').onclick=()=>$('.help-panel').hidden=true;
$('#save').onclick=()=>{if(recording)pause();download(new Blob([JSON.stringify(store.snapshot(),null,2)],{type:'application/json'}),`${project.title.replace(/[^a-z0-9 -]/gi,'')||'scene'}.json`);notify('Proyek diunduh. Buka kembali untuk melanjutkan.');};
$('#import').onclick=()=>{if(recording)pause();$('#file-input').click();};
$('#file-input').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>3e6)throw Error('Ukuran proyek maksimal 3 MB.');const {document:doc,migrated}=openProjectData(JSON.parse(await f.text()));pause();project=session.openDocument(doc);time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';tab=kind();$('#project-title').value=project.title;renderTabs();changed();notify(migrated?'Proyek JSON v1 dimigrasikan dan berhasil dibuka.':'Proyek berhasil dibuka.');}catch(err){notify(`Gagal membuka proyek: ${err.message}`);}e.target.value='';};
let exportRestoreTime=0;
function setExportLock(locked){for(const el of document.querySelectorAll('header button,.left-panel button,#inspector button,#inspector input,#inspector select,.timeline button,.timeline input,#project-title'))el.disabled=locked;updateHistoryUI();if(!locked){renderInspector();syncCameraUI();}}
function finishExport(result){if(!exporting)return;exporting=false;playing=false;exportService.dispose();$('.export-progress').hidden=true;setExportLock(false);time=exportRestoreTime;pause();updateScene();updateTimeUI();
 if(!result.cancelled&&result.blob){download(result.blob,`${project.title.replace(/[^a-z0-9 -]/gi,'')||'scene'}-previs.${result.extension}`);notify('Video referensi berhasil diunduh.');}
 else if(result.cancelled)notify('Ekspor dibatalkan.');}
$('#export').onclick=()=>{if(exporting)return;if(!project.camera){notify('Tambahkan kamera sebelum mengekspor video.');return;}if(!exportService.supported){notify('Browser ini belum mendukung ekspor video. Gunakan Chrome atau Edge.');return;}
 const mime=exportService.pickMimeType();if(!mime){notify('Tidak ada format video yang didukung browser ini.');return;}
 pause();exportRestoreTime=time;time=0;updateScene();renderer3d.renderPOV(project);
 try{exportService.start({mimeType:mime,onStop:finishExport,onError:()=>{const result={...exportService.result(),cancelled:true};notify('Ekspor gagal. Silakan coba lagi.');finishExport(result);}});exporting=true;setExportLock(true);$('.export-progress').hidden=false;play();notify('Ekspor berjalan. Biarkan halaman terbuka sampai selesai.');}
 catch(err){exportService.dispose();exporting=false;setExportLock(false);notify('Tidak dapat merekam: '+err.message);}};
$('#cancel-export').onclick=()=>exportService.cancel();
let last=performance.now(),recordTick=0;
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.1);last=now;renderer3d.selected=selected;
 if(playing){time=Math.min(project.duration,time+dt);
  if(recording&&now-recordTick>95){recordTick=now;const recorded=objectData();recorded.keys=recorded.keys.filter(k=>k.t<=recordFrom||k.t>=Math.round(time*10)/10);const dx=(keysDown.has('arrowright')?1:0)-(keysDown.has('arrowleft')?1:0),dz=(keysDown.has('arrowdown')?1:0)-(keysDown.has('arrowup')?1:0);if(dx||dz)moveSelected(dx*.18,dz*.18);const turn=(keysDown.has('e')?1:0)-(keysDown.has('q')?1:0);if(turn)rotateSelected(turn*6);if(!dx&&!dz&&!turn){const o=objectData();if(editable(o))putKey(o.keys,recordPose,time);}recordFrom=Math.round(time*10)/10;}
  updateTimeUI();updateScene();if(time>=project.duration){if(exporting){playing=false;renderer3d.renderPOV(project);exportService.stop();}else pause();}}
 renderer3d.renderViewport(project);recordSession();}
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
    notify(`Versi ${stamp(row.createdAt)} dipulihkan. Tekan ⌘/Ctrl Z untuk membatalkan.`);
  }catch(err){notify(`Gagal memulihkan versi: ${err.message}`);}
}
$('#revisions').onclick=()=>{const panel=$('#revision-panel');panel.hidden=!panel.hidden;if(!panel.hidden)renderRevisions();};
$('#close-revisions').onclick=()=>{$('#revision-panel').hidden=true;};
$('#open-last-saved').onclick=async()=>{
  if(!repository){notify('Penyimpanan tidak tersedia.');return;}
  await autosave.flush();
  const saved=await repository.getDocument(store.doc.id);
  if(!saved){notify('Belum ada versi tersimpan untuk proyek ini.');return;}
  if(session.readOnly){notify('Tab baca-saja tidak dapat mengganti dokumen.');return;}
  pause();project=session.openDocument(saved);time=0;selected=project.actors[0]?.id||project.camera?.id||'camera';tab=kind();
  $('#project-title').value=project.title;$('#duration').value=project.duration;renderTabs();changed();updateTimeUI();
  $('#revision-panel').hidden=true;notify('Versi tersimpan terakhir dibuka.');
};
// F2-07: satu writer per proyek. Read-only diblokir di lapisan command; banner memberi pilihan.
function applyReadOnly(readOnly,message){
  session.readOnly=readOnly;
  autosave.setEnabled(!readOnly&&!!repository&&!storageBlocked);
  sessionTracker.setEnabled(!readOnly&&!!repository);
  $('#tab-banner').hidden=!readOnly;
  if(readOnly)$('#tab-banner-text').textContent=message??'Tab ini baca-saja: proyek sedang dibuka di tab lain. Perubahan tidak akan disimpan.';
  for(const el of document.querySelectorAll('#add-object,#duration,#project-title,#record,#inspector input,#inspector select,#inspector button'))el.disabled=readOnly;
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
  const fresh=repository?await repository.getDocument(store.doc.id).catch(()=>null):null;
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
renderTabs();buildScene();renderList();renderInspector();renderTimeline();resize();refreshIcons();updateHistoryUI();syncCameraUI();
if(restored.observerPose)renderer3d.setObserverPose(restored.observerPose);
if(restored.activeTool!=='orbit')setMode(restored.activeTool);
updateTimeUI();updateScene();
renderSaveStatus(autosave.status);
// Penyimpanan persisten boleh diminta, tetapi bukan pengganti cadangan (F2-08).
if(repository&&!storageBlocked)requestPersistentStorage();
requestAnimationFrame(animate);
// Read-only diagnostics for browser smoke checks.
window.blockingRoom={getProject:()=>structuredClone(project),getDocument:()=>structuredClone(store.doc),getTime:()=>time,getSceneObjectCount:()=>renderer3d.actorMeshes.size+renderer3d.roomMeshes.size, getObjectState:id=>{const o=renderer3d.actorMeshes.get(id)||renderer3d.roomMeshes.get(id)||renderer3d.cameraMarker;return {visible:o.visible,rotation:o.rotation.y,position:o.position.toArray()};},getWalk:id=>{const g=renderer3d.actorMeshes.get(id);return [g.getObjectByName('leg-0').rotation.x,g.getObjectByName('leg-1').rotation.x];},getWalls:id=>{const panels=[];renderer3d.roomMeshes.get(id)?.traverse(o=>{if(o.userData.wallPanel)panels.push({wall:o.userData.wallPanel,position:o.position.toArray(),size:[o.geometry.parameters.width,o.geometry.parameters.height,o.geometry.parameters.depth]});});return panels;},getView:()=>view,projectPoint:(x,y,z)=>renderer3d.projectPoint(x,y,z), cameraDebug:()=>renderer3d.cameraDebug(),
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
 breakStorage:()=>{repository.saveDocument=()=>Promise.reject(new Error('kegagalan buatan'));},
 restoreStorage:()=>{delete repository.saveDocument;}};
