import { describe, it, expect } from 'vitest';
import { Lexer } from '../src/engine/lexer';
import { Parser } from '../src/engine/parser';
import { Interpreter } from '../src/engine/interpreter';
import exercisesData from '../src/data/exercises.json';

describe('Curriculum Exercises Full Verification', () => {
  it('has 95 total exercises', () => {
    expect(exercisesData.length).toBe(95);
  });

  exercisesData.forEach(ex => {
    it(`[${ex.module}] ${ex.id} - ${ex.title_es}`, () => {
      expect(ex.referenceSolution_es, `Missing referenceSolution_es for ${ex.id}`).toBeDefined();
      expect(ex.referenceSolution_es.length).toBeGreaterThan(10);

      const allCases = [...(ex.visibleCases || []), ...(ex.hiddenCases || [])];
      expect(allCases.length, `No test cases found for ${ex.id}`).toBeGreaterThan(0);

      // Tokenize and parse reference solution
      let parsedAst;
      try {
        const lexer = new Lexer(ex.referenceSolution_es);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        parsedAst = parser.parse();
      } catch (err: any) {
        throw new Error(`Parse error in exercise ${ex.id} (${ex.title_es}): ${err.message}\nCode:\n${ex.referenceSolution_es}`);
      }

      // Execute against each test case
      allCases.forEach((tc, caseIdx) => {
        const interp = new Interpreter(parsedAst);
        const res = interp.runAll(tc.inputs || []);

        if (res.error) {
          throw new Error(
            `Runtime error in exercise ${ex.id} case ${caseIdx + 1} with inputs [${(tc.inputs || []).join(', ')}]: ${res.error}\nCode:\n${ex.referenceSolution_es}`
          );
        }

        const actualStr = res.outputs.map(s => s.trim()).join('\n');
        const expectedStr = (tc.expectedOutputs || []).map((s: string) => s.trim()).join('\n');

        expect(
          actualStr,
          `Output mismatch in exercise ${ex.id} (${ex.title_es}) case ${caseIdx + 1} (inputs: [${(tc.inputs || []).join(', ')}]):\nExpected:\n${expectedStr}\nActual:\n${actualStr}`
        ).toBe(expectedStr);
      });
    });
  });
});
