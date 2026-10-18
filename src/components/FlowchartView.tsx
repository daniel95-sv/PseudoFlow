import React, { useState } from 'react';
import { FlowchartData } from '../engine/flowchart';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

interface FlowchartViewProps {
  data: FlowchartData | null;
  activeLine?: number;
}

export const FlowchartView: React.FC<FlowchartViewProps> = ({ data, activeLine }) => {
  const [zoom, setZoom] = useState<number>(1);
  const [fitToWidth, setFitToWidth] = useState<boolean>(true);

  if (!data || data.nodes.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pl-ink-2)' }}>
        No hay ordinograma disponible. Escribe o selecciona un programa para generarlo.
      </div>
    );
  }

  const handleZoomIn = () => {
    setFitToWidth(false);
    setZoom(prev => Math.min(Number((prev + 0.2).toFixed(1)), 2.5));
  };

  const handleZoomOut = () => {
    setFitToWidth(false);
    setZoom(prev => Math.max(Number((prev - 0.2).toFixed(1)), 0.4));
  };

  const handleReset = () => {
    setFitToWidth(false);
    setZoom(1);
  };

  const handleFit = () => {
    setFitToWidth(true);
    setZoom(1);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Zoom / Fit Toolbar */}
      <div className="flow-toolbar">
        <button
          type="button"
          className={`flow-btn ${fitToWidth ? 'flow-btn--active' : ''}`}
          onClick={handleFit}
          title="Ajustar al ancho de la pantalla (evita scroll horizontal)"
        >
          <Maximize2 size={13} />
          <span>Ajustar</span>
        </button>
        <button type="button" className="flow-btn" onClick={handleZoomIn} title="Acercar">
          <ZoomIn size={13} />
        </button>
        <button type="button" className="flow-btn" onClick={handleZoomOut} title="Alejar">
          <ZoomOut size={13} />
        </button>
        <button type="button" className="flow-btn" onClick={handleReset} title="Tamaño 100%">
          <RotateCcw size={13} />
          <span>{Math.round(zoom * 100)}%</span>
        </button>
      </div>

      {/* Diagram Canvas with smooth scrolling */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '0.75rem' }}>
        <svg
          width={fitToWidth ? '100%' : data.totalWidth * zoom}
          height={fitToWidth ? 'auto' : data.totalHeight * zoom}
          viewBox={`0 0 ${data.totalWidth} ${data.totalHeight}`}
          style={{
            maxWidth: fitToWidth ? '100%' : 'none',
            display: 'block',
            margin: 'auto',
            transition: 'width 0.15s ease, height 0.15s ease'
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" className="flow-arrow" />
            </marker>
            <marker
              id="arrowhead-loop"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" className="flow-arrow--loop" />
            </marker>
          </defs>

          {/* Connections */}
          {data.connections.map((c, i) => {
            const pathD = c.points.map((p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
            return (
              <path
                key={`conn_${i}`}
                d={pathD}
                className={`flow-edge ${c.isLoopBack ? 'flow-edge--loop' : ''}`}
                markerEnd={c.isLoopBack ? 'url(#arrowhead-loop)' : 'url(#arrowhead)'}
              />
            );
          })}

          {/* Nodes */}
          {data.nodes.map(n => {
            const isActive = activeLine !== undefined && n.line === activeLine;
            const shapeClass = `flow-node-shape ${isActive ? 'flow-node-shape--active' : ''}`;

            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                {/* Node Shape */}
                {n.type === 'start' || n.type === 'end' ? (
                  <rect
                    x="0"
                    y="0"
                    width={n.width}
                    height={n.height}
                    rx="20"
                    ry="20"
                    className={shapeClass}
                  />
                ) : n.type === 'decision' ? (
                  <polygon
                    points={`${n.width / 2},0 ${n.width},${n.height / 2} ${n.width / 2},${n.height} 0,${n.height / 2}`}
                    className={shapeClass}
                  />
                ) : n.type === 'io' ? (
                  <polygon
                    points={`15,0 ${n.width},0 ${n.width - 15},${n.height} 0,${n.height}`}
                    className={shapeClass}
                  />
                ) : (
                  <rect
                    x="0"
                    y="0"
                    width={n.width}
                    height={n.height}
                    rx="6"
                    ry="6"
                    className={shapeClass}
                  />
                )}

                {/* Text */}
                <text
                  x={n.width / 2}
                  y={n.subLabel ? n.height / 2 - 4 : n.height / 2}
                  className="flow-text-main"
                  style={{ fontWeight: isActive ? 600 : 400 }}
                >
                  {n.label}
                </text>
                {n.subLabel && (
                  <text
                    x={n.width / 2}
                    y={n.height / 2 + 10}
                    className="flow-text-sub"
                  >
                    {n.subLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default FlowchartView;
