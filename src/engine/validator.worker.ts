import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter } from './interpreter';

export interface TestCase {
  inputs?: string[];
  expectedOutputs?: string[];
}

export interface ValidateRequest {
  id: string;
  type: 'VALIDATE';
  code: string;
  visibleCases: TestCase[];
  hiddenCases: TestCase[];
  timeoutPerCaseMs?: number;
}

export interface RunRequest {
  id: string;
  type: 'RUN';
  code: string;
  inputs: string[];
  timeoutMs?: number;
}

export interface ValidationDetail {
  index: number;
  inputs?: string[];
  expectedOutputs?: string[];
  actualOutputs?: string[];
  passed: boolean;
  error?: string;
  isAdditional: boolean;
}

self.onmessage = (e: MessageEvent<ValidateRequest | RunRequest>) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'VALIDATE') {
    try {
      const lexer = new Lexer(data.code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();

      const allCases = [...(data.visibleCases || []), ...(data.hiddenCases || [])];
      let allPassed = true;
      const details: ValidationDetail[] = [];
      const timeoutMs = data.timeoutPerCaseMs || 3000;

      for (let i = 0; i < allCases.length; i++) {
        // Send progress update back to main thread
        self.postMessage({
          type: 'PROGRESS',
          id: data.id,
          current: i + 1,
          total: allCases.length
        });

        const testCase = allCases[i];
        const testInterp = new Interpreter(parsedAst, { maxExecutionTimeMs: timeoutMs });
        const res = testInterp.runAll(testCase.inputs || [], false, timeoutMs);

        const actualStr = res.outputs.map(s => s.trim()).join('\n');
        const expectedStr = (testCase.expectedOutputs || []).map((s: string) => s.trim()).join('\n');

        const passed = actualStr === expectedStr && !res.error;
        if (!passed) allPassed = false;

        details.push({
          index: i + 1,
          inputs: testCase.inputs,
          expectedOutputs: testCase.expectedOutputs,
          actualOutputs: res.outputs,
          passed,
          error: res.error,
          isAdditional: i >= (data.visibleCases || []).length
        });
      }

      self.postMessage({
        type: 'VALIDATE_SUCCESS',
        id: data.id,
        passed: allPassed,
        details
      });
    } catch (err: any) {
      self.postMessage({
        type: 'VALIDATE_ERROR',
        id: data.id,
        error: err.message || String(err)
      });
    }
  } else if (data.type === 'RUN') {
    try {
      const lexer = new Lexer(data.code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();

      const timeoutMs = data.timeoutMs || 4000;
      const interp = new Interpreter(parsedAst, { maxExecutionTimeMs: timeoutMs });
      const res = interp.runAll(data.inputs || [], false, timeoutMs);

      self.postMessage({
        type: 'RUN_SUCCESS',
        id: data.id,
        outputs: res.outputs,
        steps: res.steps,
        error: res.error
      });
    } catch (err: any) {
      self.postMessage({
        type: 'RUN_ERROR',
        id: data.id,
        error: err.message || String(err)
      });
    }
  }
};
