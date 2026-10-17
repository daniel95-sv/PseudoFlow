import React, { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { IDEView } from './components/IDEView';

export function App() {
  const [view, setView] = useState<'landing' | 'ide'>('landing');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('pseudoflow-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
  });
  const [lang, setLang] = useState<'es' | 'en'>(() => {
    const saved = localStorage.getItem('pseudoflow-lang');
    return saved === 'en' ? 'en' : 'es';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pseudoflow-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('pseudoflow-lang', lang);
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
