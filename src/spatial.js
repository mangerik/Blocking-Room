// Deterministic walk cycle: same timeline time produces the same limb pose.
export function gait(keys, t) {
  let distance=0, speed=0, envelope=0;
  for(let i=1;i<keys.length;i++){
    const a=keys[i-1],b=keys[i],length=Math.hypot(b.x-a.x,b.z-a.z),duration=b.t-a.t;
    if(duration<=0)continue;
    const fraction=Math.max(0,Math.min(1,(t-a.t)/duration));distance+=length*fraction;
    if(t>a.t&&t<b.t){speed=length/duration;envelope=Math.min(1,(t-a.t)/.15,(b.t-t)/.15);}
  }
  return {angle:Math.sin(distance/1.15*Math.PI*2)*.55*Math.min(1,speed/.8)*envelope,speed};
}
export function validDoors(room) {
  if(!Array.isArray(room.doors)||room.doors.length>2)return false;
  const sides=new Set();
  return room.doors.every(d=>{
    if(!d||!['back','left'].includes(d.wall)||sides.has(d.wall))return false;sides.add(d.wall);
    const span=d.wall==='back'?room.w:room.d;
    return [d.offset,d.width,d.height].every(Number.isFinite)&&d.width>=.6&&d.height>=.8&&d.height<=room.h-.1&&Math.abs(d.offset)+d.width/2<=span/2-.1;
  });
}
// Wall panels in local coordinates: an actual gap below the lintel.
export function wallPanels(room, wall) {
  const span=wall==='back'?room.w:room.d,door=room.doors?.find(d=>d.wall===wall);
  if(!door)return [{center:0,y:room.h/2,width:span,height:room.h}];
  const start=door.offset-door.width/2,end=door.offset+door.width/2;
  return [
    {center:(-span/2+start)/2,y:room.h/2,width:start+span/2,height:room.h},
    {center:(end+span/2)/2,y:room.h/2,width:span/2-end,height:room.h},
    {center:door.offset,y:(room.h+door.height)/2,width:door.width,height:room.h-door.height}
  ].filter(p=>p.width>0&&p.height>0);
}
// Report straight keyframe segments that cross a solid portion of an existing wall.
export function wallCrossings(actor,rooms) {
  const hits=[];
  for(let i=1;i<actor.keys.length;i++){
    const a=actor.keys[i-1],b=actor.keys[i];
    for(const room of rooms.filter(r=>r.visible!==false))for(const wall of ['left','back']){
      const axis=wall==='left'?'x':'z',along=wall==='left'?'z':'x',boundary=room[axis]-(wall==='left'?room.w:room.d)/2;
      const delta=b[axis]-a[axis];if(Math.abs(delta)<1e-8)continue;
      const f=(boundary-a[axis])/delta;if(f<=0||f>1)continue;
      const at=a[along]+(b[along]-a[along])*f-room[along],span=wall==='left'?room.d:room.w;
      if(Math.abs(at)>span/2)continue;
      const door=room.doors?.find(d=>d.wall===wall);
      if(door&&Math.abs(at-door.offset)<=door.width/2-.25&&actor.height<=door.height)continue;
      hits.push({roomId:room.id,wall,t:a.t+(b.t-a.t)*f});
    }
  }
  return hits;
}
