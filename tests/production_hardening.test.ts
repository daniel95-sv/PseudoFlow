import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';
import { Interpreter } from '../src/engine/interpreter';
import {
  runExerciseValidation,
  cancelCurrentValidation
} from '../src/engine/executionService';
import { InteractiveSession } from '../src/engine/interactiveExecutionService';
import { transpileToPython, transpileToRust } from '../src/engine/transpiler';

describe('A. Global Output Limits & Memory Hardening', () => {
  it('bounds total output characters across repeated Escribir Sin Saltar', () => {
    const code = `
      Proceso SalidaSinSaltar
        Definir i Como Entero;
        Para i <- 1 Hasta 5000 Hacer
          Escribir Sin Saltar "A";
        FinPara
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    // Configure tight budget of 200 characters
    const interp = new Interpreter(ast, { maxOutputChars: 200, maxLineLength: 500 });
    const res = interp.runAll();

    expect(interp.isFinished).toBe(true);
    // Should have truncated output with single warning marker
    const combined = res.outputs.join('');
    expect(combined.length).toBeLessThan(350);
    expect(res.outputs[res.outputs.length - 1]).toContain('[Salida truncada');
    // Ensure marker appears exactly once, not repeated on every iteration
    const markerCount = res.outputs.filter(o => o.includes('[Salida truncada')).length;
    expect(markerCount).toBe(1);
  });

  it('bounds single line length to maxLineLength', () => {
    const code = `
      Proceso LineaLarga
        Escribir Sin Saltar "${'X'.repeat(500)}";
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast, { maxLineLength: 100, maxOutputChars: 1000 });
    const res = interp.runAll();

    expect(res.outputs[0].length).toBeLessThanOrEqual(100);
    expect(res.outputs[res.outputs.length - 1]).toContain('[Salida truncada');
  });

  it('preserves exact boundary characters and truncates deterministically at max + 1', () => {
    // Exact limit
    const codeExact = `
      Proceso Exacto
        Escribir Sin Saltar "${'Z'.repeat(50)}";
      FinProceso
    `;
    const astExact = new Parser(new Lexer(codeExact).tokenize()).parse();
    const interpExact = new Interpreter(astExact, { maxOutputChars: 50, maxLineLength: 100 });
    const resExact = interpExact.runAll();
    expect(resExact.outputs).toEqual(['Z'.repeat(50)]);

    // One character over
    const codeOver = `
      Proceso Excedido
        Escribir Sin Saltar "${'Z'.repeat(51)}";
      FinProceso
    `;
    const astOver = new Parser(new Lexer(codeOver).tokenize()).parse();
    const interpOver = new Interpreter(astOver, { maxOutputChars: 50, maxLineLength: 100 });
    const resOver = interpOver.runAll();
    expect(resOver.outputs[0]).toBe('Z'.repeat(50));
    expect(resOver.outputs[1]).toContain('[Salida truncada');
  });

  it('safely truncates Unicode surrogate pairs without orphan bytes', () => {
    // 🌍 is a 2 UTF-16 code unit surrogate pair ("\uD83C\uDF0D")
    // If budget cuts at 3 chars: "A" (1) + half of "🌍" (1) -> must back up to avoid dangling surrogate
    const emoji = '🌍';
    const codeUnicode = `
      Proceso UnicodeTest
        Escribir Sin Saltar "A${emoji}";
      FinProceso
    `;
    const ast = new Parser(new Lexer(codeUnicode).tokenize()).parse();
    const interp = new Interpreter(ast, { maxOutputChars: 2, maxLineLength: 10 });
    const res = interp.runAll();

    const firstLine = res.outputs[0];
    expect(firstLine).toBe('A'); // Safely backed off from splitting the surrogate pair
    expect(res.outputs[1]).toContain('[Salida truncada');
  });

  it('resets output budgets and counters completely upon Interpreter.reset()', () => {
    const code = `
      Proceso Bucle
        Escribir "Hola";
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast, { maxOutputChars: 10 });
    const res1 = interp.runAll();
    expect(res1.outputs[0]).toBe('Hola');

    interp.reset();
    const res2 = interp.runAll();
    expect(res2.outputs[0]).toBe('Hola');
    expect(res2.outputs.length).toBe(1);
  });
});

describe('B. Worker Lifecycle, Cancellation & Watchdog Hardening', () => {
  it('immediately resolves validation promise with cancelled: true when cancelled', async () => {
    const infiniteCode = `
      Algoritmo BucleInfinito
        Definir x Como Entero;
        x <- 1;
        Mientras Verdadero Hacer
          x <- x + 1;
        FinMientras
      FinAlgoritmo
    `;

    const validationPromise = runExerciseValidation(
      infiniteCode,
      [{ inputs: [], expectedOutputs: ['42'] }],
      []
    );

    // Cancel after brief delay
    setTimeout(() => {
      cancelCurrentValidation();
    }, 20);

    const result = await validationPromise;
    expect(result.passed).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.details[0].error).toContain('cancelada');
  });

  it('automatically cancels prior pending validation when a new one is launched', async () => {
    const code = 'Algoritmo Test\nEscribir "OK";\nFinAlgoritmo';

    const p1 = runExerciseValidation(
      code,
      [{ inputs: [], expectedOutputs: ['OK'] }],
      []
    );

    // Immediately start second validation
    const p2 = runExerciseValidation(
      code,
      [{ inputs: [], expectedOutputs: ['OK'] }],
      []
    );

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.cancelled).toBe(true);
    expect(res2.passed).toBe(true);
  });

  it('cancelCurrentValidation is safe and idempotent when called multiple times', () => {
    expect(() => {
      cancelCurrentValidation();
      cancelCurrentValidation();
      cancelCurrentValidation();
    }).not.toThrow();
  });
});

describe('C. Interactive Execution Isolation & Session Safety', () => {
  it('manages stepping, output capture, and variable snapshots via InteractiveSession', async () => {
    const code = `
      Proceso InteractivoTest
        Definir a Como Entero;
        Definir b Como Entero;
        a <- 10;
        b <- a * 2;
        Escribir "Total=", b;
      FinProceso
    `;

    const session = new InteractiveSession();
    const startRes = await session.start(code);
    expect(startRes.success).toBe(true);
    const sId = startRes.sessionId;

    let stepRes = await session.step(sId);
    expect(stepRes.done).toBe(false);

    // Step through to completion
    let iterations = 0;
    while (!stepRes.done && iterations < 30) {
      stepRes = await session.step(sId);
      iterations++;
    }

    expect(stepRes.outputs).toContain('Total=20');
    session.stop();
  });

  it('rejects step requests from mismatched or obsolete session IDs', async () => {
    const session = new InteractiveSession();
    await session.start('Proceso A\nEscribir 1;\nFinProceso');

    const obsoleteResult = await session.step('obsolete_session_123');
    expect(obsoleteResult.done).toBe(true);
    expect(obsoleteResult.error).toContain('Sesión desfasada');
    session.stop();
  });

  it('pausing or waiting for input does not consume active execution budget', async () => {
    const code = `
      Proceso EsperaLectura
        Definir num Como Entero;
        Leer num;
        Escribir "Leido:", num;
      FinProceso
    `;

    const session = new InteractiveSession();
    const startRes = await session.start(code, { maxExecutionTimeMs: 30 });
    expect(startRes.success).toBe(true);
    const sId = startRes.sessionId;

    // Step 1: Definition
    let stepRes = await session.step(sId);

    // Step 2: Leer
    stepRes = await session.step(sId);
    expect(stepRes.isWaitingForInput).toBe(true);

    // Simulate user reading prompt for 50ms (> 30ms timeout)
    await new Promise(r => setTimeout(r, 50));

    // Provide input
    await session.provideInput(sId, '99');

    // Next step after input
    stepRes = await session.step(sId);
    expect(stepRes.error).toBeUndefined();

    // Final step
    stepRes = await session.step(sId);
    expect(stepRes.outputs).toContain('Leido:99');
    session.stop();
  });
});

describe('D. Parser Recursion & Block Hardening', () => {
  it('throws a controlled parser error on deeply chained unary operators instead of RangeError', () => {
    // 130 chained NO operators: "NO NO NO ... Verdadero"
    const chainedNot = 'NO '.repeat(120) + 'Verdadero';
    const code = `Proceso UnaryChain\n  x <- ${chainedNot};\nFinProceso`;

    const tokens = new Lexer(code).tokenize();
    const parser = new Parser(tokens);

    expect(() => parser.parse()).toThrowError(/Profundidad máxima de expresión superada/);
  });
});

describe('E. Transpiler Syntax & Semantic Conformance (Python & Rust)', () => {
  it('transpiles Escribir Sin Saltar to print(..., end="") in Python', () => {
    const code = 'Escribir Sin Saltar "Hola", " ", "Mundo";';
    const py = transpileToPython(code);
    expect(py).toContain('print("Hola", " ", "Mundo", sep="", end="")');
  });

  it('transpiles Escribir Sin Saltar to print!("...", ...) in Rust', () => {
    const code = 'Escribir Sin Saltar "Hola", " ", "Mundo";';
    const rs = transpileToRust(code);
    expect(rs).toContain('print!("{}{}{}", "Hola", " ", "Mundo");');
    expect(rs).not.toContain('println!');
  });

  it('transpiles Repetir ... Hasta Que to while True / if break in Python', () => {
    const code = `
      Algoritmo TestRepetir
        Definir c Como Entero;
        c <- 1;
        Repetir
          Escribir c;
          c <- c + 1;
        Hasta Que c > 3
      FinAlgoritmo
    `;
    const py = transpileToPython(code);
    expect(py).toContain('while True:');
    expect(py).toContain('if c > 3:');
    expect(py).toContain('break');
  });

  it('transpiles Repetir ... Hasta Que to loop { if cond { break; } } in Rust', () => {
    const code = `
      Algoritmo TestRepetirRust
        Definir c Como Entero;
        c <- 1;
        Repetir
          Escribir c;
          c <- c + 1;
        Hasta Que c > 3
      FinAlgoritmo
    `;
    const rs = transpileToRust(code);
    expect(rs).toContain('loop {');
    expect(rs).toContain('if c > 3 { break; }');
  });

  it('handles chained exponentiations (^) in Rust without leaving unhandled ^ symbols', () => {
    const code = 'x <- 2 ^ 3 ^ 2;';
    const rs = transpileToRust(code);
    expect(rs).not.toContain('^');
    expect(rs).toContain('i64::pow');
  });
});
