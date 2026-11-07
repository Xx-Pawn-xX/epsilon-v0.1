(function () {
  "use strict";

  const E = window.EpsilonEngine;
  const $ = id => document.getElementById(id);
  const boardEl = $("board");

  let position = E.initialPosition();
  let history = [{ position: E.clonePosition(position), move: null }];
  let cursor = 0, selected = -1, flipped = false, lastMove = null;

  let analysisWorker = null;
  let analysisRequest = 0;
  let latestAnalysis = null;

  const squares = [];

  function createBoard() {
    boardEl.innerHTML = "";
    squares.length = 0;

    for (let visual = 0; visual < 64; visual++) {
      const r = Math.floor(visual / 8);
      const c = visual % 8;

      const square = document.createElement("button");

      square.type = "button";
      square.className = "square " + ((r + c) % 2 ? "dark" : "light");
      square.setAttribute("role", "gridcell");

      square.dataset.row = r;
      square.dataset.col = c;

      square.addEventListener("click", () =>
        onSquareClick(Number(square.dataset.index))
      );

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

  function logicalToVisual(s) {
    const r = E.rowOf(s);
    const c = E.colOf(s);

    return (flipped ? 7-r : r) * 8 +
           (flipped ? 7-c : c);
  }

  function renderBoard() {
    const legal = E.legalMoves(position);

    const selectedMoves = selected >= 0
      ? legal.filter(m => m.from === selected)
      : [];

    for (let v = 0; v < 64; v++) {
      const s = visualToLogical(v);
      const el = squares[v];

      el.dataset.index = s;

      const r = Math.floor(v / 8);
      const c = v % 8;

      el.className = "square " + ((r + c) % 2 ? "dark" : "light");

      if (s < 0) {
        el.disabled = true;
        el.innerHTML = "";
        continue;
      }

      el.disabled = false;

      if (s === selected) el.classList.add("selected");

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

        disc.className =
          "piece " +
          (piece > 0 ? "black" : "red") +
          (Math.abs(piece) === 2 ? " king" : "");

        el.appendChild(disc);
      }

      el.setAttribute("aria-label", squareLabel(s, piece));
    }

    $("turnText").textContent =
      position.turn === E.BLACK ? "BLACK TO MOVE" : "RED TO MOVE";

    $("turnChip").querySelector(".turn-disc").className =
      "turn-disc " + (position.turn === E.BLACK ? "black" : "red");

    $("backBtn").disabled = cursor === 0;
    $("forwardBtn").disabled = cursor >= history.length - 1;

    renderHistory();
  }

  function squareLabel(s, piece) {
    return E.squareName(s) +
      (piece
        ? (piece > 0 ? " black " : " red ") +
          (Math.abs(piece) === 2 ? "king" : "man")
        : " empty");
  }

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
    latestAnalysis = null;

    clearAnalysisDisplay();
    renderBoard();

    const legal = E.legalMoves(position);

    if (!legal.length) {
      showToast(
        (position.turn === E.BLACK ? "Red" : "Black") +
        " wins — no legal moves."
      );
    } else if (legal.some(m => m.captures.length)) {
      $("boardNote").textContent =
        "Capture is compulsory. Select a piece with a highlighted jump.";
    } else {
      $("boardNote").textContent =
        "Move played. Select a piece to continue. The engine analyses the current position.";
    }
  }

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

      const black = document.createElement("span");
      black.textContent = E.moveNotation(played[i].move);

      if (cursor === i + 1) {
        black.className = "active-move";
      }

      const red = document.createElement("span");

      if (played[i + 1]) {
        red.textContent = E.moveNotation(played[i + 1].move);

        if (cursor === i + 2) {
          red.className = "active-move";
        }
      }

      row.append(no, black, red);
      list.appendChild(row);
    }

    list.scrollTop = list.scrollHeight;
  }

  function clearAnalysisDisplay() {
    $("evalValue").textContent = "—";
    $("evalPerspective").textContent = "Run analysis to evaluate";
    $("evalMarker").style.left = "50%";

    $("depthStat").textContent = "—";
    $("nodesStat").textContent = "—";
    $("timeStat").textContent = "—";
    $("npsStat").textContent = "—";

    $("bestMove").textContent = "—";
    $("pvLine").textContent =
      "Analysis will show the principal variation here.";

    $("moveExplanation").textContent =
      "The engine has not evaluated this position yet.";

    $("lineTag").textContent = "NO DATA";
  }

  function stopAnalysis() {
    if (analysisWorker) {
      analysisWorker.postMessage({ type: "stop" });
      analysisWorker.terminate();
      analysisWorker = null;
    }

    analysisRequest++;

    $("progressWrap").hidden = true;
    $("analyzeBtn").disabled = false;
    $("analyzeBtnText").textContent = "ANALYZE POSITION";
    $("engineStatus").textContent = "ENGINE READY";
  }

  function startAnalysis() {
    stopAnalysis();

    const thisRequest = analysisRequest;
    analysisWorker = new Worker("worker.js");

    const depth = Number($("depthRange").value);
    const time = Number($("timeRange").value);

    $("progressWrap").hidden = false;
    $("progressBar").style.width = "0%";

    $("progressText").textContent = "Searching position…";
    $("progressDepth").textContent = "DEPTH 0";

    $("analyzeBtn").disabled = true;
    $("analyzeBtnText").textContent = "ANALYZING…";
    $("engineStatus").textContent = "SEARCHING";

    $("depthStat").textContent = "0";
    $("nodesStat").textContent = "0";
    $("timeStat").textContent = "0.0s";
    $("npsStat").textContent = "—";

    analysisWorker.onmessage = event => {
      const data = event.data;

      if (thisRequest !== analysisRequest) return;

      if (data.type === "progress") {
        const p = data.progress;
        latestAnalysis = p;

        updateAnalysis(p, false, depth, time);

      } else if (data.type === "complete") {
        updateAnalysis(data.result, true, depth, time);

        analysisWorker.terminate();
        analysisWorker = null;

        $("analyzeBtn").disabled = false;
        $("analyzeBtnText").textContent = "ANALYZE AGAIN";
        $("engineStatus").textContent = "ANALYSIS COMPLETE";

        $("progressText").textContent =
          data.result.timedOut
            ? "Time limit reached · best completed iteration"
            : "Search completed";

        $("progressBar").style.width = "100%";
      }
    };

    analysisWorker.onerror = err => {
      console.error(err);

      $("engineStatus").textContent = "ENGINE ERROR";

      showToast(
        "Engine worker failed to load. Check that worker.js and engine.js are in the repository root."
      );

      stopAnalysis();
    };

    analysisWorker.postMessage({
      type: "analyze",

      position: {
        board: Array.from(position.board),
        turn: position.turn,
        ply: position.ply
      },

      options: { depth, time }
    });
  }

  function updateAnalysis(result, complete, maxDepth, maxTime) {
    const score = result.score / 100;

    const sideName =
      position.turn === E.BLACK ? "Black" : "Red";

    $("evalValue").textContent =
      (score > 0 ? "+" : "") + score.toFixed(2);

    $("evalPerspective").textContent =
      "From " + sideName + "'s perspective";

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

      $("lineTag").textContent = "DEPTH " + result.depth;

    } else {
      $("bestMove").textContent = "No legal moves";
      $("pvLine").textContent =
        "This side has no legal continuation.";

      $("moveExplanation").textContent =
        "The position is terminal.";

      $("lineTag").textContent = "TERMINAL";
    }
  }

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
    latestAnalysis = null;

    clearAnalysisDisplay();
    renderBoard();
  }

  $("analyzeBtn").addEventListener("click", startAnalysis);

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

    clearAnalysisDisplay();
    renderBoard();

    $("boardNote").textContent =
      "New game started. Black moves first. Captures are mandatory.";
  });

  $("backBtn").addEventListener("click", () =>
    restoreAt(cursor - 1)
  );

  $("forwardBtn").addEventListener("click", () =>
    restoreAt(cursor + 1)
  );

  $("flipBtn").addEventListener("click", () => {
    flipped = !flipped;
    renderBoard();
  });

  $("clearBtn").addEventListener("click", () => {
    stopAnalysis();
    clearAnalysisDisplay();
  });

  $("depthRange").addEventListener("input", e => {
    $("depthValue").textContent = e.target.value + " plies";
  });

  $("timeRange").addEventListener("input", e => {
    $("timeValue").textContent =
      e.target.value +
      (e.target.value === "1" ? " second" : " seconds");
  });

  document.addEventListener("keydown", e => {
    if (
      (e.key === "Enter" || e.key === " ") &&
      document.activeElement === $("analyzeBtn")
    ) {
      e.preventDefault();
      startAnalysis();
    }

    if (e.key === "Escape") {
      selected = -1;
      renderBoard();
    }
  });

  createBoard();
  renderBoard();

  window.EpsilonApp = {
    getPosition: () => E.clonePosition(position),
    getHistory: () => history.slice(),
    analyze: startAnalysis
  };

})();
