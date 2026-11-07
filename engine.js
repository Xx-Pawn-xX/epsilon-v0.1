/* EPSILON 1 — English draughts rules and search core.
   Board: 32 playable squares, indexed from top-left to bottom-right.
   BLACK (+1) moves first and starts at the top. RED (-1) starts at the bottom.
*/
(function (root) {
  "use strict";
  const BLACK = 1, RED = -1, EMPTY = 0;
  const INF = 1e9, WIN = 100000;

  function rowOf(s) { return Math.floor(s / 4); }
  function colOf(s) { const r = rowOf(s); return (s % 4) * 2 + (r % 2 === 0 ? 1 : 0); }

  function squareAt(r, c) {
    if (r < 0 || r > 7 || c < 0 || c > 7 || (r + c) % 2 !== 1) return -1;
    return r * 4 + Math.floor(c / 2);
  }

  function initialPosition() {
    const board = new Int8Array(32);
    for (let i = 0; i < 12; i++) board[i] = BLACK;
    for (let i = 20; i < 32; i++) board[i] = RED;
    return { board, turn: BLACK, ply: 0 };
  }

  function clonePosition(p) {
    return { board: new Int8Array(p.board), turn: p.turn, ply: p.ply || 0 };
  }

  function dirsFor(piece) {
    if (Math.abs(piece) === 2) return [[-1,-1],[-1,1],[1,-1],[1,1]];
    return piece === BLACK ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
  }

  function makeMove(from, to, captures, promotes) {
    return { from, to, captures: captures.slice(), promotes: !!promotes };
  }

  function sameMove(a, b) {
    return !!a && !!b && a.from === b.from && a.to === b.to &&
      a.captures.length === b.captures.length &&
      a.captures.every((v, i) => v === b.captures[i]);
  }

  function generateCapturesForPiece(board, from, piece, results) {
    const dirs = dirsFor(piece);
    let found = false;

    for (const [dr, dc] of dirs) {
      const r = rowOf(from), c = colOf(from);
      const over = squareAt(r + dr, c + dc);
      const land = squareAt(r + dr * 2, c + dc * 2);

      if (over < 0 || land < 0 || board[over] * piece >= 0 || board[land] !== EMPTY) continue;

      found = true;
      const next = new Int8Array(board);
      next[from] = EMPTY;
      next[over] = EMPTY;

      const reachesKingRow = Math.abs(piece) === 1 &&
        rowOf(land) === (piece === BLACK ? 7 : 0);

      next[land] = reachesKingRow ? piece * 2 : piece;
      const caps = results._path.concat(over);

      if (reachesKingRow) {
        results.push(makeMove(results._origin, land, caps, true));
      } else {
        const before = results.length;
        const oldPath = results._path;
        const oldPiece = results._piece;

        results._path = caps;
        results._piece = next[land];

        generateCapturesForPiece(next, land, next[land], results);

        results._path = oldPath;
        results._piece = oldPiece;

        if (results.length === before) {
          results.push(makeMove(results._origin, land, caps, false));
        }
      }
    }
    return found;
  }

  function legalMoves(position) {
    const b = position.board, side = position.turn, captures = [];

    for (let from = 0; from < 32; from++) {
      if (b[from] * side <= 0) continue;

      const holder = [];
      holder._origin = from;
      holder._path = [];
      holder._piece = b[from];

      generateCapturesForPiece(b, from, b[from], holder);

      for (const m of holder) captures.push(m);
    }

    if (captures.length) return captures;

    const moves = [];

    for (let from = 0; from < 32; from++) {
      const piece = b[from];
      if (piece * side <= 0) continue;

      for (const [dr, dc] of dirsFor(piece)) {
        const to = squareAt(rowOf(from) + dr, colOf(from) + dc);
        if (to < 0 || b[to] !== EMPTY) continue;

        const promotes = Math.abs(piece) === 1 &&
          rowOf(to) === (side === BLACK ? 7 : 0);

        moves.push(makeMove(from, to, [], promotes));
      }
    }
    return moves;
  }

  function applyMove(position, move) {
    const next = clonePosition(position), b = next.board;
    const piece = b[move.from];

    b[move.from] = EMPTY;

    for (const captured of move.captures) b[captured] = EMPTY;

    b[move.to] = move.promotes ? piece * 2 : piece;
    next.turn = -position.turn;
    next.ply = (position.ply || 0) + 1;

    return next;
  }

  function countPieces(position, side) {
    let men = 0, kings = 0;

    for (const p of position.board) {
      if (p * side > 0) {
        Math.abs(p) === 2 ? kings++ : men++;
      }
    }

    return { men, kings, total: men + kings };
  }

  function evaluate(position) {
    const b = position.board;
    let score = 0, blackCount = 0, redCount = 0;

    for (let s = 0; s < 32; s++) {
      const p = b[s];
      if (!p) continue;

      const side = Math.sign(p);
      const king = Math.abs(p) === 2;
      const row = rowOf(s), col = colOf(s);

      if (side === BLACK) blackCount++;
      else redCount++;

      let value = king ? 178 : 100;

      if (!king) {
        value += side === BLACK ? row * 3.0 : (7 - row) * 3.0;
      }

      const center = 3.5 - Math.abs(3.5 - col);
      value += center * (king ? 3.2 : 2.1);

      if (!king && ((side === BLACK && row === 0) ||
                    (side === RED && row === 7))) value += 7;

      if (king) value += 5;

      score += side * value;
    }

    const sideToMove = position.turn;
    const mobility = legalMoves(position).length;

    score += sideToMove * Math.min(8, mobility * 0.65);

    if (blackCount === 0) return -WIN + (position.ply || 0);
    if (redCount === 0) return WIN - (position.ply || 0);

    return score * sideToMove;
  }

  function hashPosition(position) {
    let h = 2166136261;

    for (let i = 0; i < 32; i++) {
      h ^= position.board[i] + 2;
      h = Math.imul(h, 16777619);
    }

    h ^= position.turn === BLACK ? 1 : 2;
    h = Math.imul(h, 16777619);

    return h >>> 0;
  }

  function signature(position) {
    return Array.from(position.board).join(",") + "|" + position.turn;
  }

  function moveKey(m) {
    return m.from + ":" + m.to + ":" + m.captures.join(",");
  }

  function moveNotation(m) {
    const a = squareName(m.from), b = squareName(m.to);

    return m.captures.length
      ? a + "x" + b + (m.captures.length > 1 ? " (" + m.captures.length + " jumps)" : "")
      : a + "-" + b;
  }

  function squareName(s) {
    return "abcdefgh"[colOf(s)] + (8 - rowOf(s));
  }

  function search(position, options, onProgress, shouldStop) {
    const maxDepth = Math.max(1, Math.min(24, options.depth || 10));
    const timeMs = Math.max(250, (options.time || 5) * 1000);

    const started = Date.now(), deadline = started + timeMs;
    const tt = new Map(), ttLimit = 350000;

    let nodes = 0, stopped = false;
    let completedDepth = 0, bestMove = null, bestScore = 0, bestPV = [];

    const killers = Array.from({ length: maxDepth + 4 }, () => null);

    function checkStop() {
      if ((nodes & 2047) === 0 &&
          (Date.now() >= deadline || (shouldStop && shouldStop()))) {
        stopped = true;
        return true;
      }
      return false;
    }

    function orderMoves(moves, ttMove, ply) {
      return moves.map(m => {
        let score = m.captures.length * 1000 + (m.promotes ? 500 : 0);

        if (ttMove && sameMove(m, ttMove)) score += 100000;
        if (killers[ply] && moveKey(m) === moveKey(killers[ply])) score += 300;

        return { m, score };
      }).sort((a,b) => b.score - a.score).map(x => x.m);
    }

    function negamax(pos, depth, alpha, beta, ply, path) {
      nodes++;

      if (checkStop()) return { score: evaluate(pos), pv: [] };

      const moves = legalMoves(pos);

      if (!moves.length) return { score: -WIN + ply, pv: [] };
      if (depth <= 0) return { score: evaluate(pos), pv: [] };

      const key = hashPosition(pos);
      const sig = signature(pos);
      const entry = tt.get(key);
      const alphaOriginal = alpha;

      let ttMove = null;

      if (entry && entry.sig === sig) {
        ttMove = entry.move;

        if (entry.depth >= depth) {
          if (entry.flag === "exact") return { score: entry.score, pv: entry.pv || [] };

          if (entry.flag === "lower") alpha = Math.max(alpha, entry.score);
          else if (entry.flag === "upper") beta = Math.min(beta, entry.score);

          if (alpha >= beta) return { score: entry.score, pv: entry.pv || [] };
        }
      }

      let bestScore = -INF, bestLine = [];
      const ordered = orderMoves(moves, ttMove, ply);

      for (const move of ordered) {
        const child = applyMove(pos, move);
        const result = negamax(child, depth - 1, -beta, -alpha, ply + 1, path);
        const score = -result.score;

        if (score > bestScore) {
          bestScore = score;
          bestLine = [move].concat(result.pv);
        }

        if (score > alpha) alpha = score;

        if (alpha >= beta) {
          if (!move.captures.length) killers[ply] = move;
          break;
        }

        if (stopped) break;
      }

      const chosenMove = bestLine[0] || null;

      let flag = "exact";
      if (bestScore <= alphaOriginal) flag = "upper";
      else if (bestScore >= beta) flag = "lower";

      if (tt.size > ttLimit) tt.clear();

      tt.set(key, {
        sig, depth, score: bestScore, flag,
        move: chosenMove, pv: bestLine
      });

      return { score: bestScore, pv: bestLine };
    }

    for (let depth = 1; depth <= maxDepth; depth++) {
      if (Date.now() >= deadline || (shouldStop && shouldStop())) break;

      stopped = false;

      const result = negamax(position, depth, -INF, INF, 0, []);

      if (stopped) break;

      completedDepth = depth;
      bestScore = result.score;
      bestPV = result.pv;
      bestMove = result.pv[0] || null;

      if (onProgress) {
        onProgress({
          depth,
          score: bestScore,
          nodes,
          elapsed: Date.now() - started,
          pv: bestPV,
          bestMove
        });
      }

      if (Math.abs(bestScore) >= WIN - 100) break;
    }

    return {
      bestMove,
      score: bestScore,
      pv: bestPV,
      depth: completedDepth,
      nodes,
      elapsed: Date.now() - started,
      timedOut: completedDepth < maxDepth
    };
  }

  function perft(position, depth) {
    if (depth === 0) return 1;

    const moves = legalMoves(position);
    let total = 0;

    for (const m of moves) {
      total += perft(applyMove(position, m), depth - 1);
    }

    return total;
  }

  const api = {
    BLACK, RED, EMPTY,
    initialPosition, clonePosition,
    legalMoves, applyMove, evaluate, search,
    perft, moveNotation, squareName,
    rowOf, colOf, squareAt,
    countPieces, sameMove, hashPosition
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.EpsilonEngine = api;
  }

})(typeof self !== "undefined" ? self : globalThis);
