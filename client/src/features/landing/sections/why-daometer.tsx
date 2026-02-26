const reasons = [
  {
    num: '01',
    title: 'Governance doesn\'t stop at the vote.',
    body: 'A passed proposal still needs execution, timing, holds, and follow-up. Daometer handles what comes after the vote.',
  },
  {
    num: '02',
    title: 'Built specifically for Realms.',
    body: 'Tight integration with Realms proposal states, execution queues, and treasury actions — not retrofitted from a generic tool.',
  },
  {
    num: '03',
    title: 'Audit-ready by default.',
    body: 'Every workflow event is logged. Approval gates, retry policies, and state transitions are all traceable.',
  },
];

export const WhyDaometerSection = (): JSX.Element => (
  <section id="why-daometer" className="landing-section">
    <div className="why-header">
      <p className="section-kicker">Why Daometer</p>
      <h2>The vote is just the beginning.</h2>
    </div>

    <div className="why-grid">
      {reasons.map((reason) => (
        <div key={reason.num} className="why-card">
          <span className="why-num">{reason.num}</span>
          <h3 className="why-title">{reason.title}</h3>
          <p className="why-body">{reason.body}</p>
        </div>
      ))}
    </div>
  </section>
);
