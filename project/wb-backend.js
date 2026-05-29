/* WaterBrain backend client (plain JS, no JSX).
   Exposes window.WBApi with config + streaming chat helpers. The dashboard is
   served by the FastAPI backend, so all calls are same-origin ("/api/..."). */
(function () {
  "use strict";

  async function getConfig() {
    const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("config " + res.status);
    return res.json();
  }

  async function saveConfig(payload) {
    const res = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("config save " + res.status);
    return res.json();
  }

  // ---- Agents CRUD ----------------------------------------------------------
  async function listAgents() {
    const res = await fetch("/api/agents", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("agents " + res.status);
    const data = await res.json();
    return data.agents || [];
  }

  async function createAgent(payload) {
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("agent create " + res.status);
    return res.json();
  }

  async function updateAgent(id, payload) {
    const res = await fetch("/api/agents/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("agent update " + res.status);
    return res.json();
  }

  async function deleteAgent(id) {
    const res = await fetch("/api/agents/" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) throw new Error("agent delete " + res.status);
    return res.json();
  }

  // Events are addressed by bubbleId (a bubble may belong to several agents,
  // e.g. the joint final answer). agent_begin also carries agentIds.
  function dispatch(ev, h) {
    switch (ev.type) {
      case "agent_begin":
        if (h.onAgentBegin) h.onAgentBegin(ev.bubbleId, ev.agentIds || []);
        break;
      case "agent_done":
        if (h.onAgentDone) h.onAgentDone(ev.bubbleId);
        break;
      case "status":
        if (h.onStatus) h.onStatus(ev.bubbleId, ev.text);
        break;
      case "thinking":
        if (h.onThinking) h.onThinking(ev.bubbleId, ev.text);
        break;
      case "text":
        if (h.onText) h.onText(ev.bubbleId, ev.text);
        break;
      case "meta":
        if (h.onMeta) h.onMeta(ev.bubbleId, ev.cacheInfo);
        break;
      case "error":
        if (h.onError) h.onError(ev.message, ev.bubbleId);
        break;
      default:
        break;
    }
  }

  /* Streams a persona reply. `h` is a bag of callbacks:
     onStatus(text, done), onThinking(text), onText(chunk),
     onMeta({sessionId, cacheInfo}), onError(message), onDone(). */
  async function streamChat(req, h) {
    h = h || {};
    let finished = false;
    const finish = function () {
      if (finished) return;
      finished = true;
      if (h.onDone) h.onDone();
    };

    var isAbort = function (err) { return err && err.name === "AbortError"; };

    let res;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: req.signal,            // user can cancel the in-flight reply
        body: JSON.stringify({
          persona_id: req.personaId,
          message: req.message,
          history: req.history || [],
        }),
      });
    } catch (err) {
      // A user-triggered cancel is not an error — just stop quietly.
      if (!isAbort(err) && h.onError) h.onError("Nao foi possivel falar com o servidor. Ele esta rodando?");
      finish();
      return;
    }

    if (!res.ok || !res.body) {
      if (h.onError) h.onError("Falha ao conectar ao servidor (HTTP " + res.status + ").");
      finish();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = rawEvent
            .split("\n")
            .find(function (l) { return l.indexOf("data:") === 0; });
          if (!dataLine) continue;
          let parsed;
          try {
            parsed = JSON.parse(dataLine.slice(5).trim());
          } catch (e) {
            continue;
          }
          if (parsed.type === "done") {
            finish();
          } else {
            dispatch(parsed, h);
          }
        }
      }
    } catch (err) {
      if (!isAbort(err) && h.onError) h.onError("Conexao interrompida durante a resposta.");
    } finally {
      finish();
    }
  }

  window.WBApi = {
    getConfig: getConfig,
    saveConfig: saveConfig,
    streamChat: streamChat,
    listAgents: listAgents,
    createAgent: createAgent,
    updateAgent: updateAgent,
    deleteAgent: deleteAgent,
  };
})();
