import {
  ProgramNode,
  ASTNode,
  DeclarationNode,
  DimensionNode,
  AssignmentNode,
  ReadNode,
  WriteNode,
  IfNode,
  SwitchNode,
  WhileNode,
  RepeatNode,
  ForNode,
  SubprogramNode,
  ReturnNode,
  ClassNode,
  MethodNode,
  CallStatementNode,
  ExpressionNode,
  ObjectInstance,
  TraceStep
} from './types';

export interface InterpreterOptions {
  maxSteps?: number;
  maxCallStackDepth?: number;
  maxArrayElements?: number;
  maxSystemTotalArrayElements?: number;
  maxExecutionTimeMs?: number;
  isInteractive?: boolean;
}

export class Interpreter {
  private program: ProgramNode;
  private classes: Map<string, ClassNode> = new Map();
  private subprograms: Map<string, SubprogramNode> = new Map();

  // Call stack / environment
  private callStack: Array<{
    name: string;
    variables: Map<string, any>;
    variableTypes?: Map<string, string>;
    references?: Map<string, { scope: Map<string, any>; key: string }>;
    thisInstance?: ObjectInstance;
    currentClass?: ClassNode;
  }> = [];

  public static readonly MAX_STEPS = 50_000;
  public static readonly MAX_CALL_STACK_DEPTH = 100;
  public static readonly MAX_ARRAY_TOTAL_ELEMENTS = 100_000;
  public static readonly MAX_SYSTEM_TOTAL_ARRAY_ELEMENTS = 250_000;
  public static readonly MAX_OUTPUT_LINES = 2_000;
  public static readonly MAX_TRACE_STEPS_STORED = 2_000;
  public static readonly MAX_ARRAY_FORMAT_ELEMENTS = 8;
  public static readonly DEFAULT_TIMEOUT_MS = 5_000;

  private maxSteps: number = Interpreter.MAX_STEPS;
  private maxCallStackDepth: number = Interpreter.MAX_CALL_STACK_DEPTH;
  private maxArrayElements: number = Interpreter.MAX_ARRAY_TOTAL_ELEMENTS;
  private maxSystemTotalArrayElements: number = Interpreter.MAX_SYSTEM_TOTAL_ARRAY_ELEMENTS;
  private maxExecutionTimeMs: number = Interpreter.DEFAULT_TIMEOUT_MS;
  public isInteractive: boolean = false;
  private totalAllocatedArrayElements: number = 0;
  private startTime: number = 0;
  private lastOutputHadNoNewline: boolean = false;

  private objectCounter: number = 0;
  private inputs: string[] = [];
  private outputs: string[] = [];
  private steps: TraceStep[] = [];
  private stepNumber: number = 0;

  public isWaitingForInput: boolean = false;
  public inputTarget?: string;
  public isFinished: boolean = false;
  public error?: string;

  constructor(program: ProgramNode, options?: InterpreterOptions) {
    this.program = program;
    if (options?.maxSteps !== undefined) this.maxSteps = options.maxSteps;
    if (options?.maxCallStackDepth !== undefined) this.maxCallStackDepth = options.maxCallStackDepth;
    if (options?.maxArrayElements !== undefined) this.maxArrayElements = options.maxArrayElements;
    if (options?.maxSystemTotalArrayElements !== undefined) this.maxSystemTotalArrayElements = options.maxSystemTotalArrayElements;
    if (options?.maxExecutionTimeMs !== undefined) this.maxExecutionTimeMs = options.maxExecutionTimeMs;
    if (options?.isInteractive !== undefined) this.isInteractive = options.isInteractive;

    // Register classes and subprograms
    for (const cls of program.classes) {
      this.classes.set(cls.name.toLowerCase(), cls);
    }
    for (const sub of program.subprograms) {
      this.subprograms.set(sub.name.toLowerCase(), sub);
    }
    // Initialize global / main frame
    this.callStack.push({
      name: program.name,
      variables: new Map(),
      variableTypes: new Map()
    });
  }

  public reset(): void {
    this.callStack = [{
      name: this.program.name,
      variables: new Map(),
      variableTypes: new Map()
    }];
    this.lastOutputHadNoNewline = false;
    this.objectCounter = 0;
    this.inputs = [];
    this.outputs = [];
    this.steps = [];
    this.stepNumber = 0;
    this.totalAllocatedArrayElements = 0;
    this.isWaitingForInput = false;
    this.inputTarget = undefined;
    this.isFinished = false;
    this.error = undefined;
    this.startTime = 0;
  }

  public setInputs(inputs: string[]): void {
    this.inputs = [...inputs];
  }

  public provideInput(val: string): void {
    if (this.isWaitingForInput && this.inputTarget) {
      this.assignValue(this.inputTarget, this.parsePrimitiveInput(val));
      this.isWaitingForInput = false;
      this.inputTarget = undefined;
    }
  }

  public getOutputs(): string[] {
    return this.outputs;
  }

  public getSteps(): TraceStep[] {
    return this.steps;
  }

  public getVariablesSnapshot(): Record<string, string> {
    const snap: Record<string, string> = {};
    const currentFrame = this.currentFrame();
    if (!currentFrame) return snap;

    for (const [k, v] of currentFrame.variables.entries()) {
      snap[k] = this.formatValue(v);
    }
    if (currentFrame.thisInstance) {
      for (const [k, v] of Object.entries(currentFrame.thisInstance.fields)) {
        snap[`Este.${k}`] = this.formatValue(v);
      }
    }
    return snap;
  }

  private currentFrame() {
    return this.callStack[this.callStack.length - 1];
  }

  // Execution runner for step-by-step
  public *generateSteps(): Generator<TraceStep, void, unknown> {
    try {
      yield* this.executeBlock(this.program.body);
      this.isFinished = true;
    } catch (e: any) {
      this.error = e.message || String(e);
      this.isFinished = true;
    }
  }

  public runAll(inputs: string[] = [], throwOnError: boolean = false, maxTimeMs?: number): { outputs: string[]; steps: TraceStep[]; error?: string } {
    this.reset();
    this.isInteractive = false;
    if (maxTimeMs !== undefined) this.maxExecutionTimeMs = maxTimeMs;
    this.startTime = Date.now();
    this.setInputs(inputs);
    const gen = this.generateSteps();
    while (!this.isFinished) {
      if (this.maxExecutionTimeMs > 0 && (Date.now() - this.startTime > this.maxExecutionTimeMs)) {
        this.error = `Tiempo límite de ejecución superado (${this.maxExecutionTimeMs} ms). Posible bucle infinito o cómputo excesivo.`;
        this.isFinished = true;
        break;
      }
      const res = gen.next();
      if (res.done) break;
    }
    if (throwOnError && this.error) {
      throw new Error(this.error);
    }
    return {
      outputs: this.outputs,
      steps: this.steps,
      error: this.error
    };
  }

  public getVariable(name: string): any {
    return this.resolveVariable(name);
  }

  private consumeStep(line?: number): void {
    if (!this.startTime) {
      this.startTime = Date.now();
    }
    this.stepNumber++;
    if (this.stepNumber > this.maxSteps) {
      const lineMsg = line ? ` (en línea ${line})` : '';
      throw new Error(`Límite de ejecución alcanzado (${this.maxSteps} pasos)${lineMsg}. Posible bucle infinito o recursión excesiva.`);
    }
    // Interactive debugging / stepping must not be interrupted by wall-clock timeout
    if (!this.isInteractive && this.maxExecutionTimeMs > 0 && (Date.now() - this.startTime > this.maxExecutionTimeMs)) {
      const lineMsg = line ? ` (en línea ${line})` : '';
      throw new Error(`Tiempo máximo de ejecución excedido (${this.maxExecutionTimeMs} ms)${lineMsg}. Posible bucle infinito.`);
    }
  }

  private recordStep(step: TraceStep): void {
    if (this.steps.length < Interpreter.MAX_TRACE_STEPS_STORED) {
      this.steps.push(step);
    }
  }

  private *executeBlock(statements: ASTNode[]): Generator<TraceStep, boolean | void, unknown> {
    for (const stmt of statements) {
      const returned = yield* this.executeStatement(stmt);
      if (returned) return true; // Signal return from subprogram/method
    }
    return false;
  }

  private *executeStatement(stmt: ASTNode): Generator<TraceStep, boolean | void, unknown> {
    this.consumeStep(stmt.line);

    switch (stmt.type) {
      case 'Declaration': {
        const decl = stmt as DeclarationNode;
        const initialVal = this.defaultValueFor(decl.dataType);
        this.assignValue(decl.variableName, initialVal);
        this.currentFrame()?.variableTypes?.set(decl.variableName.toLowerCase(), decl.dataType);
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: decl.line,
          action: `Definir ${decl.variableName} Como ${decl.dataType}`,
          variables: this.getVariablesSnapshot(),
          changedVar: decl.variableName
        };
        this.recordStep(step);
        yield step;
        break;
      }

      case 'Dimension': {
        const dim = stmt as DimensionNode;
        const sizes: number[] = [];
        for (const sExpr of dim.sizes) {
          const val = this.evalExpression(sExpr);
          if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val) || !Number.isInteger(val)) {
            throw new Error(`La dimensión para "${dim.name}" debe ser un número entero válido (recibido ${val} en línea ${dim.line})`);
          }
          if (val <= 0) {
            throw new Error(`El tamaño de la dimensión para "${dim.name}" debe ser mayor a 0 (recibido ${val} en línea ${dim.line})`);
          }
          sizes.push(val);
        }
        const totalElements = sizes.reduce((acc, sz) => acc * sz, 1);
        if (totalElements > this.maxArrayElements) {
          throw new Error(`El arreglo "${dim.name}" solicita ${totalElements} elementos, superando el límite de ${this.maxArrayElements} elementos permitidos.`);
        }
        if (this.totalAllocatedArrayElements + totalElements > this.maxSystemTotalArrayElements) {
          throw new Error(`La cuota total de memoria para arreglos ha sido superada (${this.totalAllocatedArrayElements + totalElements} > ${this.maxSystemTotalArrayElements} elementos).`);
        }
        this.totalAllocatedArrayElements += totalElements;
        const arr = this.createArray(sizes, this.defaultValueFor(dim.dataType));
        this.assignValue(dim.name, arr);
        this.currentFrame()?.variableTypes?.set(dim.name.toLowerCase(), dim.dataType);
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: dim.line,
          action: `Dimension ${dim.name}[${sizes.join(', ')}]`,
          variables: this.getVariablesSnapshot(),
          changedVar: dim.name
        };
        this.recordStep(step);
        yield step;
        break;
      }

      case 'Assignment': {
        const assign = stmt as AssignmentNode;
        const value = this.evalExpression(assign.value);

        let varName = assign.target.name;
        if (assign.target.isThis) {
          const inst = this.currentFrame()?.thisInstance;
          if (inst && assign.target.member) {
            const parts = assign.target.member.split('.');
            let obj: any = inst;
            for (let p = 0; p < parts.length - 1; p++) {
              if (obj && obj.fields) obj = obj.fields[parts[p]];
            }
            if (obj && obj.fields) {
              obj.fields[parts[parts.length - 1]] = value;
              varName = `Este.${assign.target.member}`;
            }
          }
        } else if (assign.target.member) {
          const parts = assign.target.member.split('.');
          let obj: any = this.resolveVariable(assign.target.name);
          for (let p = 0; p < parts.length - 1; p++) {
            if (obj && obj.fields) obj = obj.fields[parts[p]];
          }
          if (obj && obj.fields) {
            obj.fields[parts[parts.length - 1]] = value;
            varName = `${assign.target.name}.${assign.target.member}`;
          }
        } else if (assign.target.indices && assign.target.indices.length > 0) {
          const idxs = assign.target.indices.map(i => Math.floor(this.evalExpression(i)));
          const arr = this.resolveVariable(assign.target.name);
          this.setArrayElement(arr, idxs, value);
          varName = `${assign.target.name}[${idxs.join(', ')}]`;
        } else {
          this.assignValue(assign.target.name, value);
        }

        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: assign.line,
          action: `${varName} <- ${this.formatValue(value)}`,
          variables: this.getVariablesSnapshot(),
          changedVar: varName
        };
        this.recordStep(step);
        yield step;
        break;
      }

      case 'Read': {
        const read = stmt as ReadNode;
        for (const target of read.targets) {
          let val: any;
          if (this.inputs.length > 0) {
            val = this.parsePrimitiveInput(this.inputs.shift()!);
          } else {
            // Interactive waiting
            this.isWaitingForInput = true;
            this.inputTarget = target.name;
            val = ''; // empty string until input provided
          }

          let varName = target.name;
          if (target.isThis) {
            const inst = this.currentFrame()?.thisInstance;
            if (inst && target.member) {
              const parts = target.member.split('.');
              let obj: any = inst;
              for (let p = 0; p < parts.length - 1; p++) {
                if (obj && obj.fields) obj = obj.fields[parts[p]];
              }
              if (obj && obj.fields) {
                obj.fields[parts[parts.length - 1]] = val;
                varName = `Este.${target.member}`;
              }
            }
          } else if (target.member) {
            const parts = target.member.split('.');
            let obj: any = this.resolveVariable(target.name);
            for (let p = 0; p < parts.length - 1; p++) {
              if (obj && obj.fields) obj = obj.fields[parts[p]];
            }
            if (obj && obj.fields) {
              obj.fields[parts[parts.length - 1]] = val;
              varName = `${target.name}.${target.member}`;
            }
          } else if (target.indices && target.indices.length > 0) {
            const idxs = target.indices.map(i => Math.floor(this.evalExpression(i)));
            const arr = this.resolveVariable(target.name);
            this.setArrayElement(arr, idxs, val);
            varName = `${target.name}[${idxs.join(', ')}]`;
          } else {
            this.assignValue(target.name, val);
          }

          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: read.line,
            action: `Leer ${varName} (= ${this.formatValue(val)})`,
            variables: this.getVariablesSnapshot(),
            changedVar: varName
          };
          this.recordStep(step);
          yield step;
        }
        break;
      }

      case 'Write': {
        const write = stmt as WriteNode;
        const lineParts = write.expressions.map(e => {
          const val = this.evalExpression(e);
          const isReal = this.isRealExpression(e);
          return this.formatValueForPrint(val, isReal);
        });
        const fullOutput = lineParts.join('');

        if (this.lastOutputHadNoNewline && this.outputs.length > 0) {
          this.outputs[this.outputs.length - 1] += fullOutput;
        } else {
          if (this.outputs.length < Interpreter.MAX_OUTPUT_LINES) {
            this.outputs.push(fullOutput);
          } else if (this.outputs.length === Interpreter.MAX_OUTPUT_LINES) {
            this.outputs.push(`[Salida truncada: se alcanzó el límite de ${Interpreter.MAX_OUTPUT_LINES} líneas de salida]`);
          }
        }
        this.lastOutputHadNoNewline = Boolean(write.noNewline);

        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: write.line,
          action: `Escribir ${fullOutput}`,
          variables: this.getVariablesSnapshot(),
          outputLog: fullOutput
        };
        this.recordStep(step);
        yield step;
        break;
      }

      case 'If': {
        const ifNode = stmt as IfNode;
        const cond = Boolean(this.evalExpression(ifNode.condition));
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: ifNode.line,
          action: `Si (${cond ? 'Verdadero' : 'Falso'})`,
          variables: this.getVariablesSnapshot()
        };
        this.recordStep(step);
        yield step;

        if (cond) {
          const ret = yield* this.executeBlock(ifNode.thenBranch);
          if (ret) return true;
        } else if (ifNode.elseBranch) {
          const ret = yield* this.executeBlock(ifNode.elseBranch);
          if (ret) return true;
        }
        break;
      }

      case 'Switch': {
        const sw = stmt as SwitchNode;
        const selVal = this.evalExpression(sw.expression);
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: sw.line,
          action: `Segun ${this.formatValue(selVal)}`,
          variables: this.getVariablesSnapshot()
        };
        this.recordStep(step);
        yield step;

        let matched = false;
        for (const c of sw.cases) {
          const matchCase = c.values.some(v => this.evalExpression(v) === selVal);
          if (matchCase) {
            matched = true;
            const ret = yield* this.executeBlock(c.body);
            if (ret) return true;
            break;
          }
        }
        if (!matched && sw.defaultCase) {
          const ret = yield* this.executeBlock(sw.defaultCase);
          if (ret) return true;
        }
        break;
      }

      case 'While': {
        const wh = stmt as WhileNode;
        while (true) {
          this.consumeStep(wh.line);
          const cond = Boolean(this.evalExpression(wh.condition));
          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: wh.line,
            action: `Mientras (${cond ? 'Verdadero' : 'Falso'})`,
            variables: this.getVariablesSnapshot()
          };
          this.recordStep(step);
          yield step;

          if (!cond) break;

          const ret = yield* this.executeBlock(wh.body);
          if (ret) return true;
        }
        break;
      }

      case 'Repeat': {
        const rep = stmt as RepeatNode;
        while (true) {
          this.consumeStep(rep.line);
          const ret = yield* this.executeBlock(rep.body);
          if (ret) return true;

          const cond = Boolean(this.evalExpression(rep.condition));
          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: rep.line,
            action: `Hasta Que (${cond ? 'Verdadero' : 'Falso'})`,
            variables: this.getVariablesSnapshot()
          };
          this.recordStep(step);
          yield step;

          if (cond) break; // Exits when condition is true
        }
        break;
      }

      case 'For': {
        const f = stmt as ForNode;
        const start = Math.floor(this.evalExpression(f.startValue));
        const end = Math.floor(this.evalExpression(f.endValue));
        const stepVal = f.stepValue ? Math.floor(this.evalExpression(f.stepValue)) : 1;
        if (stepVal === 0) throw new Error(`El paso en el bucle Para no puede ser 0 (línea ${f.line})`);

        let current = start;
        this.assignValue(f.variableName, current);

        while ((stepVal > 0 && current <= end) || (stepVal < 0 && current >= end)) {
          this.consumeStep(f.line);
          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: f.line,
            action: `Para ${f.variableName} = ${current} (hasta ${end})`,
            variables: this.getVariablesSnapshot(),
            changedVar: f.variableName
          };
          this.recordStep(step);
          yield step;

          const ret = yield* this.executeBlock(f.body);
          if (ret) return true;

          current += stepVal;
          this.assignValue(f.variableName, current);
        }
        break;
      }

      case 'Return': {
        const retNode = stmt as ReturnNode;
        let retVal: any;
        if (retNode.value) {
          retVal = this.evalExpression(retNode.value);
        }
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: retNode.line,
          action: `Retornar ${this.formatValue(retVal)}`,
          variables: this.getVariablesSnapshot()
        };
        this.recordStep(step);
        yield step;
        (this.currentFrame() as any).returnValue = retVal;
        return true;
      }

      case 'CallStatement': {
        const cs = stmt as CallStatementNode;
        this.evalExpression(cs.call);
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: cs.line,
          action: `Llamada a procedimiento`,
          variables: this.getVariablesSnapshot()
        };
        this.recordStep(step);
        yield step;
        break;
      }
    }
  }

  // Expression evaluation
  public evalExpression(expr: ExpressionNode): any {
    switch (expr.type) {
      case 'Literal':
        return expr.value;

      case 'Variable':
        return this.resolveVariable(expr.name);

      case 'This': {
        const inst = this.currentFrame()?.thisInstance;
        if (!inst) throw new Error('"Este" solo es accesible dentro de una clase');
        if (expr.member) return inst.fields[expr.member];
        return inst;
      }

      case 'BinaryOp': {
        // Short-circuit logical evaluation
        if (expr.operator === 'Y') {
          const leftVal = this.evalExpression(expr.left);
          if (!leftVal) return false;
          return Boolean(this.evalExpression(expr.right));
        }
        if (expr.operator === 'O') {
          const leftVal = this.evalExpression(expr.left);
          if (leftVal) return true;
          return Boolean(this.evalExpression(expr.right));
        }

        const left = this.evalExpression(expr.left);
        const right = this.evalExpression(expr.right);
        const opUpper = (expr.operator || '').toUpperCase();
        if (opUpper === 'MOD' || expr.operator === '%') {
          if (right === 0) throw new Error('Error en tiempo de ejecución: Operación módulo con divisor cero no permitida');
          return left % right;
        }
        if (opUpper === 'DIV') {
          if (right === 0) throw new Error('Error en tiempo de ejecución: División por cero no permitida');
          return Math.trunc(left / right);
        }

        switch (expr.operator) {
          case '+':
            if (typeof left === 'string' || typeof right === 'string') return `${left}${right}`;
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            if (right === 0) throw new Error('Error en tiempo de ejecución: División por cero no permitida');
            return left / right;
          case '^':
            return Math.pow(left, right);
          case '=':
            return left === right;
          case '<>':
          case '!=':
            return left !== right;
          case '<':
            return left < right;
          case '<=':
            return left <= right;
          case '>':
            return left > right;
          case '>=':
            return left >= right;
        }
        return 0;
      }

      case 'UnaryOp': {
        const arg = this.evalExpression(expr.argument);
        if (expr.operator === 'NO') return !arg;
        if (expr.operator === '-') return -arg;
        return arg;
      }

      case 'ArrayAccess': {
        const arr = (expr as any).object ? this.evalExpression((expr as any).object) : this.resolveVariable(expr.name);
        const indices = expr.indices.map(i => Math.floor(this.evalExpression(i)));
        return this.getArrayElement(arr, indices);
      }

      case 'MemberAccess': {
        const obj = this.evalExpression(expr.object);
        if (!obj || typeof obj !== 'object') {
          throw new Error(`No se puede acceder al miembro "${expr.member}" de un valor no objeto`);
        }
        // Could be a field access when no arguments are provided
        if (obj.fields && expr.member in obj.fields && !expr.args) {
          return obj.fields[expr.member];
        }
        // Or method call
        const args = expr.args ? expr.args.map(a => this.evalExpression(a)) : [];
        return this.invokeMethod(obj, expr.member, args);
      }

      case 'Call': {
        const sub = this.subprograms.get(expr.callee.toLowerCase());
        if (sub) {
          const evaluatedArgs = expr.args.map(a => this.evalExpression(a));
          return this.invokeSubprogram(sub, evaluatedArgs, expr.args);
        }
        // Built-in functions
        return this.callBuiltIn(expr.callee, expr.args.map(a => this.evalExpression(a)));
      }

      case 'New': {
        const cls = this.classes.get(expr.className.toLowerCase());
        if (!cls) throw new Error(`Clase no definida: ${expr.className}`);
        this.objectCounter++;
        const instance: ObjectInstance = {
          id: `${cls.name}#${this.objectCounter}`,
          className: cls.name,
          fields: {}
        };
        // Initialize default fields from class and superclass
        this.initClassFields(cls, instance);

        // Find constructor
        const ctor = this.findMethod(cls, 'Constructor');
        if (ctor) {
          const evaluatedArgs = expr.args.map(a => this.evalExpression(a));
          this.executeMethod(cls, ctor, instance, evaluatedArgs);
        }
        return instance;
      }

      case 'SuperCall': {
        const frame = this.currentFrame();
        const inst = frame?.thisInstance;
        if (!inst) throw new Error('Llamada a Super fuera de una instancia');
        const currentClass = frame?.currentClass || this.classes.get(inst.className.toLowerCase());
        if (!currentClass?.superClass) throw new Error(`La clase ${currentClass?.name || inst.className} no tiene superclase`);
        const superClass = this.classes.get(currentClass.superClass.toLowerCase());
        if (!superClass) throw new Error(`Superclase no encontrada: ${currentClass.superClass}`);

        const method = this.findMethod(superClass, expr.methodName);
        if (!method) throw new Error(`Método ${expr.methodName} no encontrado en superclase`);
        const evaluatedArgs = expr.args.map(a => this.evalExpression(a));
        return this.executeMethod(superClass, method, inst, evaluatedArgs);
      }
    }
  }

  // OOP helpers
  private initClassFields(cls: ClassNode, instance: ObjectInstance): void {
    if (cls.superClass) {
      const superCls = this.classes.get(cls.superClass.toLowerCase());
      if (superCls) this.initClassFields(superCls, instance);
    }
    for (const f of cls.fields) {
      instance.fields[f.variableName] = this.defaultValueFor(f.dataType);
    }
  }

  private findMethod(cls: ClassNode, name: string): MethodNode | undefined {
    const m = cls.methods.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (m) return m;
    if (cls.superClass) {
      const s = this.classes.get(cls.superClass.toLowerCase());
      if (s) return this.findMethod(s, name);
    }
    return undefined;
  }

  public invokeMethod(instance: ObjectInstance, methodName: string, args: any[]): any {
    const cls = this.classes.get(instance.className.toLowerCase());
    if (!cls) throw new Error(`Clase ${instance.className} no encontrada`);
    const method = this.findMethod(cls, methodName);
    if (!method) throw new Error(`Método "${methodName}" no encontrado en ${instance.className}`);
    return this.executeMethod(cls, method, instance, args);
  }

  private executeMethod(_cls: ClassNode, method: MethodNode, instance: ObjectInstance, args: any[]): any {
    this.consumeStep();
    if (this.callStack.length >= this.maxCallStackDepth) {
      throw new Error(`Profundidad máxima de pila de llamadas superada (${this.maxCallStackDepth} niveles). Posible recursión infinita.`);
    }

    const frameVars = new Map<string, any>();
    const frameTypes = new Map<string, string>();
    for (let i = 0; i < method.parameters.length; i++) {
      const param = method.parameters[i];
      frameVars.set(param.name, args[i] !== undefined ? args[i] : this.defaultValueFor(param.dataType));
      frameTypes.set(param.name.toLowerCase(), param.dataType);
    }

    this.callStack.push({
      name: `${instance.className}.${method.name}`,
      variables: frameVars,
      variableTypes: frameTypes,
      thisInstance: instance,
      currentClass: _cls
    });

    const gen = this.executeBlock(method.body);
    while (true) {
      const step = gen.next();
      if (step.done) break;
    }

    const frame = this.callStack.pop();
    return (frame as any)?.returnValue;
  }

  private invokeSubprogram(sub: SubprogramNode, evalArgs: any[], rawArgs: ExpressionNode[]): any {
    this.consumeStep();
    if (this.callStack.length >= this.maxCallStackDepth) {
      throw new Error(`Profundidad máxima de pila de llamadas superada (${this.maxCallStackDepth} niveles). Posible recursión infinita en ${sub.name}.`);
    }

    const frameVars = new Map<string, any>();
    const frameTypes = new Map<string, string>();
    const references = new Map<string, { scope: Map<string, any>; key: string }>();

    for (let i = 0; i < sub.parameters.length; i++) {
      const param = sub.parameters[i];
      const val = evalArgs[i] !== undefined ? evalArgs[i] : this.defaultValueFor(param.dataType);
      frameTypes.set(param.name.toLowerCase(), param.dataType);

      if (param.isReference && rawArgs[i].type === 'Variable') {
        const callerVar = (rawArgs[i] as any).name;
        const callerScope = this.findScopeFor(callerVar);
        if (callerScope) {
          references.set(param.name, { scope: callerScope, key: callerVar });
        }
      }
      frameVars.set(param.name, val);
    }

    this.callStack.push({
      name: sub.name,
      variables: frameVars,
      variableTypes: frameTypes,
      references
    });

    const gen = this.executeBlock(sub.body);
    while (true) {
      const step = gen.next();
      if (step.done) break;
    }

    // Sync back reference parameters if needed
    for (const [paramName, ref] of references.entries()) {
      if (frameVars.has(paramName)) {
        ref.scope.set(ref.key, frameVars.get(paramName));
      }
    }

    const frame = this.callStack.pop();
    return (frame as any)?.returnValue;
  }

  private callBuiltIn(name: string, args: any[]): any {
    const n = name.toLowerCase();
    switch (n) {
      case 'rc':
      case 'raiz':
        if (args.length === 0) throw new Error('La función rc/raiz requiere 1 argumento');
        if (args[0] < 0) throw new Error('No se puede calcular la raíz cuadrada de un número negativo');
        return Math.sqrt(args[0]);
      case 'abs':
        if (args.length === 0) throw new Error('La función abs requiere 1 argumento');
        return Math.abs(args[0]);
      case 'trunc':
        if (args.length === 0) throw new Error('La función trunc requiere 1 argumento');
        return Math.trunc(args[0]);
      case 'redon':
        if (args.length === 0) throw new Error('La función redon requiere 1 argumento');
        return Math.round(args[0]);
      case 'sen':
      case 'seno':
        if (args.length === 0) throw new Error('La función sen/seno requiere 1 argumento');
        return Math.sin(args[0]);
      case 'cos':
      case 'coseno':
        if (args.length === 0) throw new Error('La función cos/coseno requiere 1 argumento');
        return Math.cos(args[0]);
      case 'tan':
      case 'tangente':
        if (args.length === 0) throw new Error('La función tan/tangente requiere 1 argumento');
        return Math.tan(args[0]);
      case 'ln':
        if (args.length === 0) throw new Error('La función ln requiere 1 argumento');
        if (args[0] <= 0) throw new Error('El argumento de la función ln debe ser estrictamente positivo');
        return Math.log(args[0]);
      case 'exp':
        if (args.length === 0) throw new Error('La función exp requiere 1 argumento');
        return Math.exp(args[0]);
      case 'azar':
      case 'aleatorio':
        const max = args[0] !== undefined ? args[0] : 10;
        return Math.floor(Math.random() * max);
      case 'longitud':
        return String(args[0] !== undefined ? args[0] : '').length;
      case 'mayusculas':
        return String(args[0] !== undefined ? args[0] : '').toUpperCase();
      case 'minusculas':
        return String(args[0] !== undefined ? args[0] : '').toLowerCase();
      case 'subcadena': {
        const str = String(args[0] !== undefined ? args[0] : '');
        const start = args[1] !== undefined ? Math.floor(args[1]) : 0;
        const end = args[2] !== undefined ? Math.floor(args[2]) : str.length;
        return str.substring(start, end + 1);
      }
      case 'caracteren':
      case 'charat': {
        const str = String(args[0] !== undefined ? args[0] : '');
        const idx = args[1] !== undefined ? Math.floor(args[1]) : 0;
        return str.charAt(idx);
      }
      case 'atexto':
      case 'totext':
        return String(args[0] !== undefined ? args[0] : '');
      case 'aentero':
      case 'tointeger':
        return Math.trunc(Number(args[0] !== undefined ? args[0] : 0));
      case 'areal':
      case 'toreal':
        return Number(args[0] !== undefined ? args[0] : 0);
      case 'codigocaracter':
      case 'charcode':
        return String(args[0] !== undefined ? args[0] : '').charCodeAt(0) || 0;
      case 'caracterdesdecodigo':
      case 'charfromcode':
        return String.fromCharCode(Number(args[0] !== undefined ? args[0] : 0));
      case 'copiar':
      case 'copy': {
        const inst = args[0];
        if (!inst || typeof inst !== 'object' || !inst.className) {
          throw new Error('La función Copiar requiere una instancia de objeto');
        }
        this.objectCounter++;
        return {
          id: `${inst.className}#${this.objectCounter}`,
          className: inst.className,
          fields: { ...inst.fields }
        };
      }
      default:
        throw new Error(`Función no definida o desconocida: "${name}"`);
    }
  }

  // Variable & array storage helpers
  private resolveVariable(name: string): any {
    const frame = this.currentFrame();
    if (frame) {
      if (frame.references?.has(name)) {
        const ref = frame.references.get(name)!;
        if (ref.scope.has(ref.key)) {
          return ref.scope.get(ref.key);
        }
      }
      if (frame.variables.has(name)) {
        return frame.variables.get(name);
      }
      if (frame.thisInstance && name in frame.thisInstance.fields) {
        return frame.thisInstance.fields[name];
      }
    }
    // Main frame fallback
    const mainFrame = this.callStack[0];
    if (mainFrame?.variables.has(name)) {
      return mainFrame.variables.get(name);
    }
    throw new Error(`Variable no definida o no inicializada: "${name}"`);
  }

  private assignValue(name: string, val: any): void {
    const frame = this.currentFrame();
    if (!frame) return;

    if (frame.references?.has(name)) {
      const ref = frame.references.get(name)!;
      ref.scope.set(ref.key, val);
      frame.variables.set(name, val);
      return;
    }

    if (frame.thisInstance && name in frame.thisInstance.fields) {
      frame.thisInstance.fields[name] = val;
      return;
    }

    frame.variables.set(name, val);
  }

  private findScopeFor(name: string): Map<string, any> | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i].variables.has(name)) {
        return this.callStack[i].variables;
      }
    }
    return undefined;
  }

  private createArray(sizes: number[], defaultVal: any): any[] {
    if (sizes.length === 1) {
      return new Array(sizes[0]).fill(defaultVal);
    }
    const arr: any[] = [];
    for (let i = 0; i < sizes[0]; i++) {
      arr.push(this.createArray(sizes.slice(1), defaultVal));
    }
    return arr;
  }

  private getArrayElement(arr: any[], indices: number[]): any {
    let curr = arr;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (!Array.isArray(curr) || idx < 0 || idx >= curr.length) {
        throw new Error(`Índice de arreglo fuera de rango: ${idx}`);
      }
      curr = curr[idx];
    }
    return curr;
  }

  private setArrayElement(arr: any[], indices: number[], val: any): void {
    let curr = arr;
    for (let i = 0; i < indices.length - 1; i++) {
      const idx = indices[i];
      if (!Array.isArray(curr) || idx < 0 || idx >= curr.length) {
        throw new Error(`Índice de arreglo fuera de rango: ${idx}`);
      }
      curr = curr[idx];
    }
    const lastIdx = indices[indices.length - 1];
    if (!Array.isArray(curr) || lastIdx < 0 || lastIdx >= curr.length) {
      throw new Error(`Índice de arreglo fuera de rango: ${lastIdx}`);
    }
    curr[lastIdx] = val;
  }

  private defaultValueFor(type: string): any {
    const t = type.toLowerCase();
    if (t === 'entero' || t === 'integer') return 0;
    if (t === 'real') return 0.0;
    if (t === 'cadena' || t === 'texto' || t === 'text') return '';
    if (t === 'caracter' || t === 'character') return ' ';
    if (t === 'logico' || t === 'boolean') return false;
    return null;
  }

  private parsePrimitiveInput(val: string): any {
    if (val === '') return '';
    const trimmed = val.trim();
    if (trimmed === '') return val;
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
    if (trimmed.toLowerCase() === 'verdadero' || trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'falso' || trimmed.toLowerCase() === 'false') return false;
    return val;
  }

  private formatValue(val: any, depth: number = 0): string {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Verdadero' : 'Falso';
    if (typeof val === 'object' && val.id) return val.id; // e.g. "Persona#1"
    if (Array.isArray(val)) {
      if (depth >= 2) return `[Arreglo (${val.length} elem)]`;
      const maxShow = Interpreter.MAX_ARRAY_FORMAT_ELEMENTS;
      if (val.length <= maxShow) {
        return `[${val.map(x => this.formatValue(x, depth + 1)).join(', ')}]`;
      } else {
        const preview = val.slice(0, maxShow).map(x => this.formatValue(x, depth + 1)).join(', ');
        return `[${preview}, ... +${val.length - maxShow} más] (${val.length} elem)`;
      }
    }
    const str = String(val);
    if (str.length > 200) {
      return str.slice(0, 197) + '...';
    }
    return str;
  }

  private formatValueForPrint(val: any, isReal?: boolean): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? 'Verdadero' : 'Falso';
    if (typeof val === 'object' && val.id) return val.id;
    if (typeof val === 'number') {
      const rounded = Math.round(val * 1e10) / 1e10;
      if (isReal && Number.isInteger(rounded)) {
        return rounded.toFixed(1);
      }
      return String(rounded);
    }
    return String(val);
  }

  private isRealExpression(expr: ExpressionNode): boolean {
    if (!expr) return false;
    switch (expr.type) {
      case 'Literal':
        return expr.dataType === 'Real' || (typeof expr.value === 'number' && !Number.isInteger(expr.value));
      case 'Variable': {
        const t = this.resolveVariableType(expr.name);
        return t === 'real';
      }
      case 'ArrayAccess': {
        if ((expr as any).object) {
          const clsName = this.findClassForReceiver((expr as any).object);
          if (clsName) {
            const cls = this.classes.get(clsName.toLowerCase());
            const field = cls?.fields.find(f => f.variableName.toLowerCase() === expr.name.toLowerCase());
            if (field && field.dataType.toLowerCase() === 'real') return true;
          }
        }
        const t = this.resolveVariableType(expr.name);
        return t === 'real';
      }
      case 'This': {
        if (expr.member) {
          const inst = this.currentFrame()?.thisInstance;
          if (inst) {
            const cls = this.classes.get(inst.className.toLowerCase());
            if (cls) {
              const field = cls.fields.find(f => f.variableName.toLowerCase() === expr.member?.toLowerCase());
              if (field && field.dataType.toLowerCase() === 'real') return true;
            }
          }
        }
        return false;
      }
      case 'MemberAccess': {
        const clsName = this.findClassForReceiver(expr.object);
        if (clsName) {
          const cls = this.classes.get(clsName.toLowerCase());
          if (cls) {
            const method = this.findMethod(cls, expr.member);
            if (method && method.returnType?.toLowerCase() === 'real') return true;
            const field = cls.fields.find(f => f.variableName.toLowerCase() === expr.member.toLowerCase());
            if (field && field.dataType.toLowerCase() === 'real') return true;
          }
        }
        return false;
      }
      case 'Call': {
        const sub = this.subprograms.get(expr.callee.toLowerCase());
        if (sub && sub.returnType?.toLowerCase() === 'real') return true;
        const callee = expr.callee.toLowerCase();
        if (callee === 'rc' || callee === 'raiz' || callee === 'sen' || callee === 'seno' ||
            callee === 'cos' || callee === 'coseno' || callee === 'tan' || callee === 'tangente' ||
            callee === 'ln' || callee === 'exp' || callee === 'areal' || callee === 'toreal') {
          return true;
        }
        return false;
      }
      case 'BinaryOp': {
        if (expr.operator === '/') {
          return true;
        }
        if (expr.operator === '+' || expr.operator === '-' || expr.operator === '*' || expr.operator === '^') {
          return this.isRealExpression(expr.left) || this.isRealExpression(expr.right);
        }
        return false;
      }
      case 'UnaryOp':
        return this.isRealExpression(expr.argument);
      default:
        return false;
    }
  }

  private resolveVariableType(name: string): string | undefined {
    const lower = name.toLowerCase();
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const frame = this.callStack[i];
      if (frame.variableTypes && frame.variableTypes.has(lower)) {
        return frame.variableTypes.get(lower)?.toLowerCase();
      }
      if (frame.thisInstance) {
        const cls = this.classes.get(frame.thisInstance.className.toLowerCase());
        if (cls) {
          const field = cls.fields.find(f => f.variableName.toLowerCase() === lower);
          if (field) return field.dataType.toLowerCase();
        }
      }
    }
    return undefined;
  }

  private findClassForReceiver(expr: ExpressionNode): string | undefined {
    if (expr.type === 'Variable') {
      const t = this.resolveVariableType(expr.name);
      if (t && this.classes.has(t)) return t;
    }
    if (expr.type === 'This') {
      return this.currentFrame()?.thisInstance?.className;
    }
    if (expr.type === 'New') {
      return expr.className;
    }
    if (expr.type === 'ArrayAccess') {
      const t = this.resolveVariableType(expr.name);
      if (t && this.classes.has(t)) return t;
    }
    return undefined;
  }
}
