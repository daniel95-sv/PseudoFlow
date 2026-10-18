import { Token } from './types';

export class Lexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const char = this.input[this.pos];

      // Single line comment
      if (char === '/' && this.input[this.pos + 1] === '/') {
        let comment = '';
        const startLine = this.line;
        const startCol = this.col;
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
          comment += this.input[this.pos];
          this.advance();
        }
        tokens.push({ type: 'COMMENT', value: comment, line: startLine, col: startCol });
        continue;
      }

      // Multi-line comment
      if (char === '/' && this.input[this.pos + 1] === '*') {
        let comment = '';
        const startLine = this.line;
        const startCol = this.col;
        this.advance();
        this.advance();
        let closed = false;
        while (this.pos < this.input.length) {
          if (this.input[this.pos] === '*' && this.input[this.pos + 1] === '/') {
            this.advance();
            this.advance();
            closed = true;
            break;
          }
          comment += this.input[this.pos];
          this.advance();
        }
        if (!closed) {
          throw new Error(`Comentario de bloque "/*" sin cerrar iniciado en línea ${startLine}, columna ${startCol}`);
        }
        tokens.push({ type: 'COMMENT', value: comment, line: startLine, col: startCol });
        continue;
      }

      // Strings
      if (char === '"' || char === "'") {
        tokens.push(this.readString(char));
        continue;
      }

      // Numbers
      if (this.isDigit(char)) {
        tokens.push(this.readNumber());
        continue;
      }

      // Arrow assignment <-
      if (char === '<' && this.input[this.pos + 1] === '-') {
        const line = this.line;
        const col = this.col;
        this.advance();
        this.advance();
        tokens.push({ type: 'ASSIGN', value: '<-', line, col });
        continue;
      }

      // Pascal assignment :=
      if (char === ':' && this.input[this.pos + 1] === '=') {
        const line = this.line;
        const col = this.col;
        this.advance();
        this.advance();
        tokens.push({ type: 'ASSIGN', value: ':=', line, col });
        continue;
      }

      // Comparison operators
      if (char === '<' && this.input[this.pos + 1] === '>') {
        const line = this.line;
        const col = this.col;
        this.advance();
        this.advance();
        tokens.push({ type: 'NEQ', value: '<>', line, col });
        continue;
      }
      if (char === '!' && this.input[this.pos + 1] === '=') {
        const line = this.line;
        const col = this.col;
        this.advance();
        this.advance();
        tokens.push({ type: 'NEQ', value: '!=', line, col });
        continue;
      }
      if (char === '<' && this.input[this.pos + 1] === '=') {
        const line = this.line;
        const col = this.col;
        this.advance();
        this.advance();
        tokens.push({ type: 'LEQ', value: '<=', line, col });
        continue;
      }
      if (char === '>' && this.input[this.pos + 1] === '=') {
        const line = this.line;
        const col = this.col;
        this.advance();
        this.advance();
        tokens.push({ type: 'GEQ', value: '>=', line, col });
        continue;
      }

      // Single char symbols
      if (char === ';') {
        tokens.push({ type: 'SEMICOLON', value: ';', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === ',') {
        tokens.push({ type: 'COMMA', value: ',', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === ':') {
        tokens.push({ type: 'COLON', value: ':', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '.') {
        tokens.push({ type: 'DOT', value: '.', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '[') {
        tokens.push({ type: 'LBRACKET', value: '[', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === ']') {
        tokens.push({ type: 'RBRACKET', value: ']', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '+') {
        tokens.push({ type: 'PLUS', value: '+', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '-') {
        tokens.push({ type: 'MINUS', value: '-', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '*') {
        tokens.push({ type: 'STAR', value: '*', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '/') {
        tokens.push({ type: 'SLASH', value: '/', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '%') {
        tokens.push({ type: 'MOD', value: '%', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '^') {
        tokens.push({ type: 'POW', value: '^', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '=') {
        tokens.push({ type: 'EQ', value: '=', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '<') {
        tokens.push({ type: 'LT', value: '<', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '>') {
        tokens.push({ type: 'GT', value: '>', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '&') {
        tokens.push({ type: 'AND', value: '&', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '|') {
        tokens.push({ type: 'OR', value: '|', line: this.line, col: this.col });
        this.advance();
        continue;
      }
      if (char === '~') {
        tokens.push({ type: 'NOT', value: '~', line: this.line, col: this.col });
        this.advance();
        continue;
      }

      // Identifiers and keywords
      if (this.isAlpha(char) || char === '_') {
        tokens.push(this.readIdentifier());
        continue;
      }

      // Unknown character fallback: throw lexical error instead of silent advance
      throw new Error(`Carácter no reconocido: "${char}" en línea ${this.line}, columna ${this.col}`);
    }

    tokens.push({ type: 'EOF', value: '', line: this.line, col: this.col });
    return tokens;
  }

  private advance(): void {
    if (this.input[this.pos] === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.advance();
    }
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || 'áéíóúÁÉÍÓÚñÑ'.includes(char);
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // skip quote
    let str = '';
    let closed = false;
    while (this.pos < this.input.length) {
      if (this.input[this.pos] === quote) {
        this.advance(); // skip closing quote
        closed = true;
        break;
      }
      if (this.input[this.pos] === '\\') {
        this.advance();
        if (this.pos < this.input.length) {
          const esc = this.input[this.pos];
          if (esc === 'n') str += '\n';
          else if (esc === 't') str += '\t';
          else str += esc;
          this.advance();
          continue;
        }
      }
      str += this.input[this.pos];
      this.advance();
    }
    if (!closed) {
      throw new Error(`Cadena literal sin cerrar iniciada en línea ${startLine}, columna ${startCol}`);
    }
    return { type: 'STRING', value: str, line: startLine, col: startCol };
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let numStr = '';
    let dotCount = 0;
    while (this.pos < this.input.length && (this.isDigit(this.input[this.pos]) || this.input[this.pos] === '.')) {
      if (this.input[this.pos] === '.') {
        dotCount++;
        if (dotCount > 1) {
          throw new Error(`Número mal formado con múltiples puntos decimales en línea ${this.line}, columna ${this.col}`);
        }
      }
      numStr += this.input[this.pos];
      this.advance();
    }
    return { type: 'NUMBER', value: numStr, line: startLine, col: startCol };
  }

  private readIdentifier(): Token {
    const startLine = this.line;
    const startCol = this.col;
    let text = '';
    while (this.pos < this.input.length && (this.isAlpha(this.input[this.pos]) || this.isDigit(this.input[this.pos]) || this.input[this.pos] === '_')) {
      text += this.input[this.pos];
      this.advance();
    }

    const lower = text.toLowerCase();
    const KEYWORDS: Record<string, string> = {
      // Program
      'proceso': 'PROCESO',
      'algoritmo': 'PROCESO',
      'finproceso': 'FINPROCESO',
      'finalgoritmo': 'FINPROCESO',
      'algorithm': 'PROCESO',
      'endalgorithm': 'FINPROCESO',

      // Declarations & Types
      'definir': 'DEFINIR',
      'define': 'DEFINIR',
      'como': 'COMO',
      'as': 'COMO',
      'dimension': 'DIMENSION',
      'entero': 'TIPO_ENTERO',
      'integer': 'TIPO_ENTERO',
      'real': 'TIPO_REAL',
      'cadena': 'TIPO_CADENA',
      'texto': 'TIPO_CADENA',
      'text': 'TIPO_CADENA',
      'caracter': 'TIPO_CARACTER',
      'character': 'TIPO_CARACTER',
      'logico': 'TIPO_LOGICO',
      'boolean': 'TIPO_LOGICO',

      // I/O
      'leer': 'LEER',
      'read': 'LEER',
      'escribir': 'ESCRIBIR',
      'write': 'ESCRIBIR',
      'sin': 'SIN',
      'saltar': 'SALTAR',

      // Conditionals
      'si': 'SI',
      'if': 'SI',
      'entonces': 'ENTONCES',
      'then': 'ENTONCES',
      'sino': 'SINO',
      'else': 'SINO',
      'finsi': 'FINSI',
      'endif': 'FINSI',

      // Switch
      'segun': 'SEGUN',
      'switch': 'SEGUN',
      'hacer': 'HACER',
      'do': 'HACER',
      'caso': 'CASO',
      'case': 'CASO',
      'de': 'DE',
      'otro': 'OTRO',
      'modo': 'MODO',
      'default': 'DE_OTRO_MODO',
      'finsegun': 'FINSEGUN',
      'endswitch': 'FINSEGUN',

      // Loops
      'mientras': 'MIENTRAS',
      'while': 'MIENTRAS',
      'finmientras': 'FINMIENTRAS',
      'endwhile': 'FINMIENTRAS',

      'repetir': 'REPETIR',
      'repeat': 'REPETIR',
      'hasta': 'HASTA',
      'que': 'QUE',
      'until': 'UNTIL',

      'para': 'PARA',
      'for': 'PARA',
      'con': 'CON',
      'paso': 'PASO',
      'step': 'PASO',
      'to': 'HASTA',
      'finpara': 'FINPARA',
      'endfor': 'FINPARA',

      // Subprograms
      'subproceso': 'SUBPROCESO',
      'subalgoritmo': 'SUBPROCESO',
      'funcion': 'SUBPROCESO',
      'subprogram': 'SUBPROCESO',
      'function': 'SUBPROCESO',
      'finsubproceso': 'FINSUBPROCESO',
      'finsubalgoritmo': 'FINSUBPROCESO',
      'finfuncion': 'FINSUBPROCESO',
      'endsubprogram': 'FINSUBPROCESO',
      'por': 'POR',
      'by': 'BY',
      'retornar': 'RETORNAR',
      'return': 'RETORNAR',

      // OOP
      'clase': 'CLASE',
      'class': 'CLASE',
      'finclase': 'FINCLASE',
      'endclass': 'FINCLASE',
      'hereda': 'HEREDA',
      'inherits': 'HEREDA',
      'metodo': 'METODO',
      'method': 'METODO',
      'finmetodo': 'FINMETODO',
      'endmethod': 'FINMETODO',
      'constructor': 'CONSTRUCTOR',
      'privado': 'PRIVADO',
      'private': 'PRIVADO',
      'publico': 'PUBLICO',
      'public': 'PUBLICO',
      'nuevo': 'NUEVO',
      'new': 'NUEVO',
      'este': 'ESTE',
      'this': 'ESTE',
      'super': 'SUPER',

      // Booleans and Logical Operators
      'verdadero': 'VERDADERO',
      'true': 'VERDADERO',
      'falso': 'FALSO',
      'false': 'FALSO',
      'y': 'AND',
      'and': 'AND',
      'o': 'OR',
      'or': 'OR',
      'no': 'NOT',
      'not': 'NOT',
      'mod': 'MOD'
    };

    if (KEYWORDS[lower]) {
      return { type: KEYWORDS[lower], value: text, line: startLine, col: startCol };
    }

    return { type: 'IDENTIFIER', value: text, line: startLine, col: startCol };
  }
}
