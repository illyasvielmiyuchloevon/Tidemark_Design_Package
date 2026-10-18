/* Deterministic world-space terrain masks. No DOM or per-frame work. */
(function (root) {
  'use strict';
  const INF = 1e12;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const hash = (x, y, seed) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  const noise = (x, y, seed) => {
    const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
    const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * 2 - 1;
  };

  // Exact separable squared Euclidean transform (Felzenszwalb-style envelope).
  // Finite INF also handles individual empty rows without NaN envelopes.
  function edt1d(f, n, output, sites, edges) {
    let k = 0;
    sites[0] = 0; edges[0] = -INF; edges[1] = INF;
    for (let q = 1; q < n; q++) {
      let p = sites[k];
      let s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * (q - p));
      while (s <= edges[k]) {
        k--; p = sites[k];
        s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * (q - p));
      }
      k++; sites[k] = q; edges[k] = s; edges[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (edges[k + 1] < q) k++;
      const d = q - sites[k]; output[q] = d * d + f[sites[k]];
    }
  }
  function edt2d(labels, target, invert, width, height, temp, output, scratch) {
    const { f, d, sites, edges } = scratch;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) f[x] = ((labels[row + x] === target) !== invert) ? 0 : INF;
      edt1d(f, width, d, sites, edges);
      for (let x = 0; x < width; x++) temp[row + x] = d[x];
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) f[y] = temp[y * width + x];
      edt1d(f, height, d, sites, edges);
      for (let y = 0; y < height; y++) output[y * width + x] = d[y];
    }
  }
  function sample(field, x, y, width, height) {
    x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const j = iy * width + ix, x1 = Math.min(ix + 1, width - 1);
    const j2 = Math.min(iy + 1, height - 1) * width;
    return (field[j] * (1 - fx) + field[iy * width + x1] * fx) * (1 - fy)
      + (field[j2 + ix] * (1 - fx) + field[j2 + x1] * fx) * fy;
  }
  function parseColor(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [n >>> 16 & 255, n >>> 8 & 255, n & 255];
  }

  function textureIndex(material, x, y) {
    const t=material.texture;
    const mx=Math.floor(x/material.textureScale),my=Math.floor(y/material.textureScale);
    if(material.textureRepeat==='mirror') {
      const ux=mx%(t.width*2),uy=my%(t.height*2);
      return (uy<t.height?uy:t.height*2-1-uy)*t.width+(ux<t.width?ux:t.width*2-1-ux);
    }
    return (my%t.height)*t.width+mx%t.width;
  }

  /**
   * bakeNoiseGround(map, options) -> opaque RGBA in unprojected world coordinates.
   *
   * map: existing city map { width,height,tiles,seed,tileSize? }.
   * options.materials: { id: { texture?:{width,height,data:RGBA},color?,
   *                    water?,constructed?,road?,edgeAmplitude?,textureScale? } }
   * options.codeToMaterial: { G:'grass', R:'cobble', ... }.
   * options.labelAtWorld?: (x,y,code,defaultId) => materialId. Called only once
   *   for each coarse cell; useful for authored dirt/grass patches inside G.
   * options.hardWaterCodes?: ['C'] for masonry canals (not natural rivers).
   *
   * All material IDs are sorted before evaluation: no painter's-order effects.
   * Texture coordinates are continuous world coordinates, never reset per tile.
   */
  function bakeNoiseGround(map, options) {
    const now = () => root.performance ? root.performance.now() : Date.now();
    const started = now();
    const tile = map.tileSize || 32, step = options.step || 4, seed = (options.seed ?? map.seed ?? 1) | 0;
    const width = map.width * tile, height = map.height * tile;
    const gw = Math.ceil(width / step), gh = Math.ceil(height / step), n = gw * gh;
    const ids = Object.keys(options.materials).sort();
    if (!ids.length || ids.length > 16) throw new Error('Ground needs 1–16 materials.');
    const index = new Map(ids.map((id, i) => [id, i]));
    const materials = ids.map(id => ({ color:'#777777',edgeAmplitude:12,textureScale:1,...options.materials[id],id }));
    for (const m of materials) m.rgb = parseColor(m.color);
    const labels = new Uint8Array(n), tileMasks = new Uint16Array(map.width * map.height);
    const hardWaterCodes = new Set(options.hardWaterCodes || []), seen = new Uint8Array(ids.length);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = Math.min(width - .5, gx * step + step * .5), y = Math.min(height - .5, gy * step + step * .5);
      const tx = Math.floor(x / tile), ty = Math.floor(y / tile), code = map.tiles[ty][tx];
      let id = options.codeToMaterial[code];
      if (options.labelAtWorld) id = options.labelAtWorld(x, y, code, id);
      const i = index.get(id);
      if (i === undefined) throw new Error(`Unknown terrain material '${id}' for '${code}'.`);
      labels[gy * gw + gx] = i; seen[i] = 1; tileMasks[ty * map.width + tx] |= (1 << i);
    }
    const candidates = Array.from({ length:map.width * map.height }, () => []);
    for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++) {
      let bits = 0;
      // The broad displacement + feather can reach a second tile; include it
      // before scoring so masks cannot acquire candidate-window seams.
      for (let y = Math.max(0, ty - 2); y <= Math.min(map.height - 1, ty + 2); y++)
        for (let x = Math.max(0, tx - 2); x <= Math.min(map.width - 1, tx + 2); x++) bits |= tileMasks[y * map.width + x];
      const a = candidates[ty * map.width + tx];
      for (let i = 0; i < ids.length; i++) if (bits & (1 << i)) a.push(i);
    }
    const temp = new Float64Array(n), inside = new Float64Array(n), outside = new Float64Array(n);
    const scratchLength = Math.max(gw, gh);
    const scratch = { f:new Float64Array(scratchLength),d:new Float64Array(scratchLength),sites:new Int32Array(scratchLength),edges:new Float64Array(scratchLength + 1) };
    const fields = [], scores = [];
    for (let i = 0; i < ids.length; i++) {
      if (!seen[i] || materials[i].constructed) continue;
      edt2d(labels, i, false, gw, gh, temp, inside, scratch);
      edt2d(labels, i, true, gw, gh, temp, outside, scratch);
      const field = fields[i] = new Float32Array(n);
      for (let j = 0; j < n; j++) field[j] = labels[j] === i ? Math.sqrt(outside[j]) * step - step * .5 : -Math.sqrt(inside[j]) * step + step * .5;
    }
    const fieldsMs = now() - started;
    const warpX = new Float32Array(n), warpY = new Float32Array(n), edgeA = new Float32Array(n), edgeB = new Float32Array(n), tone = new Float32Array(n);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = gx * step + step * .5, y = gy * step + step * .5, j = gy * gw + gx;
      // Broad shape + smaller irregularities, independent of tiles or chunks.
      warpX[j] = 24 * noise(x / 168, y / 168, seed ^ 851) + 8 * noise(x / 51, y / 51, seed ^ 907) + 2.1 * noise(x / 13, y / 13, seed ^ 1153);
      warpY[j] = 24 * noise(x / 168, y / 168, seed ^ 1889) + 8 * noise(x / 51, y / 51, seed ^ 2609) + 2.1 * noise(x / 13, y / 13, seed ^ 2903);
      const qx = x + warpX[j], qy = y + warpY[j];
      edgeA[j] = .45 * noise(qx / 93, qy / 93, seed ^ 6503) + .32 * noise(qx / 27, qy / 27, seed ^ 7177) + .23 * noise(qx / 7, qy / 7, seed ^ 8111);
      edgeB[j] = .45 * noise(qx / 93, qy / 93, seed ^ 10039) + .32 * noise(qx / 27, qy / 27, seed ^ 11213) + .23 * noise(qx / 7, qy / 7, seed ^ 17977);
      tone[j] = noise(x / 173, y / 173, seed ^ 5039);
    }
    for (let i = 0; i < ids.length; i++) {
      if (!fields[i]) continue;
      const field = fields[i], score = scores[i] = new Float32Array(n), m = materials[i];
      const phase = i * 2.399963, ca = Math.cos(phase), cb = Math.sin(phase), norm = Math.abs(ca) + Math.abs(cb);
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        const j = gy * gw + gx;
        const irregularity = (edgeA[j] * ca + edgeB[j] * cb) / norm;
        score[j] = sample(field, gx + warpX[j] / step, gy + warpY[j] / step, gw, gh) + irregularity * m.edgeAmplitude;
      }
    }
    const masksMs = now() - started - fieldsMs;
    const data = new Uint8ClampedArray(width * height * 4);
    const dominant = options.debug ? new Uint8Array(width * height) : null;
    const blend = options.blendWidth || 28, shoreReach = options.shoreReach || 6, core = options.roadCore || 8;
    const roadCoreCodes=options.roadCoreCodes?new Set(options.roadCoreCodes):null;
    const active = new Int8Array(16), values = new Float32Array(16), weights = new Float32Array(16);
    let mixedPixels = 0, threeWayPixels = 0, opaquePixels = 0, maxWeightError = 0;
    for (let y = 0; y < height; y++) {
      const ty = Math.floor(y / tile), fy = (y + .5) / step - .5;
      const ly = clamp(Math.floor((y + .5) / step), 0, gh - 1);
      for (let x = 0; x < width; x++) {
        const tx = Math.floor(x / tile), lx = clamp(Math.floor((x + .5) / step), 0, gw - 1);
        const base = labels[ly * gw + lx], bm = materials[base], code = map.tiles[ty][tx];
        const fx = (x + .5) / step - .5, list = candidates[ty * map.width + tx];
        let count = 0, best = -INF, bestId = base;
        const protectedRoad = bm.road && (!roadCoreCodes || roadCoreCodes.has(code));
        const roadDepth = protectedRoad ? sample(fields[base], fx, fy, gw, gh) : 0;
        const coreProtection = protectedRoad ? smooth((roadDepth - core * .18) / (core * .82)) : 0;
        const pure = bm.constructed || (bm.water && hardWaterCodes.has(code)) || list.length === 1 || coreProtection === 1;
        if (pure) { active[0] = base; weights[0] = 1; count = 1; }
        else {
          for (let k = 0; k < list.length; k++) {
            const i = list[k], m = materials[i];
            if (m.constructed) continue; // Built quay/deck footprints have crisp borders.
            if (!bm.water && m.water) continue; // Never draw navigational water over walkable land.
            let s;
            if (bm.water) {
              if (m.water) { if (i !== base) continue; s = 0; }
              else {
                const d = sample(fields[i], fx, fy, gw, gh);
                if (d < -shoreReach) continue; // Conservative visual shoreline extension only.
                const n0 = sample(edgeA, fx, fy, gw, gh), n1 = sample(edgeB, fx, fy, gw, gh);
                // Positive shoreline offset lives entirely on the blocked side.
                // Offset + perturbation + narrow shore blend stay < reach.
                s = d + shoreReach * .49 + shoreReach * .30 * (i % 2 ? n0 : n1);
              }
            } else s = sample(scores[i], fx, fy, gw, gh);
            // Material height carries whole grass tufts and stone faces into
            // the shared mask. Low grout lets soil appear between the stones
            // before their faces disappear; no independent pixel scatter.
            if(m.texture?.heights) s += m.texture.heights[textureIndex(m,x,y)] * (bm.water ? .50 : blend / 10);
            if(i===base && coreProtection>0) s += coreProtection * (blend + 32);
            active[count] = i; values[count] = s;
            if (s > best) { best = s; bestId = i; }
            count++;
          }
          if (!count) { active[0] = base; weights[0] = 1; count = 1; }
          else {
            let sum = 0, nonzero = 0;
            // Blend width controls coherent material coverage. The final local
            // feather is small: intact stones and grass clumps alternate over
            // a broad band instead of every texel becoming a grey low-alpha mix.
            const bandwidth = bm.water ? shoreReach * .27 : (options.edgeFeather ?? 2.4);
            for (let k = 0; k < count; k++) { const w = smooth(1 - (best - values[k]) / bandwidth); weights[k] = w; sum += w; if (w > .01) nonzero++; }
            let check = 0;
            for (let k = 0; k < count; k++) {
              weights[k] /= sum;
              check += weights[k];
            }
            maxWeightError = Math.max(maxWeightError, Math.abs(check - 1));
            if (nonzero > 1) mixedPixels++;
            if (nonzero > 2) threeWayPixels++;
          }
        }
        // Continuous normalized splat weights preserve whole tufts and stone
        // joints. Independent random pixel picks would turn the broad mask
        // back into salt-and-pepper speckle.
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < count; k++) {
          const w = weights[k]; if (w <= 0) continue;
          const m = materials[active[k]], t = m.texture;
          if (t) {
            // Mirrored repeat has identical edge samples even when a generated
            // albedo is not perfectly periodic. It avoids atlas-panel seams.
            const p = textureIndex(m,x,y) * 4;
            r += t.data[p] * w; g += t.data[p + 1] * w; b += t.data[p + 2] * w;
          } else { r += m.rgb[0] * w; g += m.rgb[1] * w; b += m.rgb[2] * w; }
        }
        const gain = options.macroTone === false || bm.constructed ? 1 : 1 + sample(tone, fx, fy, gw, gh) * .025;
        const pixel = y * width + x, p = pixel * 4;
        data[p] = r * gain; data[p + 1] = g * gain; data[p + 2] = b * gain; data[p + 3] = 255;
        if (dominant) dominant[pixel] = pure ? base : bestId;
        opaquePixels++;
      }
    }
    return {
      width,height,data,dominant,materialIds:ids,
      stats:{ totalMs:Math.round(now() - started),fieldsMs:Math.round(fieldsMs),masksMs:Math.round(masksMs),materials:seen.reduce((s,v)=>s+v,0),coarseCells:n,mixedPixels,threeWayPixels,opaquePixels,maxWeightError,
        // Transient arrays are eligible for collection as soon as this call returns.
        estimatedPeakTypedArrayMB:Math.round((data.byteLength + (dominant?.byteLength || 0) + n * (24 + 20 + ids.length * 8) + labels.byteLength) / 1048576)
      }
    };
  }

  // Quiet, repeatable pixel materials. The 256px sheets are synthesized from
  // coherent fields with a few authored-size tufts/pebbles, not image filters.
  // This avoids the previous grass atlas' almost one-highlight-per-pixel grain.
  function makeTerrainTexture(kind, seed, base) {
    const width = 256, height = 256, data = new Uint8ClampedArray(width * height * 4), heights = new Int8Array(width * height);
    const rgb = Array.isArray(base) ? base : parseColor(base);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const broad = noise(x / 61, y / 61, seed ^ 601);
      const middle = noise(x / 19, y / 19, seed ^ 1303);
      const clusters = noise(x / 6, y / 6, seed ^ 2791);
      const grain = (hash(x >> 1, y >> 1, seed ^ 6803) - .5) * 2;
      let value = broad * 12 + middle * 8 + clusters * 4.4 + grain * 2.6;
      if (kind === 'grass') {
        // Sparse 1–3px blades live in clumps; most of the material is calm.
        const cellX = Math.floor(x / 7), cellY = Math.floor(y / 8);
        const tuft = hash(cellX, cellY, seed ^ 17989);
        const px = x % 7, py = y % 8;
        if (tuft > .55 && clusters > -.25) {
          const ox = 1 + Math.floor(hash(cellX, cellY, seed ^ 11083) * 3);
          const oy = 2 + Math.floor(hash(cellX, cellY, seed ^ 14723) * 3);
          if ((px === ox && py >= oy - 1 && py <= oy + 1) || (px === ox + 1 && py === oy)) value += 15;
          if (px === ox - 1 && py === oy + 1) value -= 8;
        }
      } else {
        const cellX = Math.floor(x / 11), cellY = Math.floor(y / 9);
        const pebble = hash(cellX, cellY, seed ^ 19963);
        const px = x % 11, py = y % 9;
        if (pebble > .73 && px >= 3 && px <= 4 && py === 4) value += 12;
        if (pebble > .73 && px >= 4 && px <= 5 && py === 5) value -= 8;
        value += noise(x / 3, y / 3, seed ^ 10009) * 1.8;
      }
      heights[y*width+x] = Math.round(clusters*5 + middle*2.0 + clamp(value-broad*12-middle*8,-8,15)*.45);
      value = Math.round(value / 1.8) * 1.8;
      const p = (y * width + x) * 4;
      data[p] = rgb[0] + value; data[p + 1] = rgb[1] + value;
      data[p + 2] = rgb[2] + value * .76; data[p + 3] = 255;
    }
    return {width,height,data,heights};
  }

  function makeCobbleTexture(seed, base, kind = 'cobble') {
    const width=512,height=512,data=new Uint8ClampedArray(width*height*4),heights=new Int8Array(width*height);
    const cellW=kind==='brick'?15:kind==='slate'?18:11,cellH=kind==='brick'?10:kind==='slate'?18:14;
    const cellsW=Math.ceil(width/cellW)+2,cellsH=Math.ceil(height/cellH)+2;
    const seeds=[];
    for(let cy=-1;cy<cellsH;cy++)for(let cx=-1;cx<cellsW;cx++){
      const jitter=kind==='brick'?.09:.27;
      seeds.push({cx,cy,x:(cx+.5+(cy&1)*.47+(hash(cx,cy,seed)-.5)*jitter*2)*cellW,y:(cy+.5+(hash(cx,cy,seed^7127)-.5)*jitter*2)*cellH,v:hash(cx,cy,seed^8849)});
    }
    const rowLength=cellsW+1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const gx=Math.floor(x/cellW),gy=Math.floor(y/cellH);
      let best=1e9,second=1e9,point;
      for(let cy=gy-1;cy<=gy+1;cy++)for(let cx=gx-1;cx<=gx+1;cx++){
        const site=seeds[(cy+1)*rowLength+(cx+1)];
        const dx=x-site.x,dy=y-site.y;
        const distance=kind==='brick'?Math.max(Math.abs(dx)/cellW,Math.abs(dy)/cellH)*16:Math.hypot(dx,dy);
        if(distance<best){second=best;best=distance;point=site;}else if(distance<second)second=distance;
      }
      const edge=second-best;
      const grain=(hash(x>>1,y>>1,seed^19609)-.5)*6.5;
      const weather=noise(x/47,y/47,seed^10151)*5+noise(x/5,y/5,seed^11953)*3.2;
      let value=(point.v-.5)*31+grain+weather;
      value += clamp((point.y-y)/cellH + (point.x-x)/cellW,-1,1)*4.5;
      if(edge<1.05)value-=12*(1-edge/1.05)+4;
      else if(edge<2.4)value+=(x<point.x&&y<point.y?10:-7)*(1-(edge-1.05)/1.35);
      heights[y*width+x]=Math.round(edge<1.25?-10+(edge/1.25)*7:(point.v-.5)*12+2);
      const p=(y*width+x)*4;
      const grout=smooth(1-edge/1.05);
      data[p]=(base[0]+value)*(1-grout)+(base[0]*.62)*grout;
      data[p+1]=(base[1]+value)*(1-grout)+(base[1]*.70)*grout;
      data[p+2]=(base[2]+value*.9)*(1-grout)+(base[2]*.72)*grout;data[p+3]=255;
    }
    return{width,height,data,heights};
  }
  function gradeTerrainTexture(texture, saturation = 1, contrast = 1, gain = 1, tint) {
    const data = new Uint8ClampedArray(texture.data.length);
    let mean = [0,0,0];
    if (tint) {
      for (let i = 0; i < texture.data.length; i += 4) for (let k = 0; k < 3; k++) mean[k] += texture.data[i + k];
      mean = mean.map(v => v / (texture.data.length / 4));
    }
    for (let i = 0; i < data.length; i += 4) {
      const lum = texture.data[i] * .2126 + texture.data[i + 1] * .7152 + texture.data[i + 2] * .0722;
      for (let k = 0; k < 3; k++) {
        const source = lum + (texture.data[i + k] - lum) * saturation;
        data[i + k] = tint ? tint[k] + (texture.data[i + k] - mean[k]) * contrast : ((source - 128) * contrast + 128) * gain;
      }
      data[i + 3] = 255;
    }
    return {width:texture.width,height:texture.height,data};
  }
  function cityTerrainOptions(map, textures) {
    const ri = Number(map.region_id.slice(1)) - 1, arid = ri === 5, dry = ri === 3;
    const stoneIndex = [5,4,4,13,4,4,6,7,14,4,6,15][ri];
    const material = (i, color, extra = {}) => ({texture:textures[i],textureScale:1,textureRepeat:'mirror',color,...extra});
    const greens = [[94,115,80],[99,121,73],[110,125,75],[133,127,81],[98,121,70],[161,140,96],[102,122,69],[88,117,70],[94,119,80],[97,122,74],[103,123,73],[108,127,83]];
    const earth = arid ? [151,123,89] : dry ? [142,116,81] : [143,114,79];
    const green = makeTerrainTexture(arid ? 'soil' : 'grass', 6127 + ri * 113, greens[ri]);
    const soil = makeTerrainTexture('soil', 7283 + ri * 97, earth);
    const stoneTones = [[141,143,134],[174,161,135],[180,163,134],[153,133,97],[169,153,127],[169,155,129],[169,114,82],[105,103,100],[121,127,126],[168,153,125],[164,119,87],[178,161,141]];
    const stone = makeCobbleTexture(4519+ri*107,stoneTones[ri],stoneIndex===6?'brick':stoneIndex===14?'slate':'cobble');
    return {
      materials:{
        grass:material(0,map.palette.ground,{texture:green,edgeAmplitude:17}),
        soil:material(2,'#836c51',{texture:soil,edgeAmplitude:16}),
        cobble:material(stoneIndex,map.palette.stone,{texture:stone,textureScale:1,road:true,edgeAmplitude:11}),
        sand:material(3,'#c9b78d',{texture:gradeTerrainTexture(textures[3],.7,.40,.87),textureScale:.75,edgeAmplitude:16}),
        water:material(11,map.palette.water,{texture:gradeTerrainTexture(textures[11],.65,.55,.88),water:true}),
        planks:material(8,'#967856',{texture:gradeTerrainTexture(textures[8],.85,.76,.96),textureScale:.5,constructed:true}),
        rock:material(arid?7:12,'#66785a',{texture:gradeTerrainTexture(textures[arid?7:12],.7,.55,.94),textureScale:.7,edgeAmplitude:12})
      },
      // Road + plaza share one signed field: adjacent paving never interrupts
      // the route core with an invisible code boundary.
      codeToMaterial:{G:'grass',R:'cobble',P:'cobble',S:'sand',W:'water',C:'water',O:'water',B:'planks',D:'planks',X:'rock'},
      hardWaterCodes:map.urban_form==='canal'||map.street_pattern==='canals'?['C']:[],
      blendWidth:28,edgeFeather:2.4,roadCore:12,roadCoreCodes:['R'],shoreReach:16,
      labelAtWorld:(x,y,code,id)=>code==='G'&&(.72*noise(x/151,y/151,map.seed+11)+.28*noise(x/49,y/49,map.seed+117))>.18?'soil':id
    };
  }
  root.Tidemark = Object.assign(root.Tidemark || {}, { bakeNoiseGround,terrainNoise:noise,cityTerrainOptions,makeTerrainTexture,makeCobbleTexture });
})(globalThis);
