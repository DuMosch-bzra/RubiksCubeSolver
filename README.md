# Rubik's Cube Solver

A 3D Rubik's Cube solver in the browser. Scramble a cube or paint in the colours of a real one, pick a solving method, and watch the solution play out move by move.

Built with React, TypeScript, three.js (via React Three Fiber) and Vite.

Made by AI to test it's limits and experiment with it/see what it can do.

## Features

- **Interactive 3D cube** with animated layer turns, orbit controls and idle layer spins when the cube is left alone
- **Three solving methods**, switchable in the UI:
  - **CFOP** (cross, F2L, OLL, PLL), with 2-look or full OLL and PLL
  - **Beginner layer-by-layer**, using only the handful of algorithms a beginner tutorial teaches
  - **Kociemba two-phase**, a computer search that finds solutions of about 20 moves
- **Step-by-step playback**: play/pause, step forwards and backwards, jump to any step or move, adjustable speed
- **Scramble input**: type standard notation or generate a random scramble (animated)
- **Colour editor** for entering a real cube, with validation that explains *why* a cube is impossible (twisted corner, flipped edge, swapped pieces, duplicate or missing pieces, mirrored corners)

## Getting started

Requires a current Node.js LTS (developed on Node 22).

```bash
npm install
npm run dev      # start the dev server
npm test         # run the test suite (Vitest)
npm run build    # type-check and build for production
npm run lint     # ESLint
```

## Using the app

1. **Set up a cube.** Type a scramble such as `R U R' U' F2 D` and press *Apply*, press *Random*, or choose *Enter colours of a real cube* and paint the stickers.
2. **Choose a method** in the *Method* panel. For CFOP you can switch OLL and PLL between 2-look and full. Your choice is remembered.
3. **Press *Solve*** and play the solution. Each step is listed with its recognised case (for example *OLL 27 (sune)* or *PLL: T*).

Keyboard shortcuts: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> previous/next move.

When entering a real cube, hold it with **yellow on top and green in front**. Each face in the net is drawn as you see it when you look straight at it.

### Notation

| Move                         | Meaning                                               |
| ---------------------------- | ----------------------------------------------------- |
| `U D R L F B`              | Turn that face 90° clockwise (looking at the face)   |
| `U'` / `U2`              | Counter-clockwise / 180°                             |
| `u d r l f b` or `Rw` … | Wide turns (two layers)                               |
| `M E S`                    | Middle slices (M follows L, E follows D, S follows F) |
| `x y z`                    | Whole-cube rotations (follow R, U, F)                 |

Brackets are ignored, so algorithms copied from websites, such as `(R U R')`, can be pasted directly.

## Solving methods

Averages are over 1,000 random scrambles (two-phase: 40) in the outer face-turn metric.

| Method                        | Average moves | Notes                               |
| ----------------------------- | ------------- | ----------------------------------- |
| CFOP, full OLL + full PLL     | 56.2          | default                             |
| CFOP, full OLL + 2-look PLL   | 62.2          |                                     |
| CFOP, 2-look OLL + full PLL   | 60.6          |                                     |
| CFOP, 2-look OLL + 2-look PLL | 66.5          | 16 algorithms in total              |
| Beginner layer-by-layer       | 133.9         |                                     |
| Kociemba two-phase            | 20.4          | stops at ≤ 20 moves or after 1.5 s |

## How it works

### Cube model

The cube is a 54-character string, one character per sticker, in the face order U R F D L B (Kociemba's facelet layout). Each character is the face whose colour the sticker has when solved. Strings are immutable and cheap to compare, and they work directly as `Map` keys, which the lookup tables rely on.

Moves are not written out by hand. Every move (face turns, wide turns, slices and rotations) is generated from 3D geometry by rotating sticker positions and normals around the move's axis, so all moves are consistent by construction.

### CFOP

- **Cross**: a breadth-first table over all 190,080 positions of the four cross edges gives the optimal cross (never more than 8 moves).
- **F2L**: for each corner–edge pair, a shortest-path search over every place the pair can be, using U turns and the basic inserts (`R U R'`, `F' U' F`, …). This is intuitive F2L. It also handles pieces stuck in the wrong slot, and the cheapest pair is solved first.
- **OLL / PLL**: the algorithm lists in `src/cube/cases/algorithms.ts` are the only hand-written part. Each algorithm is applied *in reverse* to a solved cube, with every U-turn before and after it, to generate the pattern it solves. Case diagrams are never typed in. The tests enumerate all 62,208 last-layer states and check that the tables solve every one of them.

### Beginner method

Every step may only use U turns plus that step's taught algorithm (`R U R' U'`, the two middle-layer inserts, `F R U R' U' F'`, `R U R' U R U2 R' U`, `U R U' L' U R' U' L`, `R' D' R D`). A small search picks the shortest way to combine them. Copies of an algorithm are never merged with each other, so the solution always looks like what a tutorial would tell you to do.

### Kociemba two-phase

The cube is converted to a piece-level representation (corner/edge permutation and orientation). Phase 1 searches with all 18 moves until every piece is oriented and the middle-layer edges are in the middle layer. Phase 2 finishes using only `U, D, R2, L2, F2, B2`. Both phases are IDA* searches guided by distance tables: about 4 million entries, built in roughly a second. The search keeps looking for shorter solutions until it reaches 20 moves or its time limit. Everything runs in a **Web Worker**, so the page stays responsive while the tables are built and while searching.

### Validation

`validateCube` checks a painted cube for unpainted stickers, colour counts, impossible or mirrored pieces, duplicates and missing pieces, and finally the three invariants (corner twist, edge flip and permutation parity). It returns a message for each problem found.

## Project structure

```
src/
├── cube/                 Cube logic, no React or three.js
│   ├── state.ts          Sticker-string model
│   ├── geometry.ts       Sticker positions, normals and cubie groups
│   ├── moves.ts          Moves generated from geometry
│   ├── notation.ts       Parsing, formatting, inverting, simplifying
│   ├── scramble.ts       Random and seeded scrambles
│   ├── validate.ts       Explains why a cube is impossible
│   ├── cases/            OLL/PLL algorithm lists and generated lookup tables
│   └── solver/
│       ├── methods.ts    Method registry, used by the UI
│       ├── solve.ts      CFOP pipeline
│       ├── cross.ts      Optimal cross
│       ├── f2l.ts        F2L pair search
│       ├── beginner.ts   Layer-by-layer method
│       └── twophase/     Kociemba two-phase
├── view/                 3D cube, turn queue, colours, worker client
├── ui/                   Side panel components
└── workers/              Two-phase Web Worker
```

## Testing

`npm test` runs 137 tests. They cover:

- moves checked against known positions
- complete coverage of every OLL, PLL and 2-look case
- every F2L and beginner search table
- hundreds of random scrambles solved with every method and option
- every kind of impossible cube in the validator
- the two-phase tables and search

## Extending

- **More algorithms**: add a `{ name, alg }` line to a list in `src/cube/cases/algorithms.ts`. The pattern is generated automatically, and the tests report gaps, duplicates and algorithms that break the first two layers.
- **A new solving method**: add an entry to `METHODS` in `src/cube/solver/methods.ts` and a `case` in `solve()`. The method picker shows it automatically.
