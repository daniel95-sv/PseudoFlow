import {
  ASTNode,
  ProgramNode,
  DeclarationNode,
  DimensionNode,
  AssignmentNode,
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
  CallStatementNode,
  TargetNode,
  ExpressionNode,
  Parameter,
  Token
} from './types';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

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
    if (!this.check('SEMICOLON') && !this.isAtEnd()) {
      do {
        expressions.push(this.parseExpression());
      } while (this.match('COMMA'));
    }

    this.match('SEMICOLON');
    return { type: 'Write', line, expressions, noNewline };
  }

  private parseIf(): IfNode {
    const line = this.previous().line;
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
  }

  private parseSwitch(): SwitchNode {
    const line = this.previous().line;
    const expression = this.parseExpression();
    this.consume('HACER', 'Se esperaba "Hacer" tras la expresión del Segun');

    const cases: SwitchCase[] = [];
    let defaultCase: ASTNode[] | undefined;

    while (!this.isAtEnd() && !this.check('FINSEGUN')) {
      if (this.match('CASO')) {
        const values: ExpressionNode[] = [];
        do {
          values.push(this.parseExpression());
        } while (this.match('COMMA'));
        this.consume('COLON', 'Se esperaba ":" tras los valores del Caso');

        const body: ASTNode[] = [];
        while (!this.isAtEnd() && !this.check('CASO') && !this.check('DE_OTRO_MODO') && !this.check('DE') && !this.check('FINSEGUN')) {
          const stmt = this.parseStatement();
          if (stmt) body.push(stmt);
        }
        cases.push({ values, body });
      } else if (this.match('DE_OTRO_MODO') || (this.match('DE') && this.match('OTRO') && this.match('MODO'))) {
        this.match('COLON');
        defaultCase = [];
        while (!this.isAtEnd() && !this.check('FINSEGUN')) {
          const stmt = this.parseStatement();
          if (stmt) defaultCase.push(stmt);
        }
      } else {
        this.advance();
      }
    }

    this.consume('FINSEGUN', 'Se esperaba "FinSegun" al final de la selección múltiple');
    this.match('SEMICOLON');
    return { type: 'Switch', line, expression, cases, defaultCase };
  }

  private parseWhile(): WhileNode {
    const line = this.previous().line;
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
  }

  private parseRepeat(): RepeatNode {
    const line = this.previous().line;
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
  }

  private parseFor(): ForNode {
    const line = this.previous().line;
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
        return {
          type: 'CallStatement',
          line,
          call: {
            type: 'MemberAccess',
            object: { type: 'Variable', name: target.name },
            member: target.member
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

    if (this.match('ESTE')) {
      isThis = true;
      name = 'Este';
      this.consume('DOT', 'Se esperaba "." tras Este');
      const member = this.consume('IDENTIFIER', 'Se esperaba el nombre del atributo').value;
      return { name, isThis, member };
    }

    name = this.consume('IDENTIFIER', 'Se esperaba un identificador').value;

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

    // Member access? e.g. persona.edad
    if (this.match('DOT')) {
      let member = '';
      if (this.check('CONSTRUCTOR')) {
        this.advance();
        member = 'Constructor';
      } else {
        member = this.consume('IDENTIFIER', 'Se esperaba el nombre del miembro').value;
      }
      return { name, member };
    }

    return { name };
  }

  private parseSubprogram(): SubprogramNode {
    const line = this.peek().line;
    this.advance(); // consume SUBPROCESO
    const name = this.consume('IDENTIFIER', 'Se esperaba el nombre del subprograma').value;

    const parameters: Parameter[] = [];
    if (this.match('LPAREN')) {
      if (!this.check('RPAREN')) {
        do {
          const pName = this.consume('IDENTIFIER', 'Se esperaba el nombre del parámetro').value;
          this.consume('COMO', 'Se esperaba "Como"');
          let pType = 'Entero';
          if (this.match('TIPO_ENTERO')) pType = 'Entero';
          else if (this.match('TIPO_REAL')) pType = 'Real';
          else if (this.match('TIPO_CADENA')) pType = 'Cadena';
          else if (this.match('TIPO_CARACTER')) pType = 'Caracter';
          else if (this.match('TIPO_LOGICO')) pType = 'Logico';
          else if (this.check('IDENTIFIER')) pType = this.advance().value;

          let isRef = false;
          if (this.match('POR')) {
            if (this.match('REFERENCIA')) isRef = true;
            else this.match('VALOR');
          } else if (this.match('BY')) {
            if (this.match('REFERENCIA')) isRef = true;
            else this.match('VALOR');
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
  }

  private parseClass(): ClassNode {
    const line = this.peek().line;
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
  }

  private parseMethod(isPublic: boolean): MethodNode {
    const line = this.peek().line;
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
          this.consume('COMO', 'Se esperaba "Como"');
          let pType = 'Entero';
          if (this.match('TIPO_ENTERO')) pType = 'Entero';
          else if (this.match('TIPO_REAL')) pType = 'Real';
          else if (this.match('TIPO_CADENA')) pType = 'Cadena';
          else if (this.match('TIPO_CARACTER')) pType = 'Caracter';
          else if (this.match('TIPO_LOGICO')) pType = 'Logico';
          else if (this.check('IDENTIFIER')) pType = this.advance().value;

          parameters.push({ name: pName, dataType: pType, isReference: false });
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
  }

  // Expressions (Precedence climbing)
  private parseExpression(): ExpressionNode {
    return this.parseOr();
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
    let expr = this.parsePower();
    while (this.check('STAR') || this.check('SLASH') || this.check('MOD')) {
      const op = this.advance().value;
      const right = this.parsePower();
      expr = { type: 'BinaryOp', operator: op, left: expr, right };
    }
    return expr;
  }

  private parsePower(): ExpressionNode {
    let expr = this.parseUnary();
    while (this.match('POW')) {
      const right = this.parseUnary();
      expr = { type: 'BinaryOp', operator: '^', left: expr, right };
    }
    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.match('NOT')) {
      const arg = this.parseUnary();
      return { type: 'UnaryOp', operator: 'NO', argument: arg };
    }
    if (this.match('MINUS')) {
      const arg = this.parseUnary();
      return { type: 'UnaryOp', operator: '-', argument: arg };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    if (this.match('NUMBER')) {
      const raw = this.previous().value;
      const val = raw.includes('.') ? parseFloat(raw) : parseInt(raw, 10);
      return { type: 'Literal', value: val, raw, dataType: raw.includes('.') ? 'Real' : 'Entero' };
    }

    if (this.match('STRING')) {
      const val = this.previous().value;
      return { type: 'Literal', value: val, raw: `"${val}"`, dataType: 'Cadena' };
    }

    if (this.match('VERDADERO')) {
      return { type: 'Literal', value: true, raw: 'Verdadero', dataType: 'Logico' };
    }

    if (this.match('FALSO')) {
      return { type: 'Literal', value: false, raw: 'Falso', dataType: 'Logico' };
    }

    if (this.match('NUEVO')) {
      const className = this.consume('IDENTIFIER', 'Se esperaba el nombre de la clase').value;
      this.consume('LPAREN', 'Se esperaba "("');
      const args = this.parseArguments();
      this.consume('RPAREN', 'Se esperaba ")"');
      return { type: 'New', className, args };
    }

    if (this.match('ESTE')) {
      if (this.match('DOT')) {
        const member = this.consume('IDENTIFIER', 'Se esperaba atributo en Este').value;
        if (this.match('LPAREN')) {
          const args = this.parseArguments();
          this.consume('RPAREN', 'Se esperaba ")"');
          return { type: 'MemberAccess', object: { type: 'This', member }, member };
        }
        return { type: 'This', member };
      }
      return { type: 'This' };
    }

    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.consume('RPAREN', 'Se esperaba ")"');
      return expr;
    }

    if (this.check('IDENTIFIER')) {
      const name = this.advance().value;

      // Array access
      if (this.match('LBRACKET')) {
        const indices: ExpressionNode[] = [];
        indices.push(this.parseExpression());
        while (this.match('COMMA')) {
          indices.push(this.parseExpression());
        }
        this.consume('RBRACKET', 'Se esperaba "]"');
        return { type: 'ArrayAccess', name, indices };
      }

      // Member call or property
      if (this.match('DOT')) {
        const member = this.consume('IDENTIFIER', 'Se esperaba el nombre del miembro').value;
        if (this.match('LPAREN')) {
          const args = this.parseArguments();
          this.consume('RPAREN', 'Se esperaba ")"');
          return {
            type: 'MemberAccess',
            object: { type: 'Variable', name },
            member
          };
        }
        return {
          type: 'MemberAccess',
          object: { type: 'Variable', name },
          member
        };
      }

      // Function or subprogram call
      if (this.match('LPAREN')) {
        const args = this.parseArguments();
        this.consume('RPAREN', 'Se esperaba ")"');
        return { type: 'Call', callee: name, args };
      }

      return { type: 'Variable', name };
    }

    throw new Error(`Token inesperado en línea ${this.peek().line}: ${this.peek().value || this.peek().type}`);
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

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
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
