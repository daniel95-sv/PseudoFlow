import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  CheckCircle,
  Home,
  Code2,
  GitBranch,
  Table,
  Box,
  Layers,
  Terminal,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  AlertCircle,
  Trash2
} from 'lucide-react';

import { Lexer } from '../engine/lexer';
import { Parser } from '../engine/parser';
import { Interpreter } from '../engine/interpreter';
import { generateFlowchart, FlowchartData } from '../engine/flowchart';
import { generateStructogram, StructogramBlock } from '../engine/structogram';
import { ProgramNode, TraceStep } from '../engine/types';

import { FlowchartView } from './FlowchartView';
import { StructogramView } from './StructogramView';
import { TraceTableView } from './TraceTableView';
import { UmlClassView } from './UmlClassView';
import { CodeExportView } from './CodeExportView';

// Data imports
import modulesData from '../data/modules.json';
import exercisesData from '../data/exercises.json';
import specsData from '../data/specifications.json';
import examplesData from '../data/examples.json';

const DEFAULT_CODE = `Proceso DemostracionGuiada
    Definir temperatura Como Entero;
    Definir lecturas Como Entero;
    temperatura <- 30;
    lecturas <- 0;
    Mientras temperatura > 24 Hacer
        temperatura <- temperatura - 3;
        lecturas <- lecturas + 1;
        Escribir "Lectura ", lecturas, ": ", temperatura, " grados";
    FinMientras
    Escribir "Confort alcanzado tras ", lecturas, " lecturas";
FinProceso
`;

interface IDEViewProps {
  onBackToHome: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  lang: 'es' | 'en';
  onToggleLang: () => void;
}

export const IDEView: React.FC<IDEViewProps> = ({
  onBackToHome,
  theme,
  onToggleTheme,
  lang,
  onToggleLang
}) => {
  const isEs = lang === 'es';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Code state with localStorage draft support
  const [code, setCode] = useState<string>(() => {
    return localStorage.getItem('pseudoflow-draft-code') || DEFAULT_CODE;
  });
  const [activeLine, setActiveLine] = useState<number | undefined>(undefined);

  // AST and diagram states
  const [ast, setAst] = useState<ProgramNode | null>(null);
  const [flowchartData, setFlowchartData] = useState<FlowchartData | null>(null);
  const [structogramBlocks, setStructogramBlocks] = useState<StructogramBlock[]>([]);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Execution state
  const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
  const [stepGenerator, setStepGenerator] = useState<Generator<TraceStep, void, unknown> | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMs, setSpeedMs] = useState<number>(350);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [interactiveInput, setInteractiveInput] = useState<string>('');
  const [isWaitingInput, setIsWaitingInput] = useState<boolean>(false);

  // Sidebar and surface states
  const [activeSidebarTab, setActiveSidebarTab] = useState<'track' | 'specs' | 'examples'>('track');
  const [activeSurfaceTab, setActiveSurfaceTab] = useState<'flow' | 'ns' | 'trace' | 'uml' | 'export'>('flow');
  const [selectedExercise, setSelectedExercise] = useState<any | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    'CON-A2': true,
    'CON-B1': true
  });
  const [testResults, setTestResults] = useState<{ passed: boolean; details: any[] } | null>(null);

  // Parse code for diagrams whenever code changes
  useEffect(() => {
    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();
      setAst(parsedAst);
      setFlowchartData(generateFlowchart(parsedAst));
      setStructogramBlocks(generateStructogram(parsedAst));
      setSyntaxError(null);
    } catch (e: any) {
      setSyntaxError(e.message || String(e));
    }
  }, [code]);

  /**
   * Reset execution explicitly with the provided code string
   * Prevents stale React closures when selecting exercises or examples
   */
  const resetExecution = (targetCode?: string) => {
    const codeToRun = targetCode !== undefined ? targetCode : code;
    setIsPlaying(false);
    setIsWaitingInput(false);
    setConsoleLogs([]);
    setTraceSteps([]);
    setCurrentStepIdx(-1);
    setActiveLine(undefined);
    setTestResults(null);
    setRuntimeError(null);

    try {
      const lexer = new Lexer(codeToRun);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();
      setAst(parsedAst);
      setFlowchartData(generateFlowchart(parsedAst));
      setStructogramBlocks(generateStructogram(parsedAst));
      setSyntaxError(null);

      const newInterp = new Interpreter(parsedAst);
      setInterpreter(newInterp);
      setStepGenerator(newInterp.generateSteps());
    } catch (e: any) {
      setSyntaxError(e.message || String(e));
      setInterpreter(null);
      setStepGenerator(null);
    }
  };

  const handleStepForward = () => {
    let gen = stepGenerator;
    let interp = interpreter;

    if (!interp || !gen) {
      try {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        const parsedAst = parser.parse();
        interp = new Interpreter(parsedAst);
        gen = interp.generateSteps();
        setInterpreter(interp);
        setStepGenerator(gen);
        setSyntaxError(null);
        setRuntimeError(null);
      } catch (e: any) {
        setSyntaxError(e.message || String(e));
        return;
      }
    }

    const res = gen.next();

    // Check if runtime error occurred in execution
    if (interp.error) {
      setRuntimeError(interp.error);
      setConsoleLogs(prev => [...prev, `[${isEs ? 'Error de ejecución' : 'Runtime error'}]: ${interp.error}`]);
      setIsPlaying(false);
      setActiveLine(undefined);
      return;
    }

    if (interp.isWaitingForInput) {
      setIsWaitingInput(true);
      setIsPlaying(false);
    }

    if (res.done || interp.isFinished) {
      setIsPlaying(false);
      setActiveLine(undefined);
      return;
    }

    const step = res.value as TraceStep;
    setActiveLine(step.lineNumber);
    setTraceSteps(prev => [...prev, step]);
    setCurrentStepIdx(prev => prev + 1);

    if (step.outputLog) {
      setConsoleLogs(prev => [...prev, step.outputLog!]);
    }
  };

  const handleStartOrPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (!interpreter || !stepGenerator) {
      resetExecution();
    }
    setIsPlaying(true);
  };

  const stepForwardRef = useRef<() => void>(handleStepForward);
  useEffect(() => {
    stepForwardRef.current = handleStepForward;
  });

  // Step-by-step execution loop
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && stepGenerator && !isWaitingInput) {
      timer = setTimeout(() => {
        stepForwardRef.current();
      }, speedMs);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, stepGenerator, isWaitingInput, speedMs]);

  const handleSendInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interpreter || !interactiveInput.trim()) return;
    interpreter.provideInput(interactiveInput);
    setConsoleLogs(prev => [...prev, `> ${interactiveInput}`]);
    setInteractiveInput('');
    setIsWaitingInput(false);
    if (isPlaying) {
      setTimeout(handleStepForward, speedMs);
    }
  };

  // Run automated test suite for an exercise
  const handleValidateExercise = () => {
    if (!selectedExercise) return;
    setIsPlaying(false);

    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();

      const allCases = [...(selectedExercise.visibleCases || []), ...(selectedExercise.hiddenCases || [])];
      let allPassed = true;
      const details: any[] = [];

      for (let i = 0; i < allCases.length; i++) {
        const testCase = allCases[i];
        const testInterp = new Interpreter(parsedAst);
        const res = testInterp.runAll(testCase.inputs || []);

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
          isAdditional: i >= (selectedExercise.visibleCases || []).length
        });
      }

      setTestResults({ passed: allPassed, details });
    } catch (e: any) {
      setTestResults({
        passed: false,
        details: [{ index: 1, error: e.message || String(e), passed: false }]
      });
    }
  };

  const toggleModuleAccordion = (modId: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [modId]: !prev[modId]
    }));
  };

  const handleSelectExercise = (ex: any) => {
    setSelectedExercise(ex);
    setTestResults(null);
    const newCode = ex.referenceSolution_es || DEFAULT_CODE;
    setCode(newCode);
    resetExecution(newCode);
    localStorage.setItem('pseudoflow-draft-code', newCode);
  };

  const handleSelectExample = (ex: any) => {
    setSelectedExercise(null);
    setTestResults(null);
    const newCode = isEs ? ex.code_es : ex.code_en || ex.code_es;
    setCode(newCode);
    resetExecution(newCode);
    localStorage.setItem('pseudoflow-draft-code', newCode);
  };

  const handleDownloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedExercise ? selectedExercise.id : 'programa'}.pseudo`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setCode(content);
        resetExecution(content);
        localStorage.setItem('pseudoflow-draft-code', content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearDraft = () => {
    const confirmMsg = isEs
      ? '¿Deseas restablecer el código al ejemplo inicial y borrar el borrador guardado en este navegador?'
      : 'Reset code to default example and clear the draft saved in this browser?';
    if (window.confirm(confirmMsg)) {
      localStorage.removeItem('pseudoflow-draft-code');
      setSelectedExercise(null);
      setCode(DEFAULT_CODE);
      resetExecution(DEFAULT_CODE);
    }
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="ide-wrapper">
      {/* Top Navbar / Control Bar */}
      <div className="ide-toolbar">
        <div className="ide-toolbar__group">
          <button className="pl-btn pl-btn--outline pl-btn--sm" onClick={onBackToHome} title={isEs ? 'Volver al inicio' : 'Back to Home'}>
            <Home size={15} />
            <span>{isEs ? 'Inicio' : 'Home'}</span>
          </button>
          <span className="pl-mono" style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--pl-brand)' }}>
            {selectedExercise ? (isEs ? selectedExercise.title_es : selectedExercise.title_en || selectedExercise.title_es) : 'PseudoFlow IDE'}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="ide-toolbar__group">
          <button
            className={`pl-btn pl-btn--sm ${isPlaying ? 'pl-btn--outline' : 'pl-btn--primary'}`}
            onClick={handleStartOrPause}
            title={isPlaying ? (isEs ? 'Pausar' : 'Pause') : (isEs ? 'Ejecutar' : 'Run')}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
            <span>{isPlaying ? (isEs ? 'Pausar' : 'Pause') : (isEs ? 'Ejecutar' : 'Run')}</span>
          </button>

          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleStepForward}
            title={isEs ? 'Avanzar 1 sentencia' : 'Step 1 statement'}
          >
            <StepForward size={14} />
            <span>{isEs ? 'Paso' : 'Step'}</span>
          </button>

          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={() => resetExecution()}
            title={isEs ? 'Reiniciar ejecución' : 'Reset execution'}
          >
            <RotateCcw size={14} />
            <span>{isEs ? 'Reiniciar' : 'Reset'}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--pl-ink-2)' }}>
            <span>{isEs ? 'Velocidad:' : 'Speed:'}</span>
            <select
              value={speedMs}
              onChange={e => setSpeedMs(Number(e.target.value))}
              style={{
                background: 'var(--pl-sunken)',
                border: '1px solid var(--pl-line)',
                color: 'var(--pl-ink)',
                borderRadius: '4px',
                padding: '0.2rem 0.4rem',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            >
              <option value={700}>0.5x ({isEs ? 'Lento' : 'Slow'})</option>
              <option value={350}>1x ({isEs ? 'Normal' : 'Normal'})</option>
              <option value={150}>2x ({isEs ? 'Rápido' : 'Fast'})</option>
              <option value={30}>Max ({isEs ? 'Ráfaga' : 'Burst'})</option>
            </select>
          </div>

          {selectedExercise && (
            <button
              className="pl-btn pl-btn--sm"
              style={{ background: 'var(--pl-syn-str)', color: '#fff' }}
              onClick={handleValidateExercise}
              title={isEs ? 'Evaluar con casos de prueba' : 'Validate test cases'}
            >
              <CheckCircle size={14} />
              <span>{isEs ? 'Comprobar' : 'Check'}</span>
            </button>
          )}

          {/* Download & Upload File Actions */}
          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleDownloadCode}
            title={isEs ? 'Descargar código (.pseudo)' : 'Download code (.pseudo)'}
          >
            <Download size={14} />
            <span>{isEs ? 'Descargar' : 'Download'}</span>
          </button>

          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={() => fileInputRef.current?.click()}
            title={isEs ? 'Abrir archivo de código local (.pseudo, .txt, .psc)' : 'Open local code file (.pseudo, .txt, .psc)'}
          >
            <Upload size={14} />
            <span>{isEs ? 'Abrir' : 'Open'}</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFile}
            accept=".pseudo,.txt,.psc"
            style={{ display: 'none' }}
          />

          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleClearDraft}
            title={isEs ? 'Restablecer al ejemplo inicial (elimina el borrador guardado en este navegador)' : 'Reset to default code (clears draft saved in this browser)'}
          >
            <Trash2 size={14} />
            <span>{isEs ? 'Restablecer' : 'Clear'}</span>
          </button>
        </div>

        {/* Global toggles */}
        <div className="ide-toolbar__group">
          <button className="pl-icon-btn" onClick={onToggleTheme} title={isEs ? 'Cambiar tema' : 'Toggle theme'}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button className="pl-btn pl-btn--outline pl-btn--sm" onClick={onToggleLang}>
            {isEs ? 'EN' : 'ES'}
          </button>
        </div>
      </div>

      {/* Main IDE area */}
      <div className="ide-main">
        {/* Left Sidebar (Curriculum & Exercise Selector) */}
        <aside className="ide-sidebar">
          <div className="ide-sidebar__tabs">
            <button
              className={`ide-sidebar__tab ${activeSidebarTab === 'track' ? 'ide-sidebar__tab--active' : ''}`}
              onClick={() => setActiveSidebarTab('track')}
            >
              {isEs ? 'Ruta (15 Módulos)' : 'Curriculum (15)'}
            </button>
            <button
              className={`ide-sidebar__tab ${activeSidebarTab === 'examples' ? 'ide-sidebar__tab--active' : ''}`}
              onClick={() => setActiveSidebarTab('examples')}
            >
              {isEs ? 'Ejemplos (86)' : 'Examples (86)'}
            </button>
            <button
              className={`ide-sidebar__tab ${activeSidebarTab === 'specs' ? 'ide-sidebar__tab--active' : ''}`}
              onClick={() => setActiveSidebarTab('specs')}
            >
              {isEs ? 'Manual' : 'Specs'}
            </button>
          </div>

          {/* Tab Content: Curriculum Track */}
          {activeSidebarTab === 'track' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {modulesData.map((mod: any) => {
                const modExercises = exercisesData.filter((ex: any) => ex.module === mod.id);
                const isExpanded = expandedModules[mod.id] ?? false;

                return (
                  <div key={mod.id} style={{ borderBottom: '1px solid var(--pl-line-soft)' }}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleModuleAccordion(mod.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleModuleAccordion(mod.id);
                        }
                      }}
                      style={{
                        padding: '0.65rem 0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isExpanded ? 'var(--pl-sunken)' : 'transparent',
                        fontSize: '0.85rem',
                        fontWeight: 600
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span style={{ color: 'var(--pl-brand)' }}>{mod.id}:</span>
                        <span>{isEs ? mod.title_es : mod.title_en || mod.title_es}</span>
                      </div>
                      <span className="pl-mono" style={{ fontSize: '0.72rem', color: 'var(--pl-ink-2)' }}>
                        {modExercises.length}
                      </span>
                    </div>

                    {isExpanded && (
                      <div style={{ background: 'var(--pl-surface)' }}>
                        {modExercises.map((ex: any) => {
                          const isSelected = selectedExercise?.id === ex.id;
                          return (
                            <div
                              key={ex.id}
                              role="button"
                              tabIndex={0}
                              className={`ide-list-item ${isSelected ? 'ide-list-item--active' : ''}`}
                              onClick={() => handleSelectExercise(ex)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSelectExercise(ex);
                                }
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                  {isEs ? ex.title_es : ex.title_en || ex.title_es}
                                </span>
                                <span
                                  className="pl-mono"
                                  style={{
                                    fontSize: '0.7rem',
                                    background: ex.level === 1 ? '#dcfce7' : ex.level === 2 ? '#fef3c7' : '#fee2e2',
                                    color: '#1e293b',
                                    padding: '1px 5px',
                                    borderRadius: '3px'
                                  }}
                                >
                                  N{ex.level} · {ex.kind}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--pl-ink-2)', lineHeight: 1.3 }}>
                                {isEs ? ex.summary_es : ex.summary_en || ex.summary_es}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab Content: 86 Preloaded Examples */}
          {activeSidebarTab === 'examples' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {examplesData.map((ex: any) => (
                <div
                  key={ex.id}
                  role="button"
                  tabIndex={0}
                  className="ide-list-item"
                  onClick={() => handleSelectExample(ex)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectExample(ex);
                    }
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--pl-ink)' }}>
                    {isEs ? ex.title_es || ex.id : ex.title_en || ex.title_es || ex.id}
                  </div>
                  {(ex.summary_es || ex.summary_en) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--pl-ink-2)', marginTop: '0.2rem' }}>
                      {isEs ? ex.summary_es : ex.summary_en || ex.summary_es}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tab Content: Language Specifications */}
          {activeSidebarTab === 'specs' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.8rem' }}>
              {specsData.map((sp: any) => (
                <div key={sp.id} style={{ marginBottom: '1.2rem' }}>
                  <h4 style={{ fontSize: '0.88rem', color: 'var(--pl-brand)', marginBottom: '0.3rem' }}>
                    {isEs ? sp.title_es : sp.title_en || sp.title_es}
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--pl-ink-2)', lineHeight: 1.4 }}>
                    {isEs ? sp.summary_es : sp.summary_en || sp.summary_es}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Exercise Statement Box */}
          {selectedExercise && (
            <div style={{ padding: '0.8rem', borderTop: '1px solid var(--pl-line)', background: 'var(--pl-sunken)', maxHeight: '180px', overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--pl-brand)', marginBottom: '0.3rem' }}>
                {isEs ? 'Enunciado del reto:' : 'Challenge Statement:'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--pl-ink)', lineHeight: 1.4 }}>
                {isEs ? selectedExercise.statement_es : selectedExercise.statement_en || selectedExercise.statement_es}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--pl-ink-2)' }}>
                {selectedExercise.visibleCases?.length || 0} {isEs ? 'casos visibles' : 'visible cases'} · {selectedExercise.hiddenCases?.length || 0} {isEs ? 'casos adicionales' : 'additional test cases'}
              </div>
            </div>
          )}
        </aside>

        {/* Center Panel (Code Editor & Interactive Console) */}
        <section className="ide-center">
          {/* Syntax Error Banner */}
          {syntaxError && (
            <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span><strong>{isEs ? 'Error léxico o sintáctico:' : 'Syntax or Lexical Error:'}</strong> {syntaxError}</span>
            </div>
          )}

          {/* Runtime Error Banner */}
          {runtimeError && (
            <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderBottom: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span><strong>{isEs ? 'Error en tiempo de ejecución:' : 'Runtime Error:'}</strong> {runtimeError}</span>
              </div>
              <button
                className="pl-btn pl-btn--outline pl-btn--sm"
                onClick={() => resetExecution()}
                style={{ borderColor: '#fca5a5', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
              >
                {isEs ? 'Reiniciar' : 'Reset'}
              </button>
            </div>
          )}

          {/* Editor Container with Line Numbers */}
          <div className="ide-editor-container">
            <div className="ide-editor-gutter">
              {Array.from({ length: lineCount }).map((_, i) => {
                const lineNum = i + 1;
                const isActive = activeLine === lineNum;
                return (
                  <div
                    key={lineNum}
                    className={`ide-gutter-line ${isActive ? 'ide-gutter-line--active' : ''}`}
                  >
                    {isActive ? '▶ ' : ''}{lineNum}
                  </div>
                );
              })}
            </div>

            <textarea
              className="ide-editor-textarea"
              value={code}
              onChange={e => {
                const newCode = e.target.value;
                setCode(newCode);
                setIsPlaying(false);
                setIsWaitingInput(false);
                setActiveLine(undefined);
                setInterpreter(null);
                setStepGenerator(null);
                setRuntimeError(null);
                localStorage.setItem('pseudoflow-draft-code', newCode);
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label={isEs ? 'Editor de pseudocódigo interactivo' : 'Interactive pseudocode code editor'}
            />
          </div>

          {/* Interactive Console / Terminal */}
          <div className="ide-console-container">
            <div className="ide-console-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Terminal size={14} />
                <span>{isEs ? 'Consola E/S & Validación' : 'I/O Console & Testing'}</span>
              </div>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--pl-ink-2)', cursor: 'pointer', fontSize: '0.78rem' }}
                onClick={() => setConsoleLogs([])}
              >
                {isEs ? 'Limpiar' : 'Clear'}
              </button>
            </div>

            <div className="ide-console-body">
              {/* Test Results Banner if active */}
              {testResults && (
                <div
                  style={{
                    marginBottom: '0.75rem',
                    padding: '0.6rem',
                    borderRadius: '6px',
                    background: testResults.passed ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${testResults.passed ? '#a7f3d0' : '#fecaca'}`,
                    color: testResults.passed ? '#065f46' : '#991b1b'
                  }}
                >
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <CheckCircle size={15} />
                    <span>
                      {testResults.passed
                        ? (isEs ? '¡Todos los casos de prueba superados!' : 'All test cases passed successfully!')
                        : (isEs ? 'La solución no pasó todas las pruebas' : 'Solution failed some test cases')}
                    </span>
                  </div>
                  {testResults.details.map((d: any) => (
                    <div key={d.index} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      {isEs ? 'Caso' : 'Case'} {d.index} {d.isAdditional ? (isEs ? '(caso adicional)' : '(additional case)') : ''}:{' '}
                      {d.passed
                        ? (isEs ? '✓ Correcto' : '✓ Passed')
                        : `${isEs ? '✗ Error' : '✗ Failed'}. ${isEs ? 'Salida obtenida' : 'Actual'}: [${d.actualOutputs?.join(', ')}], ${isEs ? 'esperada' : 'expected'}: [${d.expectedOutputs?.join(', ')}]${d.error ? ` (${d.error})` : ''}`}
                    </div>
                  ))}
                </div>
              )}

              {consoleLogs.length === 0 && !isWaitingInput && !runtimeError && (
                <div style={{ color: 'var(--pl-ink-3)', fontStyle: 'italic' }}>
                  {isEs
                    ? 'La salida de las sentencias Escribir y diagnósticos aparecerá aquí.'
                    : 'Output from Escribir statements and runtime diagnostics will appear here.'}
                </div>
              )}

              {consoleLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}

              {isWaitingInput && (
                <div style={{ color: 'var(--pl-brand)', fontWeight: 600 }}>
                  [{isEs ? 'Esperando entrada de usuario para sentencia Leer...' : 'Waiting for user input for Leer statement...'}]
                </div>
              )}
            </div>

            {/* Input prompt when Leer is active */}
            {isWaitingInput && (
              <form onSubmit={handleSendInput} className="ide-console-input-row">
                <input
                  type="text"
                  className="ide-console-input"
                  placeholder={isEs ? 'Introduce el valor y pulsa Enter...' : 'Type value and press Enter...'}
                  value={interactiveInput}
                  onChange={e => setInteractiveInput(e.target.value)}
                  aria-label={isEs ? 'Entrada para comando Leer' : 'Input for Leer statement'}
                  autoFocus
                />
                <button type="submit" className="pl-btn pl-btn--primary pl-btn--sm" style={{ marginLeft: '0.5rem' }}>
                  {isEs ? 'Enviar' : 'Send'}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Right Panel: The 4 Synchronized Surfaces */}
        <section className="ide-surfaces">
          <div className="ide-surfaces-nav">
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'flow' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('flow')}
            >
              <GitBranch size={14} />
              <span>{isEs ? 'Ordinograma' : 'Flowchart'}</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'ns' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('ns')}
            >
              <Layers size={14} />
              <span>{isEs ? 'Estructograma' : 'Structogram'}</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'trace' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('trace')}
            >
              <Table size={14} />
              <span>{isEs ? 'Prueba de Escritorio' : 'Trace Table'}</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'uml' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('uml')}
            >
              <Box size={14} />
              <span>{isEs ? 'Clases UML' : 'UML Classes'}</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'export' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('export')}
            >
              <Code2 size={14} />
              <span>Python & Rust</span>
            </button>
          </div>

          <div className="ide-surface-content">
            {activeSurfaceTab === 'flow' && (
              <FlowchartView data={flowchartData} activeLine={activeLine} />
            )}

            {activeSurfaceTab === 'ns' && (
              <StructogramView blocks={structogramBlocks} activeLine={activeLine} />
            )}

            {activeSurfaceTab === 'trace' && (
              <TraceTableView steps={traceSteps} currentStepIndex={currentStepIdx} />
            )}

            {activeSurfaceTab === 'uml' && (
              <UmlClassView classes={ast?.classes || []} />
            )}

            {activeSurfaceTab === 'export' && (
              <CodeExportView code={code} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
