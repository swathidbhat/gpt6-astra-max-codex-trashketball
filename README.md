# Trashketball — Out of Office

A first-person Three.js game with two fully modeled rooms. Land ten crumpled-paper balls in the office basket to earn 100 points and unlock the seaside villa. Level two is unlimited free play, with 10 points per basket.

## Play

- Drag the room, use the on-screen arrows, or press the arrow keys to aim.
- Scroll, use the power slider, or press + / − to adjust power.
- Click **Throw paper** or press **Space**.
- Sound, trajectory visibility, fullscreen, instructions, and restart are in the interface.

## Development

Requires Node.js 22.13 or later.

```sh
npm install
npm run dev
npm run build
npm run test
npm run typecheck
```

Rendering uses Three.js, physically based materials, soft shadows, procedural geometry and textures, and an animated ocean. The thrower stays in a fixed first-person position. No external models or image requests are needed at play time.

Physics runs at a fixed 240 Hz with exact integration of gravity and linear air drag. Sphere contacts cover the floor, furniture and room bounds, the tapered bin walls, and the rim. Trajectory prediction uses the same integrator and collision code as the live ball. The ball must enter from above to score, and each throw can score only once. Crumpled paper is approximated by a spherical collider.

The full starter lint command also checks the bundled, unmodified UI catalog. Use `npm run lint:game` to check the application code alone.
