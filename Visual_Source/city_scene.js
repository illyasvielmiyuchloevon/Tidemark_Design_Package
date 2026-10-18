(function(root){
 'use strict';
 const T=32,ISO=.5,Z=Math.cos(Math.PI/6),PX=2,PAD=32,WATER=new Set(['W','C','O']);
 const shade=(hex,delta)=>{const n=parseInt(hex.slice(1),16);return '#'+[n>>16,n>>8&255,n&255].map(v=>Math.max(0,Math.min(255,v+delta)).toString(16).padStart(2,'0')).join('');};
 const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
 const threshold=f=>f.threshold||[(f.door[0]+.5)*T,(f.door[1]+.5)*T];
 class CityAssets{
  constructor({sources,manifest,createCanvas,loadImage}){
   this.sources=sources;this.manifest=manifest;this.make=createCanvas||((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
   this.load=loadImage||(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('城市素材载入失败'));i.src=src;}));
   this.sprites={};this.shadows=new WeakMap();this.cityBuildings=new Map();this.cityProps=new Map();
  }
  async init(){
   this.images=Object.fromEntries(await Promise.all(Object.entries(this.sources).map(async([key,src])=>[key,await this.load(src)])));
   for(const [key,atlas] of Object.entries(this.manifest.atlases)){
    if(key==='ground_materials'||key==='captain_rig'||key.startsWith('arch_'))continue;
    if(!this.images[key])throw new Error('Missing city atlas: '+key);
    this.sprites[key]=atlas.sprites.map(meta=>this.cut(this.images[key],meta));
   }
   this.architecture=new root.Tidemark.CityArchitecture({createCanvas:this.make});
   const directions=['down','up','left','right'],vectors=[[0,.5],[0,-.5],[-1,0],[1,0]];
   this.rigs=directions.map((direction,i)=>new root.Tidemark.TexturedLegRig({source:this.images.captain_rig,definition:this.manifest.rig.directions[direction],createCanvas:this.make,width:52,height:54,anchor:[26,46],visibleHeight:40,strideWorld:44,travelVector:vectors[i]}));
   this.rigSprites=this.rigs.map(rig=>({canvas:rig.canvas,width:52,height:54,anchorX:26,anchorY:46}));
   this.textures=this.manifest.atlases.ground_materials.sprites.map(meta=>{
    const c=this.make(128,128),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(this.images.ground_materials,...meta.rect,0,0,128,128);return ctx.getImageData(0,0,128,128);
   });
   return this;
  }
  cleanAlpha(ctx,w,h){const p=ctx.getImageData(0,0,w,h);for(let i=3;i<p.data.length;i+=4)p.data[i]=p.data[i]<32?0:p.data[i];ctx.putImageData(p,0,0);}
  cut(image,meta){const r=meta.rect,c=this.make(r[2],r[3]),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,...r,0,0,r[2],r[3]);this.cleanAlpha(ctx,r[2],r[3]);return{canvas:c,width:c.width,height:c.height,anchorX:meta.rootX??c.width/2,anchorY:meta.rootY??c.height};}
  prepareCity(map){
   this.releaseCity();
   for(const b of map.buildings)this.cityBuildings.set(b.id,this.architecture.building(map,b));
   for(const prop of map.props){const sprite=this.architecture.prop(map,prop);if(sprite)this.cityProps.set(prop,sprite);}
  }
  releaseCity(){this.cityBuildings.clear();this.cityProps.clear();this.shadows=new WeakMap();}
  building(building){return this.cityBuildings.get(building.id);}
  hero(direction,distance,moving,vector){const rig=this.rigs[direction];if(moving&&vector)rig.travelVector=vector;rig.draw(distance/44,undefined,moving);return this.rigSprites[direction];}
  citizen(index){return this.sprites.citizens[index%24];}
  prop(region,kind,variant,tree){const ri=Number(region.slice(1))-1,atlas=ri<6?'props_west':'props_east';let index;
   if(kind==='tree'){index=({pine:24,oak:25,palm:26,acacia:27})[tree]??25;return this.sprites[variant%2?(atlas==='props_west'?'props_east':'props_west'):atlas][index];}
   if(kind==='bush')index=28;else index=(ri%6)*4+({lamp:0,bench:1,well:2,crates:3,barrel:3}[kind]??3);
   return this.sprites[atlas][index];
  }
  ship(region){const ri=Number(region.slice(1))-1;return this.sprites.harbor_ships[[0,1,2,1,3,3,4,4,5,6,6,7][ri]];}
  shadow(sprite){if(this.shadows.has(sprite))return this.shadows.get(sprite);const c=this.make(sprite.width,sprite.height),ctx=c.getContext('2d');ctx.drawImage(sprite.canvas,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#132b3d';ctx.fillRect(0,0,c.width,c.height);this.shadows.set(sprite,c);return c;}
 }
 class CityScene{
  constructor({canvas,labels,assets,createCanvas}){this.canvas=canvas;this.labels=labels;this.assets=assets;this.make=createCanvas||assets.make;this.width=960;this.height=540;this.camera={x:0,y:0};this.scale=1;this.map=null;this.hits=[];this.wavePoints=[];this.ready=false;}
  resize(cssW,cssH){this.cssWidth=cssW;this.cssHeight=cssH;this.width=Math.max(1,Math.ceil(cssW/PX));this.height=Math.max(1,Math.ceil(cssH/PX));this.canvas.width=this.width;this.canvas.height=this.height;if(this.labels){this.labels.width=Math.round(cssW);this.labels.height=Math.round(cssH);}this.scale=cssW<650?.87:1;}
  loadMap(map,player){this.assets.prepareCity(map);this.map=map;this.floor=this.make(map.width*T,Math.ceil(map.height*T*ISO)+PAD*2);this.camera={x:player.x,y:player.y};this.buildFloor();this.findMooring();this.ready=true;}
  dispose(){this.assets.releaseCity();this.ready=false;this.map=null;this.floor=null;this.mini=null;this.wavePoints=[];this.hits=[];this.floorStats=null;}
  level(tx,ty){const m=this.map;if(!m)return 0;tx=Math.max(0,Math.min(m.width-1,tx));ty=Math.max(0,Math.min(m.height-1,ty));return WATER.has(m.tiles[ty][tx])?0:Number(m.heightRows[ty][tx]);}
  elevation(x,y){return this.level(Math.floor(x/T),Math.floor(y/T))*7;}
  project(x,y,z=this.elevation(x,y)){return[(x-this.camera.x)*this.scale+this.width/2,(y-this.camera.y)*ISO*this.scale+this.height/2-z*Z*this.scale];}
  groundAt(cssX,cssY){const bx=cssX/PX,by=cssY/PX;let x=(bx-this.width/2)/this.scale+this.camera.x,y=(by-this.height/2)/this.scale/ISO+this.camera.y;for(let i=0;i<3;i++)y=(by-this.height/2+this.elevation(x,y)*Z*this.scale)/this.scale/ISO+this.camera.y;return[x,y];}
  buildFloor(){
   const m=this.map,ctx=this.floor.getContext('2d'),rng=random(m.seed);
   const baked=root.Tidemark.bakeNoiseGround(m,root.Tidemark.cityTerrainOptions(m,this.assets.textures));
   this.floorStats=baked.stats;
   const flat=this.make(baked.width,baked.height),fc=flat.getContext('2d'),pixels=fc.createImageData(baked.width,baked.height);pixels.data.set(baked.data);fc.putImageData(pixels,0,0);
   ctx.imageSmoothingEnabled=false;this.wavePoints=[];
   // Material masks were baked in one continuous plane. Only elevation breaks
   // split the projection into horizontal runs; UVs and noise never restart.
   for(let y=0;y<m.height;y++){
    let x=0;
    while(x<m.width){const lev=this.level(x,y),start=x;while(x<m.width&&this.level(x,y)===lev)x++;const sy=Math.round(y*T*ISO-lev*7*Z)+PAD;
     ctx.drawImage(flat,start*T,y*T,(x-start)*T,T,start*T,sy,(x-start)*T,T*ISO);
    }
    for(let tx=0;tx<m.width;tx++){
     const lev=this.level(tx,y),below=y+1<m.height?this.level(tx,y+1):lev,code=m.tiles[y][tx];
     if(lev>below){const top=Math.round((y+1)*T*ISO-lev*7*Z)+PAD,depth=Math.round((lev-below)*7*Z);ctx.fillStyle=shade(m.palette.stone,-36);ctx.fillRect(tx*T,top,T,depth);ctx.fillStyle=shade(m.palette.stone,-9);ctx.fillRect(tx*T,top,T,1);ctx.fillStyle=shade(m.palette.stone,-22);ctx.fillRect(tx*T+((tx%2)*7),top+3,13,1);}
     if(WATER.has(code)&&rng()<.16)this.wavePoints.push({x:(tx+rng())*T,y:(y+rng())*T,phase:rng()*6,len:3+rng()*11});
     if((code==='B'||code==='D')&&y+1<m.height&&WATER.has(m.tiles[y+1][tx])){const sy=Math.round((y+1)*T*ISO-lev*7*Z)+PAD;ctx.fillStyle='#58442f';ctx.fillRect(tx*T,sy,T,2);ctx.fillStyle='#b89a6b';ctx.fillRect(tx*T,sy,T,1);}
    }
   }
   this.mini=this.make(m.width*2,m.height*2);const mc=this.mini.getContext('2d'),base={G:m.palette.ground,R:m.palette.stone,P:shade(m.palette.stone,12),S:'#c9bb88',W:shade(m.palette.water,-18),O:m.palette.water,C:m.palette.water,B:'#8e7050',D:'#967955',X:shade(m.palette.ground,-30)};
   for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){mc.fillStyle=base[m.tiles[y][x]];mc.fillRect(x*2,y*2,2,2);}
   for(const b of m.buildings){mc.fillStyle=b.kind==='home'?'#8b6250':'#e8c77f';mc.fillRect(b.x*2,b.y*2,b.w*2,b.h*2);}
  }
  findMooring(){const m=this.map,dock=m.facilities.find(f=>f.kind==='exit'),[dx,dy]=threshold(dock);let best=null;
   for(let y=2;y<m.height-2;y++)for(let x=3;x<m.width-3;x++){
    if(!WATER.has(m.tiles[y][x]))continue;const dist=Math.hypot((x+.5)*T-dx,(y+.5)*T-dy);if(best&&dist>=best.dist)continue;
    let fits=true;for(let yy=y-1;yy<=y;yy++)for(let xx=x-2;xx<=x+2;xx++)if(!WATER.has(m.tiles[yy][xx]))fits=false;
    if(fits)best={x:(x+.5)*T,y:(y+.5)*T,dist};
   }
   this.mooring=best;
  }
  drawSprite(ctx,sprite,x,y,width,alpha=1){const factor=width/sprite.width,height=sprite.height*factor;ctx.save();ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=false;ctx.drawImage(sprite.canvas,Math.round(x-sprite.anchorX*factor),Math.round(y-sprite.anchorY*factor),Math.round(width),Math.round(height));ctx.restore();return{left:x-sprite.anchorX*factor,top:y-sprite.anchorY*factor,right:x+(sprite.width-sprite.anchorX)*factor,bottom:y+(sprite.height-sprite.anchorY)*factor,height};}
  drawShadow(ctx,sprite,x,y,width,opacity=.17){const factor=width/sprite.width;ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.transform(1,0,-.5,-.24,0,0);ctx.globalAlpha=opacity;ctx.imageSmoothingEnabled=false;ctx.drawImage(this.assets.shadow(sprite),Math.round(-sprite.anchorX*factor),Math.round(-sprite.anchorY*factor),Math.round(width),Math.round(sprite.height*factor));ctx.restore();}
  drawBuildingShadow(ctx,entity){
   const {b,q,width,sprite}=entity,zoom=this.scale;
   if(sprite.shadow){const s=sprite.shadow;this.drawSprite(ctx,s,q[0],q[1],(s.worldWidth||s.width)*zoom,.21);return;}
   const half=b.w*T*.5,depth=b.h*T,wall=sprite.wallHeight||sprite.worldHeight||70;
   const corners=[[-half,-depth],[half,-depth],[half,0],[-half,0]],offset=[wall*.52,wall*.34];
   const points=[...corners,...corners.map(c=>[c[0]+offset[0],c[1]+offset[1]])].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
   const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
   const hull=[];for(const c of points){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),c)<=0)hull.pop();hull.push(c);}
   const lower=hull.length;for(let i=points.length-2;i>=0;i--){const c=points[i];while(hull.length>lower&&cross(hull.at(-2),hull.at(-1),c)<=0)hull.pop();hull.push(c);}hull.pop();
   ctx.save();ctx.fillStyle='#253c513d';ctx.beginPath();
   for(let i=0;i<hull.length;i++){const c=hull[i],x=q[0]+c[0]*zoom,y=q[1]+c[1]*ISO*zoom;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
   ctx.closePath();ctx.fill();ctx.restore();
  }
  hitTest(cssX,cssY){const x=cssX/PX,y=cssY/PX;for(let i=this.hits.length-1;i>=0;i--){const h=this.hits[i];if(x>=h.rect[0]&&x<=h.rect[2]&&y>=h.rect[1]&&y<=h.rect[3])return h.target;}return null;}
  render(controller,time=0,dt=.016){
   if(!this.ready)return;
   const m=this.map,p=controller.player,ctx=this.canvas.getContext('2d'),w=this.width,h=this.height,zoom=this.scale;
   ctx.imageSmoothingEnabled=false;const follow=1-Math.exp(-Math.min(dt,.1)*8);this.camera.x+=(p.x-this.camera.x)*follow;this.camera.y+=(p.y-this.camera.y)*follow;
   const halfW=w/(zoom*2),halfH=h/(ISO*zoom*2);
   this.camera.x=Math.max(halfW,Math.min(m.width*T-halfW,this.camera.x));
   this.camera.y=Math.max(halfH,Math.min(m.height*T-halfH,this.camera.y));
   ctx.fillStyle=shade(m.palette.water,-26);ctx.fillRect(0,0,w,h);ctx.drawImage(this.floor,Math.round(w/2-this.camera.x*zoom),Math.round(h/2-this.camera.y*ISO*zoom-PAD*zoom),Math.round(this.floor.width*zoom),Math.round(this.floor.height*zoom));
   for(const wave of this.wavePoints){const q=this.project(wave.x,wave.y,0);if(q[0]<0||q[1]<0||q[0]>w||q[1]>h)continue;ctx.globalAlpha=.06+Math.max(0,Math.sin(time*.0013+wave.phase))*.14;ctx.fillStyle='#c3dfd7';ctx.fillRect(Math.round(q[0]+Math.sin(time*.00045+wave.phase)*2),Math.round(q[1]),Math.round(wave.len*zoom),1);}ctx.globalAlpha=1;
   if(this.mooring){const q=this.project(this.mooring.x,this.mooring.y,0),boat=this.assets.ship(m.region_id);this.drawShadow(ctx,boat,q[0]+2,q[1]+2,132*zoom,.12);this.drawSprite(ctx,boat,q[0],q[1]+Math.sin(time*.0014)*.6,132*zoom);}
   const entities=[];this.hits=[];const pq=this.project(p.x,p.y);
   for(const b of m.buildings){
    const [x,y]=b.baseWorld||[(b.x+b.w*.5)*T,(b.y+b.h)*T],z=(b.baseLevel??this.level(b.x,b.y))*7,q=this.project(x,y,z),sprite=this.assets.building(b),width=(sprite.worldWidth||sprite.width)*zoom,height=width*sprite.height/sprite.width;
    if(q[0]+width<0||q[0]-width>w||q[1]<-20||q[1]-height>h)continue;
    const occludes=p.y<y&&pq[1]>q[1]-height-12*zoom&&pq[1]<q[1]+5&&Math.abs(pq[0]-q[0])<width*.5;
    const e={kind:'building',b,sprite,q,x,y,z,width,alpha:occludes?.43:1};entities.push(e);
    ctx.fillStyle='#16324629';const contactWidth=b.w*T*zoom;ctx.fillRect(Math.round(q[0]-contactWidth*.5),Math.round(q[1]-2*zoom),Math.round(contactWidth),Math.ceil(3*zoom));this.drawBuildingShadow(ctx,e);
   }
   for(const prop of m.props){const x=(prop.tile[0]+.5)*T,y=(prop.tile[1]+.5)*T,q=this.project(x,y);if(q[0]<-100||q[0]>w+100||q[1]<-10||q[1]>h+110)continue;
    const model=this.assets.cityProps.get(prop),sprite=model||this.assets.prop(m.region_id,prop.kind,prop.variant,m.tree_type),targetHeight=({tree:64+(prop.variant%3)*6,bush:15})[prop.kind]||24,width=model?(sprite.worldWidth||sprite.width)*zoom:targetHeight*sprite.width/sprite.height*zoom;
    entities.push({kind:'prop',prop,sprite,q,x,y,width,alpha:1});if(['tree','lamp','well'].includes(prop.kind))this.drawShadow(ctx,sprite,q[0],q[1],width,.14);
   }
   for(const npc of controller.npcs){const q=this.project(npc.x,npc.y);if(q[0]<-25||q[0]>w+25||q[1]<0||q[1]>h+40)continue;const sprite=this.assets.citizen(npc.sprite),width=34*sprite.width/sprite.height*zoom;entities.push({kind:'npc',npc,sprite,q,x:npc.x,y:npc.y,width,alpha:1});}
   const hero=this.assets.hero(p.direction,p.walkDistance||0,p.moving,[p.motionX||0,(p.motionY||0)*ISO]);entities.push({kind:'player',sprite:hero,q:pq,x:p.x,y:p.y,width:hero.width*zoom,alpha:1});
   if(controller.path.length){ctx.fillStyle='#f2d89570';for(let i=0;i<controller.path.length;i+=2){const q=this.project(...controller.path[i]);if(q[0]<0||q[0]>w||q[1]<0||q[1]>h)continue;ctx.fillRect(Math.round(q[0]),Math.round(q[1]),2,1);}const q=this.project(...controller.path.at(-1));ctx.strokeStyle='#f5dfa2';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(q[0],q[1],6,3,0,0,Math.PI*2);ctx.stroke();}
   const order={building:0,prop:1,npc:2,player:3};entities.sort((a,b)=>a.y-b.y||order[a.kind]-order[b.kind]);
   for(const e of entities){const{q,sprite,width}=e;
    if(e.kind==='building'){
     const ground=this.project(e.x,e.y+1),drop=ground[1]-q[1];
     if(drop>1){ctx.globalAlpha=e.alpha;ctx.fillStyle=shade(m.palette.stone,-32);ctx.fillRect(Math.round(q[0]-width*.49),Math.round(q[1]-1),Math.round(width*.98),Math.ceil(drop+1));ctx.fillStyle=shade(m.palette.stone,-8);ctx.fillRect(Math.round(q[0]-width*.49),Math.round(q[1]),Math.round(width*.98),1);for(let step=0;step<3;step++){ctx.fillStyle=shade(m.palette.stone,-8-step*8);ctx.fillRect(Math.round(q[0]-8*zoom),Math.round(q[1]+step*drop/3),Math.round(16*zoom),Math.max(1,Math.ceil(drop/3)));}ctx.globalAlpha=1;}
    }
    if(e.kind==='player'||e.kind==='npc'){ctx.fillStyle='#18394b55';ctx.beginPath();ctx.ellipse(q[0],q[1],6*zoom,3*zoom,0,0,Math.PI*2);ctx.fill();}
    const box=this.drawSprite(ctx,sprite,q[0],q[1],width,e.alpha);
    if(e.kind==='building'&&e.b.kind!=='home'){const f=m.facilities.find(f=>f.buildingId===e.b.id);if(f)this.hits.push({target:{kind:'facility',id:f.id},rect:[box.left,box.top,box.right,box.bottom+5]});}
    else if(e.kind==='npc')this.hits.push({target:{kind:'npc',id:e.npc.id},rect:[box.left,box.top,box.right,box.bottom+4]});
    if(e.kind==='prop'&&e.prop.kind==='lamp'){const lx=q[0],ly=q[1]-(sprite.geometry?70*Z:33)*zoom,g=ctx.createRadialGradient(lx,ly,0,lx,ly,23*zoom);g.addColorStop(0,'#ffe1a33d');g.addColorStop(1,'#ffc16b00');ctx.fillStyle=g;ctx.fillRect(lx-24*zoom,ly-24*zoom,48*zoom,48*zoom);}
   }
   const light=ctx.createLinearGradient(0,0,w,h);light.addColorStop(0,'#ffe0ad13');light.addColorStop(.45,'#ffdda700');light.addColorStop(1,'#12314620');ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
   const edge=ctx.createLinearGradient(0,0,0,h);edge.addColorStop(0,'#17394b2b');edge.addColorStop(.19,'#17394b00');edge.addColorStop(.82,'#17394b00');edge.addColorStop(1,'#142a4330');ctx.fillStyle=edge;ctx.fillRect(0,0,w,h);
   ctx.save();ctx.beginPath();ctx.rect(0,0,w,h*.08);ctx.rect(0,h*.94,w,h*.06);ctx.clip();ctx.filter='blur(0.55px)';ctx.drawImage(this.canvas,0,0);ctx.restore();
   this.drawLabels(controller);
  }
  drawLabels(controller){
   if(!this.labels)return;const ctx=this.labels.getContext('2d'),m=this.map;ctx.clearRect(0,0,this.labels.width,this.labels.height);ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';const visible=[],colors={market:'#f5dca3',tavern:'#e8c2d7',guild:'#bad9f3',supply:'#bbe0cf',shipyard:'#c9d6ed',landmark:'#edd58f',exit:'#e5d2ab'};
   for(const f of m.facilities){const t=threshold(f),q=this.project(...t),x=q[0]*PX,y=q[1]*PX;if(x<25||x>this.cssWidth-25||y<60||y>this.cssHeight-70)continue;const near=Math.hypot(controller.player.x-t[0],controller.player.y-t[1])<110,label=({market:'交易所',tavern:'酒馆',guild:'行会',supply:'补给',shipyard:'船厂',exit:'出海'})[f.kind]||f.name;
    ctx.font=(near?'600 15':'500 13')+'px "Noto Sans CJK SC","Microsoft YaHei",sans-serif';const tw=ctx.measureText(label).width,box=[x-tw/2-5,y+7,x+tw/2+5,y+31];if(visible.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))continue;visible.push(box);ctx.strokeStyle='#153447';ctx.lineWidth=4;ctx.strokeText(label,x,y+18);ctx.fillStyle=colors[f.kind];ctx.fillText(label,x,y+18);if(near){ctx.fillStyle='#ffe29c';ctx.fillRect(Math.round(x-2),Math.round(y-7),4,4);}
   }
  }
  renderMini(canvas,player){const ctx=canvas.getContext('2d'),m=this.map;ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(this.mini,0,0,canvas.width,canvas.height);const sx=canvas.width/(m.width*T),sy=canvas.height/(m.height*T);for(const f of m.facilities){const[x,y]=threshold(f);ctx.fillStyle=f.kind==='exit'?'#6ed5da':'#fff0b5';ctx.fillRect(Math.round(x*sx)-1,Math.round(y*sy)-1,3,3);}ctx.fillStyle='#0d2b44';ctx.fillRect(Math.round(player.x*sx)-2,Math.round(player.y*sy)-2,5,5);ctx.fillStyle='#ffce76';ctx.fillRect(Math.round(player.x*sx)-1,Math.round(player.y*sy)-1,3,3);}
 }
 root.Tidemark=Object.assign(root.Tidemark,{CityAssets,CityScene,CITY_CAMERA:{yaw:0,elevation:30,groundY:ISO,heightY:Z}});
})(globalThis);
