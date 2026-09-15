import { useEffect, useMemo, useState } from 'react';
import { tokenStore, UNAUTHORIZED_EVENT } from './api/client.ts';
import { FetchNowButton } from './components/FetchNowButton.tsx';
import { HeaderCounters } from './components/HeaderCounters.tsx';
import { HotkeysHelp } from './components/HotkeysHelp.tsx';
import { useHotkeys } from './hooks/useHotkeys.ts';
import { TokenGate } from './components/TokenGate.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { navigate, useRoute } from './router.ts';

const NAV = [
  { hash: '#/', label: 'Jobs', name: 'jobs' },
  { hash: '#/filtered', label: 'Filtered', name: 'filtered' },
  { hash: '#/stats', label: 'Stats', name: 'stats' },
  { hash: '#/settings', label: 'Settings', name: 'settings' },
] as const;

export function App() {
  const route = useRoute();
  const [hasToken, setHasToken] = useState(() => tokenStore.get() !== null);
  const [helpOpen, setHelpOpen] = useState(false);

  const hotkeys = useMemo(
    () => [
      { key: '?', description: 'help', action: () => setHelpOpen((open) => !open) },
      ...NAV.map((item, index) => ({
        key: String(index + 1),
        description: item.label,
        action: () => navigate(item.hash),
      })),
    ],
    [],
  );
  useHotkeys(hotkeys, hasToken);
  useHotkeys(
    useMemo(
      () => [{ key: 'Escape', description: 'close help', action: () => setHelpOpen(false) }],
      [],
    ),
    helpOpen,
  );

  useEffect(() => {
    const onUnauthorized = () => setHasToken(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!hasToken) return <TokenGate onSubmit={() => setHasToken(true)} />;

  return (
    <div className="app">
      <nav className="app__nav nav">
        <span className="nav__brand">bench-press</span>
        {NAV.map((item) => (
          <a
            key={item.name}
            href={item.hash}
            className={`nav__link ${route.name === item.name ? 'nav__link--active' : ''}`}
          >
            {item.label}
          </a>
        ))}
        <span className="nav__spacer" />
        <HeaderCounters />
        <FetchNowButton />
        <button
          type="button"
          className="btn btn--ghost btn--small"
          title="Keyboard shortcuts (?)"
          onClick={() => setHelpOpen((open) => !open)}
        >
          ?
        </button>
      </nav>
      <HotkeysHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <main className="app__main">
        {route.name === 'jobs' && <JobsPage key="jobs" mode="jobs" selectedId={route.jobId} />}
        {route.name === 'filtered' && (
          <JobsPage key="filtered" mode="filtered" selectedId={route.jobId} />
        )}
        {route.name === 'stats' && <StatsPage />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
