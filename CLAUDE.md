# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NextChess is a Chrome extension (Manifest V3) that overlays visual engine-line markers on chess.com analysis and game review pages, with optional AI-powered position explanations via the Claude API.

## Development

**No build system, bundler, or package manager.** All code is vanilla JavaScript with no dependencies. Load the extension in Chrome via `chrome://extensions` > "Load unpacked" pointing at the repo root.

**No test framework.** Test manually by navigating to `chess.com/analysis/*` or `chess.com/game/review/*`.

Content scripts run only on chess.com analysis/review URLs (see `manifest.json` match patterns). The popup is the extension settings UI.

## Architecture

Content scripts are injected in this order (defined in `manifest.json`):

1. **`content/chess-utils.js`** (`ChessUtils`) — Pure logic: FEN parsing, SAN-to-square resolution, coordinate conversion. No DOM access.
2. **`content/dom-reader.js`** (`DomReader`) — Reads chess.com DOM: extracts FEN (3 strategies with fallback), engine lines from `.engine-line-component`, played move from `[selectedply]`/`[data-node]`, board flip state.
3. **`content/preview-board.js`** (`PreviewBoard`) — Hover popup: mini board with animated piece movement, auto-play with media controls, move bar navigation. Detects chess.com piece/board theme.
4. **`content/board-overlay.js`** (`BoardOverlay`) — Three SVG layers on the board (background z:10, foreground z:500, hit z:600). Draws ranked destination squares, score badges, source markers, hover zones, casino-rolling placeholders. Coordinates with `PreviewBoard` for hover interaction.
5. **`content/content.js`** — Main orchestrator: polls every 500ms for position changes, manages settle timer (2.5s) for engine line stabilization, LRU position cache (max 200), toggle switch injected into chess.com's `.switch-menu-component`.

**`background/service-worker.js`** — Handles `EXPLAIN_POSITION` messages: calls Claude API with chess position context, returns structured JSON (summary, bestMoves, worstMove). In-memory LRU cache (max 100).

**`popup/`** — Settings UI: Claude API key, model selection, number of lines to show, auto-explain toggle, show-worst toggle. Persisted via `chrome.storage.sync`.

**`styles/content.css`** — Overlay animations (pulse placeholders, fade-in markers, great-move glow), preview board styling, hover dimming.

## Key Patterns

- All content-script modules are IIFEs returning public API objects (e.g., `const BoardOverlay = (() => { ... return { init, drawEngineLines, ... }; })()`)
- Board coordinates: SVG viewBox is 800x800 (100px per square). `sqPos(alg, flip)` converts algebraic to pixel position.
- Engine line ranking uses a color scheme: green (#1), blue (#2), gray (#3+), red (worst), gold (played move)
- The settle pattern: on position change, show placeholders immediately, wait 2.5s for engine lines to stabilize, then draw final state with staggered animation (150ms per square)
- Chess.com DOM selectors are fragile — `DomReader` uses multiple fallback strategies for FEN extraction
