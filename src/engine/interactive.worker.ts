import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter, InterpreterOptions } from './interpreter';
import { TraceStep } from './types';

export interface InteractiveStepResult {
  sessionId: string;
  done: boolean;
  step?: TraceStep;
  isWaitingForInput: boolean;
  inputTarget?: string;
  isFinished: boolean;
  error?: string;
  outputs: string[];
}

export type InteractiveWorkerRequest =
  | { type: 'INIT_SESSION'; sessionId: string; code: string; options?: InterpreterOptions }
  | { type: 'STEP'; sessionId: string }
  | { type: 'PROVIDE_INPUT'; sessionId: string; value: string }
  | { type: 'RESET_SESSION'; sessionId: string; targetCode?: string }
  | { type: 'STOP_SESSION'; sessionId: string };

export type InteractiveWorkerResponse =
  | { type: 'SESSION_READY'; sessionId: string }
  | { type: 'STEP_RESULT'; sessionId: string; result: InteractiveStepResult }
  | { type: 'INPUT_ACCEPTED'; sessionId: string }
  | { type: 'SESSION_ERROR'; sessionId: string; error: string }
  | { type: 'SESSION_STOPPED'; sessionId: string };

let currentSessionId: string | null = null;
let currentCode: string = '';
let currentInterp: Interpreter | null = null;
let currentGen: Generator<TraceStep, void, unknown> | null = null;

self.onmessage = (e: MessageEvent<InteractiveWorkerRequest>) => {
  const data = e.data;
  if (!data) return;

  switch (data.type) {
    case 'INIT_SESSION': {
      currentSessionId = data.sessionId;
      currentCode = data.code;
      try {
        const lexer = new Lexer(data.code);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const parsedAst = parser.parse();

        currentInterp = new Interpreter(parsedAst, {
          ...data.options,
          isInteractive: true
        });
        currentGen = currentInterp.generateSteps();

        self.postMessage({
          type: 'SESSION_READY',
          sessionId: data.sessionId
        } satisfies InteractiveWorkerResponse);
      } catch (err: any) {
        self.postMessage({
          type: 'SESSION_ERROR',
          sessionId: data.sessionId,
          error: err.message || String(err)
        } satisfies InteractiveWorkerResponse);
      }
      break;
    }

    case 'STEP': {
      if (!currentSessionId || currentSessionId !== data.sessionId || !currentGen || !currentInterp) {
        return;
      }

      try {
        const res = currentGen.next();
        const isDone = Boolean(res.done || currentInterp.isFinished);
        const step = res.value as TraceStep | undefined;

        const result: InteractiveStepResult = {
          sessionId: data.sessionId,
          done: isDone,
          step,
          isWaitingForInput: Boolean(currentInterp.isWaitingForInput),
          inputTarget: currentInterp.inputTarget,
          isFinished: Boolean(currentInterp.isFinished),
          error: currentInterp.error,
          outputs: currentInterp.getOutputs()
        };

        self.postMessage({
          type: 'STEP_RESULT',
          sessionId: data.sessionId,
          result
        } satisfies InteractiveWorkerResponse);
      } catch (err: any) {
        self.postMessage({
          type: 'SESSION_ERROR',
          sessionId: data.sessionId,
          error: err.message || String(err)
        } satisfies InteractiveWorkerResponse);
      }
      break;
    }

    case 'PROVIDE_INPUT': {
      if (!currentSessionId || currentSessionId !== data.sessionId || !currentInterp) {
        return;
      }
      currentInterp.provideInput(data.value);
      self.postMessage({
        type: 'INPUT_ACCEPTED',
        sessionId: data.sessionId
      } satisfies InteractiveWorkerResponse);
      break;
    }

    case 'RESET_SESSION': {
      if (!currentSessionId || currentSessionId !== data.sessionId) {
        return;
      }
      try {
        const codeToRun = data.targetCode !== undefined ? data.targetCode : currentCode;
        const lexer = new Lexer(codeToRun);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const parsedAst = parser.parse();

        currentCode = codeToRun;
        currentInterp = new Interpreter(parsedAst, { isInteractive: true });
        currentGen = currentInterp.generateSteps();

        self.postMessage({
          type: 'SESSION_READY',
          sessionId: data.sessionId
        } satisfies InteractiveWorkerResponse);
      } catch (err: any) {
        self.postMessage({
          type: 'SESSION_ERROR',
          sessionId: data.sessionId,
          error: err.message || String(err)
        } satisfies InteractiveWorkerResponse);
      }
      break;
    }

    case 'STOP_SESSION': {
      if (currentSessionId === data.sessionId) {
        currentSessionId = null;
        currentInterp = null;
        currentGen = null;
        self.postMessage({
          type: 'SESSION_STOPPED',
          sessionId: data.sessionId
        } satisfies InteractiveWorkerResponse);
      }
      break;
    }
  }
};
