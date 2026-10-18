import React, { useState } from 'react';
import { Copy, Check, Info } from 'lucide-react';
import { transpileToPython, transpileToRust } from '../engine/transpiler';

interface CodeExportViewProps {
  code: string;
}

export const CodeExportView: React.FC<CodeExportViewProps> = ({ code }) => {
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
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.45rem 0.75rem',
          background: 'var(--pl-sunken)',
          border: '1px solid var(--pl-line)',
          borderRadius: '6px',
          marginBottom: '0.75rem',
          fontSize: '0.78rem',
          color: 'var(--pl-ink-2)'
        }}
      >
        <Info size={14} style={{ color: 'var(--pl-brand)', flexShrink: 0 }} />
        <span>
          <strong>Proyección didáctica experimental:</strong> la transpilación refleja correspondencias sintácticas directas en Python 3 y Rust para facilitar la transición a lenguajes industriales.
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
          title="Copiar código al portapapeles"
        >
          {copied ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
          <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
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
