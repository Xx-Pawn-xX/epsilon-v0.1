"use strict";

importScripts("engine.js");

let activeId = 0;

self.onmessage = function (event) {
  const data = event.data || {};

  if (data.type === "stop") {
    activeId++;
    return;
  }

  if (data.type !== "analyze") return;

  const requestId = ++activeId;

  const position = {
    board: new Int8Array(data.position.board),
    turn: data.position.turn,
    ply: data.position.ply || 0
  };

  const result = EpsilonEngine.search(
    position,
    data.options || {},
    progress => {
      if (requestId === activeId) {
        self.postMessage({ type: "progress", requestId, progress });
      }
    },
    () => requestId !== activeId
  );

  if (requestId === activeId) {
    self.postMessage({ type: "complete", requestId, result });
  }
};
