import type { TestCase, ValidationDetail } from './validator.worker';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter } from './interpreter';

export interface ValidationProgress {
  current: number;
  total: number;
}

export interface ValidationResult {
  passed: boolean;
  details: ValidationDetail[];
}

let activeWorker: Worker | null = null;
let currentTaskId = 0;

function getOrCreateWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!activeWorker) {
    try {
      activeWorker = new Worker(
        new URL('./validator.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch (err) {
      console.warn('Web Worker creation failed, using async fallback:', err);
      activeWorker = null;
    }
  }
  return activeWorker;
}

let isFallbackCancelled = false;

export function terminateWorker(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}

export function cancelCurrentValidation(): void {
  isFallbackCancelled = true;
  terminateWorker();
}

/**
 * Validates an exercise either in a Web Worker (off-main-thread) or via time-sliced async fallback.
 * The UI main thread is never frozen.
 */
export async function runExerciseValidation(
  code: string,
  visibleCases: TestCase[],
  hiddenCases: TestCase[],
  onProgress?: (progress: ValidationProgress) => void
): Promise<ValidationResult> {
  isFallbackCancelled = false;
  const taskId = `task_${++currentTaskId}_${Date.now()}`;
  const worker = getOrCreateWorker();

  if (worker) {
    return new Promise<ValidationResult>((resolve, reject) => {
      // 12-second watchdog timer to terminate if worker locks completely
      const timeoutTimer = setTimeout(() => {
        cleanup();
        terminateWorker();
        reject(new Error('Tiempo límite de validación excedido (12s). Posible bucle infinito en el código.'));
      }, 12000);

      const messageHandler = (e: MessageEvent) => {
        const data = e.data;
        if (!data || data.id !== taskId) return;

        if (data.type === 'PROGRESS') {
          onProgress?.({ current: data.current, total: data.total });
        } else if (data.type === 'VALIDATE_SUCCESS') {
          cleanup();
          resolve({ passed: data.passed, details: data.details });
        } else if (data.type === 'VALIDATE_ERROR') {
          cleanup();
          resolve({
            passed: false,
            details: [{ index: 1, error: data.error, passed: false, isAdditional: false }]
          });
        }
      };

      const errorHandler = (_err: ErrorEvent) => {
        cleanup();
        terminateWorker();
        // Fallback to async in-thread time-sliced execution
        runAsyncValidationFallback(code, visibleCases, hiddenCases, onProgress)
          .then(resolve)
          .catch(reject);
      };

      const cleanup = () => {
        clearTimeout(timeoutTimer);
        worker.removeEventListener('message', messageHandler);
        worker.removeEventListener('error', errorHandler);
      };

      worker.addEventListener('message', messageHandler);
      worker.addEventListener('error', errorHandler);

      worker.postMessage({
        id: taskId,
        type: 'VALIDATE',
        code,
        visibleCases,
        hiddenCases,
        timeoutPerCaseMs: 2500
      });
    });
  }

  // Fallback when Web Worker is unavailable: async time-sliced execution
  return runAsyncValidationFallback(code, visibleCases, hiddenCases, onProgress);
}

/**
 * Asynchronous time-sliced fallback that yields to the browser's event loop
 * after every single test case, keeping the UI fully responsive.
 */
async function runAsyncValidationFallback(
  code: string,
  visibleCases: TestCase[],
  hiddenCases: TestCase[],
  onProgress?: (progress: ValidationProgress) => void
): Promise<ValidationResult> {
  try {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const parsedAst = parser.parse();

    const allCases = [...(visibleCases || []), ...(hiddenCases || [])];
    let allPassed = true;
    const details: ValidationDetail[] = [];

    for (let i = 0; i < allCases.length; i++) {
      if (isFallbackCancelled) {
        return {
          passed: false,
          details: [{
            index: i + 1,
            error: 'Validación detenida por el usuario.',
            passed: false,
            isAdditional: false
          }]
        };
      }

      onProgress?.({ current: i + 1, total: allCases.length });

      // Yield control to the browser so UI updates and stays responsive
      await new Promise(resolve => setTimeout(resolve, 0));

      const testCase = allCases[i];
      const testInterp = new Interpreter(parsedAst, { maxExecutionTimeMs: 2500 });
      const res = await testInterp.runAllAsync(
        testCase.inputs || [],
        false,
        2500,
        16,
        () => isFallbackCancelled
      );

      if (isFallbackCancelled) {
        return {
          passed: false,
          details: [{
            index: i + 1,
            error: 'Validación detenida por el usuario.',
            passed: false,
            isAdditional: false
          }]
        };
      }

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
        isAdditional: i >= (visibleCases || []).length
      });
    }

    return { passed: allPassed, details };
  } catch (e: any) {
    return {
      passed: false,
      details: [{ index: 1, error: e.message || String(e), passed: false, isAdditional: false }]
    };
  }
}
