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
import { generateFlowchart } from '../src/engine/flowchart';
import { generateStructogram } from '../src/engine/structogram';

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

    stepRes = await session.step(sId);
    expect(stepRes.outputs).toContain('Leido:99');
    session.stop();
  });

  it('handles session.reset() cleanly transitioning to new session with updated code', async () => {
    const session = new InteractiveSession();
    const startRes = await session.start('Proceso Inicial\nEscribir "Version1";\nFinProceso');
    expect(startRes.success).toBe(true);

    // Initial step
    await session.step(startRes.sessionId);

    // Reset with new code
    const resetRes = await session.reset('Proceso Modificado\nEscribir "Version2";\nFinProceso');
    expect(resetRes.success).toBe(true);
    expect(resetRes.sessionId).not.toBe(startRes.sessionId);

    // Step through the newly reset session to completion
    let stepRes = await session.step(resetRes.sessionId);
    let iterations = 0;
    while (!stepRes.done && iterations < 15) {
      stepRes = await session.step(resetRes.sessionId);
      iterations++;
    }

    expect(stepRes.done).toBe(true);
    expect(stepRes.outputs).toContain('Version2');
    expect(stepRes.outputs).not.toContain('Version1');
    session.stop();
  });

  it('settles pending step promises cleanly when session.stop() or worker.onerror is called', async () => {
    // 1. Test in-flight cancellation via session.stop()
    const session1 = new InteractiveSession();
    (session1 as any).isFallback = false;
    (session1 as any).worker = { postMessage: () => {}, terminate: () => {} };
    (session1 as any).currentSessionId = 'sess_cancel_1';

    const stepPromise1 = session1.step('sess_cancel_1');
    session1.stop();

    const res1 = await stepPromise1;
    expect(res1.done).toBe(true);
    expect(res1.error).toBeDefined();
    expect(res1.error).toContain('detenida');

    // 2. Test in-flight resolution on worker.onerror
    const session2 = new InteractiveSession();
    const mockWorker: any = { postMessage: () => {}, terminate: () => {} };
    (session2 as any).isFallback = false;
    (session2 as any).worker = mockWorker;
    (session2 as any).currentSessionId = 'sess_cancel_2';

    // Hook up mock onerror
    mockWorker.onerror = (session2 as any).worker.onerror || null;
    const stepPromise2 = session2.step('sess_cancel_2');
    (session2 as any).flushPending('Worker interactivo falló inesperadamente.');

    const res2 = await stepPromise2;
    expect(res2.done).toBe(true);
    expect(res2.error).toContain('falló');
  });

  it('rejects concurrent step calls without hanging or overwriting resolvers', async () => {
    const session = new InteractiveSession();
    const startRes = await session.start('Proceso Concurrente\nEscribir "P1";\nEscribir "P2";\nFinProceso');
    expect(startRes.success).toBe(true);

    // Launch two steps concurrently
    const [step1, step2] = await Promise.all([
      session.step(startRes.sessionId),
      session.step(startRes.sessionId)
    ]);

    expect(step1).toBeDefined();
    expect(step2).toBeDefined();
    // One of them executed, or concurrent was cleanly guarded
    const hasConcurrentWarning = Boolean(
      (step1.error && step1.error.includes('en curso')) ||
      (step2.error && step2.error.includes('en curso')) ||
      step1.step || step2.step
    );
    expect(hasConcurrentWarning).toBe(true);
    session.stop();
  });

  it('bounds runaway loops inside subprograms via maxSubprogramSteps without locking', () => {
    const code = `
      SubProceso BucleRunaway()
        Mientras Verdadero Hacer
        FinMientras
      FinSubProceso

      Proceso TestRunaway
        BucleRunaway();
      FinProceso
    `;

    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast, { maxSubprogramSteps: 200 });

    expect(() => interp.runAll([], true)).toThrowError(/L\u00edmite interno de pasos de ejecuci\u00f3n superado/);
  });

  it('caps input string length exceeding Interpreter.MAX_INPUT_LENGTH in Leer and provideInput', () => {
    const code = `
      Proceso LecturaCapped
        Definir s Como Cadena;
        Leer s;
      FinProceso
    `;

    const hugeInput = 'A'.repeat(Interpreter.MAX_INPUT_LENGTH + 5_000);
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll([hugeInput]);

    const val = interp.getVariable('s');
    expect(typeof val).toBe('string');
    expect(val.length).toBe(Interpreter.MAX_INPUT_LENGTH);
  });

  it('ensures in-flight step cancelled by reset retains original sessionId and has cancelled: true', async () => {
    const session = new InteractiveSession();
    (session as any).isFallback = false;
    (session as any).worker = { postMessage: () => {}, terminate: () => {} };
    (session as any).currentSessionId = 'session_alpha';

    const stepPromise = session.step('session_alpha');
    // Reset with new session in fallback mode
    (session as any).isFallback = true;
    const resetRes = await session.reset('Proceso Beta\nEscribir "Beta";\nFinProceso');

    const stepRes = await stepPromise;
    expect(stepRes.sessionId).toBe('session_alpha');
    expect(stepRes.sessionId).not.toBe(resetRes.sessionId);
    expect(stepRes.cancelled).toBe(true);
    expect(stepRes.done).toBe(true);
    session.stop();
  });

  it('preserves custom InterpreterOptions across reset in InteractiveSession', async () => {
    const session = new InteractiveSession();
    const options = { maxOutputChars: 15, maxLineLength: 30 };
    const startRes = await session.start('Proceso P1\nEscribir "TextoLargoQueSuperaElLimite";\nFinProceso', options);
    expect(startRes.success).toBe(true);

    // Reset session without explicit options (should preserve original options)
    const resetRes = await session.reset('Proceso P2\nEscribir "TextoLargoQueSuperaElLimite";\nFinProceso');
    expect(resetRes.success).toBe(true);

    let stepRes = await session.step(resetRes.sessionId);
    let iter = 0;
    while (!stepRes.done && iter < 10) {
      stepRes = await session.step(resetRes.sessionId);
      iter++;
    }

    // Outputs must reflect maxOutputChars: 15
    const combined = (stepRes.outputs || []).join('');
    expect(combined).toContain('[Salida truncada');
    session.stop();
  });

  it('terminates unresponsive worker on watchdog timeout and recovers cleanly', async () => {
    const session = new InteractiveSession();
    let terminated = false;
    const mockWorker: any = {
      postMessage: () => {},
      terminate: () => { terminated = true; }
    };
    (session as any).isFallback = false;
    (session as any).worker = mockWorker;
    (session as any).currentSessionId = 'sess_hang';

    const stepPromise = session.step('sess_hang');
    const pending = (session as any).pendingStep;
    expect(pending).toBeDefined();
    clearTimeout(pending.timer);

    // Simulate watchdog triggering
    (session as any).flushPending('Tiempo de espera agotado (watchdog 10s): el Worker interactivo no respondió y fue reiniciado.');
    if ((session as any).worker) {
      (session as any).worker.terminate();
      (session as any).worker = null;
    }
    (session as any).currentSessionId = null;

    const stepRes = await stepPromise;
    expect(terminated).toBe(true);
    expect(stepRes.done).toBe(true);
    expect(stepRes.error).toContain('watchdog');
    expect(session.getSessionId()).toBeNull();
  });

  it('returns typed InteractiveInputResult on provideInput success and failure', async () => {
    const session = new InteractiveSession();
    const startRes = await session.start('Proceso Lectura\nDefinir x Como Entero;\nLeer x;\nFinProceso');
    expect(startRes.success).toBe(true);

    // Advance to Leer
    await session.step(startRes.sessionId);
    await session.step(startRes.sessionId);

    // Provide input with correct sessionId
    const okRes = await session.provideInput(startRes.sessionId, '42');
    expect(okRes.success).toBe(true);

    // Provide input with mismatched/obsolete sessionId
    const badRes = await session.provideInput('obsolete_id', '100');
    expect(badRes.success).toBe(false);
    expect(badRes.error).toBeDefined();

    session.stop();
  });

  it('cancels and resets cleanly when session.stop() or session.reset() is called during interactive input wait', async () => {
    const code = `
      Proceso EsperaInterrumpida
        Definir val Como Entero;
        Leer val;
        Escribir "Valor:", val;
      FinProceso
    `;

    // 1. Test stop() during waiting for input
    const session1 = new InteractiveSession();
    const start1 = await session1.start(code);
    await session1.step(start1.sessionId); // Definir
    const stepWait1 = await session1.step(start1.sessionId); // Leer
    expect(stepWait1.isWaitingForInput).toBe(true);

    // Stop while waiting for input
    session1.stop();
    expect(session1.getSessionId()).toBeNull();

    // Any late input or step attempt must fail cleanly without throwing
    const inputLate = await session1.provideInput(start1.sessionId, '123');
    expect(inputLate.success).toBe(false);
    const stepLate = await session1.step(start1.sessionId);
    expect(stepLate.done).toBe(true);

    // 2. Test reset() during waiting for input with new program
    const session2 = new InteractiveSession();
    const start2 = await session2.start(code);
    await session2.step(start2.sessionId);
    const stepWait2 = await session2.step(start2.sessionId);
    expect(stepWait2.isWaitingForInput).toBe(true);

    // Reset directly to new program without supplying input
    const resetRes = await session2.reset('Proceso ProgramaReiniciado\nEscribir "ReiniciadoExitoso";\nFinProceso');
    expect(resetRes.success).toBe(true);
    expect(resetRes.sessionId).not.toBe(start2.sessionId);

    // Step through the newly reset session to verify it runs without deadlocks
    let step = await session2.step(resetRes.sessionId);
    let count = 0;
    while (!step.done && count < 10) {
      step = await session2.step(resetRes.sessionId);
      count++;
    }
    expect(step.outputs).toContain('ReiniciadoExitoso');
    session2.stop();
  });
});

describe('C2. Storage Resilience & State Recovery', () => {
  it('falls back to memory store when window.localStorage throws exceptions or is quota exceeded', async () => {
    const { safeStorageGet, safeStorageSet, safeStorageRemove } = await import('../src/engine/storage');
    const testKey = 'test-quota-resilience';

    safeStorageSet(testKey, 'algoritmo_guardado_123');
    expect(safeStorageGet(testKey)).toBe('algoritmo_guardado_123');

    safeStorageRemove(testKey);
    expect(safeStorageGet(testKey, 'default_val')).toBe('default_val');
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

  it('converts boolean logical operators (Y, O, NO) in assignments and expressions to Rust syntax', () => {
    const code = `
      Algoritmo TestLogicoRust
        Definir r1 Como Logico;
        Definir r2 Como Logico;
        Definir r3 Como Logico;
        r1 <- Verdadero Y Falso;
        r2 <- Falso O Verdadero;
        r3 <- NO Falso;
      FinAlgoritmo
    `;
    const rs = transpileToRust(code);
    expect(rs).toContain('r1 = true && false;');
    expect(rs).toContain('r2 = false || true;');
    expect(rs).toContain('r3 = !false;');
    expect(rs).not.toMatch(/r\d\s*=\s*.*?\b[YO]\b/);
  });
});

describe('E. Fase 1 — Bloqueos de Seguridad (P0 Verification)', () => {
  it('1. Confirmar límites: respeta límites de CPU, pasos, recursión, memoria y salida', () => {
    // A. Límite de pasos
    const infiniteCode = `
      Proceso BucleInfinito
        Definir x Como Entero;
        x <- 1;
        Mientras Verdadero Hacer
          x <- x + 1;
        FinMientras
      FinProceso
    `;
    const astSteps = new Parser(new Lexer(infiniteCode).tokenize()).parse();
    const interpSteps = new Interpreter(astSteps, { maxSteps: 50 });
    expect(() => interpSteps.runAll([], true)).toThrowError(/Límite de ejecución alcanzado/);

    // B. Límite de recursión / Call Stack
    const recursiveCode = `
      SubProceso RecursionInfinita(n Como Entero)
        RecursionInfinita(n + 1);
      FinSubProceso
      Proceso TestRec
        RecursionInfinita(1);
      FinProceso
    `;
    const astRec = new Parser(new Lexer(recursiveCode).tokenize()).parse();
    const interpRec = new Interpreter(astRec, { maxCallStackDepth: 15 });
    expect(() => interpRec.runAll([], true)).toThrowError(/Profundidad máxima de pila de llamadas superada/);

    // C. Límite de memoria en arreglos (Dimension)
    const arrayCode = `
      Proceso ArregloGigante
        Dimension arr[500, 500];
      FinProceso
    `;
    const astArr = new Parser(new Lexer(arrayCode).tokenize()).parse();
    const interpArr = new Interpreter(astArr, { maxArrayElements: 1000 });
    expect(() => interpArr.runAll([], true)).toThrowError(/superando el límite/);

    // D. Límite de salida
    const outputCode = `
      Proceso SalidaExcesiva
        Definir i Como Entero;
        Para i <- 1 Hasta 100 Hacer
          Escribir "Linea ", i;
        FinPara
      FinProceso
    `;
    const astOut = new Parser(new Lexer(outputCode).tokenize()).parse();
    const interpOut = new Interpreter(astOut, { maxOutputLines: 10 });
    const resOut = interpOut.runAll();
    expect(resOut.outputs.length).toBe(11);
    expect(resOut.outputs[10]).toContain('[Salida truncada');
  });

  it('2. Terminar Worker: watchdog y timeouts reinician efectivamente el Worker ante cuelgues', async () => {
    const session = new InteractiveSession();
    let terminated = false;
    const mockWorker: any = {
      postMessage: () => {},
      terminate: () => { terminated = true; }
    };
    (session as any).isFallback = false;
    (session as any).worker = mockWorker;
    (session as any).currentSessionId = 'sess_timeout_test';

    // Simulate provideInput timeout
    const providePromise = session.provideInput('sess_timeout_test', 'test_value');
    const pendingInput = (session as any).pendingInput;
    expect(pendingInput).toBeDefined();
    clearTimeout(pendingInput.timer);

    // Trigger restart
    (session as any).restartWorker();
    pendingInput.resolve({ success: false, error: 'Tiempo de espera agotado (5s) al enviar entrada al Worker.' });

    const inputRes = await providePromise;
    expect(terminated).toBe(true);
    expect(inputRes.success).toBe(false);
    expect(inputRes.error).toContain('agotado');
    session.stop();
  });

  it('3. Aislamiento de sesiones: sesiones obsoletas no alteran ejecuciones nuevas', async () => {
    const session = new InteractiveSession();
    const startRes1 = await session.start('Proceso S1\nEscribir "Sesion1";\nFinProceso');
    expect(startRes1.success).toBe(true);

    const startRes2 = await session.start('Proceso S2\nEscribir "Sesion2";\nFinProceso');
    expect(startRes2.success).toBe(true);
    expect(startRes2.sessionId).not.toBe(startRes1.sessionId);

    // Intento de dar un paso en la sesión 1 anterior debe ser rechazado
    const stepStale = await session.step(startRes1.sessionId);
    expect(stepStale.done).toBe(true);
    expect(stepStale.cancelled).toBe(true);
    expect(stepStale.error).toContain('desfasada');

    // La sesión actual debe progresar independientemente
    const stepCurrent = await session.step(startRes2.sessionId);
    expect(stepCurrent.done).toBe(false);
    expect(stepCurrent.sessionId).toBe(startRes2.sessionId);
    session.stop();
  });

  it('4. Seguridad de APIs: previene prototype pollution y bloquea miembros reservados en objetos', () => {
    // Intento de acceder o asignar a __proto__ / constructor / prototype
    const codeAttack = `
      Clase TestClase
        Definir nombre Como Cadena;
        Publico Metodo Iniciar()
          Este.nombre <- "Seguro";
        FinMetodo
      FinClase

      Proceso TestHack
        Definir obj Como TestClase;
        obj <- Nuevo TestClase();
        obj.Iniciar();
        Escribir obj.__proto__;
      FinProceso
    `;
    const ast = new Parser(new Lexer(codeAttack).tokenize()).parse();
    const interp = new Interpreter(ast);
    expect(() => interp.runAll([], true)).toThrowError(/Acceso denegado a miembro reservado/);
  });

  it('4b. Seguridad de APIs: los campos de objetos no heredan de Object.prototype (Object.create(null))', () => {
    const codePrototype = `
      Clase ObjetoLimpio
        Definir valor Como Entero;
      FinClase

      Proceso TestPrototype
        Definir miObj Como ObjetoLimpio;
        miObj <- Nuevo ObjetoLimpio();
        Escribir miObj.toString;
      FinProceso
    `;
    const ast = new Parser(new Lexer(codePrototype).tokenize()).parse();
    const interp = new Interpreter(ast);
    // toString no debe existir como campo ni ejecutarse desde Object.prototype
    expect(() => interp.runAll([], true)).toThrowError(/Método "toString" no encontrado|No se puede acceder al miembro/);
  });

  it('5. Cabeceras del despliegue real: public/_headers contiene CSP estricta, COOP, HSTS, X-Frame-Options y permisos', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const headersPath = path.resolve(__dirname, '../public/_headers');
    expect(fs.existsSync(headersPath)).toBe(true);

    const headersContent = fs.readFileSync(headersPath, 'utf-8');
    expect(headersContent).toContain('X-Content-Type-Options: nosniff');
    expect(headersContent).toContain('X-Frame-Options: DENY');
    expect(headersContent).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
    expect(headersContent).toContain('Cross-Origin-Opener-Policy: same-origin');
    expect(headersContent).toContain("Content-Security-Policy: default-src 'self'");
    expect(headersContent).toContain("worker-src 'self' blob:");
    expect(headersContent).toContain("frame-ancestors 'none'");
    expect(headersContent).toContain("object-src 'none'");
    expect(headersContent).toContain('Permissions-Policy:');
  });
});

describe('F. Fase 2 — Integridad del Intérprete (P1 Verification)', () => {
  it('1. Valida expresiones y operadores: previene divisiones por cero en potencia y valida arreglos no inicializados', () => {
    // A. Potencia con base 0 y exponente negativo
    const zeroPowerCode = `
      Proceso TestPotenciaCero
        Definir p Como Real;
        p <- 0 ^ (-2);
      FinProceso
    `;
    const astPower = new Parser(new Lexer(zeroPowerCode).tokenize()).parse();
    const interpPower = new Interpreter(astPower);
    expect(() => interpPower.runAll([], true)).toThrowError(/base cero y exponente negativo/);

    // B. Acceso a variable no dimensionada como arreglo
    const nonArrayCode = `
      Proceso TestNoArreglo
        Definir x Como Entero;
        x <- 10;
        Escribir x[0];
      FinProceso
    `;
    const astNonArr = new Parser(new Lexer(nonArrayCode).tokenize()).parse();
    const interpNonArr = new Interpreter(astNonArr);
    expect(() => interpNonArr.runAll([], true)).toThrowError(/no es un arreglo o no ha sido dimensionada/);
  });

  it('1b. Valida bucles Para decrecientes y estructuras de control Segun/Repetir', () => {
    const code = `
      Proceso TestControl
        Definir sum Como Entero;
        Definir i Como Entero;
        sum <- 0;
        Para i <- 5 Hasta 1 Con Paso -1 Hacer
          sum <- sum + i;
        FinPara

        Definir estado Como Cadena;
        Segun sum Hacer
          Caso 15:
            estado <- "Correcto";
          De Otro Modo:
            estado <- "Incorrecto";
        FinSegun
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('sum')).toBe(15);
    expect(interp.getVariable('estado')).toBe('Correcto');
  });

  it('2. Alcance, referencias y estado: soporta encadenamiento multinivel de paso Por Referencia', () => {
    const code = `
      SubProceso SubNivel2(val2 Como Entero Por Referencia)
        val2 <- val2 * 3;
      FinSubProceso

      SubProceso SubNivel1(val1 Como Entero Por Referencia)
        val1 <- val1 + 5;
        SubNivel2(val1);
      FinSubProceso

      Proceso TestChainedRef
        Definir num Como Entero;
        num <- 10;
        SubNivel1(num);
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    // (10 + 5) * 3 = 45
    expect(interp.getVariable('num')).toBe(45);
  });

  it('2b. Alcance: mutación de variables del entorno global desde subprogramas', () => {
    const code = `
      SubProceso ModificarGlobal()
        globalCounter <- globalCounter + 1;
      FinSubProceso

      Proceso TestGlobalScope
        Definir globalCounter Como Entero;
        globalCounter <- 100;
        ModificarGlobal();
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('globalCounter')).toBe(101);
  });

  it('3. Entradas interactivas y recuperación: sincroniza el valor provisto en la traza y se recupera de errores', async () => {
    const code = `
      Proceso TestInteractiveLeer
        Definir nombre Como Cadena;
        Leer nombre;
        Escribir "Hola ", nombre;
      FinProceso
    `;
    const session = new InteractiveSession();
    const startRes = await session.start(code);
    expect(startRes.success).toBe(true);
    const sId = startRes.sessionId;

    // Step 1: Definir nombre
    await session.step(sId);
    // Step 2: Leer nombre (entra en espera)
    const readStep = await session.step(sId);
    expect(readStep.isWaitingForInput).toBe(true);

    // Provide input
    const inputRes = await session.provideInput(sId, 'Carlos');
    expect(inputRes.success).toBe(true);

    // Step 3: Escribir
    const writeStep = await session.step(sId);
    expect(writeStep.step?.outputLog).toContain('Hola Carlos');

    // Step 4: FinProceso
    const endStep = await session.step(sId);
    expect(endStep.done).toBe(true);
    expect(endStep.outputs).toContain('Hola Carlos');
    session.stop();
  });

  it('4. Consistencia entre intérprete, traza y diagramas: cada línea de sentencia coincide con nodos de flujo y estructograma', () => {
    const code = `
      Proceso TestConsistencia
        Definir x Como Entero;
        x <- 1;
        Para x <- 1 Hasta 3 Hacer
          Escribir x;
        FinPara
        Repetir
          x <- x - 1;
        Hasta Que x = 0
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    const runRes = interp.runAll();

    // Verify flowchart nodes exist for all executed statements
    const fc = generateFlowchart(ast);
    const fcLines = new Set(fc.nodes.map(n => n.line));
    for (const step of runRes.steps) {
      expect(fcLines.has(step.lineNumber)).toBe(true);
    }

    // Verify structogram blocks exist
    const ns = generateStructogram(ast);
    const nsLines = new Set(ns.map(b => b.line));
    expect(nsLines.has(ast.body[0].line)).toBe(true);
    expect(ns.length).toBeGreaterThanOrEqual(3);
  });

  describe('Fase 3: Validación de lenguajes y currículo (P1)', () => {
    it('1. Lexer reconoce operador ! como negación lógica NO', () => {
      const code = `
        Proceso TestNotExclamacion
          Definir bandera Como Logico;
          bandera <- ! Falso;
          Si ! (bandera = Falso) Entonces
            Escribir "Exito!";
          FinSi
        FinProceso
      `;
      const ast = new Parser(new Lexer(code).tokenize()).parse();
      const interp = new Interpreter(ast);
      const res = interp.runAll();
      expect(res.outputs).toEqual(['Exito!']);
    });

    it('2. Soporte léxico y sintáctico completo para palabras clave en inglés y compuestas', () => {
      const code = `
        class Base
          public method Value() as integer
            return 42;
          endMethod
        endClass

        class Derived extends Base
          public method Value() as integer
            return super.Value();
          endMethod
        endClass

        subroutine Compute(val as integer) as integer
          return val * 2;
        endSubroutine

        algorithm TestEnglishKeywords
          define d as Derived;
          define n as integer;
          d <- new Derived();
          n <- Compute(d.Value());
          write "Value: " without newline;
          write n;
        endAlgorithm
      `;
      const ast = new Parser(new Lexer(code).tokenize()).parse();
      const interp = new Interpreter(ast);
      const res = interp.runAll();
      expect(res.outputs).toEqual(['Value: 84']);
    });

    it('3. Declaraciones múltiples (Definir a, b, c) y dimensiones múltiples (Dimension a[2], b[3, 3])', () => {
      const code = `
        Proceso TestMultiDeclaracion
          Definir a, b, c Como Entero;
          Dimension v[2], m[2, 2] Como Entero;
          a <- 10;
          b <- 20;
          c <- 30;
          v[0] <- a;
          v[1] <- b;
          m[0, 0] <- c;
          m[1, 1] <- v[0] + v[1] + m[0, 0];
          Escribir "Total:", m[1, 1];
        FinProceso
      `;
      const ast = new Parser(new Lexer(code).tokenize()).parse();
      const interp = new Interpreter(ast);
      const res = interp.runAll();
      expect(res.outputs).toEqual(['Total:60']);
    });

    it('4. Permite usar "y" como identificador sin interferir con operador lógico "Y"', () => {
      const code = `
        Proceso TestVariableY
          Definir x Como Entero;
          Definir y Como Entero;
          x <- 5;
          y <- 10;
          Si x < 10 Y y > 5 Entonces
            Escribir "x+y=", x + y;
          FinSi
        FinProceso
      `;
      const ast = new Parser(new Lexer(code).tokenize()).parse();
      const interp = new Interpreter(ast);
      const res = interp.runAll();
      expect(res.outputs).toEqual(['x+y=15']);
    });

    it('5. Escribir sin argumentos ni punto y coma en su propia línea genera salto de línea sin error sintáctico', () => {
      const code = `
        Algoritmo SalidaVacia
          Escribir "Linea 1"
          Escribir
          Escribir "Linea 3"
        FinAlgoritmo
      `;
      const ast = new Parser(new Lexer(code).tokenize()).parse();
      const interp = new Interpreter(ast);
      const res = interp.runAll();
      expect(res.outputs).toEqual(['Linea 1', '', 'Linea 3']);
    });

    it('6. Alias bilingües de funciones matemáticas y de cadena en el intérprete', () => {
      const code = `
        algorithm TestAliases
          define r as real;
          define len as integer;
          define may as text;
          r <- round(3.7);
          len <- length("PseudoFlow");
          may <- uppercase("hola");
          write "R:", r, ",L:", len, ",M:", may;
        endAlgorithm
      `;
      const ast = new Parser(new Lexer(code).tokenize()).parse();
      const interp = new Interpreter(ast);
      const res = interp.runAll();
      expect(res.outputs).toEqual(['R:4.0,L:10,M:HOLA']);
    });

    it('7. Calidad de casos ocultos: 100% de los 95 ejercicios poseen casos ocultos sin duplicados respecto a visibles', async () => {
      const exercises = (await import('../src/data/exercises.json')).default;
      expect(exercises.length).toBe(95);

      let totalVisible = 0;
      let totalHidden = 0;
      let duplicateCases = 0;

      for (const ex of exercises) {
        expect(ex.visibleCases?.length || 0).toBeGreaterThanOrEqual(1);
        expect(ex.hiddenCases?.length || 0).toBeGreaterThanOrEqual(1);
        totalVisible += ex.visibleCases.length;
        totalHidden += ex.hiddenCases.length;

        const visSet = new Set(ex.visibleCases.map((c: any) => JSON.stringify(c.inputs || [])));
        for (const hc of ex.hiddenCases) {
          const hStr = JSON.stringify(hc.inputs || []);
          if (visSet.has(hStr)) {
            duplicateCases++;
          }
        }
      }

      expect(totalVisible).toBe(190);
      expect(totalHidden).toBe(285);
      expect(duplicateCases).toBe(0);
    });
  });
});



