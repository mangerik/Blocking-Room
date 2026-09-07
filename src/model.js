import {validDoors} from './spatial.js';
export const palette = ['#c16e51','#477f77','#d3ac50','#778ab0','#a37691'];
export function initialProject() {
  return normalizeProject({version:1,title:'Pertemuan di galeri',duration:12,actors:[
    {id:'a1',name:'Alex',color:palette[0],height:1.78,keys:[{t:0,x:-5,z:2,r:0},{t:5,x:-1,z:2,r:0},{t:12,x:4,z:0,r:90}]},
    {id:'a2',name:'Maya',color:palette[1],height:1.68,keys:[{t:0,x:4,z:-1,r:180},{t:7,x:3,z:1,r:180},{t:12,x:2,z:1,r:180}]},
    {id:'a3',name:'Figuran 01',color:palette[2],height:1.75,keys:[{t:0,x:1,z:-3,r:0}]}],
    rooms:[{id:'r1',name:'Foyer',x:-5,z:0,w:6,d:8,h:3,color:'#b5c2c0'},{id:'r2',name:'Galeri utama',x:3,z:0,w:10,d:8,h:3.2,color:'#d4c7ad',doors:[{wall:'left',offset:2,width:1.6,height:2.3}]},{id:'r3',name:'Ruang samping',x:4,z:-6,w:8,d:4,h:3,color:'#b6c7b3'}],
    camera:{id:'camera',name:'Kamera A',focal:35,target:'a1',keys:[{t:0,x:-7,y:2.2,z:6,tx:-4,ty:1.2,tz:1},{t:6,x:-1,y:2,z:6,tx:1,ty:1.2,tz:1},{t:12,x:5,y:2.2,z:5,tx:3,ty:1.2,tz:0}]}});
}
export function normalizeProject(p) {
  for (const o of [...p.actors, ...p.rooms, p.camera].filter(Boolean)) {
    o.locked ??= p.rooms.includes(o);
    o.visible ??= true;
  }
  for(const room of p.rooms)room.doors ??= [];
  return p;
}
export function sample(keys,t) {
  const sorted=[...keys].sort((a,b)=>a.t-b.t);
  if(t<=sorted[0].t)return {...sorted[0]};
  if(t>=sorted.at(-1).t)return {...sorted.at(-1)};
  const i=sorted.findIndex(k=>k.t>t),a=sorted[i-1],b=sorted[i],f=(t-a.t)/(b.t-a.t),out={t};
  for(const key of Object.keys(a)){if(key==='t')continue;let delta=b[key]-a[key];if(key==='r')delta=((delta+540)%360)-180;out[key]=a[key]+delta*f;}
  return out;
}
export function putKey(keys,pose,t){const key={...pose,t:Math.round(t*10)/10};const i=keys.findIndex(k=>Math.abs(k.t-key.t)<0.05);if(i>=0)keys[i]=key;else keys.push(key);keys.sort((a,b)=>a.t-b.t);}
export function validateProject(p){
  const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  const name=s=>typeof s==='string'&&s.length>0&&s.length<=100;
  const color=s=>/^#[0-9a-f]{6}$/i.test(s);
  const keys=(ks,fields)=>Array.isArray(ks)&&ks.length>0&&ks.length<=2400&&ks.every(k=>number(k.t,0,p.duration)&&fields.every(f=>number(k[f],-1000,1000)));
  if(!p||p.version!==1||!name(p.title)||!number(p.duration,1,120)||!Array.isArray(p.actors)||p.actors.length>50||!Array.isArray(p.rooms)||p.rooms.length>30)throw Error('Format proyek tidak valid.');
  if(!p.actors.every(a=>name(a.id)&&a.id!=='camera'&&name(a.name)&&color(a.color)&&number(a.height,0.5,3)&&keys(a.keys,['x','z','r'])))throw Error('Data karakter tidak valid.');
  if(!p.rooms.every(r=>name(r.id)&&name(r.name)&&color(r.color)&&['x','z'].every(k=>number(r[k],-100,100))&&['w','d'].every(k=>number(r[k],1,40))&&number(r.h,1,10)))throw Error('Data lokasi tidak valid.');
  if(p.camera!==null&&(!p.camera||p.camera.id!=='camera'||!number(p.camera.focal,14,120)||!keys(p.camera.keys,['x','y','z','tx','ty','tz'])||!(p.camera.target===''||p.actors.some(a=>a.id===p.camera.target))))throw Error('Data kamera tidak valid.');
  for (const o of [...p.actors,...p.rooms,p.camera].filter(Boolean)) {
    if (['locked','visible'].some(k=>o[k]!==undefined&&typeof o[k]!=='boolean')) throw Error('Status objek tidak valid.');
    if (o.keys) { o.keys.sort((a,b)=>a.t-b.t); if(new Set(o.keys.map(k=>k.t)).size!==o.keys.length) throw Error('Waktu keyframe harus unik.'); }
  }
  for(const room of p.rooms){room.doors ??= [];if(!validDoors(room))throw Error('Ukuran atau posisi pintu tidak valid.');}
  const ids=[...p.actors,...p.rooms,p.camera].filter(Boolean).map(a=>a.id);if(new Set(ids).size!==ids.length)throw Error('ID objek harus unik.');return normalizeProject(p);
}
