/* global React, ReactDOM, WBApi, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle,
   PERSONAS_V2, HeaderV2, SettingsModal, Roster, Query, FooterV2, AdminScreen */

const { useState, useEffect, useRef, useCallback } = React;

const TWEAK_DEFAULTS_V2 = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "showContinue": true
}/*EDITMODE-END*/;

const ROSTER_W_KEY = "wb-roster-w";
const ROSTER_W_MIN = 320;
const ROSTER_W_MAX = 640;
const ROSTER_W_DEFAULT = 440;

function AppV2() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS_V2);
  const [time, setTime] = useState(new Date());
  const [selectedId, setSelectedId] = useState("executivo");

  // === Backend config (API key lives server-side; we only learn keySet etc.) ===
  const [config, setConfig] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const configRef = useRef(null);
  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => {
    let alive = true;
    WBApi.getConfig()
      .then((c) => {
        if (!alive) return;
        setConfig(c);
        if (!c.keySet) setSettingsOpen(true); // first run → prompt for the key
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // === Agents (source of truth = backend; PERSONAS_V2 is a fallback seed) ===
  const [agents, setAgents] = useState(PERSONAS_V2);
  const [adminOpen, setAdminOpen] = useState(false);
  const enabledAgents = agents.filter((a) => a.enabled !== false);
  const enabledRef = useRef(enabledAgents);
  useEffect(() => { enabledRef.current = enabledAgents; }, [enabledAgents]);

  const loadAgents = useCallback(() => {
    WBApi.listAgents()
      .then((list) => { if (list && list.length) setAgents(list); })
      .catch(() => {});
  }, []);
  useEffect(() => { loadAgents(); }, [loadAgents]);

  // Keep the selection valid as agents change.
  useEffect(() => {
    if (enabledAgents.length && !enabledAgents.some((a) => a.id === selectedId)) {
      setSelectedId(enabledAgents[0].id);
    }
  }, [enabledAgents, selectedId]);

  // === Chat state ===
  const [messages, setMessages] = useState([]);
  const [joinedAgents, setJoinedAgents] = useState([]);
  const [thinkingIds, setThinkingIds] = useState([]); // personas currently “thinking”

  // query() is stateless, so we replay recent turns with each request. A ref
  // keeps the latest thread available inside handleSend without stale closures.
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Per-persona keywords to detect when the user is calling that agent
  const PERSONA_KEYWORDS = {
    executivo: [
      "executivo", "briefing", "resumo", "s\u00edntese", "vis\u00e3o geral", "panorama",
      "an\u00e1lise completa", "meta", "trimestre", "decis\u00e3o", "prioridade",
    ],
    financeiro: [
      "financeiro", "finan\u00e7as", "margem", "ebitda", "custo", "pre\u00e7o", "lucro",
      "caixa", "faturamento", "receita", "despesa", "or\u00e7amento", "contribui\u00e7\u00e3o", "dre",
    ],
    comercial: [
      "comercial", "venda", "vendas", "cliente", "clientes", "carteira", "regi\u00e3o",
      "pedido", "pedidos", "mix", "churn", "prospec", "funil",
    ],
    operacional: [
      "opera\u00e7\u00e3o", "operacional", "log\u00edstica", "frete", "entrega", "devolu\u00e7\u00e3o",
      "estoque", "gargalo", "ciclo", "lead time", "produ\u00e7\u00e3o", "sla",
    ],
    pdca: [
      "pdca", "metodologia", "framework", "plano de a\u00e7\u00e3o", "processo",
      "retrabalho", "melhoria", "5w2h", "causa raiz", "a3",
    ],
  };

  function detectCalledIds(text) {
    const lower = text.toLowerCase();
    const hits = [];
    for (const p of enabledRef.current) {
      const kws = PERSONA_KEYWORDS[p.id] || [];
      if (kws.some((k) => lower.includes(k))) hits.push(p.id);
    }
    return hits;
  }

  // Resizable roster width — persisted
  const [rosterW, setRosterW] = useState(() => {
    try {
      const v = Number(localStorage.getItem(ROSTER_W_KEY));
      if (v >= ROSTER_W_MIN && v <= ROSTER_W_MAX) return v;
    } catch (_) {}
    return ROSTER_W_DEFAULT;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(ROSTER_W_KEY, String(rosterW)); } catch (_) {}
  }, [rosterW]);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
  }, [t.theme]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rosterW;
    document.body.classList.add("is-resizing");
    setDragging(true);

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const next = Math.max(ROSTER_W_MIN, Math.min(ROSTER_W_MAX, startW + dx));
      setRosterW(next);
    }
    function onUp() {
      document.body.classList.remove("is-resizing");
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rosterW]);

  const resetResize = useCallback(() => {
    setRosterW(ROSTER_W_DEFAULT);
  }, []);

  const selectedPersona =
    enabledAgents.find((p) => p.id === selectedId) || enabledAgents[0] || PERSONAS_V2[0];

  // === Send message handler ===
  // The primary agent answers. If it's an orchestrator, the backend may consult
  // specialists via the Agent SDK and emits real "join"/"settled" events — those
  // drive who appears in the chat and who is "thinking".
  const handleSend = useCallback((text) => {
    const stamp = Date.now();
    const all = enabledRef.current;
    const primaryAtSend = all.find((p) => p.id === selectedId) || all[0];
    if (!primaryAtSend) return;

    // 1. User message
    setMessages((prev) => [...prev, { id: `u-${stamp}`, type: "user", text }]);

    // 2. Primary starts thinking (until its first token, or synthesis, lands)
    setThinkingIds((prev) => Array.from(new Set([...prev, primaryAtSend.id])));

    // 3. Stream the reply.
    const replyId = `r-${stamp}`;
    let started = false;
    let acc = "";
    let reasoning = "";
    const stopPrimaryThinking = () =>
      setThinkingIds((prev) => prev.filter((id) => id !== primaryAtSend.id));
    const updateReply = (patch) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...patch } : m)));
    const ensureReply = () => {
      if (started) return;
      started = true;
      stopPrimaryThinking();
      setMessages((prev) => [
        ...prev,
        { id: replyId, type: "reply", agent: primaryAtSend, text: "", streaming: true },
      ]);
    };

    // Replay the visible thread (user + agent turns) so the agent has context.
    const history = messagesRef.current
      .filter((m) => (m.type === "user" || m.type === "reply") && !m.error && m.text)
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", text: m.text }));

    WBApi.streamChat(
      { personaId: primaryAtSend.id, message: text, history },
      {
        onText: (chunk) => { ensureReply(); acc += chunk; updateReply({ text: acc }); },
        onThinking: (chunk) => { ensureReply(); reasoning += chunk; updateReply({ thinking: reasoning }); },
        // Real "entrou no chat": a specialist was actually invoked via the SDK.
        onJoin: (agentId) => {
          setJoinedAgents((prev) => (prev.includes(agentId) ? prev : [...prev, agentId]));
          setThinkingIds((prev) => Array.from(new Set([...prev, agentId])));
        },
        onSettled: (agentId) => {
          setThinkingIds((prev) => prev.filter((id) => id !== agentId));
        },
        onMeta: ({ cacheInfo }) => { if (cacheInfo) updateReply({ cacheInfo }); },
        onError: (errMsg) => {
          ensureReply();
          updateReply({ text: acc || errMsg, error: !acc, streaming: false });
          stopPrimaryThinking();
          const cfg = configRef.current;
          if (cfg && !cfg.keySet) setSettingsOpen(true);
        },
        onDone: () => {
          if (started) updateReply({ streaming: false });
          else stopPrimaryThinking();
        },
      }
    );
  }, [selectedId]);

  return (
    <div className="wb-app">
      <HeaderV2
        time={time}
        keySet={!config || config.keySet}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
      />

      <div
        className="wb-body"
        style={{ gridTemplateColumns: `${rosterW}px 6px 1fr` }}
      >
        <Roster
          selectedId={selectedId}
          onSelect={(p) => setSelectedId(p.id)}
          showRecent={t.showContinue}
          personas={enabledAgents}
        />
        <div
          className={"wb-resize" + (dragging ? " is-dragging" : "")}
          onMouseDown={startResize}
          onDoubleClick={resetResize}
          role="separator"
          aria-orientation="vertical"
          title="Arraste para redimensionar · duplo-clique para resetar"
        ></div>
        <Query
          persona={selectedPersona}
          joinedPersonas={joinedAgents
            .map((id) => enabledAgents.find((p) => p.id === id))
            .filter(Boolean)}
          thinkingIds={thinkingIds}
          time={time}
          messages={messages}
          onSend={handleSend}
        />
      </div>

      <FooterV2 />

      {settingsOpen && (
        <SettingsModal
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => setConfig(next)}
        />
      )}

      {adminOpen && (
        <AdminScreen
          agents={agents}
          config={config}
          onChanged={loadAgents}
          onConfigSaved={(next) => setConfig(next)}
          onClose={() => setAdminOpen(false)}
        />
      )}

      <TweaksPanel>
        <TweakSection label="Tema" />
        <TweakRadio
          label="Tema"
          value={t.theme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
          onChange={(v) => setTweak("theme", v)}
        />

        <TweakSection label="Seções" />
        <TweakToggle
          label="Histórico"
          value={t.showContinue}
          onChange={(v) => setTweak("showContinue", v)}
        />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<AppV2 />);
