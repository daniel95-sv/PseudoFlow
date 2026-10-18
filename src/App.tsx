import React, { useState, useEffect, Suspense, lazy } from 'react';
import { LandingPage } from './components/LandingPage';
import { safeStorageGet, safeStorageSet } from './engine/storage';

// Code splitting: dynamically import IDEView so the initial landing page bundle is ultra-lightweight
const IDEView = lazy(() => import('./components/IDEView'));

export function App() {
  const [view, setView] = useState<'landing' | 'ide'>('landing');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = safeStorageGet('pseudoflow-theme', '');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [lang, setLang] = useState<'es' | 'en'>(() => {
    const saved = safeStorageGet('pseudoflow-lang', 'es');
    return saved === 'en' ? 'en' : 'es';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    safeStorageSet('pseudoflow-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    safeStorageSet('pseudoflow-lang', lang);
  }, [lang]);

  // Support direct hash navigation
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#ide' || hash.startsWith('#ide/') || hash === '#editor-web') {
        setView('ide');
      } else if (hash === '#landing' || hash === '#home') {
        setView('landing');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Preload IDE chunk during idle time for instantaneous opening
  useEffect(() => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(() => {
        import('./components/IDEView');
      }, { timeout: 3500 });
      return () => (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(handle);
    }
  }, []);

  const [activeModuleId, setActiveModuleId] = useState<string | undefined>(undefined);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleLang = () => {
    setLang(prev => (prev === 'es' ? 'en' : 'es'));
  };

  const handleOpenIDE = (targetModuleId?: string) => {
    setActiveModuleId(targetModuleId);
    setView('ide');
    window.location.hash = targetModuleId ? `#ide/${targetModuleId}` : '#ide';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToHome = () => {
    setView('landing');
    window.location.hash = '#landing';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (view === 'ide') {
    return (
      <Suspense
        fallback={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              background: 'var(--pl-canvas)',
              color: 'var(--pl-ink)',
              fontFamily: 'var(--pl-font-sans)',
              gap: '1rem'
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                border: '3px solid var(--pl-line)',
                borderTopColor: 'var(--pl-brand)',
                borderRadius: '50%',
                animation: 'spin 0.75s linear infinite'
              }}
            />
            <p style={{ fontSize: '0.92rem', color: 'var(--pl-ink-2)', margin: 0 }}>
              {lang === 'es' ? 'Cargando editor y simulador...' : 'Loading editor and simulator...'}
            </p>
          </div>
        }
      >
        <IDEView
          onBackToHome={handleBackToHome}
          theme={theme}
          onToggleTheme={toggleTheme}
          lang={lang}
          onToggleLang={toggleLang}
          initialModuleId={activeModuleId}
        />
      </Suspense>
    );
  }

  return (
    <LandingPage
      onOpenIDE={handleOpenIDE}
      theme={theme}
      onToggleTheme={toggleTheme}
      lang={lang}
      onToggleLang={toggleLang}
    />
  );
}

export default App;
