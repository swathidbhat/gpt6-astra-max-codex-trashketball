export type Vec3 = { x: number; y: number; z: number };
export type Aim = { yaw: number; elevation: number; power: number };
export type Basket = { x: number; z: number; height: number; topRadius: number; bottomRadius: number };
export type Obstacle = { min: Vec3; max: Vec3 };
export type BallState = { position: Vec3; velocity: Vec3; scored: boolean; settled: boolean; age: number; bounces: number };

export const GRAVITY = 9.81;
export const AIR_DRAG = 0.16;
export const BALL_RADIUS = 0.095;
export const FIXED_STEP = 1 / 240;
export const RELEASE: Vec3 = { x: 0.2, y: 1.36, z: 5.55 };
export const BASKETS: Record<1 | 2, Basket> = {
  1: { x: 0, z: -1.15, height: 0.88, topRadius: 0.46, bottomRadius: 0.33 },
  2: { x: 0.7, z: -2.05, height: 0.96, topRadius: 0.43, bottomRadius: 0.36 },
};
export const INITIAL_AIM: Record<1 | 2, Aim> = {
  1: { yaw: -1.7, elevation: 48, power: 58 },
  2: { yaw: 3.8, elevation: 48, power: 68 },
};

export function makeBall(aim: Aim): BallState {
  const yaw = aim.yaw * Math.PI / 180;
  const elevation = aim.elevation * Math.PI / 180;
  const speed = 4.6 + aim.power * 0.066;
  return {
    position: { ...RELEASE },
    velocity: { x: Math.sin(yaw) * Math.cos(elevation) * speed, y: Math.sin(elevation) * speed, z: -Math.cos(yaw) * Math.cos(elevation) * speed },
    scored: false, settled: false, age: 0, bounces: 0,
  };
}

// Closed-form gravity and linear drag integration, shared by live throws and previews.
export function integrateFreeFlight(ball: BallState, dt: number) {
  const decay = Math.exp(-AIR_DRAG * dt);
  const travel = (1 - decay) / AIR_DRAG;
  ball.position.x += ball.velocity.x * travel;
  ball.position.y += (ball.velocity.y + GRAVITY / AIR_DRAG) * travel - GRAVITY * dt / AIR_DRAG;
  ball.position.z += ball.velocity.z * travel;
  ball.velocity.x *= decay;
  ball.velocity.y = (ball.velocity.y + GRAVITY / AIR_DRAG) * decay - GRAVITY / AIR_DRAG;
  ball.velocity.z *= decay;
}

function bounce(ball: BallState, normal: Vec3, restitution: number) {
  const v = ball.velocity;
  const dot = v.x * normal.x + v.y * normal.y + v.z * normal.z;
  if (dot >= 0) return;
  v.x = (v.x - (1 + restitution) * dot * normal.x) * 0.86;
  v.y = (v.y - (1 + restitution) * dot * normal.y) * 0.86;
  v.z = (v.z - (1 + restitution) * dot * normal.z) * 0.86;
  ball.bounces++;
}

function collideBox(ball: BallState, box: Obstacle) {
  const p = ball.position;
  const q = { x: Math.max(box.min.x, Math.min(p.x, box.max.x)), y: Math.max(box.min.y, Math.min(p.y, box.max.y)), z: Math.max(box.min.z, Math.min(p.z, box.max.z)) };
  const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist >= BALL_RADIUS) return;
  let normal: Vec3;
  let correction: number;
  if (dist > 1e-8) {
    normal = { x: dx / dist, y: dy / dist, z: dz / dist };
    correction = BALL_RADIUS - dist;
  } else {
    const faces = [
      { d: p.x - box.min.x, n: { x: -1, y: 0, z: 0 } },
      { d: box.max.x - p.x, n: { x: 1, y: 0, z: 0 } },
      { d: p.y - box.min.y, n: { x: 0, y: -1, z: 0 } },
      { d: box.max.y - p.y, n: { x: 0, y: 1, z: 0 } },
      { d: p.z - box.min.z, n: { x: 0, y: 0, z: -1 } },
      { d: box.max.z - p.z, n: { x: 0, y: 0, z: 1 } },
    ].sort((a, b) => a.d - b.d);
    normal = faces[0].n;
    correction = BALL_RADIUS + faces[0].d;
  }
  p.x += normal.x * correction; p.y += normal.y * correction; p.z += normal.z * correction;
  bounce(ball, normal, 0.32);
}

export function stepBall(ball: BallState, bin: Basket, obstacles: Obstacle[] = [], dt = FIXED_STEP): { scored: boolean; impact: boolean } {
  if (ball.settled) return { scored: false, impact: false };
  const previous = { ...ball.position };
  const bouncesBefore = ball.bounces;
  integrateFreeFlight(ball, dt);
  ball.age += dt;
  const p = ball.position;
  let justScored = false;
  let dx = p.x - bin.x, dz = p.z - bin.z;
  let radial = Math.hypot(dx, dz);

  // Score only when the entire sphere enters the bin from above, never from the side.
  const scorePlane = bin.height - BALL_RADIUS;
  if (!ball.scored && ball.velocity.y < 0 && previous.y > scorePlane && p.y <= scorePlane) {
    const fraction = (previous.y - scorePlane) / (previous.y - p.y);
    const crossX = previous.x + (p.x - previous.x) * fraction;
    const crossZ = previous.z + (p.z - previous.z) * fraction;
    if (Math.hypot(crossX - bin.x, crossZ - bin.z) < bin.topRadius - BALL_RADIUS - 0.018) {
      ball.scored = true; justScored = true;
    }
  }

  // Sphere-versus-torus rim contact, including glancing rim shots.
  if (radial > 1e-8) {
    const rimX = bin.x + dx / radial * bin.topRadius;
    const rimZ = bin.z + dz / radial * bin.topRadius;
    const rx = p.x - rimX, ry = p.y - bin.height, rz = p.z - rimZ;
    const distance = Math.hypot(rx, ry, rz);
    const contact = BALL_RADIUS + 0.022;
    if (distance < contact && distance > 1e-8) {
      const n = { x: rx / distance, y: ry / distance, z: rz / distance };
      p.x += n.x * (contact - distance); p.y += n.y * (contact - distance); p.z += n.z * (contact - distance);
      bounce(ball, n, 0.48);
    }
  }

  dx = p.x - bin.x; dz = p.z - bin.z; radial = Math.hypot(dx, dz);
  if (p.y > 0.06 && p.y < bin.height - 0.025 && radial > 1e-8) {
    const slope = (bin.topRadius - bin.bottomRadius) / bin.height;
    const wallRadius = bin.bottomRadius + slope * p.y;
    const signedDistance = (radial - wallRadius) / Math.sqrt(1 + slope * slope);
    if (Math.abs(signedDistance) < BALL_RADIUS + 0.009) {
      const sign = signedDistance < 0 ? -1 : 1;
      const len = Math.sqrt(1 + slope * slope);
      const n = { x: sign * dx / radial / len, y: -sign * slope / len, z: sign * dz / radial / len };
      const correction = BALL_RADIUS + 0.009 - Math.abs(signedDistance);
      p.x += n.x * correction; p.y += n.y * correction; p.z += n.z * correction;
      bounce(ball, n, 0.35);
    }
  }

  for (const obstacle of obstacles) collideBox(ball, obstacle);
  const inside = Math.hypot(p.x - bin.x, p.z - bin.z) < bin.bottomRadius;
  const floor = BALL_RADIUS + (inside ? 0.05 : 0);
  if (p.y < floor) {
    p.y = floor;
    bounce(ball, { x: 0, y: 1, z: 0 }, inside ? 0.2 : 0.32);
    const friction = Math.exp(-7 * dt);
    ball.velocity.x *= friction; ball.velocity.z *= friction;
    if (Math.abs(ball.velocity.y) < 0.16 && Math.hypot(ball.velocity.x, ball.velocity.z) < 0.08) {
      ball.velocity = { x: 0, y: 0, z: 0 }; ball.settled = true;
    }
  }
  if (ball.age > 7 || Math.abs(p.x) > 25 || Math.abs(p.z) > 45) ball.settled = true;
  return { scored: justScored, impact: ball.bounces > bouncesBefore };
}

export function predictTrajectory(aim: Aim, bin: Basket, obstacles: Obstacle[] = []) {
  const ball = makeBall(aim);
  const points: Vec3[] = [{ ...ball.position }];
  for (let i = 0; i < 800; i++) {
    stepBall(ball, bin, obstacles);
    if (i % 8 === 0) points.push({ ...ball.position });
    if (ball.position.y <= BALL_RADIUS + 0.055 || ball.scored || ball.bounces > 0) break;
  }
  points.push({ ...ball.position });
  return { points, scores: ball.scored, landing: { ...ball.position } };
}
