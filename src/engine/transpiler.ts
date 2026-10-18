/**
 * Transpilador experimental de Pseudocódigo a Python 3 y Rust
 * Proporciona correspondencias sintácticas idiomáticas y seguras para fines didácticos.
 */

function splitArgs(raw: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let quoteChar = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if ((ch === '"' || ch === "'") && (i === 0 || raw[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        quoteChar = ch;
      } else if (ch === quoteChar) {
        inString = false;
      }
    }
    if (ch === ',' && !inString) {
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

function convertConditionToPython(cond: string): string {
  let res = cond
    .replace(/\bVerdadero\b/gi, 'True')
    .replace(/\bFalso\b/gi, 'False')
    .replace(/\bY\b/g, ' and ')
    .replace(/\bO\b/g, ' or ')
    .replace(/\bNO\b/g, ' not ')
    .replace(/<>/g, '!=');

  // Reemplazar '=' simple por '==' sin afectar '<=', '>=', '!=', ':=', '=='
  res = res.replace(/(?<![<>=!:])=(?!=)/g, '==');
  return res.trim();
}

function convertConditionToRust(cond: string): string {
  let res = cond
    .replace(/\bVerdadero\b/gi, 'true')
    .replace(/\bFalso\b/gi, 'false')
    .replace(/\bY\b/g, ' && ')
    .replace(/\bO\b/g, ' || ')
    .replace(/\bNO\b/g, ' !')
    .replace(/<>/g, '!=');

  // Reemplazar '=' simple por '==' sin afectar '<=', '>=', '!=', ':=', '=='
  res = res.replace(/(?<![<>=!:])=(?!=)/g, '==');
  return res.trim();
}

function generatePythonNestedList(dims: string[]): string {
  if (dims.length === 1) return `[0] * ${dims[0]}`;
  let res = `[0] * ${dims[dims.length - 1]}`;
  for (let i = dims.length - 2; i >= 0; i--) {
    res = `[${res} for _ in range(${dims[i]})]`;
  }
  return res;
}

export function transpileToPython(pseudocode: string): string {
  const lines = pseudocode.split('\n');
  const pyLines: string[] = [];
  const varTypes = new Map<string, string>();
  let indent = 0;

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
        }
        pyLines.push('    '.repeat(indent) + `# ${m[1]}: ${m[2]}`);
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
      const args = writeMatch[1].replace(/;+$/, '');
      pyLines.push('    '.repeat(indent) + `print(${args})`);
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
      const start = forMatch[2];
      const end = forMatch[3];
      const step = forMatch[4] || '1';
      pyLines.push('    '.repeat(indent) + `for ${v} in range(${start}, (${end}) + 1, ${step}):`);
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

    // Asignación <-
    let cleanLine = line.replace(/<-/g, '=').replace(/;+$/, '');
    cleanLine = cleanLine.replace(/Este\./g, 'self.');
    cleanLine = cleanLine.replace(/Nuevo\s+([a-zA-Z0-9_]+)/g, '$1');
    pyLines.push('    '.repeat(indent) + cleanLine);
  }

  pyLines.push('');
  pyLines.push('if __name__ == "__main__":');
  pyLines.push('    main()');

  return pyLines.join('\n');
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
      if (parts.length === 1) {
        rsLines.push('    '.repeat(indent) + `println!("{}", ${parts[0]});`);
      } else {
        const fmt = parts.map(() => '{}').join(' ');
        rsLines.push('    '.repeat(indent) + `println!("${fmt}", ${parts.join(', ')});`);
      }
      continue;
    }

    // Asignación
    const assignMatch = line.match(/^([a-zA-Z0-9_[\\],. ]+?)\s*(?:<-|:=|=)\s*(.+?);?$/);
    if (assignMatch && !line.startsWith('Para') && !line.startsWith('Si') && !line.startsWith('Mientras')) {
      rsLines.push('    '.repeat(indent) + `${assignMatch[1].trim()} = ${assignMatch[2].trim()};`);
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
      rsLines.push('    '.repeat(indent) + `for ${forMatch[1]} in ${forMatch[2]}..=${forMatch[3]} {`);
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
