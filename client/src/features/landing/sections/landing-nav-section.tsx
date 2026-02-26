import { Link } from 'react-router-dom';

type LandingNavSectionProps = {
  onGetStarted: () => void;
};

export const LandingNavSection = ({ onGetStarted }: LandingNavSectionProps): JSX.Element => (
  <header className="landing-nav">
    <Link to="/" className="landing-logo">Daometer</Link>

    <nav className="landing-nav-links" aria-label="Landing navigation">
      <a href="#about">About</a>
      <a href="#how-it-works">How it works</a>
      <a href="#why-daometer">Why Daometer</a>
    </nav>

    <button type="button" className="primary-button" onClick={onGetStarted}>
      Get started
    </button>
  </header>
);
