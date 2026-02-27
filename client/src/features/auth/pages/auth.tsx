import { Link, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/features/auth/components/card';

export const AuthPage = (): JSX.Element => {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <div className="auth-top">
        <Link to="/" className="auth-back">← Back</Link>
        <Link to="/" className="auth-logo">Daometer</Link>
      </div>
      <AuthCard onAuthenticated={() => navigate('/dashboard')} />
    </div>
  );
};
