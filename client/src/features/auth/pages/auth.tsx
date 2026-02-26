import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
      <AuthCard initialMode={initialMode} onAuthenticated={() => navigate('/dashboard')} />
    </div>
  );
};
