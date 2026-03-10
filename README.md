# Snake

A modern Snake game running in the browser, with smooth rendering, visual effects, mobile support, and responsive layout.

**[Play now →](https://arthurrio.github.io/snake/)**

---

## Features

- Interpolated movement with smoothstep easing for fluid animation
- Particle explosions and floating score texts when eating an apple
- Combo system: eat apples quickly to multiply your points
- Animated death flash on collision
- Speed selector (10 levels)
- Responsive layout for mobile and desktop
- Controls via keyboard, swipe, on-screen D-pad, and gamepad

---

## Project structure

```
snake/
├── index.html   # HTML structure
├── style.css    # Styles and responsive layout
├── main.js      # Main thread: input, HUD
└── worker.js    # Web Worker: game logic and rendering
```

---

## How it works

### Thread architecture

The game uses two separate threads to maximize performance:

```
Main thread (main.js)               Web Worker (worker.js)
─────────────────────────           ──────────────────────
Captures input (keyboard,           Game logic (tick)
  swipe, D-pad, gamepad)    ──→     Canvas rendering
Updates the HUD             ←──     Sends messages: hud, end
```

On every `requestAnimationFrame`, the main thread sends the current timestamp and direction to the Worker. The Worker uses a time accumulator to decide when to fire a game tick.

### Web Worker + OffscreenCanvas

The canvas is transferred to the Worker via `transferControlToOffscreen()`, so all rendering happens off the main thread. This ensures the game keeps running smoothly even if the main thread is busy.

```js
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
```

### Game loop

The game separates **logic** from **rendering**:

- **Logic (tick):** runs at a fixed configurable interval (e.g. 120ms at level 5). A time accumulator catches up missed ticks without skipping frames.
- **Rendering (rAF):** runs at ~60fps. Between two ticks, each segment's position is interpolated using smoothstep easing (`3t² - 2t³`), making movement feel organic rather than robotic.

```
Tick 0          Tick 1          Tick 2
  |─────────────|─────────────|
  |──rAF──rAF──rAF──rAF──rAF──|
       t=0.3  t=0.6  t=0.9
```

### Movement interpolation

On each render frame, `t ∈ [0, 1)` represents the progress between the previous and next tick. Each segment's visual position is computed by interpolating between `prevSnake` and `snake` with smoothstep:

```js
const s = t * t * (3 - 2 * t); // smoothstep
const rx = (prev.x + (seg.x - prev.x) * s) * CELL + pad;
```

A "ghost tail" (the last segment from the previous tick) is also drawn with decreasing opacity, creating a natural gliding effect.

### Combo system

Eating apples within 3 seconds of each other chains a combo. The multiplier grows with each consecutive apple, increasing points and the size of the floating text.

```
1st apple: +1 point
2nd apple (< 3s): +2 points  (x2)
3rd apple (< 3s): +3 points  (x3)
...
```

### Visual effects

**Particles:** eating an apple emits 14 particles at evenly distributed angles with random speeds. Each particle has gravity, a life decay, and fades out gradually.

**Floating texts:** the points earned appear at the apple's position and float upward until they vanish.

**Death flash:** on collision, the snake flashes between red and dark red using a sine wave for 700ms before showing the game over screen.

### Controls

| Device | Input |
|---|---|
| Keyboard | Arrow keys or WASD |
| Mobile | Swipe on the canvas or on-screen D-pad |
| Gamepad | D-pad or left analog stick |

---

## Technologies

- HTML5 Canvas (OffscreenCanvas)
- Web Workers
- Gamepad API
- Vanilla JS — no frameworks or dependencies
