import React from 'react';
import { StructogramBlock } from '../engine/structogram';

interface StructogramViewProps {
  blocks: StructogramBlock[];
  activeLine?: number;
}

export const StructogramView: React.FC<StructogramViewProps> = ({ blocks, activeLine }) => {
  if (!blocks || blocks.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pl-ink-2)' }}>
        No hay estructograma disponible.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '500px', margin: '0 auto', overflowX: 'auto' }}>
      {blocks.map(block => (
        <BlockRenderer key={block.id} block={block} activeLine={activeLine} />
      ))}
    </div>
  );
};

const BlockRenderer: React.FC<{ block: StructogramBlock; activeLine?: number }> = ({ block, activeLine }) => {
  const isActive = activeLine !== undefined && block.line === activeLine;

  if (block.type === 'if') {
    return (
      <div className={`ns-block ${isActive ? 'ns-block--active' : ''}`}>
        <div className="ns-condition-header">{block.label}</div>
        <div className="ns-split">
          <div className="ns-split-left">
            <div className="ns-branch-label">SÍ</div>
            {(block.thenChildren || []).map(c => (
              <BlockRenderer key={c.id} block={c} activeLine={activeLine} />
            ))}
          </div>
          <div className="ns-split-right">
            <div className="ns-branch-label">NO</div>
            {(block.elseChildren || []).map(c => (
              <BlockRenderer key={c.id} block={c} activeLine={activeLine} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (block.type === 'while' || block.type === 'for') {
    return (
      <div className={`ns-block ${isActive ? 'ns-block--active' : ''}`}>
        <div className="ns-condition-header">{block.label}</div>
        <div className={`ns-loop-gutter ${isActive ? 'ns-loop-gutter--active' : ''}`}>
          {(block.bodyChildren || []).map(c => (
            <BlockRenderer key={c.id} block={c} activeLine={activeLine} />
          ))}
        </div>
      </div>
    );
  }

  if (block.type === 'repeat') {
    return (
      <div className={`ns-block ${isActive ? 'ns-block--active' : ''}`}>
        <div className={`ns-loop-gutter ${isActive ? 'ns-loop-gutter--active' : ''}`}>
          {(block.bodyChildren || []).map(c => (
            <BlockRenderer key={c.id} block={c} activeLine={activeLine} />
          ))}
        </div>
        <div className="ns-condition-header">{block.label}</div>
      </div>
    );
  }

  return (
    <div className={`ns-block ${isActive ? 'ns-block--active' : ''}`}>
      <div className="ns-statement">{block.label}</div>
    </div>
  );
};
