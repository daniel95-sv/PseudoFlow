import React, { useState } from 'react';
import { transpileToPython, transpileToRust } from '../engine/transpiler';

interface CodeExportViewProps {
  code: string;
}

export const CodeExportView: React.FC<CodeExportViewProps> = ({ code }) => {
  const [targetLang, setTargetLang] = useState<'python' | 'rust'>('python');

  const outputCode = targetLang === 'python' ? transpileToPython(code) : transpileToRust(code);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
