type HeroSectionProps = {
  onGetStarted: () => void;
  onRunDemo: () => void;
};

export const HeroSection = ({ onGetStarted, onRunDemo }: HeroSectionProps): JSX.Element => (
  <section className="hero-section">
    <div className="hero-top-row">
      <span className="hero-tag">DAO Automation · Built for Realms</span>
    </div>

    <div className="hero-body">
      <div className="hero-text">
        <h1>Ship governance workflows without the manual overhead.</h1>
        <p>
          Monitor proposal states, orchestrate execution jobs, and automate reminders so
          governance runs consistently end to end.
        </p>
        <div className="hero-cta-row">
          <button type="button" className="primary-button" onClick={onGetStarted}>
            Get started
          </button>
          <button type="button" className="secondary-button" onClick={onRunDemo}>
            See how it works →
          </button>
        </div>
      </div>

      <div className="hero-widget" aria-hidden="true">
        <div className="hero-widget-bar">
          <span className="hero-widget-dot hero-widget-dot--yellow" />
          <span className="hero-widget-dot hero-widget-dot--pink" />
          <span className="hero-widget-dot hero-widget-dot--green" />
          <span className="hero-widget-title">daometer / treasury-transfer</span>
        </div>

        <div className="hero-widget-row">
          <span className="hero-widget-status hero-widget-status--done">PASSED</span>
          <span className="hero-widget-name">Proposal #42 · Quorum reached</span>
        </div>
        <div className="hero-widget-row">
          <span className="hero-widget-status hero-widget-status--done">✓ CHECKED</span>
          <span className="hero-widget-name">Timelock window cleared</span>
        </div>
        <div className="hero-widget-row hero-widget-row--active">
          <span className="hero-widget-status hero-widget-status--running">● RUNNING</span>
          <span className="hero-widget-name">Executing treasury transfer</span>
        </div>
        <div className="hero-widget-row hero-widget-row--muted">
          <span className="hero-widget-status hero-widget-status--queued">QUEUED</span>
          <span className="hero-widget-name">Post-execution notification</span>
        </div>
        <div className="hero-widget-footer">
          <span>2 of 4 steps complete</span>
          <span className="hero-widget-progress-bar">
            <span className="hero-widget-progress-fill" style={{ width: '50%' }} />
          </span>
        </div>
      </div>
    </div>
  </section>
);
