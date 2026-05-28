/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle,
   PERSONAS, CONVERSATIONS, Orb, Header, Hero, PersonaCard, ConversationCard, Footer */

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "showContinue": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [time, setTime] = useState(new Date());

  // Update time once per minute (keeps greeting + clock dynamic)
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Apply theme via data-attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
  }, [t.theme]);

  return (
    <div className="wb-app">
      <Header time={time} statusCount={PERSONAS.length} />

      <main className="wb-main">
        <Hero time={time} showSearch={true} />

        {/* === Personas Grid === */}
        <section className="wb-personas-section">
          <div className="wb-section-head">
            <div className="wb-section-head__left">
              <span className="wb-section-eyebrow">Time virtual</span>
              <h2 className="wb-section-title">
                Escolha um <b>especialista</b>
              </h2>
            </div>
            <div className="wb-section-head__count">
              <span className="wb-status-pill__dot" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--wb-online)", marginRight: 2 }}></span>
              <span><b>5 / 5</b> disponíveis · atualizados às 14:08</span>
            </div>
          </div>

          <div className="wb-personas">
            {PERSONAS.map((p) => (
              <PersonaCard key={p.id} persona={p} />
            ))}
          </div>
        </section>

        {/* === Continue de onde parou === */}
        {t.showContinue && (
          <section className="wb-continue">
            <div className="wb-section-head">
              <div className="wb-section-head__left">
                <span className="wb-section-eyebrow">Histórico</span>
                <h2 className="wb-section-title">
                  Continue de onde <b>parou</b>
                </h2>
              </div>
              <a href="#" style={{
                fontFamily: "var(--grws-font-display)",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "var(--wb-text-muted)",
                textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                Ver tudo
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8m-3-3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>

            <div className="wb-conv-rail">
              {CONVERSATIONS.map((c, i) => (
                <ConversationCard key={i} conv={c} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />

      {/* === Tweaks panel === */}
      <TweaksPanel>
        <TweakSection label="Tema" />
        <TweakRadio
          label="Tema"
          value={t.theme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
            { value: "hybrid", label: "Híbrido" },
          ]}
          onChange={(v) => setTweak("theme", v)}
        />

        <TweakSection label="Seções" />
        <TweakToggle
          label="Continue de onde parou"
          value={t.showContinue}
          onChange={(v) => setTweak("showContinue", v)}
        />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
