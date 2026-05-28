/* global React */
// WaterBrain — components: Orb, Header, PersonaCard, ConversationCard, Footer

const { useState, useEffect, useMemo } = React;

/* ============================================================
   PERSONA DATA
   Each persona's orb has a unique 3-color palette (--orb-c1/c2/c3)
   that ties into the GR palette but feels alive.
   ============================================================ */
const PERSONAS = [
  {
    id: "financeiro",
    initials: "AF",
    role: "Analista Financeiro",
    name: { lead: "Margens &", key: "EBITDA" },
    area: "Custo financeiro, prazo médio, contribuição.",
    quote: "Como está nossa margem de contribuição em SP?",
    accent: "#11A0D3",
    orb: { c1: "#11A0D3", c2: "#1124D3", c3: "#06267C" },
  },
  {
    id: "comercial",
    initials: "GC",
    role: "Gerente Comercial",
    name: { lead: "Carteira &", key: "Pipeline" },
    area: "Mix de produto, performance regional, churn.",
    quote: "Quais clientes reduziram pedidos no trimestre?",
    accent: "#51CF4A",
    orb: { c1: "#68E04B", c2: "#009245", c3: "#0E5C2C" },
  },
  {
    id: "executivo",
    initials: "VE",
    role: "Visão Executiva",
    name: { lead: "Painel", key: "Integrado" },
    area: "Coordena o time. Consolida visões de múltiplas perspectivas em um único parecer.",
    quote: "Faça uma análise completa do desempenho de abril.",
    accent: "#FA981A",
    orb: { c1: "#FAA823", c2: "#FA6800", c3: "#B14400" },
    isExecutive: true,
  },
  {
    id: "operacional",
    initials: "AO",
    role: "Analista Operacional",
    name: { lead: "Logística &", key: "Ciclo" },
    area: "Devoluções, frete, eficiência de entrega.",
    quote: "Onde está o gargalo na entrega?",
    accent: "#FA981A",
    orb: { c1: "#FAB050", c2: "#E37800", c3: "#7C3A00" },
  },
  {
    id: "pdca",
    initials: "CP",
    role: "Consultor PDCA",
    name: { lead: "Melhoria", key: "Contínua" },
    area: "Metodologia, framework de gestão, planos de ação.",
    quote: "Como estruturar um plano pra reduzir retrabalho?",
    accent: "#7BA7E3",
    orb: { c1: "#7BA7E3", c2: "#1124D3", c3: "#031D61" },
  },
];

const CONVERSATIONS = [
  {
    personaId: "financeiro",
    personaLabel: "Analista Financeiro",
    question: "Compare o EBITDA de março e abril por unidade de negócio, segmentando por linha de produto.",
    date: "há 2 horas",
    meta: "12 mensagens",
  },
  {
    personaId: "executivo",
    personaLabel: "Visão Executiva",
    question: "Síntese semanal: alertas críticos, oportunidades comerciais e movimentações operacionais.",
    date: "ontem",
    meta: "Relatório anexado",
  },
  {
    personaId: "operacional",
    personaLabel: "Analista Operacional",
    question: "Por que o lead time de entrega no Sudeste aumentou 18% em abril vs. março?",
    date: "há 2 dias",
    meta: "8 mensagens",
  },
  {
    personaId: "pdca",
    personaLabel: "Consultor PDCA",
    question: "Monte um plano de ação 5W2H pra reduzir devolução de embalagens na linha de polímeros.",
    date: "há 4 dias",
    meta: "Plano gerado",
  },
];

/* ============================================================
   Orb — animated gradient sphere with orbiting particles
   ============================================================ */
function Orb({ persona, size = "md" }) {
  const isExec = persona.isExecutive;
  const wrapCls =
    "wb-orb-wrap" +
    (size === "lg" || isExec ? " wb-orb-wrap--lg" : "") +
    (isExec ? " wb-orb-wrap--executive" : "");
  const style = {
    "--orb-c1": persona.orb.c1,
    "--orb-c2": persona.orb.c2,
    "--orb-c3": persona.orb.c3,
    "--orb-accent": persona.accent,
  };
  return (
    <div className={wrapCls} style={style} aria-hidden="true">
      <div className="wb-orb-glow"></div>
      <div className="wb-orb"></div>
      <div className="wb-orb-particles">
        <div className="wb-orb-particle wb-orb-particle--1"></div>
        <div className="wb-orb-particle wb-orb-particle--2"></div>
        <div className="wb-orb-particle wb-orb-particle--3"></div>
      </div>
    </div>
  );
}

/* ============================================================
   Header — brand, status indicators, user
   ============================================================ */
function Header({ time, statusCount }) {
  const timeStr = useMemo(() => {
    const h = time.getHours().toString().padStart(2, "0");
    const m = time.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }, [time]);

  return (
    <header className="wb-header">
      <div className="wb-brand">
        <div className="wb-brand__mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {/* Stylized brain + droplet mark */}
            <path
              d="M10 2.5C7 2.5 5 4.5 5 7c0 1.5.5 2.5 1.5 3.5C5.5 11.5 5 13 5 14.5c0 1.8 1.3 3 3 3 1 0 1.7-.4 2-1 .3.6 1 1 2 1 1.7 0 3-1.2 3-3 0-1.5-.5-3-1.5-4 1-1 1.5-2 1.5-3.5 0-2.5-2-4.5-5-4.5z"
              fill="#fff"
              fillOpacity="0.95"
            />
            <circle cx="8.5" cy="7.5" r="0.8" fill="#FA6800" />
            <circle cx="11.5" cy="9" r="0.6" fill="#FA6800" />
          </svg>
        </div>
        <div>
          <div className="wb-brand__name">
            Water<b>Brain</b>
          </div>
          <span className="wb-brand__tag">GR Water · Plataforma de Inteligência</span>
        </div>
      </div>

      <div className="wb-header__status">
        <div className="wb-status-pill">
          <span className="wb-status-pill__dot wb-status-pill__dot--azul"></span>
          <span className="wb-status-pill__text">
            Dados atualizados <b>há 2h</b>
          </span>
        </div>
        <div className="wb-status-pill">
          <span className="wb-status-pill__dot"></span>
          <span className="wb-status-pill__text">
            <b>{statusCount}</b> especialistas online
          </span>
        </div>
        <div className="wb-status-pill">
          <ClockGlyph />
          <span className="wb-status-pill__text">{timeStr} · BRT</span>
        </div>
      </div>

      <div className="wb-header__user">
        <div className="wb-user-info">
          <span className="wb-user-name">Murillo Gonçalves</span>
          <span className="wb-user-role">Diretoria · GR Water</span>
        </div>
        <div className="wb-user-avatar">MG</div>
      </div>
    </header>
  );
}

function ClockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M6 3.5V6L7.5 7" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/* ============================================================
   Hero — greeting + search
   ============================================================ */
function Hero({ time, showSearch = true, onSearch }) {
  const greeting = useMemo(() => {
    const h = time.getHours();
    if (h < 5) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, [time]);

  return (
    <section className="wb-hero">
      <div className="wb-hero__eyebrow">
        <span>Briefing operacional</span>
      </div>
      <h1 className="wb-hero__title">
        {greeting}, <b>Murillo.</b>
      </h1>
      <p className="wb-hero__sub">
        Seu time de especialistas em IA está pronto. Com qual deles você quer conversar hoje — ou faça
        uma pergunta direta e nós roteamos.
      </p>

      {showSearch && (
        <form
          className="wb-search"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch && onSearch();
          }}
        >
          <svg className="wb-search__icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 14L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="wb-search__input"
            placeholder="Pergunte qualquer coisa — ex: por que o frete em SP subiu em abril?"
          />
          <span className="wb-search__kbd">⌘ K</span>
          <button type="submit" className="wb-search__btn">
            Enviar
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8m-3-3l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      )}
    </section>
  );
}

/* ============================================================
   PersonaCard
   ============================================================ */
function PersonaCard({ persona, onSelect }) {
  const cls = "wb-persona" + (persona.isExecutive ? " wb-persona--executive" : "");
  const styleVars = {
    "--orb-accent": persona.accent,
  };
  return (
    <article className={cls} style={styleVars} onClick={() => onSelect && onSelect(persona)}>
      {persona.isExecutive && (
        <span className="wb-persona__badge">
          <DiamondGlyph /> Orquestrador
        </span>
      )}

      <div className="wb-persona__head">
        <Orb persona={persona} />
        <span className="wb-persona__status">
          <span className="wb-persona__status-dot"></span>
          Online
        </span>
      </div>

      <div className="wb-persona__role">{persona.role}</div>
      <h3 className="wb-persona__name">
        {persona.name.lead} <b>{persona.name.key}</b>
      </h3>
      <p className="wb-persona__area">{persona.area}</p>

      <div className="wb-persona__quote">
        <div className="wb-persona__quote-label">
          <QuoteGlyph />
          Exemplo de pergunta
        </div>
        <div className="wb-persona__quote-text">"{persona.quote}"</div>
      </div>
    </article>
  );
}

function DiamondGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <path d="M5 1L9 5L5 9L1 5L5 1Z" fill="currentColor" />
    </svg>
  );
}
function QuoteGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2 4.5C2 3.4 2.9 2.5 4 2.5V4C3.7 4 3.5 4.2 3.5 4.5V5.5H5V8H2V4.5ZM7 4.5C7 3.4 7.9 2.5 9 2.5V4C8.7 4 8.5 4.2 8.5 4.5V5.5H10V8H7V4.5Z" fill="currentColor" />
    </svg>
  );
}

/* ============================================================
   Conversation card (Continue de onde parou)
   ============================================================ */
function ConversationCard({ conv }) {
  const persona = PERSONAS.find((p) => p.id === conv.personaId);
  const chipStyle = {
    "--orb-c1": persona.orb.c1,
    "--orb-c2": persona.orb.c2,
  };
  return (
    <article className="wb-conv">
      <div className="wb-conv__head">
        <div className="wb-conv__persona">
          <span className="wb-conv__chip" style={chipStyle}></span>
          <span className="wb-conv__persona-name">{conv.personaLabel}</span>
        </div>
        <span className="wb-conv__date">{conv.date}</span>
      </div>
      <p className="wb-conv__q">{conv.question}</p>
      <div className="wb-conv__foot">
        <span>{conv.meta}</span>
        <svg className="wb-conv__foot-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8m-3-3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </article>
  );
}

/* ============================================================
   Footer
   ============================================================ */
function Footer() {
  return (
    <footer className="wb-footer">
      <div className="wb-footer__left">
        <span>WaterBrain v1.0.4</span>
        <span className="wb-footer__sep"></span>
        <span>Modelo: GR-WB-Industrial / abr.26</span>
        <span className="wb-footer__sep"></span>
        <span>Última sincronização SAP: 14:08</span>
      </div>
      <div className="wb-footer__right">
        <a href="#">Suporte interno</a>
        <a href="#">Política de uso</a>
        <a href="#">Changelog</a>
      </div>
    </footer>
  );
}

/* Expose to window so app.jsx (separate scope) can use them */
Object.assign(window, {
  PERSONAS,
  CONVERSATIONS,
  Orb,
  Header,
  Hero,
  PersonaCard,
  ConversationCard,
  Footer,
});
