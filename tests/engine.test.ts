import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';
import { Interpreter } from '../src/engine/interpreter';
import { transpileToPython, transpileToRust } from '../src/engine/transpiler';
import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../src/engine/storage';

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
    expect(rust).toContain('println!("{}{}{}",');
  });

  it('transpiles Leer to type-aware input functions in Python based on declarations (Auditoría P1)', () => {
    const code = `
      Algoritmo TestLectura
        Definir nombre Como Cadena;
        Definir edad Como Entero;
        Definir altura Como Real;
        Leer nombre;
        Leer edad;
        Leer altura;
      FinAlgoritmo
    `;
    const py = transpileToPython(code);
    expect(py).toContain('nombre = input()');
    expect(py).toContain('edad = int(input())');
    expect(py).toContain('altura = float(input())');
  });

  it('transpiles multidimensional arrays (3D+) to nested list comprehensions in Python (Auditoría P1)', () => {
    const code = 'Dimension matriz3D[2, 3, 4]';
    const py = transpileToPython(code);
    expect(py).toContain('matriz3D = [[[0] * 4 for _ in range(3)] for _ in range(2)]');
  });

  it('transpiles Leer with stdin line reading and type parsing in Rust (Auditoría P1)', () => {
    const code = `
      Algoritmo TestRustLeer
        Definir edad Como Entero;
        Leer edad;
      FinAlgoritmo
    `;
    const rust = transpileToRust(code);
    expect(rust).toContain('std::io::stdin().read_line(&mut _buf)');
    expect(rust).toContain('_buf.trim().parse().unwrap_or_default()');
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

    expect(() => interp.runAll([], true)).toThrowError(/Límite de (?:iteraciones|ejecución) alcanzado.*bucle infinito/i);
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

describe('Operator Precedence & Associativity Conformance (Auditoría P2)', () => {
  it('evaluates exponentiation as right-associative (2 ^ 3 ^ 2 = 512)', () => {
    const code = `
      Algoritmo PotenciaAsoc
        Definir res Como Entero;
        res <- 2 ^ 3 ^ 2;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('res')).toBe(512);
  });

  it('evaluates unary minus with exponentiation according to mathematical conventions (-2^2 = -4)', () => {
    const code = `
      Algoritmo PotenciaUnario
        Definir res Como Real;
        res <- -2 ^ 2;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('res')).toBe(-4);
  });

  it('evaluates parenthesized negative base with exponentiation ((-2)^2 = 4)', () => {
    const code = `
      Algoritmo PotenciaParentesis
        Definir res Como Real;
        res <- (-2) ^ 2;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('res')).toBe(4);
  });

  it('evaluates negative exponents correctly (2^-2 = 0.25)', () => {
    const code = `
      Algoritmo PotenciaNegativa
        Definir res Como Real;
        res <- 2 ^ -2;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('res')).toBe(0.25);
  });

  it('respects arithmetic precedence rules and parentheses', () => {
    const code = `
      Algoritmo Precedencia
        Definir a Como Entero;
        Definir b Como Entero;
        a <- 2 + 3 * 4;
        b <- (2 + 3) * 4;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('a')).toBe(14);
    expect(interp.getVariable('b')).toBe(20);
  });

  it('evaluates MOD and % operators identically', () => {
    const code = `
      Algoritmo Modulo
        Definir m1 Como Entero;
        Definir m2 Como Entero;
        m1 <- 17 % 5;
        m2 <- 17 MOD 5;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('m1')).toBe(2);
    expect(interp.getVariable('m2')).toBe(2);
  });

  it('evaluates comparison operators correctly', () => {
    const code = `
      Algoritmo Comparaciones
        Definir eq Como Logico;
        Definir neq1 Como Logico;
        Definir neq2 Como Logico;
        Definir lt Como Logico;
        Definir lte Como Logico;
        Definir gt Como Logico;
        Definir gte Como Logico;
        eq <- (5 = 5);
        neq1 <- (5 <> 4);
        neq2 <- (5 != 4);
        lt <- (3 < 5);
        lte <- (5 <= 5);
        gt <- (6 > 5);
        gte <- (5 >= 5);
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('eq')).toBe(true);
    expect(interp.getVariable('neq1')).toBe(true);
    expect(interp.getVariable('neq2')).toBe(true);
    expect(interp.getVariable('lt')).toBe(true);
    expect(interp.getVariable('lte')).toBe(true);
    expect(interp.getVariable('gt')).toBe(true);
    expect(interp.getVariable('gte')).toBe(true);
  });
});

describe('Corpus of Invalid Inputs & Edge Cases (Auditoría Fase 1 & 2)', () => {
  it('rejects array dimensions equal to 0 or negative', () => {
    const codeZero = `
      Algoritmo DimCero
        Dimension a[0];
      FinAlgoritmo
    `;
    const astZero = new Parser(new Lexer(codeZero).tokenize()).parse();
    const interpZero = new Interpreter(astZero);
    expect(() => interpZero.runAll([], true)).toThrowError(/debe ser mayor a 0/);

    const codeNeg = `
      Algoritmo DimNeg
        Dimension a[-5];
      FinAlgoritmo
    `;
    const astNeg = new Parser(new Lexer(codeNeg).tokenize()).parse();
    const interpNeg = new Interpreter(astNeg);
    expect(() => interpNeg.runAll([], true)).toThrowError(/debe ser mayor a 0/);
  });

  it('rejects square root of negative numbers', () => {
    const code = `
      Algoritmo RaizNeg
        Definir r Como Real;
        r <- rc(-9);
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    expect(() => interp.runAll([], true)).toThrowError(/raíz cuadrada de un número negativo/);
  });

  it('throws syntax error on unclosed Mientras block', () => {
    const code = `
      Algoritmo Incompleto
        Definir x Como Entero;
        Mientras x > 0 Hacer
          x <- x - 1;
      FinAlgoritmo
    `;
    expect(() => new Parser(new Lexer(code).tokenize()).parse()).toThrow();
  });

  it('throws syntax error on unclosed Si block', () => {
    const code = `
      Algoritmo IncompletoSi
        Definir x Como Entero;
        Si x > 0 Entonces
          x <- 10;
      FinAlgoritmo
    `;
    expect(() => new Parser(new Lexer(code).tokenize()).parse()).toThrow();
  });

  it('detects and limits infinite recursion depth', () => {
    const code = `
      Funcion Infinito()
        Infinito();
      FinFuncion

      Algoritmo Recursion
        Infinito();
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    expect(() => interp.runAll([], true)).toThrowError(/Profundidad máxima de pila de llamadas superada/);
  });

  it('terminates an infinite While loop with an empty body (Auditoría P1)', () => {
    const code = `
      Algoritmo BucleVacio
        Mientras Verdadero Hacer
        FinMientras
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast, { maxSteps: 500 });
    expect(() => interp.runAll([], true)).toThrowError(/Límite de ejecución alcanzado/);
  });

  it('terminates an infinite Repeat loop with an empty body (Auditoría P1)', () => {
    const code = `
      Algoritmo RepetirVacio
        Repetir
        Hasta Que Falso
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast, { maxSteps: 500 });
    expect(() => interp.runAll([], true)).toThrowError(/Límite de ejecución alcanzado/);
  });

  it('enforces wall-clock execution timeout in runAll (Auditoría P1)', () => {
    const code = `
      Algoritmo BucleLargo
        Definir c Como Entero;
        c <- 0;
        Mientras Verdadero Hacer
          c <- c + 1;
        FinMientras
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    expect(() => interp.runAll([], true, 40)).toThrowError(/Tiempo (?:máximo|límite) de ejecución (?:excedido|superado)|Límite de ejecución alcanzado/);
  });

  it('truncates large array formatting in trace snapshots to protect CPU & memory (Auditoría P1)', () => {
    const code = `
      Algoritmo ArregloGrande
        Dimension arr[30];
        arr[0] <- 123;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    const res = interp.runAll();
    const lastStep = res.steps[res.steps.length - 1];
    expect(lastStep.variables['arr']).toContain('más');
    expect(lastStep.variables['arr']).toContain('30 elem');
  });

  it('supports reading empty string input into variable without error (Auditoría P2)', () => {
    const code = `
      Algoritmo LeerVacio
        Definir s Como Cadena;
        Leer s;
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll(['']);
    expect(interp.getVariable('s')).toBe('');
  });

  it('caps printed output lines to prevent browser memory exhaustion (Auditoría P1)', () => {
    const code = `
      Algoritmo MuchasSalidas
        Definir i Como Entero;
        Para i <- 1 Hasta 2100 Hacer
          Escribir "Línea ", i;
        FinPara
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    const res = interp.runAll();
    expect(res.outputs.length).toBeLessThanOrEqual(2001);
    expect(res.outputs[res.outputs.length - 1]).toContain('Salida truncada');
  });
});

describe('Subprograms, Pass-by-Reference & OOP Support (Auditoría Criterios Aceptación)', () => {
  it('modifies caller variables when passed Por Referencia', () => {
    const code = `
      SubProceso Incrementar(num Como Entero Por Referencia)
        num <- num + 10;
      FinSubProceso

      Proceso Principal
        Definir x Como Entero;
        x <- 5;
        Incrementar(x);
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    expect(interp.getVariable('x')).toBe(15);
  });

  it('instantiates classes and invokes methods modifying instance fields via Este', () => {
    const code = `
      Clase Contador
        Definir valor Como Entero;
        Publico Metodo Constructor(inicio Como Entero)
          Este.valor <- inicio;
        FinMetodo
        Publico Metodo Sumar(n Como Entero)
          Este.valor <- Este.valor + n;
        FinMetodo
      FinClase

      Proceso Principal
        Definir c Como Contador;
        c <- Nuevo Contador(10);
        c.Sumar(25);
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    const cObj = interp.getVariable('c');
    expect(cObj).toBeDefined();
    expect(cObj.fields['valor']).toBe(35);
  });

  it('supports inheritance (Hereda De) with method execution', () => {
    const code = `
      Clase Animal
        Definir nombre Como Cadena;
        Publico Metodo SetNombre(nom Como Cadena)
          Este.nombre <- nom;
        FinMetodo
      FinClase

      Clase Perro Hereda De Animal
        Definir raza Como Cadena;
        Publico Metodo SetRaza(r Como Cadena)
          Este.raza <- r;
        FinMetodo
      FinClase

      Proceso Principal
        Definir miPerro Como Perro;
        miPerro <- Nuevo Perro();
        miPerro.SetNombre("Rex");
        miPerro.SetRaza("Pastor");
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    interp.runAll();
    const perro = interp.getVariable('miPerro');
    expect(perro.fields['nombre']).toBe('Rex');
    expect(perro.fields['raza']).toBe('Pastor');
  });

  it('runs load test with large array modified inside a loop without memory lag (Auditoría P1)', () => {
    const code = `
      Algoritmo CargaArreglo
        Dimension arr[500];
        Definir i Como Entero;
        Para i <- 0 Hasta 50 Hacer
          arr[i] <- i * 3;
        FinPara
      FinAlgoritmo
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    const start = Date.now();
    const res = interp.runAll();
    const duration = Date.now() - start;
    expect(res.error).toBeUndefined();
    expect(duration).toBeLessThan(1500);
  });
});

describe('Auditoría v3 — Correcciones P1, P2 y P3', () => {
  it('P1: does NOT throw wall-clock timeout in interactive step-by-step mode after long pause', async () => {
    const code = `
      Proceso PasoAPaso
        Definir a Como Entero;
        Definir b Como Entero;
        a <- 10;
        b <- 20;
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    // Configure an ultra-tight 15ms timeout, but in interactive mode
    const interp = new Interpreter(ast, { isInteractive: true, maxExecutionTimeMs: 15 });
    const gen = interp.generateSteps();

    // Step 1
    const step1 = gen.next();
    expect(step1.done).toBe(false);

    // Simulate user pausing to read trace for 35ms (> 15ms timeout)
    await new Promise(resolve => setTimeout(resolve, 35));

    // Step 2 after pause — must proceed normally without false timeout error
    const step2 = gen.next();
    expect(step2.done).toBe(false);
    expect(interp.error).toBeUndefined();

    // Finish execution
    let done = false;
    while (!done) {
      const res = gen.next();
      if (res.done) done = true;
    }
    expect(interp.error).toBeUndefined();
    expect(interp.getVariable('b')).toBe(20);
  });

  it('P1: enforces execution timeout during non-interactive batch runAll on runaway loop', () => {
    const code = `
      Proceso BucleInfinito
        Definir x Como Entero;
        x <- 1;
        Mientras Verdadero Hacer
          x <- x + 1;
        FinMientras
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast, { maxExecutionTimeMs: 50 });
    const res = interp.runAll([], false);
    expect(res.error).toMatch(/Tiempo (l\u00EDmite|m\u00E1ximo) de ejecuci\u00F3n (superado|excedido)/i);
  });

  it('P2: rejects non-integer/decimal array dimensions explicitly without truncation', () => {
    const code = `
      Proceso DimensionDecimal
        Dimension arr[4.5];
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);
    const res = interp.runAll();
    expect(res.error).toMatch(/número entero válido/);
  });

  it('P2: enforces global aggregate memory quota across multiple declared arrays', () => {
    const code = `
      Proceso MultiplesArreglos
        Dimension a[90000];
        Dimension b[90000];
        Dimension c[90000];
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    // Default maxSystemTotalArrayElements is 250,000 (90,000 * 3 = 270,000 > 250,000)
    const interp = new Interpreter(ast, { maxArrayElements: 100000 });
    const res = interp.runAll();
    expect(res.error).toMatch(/cuota total de memoria para arreglos ha sido superada/);
  });

  it('P2: supports running runAll multiple times consecutively on the same Interpreter instance (idempotent reset)', () => {
    const code = `
      Proceso ContadorSimple
        Definir cont Como Entero;
        cont <- 5;
        Escribir "Total:", cont;
      FinProceso
    `;
    const ast = new Parser(new Lexer(code).tokenize()).parse();
    const interp = new Interpreter(ast);

    const firstRun = interp.runAll();
    expect(firstRun.outputs).toEqual(['Total:5']);
    expect(firstRun.error).toBeUndefined();

    // Second run on the same instance
    const secondRun = interp.runAll();
    expect(secondRun.outputs).toEqual(['Total:5']);
    expect(secondRun.error).toBeUndefined();
    expect(secondRun.outputs.length).toBe(1);
  });

  it('P2: transpiles Python Escribir with multiple arguments using sep="" to match interpreter', () => {
    const code = 'Escribir "Valor=", 42;';
    const py = transpileToPython(code);
    expect(py).toContain('print("Valor=", 42, sep="")');
  });

  it('P2: transpiles Rust loops with Con Paso step and descending ranges correctly', () => {
    const codeAsc = 'Para i <- 1 Hasta 10 Con Paso 2 Hacer\n  Escribir i;\nFinPara';
    const rustAsc = transpileToRust(codeAsc);
    expect(rustAsc).toContain('(1..=10).step_by(2)');

    const codeDesc = 'Para i <- 10 Hasta 1 Con Paso -1 Hacer\n  Escribir i;\nFinPara';
    const rustDesc = transpileToRust(codeDesc);
    expect(rustDesc).toContain('(1..=10).rev()');
  });

  it('P1: throws lexical error on huge source inputs exceeding MAX_SOURCE_LENGTH', () => {
    const hugeInput = 'x <- 1;\n'.repeat(15000); // ~120KB
    const lexer = new Lexer(hugeInput);
    expect(() => lexer.tokenize()).toThrowError(/excede el tamaño máximo permitido/);
  });

  it('P1: throws parser error on expressions exceeding maximum recursion depth', () => {
    // Nest 120 layers of parentheses: "((((...1...))))"
    let deepExpr = '1';
    for (let i = 0; i < 110; i++) {
      deepExpr = `(${deepExpr} + 1)`;
    }
    const code = `Proceso Profundo\n  x <- ${deepExpr};\nFinProceso`;
    const tokens = new Lexer(code).tokenize();
    const parser = new Parser(tokens);
    expect(() => parser.parse()).toThrowError(/Profundidad máxima de expresión superada/);
  });

  it('P2: safeStorage operations provide robust read/write/remove with memory fallback', () => {
    safeStorageSet('test-key-auditoria', 'valor_guardado');
    expect(safeStorageGet('test-key-auditoria', '')).toBe('valor_guardado');
    safeStorageRemove('test-key-auditoria');
    expect(safeStorageGet('test-key-auditoria', 'predeterminado')).toBe('predeterminado');
  });
});



