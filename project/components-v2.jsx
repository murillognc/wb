/* global React */
// WaterBrain v2 — Roster + Query panel components

const { useState, useEffect, useMemo, useRef } = React;

/* ============================================================
   DATA
   ============================================================ */
const PERSONAS_V2 = [
  {
    id: "executivo",
    code: "",
    initials: "Wb",
    role: "WaterBrain",
    area: "Coordena o time. Consolida visões de múltiplas perspectivas.",
    quote: "Faça uma análise completa do desempenho de abril.",
    color: "#FA981A",
    sessions: "37",
    isExecutive: true,
  },
  {
    id: "financeiro",
    code: "",
    initials: "Af",
    role: "Analista Financeiro",
    area: "Margens, EBITDA, custo financeiro e prazo médio.",
    quote: "Como está nossa margem de contribuição em SP?",
    color: "#5E83B8",
    sessions: "112",
  },
  {
    id: "comercial",
    code: "",
    initials: "Gc",
    role: "Gerente Comercial",
    area: "Carteira de clientes, mix de produto, performance regional.",
    quote: "Quais clientes reduziram pedidos no trimestre?",
    color: "#4FA060",
    sessions: "84",
  },
  {
    id: "operacional",
    code: "",
    initials: "Ao",
    role: "Analista Operacional",
    area: "Devoluções, frete, ciclo e eficiência logística.",
    quote: "Onde está o gargalo na entrega?",
    color: "#B97A3A",
    sessions: "63",
  },
  {
    id: "pdca",
    code: "",
    initials: "Cp",
    role: "Consultor PDCA",
    area: "Metodologia, melhoria contínua, framework de gestão.",
    quote: "Como estruturar um plano de ação pra reduzir retrabalho?",
    color: "#7E8AA0",
    sessions: "29",
  },
];

const RECENTS_V2 = [];

const QUICK_PROMPTS = {
  executivo: [
    { tag: "ANÁLISE",  short: "Briefing executivo",     text: "Faça um briefing executivo de abril." },
    { tag: "ALERTAS",  short: "Atenção esta semana",    text: "O que merece atenção esta semana?" },
    { tag: "META",     short: "Ritmo do trimestre",     text: "Estamos no ritmo da meta trimestral?" },
    { tag: "DECISÃO",  short: "3 ações críticas",       text: "Recomende as 3 ações mais críticas." },
  ],
  financeiro: [
    { tag: "MARGEM",   short: "Contribuição por unidade", text: "Compare margem de contribuição por unidade." },
    { tag: "EBITDA",   short: "Março vs abril",          text: "EBITDA mar vs abr por linha de produto." },
    { tag: "PRAZO",    short: "Recebimento abril",       text: "Qual o prazo médio de recebimento em abril?" },
    { tag: "CUSTO",    short: "Onde subiu",              text: "Onde subiu o custo financeiro?" },
  ],
  comercial: [
    { tag: "CARTEIRA", short: "Quedas no trimestre",     text: "Quais clientes reduziram pedidos no trimestre?" },
    { tag: "MIX",      short: "Mudança em SP",            text: "Como mudou o mix de produto em SP?" },
    { tag: "REGIÃO",   short: "Performance regional",    text: "Performance comercial por região." },
    { tag: "CHURN",    short: "Risco top 20",            text: "Risco de churn nos top 20 clientes." },
  ],
  operacional: [
    { tag: "FRETE",    short: "Por que subiu em SP",     text: "Por que o frete em SP subiu em abril?" },
    { tag: "CICLO",    short: "Gargalo na entrega",      text: "Onde está o gargalo no ciclo de entrega?" },
    { tag: "DEVOL",    short: "Aumento das devoluções",   text: "Por que aumentaram as devoluções?" },
    { tag: "ESTOQUE",  short: "Cobertura SKU crítico",    text: "Cobertura de estoque por SKU crítico." },
  ],
  pdca: [
    { tag: "PLANO",    short: "5W2H retrabalho",         text: "Monte um 5W2H pra reduzir retrabalho." },
    { tag: "MÉTODO",   short: "PDCA na embalagem",       text: "Como aplicar PDCA na linha de embalagem?" },
    { tag: "DIAG",     short: "Causa raiz",              text: "Diagnóstico de causa raiz · queixa recorrente." },
    { tag: "INDIC.",   short: "O que monitorar",         text: "Quais indicadores monitorar nesse plano?" },
  ],
};

/* ============================================================
   PANEL ICON — collapse / expand the left sidebar
   ============================================================ */
function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="6.4" y1="3" x2="6.4" y2="13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/* ============================================================
   HEADER
   ============================================================ */
// Slim top bar for the main column. The brand + user + settings all live in
// the floating sidebar now, so this only appears when the sidebar is collapsed
// — just the re-open button + a compact wordmark.
function HeaderV2({ sidebarOpen = true, onToggleSidebar }) {
  if (sidebarOpen) return null;
  return (
    <header className="wb-topbar">
      <button
        type="button"
        className="wb-icon-btn"
        onClick={onToggleSidebar}
        title="Abrir painel"
        aria-label="Abrir painel"
      >
        <PanelIcon />
      </button>
      <span className="wb-brand__mark">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1.5C5 1.5 3.5 3 3.5 5c0 1.1.4 1.9 1.1 2.6-.7.7-1.1 1.7-1.1 2.9 0 1.4 1 2.5 2.4 2.5.7 0 1.2-.2 1.6-.6.3.4.9.6 1.5.6 1.4 0 2.4-1.1 2.4-2.5 0-1.2-.4-2.2-1.1-2.9C10.6 6.9 11 6.1 11 5c0-2-1.5-3.5-3.5-3.5z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="wb-brand__name">Water<b>Brain</b></span>
    </header>
  );
}

/* ============================================================
   SETTINGS MODAL — paste the Anthropic API key + debug valves
   ============================================================ */
function SettingsModal({ config, onClose, onSaved }) {
  const [apiKey, setApiKey] = useState("");
  const [displayThinking, setDisplayThinking] = useState(!!(config && config.displayThinking));
  const [showCacheInfo, setShowCacheInfo] = useState(config ? config.showCacheInfo !== false : true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const keySet = !!(config && config.keySet);
  const modelName = config && config.model ? config.model.name : "Claude Opus 4.6";

  async function save() {
    setSaving(true);
    setStatus(null);
    const payload = { display_thinking: displayThinking, show_cache_info: showCacheInfo };
    if (apiKey.trim()) payload.api_key = apiKey.trim();
    try {
      const next = await window.WBApi.saveConfig(payload);
      setApiKey("");
      setStatus({ ok: true, msg: "Configurações salvas." });
      if (onSaved) onSaved(next);
    } catch (e) {
      setStatus({ ok: false, msg: "Não foi possível salvar. O servidor está rodando?" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wb-modal-overlay" onClick={onClose}>
      <div className="wb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Configurações">
        <div className="wb-modal__head">
          <h2 className="wb-modal__title">Configurações</h2>
          <button className="wb-modal__x" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="wb-modal__body">
          <div className="wb-field">
            <label className="wb-field__label" htmlFor="wb-key">Chave da API Anthropic</label>
            <input
              id="wb-key"
              className="wb-field__input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={keySet ? "•••••••••••••• (já configurada — cole para trocar)" : "sk-ant-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="wb-field__hint">
              {keySet ? (
                <><span className="wb-field__ok">●</span> Uma chave já está salva no servidor.</>
              ) : (
                <><span className="wb-field__warn">●</span> Nenhuma chave configurada. A chave fica só no servidor — nunca no navegador.</>
              )}
            </p>
          </div>

          <div className="wb-field__row">
            <div className="wb-field__row-main">
              <span className="wb-field__label">Mostrar raciocínio</span>
              <span className="wb-field__sub">Expõe o pensamento do modelo no chat (debug).</span>
            </div>
            <button
              type="button"
              className="wb-switch"
              data-on={displayThinking ? "1" : "0"}
              role="switch"
              aria-checked={displayThinking}
              onClick={() => setDisplayThinking((v) => !v)}
            ><i /></button>
          </div>

          <div className="wb-field__row">
            <div className="wb-field__row-main">
              <span className="wb-field__label">Mostrar uso de cache</span>
              <span className="wb-field__sub">Anexa tokens e cache hit/miss ao fim da resposta.</span>
            </div>
            <button
              type="button"
              className="wb-switch"
              data-on={showCacheInfo ? "1" : "0"}
              role="switch"
              aria-checked={showCacheInfo}
              onClick={() => setShowCacheInfo((v) => !v)}
            ><i /></button>
          </div>

          <div className="wb-modal__meta">
            <div className="wb-modal__meta-row"><span>Modelo</span><b>{modelName}</b></div>
            <div className="wb-modal__meta-row"><span>Contexto</span><b>1M tokens</b></div>
            <div className="wb-modal__meta-row"><span>Raciocínio</span><b>Sempre ativo · 60k</b></div>
            <div className="wb-modal__meta-row"><span>Cache</span><b>Agressivo</b></div>
          </div>

          {status && (
            <div className={"wb-modal__status" + (status.ok ? " is-ok" : " is-err")}>{status.msg}</div>
          )}
        </div>

        <div className="wb-modal__foot">
          <button className="wb-modal__btn wb-modal__btn--ghost" onClick={onClose}>Fechar</button>
          <button className="wb-modal__btn wb-modal__btn--primary" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Monogram — replaces the old animated orb
   ============================================================ */
function Mono({ persona, size, thinking }) {
  const cls = "wb-mono" + (persona.isExecutive ? " wb-mono--exec" : "") +
    (size === "lg" ? " wb-active__mono" : "") +
    (size === "md" ? " wb-mono--md" : "") +
    (size === "sm" ? " wb-mono--sm" : "") +
    (thinking ? " is-thinking" : "");
  const style = { "--mono-accent": persona.color };
  return (
    <div className={cls} style={style}>
      {thinking && <span className="wb-mono__ring" aria-hidden="true"></span>}
      <span className="wb-mono__txt">{persona.initials}</span>
    </div>
  );
}

/* ============================================================
   PERSONA ROW (roster item)
   ============================================================ */
function PersonaRow({ persona, selected, onSelect, onHoverEnter, onHoverLeave }) {
  const cls = "wb-row" +
    (selected ? " is-selected" : "") +
    (persona.isExecutive ? " wb-row--exec" : "");
  return (
    <div
      className={cls}
      onClick={() => onSelect(persona)}
      onMouseEnter={(e) => onHoverEnter && onHoverEnter(persona, e.currentTarget)}
      onMouseLeave={() => onHoverLeave && onHoverLeave()}
    >
      <Mono persona={persona} />
      <div className="wb-row__main">
        <h3 className="wb-row__name">{persona.role}</h3>
        {persona.isExecutive && (
          <span className="wb-row__sub">Orquestrador</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PERSONA TOOLTIP — descriptive floating card on row hover
   ============================================================ */
function PersonaTooltip({ data }) {
  if (!data) return null;
  const { persona, top, left } = data;
  const style = {
    top,
    left,
    "--tip-color": persona.color,
    "--mono-accent": persona.color,
  };
  return (
    <div className="wb-tip" style={style} role="tooltip">
      <span className="wb-tip-arrow" aria-hidden="true"></span>
      <div className="wb-tip__head">
        <Mono persona={persona} />
        <div className="wb-tip__title">
          <div className="wb-tip__name">{persona.role}</div>
        </div>
      </div>

      <div className="wb-tip__section">
        <div className="wb-tip__label">Área de atuação</div>
        <p className="wb-tip__text">{persona.area}</p>
      </div>

      <div className="wb-tip__section wb-tip__section--quote">
        <div className="wb-tip__label">Exemplo de pergunta</div>
        <p className="wb-tip__quote">“{persona.quote}”</p>
      </div>
    </div>
  );
}

/* ============================================================
   ROSTER PANEL (left column)
   ============================================================ */
function Caret({ open }) {
  return (
    <svg
      className={"wb-caret" + (open ? " is-open" : "")}
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Roster({ selectedId, onSelect, showRecent, personas = PERSONAS_V2, onCollapse,
                  width, keySet = true, onOpenSettings, onOpenAdmin }) {
  const [tip, setTip] = React.useState(null);
  const [agentsOpen, setAgentsOpen] = React.useState(() => {
    try { return localStorage.getItem("wb-agents-open") !== "0"; } catch (_) { return true; }
  });
  const [historyOpen, setHistoryOpen] = React.useState(() => {
    try { return localStorage.getItem("wb-history-open") !== "0"; } catch (_) { return true; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("wb-agents-open", agentsOpen ? "1" : "0"); } catch (_) {}
  }, [agentsOpen]);
  React.useEffect(() => {
    try { localStorage.setItem("wb-history-open", historyOpen ? "1" : "0"); } catch (_) {}
  }, [historyOpen]);

  const handleEnter = (persona, target) => {
    const r = target.getBoundingClientRect();
    const TIP_H = 320;
    const TIP_W = 300;
    const margin = 16;
    // Anchor left of tooltip just outside the row's right edge
    let left = r.right + 14;
    if (left + TIP_W > window.innerWidth - margin) {
      left = window.innerWidth - TIP_W - margin;
    }
    // Keep tooltip within viewport vertically
    let top = r.top + 4;
    if (top + TIP_H > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - TIP_H - margin);
    }
    setTip({ persona, top, left, rowMid: r.top + r.height / 2 });
  };
  const handleLeave = () => setTip(null);

  return (
    <aside className="wb-roster" style={width ? { width } : undefined} onMouseLeave={handleLeave}>
      <div className="wb-side-head">
        <div className="wb-side-brand">
          <div className="wb-side-brand__id">
            <span className="wb-brand__mark">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1.5C5 1.5 3.5 3 3.5 5c0 1.1.4 1.9 1.1 2.6-.7.7-1.1 1.7-1.1 2.9 0 1.4 1 2.5 2.4 2.5.7 0 1.2-.2 1.6-.6.3.4.9.6 1.5.6 1.4 0 2.4-1.1 2.4-2.5 0-1.2-.4-2.2-1.1-2.9C10.6 6.9 11 6.1 11 5c0-2-1.5-3.5-3.5-3.5z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="wb-brand__name">Water<b>Brain</b></span>
          </div>
          {onCollapse && (
            <button
              type="button"
              className="wb-icon-btn"
              onClick={onCollapse}
              title="Recolher painel"
              aria-label="Recolher painel"
            >
              <PanelIcon />
            </button>
          )}
        </div>
        <a
          href="WaterBrain Homepage.html"
          className="wb-side-co"
          title="GR Water Solutions"
          aria-label="GR Water Solutions"
        >
          <img
            className="wb-brand__co-img wb-brand__co-img--dark"
            src="assets/logo-grws-fonte-branca.png"
            alt="GR Water Solutions"
          />
          <img
            className="wb-brand__co-img wb-brand__co-img--light"
            src="assets/logo-grws-fonte-preta.png"
            alt="GR Water Solutions"
          />
        </a>
      </div>

      <div className="wb-roster__head">
        <button
          type="button"
          className={"wb-roster__title wb-roster__toggle" + (agentsOpen ? " is-open" : "")}
          onClick={() => setAgentsOpen((v) => !v)}
          aria-expanded={agentsOpen}
          aria-controls="wb-roster-list"
        >
          <Caret open={agentsOpen} />
          <span className="wb-roster__title-text">Agentes</span>
        </button>
      </div>

      {agentsOpen && (
        <div className="wb-roster__list" id="wb-roster-list">
          {personas.map((p) => (
            <PersonaRow
              key={p.id}
              persona={p}
              selected={p.id === selectedId}
              onSelect={onSelect}
              onHoverEnter={handleEnter}
              onHoverLeave={handleLeave}
            />
          ))}
        </div>
      )}

      {showRecent && (
        <div className="wb-roster__foot">
          <div className="wb-roster__foot-head">
            <button
              type="button"
              className={"wb-roster__foot-title wb-roster__toggle" + (historyOpen ? " is-open" : "")}
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              aria-controls="wb-history-list"
            >
              <Caret open={historyOpen} />
              <span>Histórico</span>
            </button>
            {historyOpen && <span className="wb-roster__foot-all">VER TUDO →</span>}
          </div>
          {historyOpen && (
            <div id="wb-history-list">
              {RECENTS_V2.length === 0 ? (
                <div className="wb-recent-empty">Nenhuma conversa ainda.</div>
              ) : (
                <ul className="wb-recent">
                  {RECENTS_V2.map((r) => {
                    const p = personas.find((x) => x.id === r.personaId);
                    return (
                      <li key={r.id} className="wb-recent__item">
                        <span className="wb-recent__bullet" style={{ "--bullet-color": p.color }}></span>
                        <span className="wb-recent__q">{r.q}</span>
                        <span className="wb-recent__time">{r.time}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="wb-side-user">
        <div className="wb-side-user__who">
          <div className="wb-user__avatar">Mg</div>
          <div className="wb-side-user__info">
            <span className="wb-side-user__name">Murillo Gonçalves</span>
            <span className="wb-side-user__role">DIRETORIA · GR-WATER</span>
          </div>
        </div>
        <div className="wb-side-user__actions">
          {onOpenAdmin && (
            <button
              type="button"
              className="wb-icon-btn"
              onClick={onOpenAdmin}
              title="Administração"
              aria-label="Administração"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              className={"wb-icon-btn" + (keySet ? "" : " is-warn")}
              onClick={onOpenSettings}
              title={keySet ? "Configurações" : "Configure a chave da API"}
              aria-label="Configurações"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 5.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 1.5l.5 1.6a5.4 5.4 0 011.4.6l1.5-.8 1.2 1.2-.8 1.5q.36.66.6 1.4l1.6.5v1.7l-1.6.5a5.4 5.4 0 01-.6 1.4l.8 1.5-1.2 1.2-1.5-.8a5.4 5.4 0 01-1.4.6L8 14.5l-.5-1.6a5.4 5.4 0 01-1.4-.6l-1.5.8-1.2-1.2.8-1.5a5.4 5.4 0 01-.6-1.4L1.5 8.5V6.8l1.6-.5q.24-.74.6-1.4l-.8-1.5 1.2-1.2 1.5.8q.66-.36 1.4-.6L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              {!keySet && <span className="wb-icon-btn__dot" aria-hidden="true"></span>}
            </button>
          )}
        </div>
      </div>

      <PersonaTooltip data={tip} />
    </aside>
  );
}

/* ============================================================
   CHAT MESSAGES
   ============================================================ */
function UserMessage({ msg }) {
  return <div className="wb-msg wb-msg-user">{msg.text}</div>;
}

function JoinNotification({ agent }) {
  return (
    <div className="wb-msg wb-msg-join">
      <Mono persona={agent} size="sm" />
      <span className="wb-msg-join__txt">
        <b className="wb-msg-join__name">{agent.role}</b> entrou no chat
      </span>
    </div>
  );
}

function ThinkingLabel() {
  return (
    <span className="wb-thinking">
      Pensando
      <span className="wb-thinking__dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    </span>
  );
}

/* ============================================================
   MINIMAL MARKDOWN — renders a safe subset (headings, bold,
   italic, inline code, code fences, lists, paragraphs) to React
   elements. No HTML injection: all text goes through React.
   ============================================================ */
function mdInline(text, kp) {
  const out = [];
  let last = 0, k = 0;
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] || m[3]) out.push(<strong key={kp + "-" + k}>{m[2] || m[3]}</strong>);
    else if (m[4] || m[5]) out.push(<em key={kp + "-" + k}>{m[4] || m[5]}</em>);
    else if (m[6]) out.push(<code key={kp + "-" + k} className="wb-md-code">{m[6]}</code>);
    last = m.index + m[0].length;
    k++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(src) {
  const lines = (src || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // horizontal rule / thematic break (---, ***, ___) — drop it entirely
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { i++; continue; }

    if (/^\s*```/.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      blocks.push(<pre key={key++} className="wb-md-pre"><code>{code.join("\n")}</code></pre>);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(
        <div key={key++} className={"wb-md-h wb-md-h" + h[1].length}>{mdInline(h[2], "h" + key)}</div>
      );
      i++;
      continue;
    }

    // table: a row with pipes followed by a separator row (|---|:--:|...)
    if (
      line.indexOf("|") !== -1 && i + 1 < lines.length &&
      /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].indexOf("-") !== -1
    ) {
      const cells = (l) => {
        let s = l.trim();
        if (s.startsWith("|")) s = s.slice(1);
        if (s.endsWith("|")) s = s.slice(0, -1);
        return s.split("|").map((c) => c.trim());
      };
      const head = cells(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") !== -1) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push(
        <table key={key++} className="wb-md-table">
          <thead>
            <tr>{head.map((c, ci) => <th key={ci}>{mdInline(c, "th" + key + "-" + ci)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{mdInline(c, "td" + key + "-" + ri + "-" + ci)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++;
      }
      blocks.push(
        <ul key={key++} className="wb-md-ul">
          {items.map((it, idx) => <li key={idx}>{mdInline(it, "u" + key + "-" + idx)}</li>)}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++;
      }
      blocks.push(
        <ol key={key++} className="wb-md-ol">
          {items.map((it, idx) => <li key={idx}>{mdInline(it, "o" + key + "-" + idx)}</li>)}
        </ol>
      );
      continue;
    }

    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*```/.test(lines[i])
    ) { para.push(lines[i]); i++; }
    blocks.push(<p key={key++} className="wb-md-p">{mdInline(para.join("\n"), "p" + key)}</p>);
  }
  return blocks;
}

function AgentReply({ msg }) {
  // Strip the markdown code fences the backend wraps cache info in.
  const cache = (msg.cacheInfo || "").replace(/```/g, "").trim();
  const hasReasoning = !!(msg.thinking && msg.thinking.trim());
  // A bubble can belong to several agents (the joint final answer).
  const agents = msg.agents && msg.agents.length ? msg.agents : [msg.agent];
  const [open, setOpen] = useState(true);
  // Auto-collapse the reasoning once the agent stops thinking and starts answering.
  useEffect(() => {
    if (!msg.thinkingActive && msg.text) setOpen(false);
  }, [msg.thinkingActive, msg.text]);

  return (
    <div className={"wb-msg wb-msg-agent" + (msg.error ? " wb-msg-agent--error" : "") + (agents.length > 1 ? " wb-msg-agent--joint" : "")}>
      <div className="wb-msg-agent__avatars">
        {agents.map((a) => (
          <Mono key={a.id} persona={a} size="md" thinking={!!msg.thinkingActive} />
        ))}
      </div>
      <div className="wb-msg-agent__body">
        <div className="wb-msg-agent__name">
          {agents.map((a, i) => (
            <React.Fragment key={a.id}>
              {i > 0 && <span className="wb-msg-agent__plus"> + </span>}
              <span style={{ color: a.color }}>{a.role}</span>
            </React.Fragment>
          ))}
        </div>

        {(hasReasoning || msg.thinkingActive) && (
          <div className={"wb-reason" + (msg.thinkingActive ? " is-active" : "")}>
            <button className="wb-reason__head" onClick={() => setOpen((o) => !o)} type="button">
              {msg.thinkingActive ? (
                <span className="wb-reason__live">
                  <span className="wb-reason__spin" aria-hidden="true"></span>
                  {msg.status || "Pensando…"}
                </span>
              ) : (
                <span className="wb-reason__title">Raciocínio</span>
              )}
              {hasReasoning && (
                <span className={"wb-reason__chev" + (open ? " is-open" : "")} aria-hidden="true">▸</span>
              )}
            </button>
            {hasReasoning && open && <div className="wb-reason__body">{msg.thinking}</div>}
          </div>
        )}

        {msg.text && (
          <div className="wb-msg-agent__text">
            {renderMarkdown(msg.text)}
            {msg.streaming && <span className="wb-caret-blink" aria-hidden="true">▋</span>}
          </div>
        )}
        {!msg.text && msg.streaming && !msg.thinkingActive && (
          <div className="wb-msg-agent__pending">{msg.status || "…"}</div>
        )}

        {cache && <pre className="wb-msg-agent__meta">{cache}</pre>}
      </div>
    </div>
  );
}

/* ============================================================
   QUERY PANEL (right column)
   ============================================================ */
function Query({ persona, joinedPersonas = [], thinkingIds = [], time, messages, onSend, generating, onStop }) {
  const greeting = useMemo(() => {
    const h = time.getHours();
    if (h < 5) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, [time]);

  const [draft, setDraft] = useState("");
  const taRef = useRef(null);
  const chatRef = useRef(null);
  // "Stick to bottom" while answering — turns off if the user scrolls up, back
  // on when they return to the bottom.
  const stickRef = useRef(true);

  const onChatScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Reset draft on persona change
  useEffect(() => { setDraft(""); }, [persona.id]);

  // Follow the conversation as it streams — but only while pinned to the
  // bottom. Sending a new message always re-pins. Runs on every chunk because
  // each patch produces a new `messages` array.
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (last && last.type === "user") stickRef.current = true;
    if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const prompts = persona.quickPrompts || QUICK_PROMPTS[persona.id] || [];
  const hasMessages = messages.length > 0;

  function applyPrompt(p) {
    setDraft(p.text);
    if (taRef.current) taRef.current.focus();
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || generating) return;
    onSend(text);
    setDraft("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <section className="wb-query">
      {/* Greeting row — only while the chat is empty; it gives way to the chat */}
      {!hasMessages && (
        <div className="wb-greet">
          <div className="wb-greet__main">
            <span className="wb-greet__eyebrow">
              <span className="wb-dot wb-dot--steel"></span>
              Briefing · <b>quarta, 28 mai</b>
            </span>
            <h1 className="wb-greet__title">
              {greeting}, <b>Murillo.</b>
            </h1>
          </div>
        </div>
      )}

      {/* Active persona context — primary + agents that joined the chat.
          Docks to a slim top bar once the conversation starts. */}
      <div className={"wb-active" + (hasMessages ? " wb-active--docked" : "")}>
        <div className={"wb-active__item" + (thinkingIds.includes(persona.id) ? " is-thinking" : "")}>
          <Mono persona={persona} size="lg" thinking={thinkingIds.includes(persona.id)} />
          <div className="wb-active__body">
            <div className="wb-active__label">
              {thinkingIds.includes(persona.id) ? (
                <ThinkingLabel />
              ) : (
                "Conversando com"
              )}
            </div>
            <h2 className="wb-active__name">{persona.role}</h2>
          </div>
        </div>
        {(() => {
          const joined = joinedPersonas.filter((p) => p.id !== persona.id);
          const compact = joined.length > 2;
          return joined.map((p) => {
            const thinking = thinkingIds.includes(p.id);
            return (
              <div
                key={p.id}
                className={
                  "wb-active__item wb-active__item--joined" +
                  (compact ? " is-compact" : "") +
                  (thinking ? " is-thinking" : "")
                }
                title={compact ? `${p.role} · ${thinking ? "Pensando" : "Entrou no chat"}` : undefined}
              >
                <Mono persona={p} size="lg" thinking={thinking} />
                {!compact && (
                  <div className="wb-active__body">
                    <div className="wb-active__label">
                      {thinking ? <ThinkingLabel /> : "Entrou no chat"}
                    </div>
                    <h2 className="wb-active__name">{p.role}</h2>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Quick prompts — single compact row of pill chips (only when chat is empty) */}
      {!hasMessages && (
        <div className="wb-quick">
          <span className="wb-quick__label">Sugestões</span>
          {prompts.map((p, i) => (
            <button
              key={i}
              className="wb-quick__item"
              onClick={() => applyPrompt(p)}
              title={p.text}
            >
              <span className="wb-quick__tag">
                <span className="wb-quick__tag-dot" style={{ "--quick-color": persona.color }}></span>
                {p.tag}
              </span>
              <span className="wb-quick__text">{p.short}</span>
            </button>
          ))}
        </div>
      )}

      {/* Chat thread — centered column (Claude-style) */}
      <div className="wb-chat" ref={chatRef} onScroll={onChatScroll}>
        <div className="wb-chat__inner">
          {messages.map((m) => {
            if (m.type === "user") return <UserMessage key={m.id} msg={m} />;
            if (m.type === "reply") return <AgentReply key={m.id} msg={m} />;
            return null;
          })}
        </div>
      </div>

      {/* Composer — compact, centered, refined */}
      <div className="wb-composer-wrap">
        <div className="wb-composer">
          <textarea
            ref={taRef}
            className="wb-composer__input"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem…"
          />
          <div className="wb-composer__bottom">
            <div className="wb-composer__chips">
              <button className="wb-chip wb-chip--icon" title="Anexar dados" aria-label="Anexar">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M9.5 4.5L5 9c-.8.8-.8 2.2 0 3s2.2.8 3 0l5-5c1.3-1.3 1.3-3.5 0-4.8s-3.5-1.3-4.8 0L2.7 7.7c-1.9 1.9-1.9 5.1 0 7s5.1 1.9 7 0l4.3-4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <button
              className={"wb-send" + ((generating || draft.trim()) ? " is-active" : "") + (generating ? " is-stop" : "")}
              disabled={!generating && !draft.trim()}
              onClick={generating ? onStop : handleSend}
              aria-label={generating ? "Parar resposta" : "Enviar"}
              title={generating ? "Parar resposta" : "Enviar"}
            >
              {generating ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FOOTER (slim)
   ============================================================ */
function FooterV2() {
  return (
    <footer className="wb-footer">
      <div className="wb-footer__left"></div>
      <div className="wb-footer__right">
        <a href="#">SUPORTE</a>
        <a href="#">CHANGELOG</a>
        <a href="#">POLÍTICA</a>
      </div>
    </footer>
  );
}

/* Export to window */
Object.assign(window, {
  PERSONAS_V2,
  RECENTS_V2,
  HeaderV2,
  SettingsModal,
  Mono,
  Roster,
  Query,
  FooterV2,
});
