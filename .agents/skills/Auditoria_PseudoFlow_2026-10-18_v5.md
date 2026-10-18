# Auditoría completa de PseudoFlow — Revisión 5

**Fecha:** 18 de octubre de 2026  
**Proyecto:** [PseudoFlow](https://github.com/daniel95-sv/PseudoFlow)  
**Sitio publicado:** [https://pseudoflow.pages.dev/](https://pseudoflow.pages.dev/)  
**Alcance:** revisión estática del código público y configuración accesible desde GitHub; consulta del sitio y del estado visible de CI.

## Resumen ejecutivo

El proyecto presenta avances significativos respecto a las auditorías anteriores: existe ejecución interactiva en un Web Worker, validación de ejercicios mediante otro Worker con cancelación explícita, límites de salida, tamaño de código, tokens, profundidad del parser, historial de trazas y arreglos; además, el repositorio configura TypeScript estricto y CI con `npm ci`, `npm audit --audit-level=high`, lint, pruebas y build.

**Dictamen actual: no recomendaría declarar todavía la versión actual como producción estable.** Detecté una incompatibilidad concreta en el protocolo `RESET_SESSION` que puede dejar el flujo de reinicio sin respuesta, además de un camino de error que descarta promesas sin resolverlas. Hay también riesgos de rendimiento al ejecutar subprogramas y al transmitir el historial completo de salida por cada paso.

La última ejecución de GitHub Actions visible en la página consultada aparece como exitosa para el commit `0344544` (workflow run #12). Eso es una señal positiva, pero no demuestra que cada flujo de sesión funcione, y no pude establecer de forma independiente que el último código examinado y el bundle de producción correspondan exactamente a ese SHA. El sitio público responde y presenta el contenido de PseudoFlow; no realicé una sesión interactiva automatizada.

## Resumen de severidad

| Severidad | Hallazgo | Estado |
|---|---|---|
| **P1 — Alta** | El protocolo de reinicio de sesión no coincide entre servicio y Worker | Confirmado por inspección estática |
| **P1 — Alta** | Un error del Worker puede dejar operaciones asíncronas pendientes | Confirmado por inspección estática |
| **P2 — Media/alta** | Las llamadas a subprogramas drenan generadores de forma síncrona | Confirmado; impacto mayor en fallback sin Worker |
| **P2 — Media** | Se serializa la salida acumulada en cada paso del Worker | Confirmado; riesgo de coste acumulativo |
| **P2 — Media** | El servicio de sesión permite sobrescribir resolutores de peticiones pendientes | Confirmado por inspección estática |
| **P2 — Media** | Los casos de prueba “ocultos” siguen distribuidos al cliente | Confirmado; relevante solo si deben ser secretos |
| **P2 — Media** | La equivalencia semántica de Python/Rust no está garantizada por las transformaciones actuales | Riesgo conocido; requiere pruebas de ejecución/compilación |
| **P3 — Baja** | La auditoría no verificó dinámicamente las cabeceras HTTP ni el comportamiento interactivo en navegadores | Pendiente de prueba externa |

---

## 1. P1 — El reinicio de una sesión interactiva puede quedarse bloqueado

### Evidencia

En `src/engine/interactiveExecutionService.ts`, `reset()` genera un identificador nuevo, lo asigna a `this.currentSessionId` y envía un mensaje `RESET_SESSION` con ese ID:

- [interactiveExecutionService.ts, `reset()`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L188-L208)

En `src/engine/interactive.worker.ts`, el manejador `RESET_SESSION` descarta el mensaje si `currentSessionId` es nulo o distinto del ID recibido. El `currentSessionId` del Worker se asigna en `INIT_SESSION`; el bloque `RESET_SESSION` no lo actualiza antes de comprobarlo:

- [interactive.worker.ts, `INIT_SESSION` y `RESET_SESSION`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactive.worker.ts#L32-L129)

El servicio espera una respuesta `SESSION_READY` para resolver la promesa de `reset()`. Si el Worker descarta el mensaje, no envía esa respuesta. En `IDEView.tsx`, `resetExecution()` solo actualiza el ID de la interfaz cuando la promesa se resuelve:

- [IDEView.tsx, `resetExecution()`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L213-L235)

### Impacto

- Reiniciar o seleccionar un ejercicio después de iniciar una sesión puede dejar el estado del editor y el del Worker desincronizados.
- En la primera ejecución, `handleStartOrPause()` llama a `resetExecution()` cuando el ID de sesión es nulo; si el Worker ignora ese `RESET_SESSION`, la promesa no establece `currentSessionId` y el temporizador de reproducción no arranca.
- La promesa de reinicio puede permanecer pendiente indefinidamente.
- El botón de reproducción puede usar un ID de sesión obsoleto y descartar los resultados como eventos desfasados.

### Corrección recomendada

Elegir un protocolo coherente y probarlo de forma explícita. Las alternativas razonables son:

1. Tratar `RESET_SESSION` como transición a una nueva época de sesión: validar que el mensaje procede de la única instancia confiable del Worker, asignar el nuevo ID antes de responder y reemplazar de forma atómica el intérprete/generador; o
2. Usar `INIT_SESSION` para iniciar cada nueva sesión y reservar `RESET_SESSION` para reiniciar únicamente el ID ya activo.

En ambas alternativas, el Worker debe contestar siempre con un mensaje de éxito o error. Añadir timeout al servicio para que ninguna promesa de inicialización quede pendiente indefinidamente.

**Prueba de regresión obligatoria:** iniciar, avanzar, reiniciar el mismo código, cambiar de ejemplo con una sesión activa, pulsar restablecer y comprobar que se recibe respuesta en cada petición y que el nuevo código es el ejecutado.

## 2. P1 — `worker.onerror` descarta resolutores sin completar las promesas

### Evidencia

En `interactiveExecutionService.ts`, `worker.onerror` cambia `isFallback` y llama a `terminate()`. `terminate()` llama a `stop()`, que pone a `null` los callbacks `pendingReadyResolve`, `pendingStepResolve` y `pendingInputResolve` sin invocarlos ni rechazar las promesas asociadas:

- [interactiveExecutionService.ts, `worker.onerror`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L84-L95)
- [interactiveExecutionService.ts, `stop()` y `terminate()`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L210-L230)

### Impacto

Una llamada activa a `start()`, `step()`, `provideInput()` o `reset()` puede quedarse esperando para siempre si el Worker falla. Además, la clase marca fallback, pero no reconstruye automáticamente la sesión vigente ni informa a `IDEView` de que debe invalidar el ID anterior. Hay otra pérdida de diagnóstico: el manejador `SESSION_ERROR` llama al resolutor de preparación con `false`, pero la promesa de `start()`/`reset()` devuelve `{ success: false, sessionId }` sin copiar `data.error`; por eso el consumidor que comprueba `startRes.error` puede no mostrar el mensaje original del Worker.

### Corrección recomendada

- Centralizar la finalización de solicitudes (`resolve`/`reject`) y garantizar que cada solicitud termina una sola vez.
- Ante un error del Worker, cancelar y completar explícitamente todas las operaciones pendientes con un resultado de error tipado.
- Invalidar el ID en la interfaz y ofrecer una recuperación explícita: recrear el Worker y rehidratar el código actual, o entrar al fallback de forma controlada.
- No borrar callbacks antes de resolver/rechazar sus promesas.

**Prueba de regresión obligatoria:** simular un `ErrorEvent` mientras hay un `step()` pendiente y otro mientras espera `provideInput()`; verificar que ninguna promesa queda pendiente y que la UI permite recuperar o reiniciar la sesión.

## 3. P2 — Las llamadas a subprogramas ejecutan generadores en un bucle síncrono

### Evidencia

`invokeSubprogram()` consume todas las instrucciones del subprograma en un bucle `while (true) { gen.next() }`. `executeMethod()` emplea un patrón similar para métodos:

- [interpreter.ts, ejecución de métodos y subprogramas](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L863-L940)

Aunque `runAllAsync()` cede el control entre pasos del generador externo, una sola evaluación de una llamada puede entrar en ese bucle y drenar el subprograma antes de regresar. En el fallback de `InteractiveSession`, `fallbackGen.next()` se ejecuta en el hilo principal:

- [interactiveExecutionService.ts, fallback de `step()`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L125-L167)

### Impacto

- En navegadores sin Worker o cuando el Worker no se puede crear, un subprograma pesado puede congelar temporalmente la interfaz.
- En el Worker interactivo, el mensaje de pausa/detención no se procesa mientras el bucle síncrono está en curso.
- El control de tiempo cooperativo exterior no puede interrumpir una sola llamada que todavía está ejecutando todo el cuerpo del subprograma.

### Corrección recomendada

Reestructurar la evaluación de subprogramas y métodos para que el control de ejecución sea cooperativo de extremo a extremo. Evitar que `evalExpression()` invoque un generador que luego se drena de forma síncrona. Si una reestructuración completa no es viable de inmediato, definir un límite estricto de operaciones internas, registrar el tiempo y documentar que el fallback no brinda el mismo aislamiento que el Worker.

**Prueba de regresión:** ejecutar un subprograma con muchos pasos, medir que la UI siga respondiendo, pulsar detener y comprobar que la ejecución se corta dentro de un presupuesto predecible.

## 4. P2 — El Worker transfiere la salida completa en cada paso

### Evidencia

Cada mensaje `STEP_RESULT` del Worker incluye `outputs: currentInterp.getOutputs()`, es decir, el arreglo de salida acumulado hasta ese momento:

- [interactive.worker.ts, respuesta `STEP_RESULT`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactive.worker.ts#L63-L86)

El intérprete limita la salida a 100.000 caracteres, 4.000 caracteres por línea y 2.000 líneas. Esas cotas evitan crecimiento ilimitado, pero no eliminan el coste de volver a clonar la salida acumulada en cada paso. La interfaz ya añade a la consola `step.outputLog` y mantiene su propio límite de historial:

- [interpreter.ts, límites de salida](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L48-L71)
- [IDEView.tsx, actualización de trazas y consola](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L297-L310)

### Impacto

El coste de serialización puede crecer como la suma de todos los tamaños de salida acumulada a lo largo de los pasos, en lugar de crecer solo con la salida nueva. Esto puede ralentizar algoritmos que escriben frecuentemente.

### Corrección recomendada

Enviar únicamente el delta de salida del paso actual, o quitar `outputs` de `InteractiveStepResult` si ningún consumidor lo necesita. Medir un programa que emita muchas líneas y comprobar el uso de CPU y la latencia entre pasos.

## 5. P2 — Los resolutores únicos no protegen contra solicitudes concurrentes

### Evidencia

`InteractiveSession` guarda un único `pendingStepResolve`, `pendingInputResolve` y `pendingReadyResolve`. Los métodos asignan un callback nuevo antes de enviar su mensaje; si se produce una segunda petición antes de responder la primera, el callback previo puede sobrescribirse:

- [interactiveExecutionService.ts, estado de solicitudes y métodos](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L11-L19)
- [step() y provideInput()](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L125-L185)
- [start() y reset()](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts#L96-L208)

### Impacto

Los dobles clics, reinicios rápidos o cualquier futura llamada simultánea pueden dejar una promesa pendiente o asociar una respuesta al solicitante equivocado.

### Corrección recomendada

Serializar las operaciones que no pueden coexistir (una operación `STEP` a la vez) y usar un `requestId` independiente para cada petición, con un mapa de promesas pendientes. Rechazar explícitamente un segundo `STEP` si ya existe uno pendiente, en lugar de sobrescribir el callback.

## 6. P2 — Los casos ocultos no son confidenciales en una aplicación 100% cliente

Los ejercicios, los casos visibles y los casos adicionales están disponibles a través de los datos cargados por el cliente; el servicio envía `hiddenCases` al Worker de validación:

- [IDEView.tsx, importación de datos del currículo](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L46-L50)
- [executionService.ts, envío de casos al Worker](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/executionService.ts#L158-L170)

Un Worker no es un límite de confidencialidad contra el usuario: los mensajes y los recursos del cliente pueden inspeccionarse. Esto está bien para la práctica, siempre que no se prometa secreto. Si se usará para calificación formal, el servidor debe guardar los casos secretos y calcular la calificación.

## 7. P2 — Transpilación Python/Rust sigue requiriendo validación semántica real

El archivo de transpilación se describe como experimental, declara un alcance educativo y transforma texto mediante expresiones regulares y procesamiento por líneas:

- [transpiler.ts, alcance y transformaciones](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts)

En Rust, la potencia se transforma a `i64::pow(..., as u32)`, lo que no es equivalente a la potencia general del intérprete para exponentes negativos, no enteros o tipos reales. La sintaxis generada puede ser válida para ciertos ejemplos y aun así diferir semánticamente. La revisión estática no demuestra que todos los ejemplos emitidos compilen ni produzcan resultados iguales.

### Corrección recomendada

- Definir con claridad qué construcciones están soportadas por cada destino.
- Preferir generación desde el AST frente a expresiones regulares aplicadas a líneas.
- Ejecutar Python generado en CI y compilar Rust para una matriz de casos de regresión.
- Comparar la salida de los destinos con la salida del intérprete para operadores, entrada/salida, bucles, llamadas y arreglos.
- En conversiones no compatibles, mostrar una advertencia explícita en vez de generar código aparentemente final.

## 8. Aspectos positivos verificados

1. **Límites de recursos del intérprete:** 50.000 pasos, profundidad de llamadas, cuotas de arreglos, 2.000 pasos de traza, 100.000 caracteres de salida, 4.000 caracteres por línea y 2.000 líneas.
2. **Límites de entrada y parser:** el lexer rechaza código fuente mayor a 100.000 caracteres o más de 25.000 tokens; el parser define cotas para profundidad de expresiones, bloques y nodos AST.
3. **Aislamiento:** ya hay un Worker para la ejecución interactiva y otro para la validación masiva; esto mejora notablemente frente a las versiones anteriores.
4. **CI:** `ci.yml` instala con `npm ci` y ejecuta `npm audit --audit-level=high`, lint, tests y build.
5. **Configuración:** TypeScript está en modo `strict`; Vite configura `sourcemap: false`; `public/_headers` define CSP, HSTS y otras cabeceras defensivas.
6. **UI:** las trazas y la consola mantienen límites de historial en React, y el código de ejemplo se guarda localmente.

Estos controles deben conservarse y cubrirse con pruebas de regresión al corregir el protocolo de sesión.

## 9. Plan recomendado de corrección

### Fase A — Bloqueos funcionales (antes de otra versión pública)

- [ ] Corregir `RESET_SESSION` y garantizar respuesta para todos los mensajes del Worker.
- [ ] Resolver/rechazar todas las promesas pendientes en `worker.onerror` y en `stop()`.
- [ ] Evitar que el ID del servicio y el de la interfaz diverjan al reiniciar, seleccionar ejemplo o recibir un error.
- [ ] Añadir tests que simulen las carreras entre `start`, `step`, `reset`, `provideInput` y `stop`.

### Fase B — Rendimiento y cancelación

- [ ] Eliminar la transferencia de la salida acumulada en cada respuesta de paso.
- [ ] Hacer cooperativa la ejecución interna de subprogramas y métodos, o limitar estrictamente sus operaciones internas.
- [ ] Probar cancelación y respuesta del navegador con subprogramas, bucles, salida extensa y entrada de gran tamaño.
- [ ] Añadir un límite para la longitud del valor introducido en `Leer` y evitar duplicar cadenas grandes antes de aplicar los límites de salida.

### Fase C — Transpiladores y seguridad de la evaluación

- [ ] Añadir pruebas de equivalencia entre el intérprete y Python generado.
- [ ] Compilar Rust generado en CI y comparar resultados cuando la construcción esté dentro del alcance soportado.
- [ ] Si se requiere examen secreto, mover casos ocultos y calificación a un backend.
- [ ] Comprobar las cabeceras HTTP reales en `https://pseudoflow.pages.dev/`, incluyendo CSP, HSTS, `X-Content-Type-Options` y `Referrer-Policy`.
- [ ] Confirmar que el commit desplegado coincide con el commit aprobado por CI.

## 10. Criterios mínimos de aceptación para producción

- `npm ci`, `npm audit --audit-level=high`, lint, pruebas y build pasan en el SHA exacto que se va a desplegar.
- El reinicio funciona antes de ejecutar, después de ejecutar y tras cambiar de ejercicio varias veces.
- No hay promesas sin resolver después de errores simulados del Worker, detención o cambio de código.
- La interfaz permanece utilizable y responde a cancelar durante subprogramas largos.
- La salida se trunca dentro de un presupuesto acotado sin duplicar grandes textos innecesariamente.
- Los transpiladores tienen un alcance documentado, pruebas de sintaxis/compilación y pruebas de resultados.
- Se ha comprobado el sitio desplegado y sus cabeceras HTTP; no basta con inspeccionar `public/_headers`.
- La documentación no presenta como secretos los casos de prueba enviados al navegador.

## Fuentes examinadas

- [Repositorio y README](https://github.com/daniel95-sv/PseudoFlow)
- [Sitio publicado](https://pseudoflow.pages.dev/)
- [Intérprete](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts)
- [Lexer](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts)
- [Parser](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts)
- [Servicio de sesión interactiva](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactiveExecutionService.ts)
- [Worker interactivo](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interactive.worker.ts)
- [Servicio de validación](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/executionService.ts)
- [Worker de validación](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/validator.worker.ts)
- [Transpilador](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts)
- [Configuración CI](https://github.com/daniel95-sv/PseudoFlow/blob/main/.github/workflows/ci.yml)
- [Configuración Vite](https://github.com/daniel95-sv/PseudoFlow/blob/main/vite.config.ts)
- [Cabeceras previstas](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers)

## Limitaciones de esta auditoría

Esta revisión se realizó mediante lectura estática de los archivos públicos y consulta del sitio y de GitHub Actions. El entorno de esta auditoría no pudo clonar el repositorio por falta de resolución de red, por lo que **no ejecuté personalmente** `npm ci`, tests, lint, build, pruebas en navegador, compilación de Rust ni una prueba de penetración. Tampoco pude verificar directamente las cabeceras HTTP que entrega el dominio desplegado. Los defectos descritos como confirmados son inconsistencias observables en el código; el impacto real sobre la versión desplegada debe validarse al probarla.
