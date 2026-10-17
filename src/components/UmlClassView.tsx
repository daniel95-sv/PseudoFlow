import React from 'react';
import { ClassNode } from '../engine/types';

interface UmlClassViewProps {
  classes: ClassNode[];
}

export const UmlClassView: React.FC<UmlClassViewProps> = ({ classes }) => {
  if (!classes || classes.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pl-ink-2)' }}>
        No se detectaron clases en este programa. Define una clase con <code>Clase ... FinClase</code> para generar el diagrama UML.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'center', padding: '1rem' }}>
      {classes.map(cls => (
        <div
          key={cls.name}
          style={{
            border: '2px solid var(--pl-line-strong)',
            borderRadius: '6px',
            background: 'var(--pl-surface)',
            width: '260px',
            boxShadow: 'var(--pl-shadow-1)',
            overflow: 'hidden',
            fontFamily: 'var(--pl-font-mono)',
            fontSize: '0.85rem'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '0.6rem',
              background: 'var(--pl-brand-tint)',
              borderBottom: '2px solid var(--pl-line-strong)',
              textAlign: 'center',
              fontWeight: 700,
              color: 'var(--pl-brand-deep)'
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--pl-ink-2)', textTransform: 'uppercase' }}>
              &laquo;clase&raquo;
            </div>
            {cls.name}
            {cls.superClass && (
              <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--pl-ink-2)' }}>
                &uarr; Hereda de {cls.superClass}
              </div>
            )}
          </div>

          {/* Attributes */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--pl-line)' }}>
            {cls.fields.length === 0 ? (
              <div style={{ color: 'var(--pl-ink-3)', fontStyle: 'italic', fontSize: '0.8rem' }}>Sin atributos</div>
            ) : (
              cls.fields.map(f => (
                <div key={f.variableName} style={{ padding: '0.1rem 0' }}>
                  {f.isPrivate ? '- ' : '+ '}
                  <span style={{ color: 'var(--pl-ink)' }}>{f.variableName}</span>: {f.dataType}
                </div>
              ))
            )}
          </div>

          {/* Methods */}
          <div style={{ padding: '0.5rem' }}>
            {cls.methods.length === 0 ? (
              <div style={{ color: 'var(--pl-ink-3)', fontStyle: 'italic', fontSize: '0.8rem' }}>Sin métodos</div>
            ) : (
              cls.methods.map(m => (
                <div key={m.name} style={{ padding: '0.1rem 0' }}>
                  {m.isPublic ? '+ ' : '- '}
                  <span style={{ fontWeight: 600 }}>{m.name}</span>({m.parameters.map(p => `${p.name}: ${p.dataType}`).join(', ')})
                  {m.returnType ? `: ${m.returnType}` : ''}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
