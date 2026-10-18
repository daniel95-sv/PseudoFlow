# Auditoría técnica completa de PseudoFlow — revisión 3

**Fecha de revisión:** 17 de octubre de 2026  
**Proyecto:** [PseudoFlow en Cloudflare Pages](https://pseudoflow.pages.dev/) · [Repositorio público](https://github.com/daniel95-sv/PseudoFlow)  
**Versión examinada:** rama `main`, incluida la revisión visible en el commit `9941fb3` (`fix(engine): support method call arguments and contextual identifier keywords`).  
**Tipo de auditoría:** revisión estática del código y configuración pública, con comprobación del estado visible de GitHub Actions. No equivale a una prueba de penetración ni a una prueba dinámica completa del sitio.

---

## 1. Resumen ejecutivo

PseudoFlow ha mejorado de forma sustancial respecto de las auditorías anteriores. Ya aparecen mitigaciones concretas para los errores léxicos, variables y funciones desconocidas, recursión excesiva, arreglos grandes, límites de pasos, cantidad de trazas, volumen de salida y tipos estrictos de TypeScript. También se añadieron pruebas de motor, un flujo de integración continua, una CSP y reglas CSS adaptables a pantallas pequeñas.

La página de GitHub Actions muestra ejecuciones de `CI Quality & Validation` completadas correctamente. El flujo ejecuta instalación limpia, `npm audit --audit-level=high`, lint, `npm test` y compilación de producción. Esto es una mejora objetiva, aunque no demuestra por sí solo que la interfaz publicada esté desplegada desde el mismo commit ni que los casos no automatizados funcionen correctamente.

**Veredicto:** PseudoFlow tiene una base razonable para una beta educativa pública, pero todavía no recomendaría declararlo «producción estable» sin cerrar los problemas de ejecución interactiva y equivalencia de transpilación que se detallan abajo. No he confirmado una vulnerabilidad de ejecución remota ni un compromiso de datos; los principales riesgos detectados son de disponibilidad de la pestaña, corrección funcional, resistencia ante entradas grandes y confianza de una evaluación educativa.

### Semáforo de preparación

| Área | Estado | Comentario |
|---|---|---|
| Análisis léxico y errores básicos | Mejorado | Los caracteres desconocidos y las cadenas/comentarios sin cerrar generan errores. |
| Intérprete | Parcialmente preparado | Tiene cuotas, pero el temporizador afecta también al modo interactivo y no aísla el trabajo del hilo de UI. |
| Transpilación Python/Rust | No aprobar como salida autoritativa | Sigue basada en líneas y regex; algunos resultados cambian la semántica o pueden no compilar. |
| Pruebas y CI | Avance importante | Hay `tests/engine.test.ts`; GitHub Actions muestra corridas satisfactorias. Falta ampliar la cobertura a UI, navegador y compilación de código exportado. |
| Seguridad HTTP | Configuración mejorada | Se declara CSP y cabeceras en `public/_headers`; las cabeceras reales del dominio público deben verificarse desde el navegador/HTTP. |
| Responsive y accesibilidad | Parcial | Hay breakpoints móviles, pero no encontré estilos explícitos `:focus-visible` ni soporte `prefers-reduced-motion`. |
| Evaluación formal de ejercicios | No preparada para secretos | Los llamados `hiddenCases` y las salidas esperadas viajan al cliente. |

---

## 2. Alcance y limitaciones

Se revisaron archivos actuales de `main`, entre ellos:

- `src/engine/interpreter.ts`
- `src/engine/lexer.ts`
- `src/engine/parser.ts`
- `src/engine/transpiler.ts`
- `src/components/IDEView.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/data/exercises.json`
- `package.json`, `tsconfig.app.json`, `public/_headers`, `index.html`, `public/robots.txt`, `public/sitemap.xml`
- `tests/engine.test.ts` y `.github/workflows/ci.yml`

Se consultó el despliegue público, pero las herramientas de navegación disponibles no permitieron interactuar con todos los controles de la IDE ni inspeccionar de forma fiable las cabeceras HTTP servidas por Cloudflare Pages. No se ejecutaron desde este entorno Playwright, pruebas de carga, pruebas de accesibilidad automatizadas ni una instalación local de dependencias. Las afirmaciones sobre código se apoyan en el repositorio; el comportamiento visual/de producción que no se ejecutó se presenta como pendiente de validar.

---

## 3. Correcciones anteriores que sí se observan

### 3.1 Lexer y parser

El lexer ahora arroja un error con línea/columna ante caracteres que no reconoce; detecta cadenas literales y comentarios de bloque sin cerrar. Esto evita que errores de escritura se descarten silenciosamente. El parser organiza los operadores lógicos, comparaciones, aritmética y potencia por niveles de precedencia; la potencia se analiza de forma asociativa a la derecha.

Referencias: [lexer.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts), [parser.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts).

### 3.2 Intérprete y presupuesto de ejecución

El intérprete tiene límites declarados de 50.000 pasos, 100 niveles de llamadas, 100.000 elementos por arreglo, 2.000 líneas de salida, 2.000 pasos almacenados y un tiempo predeterminado de cinco segundos. Las variables y funciones desconocidas ahora producen errores en lugar de devolver silenciosamente `0`. El valor del límite temporal se comprueba al avanzar en el motor y durante la ejecución completa.

Referencia: [interpreter.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts).

### 3.3 Editor

La selección de ejercicios, ejemplos y soluciones llama al reinicio con el texto nuevo explícito, evitando el uso de una clausura de React con código anterior. Al modificar el editor se invalida el intérprete vigente, se detiene la reproducción y se guarda el borrador. Los errores de ejecución tienen un estado visible separado del error sintáctico. Se añadieron wrappers tolerantes a fallos para el borrador de `localStorage`.

Referencia: [IDEView.tsx](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx).

### 3.4 Seguridad, calidad y experiencia de usuario

- `tsconfig.app.json` activa `strict` y `noImplicitAny`.
- `public/_headers` declara CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y HSTS.
- `package.json` incluye `test: vitest run` y Vitest.
- `.github/workflows/ci.yml` ejecuta `npm ci`, `npm audit --audit-level=high`, lint, pruebas y build para push/PR a `main`.
- `src/index.css` ya contiene breakpoints para tablet y móvil, incluida una disposición vertical de la IDE.
- Existe una suite `tests/engine.test.ts` que cubre errores de entrada, subprogramas, parámetros por referencia, clases/herencia y una prueba de carga del motor.

Referencias: [tsconfig.app.json](https://github.com/daniel95-sv/PseudoFlow/blob/main/tsconfig.app.json), [cabeceras](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers), [package.json](https://github.com/daniel95-sv/PseudoFlow/blob/main/package.json), [workflow CI](https://github.com/daniel95-sv/PseudoFlow/blob/main/.github/workflows/ci.yml), [pruebas](https://github.com/daniel95-sv/PseudoFlow/blob/main/tests/engine.test.ts), [CSS](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/index.css).

---

## 4. Hallazgos pendientes priorizados

### P1 — El temporizador de cinco segundos afecta al modo interactivo

**Archivos:** `src/engine/interpreter.ts`, `src/components/IDEView.tsx`  
**Impacto:** error funcional visible durante la enseñanza paso a paso.

`DEFAULT_TIMEOUT_MS` vale 5.000 ms y `consumeStep()` comprueba el tiempo transcurrido desde `startTime`. El mismo `Interpreter` se utiliza tanto para `runAll()` como para el generador interactivo que la IDE avanza mediante `setTimeout`. En modo paso a paso, el tiempo transcurrido incluye las pausas que hace una persona para leer la traza y el tiempo que tarda en contestar a `Leer`. Tras superar cinco segundos totales, la próxima instrucción puede terminar en error aunque el alumno esté estudiando y no haya un bucle infinito.

**Corrección recomendada:** separar las cuotas de ejecución completa de las del modo interactivo. Para el modo interactivo, contar instrucciones o tiempo de CPU activo, y pausar el reloj durante el estado `isWaitingForInput` y cuando el usuario pulse pausa. `runAll()` puede mantener un presupuesto temporal específico. Añadir pruebas que simulen una pausa superior a cinco segundos y una espera de entrada prolongada sin generar un timeout falso.

### P1 — El intérprete y el análisis se ejecutan en el hilo principal

**Archivos:** `src/components/IDEView.tsx`, `src/engine/interpreter.ts`, `src/engine/lexer.ts`, `src/engine/parser.ts`  
**Impacto:** una expresión o entrada especialmente grande aún puede dejar la pestaña sin responder.

`IDEView` importa el intérprete directamente y llama al lexer, parser y generadores de diagramas en el mismo hilo. `runAll()` hace un ciclo síncrono sobre el generador. Los límites actuales se comprueban entre instrucciones/avances, pero no interrumpen una sola instrucción que tarde demasiado ni protegen de un análisis de código enorme, anidamiento recursivo profundo o generación de diagramas sobre un AST excesivo. Un timeout cooperativo no puede interrumpir una función síncrona que monopoliza el hilo.

**Corrección recomendada:** mover la ejecución completa a un `Web Worker` y detenerlo con `terminate()` en el timeout o cancelación. Definir límites de tamaño de fuente, tokens, profundidad del parser/AST y nodos de los diagramas. Si el modo paso a paso debe mostrar trazas, enviar lotes de pasos al hilo principal en lugar de compartir una ejecución síncrona que no se puede cancelar de forma fiable.

### P1 — Los casos de prueba “ocultos” no son secretos

**Archivos:** `src/data/exercises.json`, `src/components/IDEView.tsx`  
**Impacto:** invalida la confidencialidad de exámenes o evaluaciones formales.

Los ejercicios y `hiddenCases` están incluidos en un JSON empaquetado para el navegador. `handleValidateExercise()` combina `visibleCases` y `hiddenCases` en el frontend, y los detalles de resultados incluyen `expectedOutputs`. Cualquier usuario puede inspeccionar los recursos descargados o depurar el cliente para conocer entradas y salidas esperadas.

**Corrección recomendada:** si el fin es practicar, mantener los casos adicionales pero denominarlos transparentemente como pruebas adicionales, no secretas. Si se requiere calificación con casos confidenciales, mover la ejecución de evaluación y los casos privados a un servicio de servidor. Ofuscar el bundle no resuelve la confidencialidad.

### P2 — Los transpiladores todavía cambian la semántica y pueden generar código inválido

**Archivo:** `src/engine/transpiler.ts`  
**Impacto:** resultados exportados distintos de los del intérprete y confianza indebida en el código generado.

El archivo se denomina experimental, pero la aplicación ofrece la conversión como una superficie principal. La generación todavía analiza líneas mediante expresiones regulares en lugar de producir el resultado directamente desde el AST.

Problemas verificables en el código actual:

1. En Python, `Escribir ...` genera `print(arg1, arg2, ...)`, cuyo separador predeterminado es un espacio. En el intérprete los fragmentos se concatenan con `join('')`. Por ejemplo, `Escribir "x=", 5` puede generar `x=5` en el intérprete, pero `x= 5` en Python.
2. En Rust, los placeholders de salida se combinan con espacios (`join(' ')`), por lo que aparece la misma discrepancia semántica.
3. El patrón de `Para` captura el paso opcional, pero la generación Rust forma un rango inclusivo `inicio..=fin` y no aplica ese paso. Un bucle con `Con Paso 2` o una iteración descendente no conserva su semántica.
4. La generación de arreglos Rust solo representa correctamente de forma directa uno y dos niveles; dimensiones mayores se aplanan. Esto no equivale a una matriz multidimensional del pseudocódigo.
5. Las asignaciones de cadenas Rust se emiten de forma genérica. Asignar un literal `&str` a una variable declarada `String` puede requerir `.to_string()`/`String::from(...)`; no existe una conversión general que garantice compilación.

**Corrección recomendada:** priorizar un transpilador AST→AST/generador por nodos y documentar formalmente las construcciones soportadas. Hasta que las salidas se compilen/ejecuten en pruebas, mantener el rótulo “experimental”, no llamarlas “equivalentes” y mostrar una advertencia de soporte parcial. Añadir pruebas de golden output y compilar los ejemplos generados por Python y Rust en CI.

### P2 — Los límites de historial no limitan toda la interfaz

**Archivos:** `src/engine/interpreter.ts`, `src/components/IDEView.tsx`  
**Impacto:** crecimiento innecesario del estado React y potencial lentitud con programas extensos.

El método `recordStep()` limita a 2.000 los pasos almacenados en el motor. Sin embargo, el generador sigue haciendo `yield step` para cada paso y el editor agrega cada uno a `traceSteps` con `setTraceSteps(prev => [...prev, step])`. La consola también agrega cada `outputLog` a `consoleLogs`. Por tanto, las cuotas del almacenamiento interno no limitan lo que el componente acumula durante una sesión interactiva. La cuota de `MAX_OUTPUT_LINES` limita `outputs`, pero los `TraceStep.outputLog` aún se emiten a la interfaz.

**Corrección recomendada:** aplicar límites en la frontera de la UI, con un máximo uniforme de pasos/filas/consola y un mensaje claro de truncamiento. Usar un buffer circular o lotes y virtualización de la tabla. No copiar el historial completo en cada actualización a medida que crece.

### P2 — La cuota de memoria de arreglos es por arreglo, no global

**Archivo:** `src/engine/interpreter.ts`  
**Impacto:** un algoritmo puede reservar muchos arreglos grandes y sobrepasar la cuota agregada de memoria.

`MAX_ARRAY_TOTAL_ELEMENTS` comprueba el producto de dimensiones de cada arreglo individual, pero no suma los elementos de todos los arreglos vivos. Muchas declaraciones dentro del límite pueden consumir mucho más que el presupuesto aparente. Además, las dimensiones decimales se convierten con `Math.floor()` en lugar de rechazarse, aunque el mensaje de error habla de enteros.

**Corrección recomendada:** llevar un contador agregado de elementos/bytes asignados; rechazar dimensiones no enteras antes de convertirlas; reducir el límite en equipos modestos y añadir tests con múltiples arreglos y dimensiones no enteras.

### P2 — `runAll()` no está preparado para reutilizar la misma instancia

**Archivo:** `src/engine/interpreter.ts`  
**Impacto:** salidas viejas o una ejecución que aparentemente no se repite en futuras llamadas de código reutilizador.

`runAll()` inicia el generador, pero no reinicia explícitamente `isFinished`, `error`, `outputs`, `steps`, `stepNumber` ni el entorno antes de volver a ejecutar la misma instancia. La suite de validación crea un `Interpreter` nuevo por caso y la IDE reinicia creando una nueva instancia, lo cual reduce el impacto actual; aun así, el método público permite volver a llamarlo y puede devolver un resultado anterior.

**Corrección recomendada:** hacer que una instancia represente una sola ejecución y documentarlo/impedir la segunda llamada, o implementar un `reset()` completo que restablezca todos los campos internos con pruebas de dos ejecuciones consecutivas.

### P2 — `localStorage` no está protegido de manera uniforme

**Archivo:** `src/App.tsx`  
**Impacto:** posible fallo al arrancar en navegadores/perfiles que bloquean el almacenamiento.

`IDEView.tsx` usa wrappers tolerantes a errores para el borrador, pero `App.tsx` accede directamente a `localStorage.getItem()` durante la inicialización y a `localStorage.setItem()` en efectos de tema/idioma. En entornos donde el acceso al almacenamiento genere `SecurityError` o falle por políticas del navegador, la protección de los borradores no evita que el componente principal falle.

**Corrección recomendada:** centralizar la lectura/escritura/borrado en un helper seguro compartido y probar la aplicación con almacenamiento bloqueado/cuota agotada.

### P2 — Accesibilidad visual incompleta pese al soporte móvil

**Archivos:** `src/index.css`, `src/components/IDEView.tsx`  
**Impacto:** navegación por teclado y reducción de movimiento menos claras para ciertos usuarios.

Hay breakpoints móviles y controles semánticos `button`, y el editor tiene `aria-label`; sin embargo, no encontré reglas `:focus-visible` ni `prefers-reduced-motion` en la hoja inspeccionada. Algunas pestañas visuales cambian de clase activa sin roles/estado de tab explícitos, por lo que aún debe probarse la relación entre teclado, lector de pantalla y panel visible.

**Corrección recomendada:** definir indicador de foco visible de alto contraste; implementar semántica de pestañas (o botones normales con estado accesible equivalente); añadir `prefers-reduced-motion` y realizar pruebas con teclado, NVDA/VoiceOver y Lighthouse/axe.

### P3 — Preferencia inicial de tema

**Archivo:** `src/App.tsx`  
La expresión que decide el tema inicial devuelve `'dark'` tanto si `prefers-color-scheme: dark` coincide como si no. Por tanto, la preferencia del sistema no se respeta; no es un riesgo de seguridad, pero sí un defecto menor de experiencia. Debe devolverse `'light'` para el caso sin tema oscuro, o documentarse que el valor inicial intencional siempre es oscuro.

---

## 5. Seguridad HTTP y despliegue

`public/_headers` incorpora una CSP con `default-src 'self'`, `script-src 'self'`, restricción de `frame-ancestors`, `object-src 'none'` y `base-uri 'self'`. También se configuran otros encabezados defensivos. Es un buen avance.

Aspectos pendientes:

1. Verificar con una solicitud HTTP real a `https://pseudoflow.pages.dev/` que Cloudflare Pages publica efectivamente la CSP y los demás headers. Tenerlos escritos en `public/_headers` no demuestra por sí solo que la configuración desplegada sea la esperada.
2. Probar la CSP en el sitio real y revisar la consola de navegador. La política permite estilos inline, probablemente necesarios por el uso de `style` en React; conservarlo debe ser una decisión documentada y no una copia automática.
3. Ejecutar `npm audit --audit-level=high` y revisar su resultado real en el último workflow, aunque el flujo actual lo incorpore. El estado general satisfactorio de CI es positivo, pero esta auditoría no ejecutó un escáner de dependencias por separado.
4. Verificar que el dominio publicado corresponda a la misma revisión de `main` validada por Actions y que el despliegue de Pages haya terminado correctamente. La página pública no expone un identificador de build comprobable en la vista de texto que pude consultar.

No encontré evidencia en los archivos revisados de que el pseudocódigo se ejecute como JavaScript nativo del navegador; eso reduce el riesgo de ejecución arbitraria directamente mediante `eval`, pero no protege frente a agotamiento de recursos. No debe interpretarse esta observación como una certificación de seguridad completa.

---

## 6. CI y pruebas: estado actual

**Mejora confirmada:** el workflow de GitHub Actions incluye:

1. `npm ci`
2. `npm audit --audit-level=high`
3. `npm run lint`
4. `npm test`
5. `npm run build`

La página pública de Actions muestra cuatro ejecuciones del workflow completadas satisfactoriamente, y el commit más reciente visible añade soporte a llamadas de métodos con argumentos y casos adicionales en `tests/engine.test.ts`.

La suite ya cubre parte de los errores de entrada, llamadas a subprogramas, paso por referencia, construcción de objetos, métodos, herencia y una carga moderada de arreglos. La mejora importante que aún falta es evitar que el éxito de las pruebas unitarias sea la única evidencia de calidad.

**Ampliación recomendada de las pruebas:**

- **Intérprete:** timeout en `Mientras Verdadero` con cuerpo vacío, tiempo de espera a `Leer`, pausa/reanudación sin timeout falso, reutilización de una instancia, recursión, pila, errores y presupuestos de arrays/salida/trazas.
- **Parser/lexer:** entradas profundas o grandes, caracteres desconocidos, escapes y cadenas/comentarios sin cerrar, precedencia y asociatividad de exponentes.
- **Transpilación:** salidas múltiples con cadenas/variables, `Con Paso`, ciclos descendentes, cadenas y arreglos 2D/3D; además, ejecutar el código generado con los compiladores/intérpretes correspondientes en CI.
- **UI/E2E:** seleccionar ejercicio, editar, ejecutar, pausar más de cinco segundos, responder a `Leer`, reiniciar, importar/descargar código y mantener la IDE usable con un programa que alcance los límites.
- **Accesibilidad/responsive:** flujos por teclado, foco visible, móvil estrecho, zoom y preferencias de movimiento reducido.

---

## 7. Plan de corrección recomendado

### Fase A — Antes de declarar una versión estable

1. Separar el timeout de `runAll()` del reloj de la depuración interactiva.
2. Aislar parseo/ejecución pesada en `Web Worker` y añadir cancelación real.
3. Establecer límites de fuente, profundidad, AST, heap agregado, trazas y consola en ambos lados (motor e interfaz).
4. Definir si los casos ocultos son solo didácticos o realmente confidenciales; no venderlos como confidenciales mientras viajen al cliente.
5. Corregir los errores conocidos de Python/Rust o restringir explícitamente la función exportada a un subconjunto validado.

### Fase B — Antes de escalar usuarios

6. Completar pruebas E2E y de regresión en navegador; añadir los ejemplos compilados de transpilación al pipeline.
7. Centralizar el almacenamiento local en wrappers seguros.
8. Completar el foco, semántica accesible de pestañas y `prefers-reduced-motion`.
9. Verificar cabeceras reales y la correspondencia entre commit aprobado y build publicado.

---

## 8. Criterios de aceptación para cerrar la auditoría

No daría por cerrada esta auditoría hasta que se cumpla lo siguiente:

- [ ] La depuración paso a paso puede pausarse y esperar entrada más de cinco segundos sin error falso.
- [ ] Un ciclo infinito se puede detener sin bloquear el navegador; el botón detener/cancelar responde siempre.
- [ ] El parser rechaza o limita fuentes y anidamientos excesivos sin congelar la UI.
- [ ] La memoria agregada, las trazas y la consola respetan límites desde el motor hasta React.
- [ ] Los casos secretos no se incluyen en el bundle si se van a usar para evaluación formal.
- [ ] Los ejemplos de Python/Rust preservan los resultados del intérprete o la interfaz identifica claramente qué construcciones no soporta.
- [ ] Las pruebas automáticas cubren los casos críticos y pasan en CI; se añade al menos un flujo de navegador automatizado.
- [ ] La CSP y el resto de cabeceras se confirman en una respuesta HTTP real del dominio publicado.
- [ ] Las pruebas de teclado y móvil no encuentran bloqueos críticos.

---

## 9. Enlaces revisados

- [Aplicación publicada](https://pseudoflow.pages.dev/)
- [Repositorio PseudoFlow](https://github.com/daniel95-sv/PseudoFlow)
- [Workflow de CI](https://github.com/daniel95-sv/PseudoFlow/blob/main/.github/workflows/ci.yml)
- [Ejecuciones de GitHub Actions](https://github.com/daniel95-sv/PseudoFlow/actions)
- [Suite del motor](https://github.com/daniel95-sv/PseudoFlow/blob/main/tests/engine.test.ts)
- [Intérprete](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts)
- [Lexer](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts)
- [Parser](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts)
- [Transpilador](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts)
- [IDEView](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx)
- [App.tsx](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/App.tsx)
- [CSP y headers](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers)
- [CSS responsive](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/index.css)
- [Ejercicios](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/data/exercises.json)

---

## Conclusión final

PseudoFlow sí refleja un esfuerzo real por aplicar las recomendaciones anteriores: hay controles de recursos, mejores errores, persistencia defensiva para borradores, tipado estricto, una suite de motor y un pipeline de calidad visible. Eso representa una mejora importante, y el estado satisfactorio reportado por GitHub Actions es una señal favorable.

**Las dos prioridades técnicas principales ahora son corregir el timeout que afecta a la enseñanza paso a paso y aislar la ejecución para que un programa problemático no bloquee la interfaz.** En paralelo, las salidas Python/Rust deben considerarse experimentales hasta que pruebas de equivalencia y compilación demuestren que preservan el comportamiento.

Recomiendo mantener PseudoFlow como beta educativa mientras se cierran esos puntos. Para evaluación formal, la protección de casos de prueba requiere un componente de servidor. Esta conclusión se basa en la revisión estática de la rama y del flujo de CI; no es una declaración de que el sitio esté libre de todas las vulnerabilidades.
