import React from 'react';
import { Play, ArrowRight, Sun, Moon } from 'lucide-react';

interface LandingPageProps {
  onOpenIDE: (moduleId?: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  lang: 'es' | 'en';
  onToggleLang: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenIDE,
  theme,
  onToggleTheme,
  lang,
  onToggleLang
}) => {
  const isEs = lang === 'es';

  return (
    <div>
      {/* Header */}
      <header className="site-header">
        <div className="pl-container site-header__row">
          <a
            href="#main-content"
            className="site-header__brand"
            aria-label={isEs ? 'PseudoFlow - Inicio' : 'PseudoFlow - Home'}
            onClick={e => { e.preventDefault(); }}
          >
            <svg viewBox="0 1 95 95" width="28" height="28" className="site-header__symbol" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M 10,79 H 36 A 7,7 0 0 1 43,86 V 86 A 7,7 0 0 1 36,93 H 10 A 7,7 0 0 1 3,86 V 86 A 7,7 0 0 1 10,79 Z M 36,53 H 36 A 7,7 0 0 1 43,60 V 86 A 7,7 0 0 1 36,93 H 36 A 7,7 0 0 1 29,86 V 60 A 7,7 0 0 1 36,53 Z M 36,53 H 62 A 7,7 0 0 1 69,60 V 60 A 7,7 0 0 1 62,67 H 36 A 7,7 0 0 1 29,60 V 60 A 7,7 0 0 1 36,53 Z M 62,27 H 62 A 7,7 0 0 1 69,34 V 60 A 7,7 0 0 1 62,67 H 62 A 7,7 0 0 1 55,60 V 34 A 7,7 0 0 1 62,27 Z M 62,27 H 88 A 7,7 0 0 1 95,34 V 34 A 7,7 0 0 1 88,41 H 62 A 7,7 0 0 1 55,34 V 34 A 7,7 0 0 1 62,27 Z M 88,1 H 88 A 7,7 0 0 1 95,8 V 34 A 7,7 0 0 1 88,41 H 88 A 7,7 0 0 1 81,34 V 8 A 7,7 0 0 1 88,1 Z M 0,86 A 10,10 0 1 1 20,86 A 10,10 0 1 1 0,86 Z M 83.6584,3.1708 A 3,3 0 0 1 88,5.8541 L 88,22.1459 A 3,3 0 0 1 83.6584,24.8292 L 67.3666,16.6833 A 3,3 0 0 1 67.3666,11.3167 Z" />
            </svg>
            <span>PseudoFlow</span>
          </a>

          <nav className="site-header__nav" aria-label={isEs ? 'Navegación principal' : 'Main navigation'}>
            <a href="#editor" className="site-header__link">{isEs ? 'El editor' : 'The editor'}</a>
            <a href="#track" className="site-header__link">{isEs ? 'Ruta de aprendizaje' : 'Curriculum'}</a>
            <a href="#surfaces" className="site-header__link">{isEs ? 'Superficies' : 'Surfaces'}</a>
            <a href="#features" className="site-header__link">{isEs ? 'Características' : 'Features'}</a>
          </nav>

          <div className="site-header__actions">
            <button
              type="button"
              className="pl-icon-btn"
              onClick={onToggleTheme}
              title={theme === 'dark' ? (isEs ? 'Cambiar a tema claro' : 'Switch to light theme') : (isEs ? 'Cambiar a tema oscuro' : 'Switch to dark theme')}
              aria-label={theme === 'dark' ? (isEs ? 'Cambiar a tema claro' : 'Switch to light theme') : (isEs ? 'Cambiar a tema oscuro' : 'Switch to dark theme')}
            >
              {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="pl-btn pl-btn--outline-field pl-btn--sm"
              onClick={onToggleLang}
              title={isEs ? 'Cambiar a inglés (EN)' : 'Switch to Spanish (ES)'}
              aria-label={isEs ? 'Cambiar idioma a inglés' : 'Switch language to Spanish'}
            >
              {isEs ? 'EN' : 'ES'}
            </button>
            <button type="button" className="pl-btn pl-btn--on-field pl-btn--sm" onClick={() => onOpenIDE()}>
              <Play size={14} fill="currentColor" aria-hidden="true" />
              <span>{isEs ? 'Abrir Editor Web' : 'Open Web IDE'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content">
        {/* Hero */}
        <section className="home-hero">
          <div className="pl-container home-hero__inner">
            <p className="pl-overline pl-overline--field">
              {isEs ? 'Pseudocódigo en español e inglés · Multiplataforma e Independiente' : 'Pseudocode in Spanish and English · Standalone Web App'}
            </p>
            <h1 className="pl-display">
              {isEs ? 'Editor de Pseudocódigo Online: Programar se entiende cuando se ve.' : 'Online Pseudocode Editor: Programming makes sense when you see it.'}
            </h1>
          <p className="pl-lede">
            {isEs
              ? 'PseudoFlow ejecuta tu pseudocódigo una sentencia por vez y mantiene el mismo paso resaltado en el código, el ordinograma, el estructograma y la tabla de prueba de escritorio. Detrás hay una ruta de 15 módulos con 95 ejercicios que se comprueban solos.'
              : 'PseudoFlow executes your pseudocode statement by statement and keeps the same step highlighted across code, flowchart, structogram, and desk trace table. Includes 15 modules and 95 auto-checking exercises.'}
          </p>
          <div className="home-hero__actions">
            <button type="button" className="pl-btn pl-btn--on-field" onClick={() => onOpenIDE()}>
              <Play size={18} fill="currentColor" aria-hidden="true" />
              <span>{isEs ? 'Probar IDE en el Navegador' : 'Try Web IDE'}</span>
            </button>
            <a href="#track" className="pl-btn pl-btn--outline-field">
              <span>{isEs ? 'Ver Ruta de 15 Módulos' : 'Explore Curriculum'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="home-hero__requirements pl-mono">
            {isEs ? '100% en el cliente · Sin instalación de servidores · Soporta Programación Estructurada y Objetos' : '100% Client-side · Zero Server Dependency · Structured & OOP Support'}
          </p>
        </div>
      </section>

      {/* Editor Mockup Preview */}
      <section className="home-hero__mount" id="editor" style={{ padding: '2rem 0 4rem' }}>
        <div className="pl-container">
          <div
            style={{
              background: 'var(--pl-surface)',
              border: '1px solid var(--pl-line)',
              borderRadius: '12px',
              boxShadow: 'var(--pl-shadow-2)',
              overflow: 'hidden'
            }}
          >
            {/* Window Topbar */}
            <div
              style={{
                background: 'var(--pl-sunken)',
                padding: '0.5rem 0.85rem',
                borderBottom: '1px solid var(--pl-line)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                minWidth: 0
              }}
            >
              <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }}></span>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }}></span>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f', display: 'inline-block' }}></span>
              </div>
              <span
                className="pl-mono"
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--pl-ink-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: 1
                }}
              >
                DemostracionGuiada.pseudo
              </span>
              <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <button type="button" className="pl-btn pl-btn--primary pl-btn--sm" onClick={() => onOpenIDE()}>
                  <Play size={13} fill="currentColor" aria-hidden="true" />
                  <span>{isEs ? 'Interactuar' : 'Interact'}</span>
                </button>
              </div>
            </div>

            {/* Preview Body (Code + Synchronized Trace) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 290px), 1fr))',
                padding: '1.25rem',
                gap: '1.25rem'
              }}
            >
              <div>
                <p className="pl-overline pl-overline--brand">{isEs ? 'Código con sentencia activa' : 'Code with active statement'}</p>
                <div style={{ background: 'var(--pl-canvas)', border: '1px solid var(--pl-line)', borderRadius: '8px', padding: '1rem', fontFamily: 'var(--pl-font-mono)', fontSize: '0.88rem', overflowX: 'auto' }}>
                  <div style={{ color: 'var(--pl-syn-proc)' }}>{isEs ? 'Proceso DemostracionGuiada' : 'algorithm GuidedDemo'}</div>
                  <div style={{ paddingLeft: '1.5rem', color: 'var(--pl-ink-2)' }}>{isEs ? 'Definir temperatura Como Entero;' : 'define temperature as integer;'}</div>
                  <div style={{ paddingLeft: '1.5rem', color: 'var(--pl-ink-2)' }}>{isEs ? 'temperatura <- 30;' : 'temperature <- 30;'}</div>
                  <div style={{ paddingLeft: '1.5rem', color: 'var(--pl-syn-struct)' }}>{isEs ? 'Mientras temperatura > 24 Hacer' : 'while temperature > 24 do'}</div>
                  <div style={{ paddingLeft: '3rem', background: 'var(--pl-brand-tint)', color: 'var(--pl-brand-deep)', fontWeight: 600, borderRadius: '4px', padding: '2px 6px' }}>
                    &rarr; {isEs ? 'temperatura <- temperatura - 3;' : 'temperature <- temperature - 3;'}
                  </div>
                  <div style={{ paddingLeft: '3rem', color: 'var(--pl-ink)' }}>{isEs ? 'Escribir "Temperatura: ", temperatura;' : 'write "Temperature: ", temperature;'}</div>
                  <div style={{ paddingLeft: '1.5rem', color: 'var(--pl-syn-struct)' }}>{isEs ? 'FinMientras' : 'endWhile'}</div>
                  <div style={{ color: 'var(--pl-syn-proc)' }}>{isEs ? 'FinProceso' : 'endAlgorithm'}</div>
                </div>
              </div>

              <div>
                <p className="pl-overline pl-overline--brand">{isEs ? 'Tabla de Traza y Memoria Sincronizada' : 'Synchronized Trace & Memory Table'}</p>
                <div style={{ background: 'var(--pl-canvas)', border: '1px solid var(--pl-line)', borderRadius: '8px', padding: '0.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="trace-table" style={{ fontSize: '0.8rem', width: '100%', minWidth: '320px' }}>
                    <thead>
                      <tr>
                        <th>{isEs ? 'Paso' : 'Step'}</th>
                        <th>{isEs ? 'Línea' : 'Line'}</th>
                        <th>{isEs ? 'temperatura' : 'temperature'}</th>
                        <th>{isEs ? 'Estado' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>1</td>
                        <td>2</td>
                        <td>0</td>
                        <td>{isEs ? 'Declaración' : 'Declaration'}</td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td>3</td>
                        <td className="trace-cell--changed">30</td>
                        <td>{isEs ? 'Asignación inicial' : 'Initial assignment'}</td>
                      </tr>
                      <tr>
                        <td>3</td>
                        <td>4</td>
                        <td>30</td>
                        <td>{isEs ? 'Condición > 24 (Verdadero)' : 'Condition > 24 (True)'}</td>
                      </tr>
                      <tr className="trace-table__row--active">
                        <td>4</td>
                        <td>5</td>
                        <td className="trace-cell--changed">27</td>
                        <td>{isEs ? 'Resta (-3) [Activo]' : 'Subtraction (-3) [Active]'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The 4 Synchronized Surfaces */}
      <section className="surfaces" id="surfaces">
        <div className="pl-container">
          <p className="pl-overline pl-overline--brand">{isEs ? 'Vistas sincronizadas' : 'Synchronized Views'}</p>
          <h2 className="pl-section-title">
            {isEs ? 'Un paso, cuatro superficies, ningún salto mental.' : 'One step, four surfaces, zero mental leaps.'}
          </h2>
          <p className="surfaces__lead">
            {isEs
              ? 'En PseudoFlow las cuatro superficies son proyecciones del mismo programa, generadas por el motor: cuando el intérprete avanza, el resaltado se mueve en todas a la vez. También hay un diagrama de clases UML cuando el programa usa objetos.'
              : 'All four surfaces are direct projections of your program: as the interpreter advances, the highlight updates across all four at once.'}
          </p>

          <div className="surfaces__grid">
            <article className="surfaces__card">
              <p className="pl-overline pl-overline--brand surfaces__index">01 · Código</p>
              <h3 className="surfaces__subtitle">{isEs ? 'Sentencia en curso' : 'Active Statement'}</h3>
              <p className="surfaces__caption">
                {isEs
                  ? 'La sentencia que se está ejecutando lleva fondo propio y su número se enciende en el canal, sin cursor que haya que buscar.'
                  : 'The executing statement highlights cleanly with line number markers.'}
              </p>
            </article>

            <article className="surfaces__card">
              <p className="pl-overline pl-overline--brand surfaces__index">02 · Ordinograma</p>
              <h3 className="surfaces__subtitle">{isEs ? 'Nodo activo' : 'Active Flowchart Node'}</h3>
              <p className="surfaces__caption">
                {isEs
                  ? 'Trazado automático por el motor desde el árbol sintáctico (AST): decisiones en rombo, bucles con retorno en color de acento y procesos en rectángulo.'
                  : 'Automated SVG generation from AST: decision diamonds, loop returns, and action boxes.'}
              </p>
            </article>

            <article className="surfaces__card">
              <p className="pl-overline pl-overline--brand surfaces__index">03 · Estructograma</p>
              <h3 className="surfaces__subtitle">{isEs ? 'Anidamiento visible' : 'Visible Nesting'}</h3>
              <p className="surfaces__caption">
                {isEs
                  ? 'Diagrama de Nassi-Shneiderman: sin flechas y sin saltos, la estructura jerárquica de bloques es la propia caja anidada.'
                  : 'Nassi-Shneiderman diagram: structured nesting boxes without chaotic jump arrows.'}
              </p>
            </article>

            <article className="surfaces__card">
              <p className="pl-overline pl-overline--brand surfaces__index">04 · Prueba de escritorio</p>
              <h3 className="surfaces__subtitle">{isEs ? 'Fila por paso' : 'Trace Table per Step'}</h3>
              <p className="surfaces__caption">
                {isEs
                  ? 'La tabla de memoria que tu profesor pide a mano, calculada por el intérprete. Con casillas por variable, valor anterior y nuevo, y aliasing de objetos.'
                  : 'The classic variable trace desk table, tracking primitive values, arrays, and object aliasing.'}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Curriculum Track Section */}
      <section className="track" id="track">
        <div className="pl-container">
          <p className="pl-overline pl-overline--field">{isEs ? 'Ruta de aprendizaje' : 'Pedagogical Curriculum'}</p>
          <div style={{ maxWidth: '800px' }}>
            <h2 className="pl-section-title" style={{ color: '#fff' }}>
              {isEs ? 'No es una pila de tutoriales. Es un camino con orden.' : 'Not a heap of tutorials. A structured pathway.'}
            </h2>
            <p className="pl-lede" style={{ color: '#b9e4e6' }}>
              {isEs
                ? 'Quince módulos en tres tramos, diseñados para aprender en orden. Cada módulo explica un concepto, lo demuestra en ejecución y cierra con ejercicios que se evalúan automáticamente con casos visibles y ocultos.'
                : '15 modules across 3 tracks, guiding learners from imperative foundations to object-oriented programming.'}
            </p>
          </div>

          <div className="track__stages">
            <article className="track__card">
              <h3 className="track__card-title">
                <span>{isEs ? 'Tramo A · Fundamentos' : 'Track A · Foundations'}</span>
                <span className="track__modules pl-mono">{isEs ? '2 módulos' : '2 modules'}</span>
              </h3>
              <p style={{ color: '#d1ecee', fontSize: '0.92rem', marginBottom: '1rem' }}>
                {isEs
                  ? 'Qué tiene que cumplir una secuencia de pasos para llamarse algoritmo, y la máquina nocional para razonar sobre casillas de memoria.'
                  : 'What makes an algorithm, and the notional machine for reasoning about memory boxes.'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem', fontFamily: 'var(--pl-font-mono)', fontSize: '0.84rem' }}>
                {[
                  { id: 'CON-A1', title: isEs ? 'Qué es un algoritmo' : 'What is an algorithm' },
                  { id: 'CON-A2', title: isEs ? 'La máquina nocional' : 'The notional machine' }
                ].map(m => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onOpenIDE(m.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8be4e8',
                        padding: '0.25rem 0.4rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139, 228, 232, 0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title={isEs ? `Abrir ${m.id} en el editor` : `Open ${m.id} in editor`}
                    >
                      <span>• {m.id}: {m.title}</span>
                      <ArrowRight size={12} style={{ opacity: 0.6 }} />
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="track__card">
              <h3 className="track__card-title">
                <span>{isEs ? 'Tramo B · Programación estructurada' : 'Track B · Structured Programming'}</span>
                <span className="track__modules pl-mono">{isEs ? '8 módulos' : '8 modules'}</span>
              </h3>
              <p style={{ color: '#d1ecee', fontSize: '0.92rem', marginBottom: '1rem' }}>
                {isEs
                  ? 'Datos, decisiones, los tres bucles (Mientras, Repetir, Para), vectores, matrices, subprogramas con paso por referencia y recursión.'
                  : 'Data, decisions, 3 loop variants, 1D/2D arrays, subprograms with reference parameters, and recursion.'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem', fontFamily: 'var(--pl-font-mono)', fontSize: '0.84rem' }}>
                {[
                  { id: 'CON-B1', title: isEs ? 'Datos, variables y asignación' : 'Data, variables & assignment' },
                  { id: 'CON-B2', title: isEs ? 'Entrada y salida (Leer / Escribir)' : 'I/O (Leer / Escribir)' },
                  { id: 'CON-B3', title: isEs ? 'Selección (Si / Segun)' : 'Branching (Si / Segun)' },
                  { id: 'CON-B4', title: isEs ? 'Iteración (Mientras, Repetir, Para)' : 'Loops (Mientras, Repetir, Para)' },
                  { id: 'CON-B5', title: isEs ? 'Arreglos y matrices 2D' : 'Arrays & 2D matrices' },
                  { id: 'CON-B6', title: isEs ? 'Subprogramas y parámetros' : 'Subprograms & parameters' },
                  { id: 'CON-B7', title: isEs ? 'Recursión y pila de llamadas' : 'Recursion & call stack' },
                  { id: 'CON-B8', title: isEs ? 'Leer programas desde diagramas' : 'Read programs from diagrams' }
                ].map(m => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onOpenIDE(m.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8be4e8',
                        padding: '0.25rem 0.4rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139, 228, 232, 0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title={isEs ? `Abrir ${m.id} en el editor` : `Open ${m.id} in editor`}
                    >
                      <span>• {m.id}: {m.title}</span>
                      <ArrowRight size={12} style={{ opacity: 0.6 }} />
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="track__card">
              <h3 className="track__card-title">
                <span>{isEs ? 'Tramo C · Objetos' : 'Track C · Object-Oriented'}</span>
                <span className="track__modules pl-mono">{isEs ? '5 módulos' : '5 modules'}</span>
              </h3>
              <p style={{ color: '#d1ecee', fontSize: '0.92rem', marginBottom: '1rem' }}>
                {isEs
                  ? 'De variables sueltas a estado y conducta. Identidad de instancias, aliasing, herencia y despacho dinámico de métodos.'
                  : 'From loose variables to state and behavior. Instance identity, aliasing, inheritance, and dynamic dispatch.'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem', fontFamily: 'var(--pl-font-mono)', fontSize: '0.84rem' }}>
                {[
                  { id: 'CON-C1', title: isEs ? 'Por qué objetos y encapsulamiento' : 'Why objects & encapsulation' },
                  { id: 'CON-C2', title: isEs ? 'Clase, visibilidad y constructor' : 'Class, visibility & constructor' },
                  { id: 'CON-C3', title: isEs ? 'Instancia, identidad y aliasing' : 'Instance, identity & aliasing' },
                  { id: 'CON-C4', title: isEs ? 'Herencia y despacho dinámico' : 'Inheritance & dynamic dispatch' },
                  { id: 'CON-C5', title: isEs ? 'Diseño y responsabilidades' : 'Design & responsibilities' }
                ].map(m => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onOpenIDE(m.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8be4e8',
                        padding: '0.25rem 0.4rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139, 228, 232, 0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title={isEs ? `Abrir ${m.id} en el editor` : `Open ${m.id} in editor`}
                    >
                      <span>• {m.id}: {m.title}</span>
                      <ArrowRight size={12} style={{ opacity: 0.6 }} />
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <dl className="metrics">
            <div className="metrics__item">
              <dt className="metrics__value pl-mono">15</dt>
              <dd className="metrics__label">{isEs ? 'módulos con especificación completa' : 'comprehensive curriculum modules'}</dd>
            </div>
            <div className="metrics__item">
              <dt className="metrics__value pl-mono">95</dt>
              <dd className="metrics__label">{isEs ? 'ejercicios con casos visibles y ocultos' : 'auto-validated guided exercises'}</dd>
            </div>
            <div className="metrics__item">
              <dt className="metrics__value pl-mono">86</dt>
              <dd className="metrics__label">{isEs ? 'programas de ejemplo ejecutables' : 'executable code examples'}</dd>
            </div>
            <div className="metrics__item">
              <dt className="metrics__value pl-mono">11</dt>
              <dd className="metrics__label">{isEs ? 'documentos de gramática y semántica' : 'language specification documents'}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Six Key Features */}
      <section className="surfaces" id="features">
        <div className="pl-container">
          <p className="pl-overline pl-overline--brand">{isEs ? 'Por qué esta herramienta' : 'Why PseudoFlow'}</p>
          <h2 className="pl-section-title">{isEs ? 'Seis cosas que un papel no puede hacer.' : 'Six things paper cannot do.'}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginTop: '2.5rem' }}>
            <div style={{ padding: '1.5rem', background: 'var(--pl-surface)', border: '1px solid var(--pl-line)', borderRadius: '10px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--pl-brand)', marginBottom: '0.5rem' }}>01</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{isEs ? 'Ejecución paso a paso a ritmo ajustable' : 'Adjustable Step-by-Step Execution'}</h3>
              <p style={{ color: 'var(--pl-ink-2)', fontSize: '0.92rem' }}>
                {isEs ? 'Avanza una sentencia por vez a velocidad normal, rápida o manual, observando exactamente el flujo de ejecución.' : 'Advance statement by statement at your preferred pace.'}
              </p>
            </div>

            <div style={{ padding: '1.5rem', background: 'var(--pl-surface)', border: '1px solid var(--pl-line)', borderRadius: '10px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--pl-brand)', marginBottom: '0.5rem' }}>02</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{isEs ? 'Diagnósticos que enseñan' : 'Educational Error Diagnostics'}</h3>
              <p style={{ color: 'var(--pl-ink-2)', fontSize: '0.92rem' }}>
                {isEs ? 'Señalan la línea exacta con explicaciones claras en español e inglés sin mensajes crípticos.' : 'Clear explanations in Spanish and English with line pointers.'}
              </p>
            </div>

            <div style={{ padding: '1.5rem', background: 'var(--pl-surface)', border: '1px solid var(--pl-line)', borderRadius: '10px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--pl-brand)', marginBottom: '0.5rem' }}>03</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{isEs ? 'Proyección a Python y Rust' : 'Transpilation to Python & Rust'}</h3>
              <p style={{ color: 'var(--pl-ink-2)', fontSize: '0.92rem' }}>
                {isEs ? 'Mira cómo tu pseudocódigo se traduce directamente a lenguajes industriales modernos.' : 'See direct 1:1 correspondences with modern industrial languages.'}
              </p>
            </div>

            <div style={{ padding: '1.5rem', background: 'var(--pl-surface)', border: '1px solid var(--pl-line)', borderRadius: '10px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--pl-brand)', marginBottom: '0.5rem' }}>04</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{isEs ? 'Los objetos dejan de ser magia' : 'Demystified Objects & Aliasing'}</h3>
              <p style={{ color: 'var(--pl-ink-2)', fontSize: '0.92rem' }}>
                {isEs ? 'Rastreo visual de referencias e identificadores (#1, #2) para entender aliasing y paso por referencia.' : 'Visual identifier tracking (#1, #2) to master aliasing and reference semantics.'}
              </p>
            </div>

            <div style={{ padding: '1.5rem', background: 'var(--pl-surface)', border: '1px solid var(--pl-line)', borderRadius: '10px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--pl-brand)', marginBottom: '0.5rem' }}>05</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{isEs ? 'Ejecución 100% en el cliente' : '100% Client-Side Engine'}</h3>
              <p style={{ color: 'var(--pl-ink-2)', fontSize: '0.92rem' }}>
                {isEs ? 'Funciona íntegramente en tu navegador sin enviar tu código a servidores externos ni requerir login.' : 'Runs locally in the browser with zero server latency and offline readiness.'}
              </p>
            </div>

            <div style={{ padding: '1.5rem', background: 'var(--pl-surface)', border: '1px solid var(--pl-line)', borderRadius: '10px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--pl-brand)', marginBottom: '0.5rem' }}>06</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>{isEs ? 'Bilingüe integral' : 'Truly Bilingual'}</h3>
              <p style={{ color: 'var(--pl-ink-2)', fontSize: '0.92rem' }}>
                {isEs ? 'Tanto las palabras clave (Proceso/algorithm, Mientras/while) como las lecciones y diagnósticos están en ambos idiomas.' : 'Full bilingual grammar and lessons in Spanish and English.'}
              </p>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--pl-field)', color: '#fff', padding: '3rem 0', borderTop: '1px solid var(--pl-field-deep)' }}>
        <div className="pl-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.3rem' }}>PseudoFlow Web</div>
            <div style={{ fontSize: '0.85rem', color: '#92dada', marginBottom: '0.5rem' }}>
              {isEs
                ? 'Editor de pseudocódigo en línea, diagramas de flujo y pruebas de escritorio en tiempo real.'
                : 'Online pseudocode editor, flowcharts, and synchronized desk trace tables in real-time.'}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
              <a href="#editor" style={{ color: '#8be4e8', textDecoration: 'none' }}>{isEs ? 'Editor Interactivo' : 'Interactive Editor'}</a>
              <a href="#surfaces" style={{ color: '#8be4e8', textDecoration: 'none' }}>{isEs ? 'Superficies y Diagramas' : 'Surfaces & Diagrams'}</a>
              <a href="#track" style={{ color: '#8be4e8', textDecoration: 'none' }}>{isEs ? 'Ruta Pedagógica' : 'Curriculum'}</a>
              <a href="#features" style={{ color: '#8be4e8', textDecoration: 'none' }}>{isEs ? 'Ventajas' : 'Features'}</a>
              <a href="https://github.com/daniel95-sv/PseudoFlow.git" target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>
                GitHub
              </a>
            </div>
          </div>
          <button type="button" className="pl-btn pl-btn--on-field" onClick={() => onOpenIDE()}>
            <Play size={15} fill="currentColor" aria-hidden="true" />
            <span>{isEs ? 'Abrir Editor Web' : 'Open Web IDE'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
