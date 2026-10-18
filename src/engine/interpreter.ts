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

export class Interpreter {
  private program: ProgramNode;
  private classes: Map<string, ClassNode> = new Map();
  private subprograms: Map<string, SubprogramNode> = new Map();

  // Call stack / environment
  private callStack: Array<{
    name: string;
    variables: Map<string, any>;
    references?: Map<string, { scope: Map<string, any>; key: string }>;
    thisInstance?: ObjectInstance;
  }> = [];

  public static readonly MAX_STEPS = 50_000;
  public static readonly MAX_CALL_STACK_DEPTH = 100;
  public static readonly MAX_ARRAY_TOTAL_ELEMENTS = 100_000;

  private maxSteps: number = Interpreter.MAX_STEPS;
  private maxCallStackDepth: number = Interpreter.MAX_CALL_STACK_DEPTH;
  private maxArrayElements: number = Interpreter.MAX_ARRAY_TOTAL_ELEMENTS;

  private objectCounter: number = 0;
  private inputs: string[] = [];
  private outputs: string[] = [];
  private steps: TraceStep[] = [];
  private stepNumber: number = 0;

  public isWaitingForInput: boolean = false;
  public inputTarget?: string;
  public isFinished: boolean = false;
  public error?: string;

  constructor(program: ProgramNode, options?: { maxSteps?: number; maxCallStackDepth?: number; maxArrayElements?: number }) {
    this.program = program;
    if (options?.maxSteps) this.maxSteps = options.maxSteps;
    if (options?.maxCallStackDepth) this.maxCallStackDepth = options.maxCallStackDepth;
    if (options?.maxArrayElements) this.maxArrayElements = options.maxArrayElements;

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
      variables: new Map()
    });
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

  public runAll(inputs: string[] = [], throwOnError: boolean = false): { outputs: string[]; steps: TraceStep[]; error?: string } {
    this.setInputs(inputs);
    const gen = this.generateSteps();
    while (!this.isFinished) {
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


  private *executeBlock(statements: ASTNode[]): Generator<TraceStep, boolean | void, unknown> {
    for (const stmt of statements) {
      const returned = yield* this.executeStatement(stmt);
      if (returned) return true; // Signal return from subprogram/method
    }
    return false;
  }

  private *executeStatement(stmt: ASTNode): Generator<TraceStep, boolean | void, unknown> {
    this.stepNumber++;
    if (this.stepNumber > this.maxSteps) {
      throw new Error(`Límite de ejecución alcanzado (${this.maxSteps} pasos). Posible bucle infinito o recursión excesiva.`);
    }

    switch (stmt.type) {
      case 'Declaration': {
        const decl = stmt as DeclarationNode;
        const initialVal = this.defaultValueFor(decl.dataType);
        this.assignValue(decl.variableName, initialVal);
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: decl.line,
          action: `Definir ${decl.variableName} Como ${decl.dataType}`,
          variables: this.getVariablesSnapshot(),
          changedVar: decl.variableName
        };
        this.steps.push(step);
        yield step;
        break;
      }

      case 'Dimension': {
        const dim = stmt as DimensionNode;
        const sizes: number[] = [];
        for (const sExpr of dim.sizes) {
          const val = this.evalExpression(sExpr);
          if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val)) {
            throw new Error(`La dimensión para "${dim.name}" debe ser un número entero válido (línea ${dim.line})`);
          }
          const s = Math.floor(val);
          if (s <= 0) {
            throw new Error(`El tamaño de la dimensión para "${dim.name}" debe ser mayor a 0 (recibido ${s} en línea ${dim.line})`);
          }
          sizes.push(s);
        }
        const totalElements = sizes.reduce((acc, sz) => acc * sz, 1);
        if (totalElements > this.maxArrayElements) {
          throw new Error(`El arreglo "${dim.name}" solicita ${totalElements} elementos, superando el límite de ${this.maxArrayElements} elementos permitidos.`);
        }
        const arr = this.createArray(sizes, this.defaultValueFor(dim.dataType));
        this.assignValue(dim.name, arr);
        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: dim.line,
          action: `Dimension ${dim.name}[${sizes.join(', ')}]`,
          variables: this.getVariablesSnapshot(),
          changedVar: dim.name
        };
        this.steps.push(step);
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
            inst.fields[assign.target.member] = value;
            varName = `Este.${assign.target.member}`;
          }
        } else if (assign.target.member) {
          const obj = this.resolveVariable(assign.target.name);
          if (obj && typeof obj === 'object' && obj.fields) {
            obj.fields[assign.target.member] = value;
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
        this.steps.push(step);
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
            val = 0; // fallback until input provided
          }
          this.assignValue(target.name, val);

          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: read.line,
            action: `Leer ${target.name} (= ${this.formatValue(val)})`,
            variables: this.getVariablesSnapshot(),
            changedVar: target.name
          };
          this.steps.push(step);
          yield step;
        }
        break;
      }

      case 'Write': {
        const write = stmt as WriteNode;
        const lineParts = write.expressions.map(e => this.formatValueForPrint(this.evalExpression(e)));
        const fullOutput = lineParts.join('');
        this.outputs.push(fullOutput);

        const step: TraceStep = {
          stepNumber: this.stepNumber,
          lineNumber: write.line,
          action: `Escribir ${fullOutput}`,
          variables: this.getVariablesSnapshot(),
          outputLog: fullOutput
        };
        this.steps.push(step);
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
        this.steps.push(step);
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
        this.steps.push(step);
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
        let loopCount = 0;
        while (true) {
          loopCount++;
          if (loopCount > this.maxSteps || this.stepNumber > this.maxSteps) {
            throw new Error(`Límite de iteraciones alcanzado en bucle Mientras (posible bucle infinito en línea ${wh.line})`);
          }
          const cond = Boolean(this.evalExpression(wh.condition));
          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: wh.line,
            action: `Mientras (${cond ? 'Verdadero' : 'Falso'})`,
            variables: this.getVariablesSnapshot()
          };
          this.steps.push(step);
          yield step;

          if (!cond) break;

          const ret = yield* this.executeBlock(wh.body);
          if (ret) return true;
          this.stepNumber++;
        }
        break;
      }

      case 'Repeat': {
        const rep = stmt as RepeatNode;
        let loopCount = 0;
        while (true) {
          loopCount++;
          if (loopCount > this.maxSteps || this.stepNumber > this.maxSteps) {
            throw new Error(`Límite de iteraciones alcanzado en bucle Repetir-Hasta (posible bucle infinito en línea ${rep.line})`);
          }
          const ret = yield* this.executeBlock(rep.body);
          if (ret) return true;

          this.stepNumber++;
          const cond = Boolean(this.evalExpression(rep.condition));
          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: rep.line,
            action: `Hasta Que (${cond ? 'Verdadero' : 'Falso'})`,
            variables: this.getVariablesSnapshot()
          };
          this.steps.push(step);
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
        let loopCount = 0;

        while ((stepVal > 0 && current <= end) || (stepVal < 0 && current >= end)) {
          loopCount++;
          if (loopCount > this.maxSteps || this.stepNumber > this.maxSteps) {
            throw new Error(`Límite de iteraciones alcanzado en bucle Para (línea ${f.line})`);
          }
          const step: TraceStep = {
            stepNumber: this.stepNumber,
            lineNumber: f.line,
            action: `Para ${f.variableName} = ${current} (hasta ${end})`,
            variables: this.getVariablesSnapshot(),
            changedVar: f.variableName
          };
          this.steps.push(step);
          yield step;

          const ret = yield* this.executeBlock(f.body);
          if (ret) return true;

          current += stepVal;
          this.assignValue(f.variableName, current);
          this.stepNumber++;
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
        this.steps.push(step);
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
        this.steps.push(step);
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
          case '%':
          case 'MOD':
            if (right === 0) throw new Error('Error en tiempo de ejecución: Operación módulo con divisor cero no permitida');
            return left % right;
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
        const arr = this.resolveVariable(expr.name);
        const indices = expr.indices.map(i => Math.floor(this.evalExpression(i)));
        return this.getArrayElement(arr, indices);
      }

      case 'MemberAccess': {
        const obj = this.evalExpression(expr.object);
        if (!obj || typeof obj !== 'object') {
          throw new Error(`No se puede acceder al miembro "${expr.member}" de un valor no objeto`);
        }
        // Could be a field
        if (obj.fields && expr.member in obj.fields) {
          return obj.fields[expr.member];
        }
        // Or method call
        return this.invokeMethod(obj, expr.member, []);
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
        const inst = this.currentFrame()?.thisInstance;
        if (!inst) throw new Error('Llamada a Super fuera de una instancia');
        const currentClass = this.classes.get(inst.className.toLowerCase());
        if (!currentClass?.superClass) throw new Error(`La clase ${inst.className} no tiene superclase`);
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
    if (this.callStack.length >= this.maxCallStackDepth) {
      throw new Error(`Profundidad máxima de pila de llamadas superada (${this.maxCallStackDepth} niveles). Posible recursión infinita.`);
    }

    const frameVars = new Map<string, any>();
    for (let i = 0; i < method.parameters.length; i++) {
      const param = method.parameters[i];
      frameVars.set(param.name, args[i] !== undefined ? args[i] : this.defaultValueFor(param.dataType));
    }

    this.callStack.push({
      name: `${instance.className}.${method.name}`,
      variables: frameVars,
      thisInstance: instance
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
    if (this.callStack.length >= this.maxCallStackDepth) {
      throw new Error(`Profundidad máxima de pila de llamadas superada (${this.maxCallStackDepth} niveles). Posible recursión infinita en ${sub.name}.`);
    }

    const frameVars = new Map<string, any>();
    const references = new Map<string, { scope: Map<string, any>; key: string }>();

    for (let i = 0; i < sub.parameters.length; i++) {
      const param = sub.parameters[i];
      const val = evalArgs[i] !== undefined ? evalArgs[i] : this.defaultValueFor(param.dataType);

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
    const trimmed = val.trim();
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
    if (trimmed.toLowerCase() === 'verdadero' || trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'falso' || trimmed.toLowerCase() === 'false') return false;
    return trimmed;
  }

  private formatValue(val: any): string {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Verdadero' : 'Falso';
    if (typeof val === 'object' && val.id) return val.id; // e.g. "Persona#1"
    if (Array.isArray(val)) return `[${val.map(x => this.formatValue(x)).join(', ')}]`;
    return String(val);
  }

  private formatValueForPrint(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? 'Verdadero' : 'Falso';
    if (typeof val === 'object' && val.id) return val.id;
    return String(val);
  }
}
