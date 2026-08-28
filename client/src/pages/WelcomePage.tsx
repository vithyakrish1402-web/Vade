import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, Lock, Spline } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { VadeButton } from '../components/vade/VadeButton';

const POINTS = [
  {
    Icon: Lock,
    title: 'Protected by default',
    body: 'Nothing readable sits on your screen until you ask for it.',
  },
  {
    Icon: Spline,
    title: 'Revealed by gesture',
    body: 'A shape only you know, drawn on the message itself.',
  },
  {
    Icon: KeyRound,
    title: 'Keys stay on device',
    body: 'Generated here, never uploaded, verifiable in person.',
  },
];

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-9 px-[30px] pb-8 animate-fade">
      <div>
        <h1 className="text-title-lg font-bold">Vade</h1>
        <p className="mt-3 text-[17px] leading-normal text-muted">
          Messages nobody can read
          <br />
          over your shoulder.
        </p>
      </div>

      <div className="flex flex-col gap-gutter">
        {POINTS.map(({ Icon, title, body }) => (
          <div key={title} className="flex items-start gap-row">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-surface text-accent-ink">
              <Icon width={16} height={16} strokeWidth={2.75} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-name font-bold">{title}</span>
              <span className="mt-0.5 block text-[13.5px] leading-normal text-muted">{body}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <VadeButton block onClick={() => navigate('/register')}>
          Get started
        </VadeButton>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="cursor-pointer self-center p-1.5 text-[14.5px] text-muted hover:text-text focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          I already have an account
        </button>
      </div>
    </div>
  );
};
