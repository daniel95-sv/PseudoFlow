import { ProgramNode, ASTNode } from './types';

export interface FlowNode {
  id: string;
  type: 'start' | 'end' | 'process' | 'decision' | 'io' | 'loop_return';
  label: string;
  subLabel?: string;
  line: number;
  x: number;
  y: number;
  width: number;
  height: number;
  branches?: {
    yesX: number;
    yesY: number;
    noX: number;
    noY: number;
  };
}

export interface FlowConnection {
  fromId: string;
  toId: string;
  points: { x: number; y: number }[];
  label?: string;
  isLoopBack?: boolean;
}

export interface FlowchartData {
  nodes: FlowNode[];
  connections: FlowConnection[];
  totalWidth: number;
  totalHeight: number;
}

export function generateFlowchart(program: ProgramNode): FlowchartData {
  const nodes: FlowNode[] = [];
  const connections: FlowConnection[] = [];

  let currentY = 30;
  const centerX = 200;
  let nodeIdCounter = 0;

  // Start Node
  const startId = `node_${nodeIdCounter++}`;
  nodes.push({
    id: startId,
    type: 'start',
    label: `Inicio: ${program.name}`,
    line: program.line,
    x: centerX - 60,
    y: currentY,
    width: 120,
    height: 40
  });

  let prevNodeId = startId;
  let prevBottomY = currentY + 40;
  currentY += 70;

  // Process top-level statements
  for (const stmt of program.body) {
    const res = processStatement(stmt, centerX, currentY, prevNodeId, nodeIdCounter);
    nodeIdCounter = res.nextId;
    nodes.push(...res.nodes);
    connections.push(...res.connections);
    prevNodeId = res.lastNodeId;
    currentY = res.nextY;
  }

  // End Node
  const endId = `node_${nodeIdCounter++}`;
  nodes.push({
    id: endId,
    type: 'end',
    label: `FinProceso`,
    line: program.line,
    x: centerX - 55,
    y: currentY,
    width: 110,
    height: 40
  });

  connections.push({
    fromId: prevNodeId,
    toId: endId,
    points: [
      { x: centerX, y: currentY - 30 },
      { x: centerX, y: currentY }
    ]
  });

  currentY += 60;

  return {
    nodes,
    connections,
    totalWidth: 400,
    totalHeight: currentY + 20
  };
}

function processStatement(
  stmt: ASTNode,
  centerX: number,
  startY: number,
  prevId: string,
  startIdCounter: number
): {
  nodes: FlowNode[];
  connections: FlowConnection[];
  lastNodeId: string;
  nextY: number;
  nextId: number;
} {
  const nodes: FlowNode[] = [];
  const connections: FlowConnection[] = [];
  let idCounter = startIdCounter;
  let currentY = startY;

  switch (stmt.type) {
    case 'Declaration': {
      const decl = stmt as any;
      const id = `node_${idCounter++}`;
      const node: FlowNode = {
        id,
        type: 'process',
        label: `Definir ${decl.variableName}`,
        subLabel: `Como ${decl.dataType}`,
        line: decl.line,
        x: centerX - 90,
        y: currentY,
        width: 180,
        height: 44
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: id,
        points: [{ x: centerX, y: currentY - 26 }, { x: centerX, y: currentY }]
      });
      return { nodes, connections, lastNodeId: id, nextY: currentY + 70, nextId: idCounter };
    }

    case 'Assignment': {
      const a = stmt as any;
      const id = `node_${idCounter++}`;
      const targetStr = a.target?.isThis
        ? `Este.${a.target.member}`
        : a.target?.member
        ? `${a.target.name}.${a.target.member}`
        : a.target?.name || 'x';
      const node: FlowNode = {
        id,
        type: 'process',
        label: `${targetStr} <- ...`,
        line: a.line,
        x: centerX - 90,
        y: currentY,
        width: 180,
        height: 44
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: id,
        points: [{ x: centerX, y: currentY - 26 }, { x: centerX, y: currentY }]
      });
      return { nodes, connections, lastNodeId: id, nextY: currentY + 70, nextId: idCounter };
    }

    case 'Read': {
      const r = stmt as any;
      const id = `node_${idCounter++}`;
      const targetList = r.targets?.map((t: any) => t.name).join(', ') || '';
      const node: FlowNode = {
        id,
        type: 'io',
        label: `Leer: ${targetList}`,
        line: r.line,
        x: centerX - 85,
        y: currentY,
        width: 170,
        height: 44
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: id,
        points: [{ x: centerX, y: currentY - 26 }, { x: centerX, y: currentY }]
      });
      return { nodes, connections, lastNodeId: id, nextY: currentY + 70, nextId: idCounter };
    }

    case 'Write': {
      const w = stmt as any;
      const id = `node_${idCounter++}`;
      const node: FlowNode = {
        id,
        type: 'io',
        label: `Escribir ...`,
        line: w.line,
        x: centerX - 85,
        y: currentY,
        width: 170,
        height: 44
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: id,
        points: [{ x: centerX, y: currentY - 26 }, { x: centerX, y: currentY }]
      });
      return { nodes, connections, lastNodeId: id, nextY: currentY + 70, nextId: idCounter };
    }

    case 'If': {
      const ifNode = stmt as any;
      const decId = `node_${idCounter++}`;
      const node: FlowNode = {
        id: decId,
        type: 'decision',
        label: '¿Condición?',
        line: ifNode.line,
        x: centerX - 75,
        y: currentY,
        width: 150,
        height: 55
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: decId,
        points: [{ x: centerX, y: currentY - 25 }, { x: centerX, y: currentY }]
      });

      currentY += 80;
      let lastId = decId;

      // Then branch
      for (const s of ifNode.thenBranch || []) {
        const res = processStatement(s, centerX - 50, currentY, lastId, idCounter);
        idCounter = res.nextId;
        nodes.push(...res.nodes);
        connections.push(...res.connections);
        lastId = res.lastNodeId;
        currentY = res.nextY;
      }

      return { nodes, connections, lastNodeId: lastId, nextY: currentY, nextId: idCounter };
    }

    case 'While': {
      const wh = stmt as any;
      const decId = `node_${idCounter++}`;
      const node: FlowNode = {
        id: decId,
        type: 'decision',
        label: '¿Mientras?',
        line: wh.line,
        x: centerX - 75,
        y: currentY,
        width: 150,
        height: 55
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: decId,
        points: [{ x: centerX, y: currentY - 25 }, { x: centerX, y: currentY }]
      });

      currentY += 80;
      let lastId = decId;

      for (const s of wh.body || []) {
        const res = processStatement(s, centerX, currentY, lastId, idCounter);
        idCounter = res.nextId;
        nodes.push(...res.nodes);
        connections.push(...res.connections);
        lastId = res.lastNodeId;
        currentY = res.nextY;
      }

      // Loopback connection to decision node
      connections.push({
        fromId: lastId,
        toId: decId,
        isLoopBack: true,
        points: [
          { x: centerX, y: currentY - 25 },
          { x: centerX - 120, y: currentY - 25 },
          { x: centerX - 120, y: startY + 27 },
          { x: centerX - 75, y: startY + 27 }
        ]
      });

      return { nodes, connections, lastNodeId: decId, nextY: currentY, nextId: idCounter };
    }

    default: {
      const id = `node_${idCounter++}`;
      const node: FlowNode = {
        id,
        type: 'process',
        label: stmt.type,
        line: stmt.line,
        x: centerX - 80,
        y: currentY,
        width: 160,
        height: 44
      };
      nodes.push(node);
      connections.push({
        fromId: prevId,
        toId: id,
        points: [{ x: centerX, y: currentY - 26 }, { x: centerX, y: currentY }]
      });
      return { nodes, connections, lastNodeId: id, nextY: currentY + 70, nextId: idCounter };
    }
  }
}
