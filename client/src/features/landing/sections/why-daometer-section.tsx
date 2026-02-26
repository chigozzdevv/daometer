const bullets = [
  'Realms-focused automation, not a generic no-code wrapper',
  'Built-in proposal state timing triggers and execution queue integration',
  'Manual approval gates, retry policy, and audit-friendly workflow events',
];

export const WhyDaometerSection = (): JSX.Element => (
  <section id="why-daometer" className="landing-section">
    <p className="section-kicker">Why use Daometer</p>
    <h2>Operational guardrails for DAO treasury actions.</h2>

    <ul className="bullet-list">
      {bullets.map((bullet) => (
        <li key={bullet}>{bullet}</li>
      ))}
    </ul>
  </section>
);
