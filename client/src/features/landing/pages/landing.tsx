import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/auth-provider';
import { AboutSection } from '@/features/landing/sections/about';
import { ActionCardsSection } from '@/features/landing/sections/action-cards';
import { CtaSection } from '@/features/landing/sections/cta';
import { HeroSection } from '@/features/landing/sections/hero';
import { HowItWorksSection } from '@/features/landing/sections/how-it-works';
import { LandingNavSection } from '@/features/landing/sections/nav';
import { MinimalFooter } from '@/features/landing/sections/footer';
import { WhyDaometerSection } from '@/features/landing/sections/why-daometer';

export const LandingPage = (): JSX.Element => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleGetStarted = (): void => {
    navigate(isAuthenticated ? '/dashboard' : '/auth');
  };

  const handleRunDemo = (): void => {
    if (isAuthenticated) {
      navigate('/dashboard/flows');
      return;
    }
    const section = document.getElementById('how-it-works');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="landing-page">
      <LandingNavSection onGetStarted={handleGetStarted} />
      <HeroSection onGetStarted={handleGetStarted} onRunDemo={handleRunDemo} />
      <ActionCardsSection />
      <AboutSection />
      <HowItWorksSection />
      <WhyDaometerSection />
      <CtaSection onGetStarted={handleGetStarted} />
      <MinimalFooter />
    </div>
  );
};
