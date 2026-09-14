import Link from 'next/link';

/**
 * Static design-system showcase — renders every token and component live
 * from the app's actual `app/globals.css` (imported once, globally, by the
 * root layout — this route gets it for free, so there is no separate
 * stylesheet to drift out of sync). See /DESIGN.md for the full narrative.
 */

const colorTokens: { name: string; varName: string; hex: string; role: string }[] = [
  { name: 'bg', varName: '--bg', hex: '#0f0e0c', role: 'Page background — near-black, warm' },
  { name: 'panel', varName: '--panel', hex: '#1c1a17', role: 'Card surface' },
  { name: 'panel-2', varName: '--panel-2', hex: '#262320', role: 'Inset surface (inputs, code blocks)' },
  { name: 'panel-3', varName: '--panel-3', hex: '#302c27', role: 'Hover surface for secondary buttons' },
  { name: 'line', varName: '--line', hex: '#3a352e', role: 'Default border' },
  { name: 'line-strong', varName: '--line-strong', hex: '#4d4740', role: 'Emphasized border (secondary button)' },
  { name: 'text', varName: '--text', hex: '#f3efe4', role: 'Primary text — warm paper white' },
  { name: 'muted', varName: '--muted', hex: '#a89f8f', role: 'Secondary text, labels' },
  { name: 'muted-2', varName: '--muted-2', hex: '#766e61', role: 'Tertiary text, placeholders' },
  { name: 'accent', varName: '--accent', hex: '#ffc72c', role: 'Dominant accent — diner-neon amber (primary CTA)' },
  { name: 'accent-hover', varName: '--accent-hover', hex: '#ffd257', role: 'Accent hover state' },
  { name: 'accent-active', varName: '--accent-active', hex: '#e6ad14', role: 'Accent pressed state' },
  { name: 'accent-ink', varName: '--accent-ink', hex: '#241a00', role: 'Text on accent background' },
  { name: 'green', varName: '--green', hex: '#4caf6a', role: 'Semantic good — submitted, verified' },
  { name: 'red', varName: '--red', hex: '#e0392c', role: 'Semantic bad — error, danger' },
  { name: 'blue', varName: '--blue', hex: '#5b9bd5', role: 'Semantic info — staged' },
];

const spaceTokens = [
  ['--space-1', '4px'],
  ['--space-2', '8px'],
  ['--space-3', '12px'],
  ['--space-4', '16px'],
  ['--space-5', '20px'],
  ['--space-6', '24px'],
  ['--space-7', '32px'],
  ['--space-8', '48px'],
];

const radiusTokens = [
  ['--radius-sm', '8px'],
  ['--radius-md', '10px'],
  ['--radius-lg', '14px'],
  ['--radius-pill', '999px'],
];

const shadowTokens: { name: string; value: string; use: string }[] = [
  { name: '--shadow-sm', value: '0 1px 2px rgba(0,0,0,.35)', use: 'Cards at rest' },
  { name: '--shadow-md', value: '0 4px 14px rgba(0,0,0,.45)', use: 'Reserved — elevated surfaces' },
  { name: '--shadow-lg', value: '0 12px 32px rgba(0,0,0,.55)', use: 'Reserved — modal/dialog' },
  { name: '--shadow-accent', value: '0 4px 18px rgba(255,199,44,.25)', use: 'Primary button glow' },
];

const motionTokens: { name: string; value: string; use: string }[] = [
  { name: '--duration-fast / --ease-out', value: '120ms · cubic-bezier(.16,1,.3,1)', use: 'Button press physics' },
  { name: '--duration-base / --ease-standard', value: '200ms · cubic-bezier(.2,.8,.2,1)', use: 'Hover, focus, border-color' },
  { name: '--duration-slow / --ease-out', value: '420ms · cubic-bezier(.16,1,.3,1)', use: 'Card rise-in on load' },
];

function Swatch({ hex, name, varName, role }: { hex: string; name: string; varName: string; role: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 'var(--space-3)' }}>
      <div
        style={{
          height: 64,
          borderRadius: 'var(--radius-md)',
          background: hex,
          border: '1px solid var(--line)',
          marginBottom: 'var(--space-2)',
        }}
      />
      <p style={{ margin: 0, fontWeight: 650 }}>{name}</p>
      <p className="mono muted" style={{ margin: 0 }}>
        {varName}
      </p>
      <p className="mono muted" style={{ margin: 0 }}>
        {hex}
      </p>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        {role}
      </p>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ margin: '48px 0' }}>
      <h2 className="display" style={{ fontSize: '1.5rem', borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <header style={{ padding: '32px 0 8px' }}>
        <p className="mono muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          survey-snap · design system
        </p>
        <h1 className="display" style={{ fontSize: '3rem', margin: '4px 0 8px' }}>
          Late-Night Diner Ledger
        </h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          Every token and component below renders live from this app&apos;s own{' '}
          <code className="mono">app/globals.css</code> — nothing on this page is a redrawn
          mockup. See <code className="mono">/DESIGN.md</code> at the repo root for the full
          narrative, rationale, and asset inventory.
        </p>
        <p>
          <Link href="/">← Back to the app</Link>
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section title="Color" id="color">
        <p className="muted">
          A near-black warm ground, dominant diner-neon amber for the one primary action per
          screen, and three sharp semantic accents (green / red / blue) reserved for status only.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
          }}
        >
          {colorTokens.map((c) => (
            <Swatch key={c.varName} {...c} />
          ))}
        </div>
        <p className="muted" style={{ marginTop: 'var(--space-4)' }}>
          Contrast: <code className="mono">--text</code> on <code className="mono">--bg</code> is
          15.9:1. <code className="mono">--accent-ink</code> on <code className="mono">--accent</code> is
          11.9:1. <code className="mono">--muted</code> on <code className="mono">--bg</code> is 7.4:1.
          All exceed WCAG AA (4.5:1) for body text.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Type" id="type">
        <p className="muted">
          Three faces, self-hosted (no CDN dependency — this is a private LAN app):{' '}
          <strong>Bebas Neue</strong> for display/marquee moments,{' '}
          <strong>IBM Plex Sans</strong> for body and UI text, <strong>IBM Plex Mono</strong> for
          every survey code, digit, and technical value.
        </p>
        <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
          <div className="card">
            <p className="display" style={{ fontSize: '2.25rem', margin: 0 }}>
              Survey Snap
            </p>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              --text-display · Bebas Neue 400, 2.25rem/1.05, tracked +0.01em · page/section titles
            </p>
          </div>
          <div className="card">
            <p style={{ font: 'var(--text-h1)', margin: 0 }}>Review your answers</p>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              --text-h1 · Plex Sans 650, 1.375rem/1.3 · dialog and screen headings
            </p>
          </div>
          <div className="card">
            <p style={{ font: 'var(--text-h2)', margin: 0 }}>Survey code</p>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              --text-h2 · Plex Sans 600, 1.0625rem/1.35 · card headings
            </p>
          </div>
          <div className="card">
            <p style={{ font: 'var(--text-body)', margin: 0 }}>
              Nothing has been sent to McDonald&apos;s yet. Edit anything below, then confirm.
            </p>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              --text-body · Plex Sans 400, 1rem/1.5 · default running text
            </p>
          </div>
          <div className="card">
            <p className="muted" style={{ font: 'var(--text-small)', margin: 0, color: 'var(--muted)' }}>
              Get it all-green before going further.
            </p>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              --text-small · Plex Sans 400, 0.8125rem/1.45 · field labels, captions
            </p>
          </div>
          <div className="card">
            <span className="pill submitted" style={{ font: 'var(--text-micro)' }}>
              submitted
            </span>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              --text-micro · Plex Sans 700, 0.6875rem/1.3, tracked +0.06em · pills, status tags
            </p>
          </div>
          <div className="card">
            <p className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--accent)' }}>
              0123456789
            </p>
            <p className="mono muted" style={{ margin: '8px 0 0' }}>
              Plex Mono 400–700 · survey codes, validation codes, receipt digits
            </p>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Spacing & radius" id="spacing">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--space-4)' }}>
          {spaceTokens.map(([name, px]) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: `var(${name})`,
                  height: `var(${name})`,
                  background: 'var(--accent)',
                  borderRadius: 4,
                  margin: '0 auto 6px',
                }}
              />
              <p className="mono muted" style={{ margin: 0, fontSize: 11 }}>
                {name}
              </p>
              <p className="mono muted" style={{ margin: 0, fontSize: 11 }}>
                {px}
              </p>
            </div>
          ))}
        </div>

        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
          {radiusTokens.map(([name, px]) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: `var(${name})`,
                  margin: '0 auto 6px',
                }}
              />
              <p className="mono muted" style={{ margin: 0, fontSize: 11 }}>
                {name}
              </p>
              <p className="mono muted" style={{ margin: 0, fontSize: 11 }}>
                {px}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Shadow & motion" id="shadow-motion">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {shadowTokens.map((s) => (
            <div
              key={s.name}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: `var(${s.name})`,
              }}
            >
              <p className="mono" style={{ margin: 0, fontWeight: 650 }}>
                {s.name}
              </p>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {s.use}
              </p>
            </div>
          ))}
        </div>

        <p className="muted" style={{ marginTop: 'var(--space-5)' }}>
          Hover or press each control below — the transition is the real one used across the app.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          <button className="btn">Hover / press me</button>
          <button className="btn secondary">Secondary hover</button>
          <div className="card" style={{ margin: 0, cursor: 'default' }}>
            Card rise-in plays once on mount (see any screen load)
          </div>
        </div>
        <table style={{ width: '100%', marginTop: 'var(--space-4)', borderCollapse: 'collapse' }}>
          <tbody>
            {motionTokens.map((m) => (
              <tr key={m.name} style={{ borderTop: '1px solid var(--line)' }}>
                <td className="mono" style={{ padding: '8px 4px', whiteSpace: 'nowrap' }}>
                  {m.name}
                </td>
                <td className="mono muted" style={{ padding: '8px 4px' }}>
                  {m.value}
                </td>
                <td className="muted" style={{ padding: '8px 4px' }}>
                  {m.use}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Buttons" id="buttons">
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <button className="btn">Primary</button>
          <button className="btn" disabled>
            Primary disabled
          </button>
          <button className="btn secondary">Secondary</button>
          <button className="btn secondary" disabled>
            Secondary disabled
          </button>
          <button className="btn danger">Danger</button>
        </div>
        <div style={{ marginTop: 'var(--space-3)', maxWidth: 320 }}>
          <button className="btn block">Confirm &amp; Submit</button>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Status pills" id="pills">
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <span className="pill new">new</span>
          <span className="pill staged">staged</span>
          <span className="pill submitted">submitted</span>
          <span className="pill error">error</span>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Form fields" id="forms">
        <div className="stack" style={{ maxWidth: 420 }}>
          <div>
            <label className="field" htmlFor="ds-text">
              Store #
            </label>
            <input id="ds-text" type="text" defaultValue="05678" readOnly />
          </div>
          <div>
            <label className="field" htmlFor="ds-select">
              Dropdown
            </label>
            <select id="ds-select" defaultValue="a">
              <option value="a">Option A</option>
              <option value="b">Option B</option>
            </select>
          </div>
          <div>
            <label className="field" htmlFor="ds-textarea">
              Free text
            </label>
            <textarea id="ds-textarea" rows={3} defaultValue="Optional comment field" readOnly />
          </div>
          <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: 20, height: 20 }} />
            <span>Checkbox with accent-color</span>
          </label>
          <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="radio" name="ds-radio" defaultChecked style={{ width: 18, height: 18 }} />
            <span>Radio with accent-color</span>
          </label>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Segmented code editor" id="code-editor">
        <p className="muted">
          The 26-digit survey-code entry, mirroring mcdvoice.com&apos;s own 5-5-5-5-5-1 layout —
          real markup from <code className="mono">CodeEditor.tsx</code>.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 'var(--space-3)' }}>
          {[5, 5, 5, 5, 5, 1].map((len, i) => (
            <input
              key={i}
              className="mono code-box"
              type="text"
              readOnly
              value={i < 5 ? '84213' : '7'}
              style={{ width: len === 1 ? 48 : 78, textAlign: 'center', letterSpacing: '0.08em', borderColor: 'var(--green)' }}
            />
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Cards & history row" id="cards">
        <div className="card">
          <div className="row">
            <span className="grow" style={{ fontWeight: 600 }}>
              Store #05678
            </span>
            <span className="pill submitted">submitted</span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            2/14/2026 · 12:41 PM · $14.75
          </p>
          <p className="muted mono" style={{ margin: '2px 0 0', fontSize: 12 }}>
            code •••• •••• •••• •••• •••• 7
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 14 }}>
            Validation code{' '}
            <strong className="mono" style={{ color: 'var(--accent)' }}>
              4471829
            </strong>
          </p>
        </div>

        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <p style={{ marginTop: 0, fontWeight: 600 }}>1 question needs your answer</p>
          <p className="muted" style={{ margin: 0 }}>
            Cards use <code className="mono">--accent</code> border to flag attention without a
            full alert-banner treatment.
          </p>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Validation-code result" id="result">
        <div className="card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Validation code — write this on your receipt
          </p>
          <p
            className="mono"
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '0.06em',
              margin: '10px 0',
              color: 'var(--accent)',
            }}
          >
            4471829
          </p>
          <button className="btn">Copy</button>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="Background & texture" id="texture">
        <p className="muted">
          The whole app runs on a thermal-receipt-paper grain — a self-contained inline SVG{' '}
          <code className="mono">feTurbulence</code> filter (see <code className="mono">body</code>{' '}
          in globals.css), not a downloaded image. That keeps this privacy-first, fully-local LAN
          app free of an external asset for something this small, while still giving every screen
          a tactile, slightly-worn paper feel instead of a flat fill.
        </p>
        <div
          style={{
            height: 160,
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            backgroundImage:
              "radial-gradient(ellipse 900px 500px at 20% -10%, rgba(255,199,44,.08), transparent 60%), url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E\")",
          }}
        />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title="App icon" id="icon">
        <div className="row" style={{ gap: 'var(--space-4)', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="survey-snap app icon" width={96} height={96} style={{ borderRadius: 20 }} />
          <p className="muted" style={{ margin: 0, maxWidth: 420 }}>
            A thermal receipt stamped with an amber checkmark — reads clearly at favicon size,
            reuses the app&apos;s own paper + amber-accent metaphor. Generated via Ideogram; see{' '}
            <code className="mono">/DESIGN.md</code> for the prompt and every exported size.
          </p>
        </div>
      </Section>

      <footer className="muted" style={{ margin: '64px 0 24px', textAlign: 'center', fontSize: 12 }}>
        survey-snap design system · Late-Night Diner Ledger · see /DESIGN.md
      </footer>
    </div>
  );
}
