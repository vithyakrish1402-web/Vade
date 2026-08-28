import React from 'react';
import { ChevronLeft, MessageCircle, Search, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

/** A circle carrying the first letter of the display name. No photos anywhere in Vade. */
export const Avatar: React.FC<AvatarProps> = ({ name, size = 44, className = '' }) => (
  <div
    style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    className={`flex shrink-0 items-center justify-center rounded-full bg-surface font-bold text-text ${className}`}
    aria-hidden="true"
  >
    {name.trim().charAt(0).toUpperCase() || '?'}
  </div>
);

interface BackHeaderProps {
  onBack: () => void;
  title?: React.ReactNode;
  backLabel?: string;
  children?: React.ReactNode;
  className?: string;
}

/** The compact header used by pushed screens: back chevron, title, optional trailing actions. */
export const BackHeader: React.FC<BackHeaderProps> = ({
  onBack,
  title,
  backLabel = 'Back',
  children,
  className = '',
}) => (
  <div className={`flex shrink-0 items-center gap-2.5 px-4 pb-2.5 pt-1.5 ${className}`}>
    <button
      type="button"
      onClick={onBack}
      aria-label={backLabel}
      className="flex h-11 w-11 shrink-0 -ml-1.5 cursor-pointer items-center justify-center rounded-full text-text hover:bg-surface focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ChevronLeft width={20} height={20} strokeWidth={2.75} aria-hidden="true" />
    </button>
    {typeof title === 'string' ? (
      <span className="text-name font-bold">{title}</span>
    ) : (
      title
    )}
    {children}
  </div>
);

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, action, className = '' }) => (
  <div className={`flex flex-col items-center gap-3.5 px-11 text-center ${className}`}>
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-faint">
      {icon}
    </div>
    <div>
      <div className="text-[17px] font-bold tracking-[-0.016em]">{title}</div>
      <p className="mt-1.5 text-sm leading-normal text-muted">{body}</p>
    </div>
    {action}
  </div>
);

const NAV_ITEMS = [
  { to: '/app', label: 'Messages', Icon: MessageCircle, end: true },
  { to: '/app/search', label: 'Search', Icon: Search, end: false },
  { to: '/app/profile', label: 'Profile', Icon: User, end: false },
];

/**
 * The three roots. An 82px bar with a 4px active dot — the icon plus the dot, and an
 * accessible name on every item, so the state never rests on colour alone.
 */
export const BottomNav: React.FC = () => (
  <nav
    aria-label="Primary"
    className="absolute inset-x-0 bottom-0 z-30 flex h-[82px] items-start border-t border-line bg-bg px-[34px] pt-2.5 lg:hidden"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    {NAV_ITEMS.map(({ to, label, Icon, end }) => (
      <NavLink
        key={to}
        to={to}
        end={end}
        className="flex flex-1 cursor-pointer flex-col items-center gap-[5px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {({ isActive }) => (
          <>
            <Icon
              width={22}
              height={22}
              strokeWidth={2.75}
              className={isActive ? 'text-text' : 'text-faint'}
              aria-hidden="true"
            />
            <span className="sr-only">{label}</span>
            <span
              className="h-1 w-1 rounded-full"
              style={{ background: isActive ? 'var(--v-accent)' : 'transparent' }}
              aria-hidden="true"
            />
          </>
        )}
      </NavLink>
    ))}
  </nav>
);
