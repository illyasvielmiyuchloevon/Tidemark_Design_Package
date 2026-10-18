(function(root){
  'use strict';
  const TILE=32;
  class MinHeap{constructor(){this.items=[];}push(node){const a=this.items;a.push(node);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].f<=node.f)break;a[i]=a[p];i=p;}a[i]=node;}pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return top;}get length(){return this.items.length;}}
  class CityNavigation{
    constructor(map){this.map=map;this.w=map.width;this.h=map.height;this.nav=map.walkRows;this.obstacles=(map.props||[]).filter(p=>p.solid&&p.collisionBounds).map(p=>{const x=(p.tile[0]+.5)*TILE,y=(p.tile[1]+.5)*TILE,b=p.collisionBounds;return[x+b[0],y+b[1],x+b[2],y+b[3]];});}
    canWalk(x,y){return x>=0&&y>=0&&x<this.w&&y<this.h&&this.nav[y][x]==='1';}
    safePoint(x,y){const radius=5;if(![[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]].every(([dx,dy])=>this.canWalk(Math.floor((x+dx)/TILE),Math.floor((y+dy)/TILE))))return false;return !this.obstacles.some(b=>x+radius>b[0]&&x-radius<b[2]&&y+radius>b[1]&&y-radius<b[3]);}
    nearest(x,y,max=10){x=Math.max(0,Math.min(this.w-1,Math.floor(x)));y=Math.max(0,Math.min(this.h-1,Math.floor(y)));if(this.canWalk(x,y))return [x,y];for(let r=1;r<=max;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;if(this.canWalk(x+dx,y+dy))return[x+dx,y+dy];}return null;}
    path(from,to){const start=this.nearest(from[0],from[1]),goal=this.nearest(to[0],to[1]);if(!start||!goal)return[];const key=(x,y)=>y*this.w+x,N=this.w*this.h,g=new Float64Array(N).fill(Infinity),parent=new Int32Array(N).fill(-1),closed=new Uint8Array(N),heap=new MinHeap(),s=key(...start),end=key(...goal),heuristic=(x,y)=>Math.hypot(goal[0]-x,goal[1]-y);g[s]=0;heap.push({id:s,x:start[0],y:start[1],f:heuristic(...start)});while(heap.length){const n=heap.pop();if(closed[n.id])continue;if(n.id===end){const result=[];let c=end;while(c!==-1){result.push([c%this.w,Math.floor(c/this.w)]);c=parent[c];}return result.reverse();}closed[n.id]=1;for(const[dx,dy]of [[0,-1],[1,0],[0,1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=n.x+dx,y=n.y+dy;if(!this.canWalk(x,y)||(dx&&dy&&(!this.canWalk(n.x+dx,n.y)||!this.canWalk(n.x,n.y+dy))))continue;const id=key(x,y),cost=g[n.id]+(dx&&dy?1.4142:1);if(cost<g[id]){g[id]=cost;parent[id]=n.id;heap.push({id,x,y,f:cost+heuristic(x,y)});}}}return[];}
  }
  const WALK_SPEED=64,RUN_SPEED=104,STRIDE_WORLD=44,MOVE_STEP=4,EPSILON=1e-7;
  const facilityThreshold=f=>f.threshold||[(f.door[0]+.5)*TILE,(f.door[1]+.5)*TILE];
  class CityController{
    constructor(map,{position,onInteract,onPosition}){
      this.map=map;
      this.nav=new CityNavigation(map);
      const saved=position&&this.nav.safePoint(position.x,position.y)?position:null;
      this.player={x:saved?.x??(map.spawn[0]+.5)*TILE,y:saved?.y??(map.spawn[1]+.5)*TILE,direction:0,moving:false,walkDistance:0,frame:0,step:0,motionX:0,motionY:1};
      this.keys=new Set();
      this.path=[];
      this.target=null;
      this.pendingInteraction=null;
      this.onInteract=onInteract;
      this.onPosition=onPosition;
      this.paused=false;
      this.saveClock=0;
      this.changed=false;
      this.npcs=map.npcs.map((n,i)=>({...n,x:(n.tile[0]+.5)*TILE,y:(n.tile[1]+.5)*TILE,phase:i*.9}));
    }
    stop(){this.path=[];this.target=null;this.pendingInteraction=null;this.keys.clear();this.player.moving=false;}
    setPaused(paused){this.paused=paused;if(paused)this.stop();}
    #safeSegment(from,to){
      const distance=Math.hypot(to[0]-from[0],to[1]-from[1]),steps=Math.max(1,Math.ceil(distance/MOVE_STEP));
      for(let i=0;i<=steps;i++){
        const t=i/steps;
        if(!this.nav.safePoint(from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t))return false;
      }
      return true;
    }
    #planRoute(tile,interaction,threshold=null){
      const tiles=this.nav.path([this.player.x/TILE,this.player.y/TILE],tile);
      if(!tiles.length)return false;
      const points=tiles.map(([x,y])=>[(x+.5)*TILE,(y+.5)*TILE]);
      // Begin at the current cell's center so an off-center start cannot cut a
      // blocked corner before joining the tile route.
      if(Math.hypot(points[0][0]-this.player.x,points[0][1]-this.player.y)<EPSILON)points.shift();
      if(threshold){
        const last=points.at(-1)||[this.player.x,this.player.y];
        if(!this.#safeSegment(last,threshold))return false;
        const approach=points.at(-2)||[this.player.x,this.player.y];
        // The tile center is a navigation aid, not the doorway. Omit it when
        // the preceding segment already reaches the exact threshold safely.
        if(points.length&&this.#safeSegment(approach,threshold))points.pop();
        const end=points.at(-1)||[this.player.x,this.player.y];
        if(Math.hypot(threshold[0]-end[0],threshold[1]-end[1])>EPSILON)points.push([...threshold]);
      }
      this.path=points;
      this.target=points.at(-1)||null;
      this.pendingInteraction=interaction;
      if(!points.length){
        this.pendingInteraction=null;
        if(interaction)this.onInteract(interaction);
      }
      return true;
    }
    goTo(tile,interaction=null){return this.#planRoute(tile,interaction);}
    goToFacility(id,interact=true){
      const f=this.map.facilities.find(f=>f.id===id);
      if(!f)return false;
      return this.#planRoute(f.door,interact?{kind:'facility',id}:null,facilityThreshold(f));
    }
    nearestInteraction(){
      const p=this.player;
      let best=null;
      for(const f of this.map.facilities){
        const [x,y]=facilityThreshold(f),d=Math.hypot(p.x-x,p.y-y);
        if(d<53&&(!best||d<best.distance))best={kind:'facility',id:f.id,label:f.name,distance:d};
      }
      for(const npc of this.npcs){
        const d=Math.hypot(p.x-npc.x,p.y-npc.y);
        if(d<38&&(!best||d<best.distance-8))best={kind:'npc',id:npc.id,label:npc.name,distance:d};
      }
      return best;
    }
    interact(){if(this.paused)return;const target=this.nearestInteraction();if(target)this.onInteract(target);}
    #move(dx,dy){
      const p=this.player;
      if(this.nav.safePoint(p.x+dx,p.y))p.x+=dx;
      if(this.nav.safePoint(p.x,p.y+dy))p.y+=dy;
    }
    #face(dx,dy){
      const p=this.player,ax=Math.abs(dx),ay=Math.abs(dy);
      let horizontal=p.direction===2||p.direction===3;
      if(ax>ay*1.15)horizontal=true;
      else if(ay>ax*1.15)horizontal=false;
      p.direction=horizontal?(dx<0?2:3):(dy<0?1:0);
    }
    update(dt){
      if(this.paused)return;
      dt=Math.max(0,Math.min(dt,.1));
      const p=this.player;
      const inputX=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0);
      const inputY=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0);
      const inputLength=Math.hypot(inputX,inputY),manual=inputLength>0;
      if(manual){this.path=[];this.target=null;this.pendingInteraction=null;}
      let budget=(this.keys.has('shift')?RUN_SPEED:WALK_SPEED)*dt;
      let travelled=0,lastDx=0,lastDy=0,arrivedInteraction=null;
      while(budget>EPSILON){
        let dx,dy,remaining=budget;
        if(manual){dx=inputX/inputLength;dy=inputY/inputLength;}
        else if(this.path.length){
          const target=this.path[0],tx=target[0]-p.x,ty=target[1]-p.y;
          remaining=Math.hypot(tx,ty);
          if(remaining<EPSILON){this.path.shift();continue;}
          dx=tx/remaining;dy=ty/remaining;
        }else break;
        const amount=Math.min(MOVE_STEP,budget,remaining),beforeX=p.x,beforeY=p.y;
        this.#move(dx*amount,dy*amount);
        const movedX=p.x-beforeX,movedY=p.y-beforeY,moved=Math.hypot(movedX,movedY);
        budget-=amount;
        if(moved<EPSILON)break;
        travelled+=moved;lastDx=movedX;lastDy=movedY;
        if(!manual&&this.path.length){
          const target=this.path[0];
          if(Math.hypot(target[0]-p.x,target[1]-p.y)<EPSILON)this.path.shift();
        }
      }
      if(!manual&&!this.path.length){
        arrivedInteraction=this.pendingInteraction;
        this.pendingInteraction=null;
        this.target=null;
      }
      p.moving=travelled>EPSILON;
      if(p.moving){
        this.#face(lastDx,lastDy);
        const directionLength=Math.hypot(lastDx,lastDy);
        p.motionX=lastDx/directionLength;p.motionY=lastDy/directionLength;
        p.walkDistance+=travelled;
        p.step=p.walkDistance/STRIDE_WORLD*8;
        p.frame=Math.floor(p.step+1e-9)%8;
        this.changed=true;
      }
      this.saveClock+=dt;
      if(this.saveClock>4&&this.changed){
        this.saveClock=0;this.changed=false;this.onPosition?.(p.x,p.y);
      }
      // Interaction opens a modal after recording the final movement. No
      // waypoint produces a forced idle frame or uncounted position snap.
      if(arrivedInteraction)this.onInteract(arrivedInteraction);
    }
  }
  root.Tidemark=Object.assign(root.Tidemark,{TILE,CityNavigation,CityController});
})(globalThis);
