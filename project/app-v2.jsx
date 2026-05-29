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
  // Each contributing agent (the primary, plus any specialists an orchestrator
  // consults via the Agent SDK) streams its own bubble: reasoning live, then the
  // answer. agent_begin/agent_done drive who is "thinking" (animated icon).
  const handleSend = useCallback((text) => {
    const stamp = Date.now();
    const all = enabledRef.current;
    const primary = all.find((p) => p.id === selectedId) || all[0];
    if (!primary) return;
    const agentById = (id) => all.find((a) => a.id === id) || primary;
    const bubbleId = (id) => `r-${stamp}-${id}`;
    const accText = {};
    const accThink = {};

    // User message + primary starts "thinking"
    setMessages((prev) => [...prev, { id: `u-${stamp}`, type: "user", text }]);
    setThinkingIds((prev) => Array.from(new Set([...prev, primary.id])));

    const patchBubble = (id, patch) =>
      setMessages((prev) => prev.map((m) => (m.id === bubbleId(id) ? { ...m, ...patch } : m)));

    const history = messagesRef.current
      .filter((m) => (m.type === "user" || m.type === "reply") && !m.error && m.text)
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", text: m.text }));

    WBApi.streamChat(
      { personaId: primary.id, message: text, history },
      {
        onAgentBegin: (agentId) => {
          const ag = agentById(agentId);
          if (agentId !== primary.id) {
            setJoinedAgents((prev) => (prev.includes(agentId) ? prev : [...prev, agentId]));
          }
          setThinkingIds((prev) => Array.from(new Set([...prev, agentId])));
          accText[agentId] = "";
          accThink[agentId] = "";
          setMessages((prev) => [
            ...prev,
            {
              id: bubbleId(agentId), type: "reply", agent: ag,
              text: "", thinking: "", status: "Pensando…",
              streaming: true, thinkingActive: true,
            },
          ]);
        },
        onStatus: (agentId, txt) => { if (agentId) patchBubble(agentId, { status: txt }); },
        onThinking: (agentId, chunk) => {
          accThink[agentId] = (accThink[agentId] || "") + chunk;
          patchBubble(agentId, { thinking: accThink[agentId] });
        },
        onText: (agentId, chunk) => {
          accText[agentId] = (accText[agentId] || "") + chunk;
          patchBubble(agentId, { text: accText[agentId], thinkingActive: false });
        },
        onMeta: (agentId, cacheInfo) => { if (cacheInfo) patchBubble(agentId, { cacheInfo }); },
        onAgentDone: (agentId) => {
          patchBubble(agentId, { streaming: false, thinkingActive: false, status: null });
          setThinkingIds((prev) => prev.filter((id) => id !== agentId));
        },
        onError: (errMsg, agentId) => {
          if (agentId) {
            patchBubble(agentId, {
              text: accText[agentId] || errMsg, error: !accText[agentId],
              streaming: false, thinkingActive: false, status: null,
            });
            setThinkingIds((prev) => prev.filter((id) => id !== agentId));
          } else {
            setMessages((prev) => [...prev, { id: `e-${stamp}`, type: "reply", agent: primary, text: errMsg, error: true }]);
          }
          const cfg = configRef.current;
          if (cfg && !cfg.keySet) setSettingsOpen(true);
        },
        onDone: () => {
          setThinkingIds((prev) => prev.filter((id) => id !== primary.id));
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
