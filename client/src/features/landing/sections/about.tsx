const comparison = [
  { before: 'Manually track proposal states', after: 'Automated state monitoring' },
  { before: 'Custom scripts for execution', after: 'Visual workflow builder' },
  { before: 'No retry or hold logic', after: 'Built-in retries, holds & gates' },
  { before: 'Missed post-vote follow-ups', after: 'Chained jobs run automatically' },
];

export const AboutSection = (): JSX.Element => (
  <section id="about" className="about-section landing-section">
    <div className="about-left">
      <p className="section-kicker">About</p>
      <h2>An operational layer for your DAO.</h2>
      <p className="about-body">
        Most DAO tooling stops at proposal visibility. Daometer gives governance operators
        the execution engine to handle the full proposal lifecycle — predictably,
        without manual babysitting.
      </p>
    </div>

    <div className="about-compare">
      <div className="compare-header">
        <span className="compare-col-label compare-col-label--before">Without Daometer</span>
        <span className="compare-col-label compare-col-label--after">With Daometer</span>
      </div>
      {comparison.map((row) => (
        <div key={row.before} className="compare-row">
          <span className="compare-before">✕ {row.before}</span>
          <span className="compare-after">✓ {row.after}</span>
        </div>
      ))}
    </div>
  </section>
);
