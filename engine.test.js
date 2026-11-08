"use strict";

const assert = require("node:assert/strict");
const E = require("./engine.js");

function makePosition(entries, turn = E.BLACK) {
  const board = new Int8Array(32);

  for (const [name, piece] of entries) {
    const col = name.charCodeAt(0) - 97;
    const row = 8 - Number(name[1]);
    const index = E.squareAt(row, col);

    assert.notEqual(index, -1, `Invalid test square ${name}`);
    board[index] = piece;
  }

  return { board, turn, ply: 0 };
}

function positionKey(position) {
  return `${Array.from(position.board).join(",")}|${position.turn}|${position.ply}`;
}

const start = E.initialPosition();

assert.equal(E.legalMoves(start).length, 7, "initial position should have 7 legal moves");
assert.equal(E.perft(start, 0), 1);
assert.equal(E.perft(start, 1), 7);
assert.equal(E.perft(start, 2), 49);
assert.equal(E.perftDivide(start, 2).reduce((sum, item) => sum + item.nodes, 0), 49);

const forced = makePosition([
  ["b6", E.BLACK],
  ["c5", E.RED],
  ["h6", E.BLACK],
  ["a3", E.RED]
]);

const forcedMoves = E.legalMoves(forced);
assert.ok(forcedMoves.length > 0);
assert.ok(forcedMoves.every(m => m.captures.length > 0), "captures must be compulsory");

const multi = makePosition([
  ["b6", E.BLACK],
  ["c5", E.RED],
  ["e3", E.RED],
  ["h2", E.RED]
]);

const multiMoves = E.legalMoves(multi);
assert.equal(multiMoves.length, 1);
assert.equal(multiMoves[0].captures.length, 2);
assert.equal(E.moveNotation(multiMoves[0]), "b6xf2 (2 jumps)");

const promotion = makePosition([
  ["c3", E.BLACK],
  ["d2", E.RED],
  ["a3", E.BLACK],
  ["h6", E.RED]
]);

const promotionMove = E.legalMoves(promotion)[0];
assert.equal(promotionMove.promotes, true);
assert.equal(promotionMove.captures.length, 1);

const promoted = E.applyMove(promotion, promotionMove);
assert.equal(promoted.board[promotionMove.to], E.BLACK * 2);

const kingPosition = makePosition([
  ["d4", E.BLACK * 2],
  ["c3", E.RED]
]);
assert.ok(E.legalMoves(kingPosition).some(m => m.captures.length === 1), "king should capture backwards");

// English draughts rule: a man that crowns during a capture ends its turn.
const crownDuringJump = makePosition([
  ["a3", E.BLACK],
  ["b2", E.RED],
  ["d2", E.RED]
]);
const crownMoves = E.legalMoves(crownDuringJump);
assert.ok(crownMoves.some(m => m.promotes && m.captures.length === 1));
assert.ok(crownMoves.every(m => !m.promotes || m.captures.length === 1));

// applyMove and search must not mutate the caller's position.
const before = positionKey(start);
const firstMove = E.legalMoves(start)[0];
E.applyMove(start, firstMove);
assert.equal(positionKey(start), before, "applyMove must leave its input unchanged");

const searchPosition = E.clonePosition(start);
const searchBefore = positionKey(searchPosition);
const result = E.search(searchPosition, { depth: 4, time: 2, hashEntries: 4096 });
assert.equal(positionKey(searchPosition), searchBefore, "search must not mutate its input");
assert.ok(result.depth >= 1, "search should complete at least one iteration");
assert.ok(result.bestMove, "starting position should have a best move");
assert.ok(E.legalMoves(searchPosition).some(m => E.sameMove(m, result.bestMove)), "search result must be legal");
assert.ok(Number.isFinite(result.score));
assert.ok(Number.isFinite(result.nps));
assert.equal(result.nps, result.elapsed > 0 ? Math.round((result.nodes + result.qnodes) * 1000 / result.elapsed) : 0);

// Hash must distinguish side to move.
const sameBoardOtherTurn = { board: new Int8Array(start.board), turn: E.RED, ply: 0 };
assert.notEqual(E.hashPosition(start), E.hashPosition(sameBoardOtherTurn));

console.log("EPSILON 0.2 engine tests passed.");
