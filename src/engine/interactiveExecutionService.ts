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

export interface InteractiveInputResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

interface PendingReady {
  sessionId: string;
  requestId: string;
  resolve: (res: { success: boolean; error?: string }) => void;
  timer?: any;
}

interface PendingStep {
  sessionId: string;
  requestId: string;
  resolve: (res: InteractiveStepResult) => void;
  timer?: any;
}

interface PendingInput {
  sessionId: string;
  requestId: string;
  resolve: (res: InteractiveInputResult) => void;
  timer?: any;
}

export class InteractiveSession {
  private worker: Worker | null = null;
  private currentSessionId: string | null = null;
  private currentOptions: InterpreterOptions | undefined = undefined;
  private fallbackInterp: Interpreter | null = null;
  private fallbackGen: Generator<TraceStep, void, unknown> | null = null;
  private isFallback: boolean = false;
  private nextReqId: number = 0;
  private isStepping: boolean = false;
  private activeStepRequestId: string | null = null;

  private pendingReady: PendingReady | null = null;
  private pendingStep: PendingStep | null = null;
  private pendingInput: PendingInput | null = null;

  constructor() {
    this.initWorker();
  }

  private createRequestId(): string {
    return `req_${++this.nextReqId}_${Date.now()}`;
  }

  private flushPending(errorReason: string): void {
    if (this.pendingReady) {
      const pr = this.pendingReady;
      this.pendingReady = null;
      if (pr.timer) clearTimeout(pr.timer);
      pr.resolve({ success: false, error: errorReason });
    }

    if (this.pendingStep) {
      const ps = this.pendingStep;
      this.pendingStep = null;
      if (ps.timer) clearTimeout(ps.timer);
      this.isStepping = false;
      this.activeStepRequestId = null;
      ps.resolve({
        sessionId: ps.sessionId, // Preserves its OWN original sessionId
        done: true,
        isWaitingForInput: false,
        isFinished: true,
        error: errorReason,
        cancelled: true,
        outputs: []
      });
    }

    if (this.pendingInput) {
      const pi = this.pendingInput;
      this.pendingInput = null;
      if (pi.timer) clearTimeout(pi.timer);
      pi.resolve({
        success: false,
        cancelled: true,
        error: errorReason
      });
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
            if (this.pendingReady && (!data.requestId || this.pendingReady.requestId === data.requestId)) {
              const pr = this.pendingReady;
              this.pendingReady = null;
              if (pr.timer) clearTimeout(pr.timer);
              pr.resolve({ success: true });
            }
            break;

          case 'SESSION_ERROR':
            if (this.pendingReady && (!data.requestId || this.pendingReady.requestId === data.requestId)) {
              const pr = this.pendingReady;
              this.pendingReady = null;
              if (pr.timer) clearTimeout(pr.timer);
              pr.resolve({ success: false, error: data.error });
            }
            if (this.pendingStep && (!data.requestId || this.pendingStep.requestId === data.requestId)) {
              const ps = this.pendingStep;
              this.pendingStep = null;
              if (ps.timer) clearTimeout(ps.timer);
              this.isStepping = false;
              this.activeStepRequestId = null;
              ps.resolve({
                sessionId: ps.sessionId,
                done: true,
                isWaitingForInput: false,
                isFinished: true,
                error: data.error,
                outputs: []
              });
            }
            break;

          case 'STEP_RESULT':
            if (this.pendingStep && (!data.requestId || this.pendingStep.requestId === data.requestId)) {
              const ps = this.pendingStep;
              this.pendingStep = null;
              if (ps.timer) clearTimeout(ps.timer);
              this.isStepping = false;
              this.activeStepRequestId = null;
              ps.resolve(data.result);
            }
            break;

          case 'INPUT_ACCEPTED':
            if (this.pendingInput && (!data.requestId || this.pendingInput.requestId === data.requestId)) {
              const pi = this.pendingInput;
              this.pendingInput = null;
              if (pi.timer) clearTimeout(pi.timer);
              pi.resolve({ success: true });
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
    // 1. Flush any prior in-flight operations with previous session context BEFORE setting new sessionId
    this.flushPending('Sesión reemplazada por nueva inicialización.');

    if (options !== undefined) {
      this.currentOptions = options;
    }
    const sessionId = `interactive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.currentSessionId = sessionId;

    if (this.isFallback || !this.worker) {
      try {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const parsedAst = parser.parse();
        this.fallbackInterp = new Interpreter(parsedAst, { ...this.currentOptions, isInteractive: true });
        this.fallbackGen = this.fallbackInterp.generateSteps();
        return { success: true, sessionId };
      } catch (err: any) {
        return { success: false, sessionId, error: err?.message || String(err) };
      }
    }

    const reqId = this.createRequestId();
    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = (res: { success: boolean; error?: string }) => {
        if (timer) clearTimeout(timer);
        this.pendingReady = null;
        resolve({ success: res.success, sessionId, error: res.error });
      };

      timer = setTimeout(() => {
        if (this.pendingReady && this.pendingReady.requestId === reqId) {
          this.pendingReady = null;
          resolve({
            success: false,
            sessionId,
            error: 'Tiempo de espera agotado al iniciar la sesión en el Worker.'
          });
        }
      }, 5000);

      this.pendingReady = {
        sessionId,
        requestId: reqId,
        resolve: onDone,
        timer
      };

      this.worker!.postMessage({
        type: 'INIT_SESSION',
        sessionId,
        code,
        options: this.currentOptions,
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
        cancelled: true,
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
        this.pendingStep = null;
        resolve(res);
      };

      timer = setTimeout(() => {
        if (this.pendingStep && this.pendingStep.requestId === reqId) {
          console.warn(`Watchdog 10s triggered on step requestId ${reqId}. Terminating and restarting Worker.`);
          if (this.worker) {
            try {
              this.worker.terminate();
            } catch {
              // Ignore
            }
            this.worker = null;
          }
          this.flushPending('Tiempo de espera agotado (watchdog 10s): el Worker interactivo no respondió y fue reiniciado.');
          this.currentSessionId = null;
          this.initWorker();
        }
      }, 10000);

      this.pendingStep = {
        sessionId,
        requestId: reqId,
        resolve: onDone,
        timer
      };

      this.worker!.postMessage({
        type: 'STEP',
        sessionId,
        requestId: reqId
      } satisfies InteractiveWorkerRequest);
    });
  }

  public async provideInput(sessionId: string, value: string): Promise<InteractiveInputResult> {
    if (sessionId !== this.currentSessionId) {
      return { success: false, error: 'Sesión no activa o desfasada.' };
    }

    if (this.isFallback || !this.worker) {
      if (this.fallbackInterp) {
        this.fallbackInterp.provideInput(value);
        return { success: true };
      }
      return { success: false, error: 'No hay sesión interactiva activa.' };
    }

    const reqId = this.createRequestId();
    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = (res: InteractiveInputResult) => {
        if (timer) clearTimeout(timer);
        this.pendingInput = null;
        resolve(res);
      };

      timer = setTimeout(() => {
        if (this.pendingInput && this.pendingInput.requestId === reqId) {
          this.pendingInput = null;
          resolve({
            success: false,
            error: 'Tiempo de espera agotado (5s) al enviar entrada al Worker.'
          });
        }
      }, 5000);

      this.pendingInput = {
        sessionId,
        requestId: reqId,
        resolve: onDone,
        timer
      };

      this.worker!.postMessage({
        type: 'PROVIDE_INPUT',
        sessionId,
        value,
        requestId: reqId
      } satisfies InteractiveWorkerRequest);
    });
  }

  public async reset(targetCode?: string, options?: InterpreterOptions): Promise<{ success: boolean; sessionId: string; error?: string }> {
    // 1. Flush any prior in-flight operations with previous session context BEFORE setting new sessionId
    this.flushPending('Sesión reiniciada.');

    if (options !== undefined) {
      this.currentOptions = options;
    }
    const sessionId = `interactive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.currentSessionId = sessionId;

    if (this.isFallback || !this.worker) {
      if (targetCode !== undefined) {
        return this.start(targetCode, this.currentOptions);
      }
      if (this.fallbackInterp) {
        this.fallbackInterp.reset();
        this.fallbackGen = this.fallbackInterp.generateSteps();
      }
      return { success: true, sessionId };
    }

    const reqId = this.createRequestId();
    return new Promise((resolve) => {
      let timer: any = null;
      const onDone = (res: { success: boolean; error?: string }) => {
        if (timer) clearTimeout(timer);
        this.pendingReady = null;
        resolve({ success: res.success, sessionId, error: res.error });
      };

      timer = setTimeout(() => {
        if (this.pendingReady && this.pendingReady.requestId === reqId) {
          this.pendingReady = null;
          resolve({
            success: false,
            sessionId,
            error: 'Tiempo de espera agotado al reiniciar la sesión en el Worker.'
          });
        }
      }, 5000);

      this.pendingReady = {
        sessionId,
        requestId: reqId,
        resolve: onDone,
        timer
      };

      this.worker!.postMessage({
        type: 'RESET_SESSION',
        sessionId,
        targetCode,
        options: this.currentOptions,
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
    this.flushPending('Sesión interactiva detenida.');
    this.currentSessionId = null;
    this.fallbackInterp = null;
    this.fallbackGen = null;
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
