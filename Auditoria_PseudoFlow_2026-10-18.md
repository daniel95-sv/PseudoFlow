# Auditoría técnica de PseudoFlow — Revisión actual

**Fecha de revisión:** 18 de octubre de 2026  
**Repositorio inspeccionado:** `daniel95-sv/PseudoFlow`, rama `main`  
**Commit más reciente observado en GitHub Actions:** `9941fb3`  
**Aplicación publicada:** https://pseudoflow.pages.dev/  
**Repo:** https://github.com/daniel95-sv/PseudoFlow

## 1. Dictamen ejecutivo

La versión actual presenta mejoras sustanciales respecto de las tres revisiones anteriores. El repositorio incluye pruebas automatizadas con Vitest, límites de entrada y ejecución, validaciones más estrictas en lexer/parser/intérprete, controles del tamaño de arreglos, trazas y salida, y una política CSP en `public/_headers`. La ejecución actual de GitHub Actions para el commit `9941fb3` aparece como **Success**; el flujo declara `npm ci`, `npm audit --audit-level=high`, `npm run lint`, `npm test` y `npm run build`.

**Dictamen:** adecuada para seguir operando como beta educativa y para pruebas de usuarios, pero aún no recomendaría declarar todos los componentes «listos para producción estable» sin resolver las observaciones P1 de aislamiento de ejecución y confidencialidad de evaluaciones (esta última solo si los casos deben ser secretos), y completar pruebas semánticas de los transpiladores.

Esta revisión combina inspección estática de los archivos públicos y consulta del estado visible del CI. No ejecuté localmente `npm ci`, `npm audit`, Vitest, build, pruebas de navegador ni un escáner HTTP de cabeceras; por tanto, no es una prueba de penetración ni una certificación de seguridad. Tampoco pude confirmar por medios independientes que el despliegue de Cloudflare Pages corresponda exactamente al commit `9941fb3`.

## 2. Resumen de prioridades

| ID | Hallazgo | Prioridad | Estado |
|---|---|---|---|
| PF-01 | Intérprete y validación ejecutan trabajo síncrono en el hilo principal | Alta | Abierto |
| PF-02 | Los casos de prueba «ocultos» y sus respuestas llegan al cliente | Alta solo para evaluación secreta | Abierto por diseño cliente |
| PF-03 | Transpilación Python/Rust puede cambiar la semántica del pseudocódigo | Alta funcional | Abierto |
| PF-04 | No se valida el código transpilado ejecutándolo/compilándolo en CI | Alta funcional | Parcial |
| PF-05 | El parser limita longitud/tokens/profundidad de expresión, pero no la profundidad global de bloques/AST | Media | Por reforzar |
| PF-06 | Algunas llamadas internas consumen el generador sin propagar los pasos hacia la interfaz | Media | Por validar según UX deseada |
| PF-07 | Cabeceras de seguridad se definen en repo, pero su efecto real no fue comprobado en producción | Media | Pendiente de verificación HTTP |
| PF-08 | Acciones de GitHub en versiones v4 generan advertencia de runtime Node.js 20 obsoleto | Baja/Media | Abierto |
| PF-09 | README declara Vite 6 aunque `package.json` declara Vite `^8.3.0` | Baja | Abierto |
| PF-10 | Sourcemaps de producción activados | Baja; riesgo de rendimiento/exposición de implementación, no secreto | Abierto |

## 3. Mejoras comprobadas en el código actual

### 3.1 Motor y límites de recursos

- `Lexer` limita el código a 100.000 caracteres y a 25.000 tokens, y reporta caracteres desconocidos, cadenas/comentarios sin cerrar y números mal formados.
- `Parser` tiene límite para la profundidad de expresiones (`MAX_EXPR_DEPTH = 100`).
- `Interpreter` tiene límites de pasos, profundidad de pila de llamadas, tamaño por arreglo, cuota total de elementos de arreglos, líneas de salida y trazas retenidas.
- Los bucles `Mientras` y `Repetir` con cuerpo vacío ahora tienen pruebas de regresión que comprueban que no corren indefinidamente.
- El límite por tiempo de reloj aplica a `runAll`; el modo interactivo ignora el tiempo de pared para no interrumpir a quien lee cada paso. La suite contiene una prueba de pausa interactiva y otra de timeout para ejecución por lotes.
- La interfaz limita sus listas de trazas y consola y guarda el borrador localmente.

Referencias:
- [Lexer: límites de origen y tokens](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts)
- [Parser: límite de profundidad de expresión](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts)
- [Interpreter: opciones y límites](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts)
- [Pruebas del motor](https://github.com/daniel95-sv/PseudoFlow/blob/main/tests/engine.test.ts)
- [IDEView: sincronización y límites de interfaz](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx)

### 3.2 Calidad y CI

La última ejecución visible de [GitHub Actions](https://github.com/daniel95-sv/PseudoFlow/actions/runs/39090149593) para `9941fb3` tiene estado **Success**. El workflow contiene instalación limpia, `npm audit --audit-level=high`, lint, tests y build. Esto es una mejora real: no solo existe un script `test`, sino que se incluye en el pipeline de validación.

### 3.3 Seguridad del despliegue prevista

`public/_headers` define `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS y CSP; también configura caché para recursos estáticos. Esto es una buena base. Sin embargo, el archivo por sí solo no prueba que Pages esté entregando exactamente estas cabeceras en la URL pública.

Referencia: [public/_headers](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers).

## 4. Hallazgos detallados

### PF-01 — La ejecución sigue dentro del hilo principal

**Prioridad:** Alta  
**Impacto:** una ejecución costosa puede congelar la interfaz, demorar la respuesta de pausa/reinicio y empeorar la experiencia en equipos de bajos recursos.

`IDEView.tsx` importa `Lexer`, `Parser` e `Interpreter` directamente y llama a `gen.next()` desde el manejador del paso. La validación de ejercicios recorre todos los casos en un bucle sincrónico y llama `runAll()` para cada uno. No se observó un `Web Worker` integrado en ese flujo.

Los límites de pasos/tiempo hacen que muchos casos sean finitos, pero no garantizan que el navegador pueda procesar a tiempo un clic de cancelación. Además, las llamadas a subprogramas y métodos consumen internamente el generador en bucles síncronos; eso puede impedir que los pasos internos sean visibles e interrumpibles desde la interfaz.

**Recomendación:** mover parsing/ejecución y validación de casos a un `Web Worker`; añadir mensajes `RUN`, `STEP`, `INPUT`, `CANCEL`, `DONE` y `ERROR`; finalizar el Worker ante timeout; limitar longitud de mensajes, trazas y memoria; y conservar un modo interactivo que permita avanzar sin timeout de reloj mientras sí tenga cuota total de instrucciones.

**Criterio de aceptación:** al ejecutar un bucle infinito o una validación costosa, la interfaz sigue respondiendo y el botón «Detener» termina el Worker en un tiempo acotado.

Evidencia: [IDEView.tsx](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx), [interpreter.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts).

### PF-02 — Los casos «ocultos» no son secretos en una SPA

**Prioridad:** Alta únicamente si se usan para exámenes o calificación con respuestas secretas.  
**Impacto:** estudiantes pueden inspeccionar los datos entregados al navegador y recuperar inputs/outputs de los casos marcados como ocultos.

Los ejercicios se importan en `IDEView.tsx`. La validación combina `visibleCases` y `hiddenCases` en el cliente, ejecuta ambos grupos y agrega a los detalles de resultado entradas, salidas esperadas y salidas reales. Ocultar una sección en la interfaz no hace privados los datos incluidos en el bundle/JSON.

**Recomendación:** para práctica individual, documentar que los casos adicionales no son secretos y mantener el modelo simple. Para evaluación formal, enviar al servidor el código y el identificador del ejercicio y mantener los casos privados en backend; devolver solo resultado/diagnóstico sin publicar los valores esperados.

**Criterio de aceptación:** si se anuncia evaluación segura, el paquete del navegador no contiene las entradas/salidas de evaluación secreta.

Evidencia: [IDEView.tsx, validación de ejercicios](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx) y [datos de ejercicios](https://github.com/daniel95-sv/PseudoFlow/tree/main/src/data).

### PF-03 — La transpilación no conserva toda la semántica

**Prioridad:** Alta funcional; el archivo ya se presenta correctamente como experimental, lo cual es positivo.

El transpilador aún analiza el pseudocódigo línea por línea mediante expresiones regulares, en vez de generar desde el AST. La propia cabecera recomienda validar el código producido con el compilador nativo.

Casos concretos por cubrir:

1. **Potencia (`^`)**: el intérprete evalúa `^` con `Math.pow`, pero las asignaciones se transforman mayormente cambiando `<-` por `=`. En Python, `^` significa XOR bit a bit, no potencia; en Rust también es XOR y no es válido para operandos de punto flotante. Por ejemplo, `r <- 2 ^ 3` puede producir un resultado distinto o un error de compilación.
2. **Palabras dentro de cadenas**: `convertConditionToPython` y `convertConditionToRust` sustituyen palabras reservadas mediante regex. Una condición como `Si palabra = "NO" Entonces` puede cambiar el literal de cadena durante la conversión, porque las sustituciones no tokenizan/escapan strings.
3. **Declaraciones Python**: `Definir` se convierte en comentario. Si una variable declarada pero no asignada se lee más adelante, Python puede producir `NameError`, mientras que el intérprete asigna un valor inicial de acuerdo con el tipo.
4. **Algoritmos vacíos en Python**: se genera `def main():`, pero una función con solo comentarios no tiene una instrucción válida. La exportación de un reto vacío puede ser sintácticamente inválida por falta de `pass`.
5. **`Para` con paso negativo dinámico**: la dirección del rango se decide usando `Number(step)` durante la transpilación. Si el paso es una variable y en tiempo de ejecución es negativo, la rama elegida puede ser incorrecta.

**Recomendación:** generar ambos lenguajes desde el AST. Como paso inmediato, traducir potencia a `**` en Python y a `pow`/método equivalente en Rust según el tipo; no transformar contenido de cadenas; inicializar variables con valores válidos; insertar `pass` cuando un bloque Python quede vacío; y rechazar explícitamente las construcciones que el exportador no soporte.

**Criterio de aceptación:** para cada ejemplo soportado, ejecutar el pseudocódigo y también el código Python/Rust generado; comparar salidas y errores, no solo `toContain()` sobre el texto generado.

Evidencia: [transpiler.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts), [interpreter.ts: operador potencia](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts), [tests/engine.test.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/tests/engine.test.ts).

### PF-04 — Los tests de transpilación prueban principalmente texto, no ejecución real

**Prioridad:** Alta funcional.

La suite cubre comparadores, `Leer`, argumentos de `Escribir`, arreglos y rangos generados. Esto es una buena red de regresión, pero muchos tests solo inspeccionan que una cadena aparezca en el resultado. El workflow no invoca explícitamente Python ni `rustc`, por lo que CI puede pasar aun cuando el código generado tenga error sintáctico o una semántica diferente.

**Recomendación:** añadir tests de integración con versiones fijadas de Python 3 y Rust instaladas en CI; ejecutar fixtures representativos para if/else, loops ascendentes/descendentes, `^`, cadenas con palabras reservadas, arrays 1D/2D, entrada tipada y algoritmos vacíos. Mantener también los tests unitarios rápidos.

**Criterio de aceptación:** los ejemplos soportados se compilan/ejecutan y las salidas coinciden con el intérprete; las limitaciones del lenguaje destino se documentan y se reportan en la UI.

Evidencia: [tests/engine.test.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/tests/engine.test.ts), [workflow CI](https://github.com/daniel95-sv/PseudoFlow/blob/main/.github/workflows/ci.yml).

### PF-05 — Falta un límite global de anidamiento/nodos para parser y visualizadores

**Prioridad:** Media.

El lexer limita caracteres/tokens y el parser limita la profundidad de expresiones, pero el límite de expresión no limita la profundidad anidada de bloques (`Si` dentro de `Si`, bucles anidados, clases/métodos) ni el tamaño total del AST. Dado que el parser y los generadores de diagramas son recursivos, una entrada de anidamiento extremo puede causar un error de pila o un bloqueo temporal antes de llegar al intérprete.

**Recomendación:** añadir `MAX_BLOCK_DEPTH` y `MAX_AST_NODES`; medirlos durante parsing; generar un error localizado al superar el límite. Aislar también el parsing y la generación de diagramas en Worker si se pretende aceptar código de gran tamaño.

**Criterio de aceptación:** fixtures con bloques anidados cerca y por encima del límite terminan rápido y producen un error controlado, nunca una excepción sin manejar ni una pestaña congelada.

Evidencia: [lexer.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts), [parser.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts).

### PF-06 — La traza de llamadas a subprogramas puede no ser interactiva paso a paso

**Prioridad:** Media, depende del comportamiento pedagógico deseado.

En las rutas de invocación de subprogramas/métodos, el intérprete consume el generador del cuerpo mediante un bucle `gen.next()` interno. Esto procesa la función sin propagar cada `yield` al generador exterior. Los pasos internos pueden quedar registrados en el historial interno, pero la UI podría saltar del estado previo a la llamada directamente al resultado de la llamada sin permitir pausar/avanzar instrucción por instrucción dentro del procedimiento.

**Recomendación:** confirmar si se espera depuración paso a paso dentro de funciones y métodos. Si sí, propagar los yields hacia el generador exterior y añadir pruebas de integración que comprueben que las líneas internas aparecen en la interfaz y el historial en el orden esperado.

Evidencia: [interpreter.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts).

### PF-07 — Verificar la CSP y cabeceras realmente servidas

**Prioridad:** Media.

El repositorio incluye CSP y cabeceras defensivas. La política permite `style-src 'unsafe-inline'` y `img-src https:`. No considero esto por sí solo una vulnerabilidad confirmada: puede ser necesario por el estilo inline actual y por las imágenes permitidas. Sí reduce la restricción de la política respecto a una lista cerrada de orígenes.

**Recomendación:** verificar con una petición HTTP desde fuera las cabeceras de `https://pseudoflow.pages.dev/` y de recursos, confirmar que `_headers` se copia y aplica al desplegar, revisar CSP en navegador y, si es posible, usar primero `Content-Security-Policy-Report-Only`. Endurecer `img-src` a dominios necesarios y documentar por qué se necesita `unsafe-inline`; no eliminarlo sin probar estilos.

**Criterio de aceptación:** informe automatizado de cabeceras HTTP adjunto al release y ausencia de errores CSP en las funciones soportadas.

Evidencia: [public/_headers](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers).

### PF-08 — Advertencia de runtime en GitHub Actions

**Prioridad:** Baja/Media.

La última ejecución visible informa que `actions/checkout@v4` y `actions/setup-node@v4` tienen un runtime basado en Node.js 20 que está obsoleto y se forzará a Node.js 24. El pipeline actual terminó correctamente, así que no es un bloqueo actual, pero conviene actualizar las acciones a versiones soportadas después de verificar compatibilidad.

**Recomendación:** planificar actualización de acciones y fijar versiones/SHAs según la política de cadena de suministro del proyecto. Mantener permisos mínimos de `GITHUB_TOKEN` (`contents: read`) para un flujo que solo valida.

Evidencia: [run de CI `9941fb3`](https://github.com/daniel95-sv/PseudoFlow/actions/runs/39090149593), [ci.yml](https://github.com/daniel95-sv/PseudoFlow/blob/main/.github/workflows/ci.yml).

### PF-09 — Documentación técnica desactualizada

**Prioridad:** Baja.

`README.md` declara Vite 6, mientras que el `package.json` actual declara `vite: ^8.3.0`. Esto puede confundir contribuyentes al depurar compatibilidades o reproducir el entorno.

**Recomendación:** actualizar tecnologías declaradas, scripts y guía de desarrollo desde `package.json`, y documentar explícitamente el alcance experimental del transpilador y las limitaciones del modo 100 % cliente.

Evidencia: [README.md](https://github.com/daniel95-sv/PseudoFlow/blob/main/README.md), [package.json](https://github.com/daniel95-sv/PseudoFlow/blob/main/package.json).

### PF-10 — Sourcemaps de producción

**Prioridad:** Baja.

`vite.config.ts` declara `build.sourcemap: true`. Al publicar `.map`, se hace más fácil reconstruir y depurar el código fuente del bundle. Como el repositorio ya es público y no hay backend con secretos identificados, esto no constituye por sí mismo una filtración de credenciales; el impacto principal es tamaño de artefactos y exposición innecesaria de detalles de implementación.

**Recomendación:** desactivar sourcemaps públicos en producción o subirlos a un servicio privado de error tracking; comprobar que no se estén empaquetando secretos (nunca deben estar en un frontend).

Evidencia: [vite.config.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/vite.config.ts).

## 5. Correcciones anteriores que considero cerradas o sustancialmente mejoradas

- Sincronización editor/ejecución: los manejadores de selección de ejemplo, ejercicio y solución pasan el nuevo código a `resetExecution(newCode)`.
- Errores de ejecución: la UI tiene un panel específico para `runtimeError` y botón de reinicio.
- Entrada inválida en lexer y cadenas/comentarios sin cerrar: hay validaciones y pruebas.
- Errores de variables desconocidas y varias validaciones semánticas: hay pruebas de regresión.
- Bucle infinito de cuerpo vacío: hay tests explícitos para `Mientras` y `Repetir`.
- Timeout falso en modo paso a paso: el modo interactivo evita el timeout de pared y hay una prueba que simula una pausa superior al límite.
- Límites de arrays y salida/trazas: hay cuotas en el intérprete y límites adicionales en la interfaz.
- TypeScript estricto, Vitest y CI: aparecen configurados y la última ejecución pública del workflow revisada terminó en éxito.
- Encabezados de seguridad en configuración: la política y las cabeceras están definidas en `public/_headers`, aunque deben verificarse en la respuesta HTTP real.

## 6. Plan recomendado para la siguiente iteración

### P0/P1 — Antes de declarar producción estable

1. Implementar Worker para parseo/ejecución/pruebas y cancelación efectiva.
2. Añadir límite de profundidad de bloques y límite de nodos AST.
3. Añadir tests de regresión de potencia y literales con `Y`, `O`, `NO`, `Verdadero` o `Falso` dentro de cadenas.
4. Ejecutar código Python generado en CI y compilar código Rust generado para fixtures soportados.
5. Decidir si los casos ocultos son solo formativos o parte de una evaluación segura; si son secretos, moverlos a backend.

### P2 — Calidad y mantenibilidad

6. Decidir y probar el stepping dentro de subprogramas/métodos.
7. Verificar la CSP y cabeceras HTTP en el dominio real.
8. Actualizar acciones de GitHub, permisos mínimos y documentación de tecnologías.
9. Revisar estrategia de sourcemaps de producción.

## 7. Lista de aceptación de release

- [ ] El build de producción está verde en un entorno limpio.
- [ ] `npm audit --audit-level=high`, lint y Vitest pasan en CI.
- [ ] Un bucle infinito no congela la interfaz; «Detener» interrumpe el Worker.
- [ ] Bloques anidados extremos producen un error de límite, no un fallo de pila.
- [ ] El modo paso a paso no falla por pausas largas y conserva el límite de instrucciones.
- [ ] Python y Rust generados para cada construcción soportada compilan/ejecutan y coinciden con la salida del intérprete.
- [ ] Si hay evaluación secreta, los casos de prueba no están en el paquete cliente.
- [ ] Las cabeceras HTTP reales se verifican después de desplegar.
- [ ] README y dependencias describen versiones actuales.
- [ ] Se decide explícitamente si los sourcemaps deben ser públicos.

## 8. Fuentes principales consultadas

- [Repositorio y README](https://github.com/daniel95-sv/PseudoFlow)
- [Última ejecución visible de CI: commit `9941fb3`](https://github.com/daniel95-sv/PseudoFlow/actions/runs/39090149593)
- [Workflow de CI](https://github.com/daniel95-sv/PseudoFlow/blob/main/.github/workflows/ci.yml)
- [IDEView.tsx](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx)
- [Interpreter.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts)
- [Parser.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts)
- [Lexer.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts)
- [Transpiler.ts](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts)
- [Tests del motor](https://github.com/daniel95-sv/PseudoFlow/blob/main/tests/engine.test.ts)
- [Cabeceras de seguridad](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers)
- [Configuración Vite](https://github.com/daniel95-sv/PseudoFlow/blob/main/vite.config.ts)
- [Package.json](https://github.com/daniel95-sv/PseudoFlow/blob/main/package.json)

---

**Conclusión:** los cambios recomendados en las auditorías anteriores sí produjeron mejoras verificables, y el CI más reciente visible está en verde. El proyecto es más robusto que en las revisiones previas. Para dar el siguiente paso hacia producción estable, concentraría el esfuerzo en aislar la ejecución, comprobar la equivalencia real del código transpilado y definir claramente si los casos de prueba necesitan confidencialidad.
