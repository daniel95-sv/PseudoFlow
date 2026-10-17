import { ProgramNode, ASTNode } from './types';

export interface StructogramBlock {
  id: string;
  type: 'statement' | 'if' | 'while' | 'repeat' | 'for' | 'switch';
  label: string;
  line: number;
  // Branches
  thenChildren?: StructogramBlock[];
  elseChildren?: StructogramBlock[];
  bodyChildren?: StructogramBlock[];
  cases?: { label: string; children: StructogramBlock[] }[];
}

export function generateStructogram(program: ProgramNode): StructogramBlock[] {
  return program.body.map((stmt, idx) => convertStatementToBlock(stmt, `b_${idx}`));
}

function convertStatementToBlock(stmt: ASTNode, idPrefix: string): StructogramBlock {
  switch (stmt.type) {
    case 'Declaration': {
      const decl = stmt as any;
      return {
        id: idPrefix,
        type: 'statement',
        label: `Definir ${decl.variableName} Como ${decl.dataType}`,
        line: decl.line
      };
    }

    case 'Dimension': {
      const dim = stmt as any;
      return {
        id: idPrefix,
        type: 'statement',
        label: `Dimension ${dim.name}[...]`,
        line: dim.line
      };
    }

    case 'Assignment': {
      const a = stmt as any;
      const targetStr = a.target?.isThis
        ? `Este.${a.target.member}`
        : a.target?.member
        ? `${a.target.name}.${a.target.member}`
        : a.target?.name || 'x';
      return {
        id: idPrefix,
        type: 'statement',
        label: `${targetStr} <- ...`,
        line: a.line
      };
    }

    case 'Read': {
      const r = stmt as any;
      const targets = r.targets?.map((t: any) => t.name).join(', ') || '';
      return {
        id: idPrefix,
        type: 'statement',
        label: `Leer ${targets}`,
        line: r.line
      };
    }

    case 'Write': {
      const w = stmt as any;
      return {
        id: idPrefix,
        type: 'statement',
        label: `Escribir ...`,
        line: w.line
      };
    }

    case 'If': {
      const ifNode = stmt as any;
      return {
        id: idPrefix,
        type: 'if',
        label: `¿Condición?`,
        line: ifNode.line,
        thenChildren: (ifNode.thenBranch || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_then_${i}`)
        ),
        elseChildren: (ifNode.elseBranch || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_else_${i}`)
        )
      };
    }

    case 'While': {
      const wh = stmt as any;
      return {
        id: idPrefix,
        type: 'while',
        label: `Mientras condición`,
        line: wh.line,
        bodyChildren: (wh.body || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_body_${i}`)
        )
      };
    }

    case 'Repeat': {
      const rep = stmt as any;
      return {
        id: idPrefix,
        type: 'repeat',
        label: `Hasta Que condición`,
        line: rep.line,
        bodyChildren: (rep.body || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_body_${i}`)
        )
      };
    }

    case 'For': {
      const f = stmt as any;
      return {
        id: idPrefix,
        type: 'for',
        label: `Para ${f.variableName} <- ...`,
        line: f.line,
        bodyChildren: (f.body || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_body_${i}`)
        )
      };
    }

    case 'Switch': {
      const sw = stmt as any;
      const cases = (sw.cases || []).map((c: any, ci: number) => ({
        label: `Caso ${ci + 1}`,
        children: (c.body || []).map((s: any, si: number) =>
          convertStatementToBlock(s, `${idPrefix}_c${ci}_${si}`)
        )
      }));
      if (sw.defaultCase) {
        cases.push({
          label: 'De Otro Modo',
          children: sw.defaultCase.map((s: any, si: number) =>
            convertStatementToBlock(s, `${idPrefix}_def_${si}`)
          )
        });
      }
      return {
        id: idPrefix,
        type: 'switch',
        label: `Segun expresión`,
        line: sw.line,
        cases
      };
    }

    default: {
      return {
        id: idPrefix,
        type: 'statement',
        label: stmt.type,
        line: stmt.line
      };
    }
  }
}
