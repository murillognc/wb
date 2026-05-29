/* global React, WBApi, Mono */
// WaterBrain — Admin screen (Agentes · Usuários · Geral)

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

const MODEL_OPTIONS = [
  { id: "claude-opus-4-6", name: "Opus 4.6", note: "Análise confiável (padrão)" },
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6", note: "Equilibrado" },
  { id: "claude-haiku-4-5-20251001", name: "Haiku 4.5", note: "Rápido e econômico" },
];

const COLOR_SWATCHES = [
  "#FA981A", "#5E83B8", "#4FA060", "#B97A3A", "#7E8AA0",
  "#9B59B6", "#E0556E", "#2BB3A3", "#D9A441", "#6C7BD1",
];

function modelShort(id) {
  const m = MODEL_OPTIONS.find((o) => o.id === id);
  return m ? m.name : (id || "—");
}

function autoInitials(role) {
  const words = (role || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Ag";
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (words[0][0] + words[1][0]).replace(/^./, (c) => c.toUpperCase()).toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/* ============================================================
   AGENT EDITOR (modal)
   ============================================================ */
function AgentEditor({ agent, onCancel, onSaved, onDeleted }) {
  const isNew = !agent || !agent.id;
  const [form, setForm] = useStateA(() => ({
    role: agent?.role || "",
    initials: agent?.initials || "",
    color: agent?.color || COLOR_SWATCHES[0],
    area: agent?.area || "",
    quote: agent?.quote || "",
    isExecutive: !!agent?.isExecutive,
    model: agent?.model || "claude-opus-4-6",
    thinkingEnabled: agent?.thinkingEnabled !== false,
    thinkingBudget: agent?.thinkingBudget || 60000,
    enabled: agent?.enabled !== false,
    systemPrompt: agent?.systemPrompt || "",
  }));
  const [saving, setSaving] = useStateA(false);
  const [err, setErr] = useStateA(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const initialsPreview = form.initials || autoInitials(form.role);
  const previewPersona = { initials: initialsPreview, color: form.color, isExecutive: form.isExecutive, role: form.role };

  async function save() {
    if (!form.role.trim()) { setErr("Dê um nome ao agente."); return; }
    setSaving(true); setErr(null);
    const payload = { ...form, initials: initialsPreview, thinkingBudget: Number(form.thinkingBudget) || 60000 };
    try {
      const result = isNew
        ? await WBApi.createAgent(payload)
        : await WBApi.updateAgent(agent.id, payload);
      onSaved(result);
    } catch (e) {
      setErr("Não foi possível salvar. O servidor está rodando?");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Apagar o agente "${form.role}"? Isso não pode ser desfeito.`)) return;
    setSaving(true);
    try { await WBApi.deleteAgent(agent.id); onDeleted(agent.id); }
    catch (e) { setErr("Não foi possível apagar."); setSaving(false); }
  }

  return (
    <div className="wb-modal-overlay" onClick={onCancel}>
      <div className="wb-modal wb-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="wb-modal__head">
          <h2 className="wb-modal__title">{isNew ? "Novo agente" : "Editar agente"}</h2>
          <button className="wb-modal__x" onClick={onCancel} aria-label="Fechar">✕</button>
        </div>

        <div className="wb-modal__body wb-admin-edit">
          {/* Identity row */}
          <div className="wb-admin-edit__identity">
            <div className="wb-admin-edit__preview">
              <Mono persona={previewPersona} size="md" />
            </div>
            <div className="wb-admin-edit__id-fields">
              <div className="wb-field">
                <label className="wb-field__label">Nome / função</label>
                <input className="wb-field__input" value={form.role}
                  onChange={(e) => set("role", e.target.value)} placeholder="Ex.: Analista Financeiro" />
              </div>
              <div className="wb-field wb-field--initials">
                <label className="wb-field__label">Iniciais</label>
                <input className="wb-field__input" maxLength={3} value={form.initials}
                  onChange={(e) => set("initials", e.target.value)} placeholder={autoInitials(form.role)} />
              </div>
            </div>
          </div>

          {/* Color */}
          <div className="wb-field">
            <label className="wb-field__label">Cor</label>
            <div className="wb-admin-swatches">
              {COLOR_SWATCHES.map((c) => (
                <button key={c} type="button"
                  className={"wb-admin-swatch" + (form.color === c ? " is-active" : "")}
                  style={{ background: c }} onClick={() => set("color", c)} aria-label={c} />
              ))}
              <input type="color" className="wb-admin-color" value={form.color}
                onChange={(e) => set("color", e.target.value)} title="Cor personalizada" />
            </div>
          </div>

          {/* Descriptions */}
          <div className="wb-field">
            <label className="wb-field__label">Área de atuação <span className="wb-field__opt">(tooltip)</span></label>
            <input className="wb-field__input" value={form.area}
              onChange={(e) => set("area", e.target.value)} placeholder="Margens, EBITDA, custo financeiro…" />
          </div>
          <div className="wb-field">
            <label className="wb-field__label">Exemplo de pergunta <span className="wb-field__opt">(tooltip)</span></label>
            <input className="wb-field__input" value={form.quote}
              onChange={(e) => set("quote", e.target.value)} placeholder="Como está nossa margem em SP?" />
          </div>

          {/* Behaviour grid */}
          <div className="wb-admin-grid">
            <div className="wb-field">
              <label className="wb-field__label">Modelo Claude</label>
              <select className="wb-field__input" value={form.model} onChange={(e) => set("model", e.target.value)}>
                {MODEL_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} — {o.note}</option>
                ))}
              </select>
            </div>
            <div className="wb-field">
              <label className="wb-field__label">Orçamento de raciocínio (tokens)</label>
              <input className="wb-field__input" type="number" min={1024} max={200000} step={1000}
                value={form.thinkingBudget} disabled={!form.thinkingEnabled}
                onChange={(e) => set("thinkingBudget", e.target.value)} />
            </div>
          </div>

          <div className="wb-field__row">
            <div className="wb-field__row-main">
              <span className="wb-field__label">Raciocínio estendido</span>
              <span className="wb-field__sub">Pensa antes de responder (mais qualidade, mais lento).</span>
            </div>
            <button type="button" className="wb-switch" data-on={form.thinkingEnabled ? "1" : "0"}
              role="switch" aria-checked={form.thinkingEnabled}
              onClick={() => set("thinkingEnabled", !form.thinkingEnabled)}><i /></button>
          </div>
          <div className="wb-field__row">
            <div className="wb-field__row-main">
              <span className="wb-field__label">Orquestrador</span>
              <span className="wb-field__sub">Pode acionar outros agentes (o "WaterBrain").</span>
            </div>
            <button type="button" className="wb-switch" data-on={form.isExecutive ? "1" : "0"}
              role="switch" aria-checked={form.isExecutive}
              onClick={() => set("isExecutive", !form.isExecutive)}><i /></button>
          </div>
          <div className="wb-field__row">
            <div className="wb-field__row-main">
              <span className="wb-field__label">Ativo</span>
              <span className="wb-field__sub">Aparece na lista de agentes do chat.</span>
            </div>
            <button type="button" className="wb-switch" data-on={form.enabled ? "1" : "0"}
              role="switch" aria-checked={form.enabled}
              onClick={() => set("enabled", !form.enabled)}><i /></button>
          </div>

          {/* System prompt */}
          <div className="wb-field">
            <label className="wb-field__label">System prompt (instruções do agente)</label>
            <textarea className="wb-field__input wb-admin-prompt" value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)} rows={12}
              placeholder="Descreva o papel, o domínio, o tom e as regras deste agente…" />
          </div>

          {err && <div className="wb-modal__status is-err">{err}</div>}
        </div>

        <div className="wb-modal__foot">
          {!isNew && (
            <button className="wb-modal__btn wb-modal__btn--danger" onClick={remove} disabled={saving}>
              Apagar
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="wb-modal__btn wb-modal__btn--ghost" onClick={onCancel}>Cancelar</button>
          <button className="wb-modal__btn wb-modal__btn--primary" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AGENT CARD
   ============================================================ */
function AgentCard({ agent, onEdit, onToggle }) {
  return (
    <div className={"wb-agent-card" + (agent.enabled === false ? " is-disabled" : "")}>
      <Mono persona={agent} size="md" />
      <div className="wb-agent-card__main">
        <div className="wb-agent-card__name">{agent.role}</div>
        <div className="wb-agent-card__badges">
          <span className="wb-badge">{modelShort(agent.model)}</span>
          <span className={"wb-badge" + (agent.thinkingEnabled !== false ? " wb-badge--on" : " wb-badge--off")}>
            {agent.thinkingEnabled !== false ? "Raciocínio on" : "Sem raciocínio"}
          </span>
          {agent.isExecutive && <span className="wb-badge wb-badge--accent">Orquestrador</span>}
          {agent.enabled === false && <span className="wb-badge wb-badge--muted">Inativo</span>}
        </div>
      </div>
      <div className="wb-agent-card__actions">
        <button type="button" className="wb-switch" data-on={agent.enabled !== false ? "1" : "0"}
          role="switch" aria-checked={agent.enabled !== false} title="Ativar/desativar"
          onClick={() => onToggle(agent)}><i /></button>
        <button className="wb-admin-btn" onClick={() => onEdit(agent)}>Editar</button>
      </div>
    </div>
  );
}

/* ============================================================
   AGENTS TAB
   ============================================================ */
function AgentsTab({ agents, onChanged }) {
  const [editing, setEditing] = useStateA(null); // agent | {new}
  const [creating, setCreating] = useStateA(false);

  async function toggle(agent) {
    try { await WBApi.updateAgent(agent.id, { enabled: agent.enabled === false }); onChanged(); }
    catch (e) {}
  }

  return (
    <div className="wb-admin-tab">
      <div className="wb-admin-tab__head">
        <div>
          <h2 className="wb-admin-tab__title">Agentes</h2>
          <p className="wb-admin-tab__sub">{agents.length} agente(s) · crie, edite e ajuste o comportamento de cada um.</p>
        </div>
        <button className="wb-modal__btn wb-modal__btn--primary" onClick={() => setCreating(true)}>＋ Novo agente</button>
      </div>

      <div className="wb-agent-list">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} onEdit={setEditing} onToggle={toggle} />
        ))}
      </div>

      {(editing || creating) && (
        <AgentEditor
          agent={creating ? null : editing}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); onChanged(); }}
          onDeleted={() => { setEditing(null); setCreating(false); onChanged(); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   USERS TAB (scaffold — visual only for now)
   ============================================================ */
const MOCK_USERS = [
  { name: "Murillo Gonçalves", email: "ti@grindustria.com.br", role: "Admin", initials: "Mg", color: "#FA981A" },
  { name: "Equipe Financeiro", email: "financeiro@grws.com.br", role: "Editor", initials: "Fi", color: "#5E83B8" },
  { name: "Equipe Comercial", email: "comercial@grws.com.br", role: "Leitor", initials: "Co", color: "#4FA060" },
];

function UsersTab() {
  return (
    <div className="wb-admin-tab">
      <div className="wb-admin-tab__head">
        <div>
          <h2 className="wb-admin-tab__title">Usuários</h2>
          <p className="wb-admin-tab__sub">Quem pode acessar o WaterBrain e com qual permissão.</p>
        </div>
        <button className="wb-modal__btn wb-modal__btn--primary" disabled title="Em breve">＋ Convidar usuário</button>
      </div>

      <div className="wb-admin-banner">
        🔒 Prévia — login com senha e papéis (Admin / Editor / Leitor) serão ativados em breve.
      </div>

      <div className="wb-user-table">
        <div className="wb-user-table__head">
          <span>Usuário</span><span>E-mail</span><span>Permissão</span><span></span>
        </div>
        {MOCK_USERS.map((u, i) => (
          <div className="wb-user-table__row" key={i}>
            <span className="wb-user-table__who">
              <span className="wb-mono wb-mono--sm" style={{ "--mono-accent": u.color }}>{u.initials}</span>
              {u.name}
            </span>
            <span className="wb-user-table__email">{u.email}</span>
            <span><span className={"wb-badge wb-badge--" + u.role.toLowerCase()}>{u.role}</span></span>
            <span className="wb-user-table__actions">
              <button className="wb-admin-btn" disabled>Editar</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   GERAL TAB — global settings (API key + valves)
   ============================================================ */
function GeralTab({ config, onConfigSaved }) {
  const [apiKey, setApiKey] = useStateA("");
  const [displayThinking, setDisplayThinking] = useStateA(!!(config && config.displayThinking));
  const [showCacheInfo, setShowCacheInfo] = useStateA(config ? config.showCacheInfo !== false : true);
  const [saving, setSaving] = useStateA(false);
  const [status, setStatus] = useStateA(null);
  const keySet = !!(config && config.keySet);

  async function save() {
    setSaving(true); setStatus(null);
    const payload = { display_thinking: displayThinking, show_cache_info: showCacheInfo };
    if (apiKey.trim()) payload.api_key = apiKey.trim();
    try {
      const next = await WBApi.saveConfig(payload);
      setApiKey(""); setStatus({ ok: true, msg: "Salvo." });
      if (onConfigSaved) onConfigSaved(next);
    } catch (e) { setStatus({ ok: false, msg: "Falha ao salvar." }); }
    finally { setSaving(false); }
  }

  return (
    <div className="wb-admin-tab">
      <div className="wb-admin-tab__head">
        <div>
          <h2 className="wb-admin-tab__title">Geral</h2>
          <p className="wb-admin-tab__sub">Chave da API e ajustes globais do WaterBrain.</p>
        </div>
      </div>

      <div className="wb-admin-card">
        <div className="wb-field">
          <label className="wb-field__label">Chave da API Anthropic</label>
          <input className="wb-field__input" type="password" autoComplete="off" spellCheck={false}
            placeholder={keySet ? "•••••••••••••• (já configurada — cole para trocar)" : "sk-ant-..."}
            value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <p className="wb-field__hint">
            {keySet
              ? <><span className="wb-field__ok">●</span> Uma chave já está salva no servidor.</>
              : <><span className="wb-field__warn">●</span> Nenhuma chave configurada.</>}
          </p>
        </div>

        <div className="wb-field__row">
          <div className="wb-field__row-main">
            <span className="wb-field__label">Mostrar raciocínio</span>
            <span className="wb-field__sub">Expõe o pensamento do modelo no chat (debug).</span>
          </div>
          <button type="button" className="wb-switch" data-on={displayThinking ? "1" : "0"}
            role="switch" aria-checked={displayThinking}
            onClick={() => setDisplayThinking((v) => !v)}><i /></button>
        </div>
        <div className="wb-field__row">
          <div className="wb-field__row-main">
            <span className="wb-field__label">Mostrar uso de cache</span>
            <span className="wb-field__sub">Anexa tokens e cache hit/miss ao fim da resposta.</span>
          </div>
          <button type="button" className="wb-switch" data-on={showCacheInfo ? "1" : "0"}
            role="switch" aria-checked={showCacheInfo}
            onClick={() => setShowCacheInfo((v) => !v)}><i /></button>
        </div>

        <div className="wb-modal__meta">
          <div className="wb-modal__meta-row"><span>Contexto</span><b>1M tokens</b></div>
          <div className="wb-modal__meta-row"><span>Cache</span><b>Agressivo (sempre on)</b></div>
        </div>

        {status && <div className={"wb-modal__status" + (status.ok ? " is-ok" : " is-err")}>{status.msg}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="wb-modal__btn wb-modal__btn--primary" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ADMIN SCREEN (full-screen overlay)
   ============================================================ */
const ADMIN_TABS = [
  { id: "agentes", label: "Agentes", icon: "▦" },
  { id: "usuarios", label: "Usuários", icon: "◍" },
  { id: "geral", label: "Geral", icon: "⚙" },
];

function AdminScreen({ agents, onClose, onChanged, config, onConfigSaved }) {
  const [tab, setTab] = useStateA("agentes");

  useEffectA(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="wb-admin">
      <div className="wb-admin__bar">
        <button className="wb-admin__back" onClick={onClose}>
          <span aria-hidden="true">←</span> Voltar ao chat
        </button>
        <h1 className="wb-admin__heading">Administração</h1>
        <div className="wb-admin__bar-right" />
      </div>

      <div className="wb-admin__body">
        <nav className="wb-admin__nav">
          {ADMIN_TABS.map((t) => (
            <button key={t.id}
              className={"wb-admin__nav-item" + (tab === t.id ? " is-active" : "")}
              onClick={() => setTab(t.id)}>
              <span className="wb-admin__nav-icon">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>

        <main className="wb-admin__content">
          {tab === "agentes" && <AgentsTab agents={agents} onChanged={onChanged} />}
          {tab === "usuarios" && <UsersTab />}
          {tab === "geral" && <GeralTab config={config} onConfigSaved={onConfigSaved} />}
        </main>
      </div>
    </div>
  );
}

window.AdminScreen = AdminScreen;
