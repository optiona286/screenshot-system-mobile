// Keep large historical CSV parsing off the mobile UI thread.
(() => {
  let worker = null;
  let nextId = 0;
  const requests = new Map();
  function connect() {
    if (worker) return worker;
    worker = new Worker(new URL("./data-worker.js", document.baseURI));
    worker.onmessage = ({ data }) => {
      const request = requests.get(data.id);
      if (!request) return;
      requests.delete(data.id);
      request.cleanup();
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    worker.onerror = () => {
      for (const request of requests.values()) {
        request.cleanup();
        request.reject(new Error("歷史資料處理中斷，請按重讀再試"));
      }
      requests.clear();
      worker.terminate();
      worker = null;
    };
    return worker;
  }
  window.historyApi = (url, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("讀取已取消", "AbortError"));
    const connection = connect();
    const id = ++nextId;
    const abort = () => {
      requests.delete(id);
      signal.removeEventListener("abort", abort);
      connection.postMessage({ id, cancel: true });
      reject(new DOMException("讀取已取消或逾時", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    requests.set(id, { resolve, reject, cleanup: () => signal?.removeEventListener("abort", abort) });
    connection.postMessage({ id, url });
  });
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  }
})();
