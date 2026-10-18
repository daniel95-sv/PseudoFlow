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
  private nextReqId: number = 0;
  private isStepping: boolean = false;
  private activeStepRequestId: string | null = null;

  private pendingReadyResolve: ((res: { success: boolean; error?: string }) => void) | null = null;
  private pendingStepResolve: ((res: InteractiveStepResult) => void) | null = null;
  private pendingInputResolve: (() => void) | null = null;

  constructor() {
    this.initWorker();
  }

  private createRequestId(): string {
    return `req_${++this.nextReqId}_${Date.now()}`;
  }

  private flushPending(errorReason: string): void {
    if (this.pendingReadyResolve) {
      const cb = this.pendingReadyResolve;
      this.pendingReadyResolve = null;
      cb({ success: false, error: errorReason });
    }

    if (this.pendingStepResolve) {
      const cb = this.pendingStepResolve;
      this.pendingStepResolve = null;
      cb({
        sessionId: this.currentSessionId || '',
        done: true,
        isWaitingForInput: false,
        isFinished: true,
        error: errorReason,
        outputs: []
      });
    }

    if (this.pendingInputResolve) {
      const cb = this.pendingInputResolve;
      this.pendingInputResolve = null;
      cb();
    }

    this.isStepping = false;
    this.activeStepRequestId = null;
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
              cb({ success: true });
            }
            break;

          case 'SESSION_ERROR':
            if (this.pendingReadyResolve) {
              const cb = this.pendingReadyResolve;
              this.pendingReadyResolve = null;
              cb({ success: false, error: data.error });
            }
            if (this.pendingStepResolve) {
              const cb = this.pendingStepResolve;
              this.pendingStepResolve = null;
              this.isStepping = false;
              this.activeStepRequestId = null;
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
              if (this.activeStepRequestId && data.requestId && this.activeStepRequestId !== data.requestId) {
                // Ignore stale step response
                return;
              }
              const cb = this.pendingStepResolve;
              this.pendingStepResolve = null;
              this.isStepping = false;
              this.activeStepRequestId = null;
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
        const errMsg = typeof err === 'object' && err && 'message' in err
          ? String((err as any).message)
          : 'Worker interactivo falló inesperadamente.';
        console.warn('Interactive worker encountered error, switching to fallback:', err);
        this.isFallback = true;
        this.flushPending(errMsg);
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
        return { success: false, sessionId, error: err?.message || String(err) };
      }
    }

    // Cancel any prior in-flight operations before starting a new session
    this.flushPending('Sesión reemplazada por nueva inicialización.');

    const reqId = this.createRequestId();
    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = (res: { success: boolean; error?: string }) => {
        if (timer) clearTimeout(timer);
        resolve({ success: res.success, sessionId, error: res.error });
      };

      timer = setTimeout(() => {
        if (this.pendingReadyResolve === onDone) {
          this.pendingReadyResolve = null;
          resolve({
            success: false,
            sessionId,
            error: 'Tiempo de espera agotado al iniciar la sesión en el Worker.'
          });
        }
      }, 5000);

      this.pendingReadyResolve = onDone;
      this.worker!.postMessage({
        type: 'INIT_SESSION',
        sessionId,
        code,
        options,
        requestId: reqId
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

    if (this.isStepping) {
      return {
        sessionId,
        done: false,
        isWaitingForInput: false,
        isFinished: false,
        error: 'Paso interactivo ya en curso. Espere a que finalice la operación previa.',
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
        outputs: isDone ? this.fallbackInterp.getOutputs() : []
      };
    }

    this.isStepping = true;
    const reqId = this.createRequestId();
    this.activeStepRequestId = reqId;

    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = (res: InteractiveStepResult) => {
        if (timer) clearTimeout(timer);
        this.isStepping = false;
        this.activeStepRequestId = null;
        resolve(res);
      };

      timer = setTimeout(() => {
        if (this.pendingStepResolve === onDone) {
          this.pendingStepResolve = null;
          this.isStepping = false;
          this.activeStepRequestId = null;
          resolve({
            sessionId,
            done: true,
            isWaitingForInput: false,
            isFinished: true,
            error: 'Tiempo de espera agotado al ejecutar paso en el Worker.',
            outputs: []
          });
        }
      }, 10000);

      this.pendingStepResolve = onDone;
      this.worker!.postMessage({
        type: 'STEP',
        sessionId,
        requestId: reqId
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

    const reqId = this.createRequestId();
    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };

      timer = setTimeout(() => {
        if (this.pendingInputResolve === onDone) {
          this.pendingInputResolve = null;
          resolve();
        }
      }, 5000);

      this.pendingInputResolve = onDone;
      this.worker!.postMessage({
        type: 'PROVIDE_INPUT',
        sessionId,
        value,
        requestId: reqId
      } satisfies InteractiveWorkerRequest);
    });
  }

  public async reset(targetCode?: string): Promise<{ success: boolean; sessionId: string; error?: string }> {
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

    // Cancel any prior in-flight operations before resetting
    this.flushPending('Sesión reiniciada.');

    const reqId = this.createRequestId();
    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = (res: { success: boolean; error?: string }) => {
        if (timer) clearTimeout(timer);
        resolve({ success: res.success, sessionId, error: res.error });
      };

      timer = setTimeout(() => {
        if (this.pendingReadyResolve === onDone) {
          this.pendingReadyResolve = null;
          resolve({
            success: false,
            sessionId,
            error: 'Tiempo de espera agotado al reiniciar la sesión en el Worker.'
          });
        }
      }, 5000);

      this.pendingReadyResolve = onDone;
      this.worker!.postMessage({
        type: 'RESET_SESSION',
        sessionId,
        targetCode,
        requestId: reqId
      } satisfies InteractiveWorkerRequest);
    });
  }

  public stop(): void {
    if (this.currentSessionId && this.worker) {
      try {
        this.worker.postMessage({
          type: 'STOP_SESSION',
          sessionId: this.currentSessionId,
          requestId: this.createRequestId()
        } satisfies InteractiveWorkerRequest);
      } catch {
        // Ignore if worker already disconnected
      }
    }
    this.currentSessionId = null;
    this.fallbackInterp = null;
    this.fallbackGen = null;
    this.flushPending('Sesión interactiva detenida.');
  }

  public terminate(): void {
    this.stop();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore
      }
      this.worker = null;
    }
  }

  public getSessionId(): string | null {
    return this.currentSessionId;
  }
}
