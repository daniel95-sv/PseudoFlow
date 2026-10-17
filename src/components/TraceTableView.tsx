import React from 'react';
import { TraceStep } from '../engine/types';

interface TraceTableViewProps {
  steps: TraceStep[];
  currentStepIndex: number;
}

export const TraceTableView: React.FC<TraceTableViewProps> = ({ steps, currentStepIndex }) => {
  if (steps.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pl-ink-2)' }}>
        La tabla de traza se completará automáticamente al ejecutar el programa paso a paso.
      </div>
    );
  }

  // Collect all unique variable names across steps
  const varNamesSet = new Set<string>();
  for (const s of steps) {
    for (const k of Object.keys(s.variables)) {
      varNamesSet.add(k);
    }
  }
  const variableColumns = Array.from(varNamesSet);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table className="trace-table">
        <thead>
          <tr>
            <th style={{ width: '60px' }}>Paso</th>
            <th style={{ width: '60px' }}>Línea</th>
            <th>Acción</th>
            {variableColumns.map(v => (
              <th key={v}>{v}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((step, idx) => {
            const isCurrent = idx === currentStepIndex;

            return (
              <tr key={step.stepNumber} className={isCurrent ? 'trace-table__row--active' : ''}>
                <td className="pl-mono">{step.stepNumber}</td>
                <td className="pl-mono" style={{ borderRight: '2px solid var(--pl-line)' }}>
                  {step.lineNumber}
                </td>
                <td style={{ color: 'var(--pl-ink-2)' }}>{step.action}</td>
                {variableColumns.map(v => {
                  const val = step.variables[v] ?? '-';
                  const changed = step.changedVar === v;

                  return (
                    <td
                      key={v}
                      className={`pl-mono ${changed ? 'trace-cell--changed' : ''}`}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
