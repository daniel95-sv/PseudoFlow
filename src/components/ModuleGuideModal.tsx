import React, { useMemo } from 'react';
import { X, BookOpen, ChevronLeft, ChevronRight, Play, AlertTriangle, HelpCircle, Cpu, Sparkles } from 'lucide-react';
import examplesData from '../data/examples.json';

interface ModuleGuideModalProps {
  module: any;
  isOpen: boolean;
  onClose: () => void;
  lang: 'es' | 'en';
  onLoadCode: (code: string, title?: string) => void;
  onNavigateModule?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const ModuleGuideModal: React.FC<ModuleGuideModalProps> = ({
  module,
  isOpen,
  onClose,
  lang,
  onLoadCode,
  onNavigateModule,
  hasPrev,
  hasNext
}) => {
  const isEs = lang === 'es';
  const contentRaw = module ? (isEs ? (module.content_es || '') : (module.content_en || module.content_es || '')) : '';

  // Map examples by id for quick lookup
  const examplesMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const ex of examplesData) {
      map.set(ex.id, ex);
    }
    return map;
  }, []);

  // Parse sections based on :::parte <name>
  const sections = useMemo(() => {
    if (!contentRaw) return [];
    const parts = contentRaw.split(/:::parte\s+([a-zA-Z0-9_-]+)/g);
    const parsed: Array<{ type: string; title: string; content: string }> = [];

    // If there is intro before first :::parte
    if (parts.length > 0 && parts[0].trim()) {
      parsed.push({
        type: 'intro',
        title: isEs ? 'Introducción' : 'Introduction',
        content: parts[0].trim()
      });
    }

    for (let i = 1; i < parts.length; i += 2) {
      const type = parts[i]?.trim() || '';
      const content = parts[i + 1]?.trim() || '';
      let title = type;
      if (type === 'pregunta') title = isEs ? 'Pregunta de partida' : 'Guiding Question';
      else if (type === 'modelo-maquina') title = isEs ? 'Modelo de la máquina nocional' : 'Notional Machine Model';
      else if (type === 'desarrollo') title = isEs ? 'Conceptos clave y desarrollo' : 'Core Concepts & Theory';
      else if (type === 'prediccion') title = isEs ? 'Predicción y razonamiento' : 'Prediction & Reasoning';
      else if (type === 'errores-frecuentes') title = isEs ? 'Errores frecuentes y trampas' : 'Common Pitfalls & Mistakes';
      else if (type === 'especificacion') title = isEs ? 'Especificación del lenguaje' : 'Language Specification';
      else if (type === 'ejercicios') title = isEs ? 'Retos del módulo' : 'Module Challenges';

      parsed.push({ type, title, content });
    }

    return parsed;
  }, [contentRaw, isEs]);

  if (!isOpen || !module) return null;

  // Render a block of markdown-like text
  const renderFormattedText = (text: string) => {
    // Split into lines/paragraphs while handling code blocks and embedded examples
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLang = '';
    let tableBuffer: string[] = [];
    let inTable = false;

    const flushTable = (key: number) => {
      if (tableBuffer.length > 0) {
        const rows = tableBuffer.map(row =>
          row
            .split('|')
            .map(c => c.trim())
            .filter((c, idx, arr) => (idx > 0 && idx < arr.length - 1))
        );
        const header = rows[0] || [];
        const bodyRows = rows.slice(2); // Skip separator row

        elements.push(
          <div key={`table-${key}`} style={{ overflowX: 'auto', margin: '0.8rem 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--pl-sunken)', borderBottom: '2px solid var(--pl-line)' }}>
                  {header.map((col, idx) => (
                    <th key={idx} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 600 }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: '1px solid var(--pl-line-soft)' }}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: '0.4rem 0.6rem', fontFamily: cell.startsWith('`') ? 'var(--pl-font-mono)' : 'inherit' }}>
                        {cell.replace(/`/g, '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableBuffer = [];
        inTable = false;
      }
    };

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];

      // Code blocks ```
      if (line.startsWith('```')) {
        if (inTable) flushTable(idx);
        if (inCodeBlock) {
          const codeSnippet = codeBuffer.join('\n');
          elements.push(
            <div key={`code-${idx}`} style={{ margin: '0.8rem 0', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--pl-line)' }}>
              <div style={{ background: 'var(--pl-sunken)', padding: '0.3rem 0.6rem', fontSize: '0.72rem', color: 'var(--pl-ink-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="pl-mono">{codeLang || 'pseudocódigo'}</span>
                <button
                  type="button"
                  className="pl-btn pl-btn--outline pl-btn--sm"
                  style={{ fontSize: '0.7rem', padding: '1px 6px' }}
                  onClick={() => {
                    onLoadCode(codeSnippet, module.title_es);
                    onClose();
                  }}
                >
                  <Play size={10} />
                  <span>{isEs ? 'Cargar en editor' : 'Load in editor'}</span>
                </button>
              </div>
              <pre style={{ margin: 0, padding: '0.75rem', background: '#0b1320', color: '#f8fafc', fontSize: '0.82rem', fontFamily: 'var(--pl-font-mono)', overflowX: 'auto', lineHeight: 1.45 }}>
                <code>{codeSnippet}</code>
              </pre>
            </div>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLang = line.replace('```', '').trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // Tables
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        inTable = true;
        tableBuffer.push(line.trim());
        continue;
      } else if (inTable) {
        flushTable(idx);
      }

      // Embedded example: {{ejemplo:example_id}}
      const exMatch = line.match(/\{\{ejemplo:([a-zA-Z0-9_-]+)\}\}/);
      if (exMatch) {
        const exId = exMatch[1];
        const ex = examplesMap.get(exId);
        if (ex) {
          const exCode = isEs ? ex.code_es : ex.code_en || ex.code_es;
          elements.push(
            <div key={`ex-${idx}`} style={{ margin: '1rem 0', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--pl-brand-border, #0ea5e9)', background: 'var(--pl-sunken)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--pl-brand)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={14} />
                  <span>{isEs ? 'Ejemplo del módulo:' : 'Module Example:'} {isEs ? ex.title_es : ex.title_en || ex.title_es}</span>
                </div>
                <button
                  type="button"
                  className="pl-btn pl-btn--primary pl-btn--sm"
                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  onClick={() => {
                    onLoadCode(exCode, isEs ? ex.title_es : ex.title_en || ex.title_es);
                    onClose();
                  }}
                >
                  <Play size={11} fill="currentColor" />
                  <span>{isEs ? 'Cargar y Probar' : 'Load and Run'}</span>
                </button>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--pl-ink-2)', margin: '0 0 0.5rem 0' }}>
                {isEs ? ex.summary_es : ex.summary_en || ex.summary_es}
              </p>
              <pre style={{ margin: 0, padding: '0.6rem', borderRadius: '4px', background: '#0b1320', color: '#e2e8f0', fontSize: '0.78rem', fontFamily: 'var(--pl-font-mono)', overflowX: 'auto', lineHeight: 1.4 }}>
                <code>{exCode}</code>
              </pre>
            </div>
          );
          continue;
        }
      }

      // Diagnostic / Spec badges: {{diagnostico:...}} or {{tabla:...}}
      const badgeMatch = line.match(/\{\{([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)\}\}/);
      if (badgeMatch) {
        const [, bType, bName] = badgeMatch;
        elements.push(
          <div key={`badge-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--pl-sunken)', border: '1px solid var(--pl-line)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', margin: '0.3rem 0', fontFamily: 'var(--pl-font-mono)' }}>
            <span style={{ color: 'var(--pl-brand)', fontWeight: 600 }}>[{bType}]</span>
            <span>{bName}</span>
          </div>
        );
        continue;
      }

      // Headings
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={`h3-${idx}`} style={{ fontSize: '1.05rem', fontWeight: 700, margin: '1rem 0 0.4rem 0', color: 'var(--pl-ink)' }}>
            {line.replace('## ', '')}
          </h3>
        );
        continue;
      }

      // Bullet lists
      if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={`li-${idx}`} style={{ marginLeft: '1.2rem', marginBottom: '0.3rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {line.replace(/^[-*]\s+/, '')}
          </li>
        );
        continue;
      }

      // Regular paragraph
      if (line.trim().length > 0) {
        elements.push(
          <p key={`p-${idx}`} style={{ fontSize: '0.86rem', lineHeight: 1.6, margin: '0.5rem 0', color: 'var(--pl-ink)' }}>
            {line}
          </p>
        );
      }
    }

    if (inTable) flushTable(lines.length);

    return elements;
  };

  const getSectionIcon = (type: string) => {
    switch (type) {
      case 'pregunta':
        return <HelpCircle size={18} style={{ color: '#0284c7' }} />;
      case 'modelo-maquina':
        return <Cpu size={18} style={{ color: '#0d9488' }} />;
      case 'errores-frecuentes':
        return <AlertTriangle size={18} style={{ color: '#e11d48' }} />;
      case 'prediccion':
        return <Sparkles size={18} style={{ color: '#d97706' }} />;
      default:
        return <BookOpen size={18} style={{ color: 'var(--pl-brand)' }} />;
    }
  };

  const getSectionBoxStyle = (type: string): React.CSSProperties => {
    switch (type) {
      case 'pregunta':
        return {
          background: 'rgba(2, 132, 199, 0.05)',
          borderLeft: '4px solid #0284c7',
          padding: '0.9rem 1rem',
          borderRadius: '0 8px 8px 0',
          marginBottom: '1.2rem'
        };
      case 'modelo-maquina':
        return {
          background: 'rgba(13, 148, 136, 0.05)',
          borderLeft: '4px solid #0d9488',
          padding: '0.9rem 1rem',
          borderRadius: '0 8px 8px 0',
          marginBottom: '1.2rem'
        };
      case 'errores-frecuentes':
        return {
          background: 'rgba(225, 29, 72, 0.05)',
          borderLeft: '4px solid #e11d48',
          padding: '0.9rem 1rem',
          borderRadius: '0 8px 8px 0',
          marginBottom: '1.2rem'
        };
      case 'prediccion':
        return {
          background: 'rgba(217, 119, 6, 0.05)',
          borderLeft: '4px solid #d97706',
          padding: '0.9rem 1rem',
          borderRadius: '0 8px 8px 0',
          marginBottom: '1.2rem'
        };
      default:
        return {
          marginBottom: '1.2rem'
        };
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--pl-surface)',
          border: '1px solid var(--pl-line)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--pl-line)',
            background: 'var(--pl-sunken)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <span
              className="pl-mono"
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                background: 'var(--pl-brand)',
                color: '#fff',
                padding: '3px 8px',
                borderRadius: '5px'
              }}
            >
              {module.id}
            </span>
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: 'var(--pl-ink)'
                }}
              >
                {isEs ? module.title_es : module.title_en || module.title_es}
              </h2>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--pl-ink-2)' }}>
                {isEs ? `Tramo ${module.track} · Módulo ${module.order}` : `Track ${module.track} · Module ${module.order}`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
            {onNavigateModule && (
              <>
                <button
                  type="button"
                  className="pl-icon-btn"
                  onClick={() => onNavigateModule('prev')}
                  disabled={!hasPrev}
                  style={{ opacity: hasPrev ? 1 : 0.4 }}
                  title={isEs ? 'Módulo anterior' : 'Previous module'}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="pl-icon-btn"
                  onClick={() => onNavigateModule('next')}
                  disabled={!hasNext}
                  style={{ opacity: hasNext ? 1 : 0.4 }}
                  title={isEs ? 'Módulo siguiente' : 'Next module'}
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              className="pl-icon-btn"
              onClick={onClose}
              title={isEs ? 'Cerrar guía' : 'Close guide'}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {/* Module Summary Highlight */}
          <div
            style={{
              padding: '0.8rem 1rem',
              borderRadius: '8px',
              background: 'var(--pl-sunken)',
              border: '1px solid var(--pl-line-soft)',
              marginBottom: '1.5rem',
              fontSize: '0.92rem',
              color: 'var(--pl-ink)',
              fontStyle: 'italic',
              lineHeight: 1.5
            }}
          >
            {isEs ? module.summary_es : module.summary_en || module.summary_es}
          </div>

          {/* Sections */}
          {sections.map((sec, idx) => (
            <div key={idx} style={getSectionBoxStyle(sec.type)}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontWeight: 700,
                  fontSize: '0.96rem',
                  color: 'var(--pl-ink)',
                  marginBottom: '0.5rem'
                }}
              >
                {getSectionIcon(sec.type)}
                <span>{sec.title}</span>
              </div>
              <div style={{ color: 'var(--pl-ink)' }}>
                {renderFormattedText(sec.content)}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.8rem 1.25rem',
            borderTop: '1px solid var(--pl-line)',
            background: 'var(--pl-sunken)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.8rem'
          }}
        >
          <span style={{ color: 'var(--pl-ink-2)' }}>
            {isEs ? 'Guía teórica interactiva de PseudoFlow' : 'PseudoFlow Interactive Theory Guide'}
          </span>
          <button type="button" className="pl-btn pl-btn--primary pl-btn--sm" onClick={onClose}>
            {isEs ? 'Entendido / Volver al editor' : 'Got it / Back to editor'}
          </button>
        </div>
      </div>
    </div>
  );
};
