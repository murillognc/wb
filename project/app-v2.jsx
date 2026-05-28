/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle,
   PERSONAS_V2, HeaderV2, Roster, Query, FooterV2 */

const { useState, useEffect, useRef, useCallback } = React;

const TWEAK_DEFAULTS_V2 = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "showContinue": true
}/*EDITMODE-END*/;

const ROSTER_W_KEY = "wb-roster-w";
const ROSTER_W_MIN = 320;
const ROSTER_W_MAX = 640;
const ROSTER_W_DEFAULT = 440;

// Generic placeholder replies for demo
const DEMO_REPLIES = [
  "Estou analisando os dados. Volto em instantes com uma síntese.",
  "Boa pergunta. Cruzando com os indicadores e trazendo o contexto relevante.",
  "Acionando o time. Em breve trago uma resposta consolidada.",
  "Vou olhar isso por múltiplos ângulos. Um momento.",
  "Levantando os pontos relevantes — segue logo abaixo.",
];

function AppV2() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS_V2);
  const [time, setTime] = useState(new Date());
  const [selectedId, setSelectedId] = useState("executivo");

  // === Chat state ===
  const [messages, setMessages] = useState([]);
  const [joinedAgents, setJoinedAgents] = useState([]);
  const [thinkingIds, setThinkingIds] = useState([]); // personas currently “thinking”

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
    for (const p of PERSONAS_V2) {
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

  const selectedPersona = PERSONAS_V2.find((p) => p.id === selectedId);

  // === Send message handler ===
  // Each user message:
  //  1. Adds the user bubble immediately
  //  2. After 500ms: brings ONE other agent into the chat (if any haven't joined)
  //  3. After 1200ms: the primary agent replies with a placeholder
  const handleSend = useCallback((text) => {
    const stamp = Date.now();
    const primaryAtSend = PERSONAS_V2.find((p) => p.id === selectedId);
    const called = detectCalledIds(text); // personas explicitly invoked by the text

    // 1. User message
    setMessages((prev) => [...prev, {
      id: `u-${stamp}`,
      type: "user",
      text,
    }]);

    // 2. Bring relevant agents into the header roster.
    //    If the text names specific agents, those join (besides the primary).
    //    Otherwise, bring in one fresh agent so the demo keeps populating.
    let willJoinIds = [];
    setJoinedAgents((prevJoined) => {
      const calledNew = called.filter(
        (id) => id !== selectedId && !prevJoined.includes(id)
      );
      if (calledNew.length > 0) {
        willJoinIds = calledNew;
        return [...prevJoined, ...calledNew];
      }
      const available = PERSONAS_V2.filter(
        (p) => p.id !== selectedId && !prevJoined.includes(p.id)
      );
      if (available.length === 0) return prevJoined;
      willJoinIds = [available[0].id];
      return [...prevJoined, available[0].id];
    });

    // 3. Mark thinkers: primary always thinks; any persona named in the text
    //    that's already in the header (or just joined) also thinks.
    const headerIds = new Set([selectedId, ...joinedAgents, ...willJoinIds]);
    const thinkers = [selectedId, ...called.filter((id) => headerIds.has(id) && id !== selectedId)];
    setThinkingIds((prev) => Array.from(new Set([...prev, ...thinkers])));

    // 4. Primary agent reply — stops primary thinking when it lands
    setTimeout(() => {
      const reply = DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)];
      setMessages((prev) => [...prev, {
        id: `r-${stamp}`,
        type: "reply",
        agent: primaryAtSend,
        text: reply,
      }]);
      setThinkingIds((prev) => prev.filter((id) => id !== primaryAtSend.id));
    }, 1400);

    // 5. Side-agents settle down after a beat (no reply in demo)
    thinkers
      .filter((id) => id !== selectedId)
      .forEach((id) => {
        const settleIn = 1800 + Math.random() * 1400;
        setTimeout(() => {
          setThinkingIds((prev) => prev.filter((x) => x !== id));
        }, settleIn);
      });
  }, [selectedId, joinedAgents]);

  return (
    <div className="wb-app">
      <HeaderV2 time={time} />

      <div
        className="wb-body"
        style={{ gridTemplateColumns: `${rosterW}px 6px 1fr` }}
      >
        <Roster
          selectedId={selectedId}
          onSelect={(p) => setSelectedId(p.id)}
          showRecent={t.showContinue}
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
            .map((id) => PERSONAS_V2.find((p) => p.id === id))
            .filter(Boolean)}
          thinkingIds={thinkingIds}
          time={time}
          messages={messages}
          onSend={handleSend}
        />
      </div>

      <FooterV2 />

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
