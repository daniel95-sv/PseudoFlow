# Auditoría completa de PseudoFlow

**Fecha:** 18 de octubre de 2026  
**Repositorio revisado:** https://github.com/daniel95-sv/PseudoFlow  
**Sitio publicado:** https://pseudoflow.pages.dev/  
**Rama observada:** `main`  
**Último flujo de CI consultado:** ejecución #12, commit `0344544`, completada correctamente.

## 1. Resumen ejecutivo

PseudoFlow ha incorporado mejoras relevantes desde las auditorías anteriores: protección contra códigos demasiado grandes, límite de tokens y profundidad de expresiones, control de pasos/tiempo/recursión/arreglos, historial limitado en la interfaz, validación de ejercicios en un `Web Worker`, CSP, TypeScript estricto, pruebas automatizadas, lint y auditoría de dependencias en CI. La ejecución #12 de GitHub Actions aparece como exitosa e incluye los pasos de `npm audit`, lint, pruebas y build.

**Veredicto:** buen avance y base razonable para una beta educativa, pero no recomiendo declarar todavía la aplicación como producción estable de alta fiabilidad. Hay riesgos de rendimiento en la ejecución interactiva, limitaciones de la generación de código a Python/Rust y exposición inevitable de casos de prueba que se distribuyen al cliente.

La inspección fue principalmente estática sobre el repositorio público y la configuración de CI. No pude descargar y ejecutar el proyecto en un entorno aislado ni realizar una batería manual de navegador, compilación nativa de Rust/Python o pruebas de carga. Por ello, este documento distingue defectos visibles en el código de validaciones que todavía requieren ejecución real.

## 2. Estado de correcciones anteriores

| Área | Estado observado | Evaluación |
|---|---|---|
| TypeScript estricto | Configurado en la aplicación | Mejora confirmada |
| Pruebas automatizadas | Script `npm test` con Vitest | Mejora confirmada; falta valorar cobertura y calidad de casos |
| Integración continua | `npm ci`, `npm audit --audit-level=high`, lint, tests y build | Mejora confirmada; última ejecución consultada exitosa |
| Límites de entrada | Lexer limita el código a 100.000 caracteres y 25.000 tokens | Mejora confirmada |
| Profundidad de expresiones | Parser limita profundidad de expresiones a 100 | Mejora confirmada; no equivale a limitar toda la profundidad de bloques anidados |
| Pasos y tiempo | Límites de pasos y tiempo de ejecución en el intérprete | Mejora confirmada; ejecución síncrona sigue pudiendo bloquear durante un tramo de trabajo |
| Arrays | Límites por arreglo y total asignado | Mejora confirmada; el contador es acumulativo y puede rechazar programas que reasignan/liberan datos de ámbito local |
| Histórico de UI | Máximo de 1.000 elementos de trazas/consola en IDE | Mejora confirmada |
| Validación de ejercicios | Worker con watchdog de 12 s y cancelación por terminación | Mejora confirmada, pero el fallback puede bloquear hasta el timeout síncrono por caso |
| CSP y cabeceras | `public/_headers` define CSP y cabeceras defensivas | Configuración presente; falta verificar respuesta HTTP real en producción |
| Casos secretos | `exercises.json` se importa desde el cliente | No resuelto si se requiere confidencialidad para exámenes |
| Transpiladores | Mejoras para proteger cadenas y convertir operadores comunes | Parcial; siguen siendo transformaciones basadas en líneas/regex, no un generador desde AST |

## 3. Hallazgos priorizados

### P1 — El intérprete paso a paso sigue en el hilo principal

**Evidencia:** `src/components/IDEView.tsx` importa directamente `Lexer`, `Parser` e `Interpreter`. `resetExecution()` crea el intérprete y `generateSteps()` en la UI; `handleStepForward()` solicita `gen.next()` en el hilo principal. Por otro lado, `src/engine/executionService.ts` crea `validator.worker.ts` para ejecutar la validación masiva, no para la sesión interactiva ordinaria.

**Impacto:** un algoritmo con expresiones caras, una estructura profundamente anidada o una operación costosa puede hacer que la interfaz tarde en responder. Los límites reducen el riesgo, pero no garantizan respuesta fluida si el trabajo sincrónico monopoliza el hilo principal.

**Recomendación:** mover parseo/ejecución del programa de usuario a un Worker dedicado también para ejecución interactiva. Enviar mensajes de `STEP`, `RUN`, `PAUSE`, `INPUT`, `CANCEL` y errores con identificadores de sesión. Terminar y recrear el Worker al cancelar para tener una vía efectiva de interrupción. Mantener en React solo la presentación y el estado de UI.

**Pruebas de aceptación:** ejecutar un bucle infinito y cancelar; la interfaz debe seguir respondiendo y detener el trabajo en un tiempo acotado. Probar también expresión costosa, entrada `Leer`, pausa/reanudación y carga de un segundo programa mientras uno anterior está detenido.

### P1 — El fallback de validación puede congelar la UI por caso

**Evidencia:** `runAsyncValidationFallback()` cede el control al event loop entre casos, pero `testInterp.runAll(..., 2500)` se ejecuta sincrónicamente dentro de cada iteración. El Worker tiene watchdog de 12 segundos, pero si el navegador no admite Worker o la creación falla, el fallback puede bloquear la UI hasta aproximadamente 2,5 segundos por caso individual.

**Impacto:** el comentario del servicio indica que la UI nunca se congela, pero el fallback no garantiza esa propiedad durante la ejecución de un caso; solo cede control entre casos.

**Recomendación:** tratar la ejecución del fallback como modo de compatibilidad de mejor esfuerzo y reducir el trabajo síncrono por tramo, o deshabilitar la validación si no se puede crear un Worker para programas no confiables. Otra opción es ejecutar segmentos limitados por pasos y devolver el control periódicamente. No confiar en `setTimeout` entre casos como aislamiento temporal para un único caso.

**Pruebas de aceptación:** simular fallo de creación de Worker y ejecutar un caso que se aproxime al timeout; medir el tiempo de bloqueo perceptible y comprobar que el botón cancelar puede responder.

### P1 — Los casos llamados “ocultos” no pueden ser secretos en una aplicación 100 % cliente

**Evidencia:** `IDEView.tsx` importa `src/data/exercises.json`; el servicio y el Worker reciben `visibleCases` y `hiddenCases`; ambos devuelven información detallada sobre casos y salidas esperadas.

**Impacto:** cualquier usuario puede inspeccionar los archivos descargados, el código fuente o los mensajes de validación y recuperar respuestas. Mostrar menos información en la interfaz no protege datos enviados al dispositivo.

**Recomendación:** para ejercicios autodidácticos, llamar a esos casos “casos adicionales” y asumir que son públicos. Si se necesita calificación formal, guardar pruebas secretas en un backend y devolver solo un resultado mínimo, evitando incluir respuestas esperadas en el bundle.

### P1 — La transpilación sigue siendo de alcance limitado y puede diferir del intérprete

**Evidencia:** `src/engine/transpiler.ts` se describe como experimental. `transpileToPython()` y `transpileToRust()` procesan líneas y expresiones con patrones; no consumen el AST del parser. Hay transformaciones de operadores, expresiones, bucles y arreglos realizadas por regex.

**Riesgos concretos:**

- El patrón de potencia de Rust solo cubre formas limitadas de operandos; expresiones anidadas, potencias con signo negativo y precedencia compleja pueden generar una traducción incorrecta.
- `convertArrayIndices()` convierte arreglos multidimensionales dividiendo los índices por comas; no representa un parser completo de expresiones anidadas.
- El tratamiento de `Para`/`for`, variables, clases, tipos y mutabilidad puede no ser semánticamente equivalente al intérprete en todos los programas admitidos.
- El código generado puede ser sintácticamente válido y aun así calcular un resultado distinto.

**Recomendación:** generar Python y Rust desde el AST, con reglas explícitas por nodo y por lenguaje. Mientras tanto, mostrar las limitaciones por característica y etiquetar los resultados como experimentales. Añadir pruebas diferenciales: mismo pseudocódigo, mismas entradas y comparación de salida del intérprete contra Python ejecutado y Rust compilado.

### P2 — Posible agotamiento de pila por anidamiento de bloques

**Evidencia:** el parser declara `MAX_EXPR_DEPTH` para expresiones, y el lexer limita fuente/tokens, pero no observé una limitación equivalente dedicada a la profundidad de bloques anidados como `Si`, `Mientras`, clases o subprogramas.

**Impacto potencial:** un código de menos de 100.000 caracteres y 25.000 tokens aún puede crear estructuras muy profundamente anidadas. Si la implementación recursiva desciende por esos bloques, puede producir `Maximum call stack size exceeded`, afectando los diagramas o bloqueando el análisis del documento. Este punto requiere prueba de regresión para confirmarse como explotable en la versión publicada.

**Recomendación:** implementar un contador común de profundidad de parseo/bloques y emitir un error de sintaxis controlado antes de alcanzar la pila del motor JavaScript. Limitar también profundidad/número de nodos del AST antes de generar diagramas y estructogramas.

### P2 — La cuota total de arreglos cuenta asignaciones acumuladas, no necesariamente memoria viva

**Evidencia:** `totalAllocatedArrayElements` aumenta cuando se ejecuta `Dimension`, y se reinicia al reiniciar el intérprete. No se descuenta al salir de un subprograma/ámbito o cuando un arreglo deja de estar referenciado.

**Impacto:** programas que dimensionan arreglos temporales dentro de funciones invocadas repetidamente podrían rebasar la cuota acumulada aun si cada llamada libera su ámbito y la memoria viva real es moderada. Es una defensa conservadora contra abuso, pero puede generar falsos positivos pedagógicos.

**Recomendación:** documentar la cuota como presupuesto acumulativo intencional o hacer seguimiento de memoria por ámbito y liberar el contador cuando un frame sale. Añadir pruebas con procedimientos que crean arrays locales de forma repetida y diferenciar “elementos asignados durante la ejecución” de “elementos vivos simultáneos”.

### P2 — Source maps habilitados en build de producción

**Evidencia:** `vite.config.ts` fija `build.sourcemap: true`.

**Impacto:** los mapas pueden publicar el código fuente, nombres y estructura de los módulos, y aumentan artefactos/transferencia. El repositorio ya es público, por lo que no es una fuga de secreto en sí, pero sí se debe decidir intencionadamente.

**Recomendación:** si no necesitas depurar producción mediante source maps públicos, usar `sourcemap: false` para el despliegue público o subir mapas privados a un servicio de errores. Verificar que los `.map` no quedan publicados por accidente. Si mantienes el modo actual, documentar la decisión y confirmar que no se incluyen secretos/configuración sensible en el código fuente.

### P2 — Endurecer la cadena de suministro y los permisos de CI

**Evidencia:** el workflow usa `actions/checkout@v4` y `actions/setup-node@v4`, y ejecuta `npm audit --audit-level=high`, lint, tests y build. No declara un bloque explícito `permissions`.

**Impacto:** las etiquetas mayores son prácticas comunes, pero no son referencias inmutables; el alcance efectivo de `GITHUB_TOKEN` puede depender de la configuración del repositorio. El chequeo de dependencias es una buena defensa, pero no reemplaza el endurecimiento del workflow.

**Recomendación:** declarar permisos mínimos explícitos (por ejemplo, `contents: read` para un workflow que solo valida), evaluar la fijación de acciones de terceros a SHA completo y habilitar protección de ramas con CI obligatoria. Mantener lockfile y revisar las actualizaciones automáticas de dependencias.

### P2 — Las cabeceras están configuradas, pero falta comprobar las respuestas reales del dominio

**Evidencia:** `public/_headers` contiene CSP con `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `worker-src 'self' blob:`, HSTS y otras cabeceras. La CSP permite `style-src 'unsafe-inline'` y `img-src https:`.

**Impacto:** la configuración del repositorio no garantiza por sí sola el comportamiento de Cloudflare Pages tras cada despliegue. Las directivas permisivas pueden ser necesarias para ciertas partes de la app, pero deben ser deliberadas.

**Recomendación:** comprobar las cabeceras de la respuesta HTTP de `/`, assets y rutas de error en el dominio publicado. Probar la CSP con navegador, revisar la consola y reducir `img-src https:` a dominios concretos cuando sea compatible. Evaluar `style-src-attr` separado para minimizar `unsafe-inline` si la app puede funcionar con ello.

## 4. Aspectos positivos

- Arquitectura estática sin backend para las operaciones educativas básicas, lo que reduce la superficie de servidor.
- Lexer limita la fuente a 100.000 caracteres y 25.000 tokens.
- Parser limita la profundidad de expresiones a 100.
- Intérprete controla pasos, tiempo, profundidad de llamadas, elementos por arreglo y salida; las trazas internas están limitadas.
- La IDE limita las trazas y la consola almacenadas en estado React.
- Validación de ejercicios en un Web Worker con progreso, timeout global y capacidad de terminación.
- `package.json` incorpora `test`, `lint` y `build`.
- CI instala desde lockfile, comprueba dependencias con `npm audit`, ejecuta lint, pruebas y compilación.
- `public/_headers` contiene una base defensiva razonable de CSP, anti-iframe, no-sniff y Referrer-Policy.
- La configuración de Vite divide algunos paquetes y el código de módulos/datos; esto puede mejorar la carga inicial, pero necesita mediciones en producción.

## 5. Plan recomendado para cerrar la auditoría

### Fase A — Antes de declarar producción estable

1. Implementar un Worker para la ejecución interactiva, no solo para validar ejercicios.
2. Corregir el fallback de validación para no ejecutar tramos de hasta 2,5 segundos de forma síncrona en el hilo de UI.
3. Definir el modelo de casos adicionales: públicos para práctica; privados solo en backend si existe calificación.
4. Añadir límites de profundidad de bloques y tamaño/número de nodos del AST.
5. Agregar pruebas diferenciales que ejecuten código Python y compilen/ejecuten Rust para las características soportadas.
6. Verificar las cabeceras reales del dominio publicado y decidir si los source maps deben ser públicos.

### Fase B — Fiabilidad y mantenimiento

1. Añadir pruebas de cancelación, pausa/reanudación, `Leer`, bucles vacíos, errores de ejecución y reinicio rápido de programas.
2. Añadir pruebas de estrés con source/tokens cercanos al máximo, arrays cerca de cuota y trazas largas.
3. Publicar una matriz de compatibilidad del pseudocódigo para el intérprete, Python y Rust.
4. Declarar permisos mínimos de CI y establecer reglas de protección de rama.
5. Medir rendimiento de carga e interacción en escritorio y móvil con herramientas de navegador y un objetivo de rendimiento definido.

## 6. Criterios de aceptación recomendados

- [ ] Un bucle infinito puede terminarse sin recargar la página y la interfaz sigue respondiendo.
- [ ] La ejecución interactiva en modo paso a paso no comparte el hilo principal con trabajo arbitrario del programa.
- [ ] La validación de un caso largo no bloquea la UI si falla la creación del Worker.
- [ ] Código con bloques anidados extremos produce un error controlado, no un stack overflow.
- [ ] Las pruebas de transpilación se ejecutan en los runtimes reales de Python y Rust.
- [ ] Las diferencias de semántica entre lenguajes están documentadas por característica.
- [ ] No hay casos de examen confidenciales en datos servidos al navegador.
- [ ] CI obligatoria pasa `npm ci`, `npm audit --audit-level=high`, lint, tests y build.
- [ ] Cabeceras CSP/HSTS/Referrer-Policy observadas en la web publicada coinciden con la política esperada.
- [ ] Se decide explícitamente si se publican source maps de producción.

## 7. Fuentes revisadas

- Repositorio: https://github.com/daniel95-sv/PseudoFlow
- Historial de CI: https://github.com/daniel95-sv/PseudoFlow/actions
- `package.json`: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/package.json
- Workflow CI: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/.github/workflows/ci.yml
- Cabeceras de Cloudflare Pages: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/public/_headers
- IDE: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/components/IDEView.tsx
- Intérprete: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/engine/interpreter.ts
- Lexer: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/engine/lexer.ts
- Parser: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/engine/parser.ts
- Servicio de validación: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/engine/executionService.ts
- Worker de validación/ejecución: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/engine/validator.worker.ts
- Transpilador: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/src/engine/transpiler.ts
- Configuración Vite: https://raw.githubusercontent.com/daniel95-sv/PseudoFlow/main/vite.config.ts
- Sitio: https://pseudoflow.pages.dev/

## Conclusión

PseudoFlow ha avanzado de manera visible y cuenta con controles de ingeniería mucho mejores que en las revisiones anteriores. La CI exitosa es una señal positiva, pero no es una certificación del comportamiento real en navegador. La recomendación es mantener el producto en beta educativa mientras se aísla el intérprete interactivo, se fortalece el fallback del Worker y se valida la equivalencia de los transpiladores. Si se van a usar ejercicios para evaluación formal, los casos secretos deben dejar de distribuirse en el cliente.
