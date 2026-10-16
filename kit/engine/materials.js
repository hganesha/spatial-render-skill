// materials.js — named material library, finishes, and procedural textures.

export const MATERIAL_PRESETS = {
  'aluminum':      { color: '#9aa3ad', metalness: 0.85, roughness: 0.42, finish: 'satin' },
  'brushed-steel': { color: '#8f979e', metalness: 0.9,  roughness: 0.38, finish: 'brushed', texture: 'brushed' },
  'steel-dark':    { color: '#3a4048', metalness: 0.8,  roughness: 0.5 },
  'titanium':      { color: '#7d838c', metalness: 0.85, roughness: 0.35 },
  'chrome':        { color: '#d7dde2', metalness: 1.0,  roughness: 0.12 },
  'copper':        { color: '#b87333', metalness: 0.95, roughness: 0.32 },
  'brass':         { color: '#c9a227', metalness: 0.9,  roughness: 0.35 },
  'gold':          { color: '#d4af37', metalness: 1.0,  roughness: 0.28 },
  'pcb-green':     { color: '#0e5c3a', metalness: 0.05, roughness: 0.55, texture: 'pcb-traces' },
  'pcb-blue':      { color: '#123a6b', metalness: 0.05, roughness: 0.55, texture: 'pcb-traces' },
  'solder-mask':   { color: '#12281c', metalness: 0.05, roughness: 0.6 },
  'silicon':       { color: '#4a5568', metalness: 0.6,  roughness: 0.3, emissive: '#0b1524', emissiveIntensity: 0.25 },
  'ceramic':       { color: '#d8d2c4', metalness: 0.0,  roughness: 0.55 },
  'plastic-black': { color: '#1b1f27', metalness: 0.05, roughness: 0.62 },
  'plastic-white': { color: '#e8eaee', metalness: 0.02, roughness: 0.55 },
  'plastic-gray':  { color: '#6b7280', metalness: 0.08, roughness: 0.58 },
  'rubber':        { color: '#22262e', metalness: 0.0,  roughness: 0.92 },
  'glass':         { color: '#bfe3f2', metalness: 0.0,  roughness: 0.06, transmission: 0.92, transparent: true, opacity: 0.32, ior: 1.5, type: 'physical' },
  'acrylic':       { color: '#9fd4e8', metalness: 0.0,  roughness: 0.12, transparent: true, opacity: 0.28, transmission: 0.6, ior: 1.45, type: 'physical' },
  'emissive-amber':{ color: '#ff9a3c', metalness: 0.0,  roughness: 0.4, emissive: '#ff8c1a', emissiveIntensity: 1.4 },
  'emissive-cyan': { color: '#3ce0ff', metalness: 0.0,  roughness: 0.4, emissive: '#19c8f0', emissiveIntensity: 1.5 },
  'ghost':         { color: '#8fa3b8', metalness: 0.1,  roughness: 0.7, transparent: true, opacity: 0.16 },
  'wood':          { color: '#8a5a2b', metalness: 0.0,  roughness: 0.75 }
};

const FINISH_ROUGHNESS = {
  matte: 0.85, satin: 0.5, polished: 0.16, anodized: 0.42, brushed: 0.38, cast: 0.72
};

export function resolveMaterialDef(library, nameOrDef) {
  if (!nameOrDef) return { preset: 'aluminum' };
  if (typeof nameOrDef === 'string') {
    if (library && library[nameOrDef]) return Object.assign({ preset: nameOrDef }, library[nameOrDef]);
    return { preset: nameOrDef };
  }
  return nameOrDef;
}

function hexToRgb(hex) {
  const h = (hex || '#888888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ------------------------------------------------------- procedural textures
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function texturePcb(baseHex) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const [r, gr, b] = hexToRgb(baseHex);
  g.fillStyle = `rgb(${r},${gr},${b})`;
  g.fillRect(0, 0, 256, 256);
  // subtle weave
  g.globalAlpha = 0.08;
  for (let y = 0; y < 256; y += 4) { g.fillStyle = '#000'; g.fillRect(0, y, 256, 1); }
  g.globalAlpha = 1;
  // traces
  const rand = mulberry32(7);
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = i % 3 === 0 ? 'rgba(210,180,80,0.5)' : 'rgba(190,230,205,0.28)';
    let x = rand() * 256, y = rand() * 256;
    g.beginPath(); g.moveTo(x, y);
    const steps = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < steps; s++) {
      if (rand() > 0.5) x = clamp256(x + (rand() - 0.5) * 160); else y = clamp256(y + (rand() - 0.5) * 160);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // vias
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(220,190,90,0.55)';
    g.beginPath(); g.arc(rand() * 256, rand() * 256, 1.6, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function clamp256(v) { return Math.max(2, Math.min(254, v)); }

function textureBrushed() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#9aa1a8'; g.fillRect(0, 0, 256, 256);
  const rand = mulberry32(11);
  for (let i = 0; i < 900; i++) {
    const y = rand() * 256;
    const l = 30 + rand() * 140;
    g.strokeStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '40,44,52'},${0.04 + rand() * 0.1})`;
    g.lineWidth = 0.8 + rand();
    g.beginPath(); g.moveTo(rand() * 256, y); g.lineTo(rand() * 256 + l, y + (rand() - 0.5) * 2); g.stroke();
  }
  return c;
}

function textureVents() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#22262c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#0c0e12';
  for (let y = 12; y < 256; y += 22) {
    for (let x = 12; x < 256; x += 26) {
      roundRect(g, x, y, 16, 8, 4); g.fill();
    }
  }
  return c;
}

function textureCarbon() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  for (let y = 0; y < 128; y += 16) {
    for (let x = 0; x < 128; x += 16) {
      g.fillStyle = ((x / 16 + y / 16) % 2 === 0) ? '#181c22' : '#232830';
      g.fillRect(x, y, 16, 16);
    }
  }
  return c;
}

function textureKnurl() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#5b636c'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
  for (let i = -128; i < 256; i += 10) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke();
  }
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTURE_GENERATORS = {
  'pcb-traces': texturePcb,
  'brushed': textureBrushed,
  'vents': textureVents,
  'carbon': textureCarbon,
  'knurl': textureKnurl
};

// ------------------------------------------------------- material system
export function createMaterialSystem(THREE) {
  const textureCache = new Map();
  const materialCache = new Map();

  function getTexture(name, param) {
    const key = name + ':' + (param || '');
    if (textureCache.has(key)) return textureCache.get(key);
    const gen = TEXTURE_GENERATORS[name];
    if (!gen) return null;
    const canvas = gen(param || '#0e5c3a');
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    textureCache.set(key, tex);
    return tex;
  }

  function buildMaterial(library, nameOrDef, opts) {
    const def = resolveMaterialDef(library, nameOrDef);
    const preset = def.preset && MATERIAL_PRESETS[def.preset] ? MATERIAL_PRESETS[def.preset] : {};
    const merged = Object.assign({}, preset, def);
    const finishRough = FINISH_ROUGHNESS[merged.finish] != null ? FINISH_ROUGHNESS[merged.finish] : null;

    const params = {
      color: new THREE.Color(merged.color || '#9aa3ad'),
      metalness: merged.metalness != null ? merged.metalness : 0.3,
      roughness: merged.roughness != null ? merged.roughness : (finishRough != null ? finishRough : 0.5),
      transparent: merged.transparent != null ? merged.transparent : (merged.opacity != null && merged.opacity < 1),
      opacity: merged.opacity != null ? merged.opacity : 1,
      side: merged.side === 'double' ? THREE.DoubleSide : merged.side === 'back' ? THREE.BackSide : THREE.FrontSide,
      flatShading: !!merged.flatShading,
      wireframe: !!merged.wireframe
    };
    if (merged.emissive) {
      params.emissive = new THREE.Color(merged.emissive);
      params.emissiveIntensity = merged.emissiveIntensity != null ? merged.emissiveIntensity : 1;
    }

    let mat;
    const type = merged.type || (merged.transmission ? 'physical' : 'standard');
    if (type === 'basic') {
      mat = new THREE.MeshBasicMaterial({ color: params.color, transparent: params.transparent, opacity: params.opacity, wireframe: params.wireframe, side: params.side });
    } else if (type === 'physical') {
      mat = new THREE.MeshPhysicalMaterial(params);
      if (merged.transmission != null) mat.transmission = merged.transmission;
      if (merged.clearcoat != null) mat.clearcoat = merged.clearcoat;
      if (merged.ior != null) mat.ior = merged.ior;
      if (merged.reflectivity != null) mat.reflectivity = merged.reflectivity;
    } else {
      mat = new THREE.MeshStandardMaterial(params);
    }

    const texName = merged.texture && merged.texture !== 'none' ? merged.texture : null;
    if (texName && type !== 'basic') {
      const tex = getTexture(texName, merged.color);
      if (tex) {
        mat.map = tex;
        if (type === 'physical') mat.roughnessMap = null;
      }
    }

    mat.userData.spatialMaterial = true;
    mat.userData.spatialSource = nameOrDef;
    return mat;
  }

  function cacheKeyOf(nameOrDef) {
    return typeof nameOrDef === 'string' ? nameOrDef : JSON.stringify(nameOrDef || {});
  }

  function buildCached(library, nameOrDef) {
    const key = cacheKeyOf(nameOrDef);
    if (!materialCache.has(key)) materialCache.set(key, buildMaterial(library, nameOrDef));
    return materialCache.get(key).clone();
  }

  function dispose() {
    for (const m of materialCache.values()) m.dispose();
    materialCache.clear();
    for (const t of textureCache.values()) t.dispose();
    textureCache.clear();
  }

  return { buildMaterial, buildCached, getTexture, dispose };
}
