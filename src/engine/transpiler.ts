/**
 * Transpilador experimental de Pseudocódigo a Python 3 y Rust
 * Proporciona proyecciones sintácticas idiomáticas con fines didácticos.
 *
 * Alcance y limitaciones:
 * - Diseñado para algoritmos educativos (declaraciones, lectura/escritura, condicionales, bucles, arreglos básicos 1D/2D).
 * - En Rust, arreglos >2D o mutabilidad compleja pueden requerir estructuras manuales adicionales.
 * - Enmascaramiento de cadenas: previene que palabras clave (NO, Y, O, =) dentro de literales sean corrompidas.
 * - Inicialización por defecto de variables para evitar UnboundLocalError en Python y errores de tipo en Rust.
 * - Generación de 'pass' en bloques Python vacíos para asegurar código ejecutable y válido.
 * - Indexación de arreglos multidimensionales compatible con Python y Rust ([i, j] -> [i][j]).
 */

export function maskStrings(code: string): { masked: string; strings: string[] } {
  const strings: string[] = [];
  const masked = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (match) => {
    const placeholder = `__PSEUDO_STR_${strings.length}__`;
    strings.push(match);
    return placeholder;
  });
  return { masked, strings };
}

export function unmaskStrings(code: string, strings: string[]): string {
  return code.replace(/__PSEUDO_STR_(\d+)__/g, (_, idx) => {
    const num = Number(idx);
    return strings[num] !== undefined ? strings[num] : '';
  });
}

function splitArgs(raw: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let quoteChar = '';
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if ((ch === '"' || ch === "'") && (i === 0 || raw[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        quoteChar = ch;
      } else if (ch === quoteChar) {
        inString = false;
      }
    } else if (!inString) {
      if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    }

    if (ch === ',' && !inString && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

export function convertArrayIndices(expr: string): string {
  return expr.replace(/\[([^\]]+)\]/g, (match, inner) => {
    if (inner.includes(',')) {
      const parts = inner.split(',').map((p: string) => p.trim());
      return `[${parts.join('][')}]`;
    }
    return match;
  });
}

export function convertConditionToPython(cond: string): string {
  const { masked, strings } = maskStrings(cond);
  let res = masked
    .replace(/\bVerdadero\b/gi, 'True')
    .replace(/\bFalso\b/gi, 'False')
    .replace(/\bY\b/g, ' and ')
    .replace(/\bO\b/g, ' or ')
    .replace(/\bNO\b/g, ' not ')
    .replace(/<>/g, '!=')
    .replace(/\^/g, '**')
    .replace(/\bMOD\b/gi, '%')
    .replace(/\bDIV\b/gi, '//')
    .replace(/\bEste\./g, 'self.');

  // Reemplazar '=' simple por '==' sin afectar '<=', '>=', '!=', ':=', '=='
  res = res.replace(/(?<![<>=!:])=(?!=)/g, '==');
  res = convertArrayIndices(res);
  return unmaskStrings(res, strings).trim();
}

export function convertExpressionToPython(expr: string): string {
  const { masked, strings } = maskStrings(expr);
  let res = masked
    .replace(/\bVerdadero\b/gi, 'True')
    .replace(/\bFalso\b/gi, 'False')
    .replace(/\bY\b/g, ' and ')
    .replace(/\bO\b/g, ' or ')
    .replace(/\bNO\b/g, ' not ')
    .replace(/<>/g, '!=')
    .replace(/\^/g, '**')
    .replace(/\bMOD\b/gi, '%')
    .replace(/\bDIV\b/gi, '//')
    .replace(/\bEste\./g, 'self.')
    .replace(/\bNuevo\s+([a-zA-Z0-9_]+)/g, '$1')
    .replace(/\b(?:rc|raiz)\s*\(/gi, 'math.sqrt(')
    .replace(/\b(?:sen|seno)\s*\(/gi, 'math.sin(')
    .replace(/\b(?:cos|coseno)\s*\(/gi, 'math.cos(')
    .replace(/\b(?:tan|tangente)\s*\(/gi, 'math.tan(')
    .replace(/\bln\s*\(/gi, 'math.log(')
    .replace(/\bexp\s*\(/gi, 'math.exp(')
    .replace(/\btrunc\s*\(/gi, 'math.trunc(')
    .replace(/\bredon\s*\(/gi, 'round(');

  res = convertArrayIndices(res);
  return unmaskStrings(res, strings).trim();
}

export function convertConditionToRust(cond: string): string {
  const { masked, strings } = maskStrings(cond);
  let res = masked
    .replace(/\bVerdadero\b/gi, 'true')
    .replace(/\bFalso\b/gi, 'false')
    .replace(/\bY\b/g, ' && ')
    .replace(/\bO\b/g, ' || ')
    .replace(/\bNO\b/g, ' !')
    .replace(/<>/g, '!=')
    .replace(/\bMOD\b/gi, '%')
    .replace(/(\([^()]+\)|[a-zA-Z0-9_.]+)\s*\^\s*(\([^()]+\)|[a-zA-Z0-9_.]+)/g, 'i64::pow($1, ($2) as u32)');

  // Reemplazar '=' simple por '==' sin afectar '<=', '>=', '!=', ':=', '=='
  res = res.replace(/(?<![<>=!:])=(?!=)/g, '==');
  res = convertArrayIndices(res);
  return unmaskStrings(res, strings).trim();
}

export function convertExpressionToRust(expr: string): string {
  const { masked, strings } = maskStrings(expr);
  let res = masked
    .replace(/\bVerdadero\b/gi, 'true')
    .replace(/\bFalso\b/gi, 'false')
    .replace(/\bMOD\b/gi, '%')
    .replace(/\bDIV\b/gi, '/')
    .replace(/<>/g, '!=')
    .replace(/(\([^()]+\)|[a-zA-Z0-9_.]+)\s*\^\s*(\([^()]+\)|[a-zA-Z0-9_.]+)/g, 'i64::pow($1, ($2) as u32)');

  res = convertArrayIndices(res);
  return unmaskStrings(res, strings).trim();
}

function generatePythonNestedList(dims: string[]): string {
  if (dims.length === 1) return `[0] * ${dims[0]}`;
  let res = `[0] * ${dims[dims.length - 1]}`;
  for (let i = dims.length - 2; i >= 0; i--) {
    res = `[${res} for _ in range(${dims[i]})]`;
  }
  return res;
}

function ensurePythonBlockBodies(lines: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    const trimmed = lines[i].trim();
    if (trimmed.endsWith(':') && !trimmed.startsWith('#')) {
      const baseIndent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
      let hasStatement = false;
      let j = i + 1;
      while (j < lines.length) {
        const nextRaw = lines[j];
        const nextTrimmed = nextRaw.trim();
        if (!nextTrimmed) {
          j++;
          continue;
        }
        const nextIndent = nextRaw.match(/^(\s*)/)?.[1].length ?? 0;
        if (nextIndent <= baseIndent) {
          break;
        }
        if (!nextTrimmed.startsWith('#')) {
          hasStatement = true;
          break;
        }
        j++;
      }
      if (!hasStatement) {
        result.push(' '.repeat(baseIndent + 4) + 'pass');
      }
    }
  }
  return result;
}

export function transpileToPython(pseudocode: string): string {
  const lines = pseudocode.split('\n');
  const pyLines: string[] = [];
  const varTypes = new Map<string, string>();
  let indent = 0;
  let hasMain = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      pyLines.push('');
      continue;
    }

    // Comentarios
    if (line.startsWith('//')) {
      pyLines.push('    '.repeat(indent) + '# ' + line.substring(2).trim());
      continue;
    }

    // Cierres de bloques
    if (/^(FinProceso|FinAlgoritmo|endAlgorithm|FinSi|endif|FinMientras|endwhile|FinPara|endfor|FinSubProceso|endsubprogram|FinClase|endclass|FinMetodo|endmethod|FinSegun|endswitch)/i.test(line)) {
      indent = Math.max(0, indent - 1);
      continue;
    }

    if (/^(SiNo|else)/i.test(line)) {
      pyLines.push('    '.repeat(Math.max(0, indent - 1)) + 'else:');
      continue;
    }

    // Proceso / Algoritmo
    const procMatch = line.match(/^(?:Proceso|Algoritmo|algorithm)\s+([a-zA-Z0-9_]+)/i);
    if (procMatch) {
      hasMain = true;
      pyLines.push(`def main():`);
      indent++;
      continue;
    }

    // Definir / define (declare)
    if (/^(?:Definir|define)\s+/i.test(line)) {
      const m = line.match(/^(?:Definir|define)\s+(.+?)\s+(?:Como|as)\s+([a-zA-Z0-9_]+)/i);
      if (m) {
        const rawVars = m[1].split(',').map(s => s.trim());
        const dataType = m[2].toLowerCase();
        for (const v of rawVars) {
          varTypes.set(v.toLowerCase(), dataType);
          if (dataType === 'cadena' || dataType === 'texto' || dataType === 'caracter') {
            pyLines.push('    '.repeat(indent) + `${v}: str = ""`);
          } else if (dataType === 'real') {
            pyLines.push('    '.repeat(indent) + `${v}: float = 0.0`);
          } else if (dataType === 'logico' || dataType === 'boolean') {
            pyLines.push('    '.repeat(indent) + `${v}: bool = False`);
          } else {
            pyLines.push('    '.repeat(indent) + `${v}: int = 0`);
          }
        }
      }
      continue;
    }

    // Dimension -> creación de lista multidimensional
    const dimMatch = line.match(/^(?:Dimension|dimension)\s+([a-zA-Z0-9_]+)\[([^\]]+)\]/i);
    if (dimMatch) {
      const name = dimMatch[1];
      const dims = dimMatch[2].split(',').map(s => s.trim());
      pyLines.push('    '.repeat(indent) + `${name} = ${generatePythonNestedList(dims)}`);
      continue;
    }

    // Escribir / write
    const writeMatch = line.match(/^(?:Escribir|write)\s+(.+?);?$/i);
    if (writeMatch) {
      const rawArgs = writeMatch[1].replace(/;+$/, '').trim();
      const parts = splitArgs(rawArgs);
      const pyParts = parts.map(p => convertExpressionToPython(p));
      if (pyParts.length > 1) {
        pyLines.push('    '.repeat(indent) + `print(${pyParts.join(', ')}, sep="")`);
      } else {
        pyLines.push('    '.repeat(indent) + `print(${pyParts[0] || "''"})`);
      }
      continue;
    }

    // Leer / read (sensible al tipo de dato declarado)
    const readMatch = line.match(/^(?:Leer|read)\s+(.+?);?$/i);
    if (readMatch) {
      const targets = readMatch[1].replace(/;+$/, '').split(',').map(s => s.trim());
      for (const target of targets) {
        const t = varTypes.get(target.toLowerCase());
        if (t === 'cadena' || t === 'texto' || t === 'caracter') {
          pyLines.push('    '.repeat(indent) + `${target} = input()`);
        } else if (t === 'real') {
          pyLines.push('    '.repeat(indent) + `${target} = float(input())`);
        } else if (t === 'logico') {
          pyLines.push('    '.repeat(indent) + `${target} = input().strip().lower() in ('verdadero', 'true', '1')`);
        } else {
          pyLines.push('    '.repeat(indent) + `${target} = int(input())`);
        }
      }
      continue;
    }

    // Si / if
    const ifMatch = line.match(/^(?:Si|if)\s+(.+?)\s+(?:Entonces|then)/i);
    if (ifMatch) {
      const cond = convertConditionToPython(ifMatch[1]);
      pyLines.push('    '.repeat(indent) + `if ${cond}:`);
      indent++;
      continue;
    }

    // Mientras / while
    const whileMatch = line.match(/^(?:Mientras|while)\s+(.+?)\s+(?:Hacer|do)/i);
    if (whileMatch) {
      const cond = convertConditionToPython(whileMatch[1]);
      pyLines.push('    '.repeat(indent) + `while ${cond}:`);
      indent++;
      continue;
    }

    // Para / for
    const forMatch = line.match(/^(?:Para|for)\s+([a-zA-Z0-9_]+)\s*(?:<-|:=|=)\s*(.+?)\s+(?:Hasta|to)\s+(.+?)(?:\s+(?:Con Paso|step)\s+(.+?))?\s+(?:Hacer|do)/i);
    if (forMatch) {
      const v = forMatch[1];
      const start = convertExpressionToPython(forMatch[2].trim());
      const end = convertExpressionToPython(forMatch[3].trim());
      const step = forMatch[4]?.trim() || '1';
      const stepNum = Number(step);
      if (!isNaN(stepNum)) {
        if (stepNum < 0) {
          pyLines.push('    '.repeat(indent) + `for ${v} in range(${start}, (${end}) - 1, ${stepNum}):`);
        } else {
          pyLines.push('    '.repeat(indent) + `for ${v} in range(${start}, (${end}) + 1, ${stepNum}):`);
        }
      } else {
        const stepExpr = convertExpressionToPython(step);
        pyLines.push('    '.repeat(indent) + `for ${v} in range(${start}, (${end}) + (1 if (${stepExpr}) > 0 else -1), ${stepExpr}):`);
      }
      indent++;
      continue;
    }

    // Clase
    const classMatch = line.match(/^(?:Clase|class)\s+([a-zA-Z0-9_]+)(?:\s+(?:Hereda De|inherits)\s+([a-zA-Z0-9_]+))?/i);
    if (classMatch) {
      const parent = classMatch[2] ? `(${classMatch[2]})` : '';
      pyLines.push('    '.repeat(indent) + `class ${classMatch[1]}${parent}:`);
      indent++;
      continue;
    }

    // Metodo / SubProceso
    const methodMatch = line.match(/^(?:(?:Publico|Privado)\s+)?(?:Metodo|SubProceso|subprogram|method)\s+([a-zA-Z0-9_]+)\((.*?)\)/i);
    if (methodMatch) {
      const name = methodMatch[1];
      const params = methodMatch[2] ? `self, ${methodMatch[2]}` : 'self';
      pyLines.push('    '.repeat(indent) + `def ${name}(${params}):`);
      indent++;
      continue;
    }

    // Asignación <-, :=, =
    const assignMatch = line.match(/^([a-zA-Z0-9_[\].,\s]+?)\s*(?:<-|:=|=)\s*(.+?);?$/);
    if (assignMatch && !line.startsWith('Para') && !line.startsWith('Si') && !line.startsWith('Mientras')) {
      const target = convertArrayIndices(assignMatch[1].trim().replace(/\bEste\./g, 'self.'));
      const expr = convertExpressionToPython(assignMatch[2].trim());
      pyLines.push('    '.repeat(indent) + `${target} = ${expr}`);
      continue;
    }

    // Fallback general para líneas sueltas (ej. llamadas a función/método)
    const cleanLine = convertExpressionToPython(line.replace(/;+$/, ''));
    pyLines.push('    '.repeat(indent) + cleanLine);
  }

  const processed = ensurePythonBlockBodies(pyLines);
  const needsMath = processed.some(l => /\bmath\./.test(l));

  if (hasMain) {
    processed.push('');
    processed.push('if __name__ == "__main__":');
    processed.push('    main()');
  }

  if (needsMath) {
    return 'import math\n\n' + processed.join('\n');
  }

  return processed.join('\n');
}

export function transpileToRust(pseudocode: string): string {
  const lines = pseudocode.split('\n');
  const rsLines: string[] = ['fn main() {'];
  const varTypes = new Map<string, string>();
  let indent = 1;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('//')) {
      rsLines.push('    '.repeat(indent) + line);
      continue;
    }

    if (/^(?:Proceso|Algoritmo|algorithm)\s+/i.test(line)) {
      continue;
    }

    if (/^(FinProceso|FinAlgoritmo|endAlgorithm)/i.test(line)) {
      continue;
    }

    if (/^(FinSi|endif|FinMientras|endwhile|FinPara|endfor|FinSubProceso|endsubprogram|FinClase|endclass|FinMetodo|endmethod|FinSegun|endswitch)/i.test(line)) {
      indent = Math.max(1, indent - 1);
      rsLines.push('    '.repeat(indent) + '}');
      continue;
    }

    if (/^(SiNo|else)/i.test(line)) {
      rsLines.push('    '.repeat(Math.max(1, indent - 1)) + '} else {');
      continue;
    }

    // Declaraciones
    const defMatch = line.match(/^(?:Definir|define)\s+(.+?)\s+(?:Como|as)\s+([a-zA-Z0-9_]+)/i);
    if (defMatch) {
      const typeMap: Record<string, string> = {
        'entero': 'i64',
        'real': 'f64',
        'cadena': 'String',
        'texto': 'String',
        'caracter': 'char',
        'logico': 'bool'
      };
      const rawVars = defMatch[1].split(',').map(s => s.trim());
      const t = typeMap[defMatch[2].toLowerCase()] || 'i64';
      for (const v of rawVars) {
        varTypes.set(v.toLowerCase(), t);
        rsLines.push('    '.repeat(indent) + `let mut ${v}: ${t} = Default::default();`);
      }
      continue;
    }

    // Dimension
    const dimMatch = line.match(/^(?:Dimension|dimension)\s+([a-zA-Z0-9_]+)\[([^\]]+)\]/i);
    if (dimMatch) {
      const name = dimMatch[1];
      const dims = dimMatch[2].split(',').map(s => s.trim());
      if (dims.length === 1) {
        rsLines.push('    '.repeat(indent) + `let mut ${name} = vec![0i64; (${dims[0]}) as usize];`);
      } else if (dims.length === 2) {
        rsLines.push('    '.repeat(indent) + `let mut ${name} = vec![vec![0i64; (${dims[1]}) as usize]; (${dims[0]}) as usize];`);
      } else {
        rsLines.push('    '.repeat(indent) + `let mut ${name} = vec![0i64; (${dims.join(' * ')}) as usize]; // ${dims.length}D`);
      }
      continue;
    }

    // Leer
    const readMatch = line.match(/^(?:Leer|read)\s+(.+?);?$/i);
    if (readMatch) {
      const targets = readMatch[1].replace(/;+$/, '').split(',').map(s => s.trim());
      for (const target of targets) {
        const t = varTypes.get(target.toLowerCase()) || 'i64';
        rsLines.push('    '.repeat(indent) + `{`);
        rsLines.push('    '.repeat(indent + 1) + `let mut _buf = String::new();`);
        rsLines.push('    '.repeat(indent + 1) + `let _ = std::io::stdin().read_line(&mut _buf);`);
        if (t === 'String') {
          rsLines.push('    '.repeat(indent + 1) + `${target} = _buf.trim_end().to_string();`);
        } else if (t === 'bool') {
          rsLines.push('    '.repeat(indent + 1) + `let _clean = _buf.trim().to_lowercase();`);
          rsLines.push('    '.repeat(indent + 1) + `${target} = _clean == "true" || _clean == "verdadero" || _clean == "1";`);
        } else {
          rsLines.push('    '.repeat(indent + 1) + `${target} = _buf.trim().parse().unwrap_or_default();`);
        }
        rsLines.push('    '.repeat(indent) + `}`);
      }
      continue;
    }

    // Escribir: soporta múltiples argumentos y cadenas con comas
    const writeMatch = line.match(/^(?:Escribir|write)\s+(.+?);?$/i);
    if (writeMatch) {
      const rawArgs = writeMatch[1].replace(/;+$/, '').trim();
      const parts = splitArgs(rawArgs);
      const rsParts = parts.map(p => convertExpressionToRust(p));
      if (rsParts.length === 1) {
        rsLines.push('    '.repeat(indent) + `println!("{}", ${rsParts[0]});`);
      } else {
        const fmt = rsParts.map(() => '{}').join('');
        rsLines.push('    '.repeat(indent) + `println!("${fmt}", ${rsParts.join(', ')});`);
      }
      continue;
    }

    // Asignación
    const assignMatch = line.match(/^([a-zA-Z0-9_[\].,\s]+?)\s*(?:<-|:=|=)\s*(.+?);?$/);
    if (assignMatch && !line.startsWith('Para') && !line.startsWith('Si') && !line.startsWith('Mientras')) {
      const rawTarget = convertArrayIndices(assignMatch[1].trim());
      let rhs = convertExpressionToRust(assignMatch[2].trim());
      const targetType = varTypes.get(rawTarget.toLowerCase());
      if (targetType === 'String' && (rhs.startsWith('"') || rhs.startsWith("'"))) {
        rhs = `${rhs}.to_string()`;
      }
      if (/^[a-zA-Z0-9_]+$/.test(rawTarget) && !varTypes.has(rawTarget.toLowerCase())) {
        varTypes.set(rawTarget.toLowerCase(), 'auto');
        if (rhs.startsWith('"') || rhs.startsWith("'")) {
          rsLines.push('    '.repeat(indent) + `let mut ${rawTarget} = ${rhs}.to_string();`);
        } else {
          rsLines.push('    '.repeat(indent) + `let mut ${rawTarget} = ${rhs};`);
        }
      } else {
        rsLines.push('    '.repeat(indent) + `${rawTarget} = ${rhs};`);
      }
      continue;
    }

    // Bucles
    const whileMatch = line.match(/^(?:Mientras|while)\s+(.+?)\s+(?:Hacer|do)/i);
    if (whileMatch) {
      const cond = convertConditionToRust(whileMatch[1]);
      rsLines.push('    '.repeat(indent) + `while ${cond} {`);
      indent++;
      continue;
    }

    const forMatch = line.match(/^(?:Para|for)\s+([a-zA-Z0-9_]+)\s*(?:<-|:=|=)\s*(.+?)\s+(?:Hasta|to)\s+(.+?)(?:\s+(?:Con Paso|step)\s+(.+?))?\s+(?:Hacer|do)/i);
    if (forMatch) {
      const v = forMatch[1];
      const start = forMatch[2].trim();
      const end = forMatch[3].trim();
      const stepRaw = forMatch[4]?.trim();

      if (stepRaw) {
        const stepNum = Number(stepRaw);
        if (!isNaN(stepNum) && stepNum < 0) {
          const absStep = Math.abs(stepNum);
          if (absStep === 1) {
            rsLines.push('    '.repeat(indent) + `for ${v} in (${end}..=${start}).rev() {`);
          } else {
            rsLines.push('    '.repeat(indent) + `for ${v} in (${end}..=${start}).rev().step_by(${absStep}) {`);
          }
        } else {
          rsLines.push('    '.repeat(indent) + `for ${v} in (${start}..=${end}).step_by(${stepRaw}) {`);
        }
      } else {
        rsLines.push('    '.repeat(indent) + `for ${v} in ${start}..=${end} {`);
      }
      indent++;
      continue;
    }

    // Condicionales Si
    const ifMatch = line.match(/^(?:Si|if)\s+(.+?)\s+(?:Entonces|then)/i);
    if (ifMatch) {
      const cond = convertConditionToRust(ifMatch[1]);
      rsLines.push('    '.repeat(indent) + `if ${cond} {`);
      indent++;
      continue;
    }
  }

  rsLines.push('}');
  return rsLines.join('\n');
}
