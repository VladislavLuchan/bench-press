import { useEffect, useState } from 'react';
import { tokenStore, UNAUTHORIZED_EVENT } from './api/client.ts';
import { TokenGate } from './components/TokenGate.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { useRoute } from './router.ts';

const NAV = [
  { hash: '#/', label: 'Jobs', name: 'jobs' },
  { hash: '#/stats', label: 'Stats', name: 'stats' },
  { hash: '#/settings', label: 'Settings', name: 'settings' },
] as const;

export function App() {
  const route = useRoute();
  const [hasToken, setHasToken] = useState(() => tokenStore.get() !== null);

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
      </nav>
      <main className="app__main">
        {route.name === 'jobs' && <JobsPage selectedId={route.jobId} />}
        {route.name === 'stats' && <StatsPage />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
