import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  CheckCircle,
  Home,
  BookOpen,
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
  Sparkles
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

  // Code state
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const [activeLine, setActiveLine] = useState<number | undefined>(undefined);

  // AST and diagram states
  const [ast, setAst] = useState<ProgramNode | null>(null);
  const [flowchartData, setFlowchartData] = useState<FlowchartData | null>(null);
  const [structogramBlocks, setStructogramBlocks] = useState<StructogramBlock[]>([]);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);

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

  // Parse code on change
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

  // Step-by-step execution loop
  useEffect(() => {
    let timer: any = null;
    if (isPlaying && stepGenerator && !isWaitingInput) {
      timer = setTimeout(() => {
        handleStepForward();
      }, speedMs);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, stepGenerator, isWaitingInput, speedMs]);

  const handleStartOrPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (!interpreter || !stepGenerator) {
      handleReset();
    }
    setIsPlaying(true);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setIsWaitingInput(false);
    setConsoleLogs([]);
    setTraceSteps([]);
    setCurrentStepIdx(-1);
    setActiveLine(undefined);
    setTestResults(null);

    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();
      const newInterp = new Interpreter(parsedAst);
      setInterpreter(newInterp);
      setStepGenerator(newInterp.generateSteps());
    } catch (e: any) {
      setSyntaxError(e.message);
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
      } catch (e: any) {
        setSyntaxError(e.message);
        return;
      }
    }

    const res = gen.next();

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
          isHidden: i >= (selectedExercise.visibleCases || []).length
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
    if (ex.referenceSolution_es) {
      setCode(ex.referenceSolution_es);
    }
    handleReset();
  };

  const handleSelectExample = (ex: any) => {
    setSelectedExercise(null);
    setTestResults(null);
    setCode(isEs ? ex.code_es : ex.code_en || ex.code_es);
    handleReset();
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="ide-wrapper">
      {/* Top Navbar / Control Bar */}
      <div className="ide-toolbar">
        <div className="ide-toolbar__group">
          <button className="pl-btn pl-btn--outline pl-btn--sm" onClick={onBackToHome} title="Volver al inicio">
            <Home size={15} />
            <span>{isEs ? 'Inicio' : 'Home'}</span>
          </button>
          <span className="pl-mono" style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--pl-brand)' }}>
            {selectedExercise ? selectedExercise.title_es : 'PseudoLearn IDE'}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="ide-toolbar__group">
          <button
            className={`pl-btn pl-btn--sm ${isPlaying ? 'pl-btn--outline' : 'pl-btn--primary'}`}
            onClick={handleStartOrPause}
            title={isPlaying ? 'Pausar' : 'Ejecutar'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
            <span>{isPlaying ? 'Pausar' : 'Ejecutar'}</span>
          </button>

          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleStepForward}
            title="Avanzar 1 sentencia"
          >
            <StepForward size={14} />
            <span>Paso</span>
          </button>

          <button
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleReset}
            title="Reiniciar ejecución"
          >
            <RotateCcw size={14} />
            <span>Reiniciar</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--pl-ink-2)' }}>
            <span>Velocidad:</span>
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
              <option value={700}>0.5x (Lento)</option>
              <option value={350}>1x (Normal)</option>
              <option value={150}>2x (Rápido)</option>
              <option value={30}>Max (Ráfaga)</option>
            </select>
          </div>

          {selectedExercise && (
            <button
              className="pl-btn pl-btn--sm"
              style={{ background: 'var(--pl-syn-str)', color: '#fff' }}
              onClick={handleValidateExercise}
              title="Evaluar con casos de prueba"
            >
              <CheckCircle size={14} />
              <span>Comprobar</span>
            </button>
          )}
        </div>

        {/* Global toggles */}
        <div className="ide-toolbar__group">
          <button className="pl-icon-btn" onClick={onToggleTheme} title="Tema">
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
              Ruta (15 Módulos)
            </button>
            <button
              className={`ide-sidebar__tab ${activeSidebarTab === 'examples' ? 'ide-sidebar__tab--active' : ''}`}
              onClick={() => setActiveSidebarTab('examples')}
            >
              Ejemplos (86)
            </button>
            <button
              className={`ide-sidebar__tab ${activeSidebarTab === 'specs' ? 'ide-sidebar__tab--active' : ''}`}
              onClick={() => setActiveSidebarTab('specs')}
            >
              Manual
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
                      onClick={() => toggleModuleAccordion(mod.id)}
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
                        <span>{mod.title_es}</span>
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
                              className={`ide-list-item ${isSelected ? 'ide-list-item--active' : ''}`}
                              onClick={() => handleSelectExercise(ex)}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{ex.title_es}</span>
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
                                {ex.summary_es}
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
                  className="ide-list-item"
                  onClick={() => handleSelectExample(ex)}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--pl-ink)' }}>
                    {ex.title_es || ex.id}
                  </div>
                  {ex.summary_es && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--pl-ink-2)', marginTop: '0.2rem' }}>
                      {ex.summary_es}
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
                    {sp.title_es}
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--pl-ink-2)', lineHeight: 1.4 }}>
                    {sp.summary_es}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Exercise Statement Box */}
          {selectedExercise && (
            <div style={{ padding: '0.8rem', borderTop: '1px solid var(--pl-line)', background: 'var(--pl-sunken)', maxHeight: '180px', overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--pl-brand)', marginBottom: '0.3rem' }}>
                Enunciado del reto:
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--pl-ink)', lineHeight: 1.4 }}>
                {selectedExercise.statement_es}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--pl-ink-2)' }}>
                {selectedExercise.visibleCases?.length || 0} casos visibles · {selectedExercise.hiddenCases?.length || 0} casos ocultos
              </div>
            </div>
          )}
        </aside>

        {/* Center Panel (Code Editor & Interactive Console) */}
        <section className="ide-center">
          {/* Syntax Error Banner */}
          {syntaxError && (
            <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.4rem 0.8rem', fontSize: '0.82rem', borderBottom: '1px solid #fecaca' }}>
              <strong>Error sintáctico:</strong> {syntaxError}
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
              onChange={e => setCode(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
            />
          </div>

          {/* Interactive Console / Terminal */}
          <div className="ide-console-container">
            <div className="ide-console-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Terminal size={14} />
                <span>Consola E/S & Validación</span>
              </div>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--pl-ink-2)', cursor: 'pointer', fontSize: '0.78rem' }}
                onClick={() => setConsoleLogs([])}
              >
                Limpiar
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
                    <span>{testResults.passed ? '¡Todos los casos de prueba superados!' : 'La solución no pasó todas las pruebas'}</span>
                  </div>
                  {testResults.details.map((d: any) => (
                    <div key={d.index} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      Caso {d.index} {d.isHidden ? '(oculto)' : ''}: {d.passed ? '✓ Correcto' : `✗ Error. Salida obtenida: [${d.actualOutputs?.join(', ')}], esperada: [${d.expectedOutputs?.join(', ')}]`}
                    </div>
                  ))}
                </div>
              )}

              {consoleLogs.length === 0 && !isWaitingInput && (
                <div style={{ color: 'var(--pl-ink-3)', fontStyle: 'italic' }}>
                  La salida de las sentencias <code>Escribir</code> aparecerá aquí.
                </div>
              )}

              {consoleLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}

              {isWaitingInput && (
                <div style={{ color: 'var(--pl-brand)', fontWeight: 600 }}>
                  [Esperando entrada de usuario para sentencia Leer...]
                </div>
              )}
            </div>

            {/* Input prompt when Leer is active */}
            {isWaitingInput && (
              <form onSubmit={handleSendInput} className="ide-console-input-row">
                <input
                  type="text"
                  className="ide-console-input"
                  placeholder="Introduce el valor y pulsa Enter..."
                  value={interactiveInput}
                  onChange={e => setInteractiveInput(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="pl-btn pl-btn--primary pl-btn--sm" style={{ marginLeft: '0.5rem' }}>
                  Enviar
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
              <span>Ordinograma</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'ns' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('ns')}
            >
              <Layers size={14} />
              <span>Estructograma</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'trace' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('trace')}
            >
              <Table size={14} />
              <span>Prueba de Escritorio</span>
            </button>
            <button
              className={`ide-surface-tab ${activeSurfaceTab === 'uml' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('uml')}
            >
              <Box size={14} />
              <span>Clases UML</span>
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
