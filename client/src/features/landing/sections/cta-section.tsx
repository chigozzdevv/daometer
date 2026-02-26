type CtaSectionProps = {
  onGetStarted: () => void;
};

export const CtaSection = ({ onGetStarted }: CtaSectionProps): JSX.Element => (
  <section className="cta-section">
    <h2>Ready to run governance without manual guesswork?</h2>
    <button type="button" className="primary-button" onClick={onGetStarted}>
      Get started →
    </button>
  </section>
);
