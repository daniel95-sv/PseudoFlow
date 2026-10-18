import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';
import { Interpreter } from '../src/engine/interpreter';
import { transpileToPython, transpileToRust } from '../src/engine/transpiler';

describe('Lexer Hardening (Auditoría P2)', () => {
  it('tokenizes standard pseudocode statements correctly', () => {
    const code = 'Algoritmo Test\n  Definir x Como Entero;\n  x <- 42;\n  Escribir x;\nFinAlgoritmo';
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    expect(tokens.length).toBeGreaterThan(5);
    expect(tokens[0].value).toBe('Algoritmo');
  });

  it('throws a descriptive lexical error on illegal/unknown characters', () => {
    const code = 'x <- 10 @ 2;';
    const lexer = new Lexer(code);
    expect(() => lexer.tokenize()).toThrowError(/Carácter no reconocido.*@/);
  });

  it('throws an error on unclosed string literal', () => {
    const code = 'Escribir "texto sin cerrar;';
    const lexer = new Lexer(code);
    expect(() => lexer.tokenize()).toThrowError(/Cadena literal sin cerrar/);
  });

  it('throws an error on unclosed block comment', () => {
    const code = '/* Comentario sin terminar\nx <- 10;';
    const lexer = new Lexer(code);
    expect(() => lexer.tokenize()).toThrowError(/Comentario de bloque.*sin cerrar/);
  });

  it('throws an error on numbers with multiple decimal points', () => {
    const code = 'x <- 12.34.56;';
    const lexer = new Lexer(code);
    expect(() => lexer.tokenize()).toThrowError(/Número mal formado/);
  });
});

describe('Transpiler Operator Integrity (Auditoría P1/P2)', () => {
  it('preserves <= and >= in conditions when transpiling to Python', () => {
    const code = 'Si a <= 10 Y b >= 5 Entonces\n  Escribir a;\nFinSi';
    const py = transpileToPython(code);
    expect(py).toContain('a <= 10');
    expect(py).toContain('b >= 5');
    expect(py).not.toContain('<==');
    expect(py).not.toContain('>==');
  });

  it('converts single = to == without breaking comparison operators in Python', () => {
    const code = 'Si a = 10 Entonces\n  Escribir a;\nFinSi';
    const py = transpileToPython(code);
    expect(py).toContain('a == 10');
  });

  it('preserves <=, >= and converts <> to != in Rust transpiler', () => {
    const code = 'Si a <= 10 Y b >= 5 Y c <> 0 Entonces\n  Escribir a;\nFinSi';
    const rust = transpileToRust(code);
    expect(rust).toContain('a <= 10');
    expect(rust).toContain('b >= 5');
    expect(rust).toContain('c != 0');
    expect(rust).not.toContain('<==');
    expect(rust).not.toContain('>==');
    expect(rust).not.toContain('<>');
  });

  it('formats multiple arguments in Rust println with matching {} placeholders', () => {
    const code = 'Escribir "Resultado:", x, "puntos";';
    const rust = transpileToRust(code);
    expect(rust).toContain('println!("{} {} {}",');
  });
});

describe('Interpreter Resource Limits & Isolation (Auditoría P1)', () => {
  it('terminates infinite while loops and captures MAX_STEPS error', () => {
    const code = `
      Algoritmo BucleInfinito
        Definir x Como Entero;
        x <- 1;
        Mientras x > 0 Hacer
          x <- x + 1;
        FinMientras
      FinAlgoritmo
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();
    const interp = new Interpreter(ast);

    expect(() => interp.runAll([], true)).toThrowError(/Límite de iteraciones alcanzado.*bucle infinito/i);
  });

  it('throws descriptive error on division by zero', () => {
    const code = `
      Algoritmo DivCero
        Definir x Como Real;
        x <- 10 / 0;
      FinAlgoritmo
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();
    const interp = new Interpreter(ast);

    expect(() => interp.runAll([], true)).toThrowError(/División por cero no permitida/);
  });

  it('throws descriptive error on modulo by zero', () => {
    const code = `
      Algoritmo ModCero
        Definir x Como Real;
        x <- 10 % 0;
      FinAlgoritmo
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();
    const interp = new Interpreter(ast);

    expect(() => interp.runAll([], true)).toThrowError(/Operación módulo con divisor cero no permitida/);
  });

  it('throws runtime error on uninitialized or undefined variables instead of silently returning 0', () => {
    const code = `
      Algoritmo VarNoDefinida
        Definir a Como Entero;
        a <- variableFantasma + 1;
      FinAlgoritmo
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();
    const interp = new Interpreter(ast);

    expect(() => interp.runAll([], true)).toThrowError(/Variable no definida o no inicializada/);
  });

  it('rejects unknown built-in functions with explicit error', () => {
    const code = `
      Algoritmo FuncionInvalida
        Definir res Como Real;
        res <- funcionDesconocida(10);
      FinAlgoritmo
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();
    const interp = new Interpreter(ast);

    expect(() => interp.runAll([], true)).toThrowError(/Función no definida o desconocida/);
  });

  it('implements short-circuit evaluation for logical Y and O', () => {
    // Falso Y (1 / 0 > 0) must not throw division by zero because left is false
    const codeY = `
      Algoritmo CortocircuitoY
        Definir r Como Logico;
        r <- Falso Y (1 / 0 > 0);
      FinAlgoritmo
    `;
    const lexerY = new Lexer(codeY);
    const parserY = new Parser(lexerY.tokenize());
    const astY = parserY.parse();
    const interpY = new Interpreter(astY);
    const resY = interpY.runAll();
    expect(resY.error).toBeUndefined();
    expect(interpY.getVariable('r')).toBe(false);

    // Verdadero O (1 / 0 > 0) must not throw division by zero because left is true
    const codeO = `
      Algoritmo CortocircuitoO
        Definir r Como Logico;
        r <- Verdadero O (1 / 0 > 0);
      FinAlgoritmo
    `;
    const lexerO = new Lexer(codeO);
    const parserO = new Parser(lexerO.tokenize());
    const astO = parserO.parse();
    const interpO = new Interpreter(astO);
    const resO = interpO.runAll();
    expect(resO.error).toBeUndefined();
    expect(interpO.getVariable('r')).toBe(true);
  });

  it('rejects array dimensions exceeding safety limits or non-positive dimensions', () => {
    const code = `
      Algoritmo ArregloEnorme
        Dimension a[200000];
      FinAlgoritmo
    `;
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();
    const interp = new Interpreter(ast);

    expect(() => interp.runAll([], true)).toThrowError(/superando el límite de/);
  });
});

describe('Code & State Synchronization (Auditoría P1)', () => {
  it('instantiates and executes updated code without retaining stale variables or statements', () => {
    const codeV1 = `
      Algoritmo Version1
        Definir v1 Como Entero;
        v1 <- 100;
      FinAlgoritmo
    `;
    const ast1 = new Parser(new Lexer(codeV1).tokenize()).parse();
    const interp1 = new Interpreter(ast1);
    interp1.runAll();
    expect(interp1.getVariable('v1')).toBe(100);

    // Now user modifies the code or selects a new exercise
    const codeV2 = `
      Algoritmo Version2
        Definir v2 Como Entero;
        v2 <- 999;
      FinAlgoritmo
    `;
    const ast2 = new Parser(new Lexer(codeV2).tokenize()).parse();
    const interp2 = new Interpreter(ast2);
    interp2.runAll();
    expect(interp2.getVariable('v2')).toBe(999);
    // Old variable v1 must not exist in interp2
    expect(() => interp2.getVariable('v1')).toThrowError(/Variable no definida/);
  });
});


