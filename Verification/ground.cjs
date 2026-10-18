const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
vm.runInThisContext(fs.readFileSync(__dirname+'/../src/game/city_ground.js','utf8'));
const map={width:9,height:9,tileSize:32,seed:221,tiles:['GGGGSSWWW','GGGGSSWWW','GGGSSSWWW','RRRSSSWWW','RRRSSSWWW','RRRSSSWWW','GGGSSSDDW','GGGSSSDDW','GGGSSSWWW']};
const materials={grass:{color:'#00ff00'},stone:{color:'#ff0000',road:true},sand:{color:'#ffff00'},water:{color:'#0000ff',water:true},deck:{color:'#804020',constructed:true}};
const codeToMaterial={G:'grass',R:'stone',S:'sand',W:'water',D:'deck'};
const options={materials,codeToMaterial,macroTone:false,debug:true,blendWidth:7};
const a=Tidemark.bakeNoiseGround(map,options),b=Tidemark.bakeNoiseGround(map,{...options,materials:Object.fromEntries(Object.entries(materials).reverse())});
assert.deepStrictEqual(a.data,b.data,'Material insertion order must not change results');
assert(a.stats.threeWayPixels>0,'At least one three-material blend');
assert(a.stats.maxWeightError<1e-6);
let checkedDeck=0,checkedLand=0,checkedRoad=0,checkedFarWater=0;
for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
 const code=map.tiles[Math.floor(y/32)][Math.floor(x/32)],p=(y*a.width+x)*4;
 assert.strictEqual(a.data[p+3],255,'No alpha gaps');
 if(code==='D'){assert.deepStrictEqual(Array.from(a.data.slice(p,p+3)),[128,64,32]);checkedDeck++;}
 if(code!=='W'&&code!=='D'){assert.strictEqual(a.data[p+2],0,'Never draw blue water onto walkable land');checkedLand++;}
 if(code==='R'&&(x%32>=9&&x%32<23)&&(y%32>=9&&y%32<23)){assert.deepStrictEqual(Array.from(a.data.slice(p,p+3)),[255,0,0]);checkedRoad++;}
 if(code==='W'){
  let nearest=Infinity;
  for(let yy=0;yy<map.height;yy++)for(let xx=0;xx<map.width;xx++)if(!['D','W'].includes(map.tiles[yy][xx])){
   const dx=Math.max(xx*32-(x+.5),0,(x+.5)-(xx+1)*32),dy=Math.max(yy*32-(y+.5),0,(y+.5)-(yy+1)*32);nearest=Math.min(nearest,Math.hypot(dx,dy));
  }
  if(nearest>=8){assert.deepStrictEqual(Array.from(a.data.slice(p,p+3)),[0,0,255]);checkedFarWater++;}
 }
}
console.log(JSON.stringify({ok:true,materialOrderInvariant:true,threeWayPixels:a.stats.threeWayPixels,maxWeightError:a.stats.maxWeightError,checkedDeck,checkedLand,checkedRoad,checkedFarWater,rgbaSHA256:crypto.createHash('sha256').update(a.data).digest('hex')},null,2));
