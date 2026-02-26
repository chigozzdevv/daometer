const steps = [
  {
    title: 'Define flows',
    description: 'Compose proposal and automation blocks with clear risk checks and execution conditions.',
  },
  {
    title: 'Publish with confidence',
    description: 'Compile to instructions, validate support, and publish proposals with optional onchain creation.',
  },
  {
    title: 'Automate execution',
    description: 'Worker and workflow engine handle timing windows, notifications, retries, and manual gates.',
  },
];

export const HowItWorksSection = (): JSX.Element => (
  <section id="how-it-works" className="landing-section">
    <p className="section-kicker">How it works</p>
    <h2>From flow design to execution, connected.</h2>

    <div className="step-grid">
      {steps.map((step, index) => (
        <article key={step.title} className="step-card">
          <p className="step-index">0{index + 1}</p>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </article>
      ))}
    </div>
  </section>
);
