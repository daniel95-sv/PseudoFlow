import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Trash2,
  BookOpen,
  Columns2,
  Columns3,
  Columns4,
  PanelLeft,
  X,
  Settings,
  WrapText,
  ArrowLeftToLine
} from 'lucide-react';

import { Lexer } from '../engine/lexer';
import { Parser } from '../engine/parser';
import { InteractiveSession } from '../engine/interactiveExecutionService';
import { generateFlowchart } from '../engine/flowchart';
import { generateStructogram, StructogramBlock } from '../engine/structogram';
import { TraceStep } from '../engine/types';
import { safeStorageGet, safeStorageSet, safeStorageRemove } from '../engine/storage';
import { runExerciseValidation, cancelCurrentValidation, ValidationProgress } from '../engine/executionService';

import { FlowchartView } from './FlowchartView';
import { StructogramView } from './StructogramView';
import { TraceTableView } from './TraceTableView';
import { UmlClassView } from './UmlClassView';
import { CodeExportView } from './CodeExportView';
import { ModuleGuideModal } from './ModuleGuideModal';

// Data imports
import modulesData from '../data/modules.json';
import exercisesData from '../data/exercises.json';
import specsData from '../data/specifications.json';
import examplesData from '../data/examples.json';

const DEFAULT_CODE_ES = `Proceso DemostracionGuiada
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

const DEFAULT_CODE_EN = `algorithm GuidedDemo
    define temperature as integer;
    define readings as integer;
    temperature <- 30;
    readings <- 0;
    while temperature > 24 do
        temperature <- temperature - 3;
        readings <- readings + 1;
        write "Reading ", readings, ": ", temperature, " degrees";
    endWhile
    write "Comfort reached after ", readings, " readings";
endAlgorithm
`;

const DEFAULT_CODE = DEFAULT_CODE_ES;

const formatExerciseKind = (kind: string, isEs: boolean) => {
  if (isEs) return kind;
  switch (kind) {
    case 'crear': return 'create';
    case 'completar': return 'complete';
    case 'modificar': return 'modify';
    case 'predecir': return 'predict';
    case 'depurar': return 'debug';
    default: return kind;
  }
};

// UI History limits to prevent unbounded React state growth during lengthy sessions
const MAX_UI_TRACE_STEPS = 1000;
const MAX_UI_CONSOLE_LOGS = 1000;

interface IDEViewProps {
  onBackToHome: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  lang: 'es' | 'en';
  onToggleLang: () => void;
  initialModuleId?: string;
}

export const IDEView: React.FC<IDEViewProps> = ({
  onBackToHome,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  initialModuleId
}) => {
  const isEs = lang === 'es';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Responsive layout modes
  const [desktopLayout, setDesktopLayout] = useState<'2-col' | '3-col' | '4-col'>(() => {
    const saved = safeStorageGet('pseudoflow-desktop-layout', '3-col');
    if (saved === '2-col' || saved === '3-col' || saved === '4-col') return saved;
    return '3-col';
  });
  const [mobileTab, setMobileTab] = useState<'code' | 'surfaces' | 'curriculum'>('code');
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isWordWrap, setIsWordWrap] = useState<boolean>(true);
  const [isConsoleCollapsedMobile, setIsConsoleCollapsedMobile] = useState<boolean>(false);
  const [isStatementCollapsedMobile, setIsStatementCollapsedMobile] = useState<boolean>(false);

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  // Track window resizing for smooth breakpoint switching
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSetDesktopLayout = (layout: '2-col' | '3-col' | '4-col') => {
    setDesktopLayout(layout);
    safeStorageSet('pseudoflow-desktop-layout', layout);
    if (layout !== '2-col') {
      setIsSidebarDrawerOpen(false);
    }
  };

  // Code state with resilient localStorage draft support
  const [code, setCode] = useState<string>(() => {
    return safeStorageGet('pseudoflow-draft-code', DEFAULT_CODE);
  });
  const [activeLine, setActiveLine] = useState<number | undefined>(undefined);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // AST and diagram states automatically derived from code (clean React 19 pattern)
  const { ast, flowchartData, structogramBlocks, syntaxError } = useMemo(() => {
    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const parsedAst = parser.parse();
      return {
        ast: parsedAst,
        flowchartData: generateFlowchart(parsedAst, lang),
        structogramBlocks: generateStructogram(parsedAst, lang),
        syntaxError: null
      };
    } catch (e: any) {
      return {
        ast: null,
        flowchartData: null,
        structogramBlocks: [] as StructogramBlock[],
        syntaxError: (e.message || String(e)) as string
      };
    }
  }, [code, lang]);


  // Execution state & isolated interactive session
  const sessionRef = useRef<InteractiveSession | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMs, setSpeedMs] = useState<number>(350);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [interactiveInput, setInteractiveInput] = useState<string>('');
  const [isWaitingInput, setIsWaitingInput] = useState<boolean>(false);

  // Initialize and tear down interactive session worker
  useEffect(() => {
    const session = new InteractiveSession();
    sessionRef.current = session;
    return () => {
      session.terminate();
    };
  }, []);

  // Sidebar and surface states
  const [activeSidebarTab, setActiveSidebarTab] = useState<'track' | 'specs' | 'examples'>('track');
  const [activeSurfaceTab, setActiveSurfaceTab] = useState<'flow' | 'ns' | 'trace' | 'uml' | 'export'>('flow');
  const [selectedExercise, setSelectedExercise] = useState<any | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => ({
    'CON-A2': true,
    'CON-B1': true,
    ...(initialModuleId ? { [initialModuleId]: true } : {})
  }));
  const [selectedGuideModule, setSelectedGuideModule] = useState<any | null>(() => {
    if (!initialModuleId) return null;
    const found = modulesData.find(m => m.id === initialModuleId);
    if (found && (found.id === 'CON-A1' || !exercisesData.some(e => e.module === found.id))) {
      return found;
    }
    return null;
  });
  const [testResults, setTestResults] = useState<{ passed: boolean; details: any[] } | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationProgress, setValidationProgress] = useState<ValidationProgress | null>(null);

  /**
   * Reset execution explicitly with the provided code string
   */
  const resetExecution = (targetCode?: string) => {
    setIsPlaying(false);
    setIsWaitingInput(false);
    setConsoleLogs([]);
    setTraceSteps([]);
    setCurrentStepIdx(-1);
    setActiveLine(undefined);
    setTestResults(null);
    setRuntimeError(null);

    const codeToRun = targetCode !== undefined ? targetCode : code;
    if (sessionRef.current) {
      sessionRef.current.reset(codeToRun).then(res => {
        if (res.success) {
          setCurrentSessionId(res.sessionId);
        } else {
          setCurrentSessionId(null);
          if (res.error) setRuntimeError(res.error);
        }
      });
    }
  };

  const handleToggleLanguage = () => {
    // If user hasn't edited the default starter code, switch it cleanly to the target language
    if (code.trim() === DEFAULT_CODE_ES.trim()) {
      setCode(DEFAULT_CODE_EN);
      resetExecution(DEFAULT_CODE_EN);
      safeStorageSet('pseudoflow-draft-code', DEFAULT_CODE_EN);
    } else if (code.trim() === DEFAULT_CODE_EN.trim()) {
      setCode(DEFAULT_CODE_ES);
      resetExecution(DEFAULT_CODE_ES);
      safeStorageSet('pseudoflow-draft-code', DEFAULT_CODE_ES);
    }
    onToggleLang();
  };

  const handleStepForward = async () => {
    const session = sessionRef.current;
    if (!session) return;
    let sId = currentSessionId;

    if (!sId) {
      try {
        const startRes = await session.start(code);
        if (!startRes.success) {
          if (startRes.error) setRuntimeError(startRes.error);
          return;
        }
        sId = startRes.sessionId;
        setCurrentSessionId(sId);
        setRuntimeError(null);
      } catch {
        return;
      }
    }

    const res = await session.step(sId);

    // Discard obsolete or cancelled session events (e.g. user reset or changed exercise while stepping)
    if (res.cancelled || res.sessionId !== session.getSessionId()) {
      return;
    }

    // Check if runtime error occurred in execution
    if (res.error) {
      setRuntimeError(res.error);
      setConsoleLogs(prev => {
        const next = [...prev, `[${isEs ? 'Error de ejecución' : 'Runtime error'}]: ${res.error}`];
        return next.length > MAX_UI_CONSOLE_LOGS ? next.slice(next.length - MAX_UI_CONSOLE_LOGS) : next;
      });
      setIsPlaying(false);
      setActiveLine(undefined);
      setIsConsoleCollapsedMobile(false);
      return;
    }

    if (res.isWaitingForInput) {
      setIsWaitingInput(true);
      setIsPlaying(false);
      setIsConsoleCollapsedMobile(false);
    }

    if (res.done || res.isFinished) {
      setIsPlaying(false);
      setActiveLine(undefined);
      return;
    }

    if (res.step) {
      const step = res.step;
      setActiveLine(step.lineNumber);
      setTraceSteps(prev => {
        const next = [...prev, step];
        return next.length > MAX_UI_TRACE_STEPS ? next.slice(next.length - MAX_UI_TRACE_STEPS) : next;
      });
      setCurrentStepIdx(prev => prev + 1);

      if (step.outputLog) {
        setConsoleLogs(prev => {
          const next = [...prev, step.outputLog!];
          return next.length > MAX_UI_CONSOLE_LOGS ? next.slice(next.length - MAX_UI_CONSOLE_LOGS) : next;
        });
      }
    }
  };

  const handleStartOrPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (!currentSessionId) {
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
    if (isPlaying && currentSessionId && !isWaitingInput) {
      timer = setTimeout(() => {
        stepForwardRef.current();
      }, speedMs);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isPlaying, currentSessionId, isWaitingInput, speedMs]);

  const handleSendInput = async (e: React.FormEvent) => {
    e.preventDefault();
    const session = sessionRef.current;
    const sId = currentSessionId;
    if (!session || !sId || !isWaitingInput) return;
    const inputRes = await session.provideInput(sId, interactiveInput);
    if (!inputRes.success) {
      if (inputRes.error) {
        setRuntimeError(inputRes.error);
      }
      return;
    }
    setIsWaitingInput(false);
    setConsoleLogs(prev => {
      const next = [...prev, `> ${interactiveInput === '' ? '""' : interactiveInput}`];
      return next.length > MAX_UI_CONSOLE_LOGS ? next.slice(next.length - MAX_UI_CONSOLE_LOGS) : next;
    });
    setInteractiveInput('');
    if (isPlaying) {
      setTimeout(handleStepForward, speedMs);
    }
  };

  // Run automated test suite for an exercise off the main thread
  const handleValidateExercise = async () => {
    if (!selectedExercise || isValidating) return;
    setIsPlaying(false);
    setIsConsoleCollapsedMobile(false);
    setIsValidating(true);
    setValidationProgress({
      current: 0,
      total: (selectedExercise.visibleCases?.length || 0) + (selectedExercise.hiddenCases?.length || 0)
    });

    try {
      const result = await runExerciseValidation(
        code,
        selectedExercise.visibleCases || [],
        selectedExercise.hiddenCases || [],
        (progress) => setValidationProgress(progress)
      );
      setTestResults(result);
    } catch (e: any) {
      setTestResults({
        passed: false,
        details: [{ index: 1, error: e.message || String(e), passed: false, isAdditional: false }]
      });
    } finally {
      setIsValidating(false);
      setValidationProgress(null);
    }
  };

  const handleCancelValidation = () => {
    cancelCurrentValidation();
    setIsValidating(false);
    setValidationProgress(null);
    setTestResults({
      passed: false,
      details: [{
        index: 1,
        error: isEs ? 'Validación detenida por el usuario.' : 'Validation stopped by user.',
        passed: false,
        isAdditional: false
      }]
    });
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
    const rawWords = (isEs ? ex.title_es : ex.title_en || ex.title_es)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
    const safeTitle = rawWords || (isEs ? 'Reto' : 'Challenge');
    const starterCode = isEs
      ? `Algoritmo Reto_${safeTitle}
    // Módulo: ${ex.module} - ${ex.title_es}
    // Reto: ${(ex.summary_es || '').split('\n')[0]}

    // Escribe tu algoritmo a continuación:

FinAlgoritmo
`
      : `algorithm Challenge_${safeTitle}
    // Module: ${ex.module} - ${ex.title_en || ex.title_es}
    // Challenge: ${(ex.summary_en || ex.summary_es || '').split('\n')[0]}

    // Write your algorithm below:

endAlgorithm
`;
    setCode(starterCode);
    resetExecution(starterCode);
    safeStorageSet('pseudoflow-draft-code', starterCode);
    setIsSidebarDrawerOpen(false);
    setMobileTab('code');
  };

  const handleLoadExerciseSolution = () => {
    if (!selectedExercise) return;
    const confirmMsg = isEs
      ? '¿Deseas cargar la solución de referencia en el editor? Se reemplazará el código actual.'
      : 'Load reference solution into the editor? Current code will be replaced.';
    if (window.confirm(confirmMsg)) {
      const defaultCode = isEs ? DEFAULT_CODE_ES : DEFAULT_CODE_EN;
      const solutionCode = isEs
        ? (selectedExercise.referenceSolution_es || defaultCode)
        : (selectedExercise.referenceSolution_en || selectedExercise.referenceSolution_es || defaultCode);
      setCode(solutionCode);
      resetExecution(solutionCode);
      safeStorageSet('pseudoflow-draft-code', solutionCode);
      setIsSidebarDrawerOpen(false);
      setMobileTab('code');
    }
  };

  const handleSelectExample = (ex: any) => {
    setSelectedExercise(null);
    setTestResults(null);
    const newCode = isEs ? ex.code_es : ex.code_en || ex.code_es;
    setCode(newCode);
    resetExecution(newCode);
    safeStorageSet('pseudoflow-draft-code', newCode);
    setIsSidebarDrawerOpen(false);
    setMobileTab('code');
  };

  const handleDownloadCode = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedExercise ? selectedExercise.id : 'programa'}.pseudo`;
    a.click();
    URL.revokeObjectURL(url);
    setIsMobileMenuOpen(false);
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
        safeStorageSet('pseudoflow-draft-code', content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
    setIsMobileMenuOpen(false);
  };

  const handleClearDraft = () => {
    const confirmMsg = isEs
      ? '¿Deseas restablecer el código al ejemplo inicial y borrar el borrador guardado en este navegador?'
      : 'Reset code to default example and clear the draft saved in this browser?';
    if (window.confirm(confirmMsg)) {
      safeStorageRemove('pseudoflow-draft-code');
      setSelectedExercise(null);
      const defaultCode = isEs ? DEFAULT_CODE_ES : DEFAULT_CODE_EN;
      setCode(defaultCode);
      resetExecution(defaultCode);
      setIsMobileMenuOpen(false);
    }
  };

  const handleResetScroll = () => {
    if (textareaRef.current) {
      textareaRef.current.scrollLeft = 0;
    }
  };

  const lineCount = code.split('\n').length;

  /**
   * Reusable Sidebar Content (Curriculum, Examples, Manual & Exercise Statement)
   */
  const renderSidebarContent = () => (
    <>
      <div className="ide-sidebar__tabs">
        <button
          type="button"
          className={`ide-sidebar__tab ${activeSidebarTab === 'track' ? 'ide-sidebar__tab--active' : ''}`}
          onClick={() => setActiveSidebarTab('track')}
        >
          {isEs ? 'Ruta (15)' : 'Track (15)'}
        </button>
        <button
          type="button"
          className={`ide-sidebar__tab ${activeSidebarTab === 'examples' ? 'ide-sidebar__tab--active' : ''}`}
          onClick={() => setActiveSidebarTab('examples')}
        >
          {isEs ? 'Ejemplos (86)' : 'Examples (86)'}
        </button>
        <button
          type="button"
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
                    <div
                      style={{
                        padding: '0.45rem 0.8rem',
                        borderBottom: '1px solid var(--pl-line-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--pl-sunken)'
                      }}
                    >
                      <span style={{ fontSize: '0.74rem', color: 'var(--pl-ink-2)' }}>
                        {isEs ? 'Guía teórica y modelo:' : 'Theory guide & model:'}
                      </span>
                      <button
                        type="button"
                        className="pl-btn pl-btn--outline pl-btn--sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGuideModule(mod);
                        }}
                      >
                        <BookOpen size={12} />
                        <span>{isEs ? 'Ver guía del tema' : 'View module guide'}</span>
                      </button>
                    </div>

                    {modExercises.length === 0 && (
                      <div style={{ padding: '0.8rem', fontSize: '0.78rem', color: 'var(--pl-ink-2)', lineHeight: 1.4 }}>
                        <p style={{ margin: '0 0 0.5rem 0' }}>
                          {isEs
                            ? 'Este módulo sienta las bases conceptuales sobre qué es un algoritmo. No requiere código en el editor; puedes estudiar la guía teórica completa con sus ejemplos.'
                            : 'This module establishes conceptual foundations. No editor exercises required; read the full theoretical guide with examples.'}
                        </p>
                        <button
                          type="button"
                          className="pl-btn pl-btn--primary pl-btn--sm"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => setSelectedGuideModule(mod)}
                        >
                          <BookOpen size={13} />
                          <span>{isEs ? 'Abrir guía teórica de CON-A1' : 'Open CON-A1 guide'}</span>
                        </button>
                      </div>
                    )}

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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem', flex: 1, paddingRight: '0.4rem' }}>
                              {isEs ? ex.title_es : ex.title_en || ex.title_es}
                            </span>
                            <span
                              className="pl-mono"
                              style={{
                                fontSize: '0.7rem',
                                background: ex.level === 1 ? '#dcfce7' : ex.level === 2 ? '#fef3c7' : '#fee2e2',
                                color: '#1e293b',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                alignSelf: 'center'
                              }}
                            >
                              N{ex.level} · {formatExerciseKind(ex.kind, isEs)}
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
        <div style={{ borderTop: '1px solid var(--pl-line)', background: 'var(--pl-sunken)', flexShrink: 0 }}>
          <div
            style={{
              padding: '0.5rem 0.8rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: isMobile ? 'pointer' : 'default',
              borderBottom: isStatementCollapsedMobile ? 'none' : '1px solid var(--pl-line-soft)'
            }}
            onClick={isMobile ? () => setIsStatementCollapsedMobile(prev => !prev) : undefined}
          >
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--pl-brand)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {isMobile && (isStatementCollapsedMobile ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
              <span>{isEs ? 'Enunciado del reto' : 'Challenge Statement'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                className="pl-btn pl-btn--outline pl-btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  const currentMod = modulesData.find(m => m.id === selectedExercise.module);
                  if (currentMod) setSelectedGuideModule(currentMod);
                }}
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                title={isEs ? 'Ver guía teórica de este módulo' : 'View module theory guide'}
              >
                <BookOpen size={12} />
                <span>{isEs ? 'Teoría' : 'Theory'}</span>
              </button>
              <button
                type="button"
                className="pl-btn pl-btn--outline pl-btn--sm"
                onClick={(e) => { e.stopPropagation(); handleLoadExerciseSolution(); }}
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                title={isEs ? 'Cargar solución de referencia en el editor' : 'Load reference solution into editor'}
              >
                <BookOpen size={12} />
                <span>{isEs ? 'Solución' : 'Solution'}</span>
              </button>
            </div>
          </div>

          {!isStatementCollapsedMobile && (
            <div style={{ padding: '0.75rem 0.8rem', maxHeight: '180px', overflowY: 'auto' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--pl-ink)', lineHeight: 1.4 }}>
                {isEs ? selectedExercise.statement_es : selectedExercise.statement_en || selectedExercise.statement_es}
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: 'var(--pl-ink-2)' }}>
                {selectedExercise.visibleCases?.length || 0} {isEs ? 'formativos' : 'formative'} · {selectedExercise.hiddenCases?.length || 0} {isEs ? 'adicionales' : 'additional'}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  /**
   * Reusable Editor Component (Error banners + Gutter + Code Textarea)
   */
  const renderEditor = () => (
    <>
      {syntaxError && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span><strong>{isEs ? 'Error sintáctico:' : 'Syntax Error:'}</strong> {syntaxError}</span>
        </div>
      )}

      {runtimeError && (
        <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderBottom: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span><strong>{isEs ? 'Error de ejecución:' : 'Runtime Error:'}</strong> {runtimeError}</span>
          </div>
          <button
            type="button"
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={() => resetExecution()}
            style={{ borderColor: '#fca5a5', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
          >
            {isEs ? 'Reiniciar' : 'Reset'}
          </button>
        </div>
      )}

      {/* Editor Sub-header with Word-Wrap & Scroll-Reset options */}
      <div className="ide-editor-bar">
        <span className="pl-mono" style={{ fontSize: '0.74rem', color: 'var(--pl-ink-2)' }}>
          {lineCount} {isEs ? 'líneas' : 'lines'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            className={`ide-mini-btn ${isWordWrap ? 'ide-mini-btn--active' : ''}`}
            onClick={() => setIsWordWrap(prev => !prev)}
            title={isWordWrap ? (isEs ? 'Desactivar ajuste de línea' : 'Disable word wrap') : (isEs ? 'Ajustar líneas al ancho' : 'Wrap lines')}
          >
            <WrapText size={12} />
            <span>{isWordWrap ? (isEs ? 'Ajustado' : 'Wrapped') : (isEs ? 'Sin ajuste' : 'No wrap')}</span>
          </button>
          {!isWordWrap && (
            <button
              type="button"
              className="ide-mini-btn"
              onClick={handleResetScroll}
              title={isEs ? 'Desplazar al inicio de línea' : 'Scroll to start of lines'}
            >
              <ArrowLeftToLine size={12} />
              <span>{isEs ? 'Inicio' : 'Start'}</span>
            </button>
          )}
        </div>
      </div>

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
          ref={textareaRef}
          className="ide-editor-textarea"
          style={{
            whiteSpace: isWordWrap ? 'pre-wrap' : 'pre',
            wordBreak: isWordWrap ? 'break-word' : 'normal'
          }}
          value={code}
          onChange={e => {
            const newCode = e.target.value;
            setCode(newCode);
            setIsPlaying(false);
            setIsWaitingInput(false);
            setActiveLine(undefined);
            sessionRef.current?.stop();
            setCurrentSessionId(null);
            setRuntimeError(null);
            safeStorageSet('pseudoflow-draft-code', newCode);
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label={isEs ? 'Editor de pseudocódigo interactivo' : 'Interactive pseudocode code editor'}
        />
      </div>
    </>
  );

  /**
   * Reusable Console / Terminal Component
   */
  const renderConsole = () => (
    <div className={`ide-console-container ${isConsoleCollapsedMobile && isMobile ? 'ide-console-container--collapsed' : ''}`}>
      <div
        className="ide-console-header"
        onClick={isMobile ? () => setIsConsoleCollapsedMobile(prev => !prev) : undefined}
        style={{ cursor: isMobile ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Terminal size={14} />
          <span>{isEs ? 'Consola E/S & Validación' : 'I/O Console & Testing'}</span>
          {isMobile && (
            <span style={{ fontSize: '0.72rem', color: 'var(--pl-brand)', marginLeft: '0.3rem', fontWeight: 500 }}>
              {isConsoleCollapsedMobile ? (isEs ? '(Expandir ▴)' : '(Expand ▴)') : (isEs ? '(Minimizar ▾)' : '(Collapse ▾)')}
            </span>
          )}
        </div>
        <button
          type="button"
          style={{ background: 'transparent', border: 'none', color: 'var(--pl-ink-2)', cursor: 'pointer', fontSize: '0.78rem' }}
          onClick={(e) => { e.stopPropagation(); setConsoleLogs([]); }}
        >
          {isEs ? 'Limpiar' : 'Clear'}
        </button>
      </div>

      {(!isConsoleCollapsedMobile || !isMobile) && (
        <>
          <div className="ide-console-body">
            {isValidating && (
              <div
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.65rem 0.8rem',
                  borderRadius: '6px',
                  background: 'var(--pl-sunken)',
                  border: '1px solid var(--pl-line)',
                  color: 'var(--pl-brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.55rem',
                  fontSize: '0.82rem',
                  fontWeight: 500
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <RotateCcw size={15} className="pl-spin" aria-hidden="true" />
                  <span>
                    {isEs
                      ? validationProgress && validationProgress.current > 0
                        ? `Evaluando caso ${validationProgress.current} de ${validationProgress.total} en segundo plano...`
                        : 'Iniciando validación en segundo plano...'
                      : validationProgress && validationProgress.current > 0
                        ? `Evaluating case ${validationProgress.current} of ${validationProgress.total} in background...`
                        : 'Starting background validation...'}
                  </span>
                </div>
                <button
                  type="button"
                  className="pl-btn pl-btn--outline pl-btn--sm"
                  style={{ padding: '0.15rem 0.55rem', fontSize: '0.74rem', borderColor: 'var(--pl-brand)' }}
                  onClick={handleCancelValidation}
                  title={isEs ? 'Detener validación' : 'Stop validation'}
                >
                  {isEs ? 'Detener' : 'Stop'}
                </button>
              </div>
            )}

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {testResults.passed ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    <span>
                      {testResults.passed
                        ? (isEs ? '¡Pruebas superadas con éxito!' : 'Tests passed successfully!')
                        : (isEs ? 'Pruebas no superadas' : 'Tests failed')}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.9, background: 'rgba(0,0,0,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                    {isEs ? 'Formativo' : 'Formative'}
                  </span>
                </div>
                {testResults.details.map((d: any) => (
                  <div
                    key={d.index}
                    style={{
                      fontSize: '0.78rem',
                      marginTop: '0.25rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.35rem',
                      alignItems: 'baseline'
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {isEs ? 'Caso' : 'Case'} {d.index} {d.isAdditional ? (isEs ? '(adicional)' : '(additional)') : ''}:
                    </span>
                    {d.passed ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>{isEs ? '✓ Correcto' : '✓ Passed'}</span>
                    ) : (
                      <span>
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>{isEs ? '✗ Error' : '✗ Failed'}.</span>
                        <span className="pl-mono" style={{ marginLeft: '0.35rem', opacity: 0.9 }}>
                          {isEs ? 'Salida' : 'Actual'}: [{d.actualOutputs?.join(', ')}], {isEs ? 'esperada' : 'expected'}: [{d.expectedOutputs?.join(', ')}]
                          {d.error ? ` (${d.error})` : ''}
                        </span>
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: '0.68rem', marginTop: '0.45rem', opacity: 0.8, fontStyle: 'italic', borderTop: `1px solid ${testResults.passed ? '#a7f3d0' : '#fecaca'}`, paddingTop: '0.3rem' }}>
                  {isEs
                    ? 'Evaluación formativa local en el navegador (casos de comprobación didáctica, no confidenciales).'
                    : 'Local formative assessment in the browser (educational verification cases, not confidential).'}
                </div>
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
                [{isEs ? 'Esperando entrada para sentencia Leer...' : 'Waiting for user input for Leer...'}]
              </div>
            )}
          </div>

          {isWaitingInput && (
            <form onSubmit={handleSendInput} className="ide-console-input-row">
              <input
                type="text"
                className="ide-console-input"
                placeholder={isEs ? 'Introduce valor y pulsa Enviar...' : 'Type value and press Send...'}
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
        </>
      )}
    </div>
  );

  /**
   * Reusable Diagram Surfaces Component
   */
  const renderSurfaces = (includeTraceTab: boolean = true) => {
    const effectiveTab = (!includeTraceTab && activeSurfaceTab === 'trace') ? 'flow' : activeSurfaceTab;

    return (
      <>
        <div className="ide-surfaces-nav" role="tablist" aria-label={isEs ? 'Pestañas de visualización y diagramas' : 'Visualization and diagram tabs'}>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'flow'}
            className={`ide-surface-tab ${effectiveTab === 'flow' ? 'ide-surface-tab--active' : ''}`}
            onClick={() => setActiveSurfaceTab('flow')}
          >
            <GitBranch size={14} />
            <span>{isEs ? 'Ordinograma' : 'Flowchart'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'ns'}
            className={`ide-surface-tab ${effectiveTab === 'ns' ? 'ide-surface-tab--active' : ''}`}
            onClick={() => setActiveSurfaceTab('ns')}
          >
            <Layers size={14} />
            <span>{isEs ? 'Estructograma' : 'Structogram'}</span>
          </button>
          {includeTraceTab && (
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'trace'}
              className={`ide-surface-tab ${effectiveTab === 'trace' ? 'ide-surface-tab--active' : ''}`}
              onClick={() => setActiveSurfaceTab('trace')}
            >
              <Table size={14} />
              <span>{isEs ? 'Prueba de Escritorio' : 'Trace Table'}</span>
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'uml'}
            className={`ide-surface-tab ${effectiveTab === 'uml' ? 'ide-surface-tab--active' : ''}`}
            onClick={() => setActiveSurfaceTab('uml')}
          >
            <Box size={14} />
            <span>{isEs ? 'Clases UML' : 'UML Classes'}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'export'}
            className={`ide-surface-tab ${effectiveTab === 'export' ? 'ide-surface-tab--active' : ''}`}
            onClick={() => setActiveSurfaceTab('export')}
          >
            <Code2 size={14} />
            <span>Python & Rust</span>
          </button>
        </div>

        <div className="ide-surface-content">
          {syntaxError && (effectiveTab === 'flow' || effectiveTab === 'ns' || effectiveTab === 'uml') && (
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--pl-ink-2)' }}>
              <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                <AlertCircle size={20} />
                <span>{isEs ? 'Diagrama no disponible por error sintáctico' : 'Diagram unavailable due to syntax error'}</span>
              </div>
              <p style={{ fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
                {isEs
                  ? 'Corrige el código en el editor para sincronizar el diagrama automáticamente.'
                  : 'Fix the code in the editor to automatically regenerate the diagram.'}
              </p>
            </div>
          )}

          {!syntaxError && effectiveTab === 'flow' && (
            <FlowchartView data={flowchartData} activeLine={activeLine} lang={lang} />
          )}

          {!syntaxError && effectiveTab === 'ns' && (
            <StructogramView blocks={structogramBlocks} activeLine={activeLine} lang={lang} />
          )}

          {includeTraceTab && effectiveTab === 'trace' && (
            <TraceTableView steps={traceSteps} currentStepIndex={currentStepIdx} lang={lang} />
          )}

          {!syntaxError && effectiveTab === 'uml' && (
            <UmlClassView classes={ast?.classes || []} lang={lang} />
          )}

          {effectiveTab === 'export' && (
            <CodeExportView code={code} lang={lang} />
          )}
        </div>
      </>
    );
  };

  return (
    <div className="ide-wrapper">
      {/* Top Navbar / Control Bar */}
      <div className="ide-toolbar">
        {/* Left: Home + 2-col drawer toggle + Title */}
        <div className="ide-toolbar__group">
          <button
            type="button"
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={onBackToHome}
            title={isEs ? 'Volver al inicio' : 'Back to Home'}
            aria-label={isEs ? 'Volver al inicio' : 'Back to Home'}
          >
            <Home size={15} aria-hidden="true" />
            <span className="ide-btn-label-desktop">{isEs ? 'Inicio' : 'Home'}</span>
          </button>

          {desktopLayout === '2-col' && !isMobile && (
            <button
              type="button"
              className={`pl-btn pl-btn--sm ${isSidebarDrawerOpen ? 'pl-btn--primary' : 'pl-btn--outline'}`}
              onClick={() => setIsSidebarDrawerOpen(prev => !prev)}
              title={isEs ? 'Mostrar/Ocultar Módulos y Retos' : 'Toggle Modules & Challenges'}
            >
              <PanelLeft size={14} />
              <span>{isEs ? 'Retos' : 'Track'}</span>
            </button>
          )}

          <span className="pl-mono ide-title-pill" style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--pl-brand)' }}>
            {selectedExercise ? (isEs ? selectedExercise.title_es : selectedExercise.title_en || selectedExercise.title_es) : 'PseudoFlow IDE'}
          </span>
        </div>

        {/* Center on Desktop: Playback Controls & File Actions (HIDDEN on Mobile to save 140px vertical space) */}
        {!isMobile && (
          <div className="ide-toolbar__group ide-toolbar__group--center">
            <button
              type="button"
              className={`pl-btn pl-btn--sm ${isPlaying ? 'pl-btn--outline' : 'pl-btn--primary'}`}
              onClick={handleStartOrPause}
              title={isPlaying ? (isEs ? 'Pausar' : 'Pause') : (isEs ? 'Ejecutar' : 'Run')}
              aria-label={isPlaying ? (isEs ? 'Pausar ejecución' : 'Pause execution') : (isEs ? 'Ejecutar pseudocódigo' : 'Run pseudocode')}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
              <span>{isPlaying ? (isEs ? 'Pausar' : 'Pause') : (isEs ? 'Ejecutar' : 'Run')}</span>
            </button>

            <button
              type="button"
              className="pl-btn pl-btn--outline pl-btn--sm"
              onClick={handleStepForward}
              title={isEs ? 'Avanzar 1 sentencia' : 'Step 1 statement'}
              aria-label={isEs ? 'Avanzar una sentencia' : 'Step forward one statement'}
            >
              <StepForward size={14} />
              <span>{isEs ? 'Paso' : 'Step'}</span>
            </button>

            <button
              type="button"
              className="pl-btn pl-btn--outline pl-btn--sm"
              onClick={() => resetExecution()}
              title={isEs ? 'Reiniciar ejecución' : 'Reset execution'}
              aria-label={isEs ? 'Reiniciar ejecución' : 'Reset execution'}
            >
              <RotateCcw size={14} />
              <span>{isEs ? 'Reiniciar' : 'Reset'}</span>
            </button>

            <div className="ide-speed-control" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--pl-ink-2)' }}>
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
                aria-label={isEs ? 'Velocidad de ejecución' : 'Execution speed'}
              >
                <option value={700}>0.5x ({isEs ? 'Lento' : 'Slow'})</option>
                <option value={350}>1x ({isEs ? 'Normal' : 'Normal'})</option>
                <option value={150}>2x ({isEs ? 'Rápido' : 'Fast'})</option>
                <option value={30}>Max ({isEs ? 'Ráfaga' : 'Burst'})</option>
              </select>
            </div>

            {selectedExercise && (
              <button
                type="button"
                className="pl-btn pl-btn--sm"
                style={{ background: 'var(--pl-syn-str)', color: '#fff', opacity: isValidating ? 0.85 : 1 }}
                onClick={handleValidateExercise}
                disabled={isValidating}
                title={isEs ? 'Evaluar con casos de prueba' : 'Validate test cases'}
              >
                {isValidating ? (
                  <>
                    <RotateCcw size={14} className="pl-spin" aria-hidden="true" />
                    <span>
                      {isEs
                        ? validationProgress && validationProgress.current > 0
                          ? `Evaluando (${validationProgress.current}/${validationProgress.total})...`
                          : 'Evaluando...'
                        : validationProgress && validationProgress.current > 0
                          ? `Checking (${validationProgress.current}/${validationProgress.total})...`
                          : 'Checking...'}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} aria-hidden="true" />
                    <span>{isEs ? 'Comprobar' : 'Check'}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              className="pl-btn pl-btn--outline pl-btn--sm"
              onClick={handleDownloadCode}
              title={isEs ? 'Descargar código (.pseudo)' : 'Download code (.pseudo)'}
            >
              <Download size={14} />
              <span className="ide-btn-label-responsive">{isEs ? 'Descargar' : 'Download'}</span>
            </button>

            <button
              type="button"
              className="pl-btn pl-btn--outline pl-btn--sm"
              onClick={() => fileInputRef.current?.click()}
              title={isEs ? 'Abrir archivo local (.pseudo, .txt, .psc)' : 'Open local code file (.pseudo, .txt, .psc)'}
            >
              <Upload size={14} />
              <span className="ide-btn-label-responsive">{isEs ? 'Abrir' : 'Open'}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadFile}
              accept=".pseudo,.txt,.psc"
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="pl-btn pl-btn--outline pl-btn--sm"
              onClick={handleClearDraft}
              title={isEs ? 'Restablecer al ejemplo inicial' : 'Reset to default code'}
            >
              <Trash2 size={14} />
              <span className="ide-btn-label-responsive">{isEs ? 'Restablecer' : 'Clear'}</span>
            </button>
          </div>
        )}

        {/* Right: Actions, Layout Switcher & Toggles */}
        <div className="ide-toolbar__group">
          {/* Quick Validate Button on Mobile when an exercise is active */}
          {isMobile && selectedExercise && (
            <button
              type="button"
              className="pl-btn pl-btn--sm"
              style={{ background: 'var(--pl-syn-str)', color: '#fff', padding: '0.3rem 0.55rem', opacity: isValidating ? 0.85 : 1 }}
              onClick={handleValidateExercise}
              disabled={isValidating}
              title={isEs ? 'Evaluar reto' : 'Validate challenge'}
            >
              {isValidating ? (
                <>
                  <RotateCcw size={13} className="pl-spin" aria-hidden="true" />
                  <span>{isEs ? 'Evaluando...' : 'Checking...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle size={13} aria-hidden="true" />
                  <span>{isEs ? 'Evaluar' : 'Check'}</span>
                </>
              )}
            </button>
          )}

          {/* Mobile Secondary Options Menu Trigger */}
          {isMobile && (
            <button
              type="button"
              className={`pl-icon-btn ${isMobileMenuOpen ? 'pl-icon-btn--active' : ''}`}
              onClick={() => setIsMobileMenuOpen(prev => !prev)}
              title={isEs ? 'Opciones adicionales' : 'More options'}
              aria-label={isEs ? 'Opciones adicionales' : 'More options'}
            >
              <Settings size={16} aria-hidden="true" />
            </button>
          )}

          {/* Desktop Multi-column Layout Switcher */}
          {!isMobile && (
            <div className="ide-layout-switch" role="group" aria-label={isEs ? 'Distribución de columnas' : 'Column layout'}>
              <button
                type="button"
                className={`ide-layout-btn ${desktopLayout === '2-col' ? 'ide-layout-btn--active' : ''}`}
                onClick={() => handleSetDesktopLayout('2-col')}
                title={isEs ? '2 Columnas: Editor y Vistas amplias' : '2 Columns: Spacious Editor & Views'}
              >
                <Columns2 size={14} />
                <span className="ide-layout-btn__text">2</span>
              </button>
              <button
                type="button"
                className={`ide-layout-btn ${desktopLayout === '3-col' ? 'ide-layout-btn--active' : ''}`}
                onClick={() => handleSetDesktopLayout('3-col')}
                title={isEs ? '3 Columnas: Ruta, Editor y Vistas' : '3 Columns: Track, Editor & Views'}
              >
                <Columns3 size={14} />
                <span className="ide-layout-btn__text">3</span>
              </button>
              <button
                type="button"
                className={`ide-layout-btn ${desktopLayout === '4-col' ? 'ide-layout-btn--active' : ''}`}
                onClick={() => handleSetDesktopLayout('4-col')}
                title={isEs ? '4 Columnas: Ruta, Editor, Consola/Traza y Diagrama' : '4 Columns: Track, Editor, Console/Trace & Diagram'}
              >
                <Columns4 size={14} />
                <span className="ide-layout-btn__text">4</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className="pl-icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? (isEs ? 'Cambiar a tema claro' : 'Switch to light theme') : (isEs ? 'Cambiar a tema oscuro' : 'Switch to dark theme')}
            aria-label={theme === 'dark' ? (isEs ? 'Cambiar a tema claro' : 'Switch to light theme') : (isEs ? 'Cambiar a tema oscuro' : 'Switch to dark theme')}
          >
            {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleToggleLanguage}
            style={{ minWidth: 34, padding: '0.28rem 0.45rem' }}
            title={isEs ? 'Cambiar a inglés (EN)' : 'Switch to Spanish (ES)'}
            aria-label={isEs ? 'Cambiar idioma a inglés' : 'Switch language to Spanish'}
          >
            {isEs ? 'EN' : 'ES'}
          </button>
        </div>
      </div>

      {/* Mobile Secondary Options Popover / Sheet */}
      {isMobile && isMobileMenuOpen && (
        <>
          <div className="ide-drawer-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="ide-mobile-menu">
            <div className="ide-mobile-menu__header">
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{isEs ? 'Opciones del Editor' : 'Editor Options'}</span>
              <button
                type="button"
                className="pl-icon-btn"
                onClick={() => setIsMobileMenuOpen(false)}
                title={isEs ? 'Cerrar opciones' : 'Close options'}
                aria-label={isEs ? 'Cerrar opciones' : 'Close options'}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="ide-mobile-menu__body">
              <div className="ide-mobile-menu__row">
                <span>{isEs ? 'Velocidad de ejecución:' : 'Execution speed:'}</span>
                <select
                  value={speedMs}
                  onChange={e => setSpeedMs(Number(e.target.value))}
                  style={{
                    background: 'var(--pl-sunken)',
                    border: '1px solid var(--pl-line)',
                    color: 'var(--pl-ink)',
                    borderRadius: '4px',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                >
                  <option value={700}>0.5x ({isEs ? 'Lento' : 'Slow'})</option>
                  <option value={350}>1x ({isEs ? 'Normal' : 'Normal'})</option>
                  <option value={150}>2x ({isEs ? 'Rápido' : 'Fast'})</option>
                  <option value={30}>Max ({isEs ? 'Ráfaga' : 'Burst'})</option>
                </select>
              </div>

              <div className="ide-mobile-menu__row">
                <span>{isEs ? 'Idioma de interfaz:' : 'Interface language:'}</span>
                <button
                  type="button"
                  className="pl-btn pl-btn--outline pl-btn--sm"
                  onClick={handleToggleLanguage}
                  style={{ minWidth: 44, padding: '0.25rem 0.6rem' }}
                  title={isEs ? 'Cambiar a inglés' : 'Switch to Spanish'}
                >
                  {isEs ? 'EN' : 'ES'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  className="pl-btn pl-btn--outline pl-btn--sm"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={handleDownloadCode}
                >
                  <Download size={14} />
                  <span>{isEs ? 'Descargar código (.pseudo)' : 'Download code (.pseudo)'}</span>
                </button>

                <button
                  type="button"
                  className="pl-btn pl-btn--outline pl-btn--sm"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  <span>{isEs ? 'Abrir archivo local' : 'Open local file'}</span>
                </button>

                <button
                  type="button"
                  className="pl-btn pl-btn--outline pl-btn--sm"
                  style={{ justifyContent: 'flex-start', color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={handleClearDraft}
                >
                  <Trash2 size={14} />
                  <span>{isEs ? 'Restablecer al código inicial' : 'Reset to starter code'}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mobile Navigation Tabs (< 1024px) */}
      <nav className="ide-mobile-tabs" role="tablist" aria-label={isEs ? 'Navegación de secciones móvil' : 'Mobile sections navigation'}>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'code'}
          className={`ide-mobile-tab ${mobileTab === 'code' ? 'ide-mobile-tab--active' : ''}`}
          onClick={() => setMobileTab('code')}
        >
          <Code2 size={16} />
          <span>{isEs ? 'Código' : 'Code'}</span>
          {syntaxError && <span className="ide-tab-badge ide-tab-badge--error" title={syntaxError}>!</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'surfaces'}
          className={`ide-mobile-tab ${mobileTab === 'surfaces' ? 'ide-mobile-tab--active' : ''}`}
          onClick={() => setMobileTab('surfaces')}
        >
          <GitBranch size={16} />
          <span>{isEs ? 'Vistas' : 'Views'}</span>
          {activeLine !== undefined && (
            <span className="ide-tab-badge ide-tab-badge--active-run" title={isEs ? `Línea ${activeLine}` : `Line ${activeLine}`}>
              L{activeLine}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'curriculum'}
          className={`ide-mobile-tab ${mobileTab === 'curriculum' ? 'ide-mobile-tab--active' : ''}`}
          onClick={() => setMobileTab('curriculum')}
        >
          <BookOpen size={16} />
          <span>{isEs ? 'Retos' : 'Track'}</span>
          {selectedExercise && (
            <span className="ide-tab-badge ide-tab-badge--info" title={selectedExercise.id}>
              ✓
            </span>
          )}
        </button>
      </nav>

      {/* 2-Column Mode: Modal Drawer Backdrop & Slide-out Sidebar */}
      {desktopLayout === '2-col' && !isMobile && isSidebarDrawerOpen && (
        <>
          <div className="ide-drawer-backdrop" onClick={() => setIsSidebarDrawerOpen(false)} />
          <aside className="ide-sidebar ide-sidebar--drawer">
            <div className="ide-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <BookOpen size={16} style={{ color: 'var(--pl-brand)' }} />
                <span>{isEs ? 'Módulos y Retos' : 'Modules & Challenges'}</span>
              </div>
              <button
                type="button"
                className="pl-icon-btn"
                onClick={() => setIsSidebarDrawerOpen(false)}
                title={isEs ? 'Cerrar panel' : 'Close panel'}
                aria-label={isEs ? 'Cerrar panel de módulos y retos' : 'Close challenges panel'}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {renderSidebarContent()}
          </aside>
        </>
      )}

      {/* Main IDE Area */}
      <div className={`ide-main ide-main--layout-${desktopLayout} ide-main--mobile-${mobileTab}`}>
        {/* On Mobile: Single-pane conditional display with responsive tabs */}
        {isMobile ? (
          <>
            {mobileTab === 'curriculum' && (
              <aside className="ide-sidebar ide-sidebar--mobile-active">
                {renderSidebarContent()}
              </aside>
            )}

            {mobileTab === 'code' && (
              <section className="ide-center ide-center--mobile-active">
                {renderEditor()}
                {renderConsole()}
              </section>
            )}

            {mobileTab === 'surfaces' && (
              <section className="ide-surfaces ide-surfaces--mobile-active">
                {renderSurfaces(true)}
              </section>
            )}
          </>
        ) : (
          /* On Desktop: 2, 3 or 4 Columns */
          <>
            {/* Column 1: Sidebar (Track/Examples/Specs) - In 2-col mode it is opened via drawer above */}
            {desktopLayout !== '2-col' && (
              <aside className="ide-sidebar">
                {renderSidebarContent()}
              </aside>
            )}

            {/* In 4-Column Mode: Editor, Live Execution (Console + Trace), and Visual Diagram */}
            {desktopLayout === '4-col' ? (
              <>
                {/* Column 2: Editor */}
                <section className="ide-col-editor">
                  {renderEditor()}
                </section>

                {/* Column 3: Live Execution (Console + Trace Table) */}
                <section className="ide-col-execution">
                  <div className="ide-col-execution__console">
                    {renderConsole()}
                  </div>
                  <div className="ide-col-execution__trace">
                    <div className="ide-col-execution__trace-header">
                      <Table size={14} />
                      <span>{isEs ? 'Prueba de Escritorio en Vivo' : 'Live Desk Trace'}</span>
                      {traceSteps.length > 0 && (
                        <span className="pl-mono" style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--pl-ink-2)' }}>
                          {traceSteps.length} {isEs ? 'pasos' : 'steps'}
                        </span>
                      )}
                    </div>
                    <div className="ide-trace-container">
                      <TraceTableView steps={traceSteps} currentStepIndex={currentStepIdx} lang={lang} />
                    </div>
                  </div>
                </section>

                {/* Column 4: Visual Diagrams (Flowchart, Structogram, UML, Export) */}
                <section className="ide-col-visual">
                  {renderSurfaces(false)}
                </section>
              </>
            ) : (
              /* In 2-Column or 3-Column Mode: Standard Center (Editor + Console) and Surfaces */
              <>
                <section className="ide-center">
                  {renderEditor()}
                  {renderConsole()}
                </section>

                <section className="ide-surfaces">
                  {renderSurfaces(true)}
                </section>
              </>
            )}
          </>
        )}
      </div>

      {/* Mobile Persistent Floating Execution Bar */}
      <div className="ide-mobile-action-bar">
        <div className="ide-mobile-action-bar__controls">
          <button
            type="button"
            className={`pl-btn pl-btn--sm ${isPlaying ? 'pl-btn--outline' : 'pl-btn--primary'}`}
            onClick={handleStartOrPause}
            title={isPlaying ? (isEs ? 'Pausar' : 'Pause') : (isEs ? 'Ejecutar' : 'Run')}
            aria-label={isPlaying ? (isEs ? 'Pausar ejecución' : 'Pause execution') : (isEs ? 'Ejecutar pseudocódigo' : 'Run pseudocode')}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
            <span>{isPlaying ? (isEs ? 'Pausar' : 'Pause') : (isEs ? 'Ejecutar' : 'Run')}</span>
          </button>
          <button
            type="button"
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={handleStepForward}
            title={isEs ? 'Avanzar 1 sentencia' : 'Step'}
            aria-label={isEs ? 'Avanzar una sentencia' : 'Step forward one statement'}
          >
            <StepForward size={14} />
            <span>{isEs ? 'Paso' : 'Step'}</span>
          </button>
          <button
            type="button"
            className="pl-btn pl-btn--outline pl-btn--sm"
            onClick={() => resetExecution()}
            title={isEs ? 'Reiniciar' : 'Reset'}
            aria-label={isEs ? 'Reiniciar ejecución' : 'Reset execution'}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="ide-mobile-action-bar__status">
          {activeLine !== undefined ? (
            <span className="ide-pill ide-pill--active">
              <span className="ide-pill__dot"></span>
              {isEs ? `Línea ${activeLine}` : `Line ${activeLine}`}
            </span>
          ) : isWaitingInput ? (
            <span className="ide-pill ide-pill--warning">
              {isEs ? 'Esperando dato' : 'Waiting input'}
            </span>
          ) : isPlaying ? (
            <span className="ide-pill ide-pill--active">
              {isEs ? 'Ejecutando...' : 'Running...'}
            </span>
          ) : (
            <span className="ide-pill">
              {isEs ? 'Listo' : 'Ready'}
            </span>
          )}
        </div>
      </div>

      {/* Module Guide Modal */}
      {selectedGuideModule && (
        <ModuleGuideModal
          module={selectedGuideModule}
          isOpen={Boolean(selectedGuideModule)}
          onClose={() => setSelectedGuideModule(null)}
          lang={lang}
          onLoadCode={(snippet, _title) => {
            setCode(snippet);
            resetExecution(snippet);
            safeStorageSet('pseudoflow-draft-code', snippet);
            setSelectedExercise(null);
            setTestResults(null);
            setIsSidebarDrawerOpen(false);
            setMobileTab('code');
          }}
          onNavigateModule={(dir) => {
            const idx = modulesData.findIndex(m => m.id === selectedGuideModule.id);
            if (dir === 'prev' && idx > 0) {
              setSelectedGuideModule(modulesData[idx - 1]);
            } else if (dir === 'next' && idx < modulesData.length - 1) {
              setSelectedGuideModule(modulesData[idx + 1]);
            }
          }}
          hasPrev={modulesData.findIndex(m => m.id === selectedGuideModule.id) > 0}
          hasNext={modulesData.findIndex(m => m.id === selectedGuideModule.id) < modulesData.length - 1}
        />
      )}
    </div>
  );
};

export default IDEView;
