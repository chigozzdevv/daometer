const steps = [
  {
    num: '01',
    title: 'Describe your workflow.',
    body: 'Set the conditions, timing windows, and execution logic for your governance action. No scripting, no custom infrastructure.',
  },
  {
    num: '02',
    title: 'Publish on-chain.',
    body: 'Daometer compiles your workflow into structured proposal instructions and submits them directly to Realms.',
  },
  {
    num: '03',
    title: 'Let the engine run.',
    body: 'From quorum detection to post-vote execution, every state transition is handled automatically — with retries, holds, and a full audit trail.',
  },
];

export const HowItWorksSection = (): JSX.Element => (
  <section id="how-it-works" className="landing-section">
    <div className="hiw-header">
      <p className="section-kicker">How it works</p>
      <h2>Three steps. Zero babysitting.</h2>
    </div>

    <div className="hiw-steps">
      {steps.map((step) => (
        <div key={step.num} className="hiw-step">
          <span className="hiw-num">{step.num}</span>
          <h3 className="hiw-title">{step.title}</h3>
          <p className="hiw-body">{step.body}</p>
        </div>
      ))}
    </div>
  </section>
);
