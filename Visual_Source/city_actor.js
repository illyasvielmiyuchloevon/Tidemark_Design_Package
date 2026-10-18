(function(root){
'use strict';
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const fract=v=>((v%1)+1)%1;
const ease=v=>v*v*(3-2*v);

// Original captain artwork, articulated as a whole person. The public interface
// stays compatible with CityAssets; drawing surfaces remain 52 x 54 at 40 px tall.
class TexturedLegRig {
 constructor({source,definition,createCanvas,width=52,height=54,anchor=[26,46],visibleHeight=40,strideWorld=44,travelVector=[-1,0],lift=4}){
  this.make=createCanvas;this.definition=definition;this.width=width;this.height=height;this.anchor=anchor;
  this.strideWorld=strideWorld;this.travelVector=travelVector;this.lift=lift;
  this.direction=definition.direction;this.vertical=['down','up'].includes(this.direction);
  this.facing=this.direction==='left'?-1:this.direction==='right'?1:0;
  this.sourceAnchor=definition.source_anchor;this.scale=visibleHeight/this.sourceAnchor[1];
  this.motion=definition.motion||{};this.frameCount=this.motion.frames||12;
  // One supplied phase is one full left/right cycle. The integrated controller
  // uses 44 world units per cycle and 64 units/second for a relaxed brisk walk.
  this.cycleWorld=strideWorld;
  const r=definition.source_rect;this.source=createCanvas(r[2],r[3]);let g=this.source.getContext('2d');
  g.drawImage(source,...r,0,0,r[2],r[3]);
  const pixels=g.getImageData(0,0,r[2],r[3]);
  for(let i=3;i<pixels.data.length;i+=4)if(pixels.data[i]<24)pixels.data[i]=0;
  g.putImageData(pixels,0,0);
  this.body=createCanvas(r[2],r[3]);g=this.body.getContext('2d');g.drawImage(this.source,0,0);g.globalCompositeOperation='destination-out';
  for(const poly of definition.bodyMask.oldLegPolygons){this.polygon(g,poly);g.fill();}
  this.legs=definition.legs.map((leg,i)=>({...leg,phaseOffset:leg.phaseOffset??i*.5,
   upper:this.part(leg.upperPolygon,leg.upperExtraPolygons),lower:this.part(leg.lowerPolygon,leg.lowerExtraPolygons),foot:this.part(leg.footPolygon,leg.footExtraPolygons),
   anklePatch:this.patch(leg.ankle,21)}));
  this.arms=(this.motion.arms||[]).map(a=>({...a,upper:this.part(a.upperPolygon),lower:this.part(a.lowerPolygon)}));
  this.secondary=(this.motion.secondary||[]).map(s=>({...s,part:this.part(s.polygon)}));
  for(const arm of this.arms)for(const poly of [arm.upperPolygon,arm.lowerPolygon]){this.polygon(g,poly);g.fill();}
  for(const layer of this.secondary){this.polygon(g,layer.polygon);g.fill();}
  for(const poly of this.motion.bodyErase||[]){this.polygon(g,poly);g.fill();}
  this.canvas=createCanvas(width,height);this.cache=new Map();
 }
 polygon(ctx,points){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();}
 part(polygon,extras=[]){
  const polygons=[polygon,...(extras||[])],points=polygons.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x=Math.floor(Math.min(...xs))-2,y=Math.floor(Math.min(...ys))-2,w=Math.ceil(Math.max(...xs))-x+3,h=Math.ceil(Math.max(...ys))-y+3;
  const canvas=this.make(w,h),g=canvas.getContext('2d');g.translate(-x,-y);g.beginPath();
  for(const p of polygons){g.moveTo(...p[0]);for(const q of p.slice(1))g.lineTo(...q);g.closePath();}
  g.clip();g.drawImage(this.source,0,0);return {canvas,x,y};
 }
 patch(center,radius){
  const polygon=Array.from({length:12},(_,i)=>[center[0]+Math.cos(i*TAU/12)*radius,center[1]+Math.sin(i*TAU/12)*radius]);
  return this.part(polygon);
 }
 point(p){return[this.anchor[0]+(p[0]-this.sourceAnchor[0])*this.scale,this.anchor[1]+(p[1]-this.sourceAnchor[1])*this.scale];}
 bodyPoint(p,state){
  const q=this.point(p),pivot=this.point(this.motion.torsoPivot||this.sourceAnchor),x=q[0]-pivot[0],y=q[1]-pivot[1],c=Math.cos(state.roll),s=Math.sin(state.roll);
  return[pivot[0]+x*c-y*s+state.shift[0],pivot[1]+x*s+y*c+state.shift[1]];
 }
 state(phase,walking){
  const wave=walking?Math.cos(TAU*phase):0;
  return{phase,walking,roll:walking?(this.vertical?.012:.008)*Math.sin(TAU*phase):0,
   shift:[walking?(this.vertical?.24*Math.sin(TAU*phase):this.facing*.33):0,walking?.55*Math.cos(TAU*phase*2):0],wave};
 }
 pose(phase,walking=true){
  // phase is the caller's distance / strideWorld. Keep distance-based cadence so stopping
  // cannot continue pedalling. Idle has its own straight-legged construction.
  const p=fract(phase*this.strideWorld/this.cycleWorld),frame=Math.floor(p*this.frameCount+1e-7)%this.frameCount,state=this.state(frame/this.frameCount,walking);
  const facingVector=this.vertical?[0,this.direction==='down'?.5:-.5]:[this.facing,0];
  const supplied=this.travelVector||facingVector,travel=Math.hypot(...supplied)>0?supplied:facingVector;
  const poses=this.legs.map((leg,i)=>{
   const t=fract(p+leg.phaseOffset),stance=!walking||t<.5,u=clamp((t-.5)/.5),recover=walking&&!stance?Math.sin(Math.PI*u):0;
   const halfStride=this.cycleWorld*.25;
   const forward=walking?(stance?halfStride-this.cycleWorld*t:mix(-halfStride,halfStride,ease(u))):0;
   const lift=walking&&!stance?Math.pow(recover,1.25)*this.lift:0;
   const hip=this.bodyPoint(leg.hipTarget||leg.hip,state);
   const width=this.motion.hipWidth||3.6,side=leg.layer==='front'?1:-1;
   if(this.vertical)hip[0]=this.anchor[0]+side*width*.5+state.shift[0];
   const ankleOffset=[(leg.sole[0]-leg.ankle[0])*this.scale,(leg.sole[1]-leg.ankle[1])*this.scale];
   const neutralHip=this.point(leg.hipTarget||leg.hip);
   const neutralX=this.vertical?this.anchor[0]+side*(width*.5+.08):neutralHip[0]+(walking?this.facing*.33:0)+side*this.facing*.5+ankleOffset[0]*.2;
   const ground=this.anchor[1]+(this.vertical?0:leg.layer==='back'?-.25:0);
   const sole=[neutralX+travel[0]*forward,ground+travel[1]*forward-lift];
   const ankle=[sole[0]-ankleOffset[0],sole[1]-ankleOffset[1]];
   const bend=walking?.35+3.55*recover:.18;
   // Art-directed knee travel: support is nearly extended; the recovery thigh
   // leads the boot. No spare bone length is forced into a crouch at rest.
   const knee=[mix(hip[0],ankle[0],.54)+travel[0]*bend,mix(hip[1],ankle[1],.54)+travel[1]*bend-recover*.75];
   let footAngle=0;
   if(walking&&this.facing){
    if(t<.08)footAngle=mix(-.11,0,t/.08);
    else if(t>.36&&t<.5)footAngle=mix(0,.14,(t-.36)/.14);
    else if(!stance)footAngle=.14*Math.sin(Math.PI*u)-.11*ease(clamp((u-.55)/.45));
    footAngle*=this.facing;
   }
   return{leg,hip,knee,ankle,sole,stance,phase:t,footAngle,lift,forward};
  });
  poses.state=state;return poses;
 }
 segment(ctx,part,sourceA,sourceB,targetA,targetB){
  const sourceAngle=Math.atan2(sourceB[1]-sourceA[1],sourceB[0]-sourceA[0]),targetAngle=Math.atan2(targetB[1]-targetA[1],targetB[0]-targetA[0]);
  const sourceLength=Math.hypot(sourceB[0]-sourceA[0],sourceB[1]-sourceA[1]),targetLength=Math.hypot(targetB[0]-targetA[0],targetB[1]-targetA[1]);
  ctx.save();ctx.translate(...targetA);ctx.rotate(targetAngle);ctx.scale(targetLength/sourceLength,this.scale);ctx.rotate(-sourceAngle);ctx.translate(-sourceA[0],-sourceA[1]);ctx.drawImage(part.canvas,part.x,part.y);ctx.restore();
 }
 attached(ctx,part,sourcePoint,targetPoint,angle=0){
  ctx.save();ctx.translate(...targetPoint);ctx.rotate(angle);ctx.scale(this.scale,this.scale);ctx.translate(-sourcePoint[0],-sourcePoint[1]);ctx.drawImage(part.canvas,part.x,part.y);ctx.restore();
 }
 armPose(arm,state){
  const shoulder=this.bodyPoint(arm.shoulder,state),opposite=state.walking?-Math.cos(TAU*(state.phase+arm.phaseOffset)):0;
  const forward=opposite*(this.motion.armAmplitude||3.2),vx=this.facing||0,vy=this.vertical?(this.direction==='down'?.5:-.5):0;
  const rest=arm.rest||[0,8];
  const hand=[shoulder[0]+rest[0]+vx*forward,shoulder[1]+rest[1]+vy*forward-Math.abs(forward)*.11];
  // A relaxed elbow, with the forearm arriving slightly after the upper arm.
  const delay=state.walking?Math.sin(TAU*(state.phase+arm.phaseOffset))*.32:0;
  const elbow=[mix(shoulder[0],hand[0],.52)-vx*.45+vx*delay,mix(shoulder[1],hand[1],.52)+.35];
  return{shoulder,elbow,hand};
 }
 drawArm(ctx,arm,state){
  const p=this.armPose(arm,state);this.segment(ctx,arm.upper,arm.shoulder,arm.elbow,p.shoulder,p.elbow);this.segment(ctx,arm.lower,arm.elbow,arm.hand,p.elbow,p.hand);
 }
 drawSecondary(ctx,layer,state){
  const r=this.bodyPoint(layer.root,state),part=layer.part;
  const wave=state.walking?Math.sin(TAU*(state.phase-layer.lag)):0;
  const dx=layer.tip[0]-layer.root[0],dy=layer.tip[1]-layer.root[1],length=Math.max(1,Math.hypot(dx,dy));
  const amplitude=Math.hypot(...layer.amplitude),angle=state.walking?wave*amplitude/(length*this.scale):0;
  // The attachment remains fixed. Distal hair and coat hems lag the weight shift.
  this.attached(ctx,part,layer.root,r,state.roll+angle*(dx<0?-1:1));
 }
 drawUpperBody(ctx,state){
  for(const layer of this.secondary.filter(s=>s.layer!=='front'))this.drawSecondary(ctx,layer,state);
  for(const arm of this.arms)this.drawArm(ctx,arm,state);
  const pivot=this.motion.torsoPivot||this.sourceAnchor;
  this.attached(ctx,{canvas:this.body,x:0,y:0},pivot,this.bodyPoint(pivot,state),state.roll);
  for(const layer of this.secondary.filter(s=>s.layer==='front'))this.drawSecondary(ctx,layer,state);
 }
 cleanFragments(ctx){
  const w=this.width,h=this.height,pixels=ctx.getImageData(0,0,w,h),data=pixels.data,seen=new Uint8Array(w*h);
  // The source masks leave a few detached dark outline flecks at sleeve cuffs.
  // Remove only tiny disconnected dark remnants; keep skin and hair highlights.
  for(let seed=0;seed<w*h;seed++){
   if(seen[seed]||data[seed*4+3]<40)continue;
   const todo=[seed],component=[];seen[seed]=1;let dark=0;
   for(let k=0;k<todo.length;k++){
    const at=todo[k];component.push(at);const i=at*4;if(Math.max(data[i],data[i+1],data[i+2])<145)dark++;
    const x=at%w,y=Math.floor(at/w);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
     const nx=x+dx,ny=y+dy,n=ny*w+nx;
     if(nx<0||ny<0||nx>=w||ny>=h||seen[n]||data[n*4+3]<40)continue;
     seen[n]=1;todo.push(n);
    }
   }
   if(component.length<=4&&dark/component.length>=.7)for(const at of component)data[at*4+3]=0;
  }
  for(let i=3;i<data.length;i+=4)if(data[i]<40)data[i]=0;
  ctx.putImageData(pixels,0,0);
 }

 renderFrame(phase,walking,canvas=this.canvas){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;
  const poses=this.pose(phase,walking),state=poses.state;
  const ordered=[...poses].sort((a,b)=>this.vertical?a.sole[1]-b.sole[1]:(a.leg.layer==='back'?-1:1)-(b.leg.layer==='back'?-1:1));
  for(const p of ordered){
   const l=p.leg;this.segment(ctx,l.upper,l.hip,l.knee,p.hip,p.knee);this.segment(ctx,l.lower,l.knee,l.ankle,p.knee,p.ankle);
   this.attached(ctx,l.anklePatch,l.ankle,p.ankle,p.footAngle);
   this.attached(ctx,l.foot,l.ankle,p.ankle,p.footAngle);
  }
  const key=walking?Math.floor(state.phase*this.frameCount+1e-7)%this.frameCount:'idle';
  if(!this.cache.has(key)){
   const upper=this.make(this.width,this.height),g=upper.getContext('2d');g.imageSmoothingEnabled=true;
   this.drawUpperBody(g,state);this.cleanFragments(g);this.cache.set(key,upper);
  }
  ctx.drawImage(this.cache.get(key),0,0);return canvas;
 }
 draw(phase,canvas=this.canvas,walking=true){
  // Legs use the exact travelled distance each draw, so the support foot stays
  // with the ground between the twelve torso/arm drawings. Only the upper body
  // is cached; the texture-defined knees and boots move continuously.
  return this.renderFrame(phase,walking,canvas);
 }

}
root.Tidemark=Object.assign(root.Tidemark||{},{TexturedLegRig});
})(globalThis);
