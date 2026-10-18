import type {
  InteractiveWorkerRequest,
  InteractiveWorkerResponse,
  InteractiveStepResult
} from './interactive.worker';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, InterpreterOptions } from './interpreter';
import { TraceStep } from './types';

export type { InteractiveStepResult };

export class InteractiveSession {
  private worker: Worker | null = null;
  private currentSessionId: string | null = null;
  private fallbackInterp: Interpreter | null = null;
  private fallbackGen: Generator<TraceStep, void, unknown> | null = null;
  private isFallback: boolean = false;
  private pendingReadyResolve: ((success: boolean) => void) | null = null;
  private pendingStepResolve: ((res: InteractiveStepResult) => void) | null = null;
  private pendingInputResolve: (() => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.isFallback = true;
      return;
    }

    try {
      this.worker = new Worker(
        new URL('./interactive.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<InteractiveWorkerResponse>) => {
        const data = e.data;
        if (!data || data.sessionId !== this.currentSessionId) return;

        switch (data.type) {
          case 'SESSION_READY':
            if (this.pendingReadyResolve) {
              const cb = this.pendingReadyResolve;
              this.pendingReadyResolve = null;
              cb(true);
            }
            break;

          case 'SESSION_ERROR':
            if (this.pendingReadyResolve) {
              const cb = this.pendingReadyResolve;
              this.pendingReadyResolve = null;
              cb(false);
            }
            if (this.pendingStepResolve) {
              const cb = this.pendingStepResolve;
              this.pendingStepResolve = null;
              cb({
                sessionId: data.sessionId,
                done: true,
                isWaitingForInput: false,
                isFinished: true,
                error: data.error,
                outputs: []
              });
            }
            break;

          case 'STEP_RESULT':
            if (this.pendingStepResolve) {
              const cb = this.pendingStepResolve;
              this.pendingStepResolve = null;
              cb(data.result);
            }
            break;

          case 'INPUT_ACCEPTED':
            if (this.pendingInputResolve) {
              const cb = this.pendingInputResolve;
              this.pendingInputResolve = null;
              cb();
            }
            break;

          case 'SESSION_STOPPED':
            break;
        }
      };

      this.worker.onerror = (err) => {
        console.warn('Interactive worker encountered error, switching to fallback:', err);
        this.isFallback = true;
        this.terminate();
      };
    } catch {
      this.isFallback = true;
      this.worker = null;
    }
  }

  public async start(code: string, options?: InterpreterOptions): Promise<{ success: boolean; sessionId: string; error?: string }> {
    const sessionId = `interactive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.currentSessionId = sessionId;

    if (this.isFallback || !this.worker) {
      try {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const parsedAst = parser.parse();
        this.fallbackInterp = new Interpreter(parsedAst, { ...options, isInteractive: true });
        this.fallbackGen = this.fallbackInterp.generateSteps();
        return { success: true, sessionId };
      } catch (err: any) {
        return { success: false, sessionId, error: err.message || String(err) };
      }
    }

    return new Promise((resolve) => {
      this.pendingReadyResolve = (success) => {
        resolve({ success, sessionId });
      };

      this.worker!.postMessage({
        type: 'INIT_SESSION',
        sessionId,
        code,
        options
      } satisfies InteractiveWorkerRequest);
    });
  }

  public async step(sessionId: string): Promise<InteractiveStepResult> {
    if (sessionId !== this.currentSessionId) {
      return {
        sessionId,
        done: true,
        isWaitingForInput: false,
        isFinished: true,
        error: 'Sesión desfasada o detenida.',
        outputs: []
      };
    }

    if (this.isFallback || !this.worker) {
      if (!this.fallbackGen || !this.fallbackInterp) {
        return {
          sessionId,
          done: true,
          isWaitingForInput: false,
          isFinished: true,
          error: 'No hay sesión activa.',
          outputs: []
        };
      }

      const res = this.fallbackGen.next();
      const isDone = Boolean(res.done || this.fallbackInterp.isFinished);
      return {
        sessionId,
        done: isDone,
        step: res.value as TraceStep | undefined,
        isWaitingForInput: Boolean(this.fallbackInterp.isWaitingForInput),
        inputTarget: this.fallbackInterp.inputTarget,
        isFinished: Boolean(this.fallbackInterp.isFinished),
        error: this.fallbackInterp.error,
        outputs: this.fallbackInterp.getOutputs()
      };
    }

    return new Promise((resolve) => {
      this.pendingStepResolve = resolve;
      this.worker!.postMessage({
        type: 'STEP',
        sessionId
      } satisfies InteractiveWorkerRequest);
    });
  }

  public async provideInput(sessionId: string, value: string): Promise<void> {
    if (sessionId !== this.currentSessionId) return;

    if (this.isFallback || !this.worker) {
      if (this.fallbackInterp) {
        this.fallbackInterp.provideInput(value);
      }
      return;
    }

    return new Promise((resolve) => {
      this.pendingInputResolve = resolve;
      this.worker!.postMessage({
        type: 'PROVIDE_INPUT',
        sessionId,
        value
      } satisfies InteractiveWorkerRequest);
    });
  }

  public async reset(targetCode?: string): Promise<{ success: boolean; sessionId: string }> {
    const sessionId = `interactive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.currentSessionId = sessionId;

    if (this.isFallback || !this.worker) {
      if (targetCode !== undefined) {
        return this.start(targetCode);
      }
      if (this.fallbackInterp) {
        this.fallbackInterp.reset();
        this.fallbackGen = this.fallbackInterp.generateSteps();
      }
      return { success: true, sessionId };
    }

    return new Promise((resolve) => {
      this.pendingReadyResolve = (success) => resolve({ success, sessionId });
      this.worker!.postMessage({
        type: 'RESET_SESSION',
        sessionId,
        targetCode
      } satisfies InteractiveWorkerRequest);
    });
  }

  public stop(): void {
    if (this.currentSessionId && this.worker) {
      this.worker.postMessage({
        type: 'STOP_SESSION',
        sessionId: this.currentSessionId
      } satisfies InteractiveWorkerRequest);
    }
    this.currentSessionId = null;
    this.fallbackInterp = null;
    this.fallbackGen = null;
    this.pendingReadyResolve = null;
    this.pendingStepResolve = null;
    this.pendingInputResolve = null;
  }

  public terminate(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  public getSessionId(): string | null {
    return this.currentSessionId;
  }
}
