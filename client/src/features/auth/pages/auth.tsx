import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '@/features/auth/components/card';

type AuthMode = 'login' | 'register';

export const AuthPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialMode = useMemo<AuthMode>(() => {
    const mode = searchParams.get('mode');
    return mode === 'register' ? 'register' : 'login';
  }, [searchParams]);

  return (
    <div className="auth-page">
      <div className="auth-top">
        <Link to="/" className="auth-back">← Back</Link>
        <Link to="/" className="auth-logo">Daometer</Link>
      </div>
      <AuthCard initialMode={initialMode} onAuthenticated={() => navigate('/dashboard')} />
    </div>
  );
};
