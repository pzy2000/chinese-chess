<div align="center">

# Chinese Chess (Xiangqi)

**Single-file web Xiangqi — zero dependencies, zero build, just open and play**

Complete rules (leg-blocking / flying general / stalemate loss / perpetual-check adjudication) · built-in AI engine · Chinese notation · mobile-ready

[![Play Online](https://img.shields.io/badge/▶%20Play%20Online-pzy2000.github.io%2Fchinese--chess-success?logo=github)](https://pzy2000.github.io/chinese-chess/)
[![HTML5](https://img.shields.io/badge/HTML5-single%20file-E34F26?logo=html5&logoColor=white)](#-features)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](#-features)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](#-features)
[![Size](https://img.shields.io/badge/size-~89KB-orange)](#-features)
[![Tests](https://img.shields.io/badge/tests-103%20passing-success)](#-testing)
[![Perft](https://img.shields.io/badge/perft-verified-blue)](#-testing)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=nodedotjs&logoColor=white)](#-testing)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

</div>

## Screenshots

| | |
|:-:|:-:|
| <img src="docs/screenshots/01-gameplay.png" width="480" alt="Gameplay"> | <img src="docs/screenshots/02-hint.png" width="480" alt="AI hint"> |
| *Desktop gameplay: Chinese notation, dual clocks, live eval bar; move by click or drag* | *AI hint: press `H` and the engine marks the suggested move with a dashed green ring* |
| <img src="docs/screenshots/03-review.png" width="480" alt="Game review"> | <img src="docs/screenshots/04-mobile.png" height="375" alt="Mobile"> |
| *Game review: click any move in the notation to revisit that position, `‹ ›` to step* | *Mobile adaptive layout: scales with the viewport, touch tap & drag both supported* |

## ✨ Features

- **Zero-dependency single file**: all styles, rules engine, AI and sound effects inlined in one `index.html` (~89KB) — opens straight from `file://`
- **Complete rules**: leg-blocking (horse), blockable eye (elephant), cannon screen, river-crossing pawns, flying general, stalemate = loss, plus **perpetual-check adjudication** (perpetual check / chase / capture threat)
- **Built-in AI**: iterative deepening + alpha-beta pruning + quiescence search + check extension, three difficulty levels; AI-vs-AI spectator mode
- **Assists**: move hints, position eval bar, undo / redo, board flip, captured-piece trays
- **Chinese notation**: standard file-based notation (e.g. Cannon 2 level 5), click any row to **replay** that position
- **Import / export**: copy notation text, or paste Chinese notation back in (`炮二平五 马8进7 …`, optionally with a FEN first line) — the parser is the exact inverse of the generator; compact string (`XQ1|FEN|moves`), FEN loading, auto-saved progress
- **Multi-platform**: adaptive desktop / mobile layout, Web Audio–synthesized sound effects

## 🚀 Quick Start

**Play online now**: <https://pzy2000.github.io/chinese-chess/> — or run locally, no install / no build:

```bash
# Option 1: open index.html in a browser (double-click it)

# Option 2: serve locally
python3 -m http.server 8000
# visit http://localhost:8000
```

## 🎮 How to Play

### Modes

| Mode | Description |
|---|---|
| Human vs AI | Three AI levels, choose Red (moves first) or Black |
| Human vs Human | Hot-seat, two players take turns |
| AI vs AI | Spectate two engines, adjustable pace and strength |

### Keyboard Shortcuts

| Key | Action | Key | Action |
|---|---|---|---|
| `↑ ↓ ← →` | Move cursor | `Enter` | Select / drop piece |
| `Esc` | Cancel selection | `H` | Hint |
| `U` | Undo | `R` | Redo |
| `F` | Flip board | `N` | New game |

## ⚖️ Rules Implementation

- Movement constraints: horse leg-blocking, elephant eye-blocking, cannon screen, palace & river limits for advisors/elephants, pawns move sideways (never backward) after crossing
- **Flying general** counts as check; **stalemate loses** (as in xiangqi, not chess)
- **Perpetuity adjudication**: each move is classified as check / mate-threat / chase / idle — perpetual check by one side loses; perpetual chase/capture while the opponent does not repeat loses; if both or neither repeat, threefold repetition draws. A `chase` requires a net material gain — even trades count as an exchange, not a chase

## 🧠 AI Engine

Pure-function engine (no DOM access), time-budgeted on the main thread with iterative deepening:

- Negamax + alpha-beta pruning, MVV-LVA move ordering, check extension
- Quiescence search (captures only) at the leaves to avoid the horizon effect
- Evaluation = material + positional terms (advanced pawns, deep cannons, horse mobility, etc.)
- The AI avoids moves that would lose by perpetuity; low levels "blunder" probabilistically for difficulty spread

## 🧪 Testing

The engine is wrapped in `/*<ENGINE>*/` markers and never touches the DOM, so Node can extract and unit-test it directly:

```bash
npm i                  # install playwright-core (the only devDependency, tests only)
npm test               # engine + browser integration, 103 tests total
npm run test:engine    # engine only (pure Node, no browser needed)
npm run test:browser   # browser integration only (needs a local Chrome / Edge)
```

Move generation is authoritatively verified by **perft**: `44 / 1 920 / 79 666 / 3 290 240` (depths 1–4). Run `npm run test:engine` after any engine change.

## 📁 Project Layout

```
.
├── index.html               # The game: styles + engine + UI all inlined
├── tests/
│   ├── engine.mjs           # Extracts the engine section into a temp ESM for import
│   ├── engine.test.mjs      # Engine unit tests: perft / rules / FEN / notation / perpetuity / search
│   ├── browser.mjs          # Browser test scaffold (finds a local browser)
│   └── browser.test.mjs     # Browser integration: moves / AI / undo / review / import-export …
└── docs/screenshots/        # README images
```

## 🤝 Contributing

Issues and PRs welcome. Make sure `npm test` is green before submitting (perft is the hard gate for move generation).

## 📄 License

[MIT](LICENSE) © 2026 pzy
