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

const start = E.initialPosition();

assert.equal(
  E.legalMoves(start).length,
  7,
  "initial position should have 7 legal moves"
);

assert.equal(E.perft(start, 1), 7);
assert.equal(E.perft(start, 2), 49);

const forced = makePosition([
  ["b6", E.BLACK],
  ["c5", E.RED],
  ["h6", E.BLACK],
  ["a3", E.RED]
]);

const forcedMoves = E.legalMoves(forced);

assert.ok(forcedMoves.length > 0);

assert.ok(
  forcedMoves.every(m => m.captures.length > 0),
  "captures must be compulsory"
);

const multi = makePosition([
  ["b6", E.BLACK],
  ["c5", E.RED],
  ["e3", E.RED],
  ["h2", E.RED]
]);

const multiMoves = E.legalMoves(multi);

assert.equal(multiMoves.length, 1);
assert.equal(multiMoves[0].captures.length, 2);

assert.equal(
  E.moveNotation(multiMoves[0]),
  "b6xf2 (2 jumps)"
);

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

assert.equal(
  promoted.board[promotionMove.to],
  E.BLACK * 2
);

const kingPosition = makePosition([
  ["d4", E.BLACK * 2],
  ["c3", E.RED]
]);

assert.ok(
  E.legalMoves(kingPosition).some(m => m.captures.length === 1),
  "king should capture backwards"
);

console.log("EPSILON 1 engine tests passed.");
