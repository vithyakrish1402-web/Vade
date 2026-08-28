import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiClientError } from '../services/api';
import { VadeButton } from '../components/vade/VadeButton';
import { VadeField } from '../components/vade/VadeField';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/app';

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your username or email and your password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await login({ identifier: identifier.trim(), password });
      navigate(from, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'That username or password did not work.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-[34px] px-[30px] pb-10 animate-fade">
      <div>
        <h1 className="text-title-lg font-bold">Vade</h1>
        <p className="mt-2.5 text-base leading-normal text-muted">
          Private messaging,
          <br />
          redesigned.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <VadeField
          type="text"
          autoComplete="username"
          placeholder="Username or email"
          aria-label="Username or email"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          disabled={isLoading}
          required
        />
        <VadeField
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error}
          disabled={isLoading}
          required
        />
        <VadeButton type="submit" block isLoading={isLoading} className="mt-1.5">
          Continue
        </VadeButton>
      </form>

      <button
        type="button"
        onClick={() => navigate('/register')}
        className="cursor-pointer self-center text-[14.5px] font-bold text-accent-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Create account
      </button>
    </div>
  );
};
