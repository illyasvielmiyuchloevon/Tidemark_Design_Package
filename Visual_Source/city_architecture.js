/* Deterministic world-space architectural meshes, baked by an orthographic pixel rasterizer.
 * Projection matches CityScene exactly: screen=(x, .5*y-.866025403784*z).
 * Coordinates use the south centre of the collision footprint as (0,0,0).
 * No image dependencies; textures live in object space and are sampled at native pixels.
 */
(function(root){
 'use strict';
 const G=.5,Z=Math.sqrt(3)/2,TAU=Math.PI*2;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const mod=(n,d)=>(n%d+d)%d;
 const hash=(x,y,s=0)=>{let n=Math.imul(Math.floor(x)+374761393,668265263)^Math.imul(Math.floor(y)+s*101,2246822519);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
 const color=c=>typeof c==='string'?[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]:c;
 const mat=(type,c,seed=1)=>({type,c:color(c),seed});
 const M={stone:mat('stone','#b8ad91'),trim:mat('stone','#d3c7a7'),dark:mat('plain','#29343a'),wood:mat('wood','#72503b'),edge:mat('wood','#423b34'),glass:mat('glass','#355e66'),gold:mat('metal','#ad8e4e'),water:mat('water','#3e7778'),leaf:mat('leaf','#637744'),flower:mat('plain','#b66375'),rope:mat('wood','#bf9b62')};
 function sample(m,u,v,x,y,z,light){
  const cx=Math.floor(u),cy=Math.floor(v),n=hash(cx,cy,m.seed),b=hash(Math.floor(u/13),Math.floor(v/11),m.seed),t=m.type;
  let d=(Math.floor(hash(Math.floor(u/2),Math.floor(v/2),m.seed)*5)-2)*1.6+(b-.5)*7;
  if(t==='stucco'){d+=(hash(Math.floor(u/7),Math.floor(v/9),m.seed+23)-.5)*7;if(hash(Math.floor(u/3),Math.floor(v/2),m.seed+17)>.945)d-=8;if(z<9)d-=7;}
  else if(t==='brick'||t==='stone'){
   const rh=t==='brick'?5:9,cw=t==='brick'?12:18,row=Math.floor(v/rh),fu=mod(u+(row%2)*cw*.5,cw),fv=mod(v,rh),c=hash(Math.floor((u+(row%2)*cw*.5)/cw),row,m.seed);
   d+=(c-.5)*(t==='brick'?30:15);if(fv<.85||fu<.8)d-=t==='brick'?27:22;else if(fv<1.7||fu<1.4)d+=9;
  }else if(t==='tile'||t==='slate'||t==='thatch'){
   const cw=t==='thatch'?3.2:4.7,rh=t==='thatch'?9:6.4,row=Math.floor(v/rh),fu=mod(u+(row%2)*1.1,cw),fv=mod(v,rh),c=hash(Math.floor((u+(row%2)*1.1)/cw),row,m.seed);
   d+=(c-.5)*20;if(t==='thatch'){d+=fu<1?-18:8;if(fv>7)d-=13;}
   else{if(fu<.8)d-=20;else if(fu<1.65)d+=15;if(fv<.85)d-=32;else if(fv<1.7)d+=8;}
  }else if(t==='azulejo'){const fu=mod(u,6),fv=mod(v,6),dist=Math.abs(fu-3)+Math.abs(fv-3);d+=dist<2?-28:dist<3?16:32;if(fu<.7||fv<.7)d=-35;}else if(t==='wood'){
   const fu=mod(u,6);d+=(hash(Math.floor(u/6),Math.floor(v/24),m.seed)-.5)*16;if(fu<.8)d-=21;if(mod(v+hash(Math.floor(u/6),0,m.seed)*15,17)<.65)d-=9;
  }else if(t==='glass'){d+=mod(u+v*.3,9)<1?34:0;d+=v%9<1?-18:0;}
  else if(t==='metal')d+=mod(u,4)<1?18:-2;
  else if(t==='leaf')d+=(n-.5)*30;
  else if(t==='water')d+=Math.sin(u*.6+v*.5)*12;
  const sh=light||1;return[clamp(Math.round(m.c[0]*sh+d),0,255),clamp(Math.round(m.c[1]*sh+d),0,255),clamp(Math.round(m.c[2]*sh+d),0,255)];
 }
 class Mesh{
  constructor(seed=1){this.faces=[];this.seed=seed;}
  face(p,m,uv){if(p.length<3)return;this.faces.push({p,m,uv:uv||p.map(q=>[q[0],q[2]])});}
  quad(p,m,uv){this.face(p,m,uv);}
  box(x,y,z,w,d,h,m,top=m){if(w<=0||d<=0||h<=0)return;const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],e=[x,y+d,z],A=[x,y,z+h],B=[x+w,y,z+h],C=[x+w,y+d,z+h],E=[x,y+d,z+h];this.face([e,c,C,E],m);this.face([a,A,B,b],m);this.face([a,e,E,A],m,pUV([a,e,E,A],'yz'));this.face([b,B,C,c],m,pUV([b,B,C,c],'yz'));this.face([A,E,C,B],top,pUV([A,E,C,B],'xy'));}
  cyl(x,y,z,r,h,m,n=12,top=m){let ring=[];for(let i=0;i<n;i++){const a=TAU*i/n,b=TAU*(i+1)/n,A=[x+Math.cos(a)*r,y+Math.sin(a)*r,z],B=[x+Math.cos(b)*r,y+Math.sin(b)*r,z],C=[B[0],B[1],z+h],D=[A[0],A[1],z+h];this.face([A,B,C,D],m,[[r*a,z],[r*b,z],[r*b,z+h],[r*a,z+h]]);ring.push(D);}this.face(ring,top,pUV(ring,'xy'));}
  cone(x,y,z,r,h,m,n=16){for(let i=0;i<n;i++){const a=TAU*i/n,b=TAU*(i+1)/n,A=[x+Math.cos(a)*r,y+Math.sin(a)*r,z],B=[x+Math.cos(b)*r,y+Math.sin(b)*r,z],C=[x,y,z+h];this.face([A,B,C],m,[[r*a,0],[r*b,0],[r*(a+b)/2,h]]);}}
  sphere(x,y,z,rx,ry,rz,m,n=14,steps=6){for(let j=0;j<steps;j++)for(let i=0;i<n;i++){const a=TAU*i/n,b=TAU*(i+1)/n,t=Math.PI*j/steps,u=Math.PI*(j+1)/steps;const f=(q,r)=>[x+rx*Math.sin(r)*Math.cos(q),y+ry*Math.sin(r)*Math.sin(q),z+rz*Math.cos(r)];this.face([f(a,t),f(b,t),f(b,u),f(a,u)],m,[[i*4,j*5],[(i+1)*4,j*5],[(i+1)*4,(j+1)*5],[i*4,(j+1)*5]]);}}
 }
 function pUV(p,axes){const a=axes==='xy'?0:1,b=axes==='xy'?1:2;return p.map(q=>[q[a],q[b]]);}
 function plate(mesh,x,y,z,w,h,m){mesh.face([[x,y,z],[x+w,y,z],[x+w,y,z+h],[x,y,z+h]],m);}
 function archShape(x,y,z,w,h){const r=w/2,p=[[x,y,z],[x+w,y,z],[x+w,y,z+h-r]];for(let i=0;i<=10;i++){const a=Math.PI*i/10;p.push([x+w/2+Math.cos(a)*r,y,z+h-r+Math.sin(a)*r]);}return p;}
 function arch(mesh,x,y,z,w,h,fill,trim=M.trim){mesh.face(archShape(x-3,y,z,w+6,h+3),trim);mesh.face(archShape(x,y+.25,z,w,h),fill);}
 function framedWindow(mesh,x,y,z,w=16,h=26,c,shutters=true){
  if(['china','japan','korea'].includes(c.family)){
   mesh.box(x-2,y,z-2,w+4,2,h+4,c.wood);plate(mesh,x,y+2.2,z,w,h,c.family==='japan'?mat('wood','#c5b68d'):M.dark);
   for(let xx=x+1;xx<x+w;xx+=3.5)mesh.box(xx,y+2.5,z,.9,1,h,c.wood);for(let zz=z+5;zz<z+h;zz+=7)mesh.box(x,y+2.5,zz,w,1,1,c.wood);
   mesh.box(x-3,y+1,z-3,w+6,4,2,c.wood);return;
  }
  mesh.box(x-2,y,z-2,w+4,1.6,h+4,c.trim||M.trim);plate(mesh,x,y+1.7,z,w,h,M.dark);plate(mesh,x+1.2,y+1.9,z+1.3,w-2.4,h-2.6,M.glass);
  mesh.box(x+w/2-.6,y+2.1,z,1.2,1,h,c.wood);mesh.box(x,y+2.1,z+h*.56,w,1,1.25,c.wood);mesh.box(x-3,y,z-3,w+6,3.7,2.5,c.trim||M.trim);
  if(shutters){for(const sx of [x-8,x+w+1.2]){mesh.box(sx,y+1,z,6.5,1.5,h,c.accent);for(let zz=z+3;zz<z+h;zz+=4)mesh.box(sx,y+2.7,zz,6.5,.45,.8,c.wood);}}
 }
 function door(mesh,x,y,z,c,width=21,height=52,arched=true){
  if(arched)arch(mesh,x-width/2,y+.6,z,width,height,['iberian','caribbean','colonial','china'].includes(c.family)?c.accent:c.wood,c.trim);else{mesh.box(x-width/2-3,y,z,width+6,2,height+3,c.trim);plate(mesh,x-width/2,y+2.2,z,width,height,c.wood);}
  for(let xx=x-width/2+3;xx<x+width/2;xx+=4)mesh.box(xx,y+2.8,z+1,.8,.45,height-8,M.edge);
  mesh.box(x+width*.23,y+3,z+height*.43,2.2,1,2,M.gold);mesh.box(x-width/2-5,y-1,z-2,width+10,7,2,c.trim);
 }
 function cornice(mesh,x,y,z,w,d,c){mesh.box(x-2,y-2,z-2,w+4,d+4,2,c.wood);mesh.box(x-3,y-3,z,w+6,d+6,2,c.trim);}
 function roof(mesh,x,y,z,w,d,rise,c,type='hip',over=4){
  const X=x-over,Y=y-over,W=w+2*over,D=d+2*over,H=z+rise,front=Y+D;
  mesh.box(X,Y,z-2,W,D,2,c.wood);
  if(type==='flat'){mesh.box(X,Y,z,W,D,3,c.trim);for(const q of [[X,Y,W,3],[X,front-3,W,3],[X,Y,3,D],[X+W-3,Y,3,D]])mesh.box(q[0],q[1],z+3,q[2],q[3],7,c.wall);return;}
  if(type==='gable'){
   const a=[X,Y,z],b=[X+W,Y,z],r=[X+W/2,Y,H],A=[X,front,z],B=[X+W,front,z],R=[X+W/2,front,H];
   mesh.face([a,A,R,r],c.roof,[[Y,0],[front,0],[front,Math.hypot(W/2,rise)],[Y,Math.hypot(W/2,rise)]]);mesh.face([r,R,B,b],c.roof,[[Y,0],[front,0],[front,Math.hypot(W/2,rise)],[Y,Math.hypot(W/2,rise)]]);mesh.face([A,B,R],c.wall);mesh.box(X+W/2-1,Y,z+rise,W>0?2:2,D,1.7,c.trim);
  }else{
   const a=[X,Y,z],b=[X+W,Y,z],A=[X,front,z],B=[X+W,front,z],r=[X+W*.23,Y+D*.47,H],R=[X+W*.77,Y+D*.47,H];
   const riseD=Math.hypot(D*.53,rise);mesh.face([A,B,R,r],c.roof,[[X,riseD],[X+W,riseD],[R[0],0],[r[0],0]]);mesh.face([a,r,R,b],c.roof,[[X,riseD],[r[0],0],[R[0],0],[X+W,riseD]]);mesh.face([a,A,r],c.roof,[[Y,0],[front,0],[r[1],Math.hypot(W*.23,rise)]]);mesh.face([b,R,B],c.roof,[[Y,0],[R[1],Math.hypot(W*.23,rise)],[front,0]]);mesh.box(r[0]-.8,r[1]-.8,H,R[0]-r[0]+1.6,1.6,1.5,c.ridge||c.roof);
  }
 }
 function curvedRoof(mesh,x,y,z,w,d,rise,c,over=8){
  if(c.family==='china'||c.family==='korea'||c.family==='japan'){
   const X=x-over,Y=y-over,W=w+2*over,D=d+2*over,xs=[0,.12,.28,.5,.72,.88,1],ys=[0,.16,.36,.5,.67,.84,1],heights=[5,rise*.32,rise*.78,rise,rise*.58,rise*.20,4];
   const point=(i,j)=>[X+xs[i]*W,Y+ys[j]*D,z+heights[j]+Math.pow(Math.abs(xs[i]-.5)*2,6)*(c.family==='japan'?2.5:7)];
   for(let j=0;j<ys.length-1;j++)for(let i=0;i<xs.length-1;i++){const p=[point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)];mesh.face(p,c.roof,p.map(a=>[a[0],a[1]*1.2]));}
   mesh.box(X,Y+D-2,z+1,W,3,3,c.wood);mesh.box(x+w*.18,Y+D*.5,z+rise+1,w*.64,2,3,c.trim);for(const xx of [x+w*.18,x+w*.82])mesh.box(xx,Y+D*.5,z+rise+2,2,2,6,c.trim);return;
  }
  const X=x-over,Y=y-over,W=w+2*over,D=d+2*over;mesh.box(X,Y,z,W,D,2,c.wood);
  const cross=[[-.5,5],[-.40,1],[-.27,rise*.22],[-.12,rise*.71],[0,rise],[.12,rise*.71],[.27,rise*.22],[.40,1],[.5,5]];
  for(let i=0;i<cross.length-1;i++){const a=cross[i],b=cross[i+1],aX=x+w/2+a[0]*W,bX=x+w/2+b[0]*W;mesh.face([[aX,Y,z+a[1]],[aX,Y+D,z+a[1]],[bX,Y+D,z+b[1]],[bX,Y,z+b[1]]],c.roof,[[Y,aX],[Y+D,aX],[Y+D,bX],[Y,bX]]);}
  mesh.face(cross.map(p=>[x+w/2+p[0]*W,Y+D,z+p[1]]),c.wall);mesh.box(x+w/2-1.3,Y-2,z+rise,2.6,D+4,2,c.trim);
 }
 function chimney(mesh,x,y,z,c){mesh.box(x,y,z,8,9,25,c.wall);mesh.box(x-1,y-1,z+23,10,11,3,c.roof);mesh.box(x+1,y+1,z+26,6,7,1,M.dark);}
 function planter(mesh,x,y,z,w=16){mesh.box(x,y,z,w,5,4,mat('tile','#946945'));for(let i=0;i<Math.ceil(w/3);i++){const xx=x+2+i*3;mesh.sphere(xx,y+2,z+6+hash(i,x)*2,3.5,3.1,3.1,M.leaf,7,3);if(i%2)mesh.sphere(xx,y+3,z+8,1.2,1,1.1,M.flower,5,3);}}
 function balcony(mesh,x,y,z,w,c){mesh.box(x-3,y,z-3,w+6,13,3,c.trim);mesh.box(x-3,y+10,z,w+6,2,18,c.wood);for(let xx=x-3;xx<x+w+3;xx+=5)mesh.box(xx,y+10,z,1.5,2,18,c.accent);mesh.box(x-4,y+9,z+18,w+8,4,2,c.wood);}
 function porch(mesh,x,y,z,w,depth,c,h=52){mesh.box(x,y,z,w,depth,3,c.trim);for(const xx of [x+4,x+w-8]){mesh.box(xx,y+depth-6,z,4,4,h,c.wood);mesh.box(xx-2,y+depth-8,z+h-4,8,8,4,c.trim);}roof(mesh,x,y,z+h,w,depth,8,c,'hip',2);}
 function awning(mesh,x,y,z,w,depth,c,striped=true){const count=Math.max(3,Math.round(w/9)),sw=w/count;for(let i=0;i<count;i++){const m=striped&&(i%2===0)?mat('stucco','#dbcd9c'):c.accent;mesh.face([[x+i*sw,y,z+7],[x+(i+1)*sw,y,z+7],[x+(i+1)*sw,y+depth,z],[x+i*sw,y+depth,z]],m,pUV([[x+i*sw,y,z+7],[x+(i+1)*sw,y,z+7],[x+(i+1)*sw,y+depth,z],[x+i*sw,y+depth,z]],'xy'));mesh.box(x+i*sw,y+depth,z-4,sw,1,4,m);}for(const xx of [x,x+w-2])mesh.box(xx,y+depth-1,0,2,2,z,c.wood);}
 function culture(region,port){const n=Number(String(region||'R02').slice(1)),p=Number(String(port||'P011').slice(1));let family=['north','iberian','med','west','swahili','arab','india','southeast','china','caribbean','colonial','pacific'][n-1]||'iberian';if(n===4&&p<=37)family='iberian';if(n===5&&p===43)family='cape';if(n===9&&[89,90,91,94].includes(p))family='japan';if(n===9&&p===88)family='ryukyu';if(n===9&&[92,93].includes(p))family='korea';if(n===10&&p>=103)family='northcolonial';if(n===12&&p<=114)family='timor';return family;}
 function palette(family,seed=1){
  const P={north:['#af7460','#607a78','#6f5541','#d4bd92','brick'],iberian:['#e0d3b7','#b75f38','#4c7a8e','#d5bd94','stucco'],med:['#cebd97','#b17447','#688185','#d5c39a','stone'],west:['#b48d5f','#95804f','#71503c','#c9a877','stucco'],swahili:['#d8cfab','#ad8558','#64492e','#c8b793','stone'],arab:['#d0b78a','#a09370','#6c7163','#e0ca9f','stucco'],india:['#d2ad83','#a96347','#816952','#d8c499','stucco'],southeast:['#a48254','#8d6641','#77533a','#be9d61','wood'],china:['#c1bda6','#60756d','#9a5240','#c4b794','brick'],japan:['#d6d1b9','#4e625d','#655244','#cab990','stucco'],korea:['#d9d2b7','#65736c','#92624e','#c7b390','stucco'],caribbean:['#d5ba87','#af7550','#67918a','#e1c69a','stucco'],colonial:['#d1c19d','#ae7153','#6d877b','#dac7a3','stucco'],pacific:['#a48c5b','#91855b','#78613f','#c1aa75','wood'],cape:['#dfd8bb','#88704b','#536f5f','#cab894','stucco'],northcolonial:['#b29779','#686e67','#4f665c','#d0c3a2','wood'],ryukyu:['#d1c6a6','#b57044','#745340','#c7b595','stone'],timor:['#ccb591','#94674b','#77563c','#d2bf90','wood']};
  const p=P[family]||P.iberian;return{family,wall:mat(p[4],p[0],seed),roof:mat(['west','pacific','southeast','cape'].includes(family)?'thatch':['japan','china','korea'].includes(family)?'slate':'tile',p[1],seed+2),accent:mat('wood',p[2],seed+3),wood:mat('wood',['china','korea'].includes(family)?'#764637':'#67523d',seed+4),trim:mat('stone',p[3],seed+5),ridge:mat('tile',p[1],seed+9)};
 }
 function houseBlock(mesh,x,y,w,d,h,c,{kind='hip',rise=27,doorX=x+w/2,front=true,windows=true,second=false,chimneyOn=false}={}){
  mesh.box(x,y,0,w,d,5,c.trim);mesh.box(x+1,y+1,5,w-2,d-2,h-5,c.wall);cornice(mesh,x,y,h,w,d,c);
  if(kind==='curve')curvedRoof(mesh,x,y,h+3,w,d,rise,c);else roof(mesh,x,y,h+3,w,d,rise,c,kind);
  if(front){door(mesh,doorX,y+d,4,c,20,52,!['southeast','pacific','japan','china','korea','timor'].includes(c.family));if(windows){const ww=w>72?15:12;for(const xx of [x+w*.2-ww/2,x+w*.8-ww/2])if(Math.abs(xx+ww/2-doorX)>18){framedWindow(mesh,xx,y+d,22,ww,27,c,!['china','japan','korea','west','india','southeast','pacific','timor'].includes(c.family));if(c.family==='iberian'||c.family==='colonial')planter(mesh,xx-2,y+d+2,18,ww+4);}}
   if(second){for(const xx of [x+w*.22-8,x+w*.78-8])framedWindow(mesh,xx,y+d,77,16,26,c,true);}
  }
  for(let zz=7;zz<h-6;zz+=8){for(const xx of [x+1,x+w-6])mesh.box(xx,y+d-.3,zz,5+(Math.floor(zz/8)%2)*2,1.4,5,c.trim);}
  if(chimneyOn)chimney(mesh,x+w*.76,y+d*.23,h+rise*.45,c);
 }
 function stepGable(mesh,x,y,z,w,rise,c){const steps=5,sw=w/(steps*2);for(let i=0;i<steps;i++){const h=rise*(i+1)/steps;for(const xx of [x+i*sw,x+w-(i+1)*sw]){mesh.box(xx,y,z,sw+.2,4,h,c.wall);mesh.box(xx-1,y-1,z+h,sw+2,6,2,c.trim);}}mesh.box(x+w*.5-2,y-1,z+rise,4,6,4,c.trim);}
 function lattice(mesh,x,y,z,w,h,c){plate(mesh,x,y,z,w,h,M.dark);for(let xx=x;xx<=x+w;xx+=4)mesh.box(xx,y+.5,z,.8,1,h,c.wood);for(let zz=z;zz<=z+h;zz+=5)mesh.box(x,y+.5,zz,w,1,.8,c.wood);}
 function buildHome(mesh,W,D,c,v){
  const faceStart=mesh.faces.length,x=-W/2+2,y=-D+2,w=W-4,d=D-4,f=c.family;let H=72+(v%3)*3,rt='hip',rise=24;
  if(['north','northcolonial'].includes(f)){rt='gable';rise=38;}
  if(['arab','swahili'].includes(f))rt='flat';
  if(['china','japan','korea'].includes(f)){rt='curve';rise=24;}
  if(['west','pacific','southeast','timor'].includes(f)){rt='hip';rise=43;}
  if([1,6,8].includes(v))H=120+(v%2)*5;
  // Ten silhouettes use different footprints, roof orientations, heights and attached volumes.
  if(v===3||v===8){
   const wing=w*.31,lowH=v===8?70:H;
   houseBlock(mesh,x,y,w,d*.58,lowH,c,{kind:rt,rise,front:false,chimneyOn:f==='iberian'});
   houseBlock(mesh,x,y+d*.35,wing,d*.65,H,c,{kind:rt,rise:rise*.82,front:false});
   houseBlock(mesh,x+wing,y+d*.56,w-wing,d*.44,lowH,c,{kind:rt,rise:rise*.55,second:false,doorX:0});
  }else if(v===4){
   houseBlock(mesh,x,y,w*.5-1,d,H,c,{kind:rt==='flat'?'flat':'gable',rise:rise*.8,doorX:x+w*.25,windows:false});
   houseBlock(mesh,x+w*.5+1,y+5,w*.5-1,d-5,H+13,c,{kind:rt==='flat'?'flat':rt==='curve'?'curve':'hip',rise:rise*.85,doorX:x+w*.75,windows:false});
  }else if(v===7){
   houseBlock(mesh,x,y,w,d*.42,H,c,{kind:rt,rise:rise*.65,front:false});
   for(const xx of [x,x+w*.74])houseBlock(mesh,xx,y+d*.34,w*.26,d*.66,H-7,c,{kind:rt,rise:rise*.65,front:false});
   mesh.box(x+w*.26,y+d-5,0,w*.48,5,33,c.wall);door(mesh,0,y+d,3,c,21,52,true);
  }else{
   const mainD=(v===5||v===9)?d*.73:d,mainW=v===1?w*.74:w,xx=v===1?-mainW/2:x;
   houseBlock(mesh,xx,y,mainW,mainD,H,c,{kind:rt,rise,second:H>110,chimneyOn:['iberian','med','north','northcolonial','colonial'].includes(f)&&v%3!==1});
   if(v===1){houseBlock(mesh,x+mainW*.74,y+d*.35,w-mainW*.74,d*.65,68,c,{kind:rt,rise:rise*.55,front:false});}
   if(v===5){porch(mesh,x,y+mainD,2,w,d-mainD,c,56);door(mesh,0,y+mainD,4,c);}
   if(v===9){awning(mesh,x+4,y+mainD,48,w-8,d-mainD,c);crate(mesh,x+6,y+d-14,0,14,13,17,c);barrel(mesh,x+w-14,y+d-9,0,7,19,c);}
   if(v===2&&rt!=='flat'){const dw=25,dh=15,dy=y+d*.52,dz=H+rise*.60;mesh.box(-dw/2,dy,dz,dw,12,dh,c.wall);roof(mesh,-dw/2,dy,dz+dh,dw,12,10,c,'gable',2);framedWindow(mesh,-6,dy+12,dz+3,12,11,c,false);}
   if(v===6)balcony(mesh,-21,y+mainD,74,42,c);
  }
  if(f==='north')stepGable(mesh,x+3,y+d+.7,H+3,w-6,rise*.85,c);
  if(f==='iberian'){mesh.box(x+2,y+d+.2,6,w-4,.8,10,mat('azulejo','#5f8492',mesh.seed));if(v===0||v===6)planter(mesh,x+w-17,y+d+2,2,15);}
  if(f==='west'){for(let xx=x+5;xx<x+w-3;xx+=22)mesh.box(xx,y+d-1,0,5,5,H+5,c.wall);if(v%2===0){mesh.cyl(x+w*.72,y+d*.25,H,13,7,c.wall);mesh.cone(x+w*.72,y+d*.25,H+7,17,31,c.roof);}}
  if(f==='swahili'||f==='arab'){for(let xx=x+6;xx<x+w-4;xx+=15)mesh.box(xx,y+d,H+4,6,4,8,c.trim);if(v===1||v===8)mesh.sphere(x+w*.4,y+d*.4,H+6,20,18,23,c.trim,16,6);if(f==='swahili'&&v%2===0)lattice(mesh,x+w*.62,y+d+3,72,23,31,c);}
  if(['china','japan','korea'].includes(f)){for(const xx of [x+3,x+w-7])mesh.box(xx,y+d,3,4,3,H-3,c.wood);mesh.box(x,y+d+1,60,w,2,3,c.wood);if(f==='japan'){mesh.box(x,y+d+1,9,w,2,3,c.wood);for(let xx=x+3;xx<x+w;xx+=22)mesh.box(xx,y+d+1,9,2,2,51,c.wood);}if(H>100){curvedRoof(mesh,x,y+d*.62,69,w,d*.38,12,c,5);lattice(mesh,-16,y+d+1,78,32,27,c);}}
  if(['southeast','pacific','timor'].includes(f)){
   const lift=f==='southeast'?23:18;const seen=new Set();for(let fi=faceStart;fi<mesh.faces.length;fi++)for(const point of mesh.faces[fi].p)if(!seen.has(point)){point[2]+=lift;seen.add(point);}
   mesh.box(x-1,y+d*.76,lift-3,w+2,d*.24+3,4,c.wood);for(const yy of [y+4,y+d-4])for(let xx=x+5;xx<x+w;xx+=19)mesh.box(xx,yy,0,4,4,lift,c.wood);
   for(let i=0;i<5;i++)mesh.box(-12,y+d-5+i*3,0,24,4,lift-i*(lift/5),c.wood);
   for(const xx of [x+5,x+w-8])mesh.box(xx,y+d-3,lift,3,3,54,c.wood);
   for(const xx of [x+6,x+w*.62]){lattice(mesh,xx,y+d+2,lift+26,25,24,c);mesh.box(xx-1,y+d+2,lift+24,27,4,2,c.trim);}
   if(f==='pacific'){for(let i=0;i<6;i++)mesh.box(x+8+i*(w-16)/5,y+d+2,H+lift+7,1.5,2,12,c.trim);}
  }
  if(f==='india'){
   for(const xx of [x+5,x+w-9]){mesh.box(xx,y+d-1,0,5,5,65,c.trim);mesh.box(xx-2,y+d-3,54,9,8,5,c.trim);mesh.box(xx-1,y+d-2,3,7,7,5,c.trim);}
   roof(mesh,x-1,y+d-15,65,w+2,15,10,c,'hip',3);if(H>110)roof(mesh,x,y+d-12,113,w,12,9,c,'hip',4);
   lattice(mesh,x+8,y+d+2,24,20,27,c);lattice(mesh,x+w-28,y+d+2,24,20,27,c);
   if(v===2||v===8){const sw=23;for(let i=0;i<4;i++)mesh.box(-sw/2+i*2,y+d*.37+i*2,H+rise*.6+i*5,sw-i*4,sw-i*4,5,c.trim);}
  }
  if(f==='arab'&&v%3===0){for(let i=0;i<9;i++)mesh.box(x+w-13,y+d-i*6-6,0,13,7,7+i*7,c.trim);mesh.box(x+w-15,y+3,H+5,3,d-6,9,c.wall);}
  if(['caribbean','colonial'].includes(f)&&v%3===0){porch(mesh,x+1,y+d-16,0,w-2,16,c,61);for(const xx of [x+5,x+w-8])mesh.box(xx,y+d-4,4,3,3,57,c.trim);}
  if(f==='cape'){mesh.face([[x+w*.27,y+d+1,H],[x+w*.37,y+d+1,H+18],[x+w*.5,y+d+1,H+29],[x+w*.63,y+d+1,H+18],[x+w*.73,y+d+1,H]],c.wall);}
 }
 function arcade(mesh,x,y,z,w,h,c,bays=3){
  mesh.box(x,y,z,w,12,4,c.trim);const span=w/bays,pw=5;
  for(let i=0;i<=bays;i++){const xx=x+i*span-(i===bays?pw:0);mesh.box(xx,y+5,z,pw,7,h-8,c.trim);mesh.box(xx-1,y+4,z+h-11,pw+2,9,3,c.trim);}
  mesh.box(x,y+5,z+h-7,w,7,7,c.wall);
  for(let i=0;i<bays;i++){const sx=x+i*span+pw,sw=span-pw*2,sy=y+12.2,hh=h-7;for(let j=0;j<8;j++){const a=Math.PI*j/8,b=Math.PI*(j+1)/8,r=sw/2,zc=z+hh-r;mesh.face([[sx+r+Math.cos(a)*r,sy,zc+Math.sin(a)*r],[sx+r+Math.cos(b)*r,sy,zc+Math.sin(b)*r],[sx+r+Math.cos(b)*(r+4),sy,zc+Math.sin(b)*(r+4)],[sx+r+Math.cos(a)*(r+4),sy,zc+Math.sin(a)*(r+4)]],c.trim);}}
 }
 function regionalMarket(mesh,x,y,w,d,c){
  const f=c.family,center=0,front=y+d;
  const goods=(xx,yy,zz=0)=>{crate(mesh,xx,yy,zz,14,12,16,c);barrel(mesh,xx+21,yy+5,zz,6,17,c);for(let i=0;i<4;i++)mesh.sphere(xx+2+i*3,yy+5,zz+18,2,2,2,i%2?mat('plain','#b5813b'):M.leaf,7,3);};
  if(f==='west'){
   mesh.box(x,y,0,w,d,4,c.wall);
   for(let i=0;i<3;i++){const cx=x+(i+.5)*w/3,cy=y+d*.42,r=Math.min(w/6,d*.43);mesh.cyl(cx,cy,4,r*.85,9,c.wall,16);for(const dx of [-r*.65,r*.65])mesh.box(cx+dx,cy+r*.35,10,3,3,57,c.wood);mesh.cone(cx,cy,64,r+5,39,c.roof,16);mesh.cyl(cx,cy,102,1.4,7,c.trim,6);goods(cx-r*.6,cy+r*.45,4);}
   for(const xx of [x+6,x+w-7])mesh.cyl(xx,front-4,0,5,20,c.wall,10);
   return true;
  }
  if(f==='southeast'||f==='pacific'||f==='timor'){
   const lift=f==='southeast'?23:15;mesh.box(x,y,lift,w,d,5,c.wood);for(const yy of [y+4,front-5])for(let xx=x+5;xx<x+w;xx+=21){mesh.box(xx,yy,0,4,4,lift,c.wood);mesh.box(xx,yy,lift+4,4,4,66,c.wood);}
   for(let i=0;i<5;i++)mesh.box(-15,front-4+i*3,0,30,4,lift-i*lift/5,c.wood);
   const H=lift+76;roof(mesh,x,y,H,w,d,44,c,'hip',9);if(f==='southeast'){roof(mesh,-w*.24,y+d*.19,H+33,w*.48,d*.57,30,c,'gable',5);for(const xx of [x+7,x+w-10]){mesh.box(xx,front-4,lift+53,4,4,20,c.trim);}}
   for(const xx of [x+8,x+w-37]){mesh.box(xx,front-19,lift+5,29,12,19,c.wood);goods(xx+2,front-18,lift+5);}
   for(const xx of [x+7,x+w-7])mesh.box(xx,front-3,lift+4,2,2,29,c.wood);for(const q of [[x+6,w*.28],[x+w*.7,w*.25]])mesh.box(q[0],front-2,lift+31,q[1],2,3,c.wood);
   return true;
  }
  if(f==='india'){
   mesh.box(x,y,0,w,d,6,c.trim);mesh.box(x,y+2,6,w,d*.56,68,c.wall);for(const xx of [x+5,x+w-11])lattice(mesh,xx,y+d*.56+3,24,25,27,c);
   for(let i=0;i<=4;i++){const xx=x+4+i*(w-12)/4;mesh.cyl(xx,front-8,6,3,56,c.trim,8);mesh.box(xx-4,front-12,56,8,8,6,c.trim);mesh.box(xx-4,front-12,7,8,8,5,c.trim);}
   roof(mesh,x,y,72,w,d,23,c,'hip',7);roof(mesh,x+9,y+8,99,w-18,d-16,16,c,'hip',4);mesh.box(-19,y+d*.28,111,38,25,14,c.wall);for(let i=0;i<4;i++)mesh.box(-20+i*3,y+d*.28+i*2,122+i*5,40-i*6,27-i*4,4,c.trim);mesh.cyl(0,y+d*.44,141,2,8,M.gold,8);
   goods(x+9,front-17,6);goods(x+w-38,front-17,6);door(mesh,0,y+d*.56+1,6,c,24,54,true);return true;
  }
  if(['china','japan','korea','ryukyu'].includes(f)){
   const H=f==='japan'?78:89;mesh.box(x,y,0,w,d,5,c.trim);mesh.box(x,y,5,w,d*.65,H-5,c.wall);
   for(const xx of [x+5,x+w-9])mesh.box(xx,front-6,5,4,5,H-5,c.wood);mesh.box(x,front-6,H-7,w,5,7,c.wood);
   for(let i=0;i<3;i++){const xx=x+7+i*(w-16)/3,ww=(w-22)/3;mesh.box(xx,y+d*.66,8,ww,2,49,c.wood);lattice(mesh,xx+2,y+d*.66+3,13,ww-4,42,c);}
   if(f==='ryukyu')roof(mesh,x,y,H,w,d,31,c,'hip',8);else curvedRoof(mesh,x,y,H,w,d,32,c,9);
   if(f!=='japan'&&f!=='ryukyu')curvedRoof(mesh,-w*.27,y+d*.17,H+29,w*.54,d*.6,23,c,5);
   const curtain=f==='japan'?mat('wood','#4e6770'):c.accent;for(let i=0;i<5;i++)mesh.box(x+9+i*(w-18)/5,front-5,H-27,(w-21)/5,1,17,curtain);
   mesh.box(-13,front-4,H-14,26,2,10,c.wood);plate(mesh,-9,front-1,H-11,18,4,M.gold);
   for(const xx of [x+8,x+w-35]){goods(xx,front-18,5);mesh.cyl(xx+9,front-4,H-35,3.5,10,mat('plain','#bb6c47'),10);}
   return true;
  }
  if(f==='arab'){
   const wing=w*.3;for(const xx of [x,x+w-wing]){mesh.box(xx,y,0,wing,d,69,c.wall);roof(mesh,xx,y,70,wing,d,0,c,'flat',1);awning(mesh,xx+2,front-20,48,wing-4,20,c);goods(xx+4,front-17,0);}
   mesh.box(-w*.2,y,0,w*.4,d*.55,87,c.wall);roof(mesh,-w*.2,y,87,w*.4,d*.55,0,c,'flat',2);mesh.sphere(0,y+d*.29,94,w*.17,d*.22,23,c.trim,18,7);arch(mesh,-16,y+d*.56,0,32,72,M.dark,c.trim);door(mesh,0,y+d*.56+.5,0,c,24,56,true);
   for(let i=0;i<5;i++)mesh.box(-w*.2+i*w*.08,y+d*.55,88,5,4,8,c.trim);return true;
  }
  if(f==='swahili'){
   mesh.box(x,y,0,w,d*.66,85,c.wall);roof(mesh,x,y,85,w,d*.66,0,c,'flat',2);for(const xx of [x+4,x+w-23])lattice(mesh,xx,y+d*.67+1,49,19,29,c);
   for(let i=0;i<4;i++){const xx=x+5+i*(w-14)/3;mesh.box(xx,front-7,0,5,6,61,c.wood);for(let j=0;j<3;j++)mesh.box(xx-2-j,front-8,51+j*3,9+j*2,8,2,c.trim);}
   roof(mesh,x,y+d*.57,63,w,d*.43,6,c,'hip',3);door(mesh,0,y+d*.67,4,c,26,57,true);mesh.box(-17,y+d*.67+3,3,34,2,58,c.wood);door(mesh,0,y+d*.67+5,4,c,25,55,true);goods(x+8,front-18,0);goods(x+w-37,front-18,0);return true;
  }
  if(f==='north'||f==='northcolonial'){
   mesh.box(x,y,0,w,d,6,c.trim);const mid=w*.45;houseBlock(mesh,-mid/2,y,mid,d,96,c,{kind:'gable',rise:40,front:false});for(const xx of [x,x+w*.725]){houseBlock(mesh,xx,y,w*.275,d,65,c,{kind:'gable',rise:23,front:false});arch(mesh,xx+5,front,5,w*.275-10,51,M.dark,c.trim);goods(xx+5,front-14,5);}
   stepGable(mesh,-mid/2,front+1,99,mid,37,c);arch(mesh,-17,front+1,5,34,64,M.dark,c.trim);door(mesh,0,front+1.5,5,c,26,54,true);mesh.box(-mid/2-2,front+2,85,mid+4,3,5,c.wood);framedWindow(mesh,-7,front+1,83,14,22,c,false);return true;
  }
  if(f==='caribbean'||f==='colonial'){
   const H=94;mesh.box(x,y,0,w,d*.64,H,c.wall);roof(mesh,x,y,H,w,d*.64,26,c,'hip',4);for(const xx of [x+5,x+w-10])mesh.box(xx,front-6,0,5,5,66,c.trim);mesh.box(x,front-6,64,w,6,4,c.trim);roof(mesh,x,y+d*.55,68,w,d*.45,13,c,'hip',5);
   for(let i=0;i<4;i++){const xx=x+8+i*(w-19)/3;mesh.box(xx,front-5,1,3,3,62,c.wood);mesh.box(xx-3,front-6,56,9,5,4,c.trim);}for(const xx of [x+10,x+w-29])framedWindow(mesh,xx,y+d*.65,57,18,26,c,true);door(mesh,0,y+d*.65,3,c,26,53,true);goods(x+9,front-18,0);goods(x+w-38,front-18,0);
   return true;
  }
  return false;
 }

 function civic(mesh,W,D,c,kind,v){
  const x=-W/2+2,y=-D+2,w=W-4,d=D-4,f=c.family,east=['china','japan','korea'].includes(f),flat=['arab','swahili','west'].includes(f),rt=east?'curve':flat?'flat':'hip';
  if(kind==='market'){
   if(regionalMarket(mesh,x,y,w,d,c))return;
   const portico=Math.min(21,d*.32),H=76;mesh.box(x,y,0,w,d-portico,5,c.trim);mesh.box(x,y,5,w,d-portico,H-5,c.wall);
   for(let i=0;i<3;i++){const dx=x+(i+.5)*w/3;door(mesh,dx,y+d-portico,4,c,22,52,true);}
   arcade(mesh,x,y+d-portico-1,0,w,58,c,3);if(east)curvedRoof(mesh,x,y,H+3,w,d,32,c);else roof(mesh,x,y,H+3,w,d,flat?0:28,c,rt);
   // Real deep porch recess; goods sit under the awning on a raised wooden counter.
   for(let i=0;i<2;i++){const xx=i===0?x+6:x+w-34;mesh.box(xx,y+d-9,3,28,8,20,c.wood);for(let j=0;j<6;j++)mesh.sphere(xx+3+j*4,y+d-4,25,2.3,2.6,2.5,j%2?mat('plain','#b68138'):mat('plain','#6e8a46'),7,3);}
   if(['iberian','med','colonial','caribbean'].includes(f)){plate(mesh,-16,y+d-portico+.8,61,32,9,mat('tile','#577f8d'));mesh.box(-18,y+d-portico,60,36,2,2,c.trim);}
   if(f==='north')stepGable(mesh,-w*.28,y+d+.5,H+3,w*.56,37,c);
   if(f==='west')for(const xx of [x+5,x+w-15]){mesh.cyl(xx,y+d-9,H+5,10,5,c.wall);mesh.cone(xx,y+d-9,H+10,14,25,c.roof);}
  }else if(kind==='shipyard'){
   const shed=w*.67,H=72;mesh.box(x,y,0,w,d,4,c.wood);mesh.box(x,y,4,shed,d,4,c.trim);mesh.box(x,y,4,5,d,H,c.wall);mesh.box(x+shed-5,y,4,5,d,H,c.wall);mesh.box(x,y,H-8,shed,d,8,c.wall);roof(mesh,x,y,H,shed,d,26,c,east?'curve':'gable');
   // Open bay: ribs and curved hull, all inside the building collision footprint.
   for(let i=0;i<7;i++){const by=y+9+i*(d-16)/6,bw=shed*.65*Math.sin(Math.PI*(i+1)/8);mesh.box(x+shed/2-bw/2,by,9,bw,3,7,c.wood);for(const xx of [x+shed/2-bw/2,x+shed/2+bw/2-2])mesh.box(xx,by,10,2,3,16,c.trim);}
   const cx=x+shed+(w-shed)*.5;mesh.box(cx-3,y+d*.4,0,6,6,104,c.wood);mesh.box(cx-13,y+d*.4,96,26,5,5,c.wood);mesh.box(cx+8,y+d*.4,55,1.2,1.2,40,M.rope);crate(mesh,x+shed+6,y+d-18,0,17,15,19,c);
  }else if(kind==='landmark'){
   const tw=w*.46,tx=-tw/2;houseBlock(mesh,x,y,w,d,67,c,{kind:rt,rise:22,front:false});mesh.box(tx,y+d*.28,0,tw,d*.7,139,c.wall);cornice(mesh,tx,y+d*.28,139,tw,d*.7,c);
   if(['arab','swahili','india'].includes(f)){mesh.cyl(0,y+d*.6,141,tw*.37,9,c.trim);mesh.sphere(0,y+d*.6,150,tw*.39,tw*.35,28,c.trim,16,6);mesh.box(-1,y+d*.6,172,2,2,12,M.gold);}
   else if(['west','pacific'].includes(f)){roof(mesh,tx,y+d*.28,143,tw,d*.7,47,c,'hip',7);}
   else if(east){curvedRoof(mesh,tx-5,y+d*.2,125,tw+10,d*.8,17,c,6);curvedRoof(mesh,tx,y+d*.28,147,tw,d*.7,28,c,7);}
   else{roof(mesh,tx,y+d*.28,143,tw,d*.7,36,c,f==='north'?'gable':'hip');mesh.box(-2,y+d*.6,174,4,4,20,M.gold);}
   door(mesh,0,y+d,4,c,23,56,true);arch(mesh,-10,y+d*.98+1,88,20,30,M.dark,c.trim);mesh.box(-11,y+d*.98+1.5,93,22,1,2,c.wood);mesh.box(-1,y+d*.98+1.5,88,2,1,27,c.wood);
  }else{
   const H=kind==='guild'?116:kind==='tavern'?118:75;houseBlock(mesh,x,y,w,d,H,c,{kind:rt,rise:kind==='guild'?33:25,second:H>100,chimneyOn:['north','iberian','med','colonial','caribbean'].includes(f)});
   if(kind==='tavern'){balcony(mesh,x+9,y+d,73,w-18,c);mesh.box(x+w-3,y+d+2,51,4,3,26,c.wood);mesh.box(x+w-3,y+d+2,71,16,3,3,c.wood);mesh.box(x+w+6,y+d+1,56,10,3,13,c.accent);barrel(mesh,x+7,y+d-5,0,7,18,c);}
   if(kind==='guild'){porch(mesh,-24,y+d-14,3,48,14,c,58);if(east)curvedRoof(mesh,-24,y+d-14,63,48,14,10,c,4);plate(mesh,-11,y+d+1,77,22,22,c.accent);mesh.box(-1,y+d+1.5,79,2,1,18,M.gold);mesh.box(-7,y+d+1.5,86,14,1,2,M.gold);}
   if(kind==='supply'){awning(mesh,x+4,y+d-14,53,w-8,14,c);crate(mesh,x+6,y+d-18,0,19,16,23,c);crate(mesh,x+w-24,y+d-18,0,18,15,18,c);barrel(mesh,x+w-12,y+d-5,0,7,19,c);}
  }
 }
 function crate(mesh,x,y,z,w,d,h,c){mesh.box(x,y,z,w,d,h,c.wood);for(const xx of [x,x+w-2])mesh.box(xx,y+d,z,2,1,h,c.trim);for(const zz of [z+2,z+h-3])mesh.box(x,y+d,zz,w,1,2,c.trim);mesh.face([[x+2,y+d+1.2,z+3],[x+4,y+d+1.2,z+3],[x+w-2,y+d+1.2,z+h-3],[x+w-4,y+d+1.2,z+h-3]],c.trim);}
 function barrel(mesh,x,y,z,r,h,c){const n=14,levels=[[0,.83],[h*.16,.98],[h*.5,1.06],[h*.84,.98],[h,.83]];for(let j=0;j<levels.length-1;j++)for(let i=0;i<n;i++){const a=TAU*i/n,b=TAU*(i+1)/n,L=levels[j],U=levels[j+1];const p=[[x+Math.cos(a)*r*L[1],y+Math.sin(a)*r*L[1],z+L[0]],[x+Math.cos(b)*r*L[1],y+Math.sin(b)*r*L[1],z+L[0]],[x+Math.cos(b)*r*U[1],y+Math.sin(b)*r*U[1],z+U[0]],[x+Math.cos(a)*r*U[1],y+Math.sin(a)*r*U[1],z+U[0]]];mesh.face(p,c.wood,[[i*4,L[0]],[(i+1)*4,L[0]],[(i+1)*4,U[0]],[i*4,U[0]]]);}for(const zz of [h*.2,h*.76])mesh.cyl(x,y,z+zz,r*1.065,2,mat('metal','#57584e'),n);mesh.cyl(x,y,z+h-.5,r*.83,.6,c.wood,n);}
 function buildPropMesh(kind,c,v,seed){const mesh=new Mesh(seed);if(kind==='bench'){
   for(const xx of [-20,15]){mesh.box(xx,-5,0,4,14,17,c.trim);mesh.box(xx,-6,14,4,4,18,c.wood);}for(let j=0;j<3;j++)mesh.box(-24,-5+j*4,16,48,3,3,c.wood);for(let j=0;j<3;j++)mesh.box(-24,-6,23+j*4,48,3,3,c.wood);for(const xx of [-24,22])mesh.box(xx,-4,23,2,11,2,c.wood);
  }else if(kind==='well'){
   const n=20,r=17,ri=12,h=22;for(let i=0;i<n;i++){const a=TAU*i/n,b=TAU*(i+1)/n,f=(rr,zz,ang)=>[Math.cos(ang)*rr,Math.sin(ang)*rr,zz];mesh.face([f(r,0,a),f(r,0,b),f(r,h,b),f(r,h,a)],c.trim,[[r*a,0],[r*b,0],[r*b,h],[r*a,h]]);mesh.face([f(r,h,a),f(r,h,b),f(ri,h,b),f(ri,h,a)],c.trim,[[r*a,0],[r*b,0],[r*b,5],[r*a,5]]);mesh.face([f(ri,6,a),f(ri,h,a),f(ri,h,b),f(ri,6,b)],M.dark);}mesh.cyl(0,0,7,ri,.4,M.water,n);for(const xx of [-18,15])mesh.box(xx,-2,0,3,4,55,c.wood);mesh.box(-20,-2,51,40,4,4,c.wood);mesh.box(-1,-1,22,1.2,1.2,29,M.rope);mesh.cyl(0,0,20,4,6,c.wood,10);if(v%2===0)roof(mesh,-21,-14,57,42,28,15,c,'hip',2);
  }else if(kind==='lamp'){
   mesh.box(-5,-5,0,10,10,4,c.trim);mesh.box(-3,-3,4,6,6,8,c.trim);mesh.box(-1.5,-1.5,12,3,3,53,c.accent);mesh.box(-4,-4,63,8,8,2,c.wood);mesh.box(-3,-3,65,6,6,9,mat('glass','#e7c987'));for(const xx of [-4,3])for(const yy of [-4,3])mesh.box(xx,yy,64,1,1,12,c.wood);mesh.cone(0,0,76,7,6,c.wood,4);mesh.box(-.7,-.7,82,1.4,1.4,5,M.gold);
  }else if(kind==='barrel')barrel(mesh,0,0,0,10,27,c);
  else {crate(mesh,-19,-13,0,22,23,25,c);barrel(mesh,12,4,0,9,26,c);if(v%2)crate(mesh,-16,-10,25,17,17,16,c);}
  return mesh;
 }
 function lightBuffer(mesh){
  // A second orthographic pass from the sun gives real eave, porch and chimney shadows.
  const proj=p=>[p[0]*.8+p[1]*.6,-p[0]*.515+p[1]*.686-p[2]*.515,-p[0]*.6+p[1]*.8+p[2]*1.5];
  let lx=Infinity,ly=Infinity,hx=-Infinity,hy=-Infinity;const fs=mesh.faces.map(f=>f.p.map(proj));for(const ps of fs)for(const p of ps){lx=Math.min(lx,p[0]);ly=Math.min(ly,p[1]);hx=Math.max(hx,p[0]);hy=Math.max(hy,p[1]);}lx=Math.floor(lx)-2;ly=Math.floor(ly)-2;const w=Math.ceil(hx)-lx+3,h=Math.ceil(hy)-ly+3,buf=new Float32Array(w*h);buf.fill(-Infinity);
  for(const ps of fs)for(let j=1;j<ps.length-1;j++){const a=ps[0],b=ps[j],c=ps[j+1],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<.001)continue;const minx=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])-lx)),maxx=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])-lx)),miny=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])-ly)),maxy=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])-ly));for(let yy=miny;yy<=maxy;yy++)for(let xx=minx;xx<=maxx;xx++){const X=xx+lx+.5,Y=yy+ly+.5,A=((b[1]-c[1])*(X-c[0])+(c[0]-b[0])*(Y-c[1]))/den,B=((c[1]-a[1])*(X-c[0])+(a[0]-c[0])*(Y-c[1]))/den,C=1-A-B;if(A<0||B<0||C<0)continue;const d=a[2]*A+b[2]*B+c[2]*C,k=yy*w+xx;if(d>buf[k])buf[k]=d;}}
  return(x,y,z)=>{const a=x*.8+y*.6-lx,b=-x*.515+y*.686-z*.515-ly,dep=-x*.6+y*.8+z*1.5,ix=Math.floor(a),iy=Math.floor(b);if(ix<0||iy<0||ix>=w||iy>=h)return false;return buf[iy*w+ix]>dep+2.4;};
 }
 function raster(mesh,createCanvas,footprint){
  let minX=0,minY=0,maxX=0,maxY=0,maxZ=0;for(const f of mesh.faces)for(const p of f.p){const sy=p[1]*G-p[2]*Z;minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);maxZ=Math.max(maxZ,p[2]);}
  const shadowed=lightBuffer(mesh);
  minX=Math.floor(minX)-2;minY=Math.floor(minY)-2;maxX=Math.ceil(maxX)+2;maxY=Math.ceil(maxY)+2;const width=maxX-minX+1,height=maxY-minY+1,canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),im=ctx.createImageData(width,height),data=im.data,depth=new Float32Array(width*height);depth.fill(-Infinity);
  for(const face of mesh.faces){
   const A=face.p[0],B=face.p[1],C=face.p[2],ab=B.map((v,i)=>v-A[i]),ac=C.map((v,i)=>v-A[i]);let nx=ab[1]*ac[2]-ab[2]*ac[1],ny=ab[2]*ac[0]-ab[0]*ac[2],nz=ab[0]*ac[1]-ab[1]*ac[0];const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
   // Orient normals towards the camera; every modeled exterior has two-sided raster coverage.
   if(ny*Z+nz*G<0){nx=-nx;ny=-ny;nz=-nz;}const light=clamp(.79+Math.max(0,-nx*.32+ny*.25+nz*.78)*.30,.72,1.12);
   const pp=face.p.map(p=>[p[0]-minX,p[1]*G-p[2]*Z-minY,p[1]*Z+p[2]*G]);
   for(let j=1;j<pp.length-1;j++){
    const ids=[0,j,j+1],a=pp[0],b=pp[j],c=pp[j+1],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<.00001)continue;
    const loX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),hiX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),loY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),hiY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let sy=loY;sy<=hiY;sy++)for(let sx=loX;sx<=hiX;sx++){
     const qx=sx+.5,qy=sy+.5,wa=((b[1]-c[1])*(qx-c[0])+(c[0]-b[0])*(qy-c[1]))/den,wb=((c[1]-a[1])*(qx-c[0])+(a[0]-c[0])*(qy-c[1]))/den,wc=1-wa-wb;if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
     const dep=a[2]*wa+b[2]*wb+c[2]*wc,idx=sy*width+sx;if(dep<depth[idx]-.0001)continue;depth[idx]=dep;
     const u=face.uv[ids[0]][0]*wa+face.uv[ids[1]][0]*wb+face.uv[ids[2]][0]*wc,v=face.uv[ids[0]][1]*wa+face.uv[ids[1]][1]*wb+face.uv[ids[2]][1]*wc;
     const p0=face.p[ids[0]],p1=face.p[ids[1]],p2=face.p[ids[2]],x=p0[0]*wa+p1[0]*wb+p2[0]*wc,y=p0[1]*wa+p1[1]*wb+p2[1]*wc,z=p0[2]*wa+p1[2]*wb+p2[2]*wc,col=sample(face.m,u,v,x,y,z,light),k=idx*4;const sh=shadowed(x,y,z);data[k]=sh?col[0]*.71:col[0];data[k+1]=sh?col[1]*.77:col[1];data[k+2]=sh?col[2]*.87:col[2];data[k+3]=255;
    }
   }
  }
  ctx.putImageData(im,0,0);return{canvas,width,height,anchorX:-minX,anchorY:-minY,worldWidth:width,worldHeight:maxZ,footprint,projection:{yaw:0,elevation:30,groundY:G,heightY:Z},geometry:true,doorHeightWorld:52,doorHeightPixels:52*Z,meshFaces:mesh.faces.length};
 }
 function factory(options={}){
  const W=(options.w??options.b?.w??3)*32,D=(options.h??options.b?.h??2)*32,kind=options.kind??options.b?.kind??'home',vi=options.visualIndex??options.b?.visualIndex??6,seed=Number(options.seed)||1,port=options.port_id||'P011',family=culture(options.region_id,port),c=palette(family,seed+(vi||0)*97),mesh=new Mesh(seed),v=mod(vi-6,10),createCanvas=options.createCanvas||((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
  if(kind==='home')buildHome(mesh,W,D,c,v);else civic(mesh,W,D,c,kind,v);
  const out=raster(mesh,createCanvas,[[-W/2,-D],[W/2,-D],[W/2,0],[-W/2,0]]);Object.assign(out,{kind,region:options.region_id,port,family,variant:v,footprintWidth:W,footprintDepth:D,doorWorld:[0,0,4],thresholdWorld:[0,5,0]});return out;
 }
 function propFactory(options={}){const kind=options.kind||'well',family=culture(options.region_id,options.port_id),seed=Number(options.seed)||1,c=palette(family,seed),mesh=buildPropMesh(kind,c,options.variant||0,seed),createCanvas=options.createCanvas||((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}),out=raster(mesh,createCanvas,kind==='bench'?[[-24,-6],[24,-6],[24,9],[-24,9]]:kind==='lamp'?[[-5,-5],[5,-5],[5,5],[-5,5]]:kind==='well'?[[-18,-17],[18,-17],[18,17],[-18,17]]:kind==='barrel'?[[-11,-11],[11,-11],[11,11],[-11,11]]:[[-19,-13],[22,-13],[22,14],[-19,14]]);Object.assign(out,{kind,family,groundCenter:true});return out;}
 class CityArchitecture{
  constructor({createCanvas}={}){this.createCanvas=createCanvas;}
  building(map,b){return factory({region_id:map.region_id,port_id:map.port_id,seed:(Number(map.seed)||1)+(Number(b.variant)||0)*173+(Number(b.x)||0)*13+(Number(b.y)||0)*31,b,createCanvas:this.createCanvas});}
  prop(map,p){if(!['well','bench','crates','barrel','lamp'].includes(p.kind))return null;return propFactory({region_id:map.region_id,port_id:map.port_id,seed:(Number(map.seed)||1)+(Number(p.variant)||0)*71,kind:p.kind,variant:p.variant,createCanvas:this.createCanvas});}
 }
 root.Tidemark=Object.assign(root.Tidemark||{},{CityArchitecture,buildArchitecture:factory,buildArchitectureProp:propFactory,ArchitectureMesh:Mesh,renderArchitectureMesh:raster,architectureCulture:culture});
 if(typeof module!=='undefined'&&module.exports)module.exports={buildArchitecture:factory,buildArchitectureProp:propFactory,Mesh,raster,culture};
})(globalThis);
