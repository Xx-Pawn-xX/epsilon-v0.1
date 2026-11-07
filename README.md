# EPSILON 1

EPSILON 1 is a browser-based English draughts
(American checkers) analysis engine prototype.

## Files

- `index.html` — application layout and controls.
- `style.css` — responsive dark interface.
- `engine.js` — rules, move generation, evaluation, and search.
- `worker.js` — background search worker.
- `app.js` — board interaction and analysis UI.
- `engine.test.js` — Node.js rules regression tests.

## Run locally

Because the engine uses a Web Worker, serve the folder
over HTTP rather than opening index.html directly.

For example, with Python installed:

    python -m http.server 8000

Then open:

    http://localhost:8000

## GitHub Pages

Upload all files to the repository root.

Enable GitHub Pages from:

- Branch: main
- Folder: / (root)

Then open the published website.

## Rules implemented

- 8×8 English/American checkers.
- 12 pieces per side.
- Black moves first.
- Men move and capture forward only.
- Kings move and capture one square diagonally
  in either direction.
- Captures are compulsory.
- Complete multi-jump sequences are generated
  as one move.
- Reaching the king row during a capture ends
  that turn and crowns the piece.

## Current engine notes

The engine uses:

- Iterative-deepening negamax.
- Alpha-beta pruning.
- Transposition tables.
- Capture and promotion ordering.
- Killer move ordering.
- Positional evaluation.

This is an experimental first release, not a
Chinook replacement or a solved-game oracle.

Search strength and performance require
further validation and tuning.

## Run engine tests

With Node.js installed, run:

    node engine.test.js
