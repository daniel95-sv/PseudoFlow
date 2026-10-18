import React, { useState } from 'react';
import { Copy, Check, Info } from 'lucide-react';
import { transpileToPython, transpileToRust } from '../engine/transpiler';

interface CodeExportViewProps {
  code: string;
  lang?: 'es' | 'en';
}

export const CodeExportView: React.FC<CodeExportViewProps> = ({ code, lang = 'es' }) => {
  const isEs = lang === 'es';
  const [targetLang, setTargetLang] = useState<'python' | 'rust'>('python');
  const [copied, setCopied] = useState<boolean>(false);

  const outputCode = targetLang === 'python' ? transpileToPython(code) : transpileToRust(code);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outputCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Notice / Disclaimer Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          padding: '0.45rem 0.75rem',
          background: 'var(--pl-sunken)',
          border: '1px solid var(--pl-line)',
          borderRadius: '6px',
          marginBottom: '0.75rem',
          fontSize: '0.78rem',
          color: 'var(--pl-ink-2)',
          lineHeight: 1.4
        }}
      >
        <Info size={14} style={{ color: 'var(--pl-brand)', flexShrink: 0, marginTop: '2px' }} />
        <span>
          <strong>{isEs ? 'Proyección didáctica experimental:' : 'Experimental educational projection:'}</strong>{' '}
          {isEs
            ? 'traducción sintáctica con fines formativos (estructuras de control, E/S básica, bucles y arreglos). Arreglos complejos o tipado avanzado en Rust pueden requerir ajustes manuales en el compilador de destino.'
            : 'syntactic translation for learning purposes (control structures, basic I/O, loops, and arrays). Complex arrays or advanced Rust typing may require manual adjustments in the target compiler.'}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`pl-btn pl-btn--sm ${targetLang === 'python' ? 'pl-btn--primary' : 'pl-btn--outline'}`}
            onClick={() => setTargetLang('python')}
          >
            Python 3
          </button>
          <button
            className={`pl-btn pl-btn--sm ${targetLang === 'rust' ? 'pl-btn--primary' : 'pl-btn--outline'}`}
            onClick={() => setTargetLang('rust')}
          >
            Rust
          </button>
        </div>

        <button
          className="pl-btn pl-btn--outline pl-btn--sm"
          onClick={handleCopy}
          title={isEs ? 'Copiar código al portapapeles' : 'Copy code to clipboard'}
        >
          {copied ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
          <span>{copied ? (isEs ? '¡Copiado!' : 'Copied!') : (isEs ? 'Copiar' : 'Copy')}</span>
        </button>
      </div>

      <pre
        className="pl-mono"
        style={{
          flex: 1,
          padding: '1rem',
          background: 'var(--pl-sunken)',
          border: '1px solid var(--pl-line)',
          borderRadius: '6px',
          overflow: 'auto',
          fontSize: '0.88rem',
          color: 'var(--pl-ink)',
          whiteSpace: 'pre'
        }}
      >
        {outputCode}
      </pre>
    </div>
  );
};
