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

export function generateStructogram(program: ProgramNode, lang: 'es' | 'en' = 'es'): StructogramBlock[] {
  const isEs = lang === 'es';
  return program.body.map((stmt, idx) => convertStatementToBlock(stmt, `b_${idx}`, isEs));
}

function convertStatementToBlock(stmt: ASTNode, idPrefix: string, isEs: boolean = true): StructogramBlock {
  switch (stmt.type) {
    case 'Declaration': {
      const decl = stmt as any;
      return {
        id: idPrefix,
        type: 'statement',
        label: isEs ? `Definir ${decl.variableName} Como ${decl.dataType}` : `Define ${decl.variableName} as ${decl.dataType}`,
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
        ? (isEs ? `Este.${a.target.member}` : `this.${a.target.member}`)
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
        label: isEs ? `Leer ${targets}` : `Read ${targets}`,
        line: r.line
      };
    }

    case 'Write': {
      const w = stmt as any;
      return {
        id: idPrefix,
        type: 'statement',
        label: isEs ? `Escribir ...` : `Write ...`,
        line: w.line
      };
    }

    case 'If': {
      const ifNode = stmt as any;
      return {
        id: idPrefix,
        type: 'if',
        label: isEs ? `¿Condición?` : `Condition?`,
        line: ifNode.line,
        thenChildren: (ifNode.thenBranch || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_then_${i}`, isEs)
        ),
        elseChildren: (ifNode.elseBranch || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_else_${i}`, isEs)
        )
      };
    }

    case 'While': {
      const wh = stmt as any;
      return {
        id: idPrefix,
        type: 'while',
        label: isEs ? `Mientras condición` : `While condition`,
        line: wh.line,
        bodyChildren: (wh.body || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_body_${i}`, isEs)
        )
      };
    }

    case 'Repeat': {
      const rep = stmt as any;
      return {
        id: idPrefix,
        type: 'repeat',
        label: isEs ? `Hasta Que condición` : `Until condition`,
        line: rep.line,
        bodyChildren: (rep.body || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_body_${i}`, isEs)
        )
      };
    }

    case 'For': {
      const f = stmt as any;
      return {
        id: idPrefix,
        type: 'for',
        label: isEs ? `Para ${f.variableName} <- ...` : `For ${f.variableName} <- ...`,
        line: f.line,
        bodyChildren: (f.body || []).map((s: any, i: number) =>
          convertStatementToBlock(s, `${idPrefix}_body_${i}`, isEs)
        )
      };
    }

    case 'Switch': {
      const sw = stmt as any;
      const cases = (sw.cases || []).map((c: any, ci: number) => ({
        label: isEs ? `Caso ${ci + 1}` : `Case ${ci + 1}`,
        children: (c.body || []).map((s: any, si: number) =>
          convertStatementToBlock(s, `${idPrefix}_c${ci}_${si}`, isEs)
        )
      }));
      if (sw.defaultCase) {
        cases.push({
          label: isEs ? 'De Otro Modo' : 'Default',
          children: sw.defaultCase.map((s: any, si: number) =>
            convertStatementToBlock(s, `${idPrefix}_def_${si}`, isEs)
          )
        });
      }
      return {
        id: idPrefix,
        type: 'switch',
        label: isEs ? `Segun expresión` : `Switch expression`,
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
