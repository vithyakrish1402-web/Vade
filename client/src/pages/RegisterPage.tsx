import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiClientError } from '../services/api';
import { VadeButton } from '../components/vade/VadeButton';
import { VadeField } from '../components/vade/VadeField';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Registering signs the user in, which would otherwise bounce them straight to the app.
  // Enrollment is part of sign-up, so the redirect is suppressed once we own the handoff.
  const isHandingOffRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !isHandingOffRef.current) navigate('/app', { replace: true });
  }, [isAuthenticated, navigate]);

  const validate = (): string | null => {
    if (!username.trim() || !email.trim() || !password) return 'Fill in every field.';
    if (username.trim().length < 3) return 'Usernames are at least 3 characters.';
    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim()))
      return 'Usernames use letters, numbers, hyphens and underscores.';
    if (password.length < 8) return 'Passwords are at least 8 characters.';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);
    isHandingOffRef.current = true;

    try {
      await register({
        username: username.trim(),
        displayName: displayName.trim() || undefined,
        email: email.trim(),
        password,
      });
      // Straight into gesture enrollment — an account without a reveal gesture cannot read
      // its own messages, so this is part of sign-up rather than a setting to find later.
      navigate('/enroll', { replace: true });
    } catch (caught) {
      isHandingOffRef.current = false;
      setError(
        caught instanceof ApiClientError ? caught.message : 'Could not create the account. Try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-[30px] animate-fade">
      <div className="pt-1.5">
        <button
          type="button"
          onClick={() => navigate('/login')}
          aria-label="Back to sign in"
          className="-ml-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-text hover:bg-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft width={20} height={20} strokeWidth={2.75} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-[30px] pb-10">
        <div>
          <h1 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em]">Create account</h1>
          <p className="mt-2.5 text-[15px] leading-normal text-muted">
            Your keys are generated on this device and never leave it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <VadeField
            type="text"
            autoComplete="name"
            placeholder="Display name"
            aria-label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={isLoading}
          />
          <VadeField
            type="text"
            autoComplete="username"
            placeholder="Username"
            aria-label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isLoading}
            required
          />
          <VadeField
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
            required
          />
          <VadeField
            type="password"
            autoComplete="new-password"
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error}
            helperText={error ? undefined : 'At least 8 characters.'}
            disabled={isLoading}
            required
          />
          <VadeButton type="submit" block isLoading={isLoading} className="mt-1.5">
            Create account
          </VadeButton>
        </form>
      </div>
    </div>
  );
};
