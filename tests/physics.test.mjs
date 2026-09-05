import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR_DRAG, GRAVITY, BALL_RADIUS, FIXED_STEP, BASKETS, INITIAL_AIM, RELEASE, integrateFreeFlight, makeBall, predictTrajectory, stepBall } from '../lib/physics.ts';

function simulate(aim, level, obstacles = []) {
  const ball = makeBall(aim);
  let scores = 0;
  for (let i = 0; i < 1800 && !ball.settled; i++) {
    if (stepBall(ball, BASKETS[level], obstacles).scored) scores++;
    for (const value of Object.values(ball.position)) assert.ok(Number.isFinite(value));
    assert.ok(ball.position.y >= BALL_RADIUS - 1e-6, 'ball cannot tunnel through the floor');
  }
  return { ball, scores };
}

test('free flight matches an independent analytical solution and is independent of frame subdivision', () => {
  const initial = makeBall(INITIAL_AIM[1]);
  const oneStep = structuredClone(initial), manySteps = structuredClone(initial);
  integrateFreeFlight(oneStep, 1);
  for (let i = 0; i < 240; i++) integrateFreeFlight(manySteps, FIXED_STEP);
  const terminal = GRAVITY / AIR_DRAG;
  const expectedY = RELEASE.y + (initial.velocity.y + terminal) * (1 - Math.exp(-AIR_DRAG)) / AIR_DRAG - terminal;
  assert.ok(Math.abs(oneStep.position.y - expectedY) < 1e-10);
  for (const key of ['x', 'y', 'z']) {
    assert.ok(Math.abs(oneStep.position[key] - manySteps.position[key]) < 1e-9);
    assert.ok(Math.abs(oneStep.velocity[key] - manySteps.velocity[key]) < 1e-9);
  }
});

for (const level of [1, 2]) {
  test(`level ${level}: a centered throw scores exactly once and settles inside the bin`, () => {
    const { ball, scores } = simulate(INITIAL_AIM[level], level);
    assert.equal(scores, 1);
    assert.equal(ball.scored, true);
    assert.equal(ball.settled, true);
    const bin = BASKETS[level];
    assert.ok(Math.hypot(ball.position.x - bin.x, ball.position.z - bin.z) < bin.bottomRadius);
    assert.ok(ball.position.y < bin.height);
  });

  test(`level ${level}: insufficient power, excess power, and a wide aim miss`, () => {
    for (const change of [{ power: 10 }, { power: 100 }, { yaw: 26 }, { yaw: -26 }]) {
      assert.equal(simulate({ ...INITIAL_AIM[level], ...change }, level).scores, 0);
    }
  });

  test(`level ${level}: dotted preview follows the live ball to its first contact`, () => {
    for (const power of [25, 48, INITIAL_AIM[level].power, 88]) {
      const aim = { ...INITIAL_AIM[level], power };
      const preview = predictTrajectory(aim, BASKETS[level]);
      const ball = makeBall(aim);
      for (let i = 0; i < 800; i++) {
        stepBall(ball, BASKETS[level]);
        if (ball.position.y <= BALL_RADIUS + 0.055 || ball.scored || ball.bounces > 0) break;
      }
      assert.deepEqual(preview.landing, ball.position);
      assert.equal(preview.scores, ball.scored);
    }
  });
}

test('a ball dropped onto the rim bounces without receiving points', () => {
  const bin = BASKETS[1];
  const ball = makeBall(INITIAL_AIM[1]);
  ball.position = { x: bin.topRadius, y: bin.height + 0.5, z: bin.z };
  ball.velocity = { x: 0, y: -1, z: 0 };
  let hit = false;
  for (let i = 0; i < 100; i++) {
    const event = stepBall(ball, bin);
    assert.equal(event.scored, false);
    if (event.impact) { assert.ok(ball.velocity.y > 0); hit = true; break; }
  }
  assert.ok(hit);
});

test('side entry below the opening cannot score', () => {
  const bin = BASKETS[1];
  const ball = makeBall(INITIAL_AIM[1]);
  ball.position = { x: 0, y: 0.45, z: bin.z }; ball.velocity = { x: 0, y: -1, z: 0 };
  let count = 0;
  for (let i = 0; i < 400; i++) if (stepBall(ball, bin).scored) count++;
  assert.equal(count, 0);
});

test('a solid obstacle reflects the ball and removes energy', () => {
  const ball = makeBall(INITIAL_AIM[1]);
  ball.position = { x: 1, y: 1, z: 0 }; ball.velocity = { x: 4, y: 0, z: 0 };
  const wall = { min: { x: 1.2, y: 0, z: -1 }, max: { x: 1.4, y: 3, z: 1 } };
  let hit = false;
  for (let i = 0; i < 50; i++) {
    if (stepBall(ball, BASKETS[1], [wall]).impact) {
      assert.ok(ball.velocity.x < 0); assert.ok(Math.abs(ball.velocity.x) < 4);
      assert.ok(ball.position.x <= 1.2 - BALL_RADIUS + 1e-8); hit = true; break;
    }
  }
  assert.ok(hit);
});

test('a broad sweep of legal shots remains finite and never awards duplicate points', () => {
  for (const level of [1, 2]) for (const yaw of [-28, 0, 28]) for (const elevation of [25, 48, 70]) for (const power of [10, 58, 100]) {
    const { ball, scores } = simulate({ yaw, elevation, power }, level);
    assert.ok(scores <= 1); assert.equal(ball.settled, true);
  }
});
