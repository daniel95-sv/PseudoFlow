import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';
import { Interpreter } from '../src/engine/interpreter';
import examplesData from '../src/data/examples.json';

describe('Curriculum Examples Bilingual Verification (Fase 3 P1)', () => {
  it('has 86 total educational examples', () => {
    expect(examplesData.length).toBe(86);
  });

  examplesData.forEach((example) => {
    describe(`[${example.id}] ${example.title_es} / ${example.title_en}`, () => {
      it('parses code_es successfully without syntax errors', () => {
        expect(example.code_es).toBeDefined();
        const lexer = new Lexer(example.code_es);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        expect(ast).toBeDefined();
        expect(ast.type).toBe('Program');
      });

      if (example.code_en) {
        it('parses code_en successfully with English keywords', () => {
          const lexer = new Lexer(example.code_en);
          const tokens = lexer.tokenize();
          const parser = new Parser(tokens);
          const ast = parser.parse();
          expect(ast).toBeDefined();
          expect(ast.type).toBe('Program');
        });
      }

      it('executes in the Interpreter without unexpected runtime crash', () => {
        const lexer = new Lexer(example.code_es);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        const interp = new Interpreter(ast, { maxExecutionSteps: 50000 });
        // Feed mock sequential inputs for examples that read stdin (e.g. sentinel 0 to terminate loops)
        const mockInputs = ['10', '20', '0', '40', '50'];
        const res = interp.runAll(mockInputs);
        expect(res.error).toBeUndefined();
      });
    });
  });
});
