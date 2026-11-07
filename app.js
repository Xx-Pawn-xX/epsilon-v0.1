
(function () {
  "use strict";

  const E = window.EpsilonEngine;
  const $ = id => document.getElementById(id);
  const boardEl = $("board");

  if (!E || !boardEl) {
    console.error("EPSILON: Engine or board not found.");
    return;
  }

  let position = E.initialPosition();
  let history = [{ position: E.clonePosition(position), move: null }];
  let cursor = 0;
  let selected = -1;
  let flipped = false;
  let lastMove = null;

  let analysisWorker = null;
  let analysisRequest = 0;
  let analysisTimer = null;

  const squares = [];

  let boardWrap = null;
  let arrowLayer = null;

  // =========================================================
  // VISUAL REDESIGN — NAVY / WHITE / BLACK
  // =========================================================

  function installTheme() {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(font);

    const style = document.createElement("style");

    style.textContent = `
      :root {
        --red: #4779d5;
        --red2: #244b91;
        --navy: #244b91;
        --navy-light: #4779d5;
        --cyan: #8eb8ff;
      }

      body {
        font-family: Inter, system-ui, sans-serif !important;
      }

      button, input {
        font-family: inherit;
      }

      .brand-mark,
      .brand-copy em,
      .footer b {
        color: #8eb8ff !important;
      }

      .turn-disc.white {
        background: #f5f6f8;
        border: 1px solid #9ca8b9;
      }

      .turn-disc.black {
        background: #171d28;
        border: 1px solid #71809a;
      }

      .piece.white {
        background:
          radial-gradient(circle at 34% 25%,
            #ffffff,
            #e9edf4 58%,
            #aeb9ca);
        border: 2px solid #ffffff;
        box-shadow:
          0 5px 5px #0007,
          inset 0 3px 4px #ffffff,
          inset 0 -5px 7px #8794a8;
      }

      .piece.black {
        background:
          radial-gradient(circle at 34% 25%,
            #46536a,
            #202a3b 58%,
            #101725);
        border: 2px solid #71809a;
      }

      .piece.king:after {
        color: #8eb8ff !important;
        text-shadow: 0 2px 4px #000 !important;
      }

      .analyze-button,
      .icon-button,
      .subtle-button {
        background: linear-gradient(145deg, #244b91, #172f5d) !important;
        border: 1px solid #4169a9 !important;
        color: #edf4ff !important;
        box-shadow: 0 5px 16px #10274b55;
      }

      .analyze-button:hover,
      .icon-button:hover,
      .subtle-button:hover {
        background: linear-gradient(145deg, #315fae, #1d3c73) !important;
        border-color: #6d99df !important;
      }

      .analyze-button:disabled {
        opacity: .6;
      }

      input[type=range] {
        accent-color: #4779d5 !important;
      }

      .best-move,
      .history-row .active-move {
        color: #8eb8ff !important;
      }

      .eval-meter {
        display: none !important;
      }

      .analyze-button {
        display: none !important;
      }

      .board-frame {
        display: flex !important;
        align-items: stretch !important;
        gap: 12px !important;
      }

      .epsilon-board-wrap {
        position: relative;
        flex: 1;
        min-width: 0;
      }

      .epsilon-board-wrap .board {
        width: 100%;
      }

      .epsilon-board-wrap .rank-labels {
        left: -19px;
      }

      .epsilon-board-wrap .file-labels {
        left: 0;
        right: 0;
      }

      /* Best-move arrow overlay */
      .epsilon-best-arrow-layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 20;
        pointer-events: none;
        overflow: visible;
      }

      .epsilon-best-arrow {
        fill: none;
        stroke: #65a4ff;
        stroke-width: 9;
        stroke-linecap: round;
        stroke-linejoin: round;
        filter:
          drop-shadow(0 0 4px #367fe8)
          drop-shadow(0 0 9px #367fe8aa);
        opacity: .94;
      }

      .epsilon-best-arrow-head {
        fill: #8ebeff;
        stroke: #d4e7ff;
        stroke-width: 1.5;
        filter: drop-shadow(0 0 5px #367fe8);
      }

      .epsilon-best-arrow-origin {
        fill: #65a4ff;
        stroke: #d4e7ff;
        stroke-width: 3;
        filter: drop-shadow(0 0 5px #367fe8);
      }

      .epsilon-eval-rail {
        width: 43px;
        flex: 0 0 43px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 3px 0 22px;
        user-select: none;
      }

      .epsilon-eval-label {
        font: 600 8px 'JetBrains Mono', monospace;
        letter-spacing: .4px;
        color: #aab7ca;
        writing-mode: vertical-rl;
        transform: rotate(180deg);
      }

      .epsilon-eval-track {
        position: relative;
        flex: 1;
        width: 17px;
        min-height: 100px;
        border-radius: 5px;
        overflow: hidden;
        border: 1px solid #66748a;
        background: #f1f3f7;
        box-shadow: 0 5px 18px #0005;
      }

      .epsilon-eval-black {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        background: linear-gradient(90deg, #101725, #29364b);
        transition: height .35s ease;
      }

      .epsilon-eval-white {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 50%;
        background: linear-gradient(90deg, #cbd4e1, #ffffff);
        transition: height .35s ease;
      }

      .epsilon-eval-divider {
        position: absolute;
        left: -3px;
        right: -3px;
        height: 3px;
        top: 50%;
        background: #4779d5;
        box-shadow: 0 0 7px #4779d5;
        z-index: 2;
        transition: top .35s ease;
      }

      .eval-main strong {
        font-family: 'JetBrains Mono', monospace !important;
      }

      .panel {
        border-color: #273750;
      }

      .toast {
        border-color: #4169a9;
      }

      @media(max-width:600px) {
        .epsilon-eval-rail {
          width: 30px;
          flex-basis: 30px;
        }

        .epsilon-eval-track {
          width: 13px;
        }

        .epsilon-eval-label {
          font-size: 7px;
        }

        .board-frame {
          gap: 7px !important;
        }

        .epsilon-board-wrap .rank-labels {
          left: -14px;
        }

        .epsilon-best-arrow {
          stroke-width: 7;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // =========================================================
  // EVALUATION BAR
  // Positive = BLACK advantage
  // Negative = WHITE advantage
  // =========================================================

  let evalBlack = null;
  let evalWhite = null;
  let evalDivider = null;

  function createEvaluationBar() {
    const frame = boardEl.parentElement;

    boardWrap = document.createElement("div");
    boardWrap.className = "epsilon-board-wrap";

    frame.insertBefore(boardWrap, boardEl);

    const rankLabels = frame.querySelector(".rank-labels");
    const fileLabels = frame.querySelector(".file-labels");

    boardWrap.appendChild(boardEl);

    if (rankLabels) boardWrap.appendChild(rankLabels);
    if (fileLabels) boardWrap.appendChild(fileLabels);

    // Create SVG overlay for best-move arrows.
    arrowLayer = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

    arrowLayer.setAttribute("class", "epsilon-best-arrow-layer");
    arrowLayer.setAttribute("aria-hidden", "true");

    boardWrap.appendChild(arrowLayer);

    const rail = document.createElement("div");
    rail.className = "epsilon-eval-rail";

    rail.innerHTML = `
      <span class="epsilon-eval-label">BLACK</span>

      <div class="epsilon-eval-track">
        <div class="epsilon-eval-black"></div>
        <div class="epsilon-eval-white"></div>
        <div class="epsilon-eval-divider"></div>
      </div>

      <span class="epsilon-eval-label">WHITE</span>
    `;

    frame.appendChild(rail);

    evalBlack = rail.querySelector(".epsilon-eval-black");
    evalWhite = rail.querySelector(".epsilon-eval-white");
    evalDivider = rail.querySelector(".epsilon-eval-divider");

    updateEvaluationBar(0);
  }

  function updateEvaluationBar(score) {
    if (!evalBlack) return;

    const blackShare = Math.max(
      3,
      Math.min(97, 50 + score * 8)
    );

    const whiteShare = 100 - blackShare;

    evalBlack.style.height = blackShare + "%";
    evalWhite.style.height = whiteShare + "%";
    evalDivider.style.top = blackShare + "%";
  }

  // =========================================================
  // BEST-MOVE ARROW
  // =========================================================

  function clearBestMoveArrow() {
    if (arrowLayer) {
      arrowLayer.replaceChildren();
    }
  }

  function drawBestMoveArrow(move) {
    clearBestMoveArrow();

    if (!move || !arrowLayer || !boardWrap) return;

    const fromSquare = squares.find(
      square => Number(square.dataset.index) === move.from
    );

    const toSquare = squares.find(
      square => Number(square.dataset.index) === move.to
    );

    if (!fromSquare || !toSquare) return;

    const wrapRect = boardWrap.getBoundingClientRect();
    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();

    if (!wrapRect.width || !wrapRect.height) return;

    arrowLayer.setAttribute(
      "viewBox",
      `0 0 ${wrapRect.width} ${wrapRect.height}`
    );

    arrowLayer.setAttribute("preserveAspectRatio", "none");

    const x1 =
      fromRect.left + fromRect.width / 2 - wrapRect.left;

    const y1 =
      fromRect.top + fromRect.height / 2 - wrapRect.top;

    const x2 =
      toRect.left + toRect.width / 2 - wrapRect.left;

    const y2 =
      toRect.top + toRect.height / 2 - wrapRect.top;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (!length) return;

    // Shorten the arrow slightly so it does not cover
    // the entire destination piece.
    const unitX = dx / length;
    const unitY = dy / length;

    const startX = x1 + unitX * 7;
    const startY = y1 + unitY * 7;

    const endX = x2 - unitX * 22;
    const endY = y2 - unitY * 22;

    const ns = "http://www.w3.org/2000/svg";

    const origin = document.createElementNS(ns, "circle");
    origin.setAttribute("cx", startX);
    origin.setAttribute("cy", startY);
    origin.setAttribute("r", "7");
    origin.setAttribute("class", "epsilon-best-arrow-origin");

    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", startX);
    line.setAttribute("y1", startY);
    line.setAttribute("x2", endX);
    line.setAttribute("y2", endY);
    line.setAttribute("class", "epsilon-best-arrow");

    // Arrowhead.
    const headLength = 24;
    const headWidth = 19;

    const baseX = endX - unitX * headLength;
    const baseY = endY - unitY * headLength;

    const perpX = -unitY;
    const perpY = unitX;

    const p1 = `${endX},${endY}`;
    const p2 =
      `${baseX + perpX * headWidth / 2},` +
      `${baseY + perpY * headWidth / 2}`;

    const p3 =
      `${baseX - perpX * headWidth / 2},` +
      `${baseY - perpY * headWidth / 2}`;

    const head = document.createElementNS(ns, "polygon");
    head.setAttribute(
      "points",
      `${p1} ${p2} ${p3}`
    );
    head.setAttribute("class", "epsilon-best-arrow-head");

    arrowLayer.append(origin, line, head);
  }

  // =========================================================
  // BOARD
  // =========================================================

  function createBoard() {
    boardEl.innerHTML = "";
    squares.length = 0;

    for (let visual = 0; visual < 64; visual++) {
      const r = Math.floor(visual / 8);
      const c = visual % 8;

      const square = document.createElement("button");

      square.type = "button";
      square.className =
        "square " + ((r + c) % 2 ? "dark" : "light");

      square.setAttribute("role", "gridcell");

      square.dataset.row = r;
      square.dataset.col = c;

      square.addEventListener("click", () => {
        onSquareClick(Number(square.dataset.index));
      });

      boardEl.appendChild(square);
      squares.push(square);
    }
  }

  function visualToLogical(v) {
    const vr = Math.floor(v / 8);
    const vc = v % 8;

    const r = flipped ? 7 - vr : vr;
    const c = flipped ? 7 - vc : vc;

    return E.squareAt(r, c);
  }

  function renderBoard() {
    const legal = E.legalMoves(position);

    const selectedMoves = selected >= 0
      ? legal.filter(m => m.from === selected)
      : [];

    for (let v = 0; v < 64; v++) {
      const s = visualToLogical(v);
      const el = squares[v];

      el.replaceChildren();

      el.dataset.index = s;

      const r = Math.floor(v / 8);
      const c = v % 8;

      el.className =
        "square " + ((r + c) % 2 ? "dark" : "light");

      if (s < 0) {
        el.disabled = true;
        continue;
      }

      el.disabled = false;

      if (s === selected) {
        el.classList.add("selected");
      }

      if (lastMove && s === lastMove.from) {
        el.classList.add("last-from");
      }

      if (lastMove && s === lastMove.to) {
        el.classList.add("last-to");
      }

      if (selectedMoves.some(m => m.to === s)) {
        el.classList.add("legal-target");
      }

      const piece = position.board[s];

      if (selectedMoves.some(m => m.to === s) && piece) {
        el.classList.add("occupied-target");
      }

      if (piece) {
        const disc = document.createElement("span");

        // Original BLACK (+1) remains BLACK.
        // Original RED (-1) becomes WHITE.
        disc.className =
          "piece " +
          (piece > 0 ? "black" : "white") +
          (Math.abs(piece) === 2 ? " king" : "");

        el.appendChild(disc);
      }

      el.setAttribute("aria-label", squareLabel(s, piece));
    }

    // Keep the arrow correctly positioned after board flips.
    if (currentBestMove) {
      drawBestMoveArrow(currentBestMove);
    }

    const blackTurn = position.turn === E.BLACK;

    $("turnText").textContent =
      blackTurn ? "BLACK TO MOVE" : "WHITE TO MOVE";

    $("turnChip").querySelector(".turn-disc").className =
      "turn-disc " + (blackTurn ? "black" : "white");

    $("backBtn").disabled = cursor === 0;
    $("forwardBtn").disabled = cursor >= history.length - 1;

    renderHistory();
  }

  function squareLabel(s, piece) {
    return E.squareName(s) +
      (piece
        ? (piece > 0 ? " black " : " white ") +
          (Math.abs(piece) === 2 ? "king" : "man")
        : " empty");
  }

  // =========================================================
  // MOVE INPUT
  // =========================================================

  function onSquareClick(s) {
    if (s < 0) return;

    const piece = position.board[s];
    const moves = E.legalMoves(position);

    if (selected >= 0) {
      const candidates = moves.filter(
        m => m.from === selected && m.to === s
      );

      if (candidates.length) {
        commitMove(candidates[0]);
        return;
      }
    }

    if (piece * position.turn > 0) {
      selected = selected === s ? -1 : s;
      renderBoard();
      return;
    }

    selected = -1;
    renderBoard();
  }

  function commitMove(move) {
    stopAnalysis();

    position = E.applyMove(position, move);

    history = history.slice(0, cursor + 1);

    history.push({
      position: E.clonePosition(position),
      move
    });

    cursor++;
    selected = -1;
    lastMove = move;

    currentBestMove = null;
    clearAnalysisDisplay();
    renderBoard();

    const legal = E.legalMoves(position);

    if (!legal.length) {
      showToast(
        (position.turn === E.BLACK ? "Black" : "White") +
        " wins — no legal moves."
      );
    } else if (legal.some(m => m.captures.length)) {
      $("boardNote").textContent =
        "Capture is compulsory. Select a piece with a highlighted jump.";
    } else {
      $("boardNote").textContent =
        "Position updated. EPSILON is analysing automatically.";
    }

    scheduleAnalysis();
  }

  // =========================================================
  // MOVE HISTORY
  // =========================================================

  function renderHistory() {
    const list = $("historyList");
    list.innerHTML = "";

    const played = history.slice(1);

    $("moveCount").textContent =
      played.length + (played.length === 1 ? " MOVE" : " MOVES");

    if (!played.length) {
      list.innerHTML =
        '<div class="empty-state">No moves played yet.<br><span>Make a move on the board to begin.</span></div>';
      return;
    }

    for (let i = 0; i < played.length; i += 2) {
      const row = document.createElement("div");
      row.className = "history-row";

      const no = document.createElement("span");
      no.className = "move-no";
      no.textContent = String(Math.floor(i / 2) + 1) + ".";

      const white = document.createElement("span");
      white.textContent = E.moveNotation(played[i].move);

      if (cursor === i + 1) {
        white.className = "active-move";
      }

      const black = document.createElement("span");

      if (played[i + 1]) {
        black.textContent = E.moveNotation(played[i + 1].move);

        if (cursor === i + 2) {
          black.className = "active-move";
        }
      }

      row.append(no, white, black);
      list.appendChild(row);
    }

    list.scrollTop = list.scrollHeight;
  }

  // =========================================================
  // ANALYSIS DISPLAY
  // =========================================================

  let currentBestMove = null;

  function clearAnalysisDisplay() {
    $("evalValue").textContent = "—";

    $("evalPerspective").textContent =
      "Positive = Black · Negative = White";

    $("evalMarker").style.left = "50%";

    $("depthStat").textContent = "—";
    $("nodesStat").textContent = "—";
    $("timeStat").textContent = "—";
    $("npsStat").textContent = "—";

    $("bestMove").textContent = "—";

    $("pvLine").textContent =
      "Analysis will show the principal variation here.";

    $("moveExplanation").textContent =
      "Waiting for automatic analysis.";

    $("lineTag").textContent = "ANALYSING";

    currentBestMove = null;
    clearBestMoveArrow();

    updateEvaluationBar(0);
  }

  function stopAnalysis() {
    if (analysisTimer) {
      clearTimeout(analysisTimer);
      analysisTimer = null;
    }

    if (analysisWorker) {
      analysisWorker.terminate();
      analysisWorker = null;
    }

    analysisRequest++;

    $("progressWrap").hidden = true;
    $("engineStatus").textContent = "ENGINE READY";
  }

  function scheduleAnalysis() {
    stopAnalysis();

    analysisTimer = setTimeout(() => {
      analysisTimer = null;
      startAnalysis();
    }, 180);
  }

  function startAnalysis() {
    if (analysisWorker) {
      analysisWorker.terminate();
      analysisWorker = null;
    }

    const thisRequest = ++analysisRequest;

    const worker = new Worker("worker.js");
    analysisWorker = worker;

    const depth = Number($("depthRange").value);
    const time = Number($("timeRange").value);

    $("progressWrap").hidden = false;
    $("progressBar").style.width = "0%";
    $("progressText").textContent = "Searching position…";
    $("progressDepth").textContent = "DEPTH 0";

    $("engineStatus").textContent = "SEARCHING";

    $("depthStat").textContent = "0";
    $("nodesStat").textContent = "0";
    $("timeStat").textContent = "0.0s";
    $("npsStat").textContent = "—";

    worker.onmessage = event => {
      const data = event.data;

      if (thisRequest !== analysisRequest) return;

      if (data.type === "progress") {
        updateAnalysis(data.progress, false, depth);

      } else if (data.type === "complete") {
        updateAnalysis(data.result, true, depth);

        worker.terminate();

        if (analysisWorker === worker) {
          analysisWorker = null;
        }

        $("engineStatus").textContent = "ANALYSIS COMPLETE";

        $("progressText").textContent =
          data.result.timedOut
            ? "Time limit reached · best completed iteration"
            : "Search completed";

        $("progressBar").style.width = "100%";
      }
    };

    worker.onerror = err => {
      console.error(err);

      if (thisRequest !== analysisRequest) return;

      $("engineStatus").textContent = "ENGINE ERROR";

      showToast(
        "Engine worker failed. Check worker.js and engine.js."
      );

      worker.terminate();

      if (analysisWorker === worker) {
        analysisWorker = null;
      }
    };

    worker.postMessage({
      type: "analyze",

      position: {
        board: Array.from(position.board),
        turn: position.turn,
        ply: position.ply
      },

      options: { depth, time }
    });
  }

  // =========================================================
  // SCORE CONVERSION
  //
  // Engine score is from the side-to-move perspective.
  // Original BLACK = +1, and remains BLACK.
  // Original RED = -1, and becomes WHITE.
  //
  // Therefore:
  // New Black score = engineScore * sideToMove
  // =========================================================

  function updateAnalysis(result, complete, maxDepth) {
    const score = (result.score * position.turn) / 100;

    const formatted =
      (score > 0 ? "+" : "") + score.toFixed(2);

    $("evalValue").textContent = formatted;

    $("evalPerspective").textContent =
      "Black advantage (+) · White advantage (−)";

    updateEvaluationBar(score);

    const normalized = Math.max(
      5,
      Math.min(95, 50 + score * 5)
    );

    $("evalMarker").style.left = normalized + "%";

    $("depthStat").textContent = result.depth;

    $("nodesStat").textContent =
      Number(result.nodes).toLocaleString();

    $("timeStat").textContent =
      (result.elapsed / 1000).toFixed(2) + "s";

    $("npsStat").textContent =
      Math.round(
        result.nodes / Math.max(.001, result.elapsed / 1000)
      ).toLocaleString();

    $("progressDepth").textContent =
      "DEPTH " + result.depth;

    $("progressText").textContent =
      complete
        ? "Search finished"
        : "Searching depth " + result.depth + "…";

    $("progressBar").style.width =
      Math.min(100, result.depth / maxDepth * 100) + "%";

    if (result.bestMove) {
      currentBestMove = result.bestMove;

      $("bestMove").textContent =
        E.moveNotation(result.bestMove);

      $("pvLine").textContent =
        result.pv.map(E.moveNotation).join("   ·   ") ||
        "No principal variation available.";

      $("moveExplanation").textContent =
        result.bestMove.captures.length
          ? "The top line begins with a compulsory capture sequence of " +
            result.bestMove.captures.length +
            " jump" +
            (result.bestMove.captures.length === 1 ? "" : "s") +
            "."
          : result.bestMove.promotes
            ? "The recommended move promotes a man to a king."
            : "The engine's highest-scoring continuation at the completed search depth.";

      $("lineTag").textContent =
        "DEPTH " + result.depth;

      // Draw the recommended move on the board.
      drawBestMoveArrow(result.bestMove);

    } else {
      currentBestMove = null;
      clearBestMoveArrow();

      $("bestMove").textContent = "No legal moves";

      $("pvLine").textContent =
        "This side has no legal continuation.";

      $("moveExplanation").textContent =
        "The position is terminal.";

      $("lineTag").textContent = "TERMINAL";
    }
  }

  // =========================================================
  // UTILITIES
  // =========================================================

  function showToast(message) {
    const t = document.createElement("div");

    t.className = "toast";
    t.textContent = message;

    document.body.appendChild(t);

    requestAnimationFrame(() => t.classList.add("show"));

    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 250);
    }, 2300);
  }

  function restoreAt(index) {
    stopAnalysis();

    cursor = Math.max(
      0,
      Math.min(history.length - 1, index)
    );

    position = E.clonePosition(history[cursor].position);
    lastMove = history[cursor].move;

    selected = -1;

    currentBestMove = null;
    clearAnalysisDisplay();
    renderBoard();

    scheduleAnalysis();
  }

  // =========================================================
  // BUTTONS AND SETTINGS
  // =========================================================

  $("newGameBtn").addEventListener("click", () => {
    stopAnalysis();

    position = E.initialPosition();

    history = [{
      position: E.clonePosition(position),
      move: null
    }];

    cursor = 0;
    selected = -1;
    lastMove = null;

    currentBestMove = null;
    clearAnalysisDisplay();
    renderBoard();

    $("boardNote").textContent =
      "New position. EPSILON is analysing automatically.";

    scheduleAnalysis();
  });

  $("backBtn").addEventListener("click", () => {
    if (cursor > 0) restoreAt(cursor - 1);
  });

  $("forwardBtn").addEventListener("click", () => {
    if (cursor < history.length - 1) restoreAt(cursor + 1);
  });

  $("flipBtn").addEventListener("click", () => {
    flipped = !flipped;
    renderBoard();
  });

  $("clearBtn").addEventListener("click", () => {
    stopAnalysis();
    clearAnalysisDisplay();

    $("engineStatus").textContent = "ANALYSIS CLEARED";
  });

  $("depthRange").addEventListener("input", e => {
    $("depthValue").textContent = e.target.value + " plies";
    scheduleAnalysis();
  });

  $("timeRange").addEventListener("input", e => {
    $("timeValue").textContent =
      e.target.value +
      (e.target.value === "1" ? " second" : " seconds");

    scheduleAnalysis();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      selected = -1;
      renderBoard();
    }
  });

  // Redraw the arrow if the browser window changes size.
  window.addEventListener("resize", () => {
    if (currentBestMove) {
      drawBestMoveArrow(currentBestMove);
    }
  });

  // =========================================================
  // INITIALIZE
  // =========================================================

  installTheme();
  createBoard();
  createEvaluationBar();

  renderBoard();
  clearAnalysisDisplay();

  scheduleAnalysis();

  window.EpsilonApp = {
    getPosition: () => E.clonePosition(position),
    getHistory: () => history.slice(),
    analyze: startAnalysis
  };

})();
