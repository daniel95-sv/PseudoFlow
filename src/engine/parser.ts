import {
  ASTNode,
  ProgramNode,
  DeclarationNode,
  DimensionNode,
  ReadNode,
  WriteNode,
  IfNode,
  SwitchNode,
  SwitchCase,
  WhileNode,
  RepeatNode,
  ForNode,
  SubprogramNode,
  ReturnNode,
  ClassNode,
  MethodNode,
  TargetNode,
  ExpressionNode,
  Parameter,
  Token
} from './types';

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  public static readonly MAX_EXPR_DEPTH = 100;
  public static readonly MAX_BLOCK_DEPTH = 50;
  public static readonly MAX_AST_NODES = 10_000;
  private exprDepth: number = 0;
  private blockDepth: number = 0;
  private astNodeCount: number = 0;

  private enterBlock(blockName: string, line: number): void {
    this.blockDepth++;
    if (this.blockDepth > Parser.MAX_BLOCK_DEPTH) {
      throw new Error(`Límite de anidamiento de bloques superado (máximo ${Parser.MAX_BLOCK_DEPTH} niveles) en línea ${line} (${blockName}). Simplifique la estructura del algoritmo.`);
    }
  }

  private exitBlock(): void {
    this.blockDepth--;
  }

  private registerNode(): void {
    this.astNodeCount++;
    if (this.astNodeCount > Parser.MAX_AST_NODES) {
      throw new Error(`Límite de nodos de sintaxis superado (máximo ${Parser.MAX_AST_NODES} nodos). El programa es demasiado extenso o complejo.`);
    }
  }

  constructor(tokens: Token[]) {
    // Filter out comments
    this.tokens = tokens.filter(t => t.type !== 'COMMENT');
  }

  public parse(): ProgramNode {
    const subprograms: SubprogramNode[] = [];
    const classes: ClassNode[] = [];
    const mainBody: ASTNode[] = [];
    let programName = 'Principal';
    let programLine = 1;

    while (!this.isAtEnd()) {
      // Class declaration
      if (this.check('CLASE')) {
        classes.push(this.parseClass());
        continue;
      }

      // Subprogram / function declaration
      if (this.check('SUBPROCESO')) {
        subprograms.push(this.parseSubprogram());
        continue;
      }

      // Main Proceso / Algoritmo
      if (this.match('PROCESO')) {
        programLine = this.previous().line;
        if (this.check('IDENTIFIER')) {
          programName = this.advance().value;
        }
        while (!this.isAtEnd() && !this.check('FINPROCESO')) {
          const stmt = this.parseStatement();
          if (stmt) mainBody.push(stmt);
        }
        if (this.match('FINPROCESO')) {
          // Optional trailing name
          if (this.check('IDENTIFIER')) this.advance();
        }
        continue;
      }

      // Top-level statements if not wrapped in Proceso
      const stmt = this.parseStatement();
      if (stmt) mainBody.push(stmt);
    }

    return {
      type: 'Program',
      name: programName,
      line: programLine,
      body: mainBody,
      subprograms,
      classes
    };
  }

  // Statements
  private parseStatement(): ASTNode | null {
    if (this.match('SEMICOLON')) return null;
    this.registerNode();

    if (this.check('DEFINIR') || this.check('PRIVADO') || this.check('PUBLICO')) {
      return this.parseDeclaration();
    }

    if (this.check('DIMENSION')) {
      return this.parseDimension();
    }

    if (this.match('LEER')) {
      return this.parseRead();
    }

    if (this.match('ESCRIBIR')) {
      return this.parseWrite();
    }

    if (this.match('SI')) {
      return this.parseIf();
    }

    if (this.match('SEGUN')) {
      return this.parseSwitch();
    }

    if (this.match('MIENTRAS')) {
      return this.parseWhile();
    }

    if (this.match('REPETIR')) {
      return this.parseRepeat();
    }

    if (this.match('PARA')) {
      return this.parseFor();
    }

    if (this.match('RETORNAR')) {
      return this.parseReturn();
    }

    // Assignment or call statement: e.g. x <- 10 or obj.Method() or Super.Constructor()
    return this.parseAssignmentOrCall();
  }

  private parseDeclaration(): DeclarationNode {
    const line = this.peek().line;
    let isPrivate = false;
    if (this.match('PRIVADO')) {
      isPrivate = true;
    } else if (this.match('PUBLICO')) {
      isPrivate = false;
    }

    this.match('DEFINIR');
    const varName = this.consume('IDENTIFIER', 'Se esperaba el nombre de la variable').value;
    this.consume('COMO', 'Se esperaba "Como" tras el nombre de la variable');

    let dataType = 'Entero';
    if (this.match('TIPO_ENTERO')) dataType = 'Entero';
    else if (this.match('TIPO_REAL')) dataType = 'Real';
    else if (this.match('TIPO_CADENA')) dataType = 'Cadena';
    else if (this.match('TIPO_CARACTER')) dataType = 'Caracter';
    else if (this.match('TIPO_LOGICO')) dataType = 'Logico';
    else if (this.check('IDENTIFIER')) dataType = this.advance().value;

    this.match('SEMICOLON');
    return {
      type: 'Declaration',
      line,
      variableName: varName,
      dataType,
      isPrivate
    };
  }

  private parseDimension(): DimensionNode {
    const line = this.peek().line;
    this.advance(); // consume DIMENSION
    const name = this.consume('IDENTIFIER', 'Se esperaba el nombre del arreglo').value;
    this.consume('LBRACKET', 'Se esperaba "[" tras el nombre del arreglo');

    const sizes: ExpressionNode[] = [];
    sizes.push(this.parseExpression());
    while (this.match('COMMA')) {
      sizes.push(this.parseExpression());
    }
    this.consume('RBRACKET', 'Se esperaba "]" al cerrar la dimensión');

    let dataType = 'Entero';
    if (this.match('COMO')) {
      if (this.match('TIPO_ENTERO')) dataType = 'Entero';
      else if (this.match('TIPO_REAL')) dataType = 'Real';
      else if (this.match('TIPO_CADENA')) dataType = 'Cadena';
      else if (this.match('TIPO_CARACTER')) dataType = 'Caracter';
      else if (this.match('TIPO_LOGICO')) dataType = 'Logico';
      else if (this.check('IDENTIFIER')) dataType = this.advance().value;
    }

    this.match('SEMICOLON');
    return {
      type: 'Dimension',
      line,
      name,
      sizes,
      dataType
    };
  }

  private parseRead(): ReadNode {
    const line = this.previous().line;
    const targets: TargetNode[] = [];
    do {
      targets.push(this.parseTarget());
    } while (this.match('COMMA'));

    this.match('SEMICOLON');
    return { type: 'Read', line, targets };
  }

  private parseWrite(): WriteNode {
    const line = this.previous().line;
    let noNewline = false;
    if (this.match('SIN')) {
      this.match('SALTAR');
      noNewline = true;
    }

    const expressions: ExpressionNode[] = [];
    if (!this.check('SEMICOLON') && !this.check('SIN') && !this.isAtEnd()) {
      do {
        expressions.push(this.parseExpression());
      } while (this.match('COMMA'));
    }

    if (this.match('SIN')) {
      this.match('SALTAR');
      noNewline = true;
    }

    this.match('SEMICOLON');
    return { type: 'Write', line, expressions, noNewline };
  }

  private isCaseLabelStart(): boolean {
    if (this.check('CASO') || this.check('DE_OTRO_MODO')) return true;
    if (this.check('DE') && this.tokens[this.current + 1]?.type === 'OTRO') return true;
    let i = this.current;
    let depth = 0;
    while (i < this.tokens.length && this.tokens[i].type !== 'EOF' && this.tokens[i].type !== 'SEMICOLON') {
      const t = this.tokens[i].type;
      if (t === 'ASSIGN' || t === 'ESCRIBIR' || t === 'LEER' || t === 'SI' || t === 'MIENTRAS' || t === 'PARA' || t === 'FINSEGUN') return false;
      if (t === 'LPAREN' || t === 'LBRACKET') depth++;
      else if (t === 'RPAREN' || t === 'RBRACKET') depth--;
      else if (t === 'COLON' && depth === 0) return true;
      i++;
    }
    return false;
  }

  private parseIf(): IfNode {
    const line = this.previous().line;
    this.enterBlock('Si', line);
    try {
      const condition = this.parseExpression();
      this.consume('ENTONCES', 'Se esperaba "Entonces" tras la condición');

      const thenBranch: ASTNode[] = [];
      while (!this.isAtEnd() && !this.check('SINO') && !this.check('FINSI')) {
        const stmt = this.parseStatement();
        if (stmt) thenBranch.push(stmt);
      }

      let elseBranch: ASTNode[] | undefined;
      if (this.match('SINO')) {
        elseBranch = [];
        while (!this.isAtEnd() && !this.check('FINSI')) {
          const stmt = this.parseStatement();
          if (stmt) elseBranch.push(stmt);
        }
      }

      this.consume('FINSI', 'Se esperaba "FinSi" para cerrar el condicional');
      this.match('SEMICOLON');
      return { type: 'If', line, condition, thenBranch, elseBranch };
    } finally {
      this.exitBlock();
    }
  }

  private parseSwitch(): SwitchNode {
    const line = this.previous().line;
    this.enterBlock('Segun', line);
    try {
      const expression = this.parseExpression();
      this.consume('HACER', 'Se esperaba "Hacer" tras la expresión del Segun');

      const cases: SwitchCase[] = [];
      let defaultCase: ASTNode[] | undefined;

      while (!this.isAtEnd() && !this.check('FINSEGUN')) {
        if (this.match('DE_OTRO_MODO') || (this.match('DE') && this.match('OTRO') && this.match('MODO'))) {
          this.match('COLON');
          defaultCase = [];
          while (!this.isAtEnd() && !this.check('FINSEGUN')) {
            const stmt = this.parseStatement();
            if (stmt) defaultCase.push(stmt);
          }
        } else if (this.check('CASO') || this.isCaseLabelStart()) {
          this.match('CASO');
          const values: ExpressionNode[] = [];
          do {
            values.push(this.parseExpression());
          } while (this.match('COMMA'));
          this.consume('COLON', 'Se esperaba ":" tras los valores del Caso');

          const body: ASTNode[] = [];
          while (
            !this.isAtEnd() &&
            !this.check('FINSEGUN') &&
            !this.check('DE_OTRO_MODO') &&
            !(this.check('DE') && this.tokens[this.current + 1]?.type === 'OTRO') &&
            !this.isCaseLabelStart()
          ) {
            const stmt = this.parseStatement();
            if (stmt) body.push(stmt);
          }
          cases.push({ values, body });
        } else {
          this.advance();
        }
      }

      this.consume('FINSEGUN', 'Se esperaba "FinSegun" al final de la selección múltiple');
      this.match('SEMICOLON');
      return { type: 'Switch', line, expression, cases, defaultCase };
    } finally {
      this.exitBlock();
    }
  }

  private parseWhile(): WhileNode {
    const line = this.previous().line;
    this.enterBlock('Mientras', line);
    try {
      const condition = this.parseExpression();
      this.consume('HACER', 'Se esperaba "Hacer" tras la condición del Mientras');

      const body: ASTNode[] = [];
      while (!this.isAtEnd() && !this.check('FINMIENTRAS')) {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }

      this.consume('FINMIENTRAS', 'Se esperaba "FinMientras" para cerrar el bucle');
      this.match('SEMICOLON');
      return { type: 'While', line, condition, body };
    } finally {
      this.exitBlock();
    }
  }

  private parseRepeat(): RepeatNode {
    const line = this.previous().line;
    this.enterBlock('Repetir', line);
    try {
      const body: ASTNode[] = [];
      while (!this.isAtEnd() && !this.check('HASTA') && !this.check('UNTIL')) {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }

      if (this.match('HASTA')) {
        this.match('QUE');
      } else {
        this.consume('UNTIL', 'Se esperaba "Hasta Que" para cerrar el Repetir');
      }

      const condition = this.parseExpression();
      this.match('SEMICOLON');
      return { type: 'Repeat', line, condition, body };
    } finally {
      this.exitBlock();
    }
  }

  private parseFor(): ForNode {
    const line = this.previous().line;
    this.enterBlock('Para', line);
    try {
      const varName = this.consume('IDENTIFIER', 'Se esperaba la variable de control').value;
      this.consume('ASSIGN', 'Se esperaba "<-" tras la variable de control');
      const startValue = this.parseExpression();

      this.consume('HASTA', 'Se esperaba "Hasta"');
      const endValue = this.parseExpression();

      let stepValue: ExpressionNode | undefined;
      if (this.match('CON')) {
        this.consume('PASO', 'Se esperaba "Paso"');
        stepValue = this.parseExpression();
      } else if (this.match('PASO')) {
        stepValue = this.parseExpression();
      }

      this.consume('HACER', 'Se esperaba "Hacer"');

      const body: ASTNode[] = [];
      while (!this.isAtEnd() && !this.check('FINPARA')) {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }

      this.consume('FINPARA', 'Se esperaba "FinPara" para cerrar el bucle');
      this.match('SEMICOLON');
      return { type: 'For', line, variableName: varName, startValue, endValue, stepValue, body };
    } finally {
      this.exitBlock();
    }
  }

  private parseReturn(): ReturnNode {
    const line = this.previous().line;
    let value: ExpressionNode | undefined;
    if (!this.check('SEMICOLON') && !this.isAtEnd()) {
      value = this.parseExpression();
    }
    this.match('SEMICOLON');
    return { type: 'Return', line, value };
  }

  private parseAssignmentOrCall(): ASTNode {
    const line = this.peek().line;

    // Check Super.Constructor(...) or Super.Method(...)
    if (this.match('SUPER')) {
      this.consume('DOT', 'Se esperaba "." tras Super');
      let methodName = 'Constructor';
      if (this.match('CONSTRUCTOR')) methodName = 'Constructor';
      else methodName = this.consume('IDENTIFIER', 'Se esperaba el nombre del método en Super').value;

      this.consume('LPAREN', 'Se esperaba "("');
      const args = this.parseArguments();
      this.consume('RPAREN', 'Se esperaba ")"');
      this.match('SEMICOLON');
      return {
        type: 'CallStatement',
        line,
        call: { type: 'SuperCall', methodName, args }
      };
    }

    const target = this.parseTarget();

    // If followed by assignment operator
    if (this.match('ASSIGN')) {
      const value = this.parseExpression();
      this.match('SEMICOLON');
      return { type: 'Assignment', line, target, value };
    }

    // If followed by call: target was parsed, could be a method call like persona.Cumplir();
    if (this.match('LPAREN')) {
      const args = this.parseArguments();
      this.consume('RPAREN', 'Se esperaba ")"');
      this.match('SEMICOLON');

      if (target.member) {
        const parts = target.member.split('.');
        const methodName = parts.pop()!;
        let receiverObj: ExpressionNode = target.isThis ? { type: 'This' } : { type: 'Variable', name: target.name };
        for (const p of parts) {
          receiverObj = {
            type: 'MemberAccess',
            object: receiverObj,
            member: p
          };
        }
        return {
          type: 'CallStatement',
          line,
          call: {
            type: 'MemberAccess',
            object: receiverObj,
            member: methodName,
            args
          }
        };
      }

      return {
        type: 'CallStatement',
        line,
        call: { type: 'Call', callee: target.name, args }
      };
    }

    this.match('SEMICOLON');
    return {
      type: 'CallStatement',
      line,
      call: { type: 'Variable', name: target.name }
    };
  }

  private parseTarget(): TargetNode {
    let isThis = false;
    let name = '';
    const memberParts: string[] = [];

    if (this.match('ESTE')) {
      isThis = true;
      name = 'Este';
    } else {
      name = this.consume('IDENTIFIER', 'Se esperaba un identificador').value;
    }

    // Array index? e.g. datos[fila, columna]
    if (this.match('LBRACKET')) {
      const indices: ExpressionNode[] = [];
      indices.push(this.parseExpression());
      while (this.match('COMMA')) {
        indices.push(this.parseExpression());
      }
      this.consume('RBRACKET', 'Se esperaba "]"');
      return { name, indices };
    }

    // Member access? e.g. persona.edad or primero.siguiente.valor
    while (this.match('DOT')) {
      let member = '';
      if (this.match('CONSTRUCTOR')) {
        member = 'Constructor';
      } else {
        member = this.consume('IDENTIFIER', 'Se esperaba el nombre del miembro').value;
      }
      memberParts.push(member);
    }

    if (memberParts.length > 0) {
      return { name, isThis, member: memberParts.join('.') };
    }

    return { name, isThis };
  }

  private parseSubprogram(): SubprogramNode {
    const line = this.peek().line;
    this.enterBlock('SubProceso', line);
    try {
      this.advance(); // consume SUBPROCESO
      const name = this.consume('IDENTIFIER', 'Se esperaba el nombre del subprograma').value;

      const parameters: Parameter[] = [];
      if (this.match('LPAREN')) {
        if (!this.check('RPAREN')) {
          do {
            const pName = this.consume('IDENTIFIER', 'Se esperaba el nombre del parámetro').value;
            let isArrayParam = false;
            if (this.match('LBRACKET')) {
              isArrayParam = true;
              while (this.match('COMMA')) { /* consume dimension commas */ }
              this.consume('RBRACKET', 'Se esperaba "]" tras el nombre del arreglo en parámetros');
            }

            this.consume('COMO', 'Se esperaba "Como"');
            let pType = 'Entero';
            if (this.match('TIPO_ENTERO')) pType = 'Entero';
            else if (this.match('TIPO_REAL')) pType = 'Real';
            else if (this.match('TIPO_CADENA')) pType = 'Cadena';
            else if (this.match('TIPO_CARACTER')) pType = 'Caracter';
            else if (this.match('TIPO_LOGICO')) pType = 'Logico';
            else if (this.check('IDENTIFIER')) pType = this.advance().value;

            let isRef = isArrayParam;
            if (this.match('POR') || this.match('BY')) {
              if (this.check('REFERENCIA') || (this.check('IDENTIFIER') && /^(referencia|reference)$/i.test(this.peek().value))) {
                this.advance();
                isRef = true;
              } else if (this.check('VALOR') || (this.check('IDENTIFIER') && /^(valor|value)$/i.test(this.peek().value))) {
                this.advance();
              }
            }

            parameters.push({ name: pName, dataType: pType, isReference: isRef });
          } while (this.match('COMMA'));
        }
        this.consume('RPAREN', 'Se esperaba ")"');
      }

      let returnType: string | undefined;
      if (this.match('COMO')) {
        if (this.match('TIPO_ENTERO')) returnType = 'Entero';
        else if (this.match('TIPO_REAL')) returnType = 'Real';
        else if (this.match('TIPO_CADENA')) returnType = 'Cadena';
        else if (this.match('TIPO_CARACTER')) returnType = 'Caracter';
        else if (this.match('TIPO_LOGICO')) returnType = 'Logico';
        else if (this.check('IDENTIFIER')) returnType = this.advance().value;
      }

      const body: ASTNode[] = [];
      while (!this.isAtEnd() && !this.check('FINSUBPROCESO')) {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }
      this.consume('FINSUBPROCESO', 'Se esperaba "FinSubProceso"');
      this.match('SEMICOLON');

      return { type: 'Subprogram', line, name, parameters, returnType, body };
    } finally {
      this.exitBlock();
    }
  }

  private parseClass(): ClassNode {
    const line = this.peek().line;
    this.enterBlock('Clase', line);
    try {
      this.advance(); // consume CLASE
      const name = this.consume('IDENTIFIER', 'Se esperaba el nombre de la clase').value;

      let superClass: string | undefined;
      if (this.match('HEREDA')) {
        this.match('DE');
        superClass = this.consume('IDENTIFIER', 'Se esperaba el nombre de la superclase').value;
      }

      const fields: DeclarationNode[] = [];
      const methods: MethodNode[] = [];

      while (!this.isAtEnd() && !this.check('FINCLASE')) {
        if (this.check('METODO') || (this.peek().type === 'PUBLICO' || this.peek().type === 'PRIVADO')) {
          let isPublic = true;
          if (this.match('PRIVADO')) isPublic = false;
          else if (this.match('PUBLICO')) isPublic = true;

          if (this.check('DEFINIR')) {
            fields.push(this.parseDeclaration());
            continue;
          }

          if (this.match('METODO')) {
            methods.push(this.parseMethod(isPublic));
            continue;
          }
        }

        if (this.check('DEFINIR')) {
          fields.push(this.parseDeclaration());
          continue;
        }

        this.advance();
      }

      this.consume('FINCLASE', 'Se esperaba "FinClase" para cerrar la clase');
      this.match('SEMICOLON');
      return { type: 'Class', line, name, superClass, fields, methods };
    } finally {
      this.exitBlock();
    }
  }

  private parseMethod(isPublic: boolean): MethodNode {
    const line = this.peek().line;
    this.enterBlock('Metodo', line);
    try {
      let isConstructor = false;
      let methodName = '';

      if (this.match('CONSTRUCTOR')) {
        isConstructor = true;
        methodName = 'Constructor';
      } else {
        methodName = this.consume('IDENTIFIER', 'Se esperaba el nombre del método').value;
      }

      const parameters: Parameter[] = [];
      if (this.match('LPAREN')) {
        if (!this.check('RPAREN')) {
          do {
            const pName = this.consume('IDENTIFIER', 'Se esperaba el nombre del parámetro').value;
            let isArrayParam = false;
            if (this.match('LBRACKET')) {
              isArrayParam = true;
              while (this.match('COMMA')) { /* consume dimension commas */ }
              this.consume('RBRACKET', 'Se esperaba "]" tras el nombre del arreglo en parámetros');
            }

            this.consume('COMO', 'Se esperaba "Como"');
            let pType = 'Entero';
            if (this.match('TIPO_ENTERO')) pType = 'Entero';
            else if (this.match('TIPO_REAL')) pType = 'Real';
            else if (this.match('TIPO_CADENA')) pType = 'Cadena';
            else if (this.match('TIPO_CARACTER')) pType = 'Caracter';
            else if (this.match('TIPO_LOGICO')) pType = 'Logico';
            else if (this.check('IDENTIFIER')) pType = this.advance().value;

            let isRef = isArrayParam;
            if (this.match('POR') || this.match('BY')) {
              if (this.check('REFERENCIA') || (this.check('IDENTIFIER') && /^(referencia|reference)$/i.test(this.peek().value))) {
                this.advance();
                isRef = true;
              } else if (this.check('VALOR') || (this.check('IDENTIFIER') && /^(valor|value)$/i.test(this.peek().value))) {
                this.advance();
              }
            }

            parameters.push({ name: pName, dataType: pType, isReference: isRef });
          } while (this.match('COMMA'));
        }
        this.consume('RPAREN', 'Se esperaba ")"');
      }

      let returnType: string | undefined;
      if (this.match('COMO')) {
        if (this.match('TIPO_ENTERO')) returnType = 'Entero';
        else if (this.match('TIPO_REAL')) returnType = 'Real';
        else if (this.match('TIPO_CADENA')) returnType = 'Cadena';
        else if (this.match('TIPO_CARACTER')) returnType = 'Caracter';
        else if (this.match('TIPO_LOGICO')) returnType = 'Logico';
        else if (this.check('IDENTIFIER')) returnType = this.advance().value;
      }

      const body: ASTNode[] = [];
      while (!this.isAtEnd() && !this.check('FINMETODO')) {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }
      this.consume('FINMETODO', 'Se esperaba "FinMetodo"');
      this.match('SEMICOLON');

      return { type: 'Method', line, name: methodName, isPublic, isConstructor, parameters, returnType, body };
    } finally {
      this.exitBlock();
    }
  }

  // Expressions (Precedence climbing)
  private parseExpression(): ExpressionNode {
    this.exprDepth++;
    if (this.exprDepth > Parser.MAX_EXPR_DEPTH) {
      throw new Error(`Profundidad máxima de expresión superada (${Parser.MAX_EXPR_DEPTH}). Expresión demasiado anidada.`);
    }
    try {
      return this.parseOr();
    } finally {
      this.exprDepth--;
    }
  }

  private parseOr(): ExpressionNode {
    let expr = this.parseAnd();
    while (this.match('OR')) {
      const right = this.parseAnd();
      expr = { type: 'BinaryOp', operator: 'O', left: expr, right };
    }
    return expr;
  }

  private parseAnd(): ExpressionNode {
    let expr = this.parseEquality();
    while (this.match('AND')) {
      const right = this.parseEquality();
      expr = { type: 'BinaryOp', operator: 'Y', left: expr, right };
    }
    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseComparison();
    while (this.check('EQ') || this.check('NEQ')) {
      const op = this.advance().value;
      const right = this.parseComparison();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr = this.parseAddition();
    while (this.check('LT') || this.check('LEQ') || this.check('GT') || this.check('GEQ')) {
      const op = this.advance().value;
      const right = this.parseAddition();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseAddition(): ExpressionNode {
    let expr = this.parseMultiplication();
    while (this.check('PLUS') || this.check('MINUS')) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseMultiplication(): ExpressionNode {
    let expr = this.parseUnary();
    while (this.check('STAR') || this.check('SLASH') || this.check('MOD') || this.check('DIV')) {
      const op = this.advance().value;
      const right = this.parseUnary();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parseUnary(): ExpressionNode {
    this.exprDepth++;
    if (this.exprDepth > Parser.MAX_EXPR_DEPTH) {
      throw new Error(`Profundidad máxima de expresión superada (${Parser.MAX_EXPR_DEPTH}). Expresión demasiado anidada.`);
    }
    try {
      if (this.match('NOT')) {
        const arg = this.parseUnary();
        return { type: 'UnaryOp', operator: 'NO', argument: arg };
      }
      if (this.match('MINUS')) {
        const arg = this.parseUnary();
        return { type: 'UnaryOp', operator: '-', argument: arg };
      }
      return this.parsePower();
    } finally {
      this.exprDepth--;
    }
  }

  private parsePower(): ExpressionNode {
    const expr = this.parsePrimary();
    if (this.match('POW')) {
      const right = this.parseUnary();
      return { type: 'BinaryOp', operator: '^', left: expr, right };
    }
    return expr;
  }

  private parsePrimary(): ExpressionNode {
    let expr: ExpressionNode;

    if (this.match('NUMBER')) {
      const raw = this.previous().value;
      const val = raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10);
      expr = { type: 'Literal', value: val, raw, dataType: raw.includes('.') ? 'Real' : 'Entero' };
    } else if (this.match('STRING')) {
      const val = this.previous().value;
      expr = { type: 'Literal', value: val, raw: `"${val}"`, dataType: 'Cadena' };
    } else if (this.match('VERDADERO')) {
      expr = { type: 'Literal', value: true, raw: 'Verdadero', dataType: 'Logico' };
    } else if (this.match('FALSO')) {
      expr = { type: 'Literal', value: false, raw: 'Falso', dataType: 'Logico' };
    } else if (this.match('NUEVO')) {
      const className = this.consume('IDENTIFIER', 'Se esperaba el nombre de la clase').value;
      this.consume('LPAREN', 'Se esperaba "("');
      const args = this.parseArguments();
      this.consume('RPAREN', 'Se esperaba ")"');
      expr = { type: 'New', className, args };
    } else if (this.match('SUPER')) {
      this.consume('DOT', 'Se esperaba "." tras Super');
      let methodName = 'Constructor';
      if (this.match('CONSTRUCTOR')) methodName = 'Constructor';
      else methodName = this.consume('IDENTIFIER', 'Se esperaba el nombre del método en Super').value;
      this.consume('LPAREN', 'Se esperaba "("');
      const args = this.parseArguments();
      this.consume('RPAREN', 'Se esperaba ")"');
      expr = { type: 'SuperCall', methodName, args };
    } else if (this.match('ESTE')) {
      expr = { type: 'This' };
    } else if (this.match('LPAREN')) {
      expr = this.parseExpression();
      this.consume('RPAREN', 'Se esperaba ")"');
    } else if (this.check('IDENTIFIER')) {
      const name = this.advance().value;
      if (this.match('LPAREN')) {
        const args = this.parseArguments();
        this.consume('RPAREN', 'Se esperaba ")"');
        expr = { type: 'Call', callee: name, args };
      } else {
        expr = { type: 'Variable', name };
      }
    } else {
      throw new Error(`Token inesperado en línea ${this.peek().line}: ${this.peek().value || this.peek().type}`);
    }

    // Postfix chaining: .member, .method(args), [indices]
    while (this.check('DOT') || this.check('LBRACKET')) {
      if (this.match('DOT')) {
        let member = '';
        if (this.match('CONSTRUCTOR')) {
          member = 'Constructor';
        } else {
          member = this.consume('IDENTIFIER', 'Se esperaba el nombre del miembro tras "."').value;
        }

        if (this.match('LPAREN')) {
          const args = this.parseArguments();
          this.consume('RPAREN', 'Se esperaba ")"');
          expr = { type: 'MemberAccess', object: expr, member, args };
        } else {
          expr = { type: 'MemberAccess', object: expr, member };
        }
      } else if (this.match('LBRACKET')) {
        const indices: ExpressionNode[] = [];
        indices.push(this.parseExpression());
        while (this.match('COMMA')) {
          indices.push(this.parseExpression());
        }
        this.consume('RBRACKET', 'Se esperaba "]"');
        if (expr.type === 'Variable') {
          expr = { type: 'ArrayAccess', name: (expr as any).name, indices };
        } else {
          expr = { type: 'ArrayAccess', name: '', indices, object: expr };
        }
      }
    }

    return expr;
  }

  private parseArguments(): ExpressionNode[] {
    const args: ExpressionNode[] = [];
    if (!this.check('RPAREN') && !this.isAtEnd()) {
      do {
        args.push(this.parseExpression());
      } while (this.match('COMMA'));
    }
    return args;
  }

  // Helpers
  private match(...types: string[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private isIdentifierToken(token?: Token): boolean {
    if (!token) return false;
    return token.type === 'IDENTIFIER' || token.type === 'VALOR' || token.type === 'REFERENCIA' || token.type === 'PASO' || token.type === 'OTRO' || token.type === 'MODO' || token.type === 'CASO';
  }

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
    if (type === 'IDENTIFIER') return this.isIdentifierToken(this.peek());
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: string, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`Error de sintaxis (línea ${this.peek().line}): ${message}`);
  }
}
