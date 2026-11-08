"use strict";

importScripts("engine.js");

let activeId = 0;

self.onmessage = async function (event) {
  const data = event.data || {};

  if (data.type === "stop") {
    activeId++;
    return;
  }

  if (data.type !== "analyze") return;

  const requestId = ++activeId;

  try {
    if (!data.position || !data.position.board || data.position.board.length !== 32) {
      throw new Error("Invalid analysis position.");
    }

    const position = {
      board: new Int8Array(data.position.board),
      turn: data.position.turn,
      ply: data.position.ply || 0
    };

    if (position.turn !== EpsilonEngine.BLACK && position.turn !== EpsilonEngine.RED) {
      throw new Error("Invalid side to move.");
    }

    const result = await EpsilonEngine.searchAsync(
      position,
      data.options || {},
      progress => {
        if (requestId !== activeId) return;
        self.postMessage({ type: "progress", requestId, progress });
      },
      () => requestId !== activeId
    );

    if (requestId !== activeId) return;
    self.postMessage({ type: "complete", requestId, result });
  } catch (error) {
    if (requestId !== activeId) return;
    self.postMessage({
      type: "error",
      requestId,
      message: error && error.message ? error.message : "Engine search failed."
    });
  }
};
