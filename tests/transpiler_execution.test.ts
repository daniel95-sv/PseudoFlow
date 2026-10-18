import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';
import { Interpreter } from '../src/engine/interpreter';
import { transpileToPython, transpileToRust } from '../src/engine/transpiler';

function runInterpreter(code: string, inputs: string[] = []): string[] {
  const tokens = new Lexer(code).tokenize();
  const ast = new Parser(tokens).parse();
  const interp = new Interpreter(ast);
  const result = interp.runAll(inputs, true);
  return result.outputs;
}

function runPython(pyCode: string, inputs: string[] = []): { stdout: string; stderr: string; status: number | null } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseudoflow_py_'));
  const scriptFile = path.join(tmpDir, 'script.py');
  try {
    fs.writeFileSync(scriptFile, pyCode, 'utf-8');
    const res = spawnSync('python', [scriptFile], {
      input: inputs.length ? inputs.join('\n') + '\n' : '',
      encoding: 'utf-8',
      timeout: 10000
    });
    return {
      stdout: (res.stdout || '').replace(/\r\n/g, '\n').trim(),
      stderr: (res.stderr || '').trim(),
      status: res.status
    };
  } finally {
    try {
      if (fs.existsSync(scriptFile)) fs.unlinkSync(scriptFile);
      fs.rmdirSync(tmpDir);
    } catch {
      // Ignorar limpieza de archivos bloqueados temporalmente
    }
  }
}

const isRustcAvailable = (() => {
  try {
    const res = spawnSync('rustc', ['--version'], { encoding: 'utf-8' });
    return res.status === 0;
  } catch {
    return false;
  }
})();

function compileAndRunRust(rsCode: string, inputs: string[] = []): { stdout: string; stderr: string; status: number | null; compiled: boolean } {
  if (!isRustcAvailable) {
    return { stdout: '', stderr: 'rustc no disponible en este entorno', status: null, compiled: false };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseudoflow_rs_'));
  const srcFile = path.join(tmpDir, 'main.rs');
  const binName = process.platform === 'win32' ? 'main.exe' : 'main';
  const binFile = path.join(tmpDir, binName);

  try {
    fs.writeFileSync(srcFile, rsCode, 'utf-8');
    const compileRes = spawnSync('rustc', ['-C', 'opt-level=0', srcFile, '-o', binFile], {
      encoding: 'utf-8',
      timeout: 25000
    });

    if (compileRes.status !== 0) {
      return {
        stdout: '',
        stderr: `Error de compilación rustc: ${compileRes.stderr}`,
        status: compileRes.status,
        compiled: false
      };
    }

    if (process.platform !== 'win32' && fs.existsSync(binFile)) {
      try {
        fs.chmodSync(binFile, 0o755);
      } catch {
        // Ignorar si ya tiene permisos de ejecución
      }
    }

    const runRes = spawnSync(binFile, [], {
      input: inputs.length ? inputs.join('\n') + '\n' : '',
      encoding: 'utf-8',
      timeout: 10000
    });

    return {
      stdout: (runRes.stdout || '').replace(/\r\n/g, '\n').trim(),
      stderr: (runRes.stderr || '').trim(),
      status: runRes.status,
      compiled: true
    };
  } finally {
    try {
      if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
      if (fs.existsSync(srcFile)) fs.unlinkSync(srcFile);
      fs.rmdirSync(tmpDir);
    } catch {
      // Ignorar limpieza de archivos bloqueados temporalmente
    }
  }
}

describe('Real Transpiled Code Execution & Compiler Verification (Auditoría PF-03 y PF-04)', () => {
  it('executes exponentiation (^) and modulo in Python matching Interpreter output', () => {
    const code = `
      Algoritmo TestPotencia
        Definir a Como Entero;
        Definir b Como Entero;
        Definir c Como Entero;
        a <- 2;
        b <- 3;
        c <- a ^ b + (10 MOD 4);
        Escribir "Resultado:", c;
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['Resultado:10']);

    const py = transpileToPython(code);
    expect(py).toContain('a ** b');
    expect(py).toContain('10 % 4');

    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout).toBe('Resultado:10');
  }, 15000);

  it('preserves keywords inside string literals ("NO", "Y", "O") without corruption in Python', () => {
    const code = `
      Algoritmo TestCadenas
        Definir s1 Como Cadena;
        Definir s2 Como Cadena;
        s1 <- "NO";
        s2 <- "HAY O NO HAY";
        Si s1 = "NO" Y s2 <> "Y" Entonces
          Escribir "Validacion: ", s1, " en ", s2;
        SiNo
          Escribir "Fallo de validacion";
        FinSi
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['Validacion: NO en HAY O NO HAY']);

    const py = transpileToPython(code);
    expect(py).toContain('s1 == "NO"');
    expect(py).not.toContain('" not "');
    expect(py).not.toContain('" or "');

    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout).toBe('Validacion: NO en HAY O NO HAY');
  }, 15000);

  it('initializes declared variables to default types preventing UnboundLocalError in Python', () => {
    const code = `
      Algoritmo TestDefinir
        Definir enteroVar Como Entero;
        Definir realVar Como Real;
        Definir textoVar Como Cadena;
        Definir flagVar Como Logico;
        Escribir "E=", enteroVar, ", R=", realVar, ", T=[", textoVar, "], F=", flagVar;
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs[0]).toContain('E=0, R=0.0, T=[], F=Falso');

    const py = transpileToPython(code);
    expect(py).toContain('enteroVar: int = 0');
    expect(py).toContain('realVar: float = 0.0');
    expect(py).toContain('textoVar: str = ""');
    expect(py).toContain('flagVar: bool = False');

    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout).toBe('E=0, R=0.0, T=[], F=False');
  }, 15000);

  it('executes ascending and descending Para loops matching Interpreter output in Python', () => {
    const code = `
      Algoritmo TestParaReal
        Definir i Como Entero;
        Para i <- 1 Hasta 3 Con Paso 1 Hacer
          Escribir "Asc:", i;
        FinPara
        Para i <- 3 Hasta 1 Con Paso -1 Hacer
          Escribir "Desc:", i;
        FinPara
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual([
      'Asc:1',
      'Asc:2',
      'Asc:3',
      'Desc:3',
      'Desc:2',
      'Desc:1'
    ]);

    const py = transpileToPython(code);
    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout.split('\n')).toEqual(interpOutputs);
  }, 15000);

  it('executes Mientras loops with combined conditions matching Interpreter output in Python', () => {
    const code = `
      Algoritmo TestMientrasReal
        Definir x Como Entero;
        x <- 1;
        Mientras x < 5 Y NO (x = 3) Hacer
          Escribir "x=", x;
          x <- x + 1;
        FinMientras
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['x=1', 'x=2']);

    const py = transpileToPython(code);
    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout.split('\n')).toEqual(['x=1', 'x=2']);
  }, 15000);

  it('executes multidimensional arrays (Dimension) matching Interpreter output in Python', () => {
    const code = `
      Algoritmo TestMatrizReal
        Dimension matriz[2, 2];
        matriz[0, 0] <- 5;
        matriz[0, 1] <- 15;
        matriz[1, 0] <- 25;
        matriz[1, 1] <- matriz[0, 0] + matriz[0, 1] + matriz[1, 0];
        Escribir "TotalMatriz:", matriz[1, 1];
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['TotalMatriz:45']);

    const py = transpileToPython(code);
    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout).toBe('TotalMatriz:45');
  }, 15000);

  it('emits pass for empty blocks or comments-only code avoiding IndentationError in Python', () => {
    const code = `
      Algoritmo AlgoritmoVacio
        // Solo comentarios descriptivos
        // Ninguna instruccion ejecutable
      FinAlgoritmo
    `;

    const py = transpileToPython(code);
    expect(py).toContain('pass');

    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
  }, 15000);

  it('reads typed user inputs via stdin matching Interpreter output in Python', () => {
    const code = `
      Algoritmo TestLecturaReal
        Definir nombre Como Cadena;
        Definir edad Como Entero;
        Definir factor Como Real;
        Leer nombre;
        Leer edad;
        Leer factor;
        Escribir "Usuario:", nombre, ",Edad:", edad, ",Factor:", factor;
      FinAlgoritmo
    `;

    const inputs = ['Alejandro', '30', '2.5'];
    const interpOutputs = runInterpreter(code, inputs);
    expect(interpOutputs).toEqual(['Usuario:Alejandro,Edad:30,Factor:2.5']);

    const py = transpileToPython(code);
    const pyRes = runPython(py, inputs);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout).toBe('Usuario:Alejandro,Edad:30,Factor:2.5');
  }, 15000);

  it('verifies Rust transpilation syntax and executes with rustc when available (CI/local)', () => {
    const code = `
      Algoritmo TestRustReal
        Definir a Como Entero;
        Definir b Como Entero;
        Definir c Como Entero;
        Definir s Como Cadena;
        a <- 2;
        b <- 3;
        c <- a ^ b;
        s <- "NO";
        Si s = "NO" Y c = 8 Entonces
          Escribir "RustExito:", c;
        FinSi
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['RustExito:8']);

    const rust = transpileToRust(code);
    // Verificaciones sintácticas obligatorias (siempre aplican)
    expect(rust).toContain('i64::pow(a, (b) as u32)');
    expect(rust).toContain('s == "NO"');
    expect(rust).not.toContain('" !"');
    expect(rust).toContain('let mut c: i64 = Default::default();');
    expect(rust).toContain('println!("{}{}", "RustExito:", c);');

    // Compilación y ejecución nativa con rustc si está instalado en el host/CI
    if (isRustcAvailable) {
      const rsRes = compileAndRunRust(rust);
      expect(rsRes.compiled).toBe(true);
      expect(rsRes.status).toBe(0);
      expect(rsRes.stdout).toBe('RustExito:8');
    }
  }, 35000);

  it('executes Escribir Sin Saltar and empty Escribir matching interpreter in Python', () => {
    const code = `
      Algoritmo TestSinSaltar
        Definir i Como Entero;
        Para i <- 1 Hasta 3 Con Paso 1 Hacer
          Escribir Sin Saltar i, "-";
        FinPara
        Escribir;
        Escribir "Fin";
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['1-2-3-', 'Fin']);

    const py = transpileToPython(code);
    expect(py).toContain('end=""');
    expect(py).toContain('print()');

    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout.split('\n')).toEqual(interpOutputs);
  }, 15000);

  it('executes Repetir ... Hasta Que matching interpreter in Python', () => {
    const code = `
      Algoritmo TestRepetirReal
        Definir suma Como Entero;
        Definir contador Como Entero;
        suma <- 0;
        contador <- 1;
        Repetir
          suma <- suma + contador;
          contador <- contador + 1;
        Hasta Que contador > 5;
        Escribir "SumaFinal:", suma;
      FinAlgoritmo
    `;

    const interpOutputs = runInterpreter(code);
    expect(interpOutputs).toEqual(['SumaFinal:15']);

    const py = transpileToPython(code);
    expect(py).toContain('while True:');
    expect(py).toContain('if contador > 5:');
    expect(py).toContain('break');

    const pyRes = runPython(py);
    expect(pyRes.status).toBe(0);
    expect(pyRes.stdout).toBe('SumaFinal:15');
  }, 15000);
});
