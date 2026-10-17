export function transpileToPython(pseudocode: string): string {
  const lines = pseudocode.split('\n');
  const pyLines: string[] = [];
  let indent = 0;

  for (let raw of lines) {
    let line = raw.trim();
    if (!line) {
      pyLines.push('');
      continue;
    }

    // Comment
    if (line.startsWith('//')) {
      pyLines.push('    '.repeat(indent) + '# ' + line.substring(2).trim());
      continue;
    }

    // Ends
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

    // Definir / define (declare) -> optional in Python
    if (/^(?:Definir|define)\s+/i.test(line)) {
      // e.g. Definir a Como Entero; -> # a: int
      const m = line.match(/^(?:Definir|define)\s+([a-zA-Z0-9_]+)\s+(?:Como|as)\s+([a-zA-Z0-9_]+)/i);
      if (m) {
        pyLines.push('    '.repeat(indent) + `# ${m[1]}: ${m[2]}`);
      }
      continue;
    }

    // Dimension -> list creation
    const dimMatch = line.match(/^(?:Dimension|dimension)\s+([a-zA-Z0-9_]+)\[([^\]]+)\]/i);
    if (dimMatch) {
      const name = dimMatch[1];
      const dims = dimMatch[2].split(',').map(s => s.trim());
      if (dims.length === 1) {
        pyLines.push('    '.repeat(indent) + `${name} = [0] * ${dims[0]}`);
      } else if (dims.length === 2) {
        pyLines.push('    '.repeat(indent) + `${name} = [[0] * ${dims[1]} for _ in range(${dims[0]})]`);
      }
      continue;
    }

    // Escribir / write
    const writeMatch = line.match(/^(?:Escribir|write)\s+(.+?);?$/i);
    if (writeMatch) {
      let args = writeMatch[1].replace(/;/g, '');
      pyLines.push('    '.repeat(indent) + `print(${args})`);
      continue;
    }

    // Leer / read
    const readMatch = line.match(/^(?:Leer|read)\s+([a-zA-Z0-9_]+);?$/i);
    if (readMatch) {
      pyLines.push('    '.repeat(indent) + `${readMatch[1]} = int(input())`);
      continue;
    }

    // Si / if
    const ifMatch = line.match(/^(?:Si|if)\s+(.+?)\s+(?:Entonces|then)/i);
    if (ifMatch) {
      const cond = ifMatch[1]
        .replace(/Y/g, 'and')
        .replace(/O/g, 'or')
        .replace(/NO/g, 'not')
        .replace(/=/g, '==')
        .replace(/<>/g, '!=');
      pyLines.push('    '.repeat(indent) + `if ${cond}:`);
      indent++;
      continue;
    }

    // Mientras / while
    const whileMatch = line.match(/^(?:Mientras|while)\s+(.+?)\s+(?:Hacer|do)/i);
    if (whileMatch) {
      const cond = whileMatch[1]
        .replace(/Y/g, 'and')
        .replace(/O/g, 'or')
        .replace(/NO/g, 'not')
        .replace(/=/g, '==')
        .replace(/<>/g, '!=');
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

    // Assignment <-
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
  let indent = 1;

  for (let raw of lines) {
    let line = raw.trim();
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

    // Declarations
    const defMatch = line.match(/^(?:Definir|define)\s+([a-zA-Z0-9_]+)\s+(?:Como|as)\s+([a-zA-Z0-9_]+)/i);
    if (defMatch) {
      const typeMap: Record<string, string> = {
        'entero': 'i64',
        'real': 'f64',
        'cadena': 'String',
        'logico': 'bool'
      };
      const t = typeMap[defMatch[2].toLowerCase()] || 'i64';
      rsLines.push('    '.repeat(indent) + `let mut ${defMatch[1]}: ${t} = Default::default();`);
      continue;
    }

    // Escribir
    const writeMatch = line.match(/^(?:Escribir|write)\s+(.+?);?$/i);
    if (writeMatch) {
      rsLines.push('    '.repeat(indent) + `println!("{}", ${writeMatch[1].replace(/;/g, '')});`);
      continue;
    }

    // Assignment
    const assignMatch = line.match(/^([a-zA-Z0-9_\[\],\. ]+?)\s*(?:<-|:=|=)\s*(.+?);?$/);
    if (assignMatch && !line.startsWith('Para') && !line.startsWith('Si') && !line.startsWith('Mientras')) {
      rsLines.push('    '.repeat(indent) + `${assignMatch[1].trim()} = ${assignMatch[2].trim()};`);
      continue;
    }

    // Loops
    const whileMatch = line.match(/^(?:Mientras|while)\s+(.+?)\s+(?:Hacer|do)/i);
    if (whileMatch) {
      rsLines.push('    '.repeat(indent) + `while ${whileMatch[1].replace(/=/g, '==')} {`);
      indent++;
      continue;
    }

    const forMatch = line.match(/^(?:Para|for)\s+([a-zA-Z0-9_]+)\s*(?:<-|:=|=)\s*(.+?)\s+(?:Hasta|to)\s+(.+?)(?:\s+(?:Con Paso|step)\s+(.+?))?\s+(?:Hacer|do)/i);
    if (forMatch) {
      rsLines.push('    '.repeat(indent) + `for ${forMatch[1]} in ${forMatch[2]}..=${forMatch[3]} {`);
      indent++;
      continue;
    }

    // If
    const ifMatch = line.match(/^(?:Si|if)\s+(.+?)\s+(?:Entonces|then)/i);
    if (ifMatch) {
      rsLines.push('    '.repeat(indent) + `if ${ifMatch[1].replace(/=/g, '==')} {`);
      indent++;
      continue;
    }
  }

  rsLines.push('}');
  return rsLines.join('\n');
}
