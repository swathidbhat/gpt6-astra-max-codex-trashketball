import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BASKETS, BALL_RADIUS, FIXED_STEP, INITIAL_AIM, RELEASE, makeBall, predictTrajectory, stepBall, type Aim, type BallState } from '@/lib/physics';
import { buildOffice, buildVilla, makePaper, type Room } from './scenes';

type Callbacks = { onScore: () => void; onResolve: (scored: boolean) => void; onAim: (aim: Aim) => void; onReady: () => void; onError: (message: string) => void };
type Shot = { state: BallState; mesh: THREE.Mesh; spin: THREE.Vector3; resolved: boolean; trail: THREE.Line; points: THREE.Vector3[] };

export class GameEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(57, 1, 0.05, 260);
  room!: Room;
  level: 1 | 2 = 1;
  aim: Aim = { ...INITIAL_AIM[1] };
  busy = false;
  paused = false;
  sound = false;
  trajectoryVisible = true;
  private host: HTMLDivElement;
  private callbacks: Callbacks;
  private frame = 0;
  private previousTime = 0;
  private accumulator = 0;
  private elapsed = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private paper!: THREE.Mesh;
  private guide!: THREE.Group;
  private landing!: THREE.Mesh;
  private shots: Shot[] = [];
  private audio?: AudioContext;
  private env: THREE.WebGLRenderTarget;
  private drag?: { x: number; y: number; aim: Aim; id: number };
  private particles?: { mesh: THREE.Points; velocities: THREE.Vector3[]; age: number };

  constructor(host: HTMLDivElement, callbacks: Callbacks) {
    this.host = host; this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'First-person 3D trashketball. Drag to aim; use the controls below to adjust power and throw.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    host.appendChild(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.env = pmrem.fromScene(environment, 0.04); pmrem.dispose(); environment.dispose();
    this.camera.position.set(0, 1.83, 6.7); this.camera.lookAt(0, 1.45, -3.8);
    this.setLevel(1);
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host); this.resize();
    host.addEventListener('pointerdown', this.pointerDown);
    host.addEventListener('pointermove', this.pointerMove);
    host.addEventListener('pointerup', this.pointerUp);
    host.addEventListener('pointercancel', this.pointerUp);
    host.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.frame = requestAnimationFrame(this.animate);
    callbacks.onReady();
  }

  private contextLost = (event: Event) => {
    event.preventDefault(); this.paused = true;
    this.callbacks.onError('The 3D view was interrupted. Reload the game to return to the office.');
  };
  private visibilityChanged = () => { this.previousTime = 0; this.accumulator = 0; };
  private resize = () => {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.fov = width / height < 0.9 ? 69 : 57;
    this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height);
  };
  private pointerDown = (event: PointerEvent) => {
    if (this.paused || this.busy || event.button !== 0) return;
    this.drag = { x: event.clientX, y: event.clientY, aim: { ...this.aim }, id: event.pointerId };
    this.host.setPointerCapture(event.pointerId); this.host.style.cursor = 'grabbing';
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag || this.paused || this.busy) return;
    const sensitivity = 50 / Math.max(400, this.host.clientWidth);
    this.setAim({ ...this.aim, yaw: Math.max(-28, Math.min(28, this.drag.aim.yaw + (event.clientX - this.drag.x) * sensitivity)), elevation: Math.max(25, Math.min(70, this.drag.aim.elevation - (event.clientY - this.drag.y) * 0.085)) });
    this.callbacks.onAim({ ...this.aim });
  };
  private pointerUp = () => { this.drag = undefined; this.host.style.cursor = 'grab'; };
  private wheel = (event: WheelEvent) => {
    event.preventDefault(); if (this.paused || this.busy) return;
    this.setAim({ ...this.aim, power: Math.max(10, Math.min(100, this.aim.power - Math.sign(event.deltaY) * 2)) });
    this.callbacks.onAim({ ...this.aim });
  };

  setLevel(level: 1 | 2) {
    this.clearScene(); this.level = level; this.aim = { ...INITIAL_AIM[level] };
    this.busy = false; this.accumulator = 0; this.previousTime = 0;
    this.room = level === 1 ? buildOffice(this.scene) : buildVilla(this.scene);
    this.scene.environment = this.env.texture; this.scene.environmentIntensity = 0.3;
    this.renderer.toneMappingExposure = level === 1 ? 0.92 : 0.8;
    this.paper = makePaper(5); this.paper.position.set(RELEASE.x, RELEASE.y, RELEASE.z); this.scene.add(this.paper);
    this.guide = new THREE.Group(); this.scene.add(this.guide);
    this.landing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 40), new THREE.MeshBasicMaterial({ color: '#d4f59a', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    this.landing.rotation.x = -Math.PI / 2; this.scene.add(this.landing);
    this.updateGuide();
  }

  setAim(aim: Aim) { this.aim = { ...aim }; if (!this.busy) this.updateGuide(); }
  setTrajectory(visible: boolean) { this.trajectoryVisible = visible; this.guide.visible = visible && !this.busy; this.landing.visible = visible && !this.busy; }
  setSound(enabled: boolean) {
    this.sound = enabled;
    if (enabled) { this.unlockAudio(); this.playTone(450, 0.1, 0.025); }
  }
  private unlockAudio() {
    if (!this.sound) return;
    this.audio ??= new AudioContext();
    if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {});
  }
  private playTone(frequency: number, length: number, volume = 0.055, delay = 0) {
    if (!this.sound || !this.audio) return;
    const at = this.audio.currentTime + delay;
    const osc = this.audio.createOscillator(); const gain = this.audio.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, at); osc.frequency.exponentialRampToValueAtTime(frequency * 0.55, at + length);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(gain); gain.connect(this.audio.destination); osc.start(at); osc.stop(at + length);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  shoot() {
    if (this.busy || this.paused || this.disposed) return false;
    this.unlockAudio(); this.playTone(180, 0.12, 0.035);
    this.busy = true; this.paper.visible = false; this.guide.visible = false; this.landing.visible = false;
    const mesh = makePaper(this.shots.length + 3); mesh.position.set(RELEASE.x, RELEASE.y, RELEASE.z); this.scene.add(mesh);
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#e0f6bb', transparent: true, opacity: 0.42, depthWrite: false })); this.scene.add(trail);
    this.shots.push({ state: makeBall(this.aim), mesh, spin: new THREE.Vector3(3.1, -2.8, 1.6), resolved: false, trail, points: [] });
    if (this.shots.length > 18) {
      const oldest = this.shots.shift()!; this.disposeObject(oldest.mesh); this.disposeObject(oldest.trail);
    }
    return true;
  }

  private updateGuide() {
    if (!this.guide) return;
    while (this.guide.children.length) this.disposeObject(this.guide.children[0]);
    const predicted = predictTrajectory(this.aim, BASKETS[this.level], this.room.obstacles);
    const color = predicted.scores ? '#ddff9c' : '#e6eed4';
    const points = predicted.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.4, dashSize: 0.09, gapSize: 0.11, depthWrite: false }));
    line.computeLineDistances(); this.guide.add(line);
    const dotGeo = new THREE.SphereGeometry(0.018, 6, 4); const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, Math.ceil(points.length / 3));
    const transform = new THREE.Object3D(); let instance = 0;
    for (let i = 2; i < points.length; i += 3) {
      transform.position.copy(points[i]); transform.updateMatrix(); dots.setMatrixAt(instance++, transform.matrix);
    }
    dots.count = instance; this.guide.add(dots);
    this.landing.position.set(predicted.landing.x, Math.max(0.012, predicted.landing.y - BALL_RADIUS), predicted.landing.z);
    (this.landing.material as THREE.MeshBasicMaterial).color.set(color);
    this.guide.visible = this.trajectoryVisible; this.landing.visible = this.trajectoryVisible;
  }

  private celebrate() {
    if (this.particles) this.disposeObject(this.particles.mesh);
    const bin = BASKETS[this.level]; const coords: number[] = []; const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < 35; i++) { coords.push(bin.x, bin.height + 0.05, bin.z); velocities.push(new THREE.Vector3((Math.random() - 0.5) * 2.2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2.2)); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
    const mesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d9ff93', size: 0.045, transparent: true, opacity: 1 })); this.scene.add(mesh); this.particles = { mesh, velocities, age: 0 };
    this.playTone(660, 0.18); this.playTone(880, 0.2, 0.05, 0.08); this.playTone(1100, 0.3, 0.04, 0.17);
  }

  private animate = (time: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = this.previousTime ? Math.min((time - this.previousTime) / 1000, 0.06) : 0;
    this.previousTime = time;
    if (!this.paused && !document.hidden) {
      this.elapsed += dt; this.accumulator += dt;
      this.room.animate(this.elapsed);
      while (this.accumulator >= FIXED_STEP) {
        for (const shot of this.shots) {
          const speed = Math.hypot(shot.state.velocity.x, shot.state.velocity.y, shot.state.velocity.z);
          const result = stepBall(shot.state, BASKETS[this.level], this.room.obstacles);
          if (result.scored) { this.celebrate(); this.callbacks.onScore(); }
          if (result.impact && speed > 1.5) this.playTone(shot.state.position.y < 0.2 ? 100 : 330, 0.07, 0.016);
          if (!shot.resolved && (shot.state.settled || (shot.state.age > 1.9 && (shot.state.scored || shot.state.bounces > 0)) || shot.state.age > 3.1)) {
            shot.resolved = true; this.busy = false; this.paper.visible = true;
            this.updateGuide(); this.callbacks.onResolve(shot.state.scored);
          }
        }
        this.accumulator -= FIXED_STEP;
      }
      for (const shot of this.shots) {
        const p = shot.state.position; shot.mesh.position.set(p.x, p.y, p.z);
        if (!shot.state.settled) {
          shot.mesh.rotation.x += shot.spin.x * dt; shot.mesh.rotation.y += shot.spin.y * dt; shot.mesh.rotation.z += shot.spin.z * dt;
          if (shot.state.age < 1.65 && this.trajectoryVisible) {
            shot.points.push(shot.mesh.position.clone()); if (shot.points.length > 45) shot.points.shift();
            shot.trail.geometry.dispose(); shot.trail.geometry = new THREE.BufferGeometry().setFromPoints(shot.points);
          }
        }
        shot.trail.visible = this.trajectoryVisible && shot.state.age < 1.8;
      }
      this.paper.rotation.y = Math.sin(this.elapsed * 0.7) * 0.1;
      if (this.particles) {
        this.particles.age += dt; const positions = this.particles.mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) { const v = this.particles.velocities[i]; v.y -= 4 * dt; positions.setXYZ(i, positions.getX(i) + v.x * dt, positions.getY(i) + v.y * dt, positions.getZ(i) + v.z * dt); }
        positions.needsUpdate = true; (this.particles.mesh.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - this.particles.age / 1.2);
        if (this.particles.age > 1.2) { this.disposeObject(this.particles.mesh); this.particles = undefined; }
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  private disposeObject(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture && value !== this.env?.texture) textures.add(value);
      }
      if (child instanceof THREE.Light && 'shadow' in child) (child as THREE.DirectionalLight).shadow?.map?.dispose();
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); object.removeFromParent();
  }
  private clearScene() {
    this.disposeObject(this.scene); this.scene.clear(); this.shots = []; this.particles = undefined;
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    this.host.removeEventListener('pointerdown', this.pointerDown); this.host.removeEventListener('pointermove', this.pointerMove); this.host.removeEventListener('pointerup', this.pointerUp); this.host.removeEventListener('pointercancel', this.pointerUp); this.host.removeEventListener('wheel', this.wheel);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.clearScene(); this.env.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
    if (this.audio) void this.audio.close().catch(() => {});
  }
}
