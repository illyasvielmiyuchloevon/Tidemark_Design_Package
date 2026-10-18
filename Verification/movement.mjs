import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

globalThis.Tidemark={};
const source=fileURLToPath(new URL('../src/game/navigation.js',import.meta.url));
vm.runInThisContext(fs.readFileSync(source,'utf8'),{filename:source});
const {CityController}=globalThis.Tidemark;
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-6,`${label}: ${actual} != ${expected}`);
const openMap=()=>({width:60,height:14,spawn:[3,3],walkRows:Array.from({length:14},()=> '1'.repeat(60)),facilities:[],npcs:[]});
const make=(map=openMap(),onInteract=()=>{})=>new CityController(map,{onInteract});

// Equal wall-clock movement at representative low, normal, and high rates.
const rates=[15,30,60,144],speedEvidence=[];
for(const fps of rates)for(const sprint of [false,true]){
  const c=make(),start=c.player.x;
  c.keys.add('d');if(sprint)c.keys.add('shift');
  for(let n=0;n<fps*3;n++)c.update(1/fps);
  const expected=(sprint?104:64)*3;
  close(c.player.x-start,expected,`${fps} FPS ${sprint?'run':'walk'} position`);
  close(c.player.walkDistance,expected,'distance must equal actual travel');
  speedEvidence.push({fps,sprint,distance:Number(c.player.walkDistance.toFixed(6))});
}

// A twenty-cell path consumes the same movement budget without an idle/snap
// frame at cell centers. Timing may differ by at most its final render frame.
const routeEvidence=[];
for(const fps of rates){
  const c=make(),start=[c.player.x,c.player.y];
  assert.equal(c.goTo([23,3]),true);
  let frames=0,idle=0;
  while(c.path.length&&frames<fps*12){
    const before=[c.player.x,c.player.y],oldDistance=c.player.walkDistance;
    c.update(1/fps);frames++;
    const moved=Math.hypot(c.player.x-before[0],c.player.y-before[1]);
    close(c.player.walkDistance-oldDistance,moved,'all displacement advances the walk cycle');
    if(c.path.length&&!c.player.moving)idle++;
  }
  assert.equal(c.path.length,0,'route arrived');
  assert.equal(idle,0,'no forced idle at an intermediate waypoint');
  close(c.player.x-start[0],640,'twenty-cell route distance');
  close(c.player.walkDistance,640,'accumulated route distance');
  assert.ok(Math.abs(frames/fps-10)<=1/fps+1e-7,'path duration is frame-rate independent');
  routeEvidence.push({fps,seconds:frames/fps,idle});
}

// A diagonal input against a horizontal wall produces horizontal movement;
// facing and the animation must follow that real motion, then stop when blocked.
const wallMap=openMap();wallMap.walkRows[4]='0'.repeat(wallMap.width);
const wall=make(wallMap);wall.player.y=4*32-5-.1;
wall.keys.add('d');wall.keys.add('s');
const beforeWall=[wall.player.x,wall.player.y];wall.update(1/60);
assert.ok(wall.player.x>beforeWall[0]);close(wall.player.y,beforeWall[1],'wall blocks vertical motion');
assert.equal(wall.player.direction,3,'sliding to the right faces right');
close(wall.player.walkDistance,wall.player.x-beforeWall[0],'wall sliding measures actual distance');
const stoppedDistance=wall.player.walkDistance,stoppedFrame=wall.player.frame;
wall.keys.delete('d');wall.update(.1);
assert.equal(wall.player.moving,false);close(wall.player.walkDistance,stoppedDistance,'blocked feet do not animate');
assert.equal(wall.player.frame,stoppedFrame,'blocked animation phase stays fixed');
const diagonal=make();diagonal.keys.add('d');diagonal.update(.1);diagonal.keys.add('s');diagonal.update(.1);
assert.equal(diagonal.player.direction,3,'a near-diagonal direction retains its previous dominant axis');

// A 48-unit bench extends beyond its original 32-unit grid cell. Its ends must
// block the character while the next cell centre remains a valid route.
const benchMap=openMap();benchMap.props=[{kind:'bench',solid:true,tile:[8,3],collisionBounds:[-24,-6,24,9]}];
benchMap.walkRows[3]=benchMap.walkRows[3].slice(0,8)+'0'+benchMap.walkRows[3].slice(9);
const bench=make(benchMap);
assert.equal(bench.nav.safePoint(272+27,112),false,'bench end has its actual physical width');
assert.equal(bench.nav.safePoint(272+32,112),true,'adjacent route centre stays clear');

// An even-width facade has a doorway between tile centers. The character must
// finish at that physical threshold, without overshooting and turning back.
const thresholdMap=openMap();
thresholdMap.facilities=[{id:'market',kind:'market',name:'交易所',door:[13,3],threshold:[416,112]}];
const arrivals=[];
const thresholdController=make(thresholdMap,target=>arrivals.push({target,position:[thresholdController.player.x,thresholdController.player.y]}));
assert.equal(thresholdController.goToFacility('market'),true);
assert.deepEqual(thresholdController.target,[416,112]);
let previousX=thresholdController.player.x;
for(let n=0;n<600&&thresholdController.path.length;n++){
  thresholdController.update(1/60);
  assert.ok(thresholdController.player.x>=previousX-1e-6,'do not walk past the door and reverse');
  assert.ok(thresholdController.player.x<=416+1e-6,'do not overshoot the doorway');
  previousX=thresholdController.player.x;
}
close(thresholdController.player.x,416,'exact threshold x');close(thresholdController.player.y,112,'exact threshold y');
assert.equal(arrivals.length,1,'arrival interacts once');assert.deepEqual(arrivals[0].target,{kind:'facility',id:'market'});
close(thresholdController.nearestInteraction().distance,0,'manual interaction uses the same exact threshold');
thresholdController.update(.1);assert.equal(arrivals.length,1,'arrival cannot trigger twice');
thresholdController.player.x=370;
assert.equal(thresholdController.nearestInteraction()?.id,'market','range is measured from threshold, not the farther tile center');

const legacyMap=openMap();legacyMap.facilities=[{id:'guild',name:'行会',door:[5,3]}];
const legacy=make(legacyMap);assert.equal(legacy.goToFacility('guild',false),true);
for(let n=0;n<120&&legacy.path.length;n++)legacy.update(1/60);
close(legacy.player.x,176,'a facility without a threshold uses its original tile center');
const blockedMap=openMap();blockedMap.walkRows[3]=blockedMap.walkRows[3].slice(0,12)+'0'+blockedMap.walkRows[3].slice(13);
blockedMap.facilities=[{id:'unsafe',name:'建筑后方',door:[10,3],threshold:[400,112]}];
assert.equal(make(blockedMap).goToFacility('unsafe'),false,'do not append a threshold segment through a solid tile');

// Stopping leaves the world-space position and distance clock unchanged.
const cycleEvidence=[];
for(const sprint of [false,true]){
  const c=make();c.keys.add('d');if(sprint)c.keys.add('shift');
  for(let n=0;n<31;n++)c.update(1/60);
  const position=[c.player.x,c.player.y],distance=c.player.walkDistance;
  c.stop();c.update(.1);
  assert.deepEqual([c.player.x,c.player.y],position,'stopping does not snap the feet');
  close(c.player.walkDistance,distance,'idle does not advance gait distance');
  cycleEvidence.push({sprint,stoppedDistance:distance});
}

console.log(JSON.stringify({result:'PASS',checks:['frame-rate independence','no waypoint idle or uncounted snap','collision-facing and diagonal hysteresis','precise and safe facility thresholds','idle preserves the distance clock'],speedEvidence,routeEvidence,cycleEvidence},null,2));
