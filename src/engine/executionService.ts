import type { TestCase, ValidationDetail } from './validator.worker';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter } from './interpreter';

/**
 * Nota de arquitectura y seguridad educativa:
 * La validación de ejercicios se ejecuta en el cliente (navegador / Web Worker)
 * para proporcionar retroalimentación didáctica inmediata y soporte 100% offline.
 * Los casos de prueba (tanto visibles como complementarios) están disponibles en el
 * cliente y no constituyen secretos criptográficos frente a inspección en DevTools.
 * Para calificaciones oficiales o exámenes de alta seguridad, la evaluación debe
 * realizarse en un servicio backend autenticado.
 */

export interface ValidationProgress {
  current: number;
  total: number;
}

export interface ValidationResult {
  passed: boolean;
  cancelled?: boolean;
  details: ValidationDetail[];
}

interface ActiveValidationOperation {
  id: string;
  cancel: (reason?: string) => void;
  readonly isSettled: boolean;
}

let activeWorker: Worker | null = null;
let currentTaskId = 0;
let activeOperation: ActiveValidationOperation | null = null;

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

export function cancelCurrentValidation(reason: string = 'Validación cancelada por el usuario.'): void {
  isFallbackCancelled = true;
  if (activeOperation && !activeOperation.isSettled) {
    activeOperation.cancel(reason);
  } else {
    terminateWorker();
  }
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
  // Cancel any prior incomplete operation
  if (activeOperation && !activeOperation.isSettled) {
    activeOperation.cancel('Operación anterior reemplazada.');
  }

  isFallbackCancelled = false;
  const taskId = `task_${++currentTaskId}_${Date.now()}`;
  const worker = getOrCreateWorker();

  if (worker) {
    return new Promise<ValidationResult>((resolve) => {
      let isSettled = false;
      let timeoutTimer: any = null;

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (worker) {
          worker.removeEventListener('message', messageHandler);
          worker.removeEventListener('error', errorHandler);
        }
      };

      const settle = (result: ValidationResult) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        if (activeOperation?.id === taskId) {
          activeOperation = null;
        }
        resolve(result);
      };

      const cancel = (reason: string = 'Validación cancelada por el usuario.') => {
        if (isSettled) return;
        cleanup();
        terminateWorker();
        settle({
          passed: false,
          cancelled: true,
          details: [{
            index: 1,
            error: reason,
            passed: false,
            isAdditional: false
          }]
        });
      };

      activeOperation = {
        id: taskId,
        cancel,
        get isSettled() { return isSettled; }
      };

      // 12-second watchdog timer to terminate if worker locks completely
      timeoutTimer = setTimeout(() => {
        if (isSettled) return;
        terminateWorker();
        settle({
          passed: false,
          details: [{
            index: 1,
            error: 'Tiempo límite de validación excedido (12s). Posible bucle infinito en el código.',
            passed: false,
            isAdditional: false
          }]
        });
      }, 12000);

      const messageHandler = (e: MessageEvent) => {
        if (isSettled) return;
        const data = e.data;
        if (!data || data.id !== taskId) return;

        if (data.type === 'PROGRESS') {
          onProgress?.({ current: data.current, total: data.total });
        } else if (data.type === 'VALIDATE_SUCCESS') {
          settle({ passed: data.passed, details: data.details });
        } else if (data.type === 'VALIDATE_ERROR') {
          settle({
            passed: false,
            details: [{ index: 1, error: data.error, passed: false, isAdditional: false }]
          });
        }
      };

      const errorHandler = (_err: ErrorEvent) => {
        if (isSettled) return;
        cleanup();
        terminateWorker();
        // Fallback to async in-thread time-sliced execution
        runAsyncValidationFallback(code, visibleCases, hiddenCases, taskId, onProgress)
          .then(res => settle(res))
          .catch(err => settle({
            passed: false,
            details: [{ index: 1, error: err.message || String(err), passed: false, isAdditional: false }]
          }));
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
  return new Promise<ValidationResult>((resolve) => {
    let isSettled = false;

    const cancel = (reason: string = 'Validación cancelada por el usuario.') => {
      if (isSettled) return;
      isSettled = true;
      isFallbackCancelled = true;
      if (activeOperation?.id === taskId) {
        activeOperation = null;
      }
      resolve({
        passed: false,
        cancelled: true,
        details: [{
          index: 1,
          error: reason,
          passed: false,
          isAdditional: false
        }]
      });
    };

    activeOperation = {
      id: taskId,
      cancel,
      get isSettled() { return isSettled; }
    };

    runAsyncValidationFallback(code, visibleCases, hiddenCases, taskId, onProgress)
      .then(res => {
        if (!isSettled) {
          isSettled = true;
          if (activeOperation?.id === taskId) activeOperation = null;
          resolve(res);
        }
      })
      .catch(err => {
        if (!isSettled) {
          isSettled = true;
          if (activeOperation?.id === taskId) activeOperation = null;
          resolve({
            passed: false,
            details: [{ index: 1, error: err.message || String(err), passed: false, isAdditional: false }]
          });
        }
      });
  });
}

/**
 * Asynchronous time-sliced fallback that yields to the browser's event loop
 * after every single test case, keeping the UI fully responsive.
 */
async function runAsyncValidationFallback(
  code: string,
  visibleCases: TestCase[],
  hiddenCases: TestCase[],
  taskId: string,
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

    const isCancelled = () => isFallbackCancelled || !activeOperation || activeOperation.id !== taskId || activeOperation.isSettled;

    for (let i = 0; i < allCases.length; i++) {
      if (isCancelled()) {
        return {
          passed: false,
          cancelled: true,
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
        isCancelled
      );

      if (isCancelled()) {
        return {
          passed: false,
          cancelled: true,
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
