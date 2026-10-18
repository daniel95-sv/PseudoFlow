import React, { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { IDEView } from './components/IDEView';
import { safeStorageGet, safeStorageSet } from './engine/storage';

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
    safeStorageSet('pseudoflow-lang', lang);
  }, [lang]);

  // Support direct hash navigation
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#ide' || hash === '#editor-web') {
        setView('ide');
      } else if (hash === '#landing' || hash === '#home') {
        setView('landing');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleLang = () => {
    setLang(prev => (prev === 'es' ? 'en' : 'es'));
  };

  const handleOpenIDE = () => {
    setView('ide');
    window.location.hash = '#ide';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToHome = () => {
    setView('landing');
    window.location.hash = '#landing';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (view === 'ide') {
    return (
      <IDEView
        onBackToHome={handleBackToHome}
        theme={theme}
        onToggleTheme={toggleTheme}
        lang={lang}
        onToggleLang={toggleLang}
      />
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
