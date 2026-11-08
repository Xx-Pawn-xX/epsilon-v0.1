/* =========================================================
   EPSILON CORE v0.2
   English Draughts Search Engine

   Search:
   - Iterative deepening
   - Negamax / Alpha-Beta
   - Principal Variation Search
   - Aspiration windows
   - Transposition table
   - Zobrist hashing
   - Killer moves
   - History heuristic
   - PV move ordering
   - Capture extensions
   - Forced-capture quiescence (complete capture sequences)
   - Conservative Late Move Reductions
   - Improved transposition-table replacement
   - Interruptible asynchronous search

   Compatible with the original EpsilonEngine API.
========================================================= */

(function (root) {
  "use strict";

  const BLACK = 1;
  const RED = -1;
  const EMPTY = 0;

  const INF = 1000000000;
  const WIN = 100000;
  const MATE_THRESHOLD = 99000;
  const MAX_EXTENSIONS = 2;

  /* =========================================================
     BOARD
  ========================================================= */

  function rowOf(s) {
    return Math.floor(s / 4);
  }

  function colOf(s) {
    const r = rowOf(s);
    return (s % 4) * 2 + (r % 2 === 0 ? 1 : 0);
  }

  function squareAt(r, c) {
    if (
      r < 0 || r > 7 ||
      c < 0 || c > 7 ||
      (r + c) % 2 !== 1
    ) return -1;

    return r * 4 + Math.floor(c / 2);
  }

  function initialPosition() {
    const board = new Int8Array(32);

    for (let i = 0; i < 12; i++) board[i] = BLACK;
    for (let i = 20; i < 32; i++) board[i] = RED;

    return { board, turn: BLACK, ply: 0 };
  }

  function clonePosition(p) {
    return {
      board: new Int8Array(p.board),
      turn: p.turn,
      ply: p.ply || 0
    };
  }

  function dirsFor(piece) {
    if (Math.abs(piece) === 2) {
      return [[-1,-1],[-1,1],[1,-1],[1,1]];
    }

    return piece === BLACK
      ? [[1,-1],[1,1]]
      : [[-1,-1],[-1,1]];
  }

  function makeMove(from, to, captures, promotes) {
    return {
      from,
      to,
      captures: captures.slice(),
      promotes: !!promotes
    };
  }

  function sameMove(a, b) {
    if (!a || !b) return false;

    return (
      a.from === b.from &&
      a.to === b.to &&
      a.captures.length === b.captures.length &&
      a.captures.every((v, i) => v === b.captures[i])
    );
  }

  function cloneMove(m) {
    return m ? makeMove(m.from, m.to, m.captures, m.promotes) : null;
  }

  function moveKey(m) {
    return m.from + ":" + m.to + ":" + m.captures.join(",");
  }

  function squareName(s) {
    return "abcdefgh"[colOf(s)] + (8 - rowOf(s));
  }

  function moveNotation(m) {
    const a = squareName(m.from);
    const b = squareName(m.to);

    return m.captures.length
      ? a + "x" + b +
        (m.captures.length > 1
          ? " (" + m.captures.length + " jumps)"
          : "")
      : a + "-" + b;
  }

  /* =========================================================
     MOVE GENERATION
  ========================================================= */

  function generateCapturesForPiece(board, from, piece, results) {
    const dirs = dirsFor(piece);

    for (const [dr, dc] of dirs) {
      const r = rowOf(from);
      const c = colOf(from);

      const over = squareAt(r + dr, c + dc);
      const land = squareAt(r + dr * 2, c + dc * 2);

      if (
        over < 0 ||
        land < 0 ||
        board[over] * piece >= 0 ||
        board[land] !== EMPTY
      ) continue;

      const next = new Int8Array(board);

      next[from] = EMPTY;
      next[over] = EMPTY;

      const promotes =
        Math.abs(piece) === 1 &&
        rowOf(land) === (piece === BLACK ? 7 : 0);

      const nextPiece = promotes ? piece * 2 : piece;
      next[land] = nextPiece;

      const path = results._path.concat(over);

      // A newly crowned man cannot continue jumping.
      if (promotes) {
        results.push(
          makeMove(results._origin, land, path, true)
        );
        continue;
      }

      const before = results.length;
      const oldPath = results._path;

      results._path = path;

      generateCapturesForPiece(
        next,
        land,
        nextPiece,
        results
      );

      results._path = oldPath;

      if (results.length === before) {
        results.push(
          makeMove(results._origin, land, path, false)
        );
      }
    }
  }

  function legalMoves(position) {
    const board = position.board;
    const side = position.turn;
    const captures = [];

    // Captures are mandatory.
    for (let from = 0; from < 32; from++) {
      if (board[from] * side <= 0) continue;

      const holder = [];
      holder._origin = from;
      holder._path = [];

      generateCapturesForPiece(
        board,
        from,
        board[from],
        holder
      );

      captures.push(...holder);
    }

    if (captures.length) return captures;

    const moves = [];

    for (let from = 0; from < 32; from++) {
      const piece = board[from];

      if (piece * side <= 0) continue;

      for (const [dr, dc] of dirsFor(piece)) {
        const to = squareAt(
          rowOf(from) + dr,
          colOf(from) + dc
        );

        if (to < 0 || board[to] !== EMPTY) continue;

        const promotes =
          Math.abs(piece) === 1 &&
          rowOf(to) === (side === BLACK ? 7 : 0);

        moves.push(makeMove(from, to, [], promotes));
      }
    }

    return moves;
  }

  function applyMove(position, move) {
    const next = clonePosition(position);
    const board = next.board;
    const piece = board[move.from];

    board[move.from] = EMPTY;

    for (const captured of move.captures) {
      board[captured] = EMPTY;
    }

    board[move.to] = move.promotes ? piece * 2 : piece;

    next.turn = -position.turn;
    next.ply = (position.ply || 0) + 1;

    return next;
  }

  /* =========================================================
     EVALUATION
  ========================================================= */

  function mobilityForSide(board, side) {
    let count = 0;

    for (let s = 0; s < 32; s++) {
      const piece = board[s];

      if (piece * side <= 0) continue;

      for (const [dr, dc] of dirsFor(piece)) {
        const target = squareAt(
          rowOf(s) + dr,
          colOf(s) + dc
        );

        if (target >= 0 && board[target] === EMPTY) {
          count++;
        }
      }
    }

    return count;
  }

  function evaluate(position) {
    const board = position.board;

    let score = 0;
    let blackCount = 0;
    let redCount = 0;

    for (let s = 0; s < 32; s++) {
      const piece = board[s];
      if (!piece) continue;

      const side = Math.sign(piece);
      const king = Math.abs(piece) === 2;

      const row = rowOf(s);
      const col = colOf(s);

      if (side === BLACK) blackCount++;
      else redCount++;

      let value = king ? 190 : 100;

      if (!king) {
        const advancement =
          side === BLACK ? row : 7 - row;

        value += advancement * 3.2;
      }

      const center =
        3.5 - Math.abs(3.5 - col);

      value += center * (king ? 4.2 : 2.3);

      // Back-row guard.
      if (
        !king &&
        (
          (side === BLACK && row === 0) ||
          (side === RED && row === 7)
        )
      ) {
        value += 7;
      }

      // Edge stability.
      if (col === 0 || col === 7) {
        value += king ? 2 : 1;
      }

      // King centralization.
      if (king) value += 5;

      score += side * value;
    }

    if (blackCount === 0) {
      return (-WIN + position.ply) * position.turn;
    }

    if (redCount === 0) {
      return (WIN - position.ply) * position.turn;
    }

    score += (
      mobilityForSide(board, BLACK) -
      mobilityForSide(board, RED)
    ) * 1.5;

    score += position.turn * 4;

    return score * position.turn;
  }

  function countPieces(position, side) {
    let men = 0;
    let kings = 0;

    for (const p of position.board) {
      if (p * side > 0) {
        if (Math.abs(p) === 2) kings++;
        else men++;
      }
    }

    return { men, kings, total: men + kings };
  }

  /* =========================================================
     ZOBRIST HASHING
  ========================================================= */

  function makeRandomGenerator(seed) {
    let state = seed >>> 0;

    return function () {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    };
  }

  const random = makeRandomGenerator(0xE95110);

  const ZOBRIST = Array.from(
    { length: 32 },
    () => Array.from(
      { length: 5 },
      () => random()
    )
  );

  const TURN_HASH = random();

  function hashPosition(position) {
    let hash = 0;

    for (let i = 0; i < 32; i++) {
      hash ^= ZOBRIST[i][position.board[i] + 2];
    }

    if (position.turn === RED) hash ^= TURN_HASH;

    return hash >>> 0;
  }

  // Independent verification hash.
  function verificationHash(position) {
    let h = 2166136261;

    for (let i = 0; i < 32; i++) {
      h ^= position.board[i] + 2;
      h = Math.imul(h, 16777619);
    }

    h ^= position.turn === BLACK ? 1 : 2;
    h = Math.imul(h, 16777619);

    return h >>> 0;
  }

  /* =========================================================
     TRANSPOSITION TABLE
  ========================================================= */

  const EXACT = 0;
  const LOWER = 1;
  const UPPER = 2;

  function scoreToTT(score, ply) {
    if (score > MATE_THRESHOLD) return score + ply;
    if (score < -MATE_THRESHOLD) return score - ply;
    return score;
  }

  function scoreFromTT(score, ply) {
    if (score > MATE_THRESHOLD) return score - ply;
    if (score < -MATE_THRESHOLD) return score + ply;
    return score;
  }

  function createTT(entries) {
    let size = 1;

    while (size * 2 <= entries) size *= 2;

    return {
      table: new Array(size),
      size,
      mask: size - 1,
      used: 0,
      hits: 0
    };
  }

  /* =========================================================
     SEARCH CONTEXT
  ========================================================= */

  function createSearch(position, options, onProgress, shouldStop) {
    options = options || {};

    const maxDepth = Math.max(
      1,
      Math.min(32, options.depth || 10)
    );

    const timeMs = Math.max(
      250,
      (options.time || 5) * 1000
    );

    const hashEntries = Math.max(
      1024,
      Math.min(1 << 20, options.hashEntries || (1 << 18))
    );

    const started = Date.now();
    const deadline = started + timeMs;

    const tt = createTT(hashEntries);

    let nodes = 0;
    let qnodes = 0;
    let stopped = false;
    let timedOut = false;

    let completedDepth = 0;
    let bestMove = null;
    let bestScore = 0;
    let bestPV = [];

    const killers = Array.from(
      { length: maxDepth + 64 },
      () => [null, null]
    );

    const history = [
      new Int32Array(1024),
      new Int32Array(1024)
    ];

    let previousPV = [];

    function checkStop() {
      // Count both normal and quiescence nodes. Otherwise a search spending
      // most of its time in quiescence could go too long without checking.
      if (((nodes + qnodes) & 1023) !== 0) return false;

      if (
        Date.now() >= deadline ||
        (shouldStop && shouldStop())
      ) {
        stopped = true;
        timedOut = Date.now() >= deadline;
        return true;
      }

      return false;
    }

    function rememberKiller(move, ply) {
      if (move.captures.length) return;

      const slots = killers[ply];
      const key = moveKey(move);

      if (slots[0] && moveKey(slots[0]) === key) return;

      slots[1] = slots[0];
      slots[0] = cloneMove(move);
    }

    function updateHistory(side, move, depth) {
      if (move.captures.length) return;

      const sideIndex = side === BLACK ? 0 : 1;
      const index = move.from * 32 + move.to;

      history[sideIndex][index] = Math.min(
        1000000,
        history[sideIndex][index] + depth * depth * 16
      );
    }

    function orderMoves(moves, pos, ttMove, ply) {
      const sideIndex = pos.turn === BLACK ? 0 : 1;
      const slots = killers[ply] || [null, null];
      const pvMove = previousPV[ply];

      return moves.map(move => {
        let score = 0;

        if (pvMove && sameMove(move, pvMove)) {
          score += 200000000;
        }

        if (ttMove && sameMove(move, ttMove)) {
          score += 100000000;
        }

        if (move.captures.length) {
          score += 1000000;
          score += move.captures.length * 20000;

          for (const captured of move.captures) {
            score += Math.abs(pos.board[captured]) === 2
              ? 1200
              : 600;
          }
        }

        if (move.promotes) score += 500000;

        if (
          slots[0] &&
          sameMove(move, slots[0])
        ) {
          score += 30000;
        } else if (
          slots[1] &&
          sameMove(move, slots[1])
        ) {
          score += 20000;
        }

        if (!move.captures.length) {
          score += history[sideIndex][
            move.from * 32 + move.to
          ];
        }

        return { move, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(item => item.move);
    }

    /* =====================================================
       QUIESCENCE
    ===================================================== */

    function quiescence(pos, alpha, beta, ply, qply) {
      qnodes++;

      if (checkStop()) {
        return { score: 0, pv: [], aborted: true };
      }

      const moves = legalMoves(pos);

      if (!moves.length) {
        return {
          score: -WIN + ply,
          pv: [],
          aborted: false
        };
      }

      const forcedCapture = moves[0].captures.length > 0;

      // In English draughts every quiescence continuation is a compulsory
      // capture, and every such move removes at least one piece. A legal
      // position has at most 24 pieces, so this sequence is naturally finite.
      // Do not evaluate a position in the middle of a forced capture sequence.

      // No compulsory capture: quiet position is stable enough.
      if (!forcedCapture) {
        const standPat = evaluate(pos);

        if (standPat >= beta) {
          return { score: standPat, pv: [], aborted: false };
        }

        return {
          score: Math.max(alpha, standPat),
          pv: [],
          aborted: false
        };
      }

      let bestScore = -INF;
      let bestPV = [];

      for (const move of moves) {
        const child = applyMove(pos, move);

        const result = quiescence(
          child,
          -beta,
          -alpha,
          ply + 1,
          qply + 1
        );

        if (result.aborted) return result;

        const score = -result.score;

        if (score > bestScore) {
          bestScore = score;
          bestPV = [move].concat(result.pv);
        }

        if (score > alpha) alpha = score;

        if (alpha >= beta) break;
      }

      return {
        score: bestScore,
        pv: bestPV,
        aborted: false
      };
    }

    /* =====================================================
       NEGAMAX + PVS
    ===================================================== */

    function negamax(
      pos,
      depth,
      alpha,
      beta,
      ply,
      pvNode,
      extensionsLeft
    ) {
      nodes++;

      if (checkStop()) {
        return { score: 0, pv: [], aborted: true };
      }

      if (depth <= 0) {
        return quiescence(pos, alpha, beta, ply, 0);
      }

      const originalAlpha = alpha;
      const originalBeta = beta;

      const hash = hashPosition(pos);
      const verify = verificationHash(pos);
      const index = hash & tt.mask;

      const entry = tt.table[index];

      let ttMove = null;

      if (
        entry &&
        entry.hash === hash &&
        entry.verify === verify
      ) {
        tt.hits++;
        ttMove = entry.move;

        if (entry.depth >= depth) {
          const ttScore = scoreFromTT(entry.score, ply);

          if (!pvNode) {
            if (entry.flag === EXACT) {
              return {
                score: ttScore,
                pv: entry.move ? [entry.move] : [],
                aborted: false
              };
            }

            if (entry.flag === LOWER) {
              alpha = Math.max(alpha, ttScore);
            } else if (entry.flag === UPPER) {
              beta = Math.min(beta, ttScore);
            }

            if (alpha >= beta) {
              return {
                score: ttScore,
                pv: entry.move ? [entry.move] : [],
                aborted: false
              };
            }
          }
        }
      }

      const moves = legalMoves(pos);

      if (!moves.length) {
        return {
          score: -WIN + ply,
          pv: [],
          aborted: false
        };
      }

      const ordered = orderMoves(moves, pos, ttMove, ply);

      let bestScore = -INF;
      let bestMoveAtNode = null;
      let bestLine = [];

      for (let i = 0; i < ordered.length; i++) {
        const move = ordered[i];
        const child = applyMove(pos, move);

        // Extend a limited number of capture sequences near the horizon.
        const extend =
          move.captures.length > 0 &&
          depth === 1 &&
          extensionsLeft > 0;

        const childDepth = depth - 1 + (extend ? 1 : 0);
        const childExtensions = extensionsLeft - (extend ? 1 : 0);

        let result;

        if (i === 0) {
          result = negamax(
            child,
            childDepth,
            -beta,
            -alpha,
            ply + 1,
            pvNode,
            childExtensions
          );
        } else {
          // Conservative Late Move Reductions: only reduce late, quiet moves
          // at non-PV nodes. Captures and promotions are never reduced.
          // Any reduced move that raises alpha is immediately re-searched
          // at its full depth before it can affect the principal result.
          let reduction = 0;

          if (
            !pvNode &&
            depth >= 3 &&
            childDepth >= 2 &&
            i >= 3 &&
            move.captures.length === 0 &&
            !move.promotes
          ) {
            reduction = (
              depth >= 7 && i >= 8
            ) ? 2 : 1;
          }

          // Null-window search, optionally at reduced depth.
          result = negamax(
            child,
            Math.max(0, childDepth - reduction),
            -alpha - 1,
            -alpha,
            ply + 1,
            false,
            childExtensions
          );

          // A reduced move that looks competitive must prove it at full depth.
          if (
            !result.aborted &&
            reduction > 0 &&
            -result.score > alpha
          ) {
            result = negamax(
              child,
              childDepth,
              -alpha - 1,
              -alpha,
              ply + 1,
              false,
              childExtensions
            );
          }

          // Re-search in the full window if the move improves alpha.
          if (
            !result.aborted &&
            -result.score > alpha &&
            -result.score < beta
          ) {
            result = negamax(
              child,
              childDepth,
              -beta,
              -alpha,
              ply + 1,
              pvNode,
              childExtensions
            );
          }
        }

        if (result.aborted) return result;

        const score = -result.score;

        if (score > bestScore) {
          bestScore = score;
          bestMoveAtNode = move;
          bestLine = [move].concat(result.pv);
        }

        if (score > alpha) alpha = score;

        if (alpha >= beta) {
          rememberKiller(move, ply);
          updateHistory(pos.turn, move, depth);
          break;
        }
      }

      let flag = EXACT;

      if (bestScore <= originalAlpha) {
        flag = UPPER;
      } else if (bestScore >= originalBeta) {
        flag = LOWER;
      }

      const old = tt.table[index];
      const samePosition = !!old &&
        old.hash === hash &&
        old.verify === verify;

      // Prefer fresh information for the same position. On collisions,
      // avoid letting a stale deep entry permanently block useful entries;
      // retain a substantially deeper entry unless the new one is exact.
      const replace =
        !old ||
        samePosition ||
        depth >= old.depth - 2 ||
        (flag === EXACT && old.flag !== EXACT);

      if (replace) {
        if (!old) tt.used++;

        tt.table[index] = {
          hash,
          verify,
          depth,
          score: scoreToTT(bestScore, ply),
          flag,
          move: cloneMove(bestMoveAtNode)
        };
      }

      return {
        score: bestScore,
        pv: bestLine,
        aborted: false
      };
    }

    /* =====================================================
       ITERATIVE DEEPENING
    ===================================================== */

    function* run() {
      for (let depth = 1; depth <= maxDepth; depth++) {
        if (
          Date.now() >= deadline ||
          (shouldStop && shouldStop())
        ) {
          timedOut = Date.now() >= deadline;
          break;
        }

        stopped = false;

        let alpha = -INF;
        let beta = INF;
        let window = 40;

        if (depth >= 4 && completedDepth > 0) {
          alpha = bestScore - window;
          beta = bestScore + window;
        }

        let result;

        while (true) {
          result = negamax(
            position,
            depth,
            alpha,
            beta,
            0,
            true,
            MAX_EXTENSIONS
          );

          if (result.aborted) break;

          if (result.score <= alpha && alpha > -INF) {
            window *= 2;
            alpha = Math.max(-INF, bestScore - window);
            beta = Math.min(INF, bestScore + window);
            continue;
          }

          if (result.score >= beta && beta < INF) {
            window *= 2;
            alpha = Math.max(-INF, bestScore - window);
            beta = Math.min(INF, bestScore + window);
            continue;
          }

          break;
        }

        if (result.aborted) break;

        completedDepth = depth;
        bestScore = result.score;
        bestPV = result.pv;
        bestMove = result.pv[0] || null;

        previousPV = bestPV.slice();

        const elapsed = Date.now() - started;

        const progress = {
          depth,
          score: bestScore,
          nodes,
          qnodes,
          elapsed,
          nps: elapsed > 0
            ? Math.round((nodes + qnodes) * 1000 / elapsed)
            : 0,
          ttHits: tt.hits,
          hashUsed: tt.used,
          pv: bestPV,
          bestMove
        };

        yield progress;

        if (Math.abs(bestScore) >= WIN - 100) break;
      }

      const elapsed = Date.now() - started;

      return {
        bestMove,
        score: bestScore,
        pv: bestPV,
        depth: completedDepth,
        nodes,
        qnodes,
        nps: elapsed > 0
          ? Math.round((nodes + qnodes) * 1000 / elapsed)
          : 0,
        ttHits: tt.hits,
        hashUsed: tt.used,
        elapsed,
        timedOut:
          timedOut ||
          completedDepth < maxDepth
      };
    }

    return run();
  }

  /* =========================================================
     SYNCHRONOUS SEARCH
  ========================================================= */

  function search(position, options, onProgress, shouldStop) {
    const iterator = createSearch(
      position,
      options,
      onProgress,
      shouldStop
    );

    while (true) {
      const step = iterator.next();

      if (step.done) return step.value;

      if (onProgress) onProgress(step.value);
    }
  }

  /* =========================================================
     ASYNCHRONOUS SEARCH
     Yields between completed depths so the worker can
     process stop/new-analysis messages.
  ========================================================= */

  async function searchAsync(
    position,
    options,
    onProgress,
    shouldStop
  ) {
    const iterator = createSearch(
      position,
      options,
      onProgress,
      shouldStop
    );

    while (true) {
      const step = iterator.next();

      if (step.done) return step.value;

      if (onProgress) onProgress(step.value);

      await new Promise(resolve => setTimeout(resolve, 0));

      if (shouldStop && shouldStop()) {
        // The next iteration will stop before starting another depth.
        continue;
      }
    }
  }

  /* =========================================================
     PERFT
  ========================================================= */

  function perft(position, depth) {
    if (depth === 0) return 1;

    const moves = legalMoves(position);
    let total = 0;

    for (const move of moves) {
      total += perft(
        applyMove(position, move),
        depth - 1
      );
    }

    return total;
  }

  function perftDivide(position, depth) {
    if (depth < 1) return [];

    return legalMoves(position).map(move => ({
      move,
      notation: moveNotation(move),
      nodes: perft(applyMove(position, move), depth - 1)
    }));
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  const api = {
    BLACK,
    RED,
    EMPTY,

    initialPosition,
    clonePosition,

    legalMoves,
    applyMove,

    evaluate,
    search,
    searchAsync,

    perft,
    perftDivide,
    moveNotation,
    squareName,

    rowOf,
    colOf,
    squareAt,

    countPieces,
    sameMove,
    hashPosition
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.EpsilonEngine = api;
  }

})(typeof self !== "undefined" ? self : globalThis);
