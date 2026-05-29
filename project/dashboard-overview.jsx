/* global React, Mono, PERSONAS_V2 */
// WaterBrain — Dashboard (agents overview).
// Background = the homepage neural-net, neutralised to greys (no blue), under a
// frosted-glass layer; foreground = a grid of agent cards (orchestrator featured)
// each showing a short, fictitious summary of recent activity.

const { useEffect: useEffectD, useRef: useRefD } = React;

// Fictitious "recent activity" per agent.
const AGENT_ACTIVITY = {
  executivo: {
    summary: "Consolidei o briefing executivo de abril e priorizei as decisões da diretoria.",
    items: [
      "Sintetizei 4 perspectivas em um único panorama",
      "Recomendei as 3 ações mais críticas da semana",
      "Acompanhei o ritmo da meta trimestral",
    ],
    stat: "9 briefings esta semana",
  },
  financeiro: {
    summary: "Analisei oportunidades de reduzir a inadimplência de 40 clientes ao longo da semana.",
    items: [
      "Mapeei a margem de contribuição por unidade",
      "Comparei o EBITDA de março vs. abril",
      "Sinalizei 5 desvios relevantes de custo",
    ],
    stat: "23 análises esta semana",
  },
  comercial: {
    summary: "Revisei a carteira e identifiquei risco de churn no top 20 de clientes.",
    items: [
      "Acompanhei quedas de pedido no trimestre",
      "Mapeei a mudança de mix de produto em SP",
      "Priorizei 8 contas em risco",
    ],
    stat: "17 recortes de carteira",
  },
  operacional: {
    summary: "Investiguei gargalos no ciclo de entrega e a alta do frete em abril.",
    items: [
      "Quantifiquei o aumento das devoluções",
      "Apontei um gargalo no picking",
      "Estimei a cobertura de estoque crítico",
    ],
    stat: "14 diagnósticos operacionais",
  },
  pdca: {
    summary: "Implementei 3 metas utilizando o método SMART nesta semana.",
    items: [
      "Estruturei 2 planos de ação em 5W2H",
      "Conduzi 1 análise de causa raiz (A3)",
      "Defini indicadores de retrabalho",
    ],
    stat: "6 ciclos PDCA ativos",
  },
  _default: {
    summary: "Acompanhou indicadores e apoiou decisões recentes na plataforma.",
    items: ["Revisou os dados da semana", "Apontou oportunidades de melhoria"],
    stat: "atividade recente",
  },
};

/* ------------------------------------------------------------------
   Neural-net background — homepage effect, neutralised to greys.
   ------------------------------------------------------------------ */
function NeuralBg() {
  const ref = useRefD(null);
  useEffectD(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let width, height, raf;
    const mouse = { x: null, y: null, radius: 180 };
    const NODE_COUNT = 64;
    const MAX_DIST = 175;
    // Neutral greys only — no brand colour variation.
    const COLORS = [
      { r: 214, g: 218, b: 226 },
      { r: 150, g: 156, b: 168 },
      { r: 112, g: 118, b: 130 },
      { r: 86, g: 92, b: 104 },
    ];
    const nodes = [];

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    function createNodes() {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          r: Math.random() * 1.6 + 1,
          color: COLORS[(Math.random() * COLORS.length) | 0],
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const prox = 1 - dist / MAX_DIST;
            const alpha = prox * 0.4;
            const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            g.addColorStop(0, `rgba(${a.color.r},${a.color.g},${a.color.b},${alpha})`);
            g.addColorStop(1, `rgba(${b.color.r},${b.color.g},${b.color.b},${alpha})`);
            ctx.strokeStyle = g;
            ctx.lineWidth = prox > 0.6 ? 1 : 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      nodes.forEach((n) => {
        if (mouse.x !== null) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius && dist > 0) {
            const f = (mouse.radius - dist) / mouse.radius;
            n.vx += (dx / dist) * f * 0.12;
            n.vy += (dy / dist) * f * 0.12;
          }
        }
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= 0.985;
        n.vy *= 0.985;
        if (Math.abs(n.vx) < 0.08) n.vx += (Math.random() - 0.5) * 0.1;
        if (Math.abs(n.vy) < 0.08) n.vy += (Math.random() - 0.5) * 0.1;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        n.x = Math.max(0, Math.min(width, n.x));
        n.y = Math.max(0, Math.min(height, n.y));
        ctx.fillStyle = `rgba(${n.color.r},${n.color.g},${n.color.b},0.9)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }

    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = null; mouse.y = null; };
    const onResize = () => { resize(); createNodes(); };

    resize();
    createNodes();
    draw();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  return <canvas ref={ref} className="wb-dash__bg" aria-hidden="true" />;
}

/* ------------------------------------------------------------------
   Agent overview card (glass)
   ------------------------------------------------------------------ */
function AgentOverviewCard({ agent, featured }) {
  const act = AGENT_ACTIVITY[agent.id] || AGENT_ACTIVITY._default;
  return (
    <div className={"wb-dash-card" + (featured ? " wb-dash-card--exec" : "")}>
      <div className="wb-dash-card__head">
        <Mono persona={agent} size={featured ? "lg" : "md"} />
        <div className="wb-dash-card__id">
          <div className="wb-dash-card__name" style={{ color: agent.color }}>{agent.role}</div>
          {agent.isExecutive ? (
            <span className="wb-dash-card__tag">Orquestrador</span>
          ) : (
            <div className="wb-dash-card__area">{agent.area}</div>
          )}
        </div>
        <span className="wb-dash-card__live"><span className="wb-dot"></span> ativo</span>
      </div>

      <p className="wb-dash-card__summary">{act.summary}</p>

      <ul className="wb-dash-card__acts">
        {act.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>

      <div className="wb-dash-card__foot">
        <span className="wb-dash-card__stat">{act.stat}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Dashboard screen (full-screen overlay)
   ------------------------------------------------------------------ */
function DashboardScreen({ agents, onClose }) {
  useEffectD(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = (agents && agents.length ? agents : PERSONAS_V2).filter((a) => a.enabled !== false);
  const exec = list.find((a) => a.isExecutive) || list[0];
  const others = list.filter((a) => a !== exec);

  return (
    <div className="wb-dash">
      <NeuralBg />
      <div className="wb-dash__veil" aria-hidden="true"></div>

      <div className="wb-dash__content">
        <header className="wb-dash__bar">
          <button className="wb-admin__back" onClick={onClose}>
            <span aria-hidden="true">←</span> Voltar ao chat
          </button>
          <h1 className="wb-dash__heading">Visão geral dos agentes</h1>
          <div className="wb-dash__bar-right"></div>
        </header>

        <div className="wb-dash__scroll">
          <div className="wb-dash__grid">
            {exec && <AgentOverviewCard agent={exec} featured />}
            {others.map((a) => (
              <AgentOverviewCard key={a.id} agent={a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
