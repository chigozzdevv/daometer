import { type FormEvent, useMemo, useState } from 'react';
import { loginRequest, registerRequest } from '@/features/auth/api/auth-api';
import { useAuth } from '@/app/providers/auth-provider';

type AuthMode = 'login' | 'register';

type AuthCardProps = {
  initialMode: AuthMode;
  onAuthenticated: () => void;
};

export const AuthCard = ({ initialMode, onAuthenticated }: AuthCardProps): JSX.Element => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { signIn } = useAuth();

  const title = useMemo(() => (mode === 'login' ? 'Welcome back' : 'Create your workspace account'), [mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response =
        mode === 'login'
          ? await loginRequest({ email, password })
          : await registerRequest({ fullName, email, password });

      signIn({ accessToken: response.accessToken, refreshToken: response.refreshToken });
      onAuthenticated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to authenticate');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <article className="auth-card">
      <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
        <button
          type="button"
          className={`tab-button${mode === 'login' ? ' tab-button-active' : ''}`}
          onClick={() => setMode('login')}
        >
          Login
        </button>
        <button
          type="button"
          className={`tab-button${mode === 'register' ? ' tab-button-active' : ''}`}
          onClick={() => setMode('register')}
        >
          Register
        </button>
      </div>

      <h1>{title}</h1>
      <p>Connect to Daometer to manage flows, notifications, and execution automation.</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === 'register' ? (
          <label className="input-label">
            Full name
            <input
              className="text-input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              required
            />
          </label>
        ) : null}

        <label className="input-label">
          Email
          <input
            className="text-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="input-label">
          Password
          <input
            className="text-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </article>
  );
};
