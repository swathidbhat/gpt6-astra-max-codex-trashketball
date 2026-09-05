import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BASKETS, BALL_RADIUS, type Obstacle } from '@/lib/physics';

export type Room = { group: THREE.Group; obstacles: Obstacle[]; animate: (t: number) => void };
type Parent = THREE.Group | THREE.Scene;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const material = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(parent: Parent, size: number[], position: number[], mat: THREE.Material, radius = 0) {
  const geo = radius ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius) : new THREE.BoxGeometry(...size as [number, number, number]);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...position as [number, number, number]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function cylinder(parent: Parent, top: number, bottom: number, height: number, position: number[], mat: THREE.Material, open = false, segments = 40) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments, 1, open), mat);
  mesh.position.set(...position as [number, number, number]); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function tube(parent: Parent, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(points.length * 3, 10), radius, 6, false), mat);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function ring(parent: Parent, radius: number, thickness: number, y: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 64), mat);
  mesh.rotation.x = Math.PI / 2; mesh.position.y = y; parent.add(mesh); mesh.castShadow = true; return mesh;
}
function collider(obstacles: Obstacle[], x: number, y: number, z: number, w: number, h: number, d: number) {
  obstacles.push({ min: { x: x - w / 2, y: y - h / 2, z: z - d / 2 }, max: { x: x + w / 2, y: y + h / 2, z: z + d / 2 } });
}

function noiseTexture(color: string, repeat: number, streaks = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
  let seed = 731;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 18000; i++) {
    const light = random() > 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${random() * 0.13})` : `rgba(0,0,0,${random() * 0.16})`;
    ctx.fillRect(random() * 256, random() * 256, streaks ? 12 + random() * 50 : 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}

function sign(parent: Parent, text: string, width: number, height: number, position: number[], color = '#254d50', background?: string, subtitle?: string) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 384); }
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 100px Georgia'; ctx.fillText(text, 512, subtitle ? 150 : 192);
  if (subtitle) { ctx.font = '22px monospace'; ctx.fillText(subtitle, 512, 248); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: !background, side: THREE.DoubleSide }));
  mesh.position.set(...position as [number, number, number]); parent.add(mesh); return mesh;
}

export function makePaper(seed = 1) {
  // Shared vertex displacement keeps the paper closed while flat normals show its folds.
  const geometry = new THREE.IcosahedronGeometry(BALL_RADIUS, 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const wave = Math.sin(x * 213 + seed) * Math.cos(y * 179 + seed) * Math.sin(z * 137 + seed);
    const scale = 0.83 + (wave + 1) * 0.1;
    positions.setXYZ(i, x * scale, y * scale, z * scale);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#f4f1e5', roughness: 1, flatShading: true }));
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}

export function makeBasket(parent: Parent, level: 1 | 2) {
  const bin = BASKETS[level]; const group = new THREE.Group(); group.position.set(bin.x, 0, bin.z); parent.add(group);
  const dark = material(level === 1 ? '#303d38' : '#282b25', 0.7, 0.15);
  const trim = material(level === 1 ? '#87938c' : '#b89554', 0.34, 0.68);
  cylinder(group, bin.bottomRadius, bin.bottomRadius, 0.055, [0, 0.035, 0], dark);
  const liner = new THREE.MeshStandardMaterial({ color: level === 1 ? '#47544c' : '#8a7050', roughness: 0.9, side: THREE.DoubleSide, transparent: level === 1, opacity: level === 1 ? 0.32 : 1 });
  cylinder(group, bin.topRadius - 0.013, bin.bottomRadius - 0.013, bin.height - 0.04, [0, bin.height / 2, 0], liner, true);
  ring(group, bin.topRadius, 0.022, bin.height, trim);
  ring(group, bin.bottomRadius, 0.018, 0.05, trim);
  if (level === 1) {
    const points: number[] = [];
    for (let j = 0; j < 56; j++) {
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 16; i++) {
          for (const k of [i, i + 1]) {
            const t = k / 16, a = j / 56 * Math.PI * 2 + s * t * 0.8;
            const r = bin.bottomRadius + (bin.topRadius - bin.bottomRadius) * t;
            points.push(Math.cos(a) * r, 0.04 + (bin.height - 0.04) * t, Math.sin(a) * r);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#a3aea1', transparent: true, opacity: 0.7 })));
    sign(group, 'PAPER', 0.23, 0.085, [0, 0.54, bin.topRadius - 0.03], '#e5e8d7', '#34483e');
  } else {
    const wicker = material('#b5976e', 0.91);
    for (let i = 0; i < 22; i++) ring(group, bin.bottomRadius + (bin.topRadius - bin.bottomRadius) * i / 22 + 0.005, 0.01, 0.05 + i * (bin.height - 0.06) / 22, wicker);
    for (let i = 0; i < 52; i++) {
      const a = i / 52 * Math.PI * 2;
      tube(group, [V(Math.cos(a) * bin.bottomRadius, 0.05, Math.sin(a) * bin.bottomRadius), V(Math.cos(a) * bin.topRadius, bin.height - 0.03, Math.sin(a) * bin.topRadius)], 0.007, wicker);
    }
    ring(group, bin.topRadius - 0.008, 0.032, bin.height - 0.06, trim);
  }
  // A soft floor marker makes the target readable without covering the opening.
  const marker = new THREE.Mesh(new THREE.RingGeometry(bin.topRadius + 0.12, bin.topRadius + 0.135, 80), new THREE.MeshBasicMaterial({ color: level === 1 ? '#d5f990' : '#f1da93', transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.008; group.add(marker);
  return group;
}

function desk(parent: Parent, obstacles: Obstacle[], x: number, z: number) {
  const group = new THREE.Group(); group.position.set(x, 0, z); parent.add(group);
  const ivory = material('#bfc5ad'), green = material('#46695c'), metal = material('#626b61', 0.4, 0.5), black = material('#202d29');
  box(group, [2.5, 0.1, 1.32], [0, 0.86, 0], ivory, 0.025);
  for (const s of [-1, 1]) box(group, [0.1, 0.81, 1.13], [s * 1.08, 0.42, 0], metal);
  box(group, [0.62, 0.68, 1.05], [-0.8, 0.38, -0.01], ivory, 0.025);
  for (let i = 0; i < 3; i++) {
    box(group, [0.57, 0.012, 0.014], [-0.8, 0.25 + i * 0.2, 0.525], metal);
    box(group, [0.2, 0.023, 0.03], [-0.8, 0.34 + i * 0.2, 0.54], metal);
  }
  box(group, [2.56, 0.64, 0.075], [0, 1.15, -0.68], green, 0.018);
  box(group, [0.12, 0.16, 0.2], [0, 1.02, -0.1], ivory);
  box(group, [0.74, 0.6, 0.52], [0, 1.34, -0.14], ivory, 0.075);
  box(group, [0.59, 0.43, 0.01], [0, 1.35, 0.125], black, 0.04);
  const screen = sign(group, '0 1 0 9 3', 0.51, 0.27, [0, 1.34, 0.136], '#95cab1', '#17392e', 'MACRODATA REFINEMENT');
  (screen.material as THREE.MeshBasicMaterial).toneMapped = false;
  box(group, [0.68, 0.045, 0.23], [0, 0.94, 0.4], ivory, 0.02);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 10; c++) box(group, [0.045, 0.016, 0.045], [-0.28 + c * 0.061, 0.968, 0.32 + r * 0.062], metal, 0.005);
  box(group, [0.24, 0.065, 0.33], [0.76, 0.94, 0.24], black, 0.035);
  tube(group, [V(0.69, 0.99, 0.29), V(0.65, 1.04, 0.16), V(0.85, 1.04, 0.16), V(0.86, 0.99, 0.29)], 0.046, black);
  for (let i = 0; i < 3; i++) box(group, [0.28, 0.005, 0.38], [-0.65 + i * 0.02, 0.925 + i * 0.006, 0.28], material('#e9e9d8'));
  // A sculpted, wheeled office chair.
  cylinder(group, 0.035, 0.045, 0.42, [0.2, 0.26, 1.16], metal);
  const chair = material('#284d40', 0.9);
  box(group, [0.64, 0.13, 0.6], [0.2, 0.51, 1.15], chair, 0.08);
  box(group, [0.64, 0.62, 0.12], [0.2, 0.88, 1.45], chair, 0.07);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    tube(group, [V(0.2, 0.13, 1.16), V(0.2 + Math.cos(a) * 0.38, 0.09, 1.16 + Math.sin(a) * 0.38)], 0.018, metal);
    cylinder(group, 0.052, 0.052, 0.055, [0.2 + Math.cos(a) * 0.38, 0.058, 1.16 + Math.sin(a) * 0.38], black, false, 10).rotation.z = Math.PI / 2;
  }
  collider(obstacles, x, 0.86, z, 2.5, 0.1, 1.32);
  collider(obstacles, x, 1.15, z - 0.68, 2.56, 0.64, 0.075);
  collider(obstacles, x, 1.34, z - 0.14, 0.74, 0.6, 0.52);
  collider(obstacles, x + 0.2, 0.88, z + 1.45, 0.64, 0.62, 0.12);
}

export function buildOffice(scene: THREE.Scene): Room {
  const group = new THREE.Group(); scene.add(group); const obstacles: Obstacle[] = [];
  scene.background = new THREE.Color('#b3c0ae'); scene.fog = new THREE.Fog('#97aa98', 19, 40);
  const carpetMap = noiseTexture('#496553', 20);
  const carpet = new THREE.MeshStandardMaterial({ map: carpetMap, roughness: 1 });
  box(group, [16, 0.1, 28], [0, -0.06, -3], carpet);
  const wall = material('#c5cbb9'), panel = material('#769483'), trim = material('#7b8e7c');
  box(group, [16, 4.4, 0.18], [0, 2.2, -12], wall);
  box(group, [0.18, 4.4, 28], [-8, 2.2, -3], wall);
  box(group, [0.18, 4.4, 28], [8, 2.2, -3], wall);
  for (const x of [-7.9, 7.9]) box(group, [0.035, 1.08, 28], [x, 0.54, -3], panel);
  box(group, [15.8, 1.08, 0.03], [0, 0.54, -11.89], panel);
  box(group, [16, 0.08, 28], [0, 4.45, -3], material('#bcc5b5'));
  const gridPoints: number[] = [];
  for (let x = -8; x <= 8; x += 1.6) gridPoints.push(x, 4.4, -12, x, 4.4, 11);
  for (let z = -12; z < 11; z += 1.6) gridPoints.push(-8, 4.4, z, 8, 4.4, z);
  const grid = new THREE.BufferGeometry(); grid.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  group.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: '#869782', transparent: true, opacity: 0.55 })));
  const lightMat = new THREE.MeshStandardMaterial({ color: '#edf5d8', emissive: '#e6f6d8', emissiveIntensity: 2.1 });
  for (const x of [-4.8, 0, 4.8]) for (const z of [-9.7, -4.9, -0.1, 4.7, 9.5]) {
    box(group, [1.36, 0.045, 1.35], [x, 4.365, z], trim);
    box(group, [1.24, 0.012, 1.23], [x, 4.333, z], lightMat);
    for (let j = -3; j <= 3; j++) box(group, [0.012, 0.014, 1.23], [x + j * 0.155, 4.32, z], material('#c3d0b7'));
  }
  for (const x of [-3.3, 3.3]) for (const z of [-3.2, -7.8]) desk(group, obstacles, x, z);
  // The empty central aisle and immaculate symmetry echo the severed floor.
  sign(group, 'LUMON', 3.15, 1.05, [0, 3.04, -11.88], '#43665d', undefined, 'THE WORK IS MYSTERIOUS AND IMPORTANT.');
  for (const x of [-6.1, 6.1]) {
    box(group, [1.5, 2.65, 0.08], [x, 1.325, -11.81], material('#365c50'));
    box(group, [1.18, 1.2, 0.01], [x, 1.85, -11.755], material('#74927d', 0.4));
    box(group, [0.06, 0.23, 0.05], [x + 0.51, 1.02, -11.72], material('#bdc8ae', 0.3, 0.6));
    sign(group, x < 0 ? 'MDR' : 'EXIT', 0.48, 0.16, [x, 2.89, -11.83], '#31564a');
  }
  // Wall clock, a deliberately empty corridor, and cabinets.
  const clockFace = cylinder(group, 0.27, 0.27, 0.06, [5, 3.13, -11.79], material('#eef0dc'));
  clockFace.rotation.x = Math.PI / 2;
  tube(group, [V(5, 3.13, -11.747), V(5.02, 3.31, -11.747)], 0.012, material('#253d33'));
  tube(group, [V(5, 3.13, -11.744), V(5.14, 3.12, -11.744)], 0.012, material('#253d33'));
  for (const x of [-6.7, 6.7]) {
    box(group, [1.2, 1.05, 1.5], [x, 0.525, -5.2], material('#9daa95'), 0.025);
    for (let i = 0; i < 3; i++) box(group, [1.05, 0.025, 0.02], [x, 0.25 + i * 0.32, -4.44], trim);
    collider(obstacles, x, 0.525, -5.2, 1.2, 1.05, 1.5);
  }
  scene.add(new THREE.HemisphereLight('#e4eed6', '#344934', 2.3));
  const key = new THREE.DirectionalLight('#f2ffdf', 2.5); key.position.set(-2, 8, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -11; key.shadow.camera.right = 11; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  key.shadow.normalBias = 0.035; key.shadow.bias = -0.00015; scene.add(key);
  const fill = new THREE.PointLight('#d8efdb', 20, 22, 2); fill.position.set(0, 3.8, -5); scene.add(fill);
  makeBasket(group, 1);
  collider(obstacles, 0, 2.2, -12, 16, 4.4, 0.2);
  collider(obstacles, -8, 2.2, -3, 0.2, 4.4, 28);
  collider(obstacles, 8, 2.2, -3, 0.2, 4.4, 28);
  collider(obstacles, 0, 4.5, -3, 16, 0.2, 28);
  return { group, obstacles, animate: () => {} };
}

export function buildVilla(scene: THREE.Scene): Room {
  const group = new THREE.Group(); scene.add(group); const obstacles: Obstacle[] = [];
  scene.background = new THREE.Color('#bedee9'); scene.fog = new THREE.Fog('#bedee9', 55, 180);
  box(group, [20, 0.14, 25], [0, -0.08, -3], new THREE.MeshStandardMaterial({ map: noiseTexture('#d7c7a6', 14, true), roughness: 0.52 }));
  box(group, [20, 0.2, 25], [0, 6.2, -3], material('#ede7d8'));
  box(group, [0.2, 6.2, 25], [-10, 3.1, -3], material('#e6dfd0'));
  box(group, [0.2, 6.2, 25], [10, 3.1, -3], material('#e6dfd0'));
  const timber = material('#715342', 0.65), brass = material('#b39a61', 0.32, 0.75);
  // Double-height wall of glass, with an uninterrupted ocean horizon.
  for (const x of [-9.8, -6.5, -3.2, 0.1, 3.4, 6.7, 9.8]) box(group, [0.085, 6.2, 0.16], [x, 3.1, -11.5], timber);
  for (const y of [0.04, 3.9, 6.12]) box(group, [19.6, 0.085, 0.16], [0, y, -11.5], timber);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#dceff0', transparent: true, opacity: 0.08, roughness: 0.08, metalness: 0.15, depthWrite: false, side: THREE.DoubleSide });
  box(group, [19.6, 6.1, 0.025], [0, 3.06, -11.52], glass).castShadow = false;
  box(group, [40, 0.1, 24], [0, -0.22, -23.5], material('#ead9b4'));
  box(group, [250, 0.08, 180], [0, -0.31, -122], material('#59b8c8', 0.28, 0.23));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(240, 170, 75, 55), new THREE.MeshStandardMaterial({ color: '#45a7b9', roughness: 0.31, metalness: 0.3 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.19, -120); group.add(sea);
  const waveGeometry = sea.geometry; const waves = waveGeometry.attributes.position;
  const seaBase = Float32Array.from(waves.array);
  // Foam bands follow the shoreline; broad swells animate beyond the glazing.
  const foam: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(180, 0.12 + i * 0.08), new THREE.MeshBasicMaterial({ color: '#eff9e9', transparent: true, opacity: 0.48 - i * 0.065 }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, -0.1, -36 - i * 3.3); group.add(mesh); foam.push(mesh);
  }
  const rug = box(group, [12.8, 0.025, 9.5], [0, 0.009, -2.3], new THREE.MeshStandardMaterial({ map: noiseTexture('#ded7c4', 15), roughness: 1 }), 0.03);
  rug.receiveShadow = true;
  const sofaMat = new THREE.MeshStandardMaterial({ map: noiseTexture('#eee8d9', 2), roughness: 0.95 });
  const pillowMat = material('#b59d7b');
  function sofa(x: number, z: number, rotation: number, long = false) {
    const sofaGroup = new THREE.Group(); sofaGroup.position.set(x, 0, z); sofaGroup.rotation.y = rotation; group.add(sofaGroup);
    const w = long ? 4.8 : 3.7;
    box(sofaGroup, [w, 0.4, 1.45], [0, 0.34, 0], sofaMat, 0.2);
    box(sofaGroup, [w, 0.8, 0.34], [0, 0.72, -0.65], sofaMat, 0.16);
    for (const s of [-1, 1]) box(sofaGroup, [0.36, 0.57, 1.42], [s * (w / 2 - 0.15), 0.62, 0], sofaMat, 0.17);
    for (let i = 0; i < 3; i++) {
      box(sofaGroup, [(w - 0.7) / 3 - 0.025, 0.25, 1.13], [-(w - 0.7) / 3 + i * (w - 0.7) / 3, 0.59, 0.05], sofaMat, 0.12);
      const p = box(sofaGroup, [0.55, 0.56, 0.19], [(i - 1) * (w / 3 - 0.27), 0.94, -0.32], i === 1 ? pillowMat : sofaMat, 0.08); p.rotation.z = (i - 1) * 0.18; p.rotation.x = -0.16;
    }
    collider(obstacles, x, 0.58, z, rotation ? 1.6 : w, 1.12, rotation ? w : 1.6);
  }
  sofa(-4.3, -2.2, Math.PI / 2, true); sofa(4.2, -5.5, 0, true);
  const lounge = new THREE.Group(); lounge.position.set(4.5, 0, 0.3); lounge.rotation.y = -0.55; group.add(lounge);
  box(lounge, [1.45, 0.43, 1.48], [0, 0.39, 0], material('#b88b61'), 0.2);
  box(lounge, [1.45, 0.78, 0.3], [0, 0.79, -0.64], material('#b88b61'), 0.15);
  collider(obstacles, 4.5, 0.7, 0.3, 1.8, 1.4, 1.8);
  const stone = new THREE.MeshStandardMaterial({ map: noiseTexture('#bdb49d', 2), roughness: 0.5 });
  const table = cylinder(group, 1.25, 1.25, 0.14, [-3.05, 0.47, -5.5], stone); table.scale.z = 0.75;
  cylinder(group, 0.58, 0.67, 0.4, [-3.05, 0.24, -5.5], stone);
  collider(obstacles, -3.05, 0.47, -5.5, 2.5, 0.14, 1.8);
  for (let i = 0; i < 3; i++) box(group, [0.47, 0.04, 0.58], [-2.9 + i * 0.03, 0.57 + i * 0.04, -5.4], material(['#ece7da', '#526956', '#ae7557'][i]));
  cylinder(group, 0.11, 0.2, 0.33, [-3.65, 0.7, -5.45], material('#e3d5b5'));
  // A long credenza, stone artwork, and linen curtains frame the view.
  box(group, [1, 0.7, 5.4], [8.65, 0.45, -4.2], timber, 0.06);
  for (let i = 0; i < 30; i++) box(group, [0.026, 0.55, 0.07], [8.12, 0.46, -6.65 + i * 0.17], material('#473c32'));
  for (const x of [-9, 8.9]) for (let i = 0; i < 8; i++) {
    const curtain = cylinder(group, 0.16, 0.2, 6, [x + (i - 4) * 0.15, 3.1, -11.16], material('#e8e3d5'), true, 12);
    curtain.scale.z = 0.5;
  }
  // Sculptural multi-ring pendant in the double-height room.
  const pendant = new THREE.Group(); pendant.position.set(-1.3, 4.55, -5.9); group.add(pendant);
  for (let i = 0; i < 3; i++) { const r = ring(pendant, 0.65 + i * 0.35, 0.025, i * 0.11, brass); r.rotation.z = i * 0.1; }
  tube(group, [V(-1.3, 4.7, -5.9), V(-1.3, 6.1, -5.9)], 0.012, brass);
  const lamp = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 6, 64), new THREE.MeshBasicMaterial({ color: '#fff1bc' })); lamp.rotation.x = Math.PI / 2; lamp.position.set(-1.3, 4.63, -5.9); group.add(lamp);
  function palm(x: number, z: number, height: number) {
    const trunk = material('#8e7754');
    tube(group, [V(x, -0.12, z), V(x + 0.15, height / 2, z), V(x + 0.55, height, z - 0.25)], 0.13, trunk);
    const leafMat = material('#527651', 0.9); leafMat.side = THREE.DoubleSide;
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      const points = [V(x + 0.55, height, z - 0.25), V(x + Math.cos(a) * 1.5, height + 0.5, z + Math.sin(a) * 1.5), V(x + Math.cos(a) * 3.1, height - 0.7, z + Math.sin(a) * 3.1)];
      tube(group, points, 0.022, leafMat);
      for (let k = 1; k < 10; k++) {
        const t = k / 10; const c = new THREE.CatmullRomCurve3(points).getPoint(t);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), leafMat);
        leaf.position.copy(c); leaf.scale.set(0.08, 0.035, 0.85 * Math.sin(t * Math.PI)); leaf.rotation.y = -a; leaf.rotation.z = 0.25; group.add(leaf);
      }
    }
  }
  palm(-10, -20, 5.5); palm(11, -24, 6.2); palm(-17, -28, 7.3);
  scene.add(new THREE.HemisphereLight('#e0f3ff', '#a29376', 2.8));
  const sun = new THREE.DirectionalLight('#fff1cc', 4.1); sun.position.set(-14, 15, -18); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -17; sun.shadow.camera.right = 17; sun.shadow.camera.top = 17; sun.shadow.camera.bottom = -17; sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00015; scene.add(sun);
  const fill = new THREE.DirectionalLight('#e6f6ff', 0.85); fill.position.set(0, 4, 9); scene.add(fill);
  makeBasket(group, 2);
  collider(obstacles, 0, 3.1, -11.5, 20, 6.2, 0.1);
  collider(obstacles, -10, 3.1, -3, 0.2, 6.2, 25); collider(obstacles, 10, 3.1, -3, 0.2, 6.2, 25);
  collider(obstacles, 0, 6.3, -3, 20, 0.2, 25);
  return { group, obstacles, animate: (t) => {
    for (let i = 0; i < waves.count; i++) waves.setZ(i, Math.sin(seaBase[i * 3] * 0.17 + t * 0.6) * Math.cos(seaBase[i * 3 + 1] * 0.2 + t * 0.4) * 0.07);
    waves.needsUpdate = true;
    foam.forEach((mesh, i) => { mesh.position.z = -36 - i * 3.3 + Math.sin(t * 0.4 + i) * 0.7; });
  } };
}
