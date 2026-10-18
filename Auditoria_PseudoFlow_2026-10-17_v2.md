# Segunda auditoría de PseudoFlow

**Fecha:** 17 de octubre de 2026  
**Repositorios revisados:** [GitHub – daniel95-sv/PseudoFlow](https://github.com/daniel95-sv/PseudoFlow) y [sitio publicado](https://pseudoflow.pages.dev/)  
**Tipo:** auditoría estática del código público y configuración de despliegue. No equivale a una prueba de penetración ni a una validación dinámica de extremo a extremo.

## 1. Resumen ejecutivo

La nueva versión muestra mejoras técnicas sustanciales respecto de la revisión anterior. Ya aparecen límites de profundidad recursiva, pasos de ejecución y tamaño de arreglos; el lexer falla ante caracteres desconocidos y cadenas/comentarios sin cerrar; las variables y funciones no definidas producen errores; el editor invalida el intérprete al cambiar el código y reinicia con el texto explícito del ejercicio; TypeScript estricto y una CSP también están presentes.

**Estado recomendado: apto para una beta educativa pública con advertencias; todavía no recomendaría declarar el motor “listo para producción” sin las correcciones P1 de ejecución y sin una suite automatizada.** El principal riesgo restante es la disponibilidad del navegador: la evaluación ejecuta código síncronamente en el hilo principal y el contador de pasos no cubre todas las iteraciones internas de bucles. También siguen estando expuestos los denominados casos de prueba ocultos y las soluciones, porque se distribuyen al cliente.

No he confirmado una vulnerabilidad de ejecución remota en el servidor. PseudoFlow se describe como una SPA sin backend y el motor interpreta un AST propio. Eso no evita que un algoritmo malformado o infinito bloquee la pestaña.

## 2. Alcance y limitaciones

- Revisé `interpreter.ts`, `lexer.ts`, `parser.ts`, `transpiler.ts`, `IDEView.tsx`, `exercises.json`, `package.json`, `tsconfig.app.json`, `public/_headers`, `index.html` y `src/index.css`.
- La página publicada respondió con metadatos, pero la herramienta de navegación no permitió interactuar con la aplicación JavaScript como lo haría un navegador real.
- No ejecuté `npm run build`, `npm run lint`, pruebas unitarias, `npm audit`, escaneo SCA/SAST, pruebas de carga ni comprobación de cabeceras HTTP efectivamente entregadas. Tampoco pude confirmar que el despliegue público corresponda exactamente al último commit de `main`.
- Por lo anterior, las conclusiones sobre código son hallazgos de revisión estática. La ausencia de resultados de escáner no debe interpretarse como ausencia de vulnerabilidades.

## 3. Cambios recomendados que sí parecen corregidos

| Hallazgo anterior | Estado en el código revisado | Evidencia |
|---|---|---|
| El código recién seleccionado podía no ser el que ejecutaba el intérprete | **Corregido en los flujos revisados.** `resetExecution(targetCode)` analiza ese texto explícito, y seleccionar ejercicio/ejemplo/archivo lo usa. El editor invalida intérprete y generador al editar. | [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L100-L197), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L286-L324), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L664-L681) |
| Errores de ejecución no visibles | **Mejorado.** Ahora hay `runtimeError`, banner de error y registro de consola. | [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L168-L197), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L632-L647) |
| Caracteres extraños se ignoraban | **Corregido.** El lexer lanza error léxico con línea y columna. | [`lexer.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts#L219-L231) |
| Comentarios/cadenas sin cierre se aceptaban | **Corregido** para los casos visibles revisados. | [`lexer.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts#L32-L55), [`lexer.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts#L260-L284) |
| Variable o función desconocida devolvía un `0` engañoso | **Corregido.** Ahora se lanza error específico. | [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L654-L708), [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L710-L733) |
| Arreglos sin validar tamaño | **Parcialmente corregido.** Valida valores finitos/positivos y número total de elementos. Queda un problema de coste de snapshots (ver P1-2). | [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L166-L195) |
| Falta de límites explícitos del motor | **Parcialmente corregido.** Hay límites configurables de 50 000 pasos, 100 niveles de llamadas y 100 000 elementos por arreglo; el límite de pasos no protege todos los ciclos. | [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L23-L55), [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L145-L149) |
| TypeScript permisivo | **Mejorado.** `strict` y `noImplicitAny` están activados. Aún se puede valorar `noUncheckedIndexedAccess`. | [`tsconfig.app.json`](https://github.com/daniel95-sv/PseudoFlow/blob/main/tsconfig.app.json#L238-L279) |
| Faltaban cabeceras de seguridad en la configuración del proyecto | **Mejorado.** `_headers` ya define HSTS, protección contra framing, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y CSP. Falta comprobar las cabeceras efectivas del dominio en producción. | [`public/_headers`](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers#L0-L14) |
| Diseño móvil sin breakpoints evidentes | **Mejorado.** La hoja de estilo incluye reglas para tabletas y móviles. Eso no sustituye pruebas manuales de usabilidad. | [`index.css`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/index.css#L758-L934) |

## 4. Hallazgos nuevos o todavía pendientes

### P1 — El límite de pasos puede ser eludido por ciclos sin instrucciones

El motor comprueba `maxSteps` al entrar en `executeStatement`. Sin embargo, los bucles `Mientras`, `Repetir` y `Para` también aumentan `stepNumber` internamente, y en esos puntos no llaman al mismo control de límite. Un bucle `Mientras Verdadero Hacer` con cuerpo vacío puede iterar indefinidamente sin alcanzar una nueva comprobación del límite. Un `Para` con un rango desmesurado y cuerpo vacío puede consumir tiempo de forma similar.

Además, `runAll()` itera el generador en un `while` síncrono y la suite de ejercicios llama a `runAll()` en la interfaz principal. Si una ejecución no termina, el usuario puede perder la capacidad de pulsar Pausa o reiniciar.

**Corrección recomendada:** extraer un método central `consumeStep()` o `checkBudget()` y llamarlo en cada iteración de cada tipo de bucle y dentro de llamadas a subprogramas. Añadir un límite de tiempo de pared. Para control real de cancelación y aislamiento de la interfaz, ejecutar la evaluación en un `Web Worker` y terminarlo al exceder el presupuesto.

Evidencia: [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L117-L149) y [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L285-L353).

### P1 — Los snapshots pueden consumir cantidades excesivas de CPU y memoria

Cada `TraceStep` guarda un snapshot de variables. `formatValue()` convierte arreglos recursivamente a cadenas completas. Por tanto, el límite de 100 000 elementos por arreglo no limita el tamaño del historial: con arreglos grandes y muchos pasos, el motor puede volver a formatear y almacenar repetidamente grandes estructuras. El presupuesto de pasos y el de elementos son límites independientes y permiten una combinación potencialmente costosa.

**Corrección recomendada:** no volcar arreglos completos en cada snapshot; mostrar tamaño y vista parcial, almacenar deltas/solo variables cambiadas, poner un presupuesto agregado para bytes o snapshots y limitar también la salida de consola. Añadir un caso de carga con arreglo grande dentro de un ciclo.

Evidencia: [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L88-L101), [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L145-L195), [`interpreter.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts#L813-L819).

### P1 — Los casos “ocultos” y las soluciones no son secretos

`exercises.json` se importa desde el cliente e incluye `hiddenCases`, entradas y `expectedOutputs`, además de `referenceSolution_es`. `handleValidateExercise()` combina casos visibles y adicionales en el navegador. Si una prueba falla, la interfaz muestra la salida esperada de los casos adicionales; más importante aún, el JSON completo es inspeccionable en los recursos estáticos, aunque la interfaz no lo muestre.

La selección de un ejercicio también carga directamente `referenceSolution_es`. Eso está bien si se trata de una función de “ver solución”, pero si el propósito es que el estudiante resuelva primero el problema, la experiencia actualmente revela la respuesta desde el inicio.

**Corrección recomendada:** para práctica individual, etiquetar los casos como adicionales/no confidenciales y separar claramente “Empezar ejercicio” de “Ver solución”. Para evaluación con resultados fiables o calificación, mover pruebas secretas y validación al servidor; ningún dato distribuido al navegador puede considerarse secreto.

Evidencia: [`exercises.json`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/data/exercises.json#L163-L192), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L237-L278), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L286-L301), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L699-L727).

### P1 — No hay una suite automatizada registrada en los scripts del proyecto

`package.json` declara `build`, `lint`, `dev` y `preview`, pero no un script de pruebas. El código cubre muchas construcciones de un lenguaje propio, así que una prueba manual con unos pocos ejemplos no basta para asegurar que no se rompan otras funciones al cambiar parser o motor.

**Corrección recomendada:** agregar pruebas unitarias para lexer/parser/intérprete/transpiladores, pruebas de regresión para cada bug corregido y tests de extremo a extremo en navegador para editar, seleccionar ejemplo, reiniciar, introducir datos y detener una ejecución. En CI, bloquear merges y despliegues si fallan `npm ci`, `npm run build`, `npm run lint` o `npm test`. No vi un workflow de GitHub Actions en la lista pública revisada.

Evidencia: [`package.json`](https://github.com/daniel95-sv/PseudoFlow/blob/main/package.json#L242-L293).

### P1 — El transpilador sigue siendo una transformación por líneas y expresiones regulares

El cambio para no convertir `<=`, `>=`, `!=` y `:=` al sustituir `=` es una mejora real. Sin embargo, los generadores de Python y Rust siguen analizando texto línea por línea, sin traducir el AST. No es una transformación semánticamente completa del lenguaje.

Casos que requieren pruebas antes de presentar la salida como código fiable:

- Python genera `int(input())` para `Leer`, sin distinguir cadena, real o lógico.
- El manejo de `Dimension` en Python contempla explícitamente solo una o dos dimensiones; para más dimensiones no genera una instrucción equivalente.
- La sustitución de operadores en condiciones trabaja con texto, así que expresiones complejas o caracteres de operador dentro de literales de cadena pueden producir conversiones incorrectas.
- Rust solo implementa un subconjunto de instrucciones y no se observa una fase que compile el código generado para verificar sintaxis y tipos.

**Corrección recomendada:** transformar desde el AST, declarar de forma explícita las construcciones soportadas y emitir un diagnóstico cuando una instrucción no pueda traducirse. Añadir compilación de Python (`ast.parse` o `compile`) y Rust (`rustc`) en pruebas CI de fixtures representativos.

Evidencia: [`transpiler.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts#L31-L56), [`transpiler.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts#L57-L181), [`transpiler.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts#L183-L268).

### P2 — Precedencia matemática de la potencia frente al signo unario

`parsePower()` analiza primero `parseUnary()`. Por ello, la expresión `-2^2` se interpreta como `(-2)^2` y devuelve `4`, mientras que la convención matemática habitual interpreta `-(2^2)` y devuelve `-4`. La potencia sí está implementada de forma recursiva por la derecha, pero la relación de precedencia con el signo unario necesita un contrato definido y pruebas.

**Corrección recomendada:** decidir y documentar la precedencia según el estándar didáctico elegido y agregar pruebas para `-2^2`, `(-2)^2`, `2^3^2`, `2^-2` y sus variantes en español/inglés.

Evidencia: [`parser.ts`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts#L632-L650).

### P2 — La vista anterior puede quedar obsoleta cuando el nuevo código no parsea

El `useEffect` que analiza el código actual actualiza el AST y las vistas cuando el parseo tiene éxito. En el `catch`, solo actualiza `syntaxError`; no limpia explícitamente `ast`, `flowchartData` ni `structogramBlocks`. Si el código válido pasa a ser inválido, puede mantenerse visible un diagrama anterior mientras aparece un error del texto nuevo.

**Corrección recomendada:** en el camino de error, invalidar AST y diagramas o mostrarlos claramente como “última versión válida”, con indicador de que no corresponden al texto actual.

Evidencia: [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L100-L114), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L129-L145).

### P2 — Política CSP presente, pero `unsafe-inline` reduce su protección

La configuración de Cloudflare Pages define CSP y otras cabeceras. Eso es una mejora clara. No obstante, la directiva `script-src` contiene `'unsafe-inline'`, lo que reduce la capacidad de la política para bloquear JavaScript inline inyectado. La hoja de estilos usa muchos atributos `style`, de modo que la política CSS necesita revisarse de forma separada y con pruebas.

**Corrección recomendada:** comprobar si se necesita realmente `unsafe-inline` en `script-src`; si no, retirarlo. Si alguna rutina inline lo necesita, preferir nonces/hashes cuando la arquitectura lo permita. Desplegar primero una CSP en modo `Report-Only` y validar que no bloquea recursos legítimos. Luego inspeccionar las cabeceras HTTP reales del dominio; el archivo `_headers` solo describe la configuración prevista.

Evidencia: [`_headers`](https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers#L0-L14), [`index.html`](https://github.com/daniel95-sv/PseudoFlow/blob/main/index.html#L32-L78).

### P2 — Resiliencia del borrador local

El borrador se guarda con `localStorage`, lo cual mejora la experiencia. Las lecturas y escrituras se hacen directamente; en entornos donde el almacenamiento esté bloqueado o supere cuota puede lanzarse una excepción y afectar edición o inicialización.

**Corrección recomendada:** envolver las operaciones de almacenamiento en un helper con `try/catch`, continuar en modo no persistente cuando falle y mostrar un aviso discreto. Probar limpieza de almacenamiento y borradores muy grandes.

Evidencia: [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L70-L73), [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L664-L677).

### P2 — La entrada vacía a `Leer` no parece aceptarse

`handleSendInput()` sale si `interactiveInput.trim()` es falso. Esto bloquea entradas vacías o compuestas solo de espacios, aunque una variable de tipo cadena podría legítimamente recibirlas.

**Corrección recomendada:** permitir enviar una cadena vacía cuando el programa esté esperando entrada; distinguir entre “no se ha enviado” y “se envió vacío”.

Evidencia: [`IDEView.tsx`](https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx#L226-L235).

## 5. Seguridad y despliegue

### Fortalezas observadas

- Aplicación principalmente estática y motor de pseudocódigo propio en cliente; no observé en los archivos revisados ejecución directa de JavaScript nativo proporcionado por el estudiante.
- Cabeceras de seguridad configuradas en `public/_headers`: `nosniff`, protección anti-framing, HSTS, `Referrer-Policy`, `Permissions-Policy` y CSP.
- Se añadió un límite de profundidad para llamadas recursivas y un máximo de elementos al crear arreglos.
- Los errores de análisis y ejecución se reportan de forma explícita.
- El editor tiene soporte de breakpoints CSS móvil/tableta y controles de módulos navegables por teclado en el código inspeccionado.

### No verificado

- Cabeceras HTTP efectivas en el dominio publicado.
- Que el build actual se despliegue desde el commit esperado.
- Vulnerabilidades conocidas en dependencias (`npm audit`/SCA).
- Rutas de carga de archivos probadas en navegador, almacenamiento disponible, rendimiento en móviles y comportamiento bajo memoria limitada.
- Pruebas de penetración, XSS, CSP en modo reporte, integridad de artefactos o configuración de CI/CD.

## 6. Plan de corrección priorizado

### Antes de la siguiente versión pública

1. Hacer que el presupuesto de ejecución se consuma en cada iteración de `Mientras`, `Repetir`, `Para` y llamada anidada; agregar límite temporal y ejecución cancelable en `Web Worker`.
2. Limitar el coste de trazas: snapshots parciales, resumen de arreglos, presupuesto máximo de bytes/pasos y límites de consola.
3. Cambiar la evaluación de ejercicios: marcar pruebas como públicas/no confidenciales o mover la validación secreta a servidor. Separar cargar solución de iniciar ejercicio.
4. Crear una suite de tests para lexer, parser, semántica, intérprete, `Leer/Escribir`, arreglos, subprogramas, POO y transpiladores; conectarla a CI.
5. Corregir la precedencia de potencia y el estado obsoleto de diagramas cuando el parseo falla.
6. Añadir pruebas de sintaxis/compilación del código Python y Rust generado; documentar el subconjunto soportado.

### Antes de afirmar “producción estable”

- Ejecutar `npm ci`, `npm run build`, `npm run lint`, `npm test` y `npm audit` en un entorno limpio.
- Probar en al menos Chromium y Firefox; móvil/tableta y escritorio.
- Pruebas de estrés: ciclo infinito vacío, recursión, arreglos máximos, muchos pasos, entradas inválidas, entrada cadena vacía, almacenamiento bloqueado, código malformado y cambios rápidos de ejercicio.
- Comprobar las cabeceras reales del despliegue y ajustar CSP sin `unsafe-inline` de scripts si no es imprescindible.
- Verificar que no existan secretos reales en el repositorio ni en variables de build; revisar lockfile y licencias de dependencias.
- Publicar un alcance honesto para el transpilador y un aviso de que la evaluación en cliente es formativa, no de calificación inviolable.

## 7. Criterios de aceptación sugeridos

- Ningún programa puede bloquear indefinidamente la UI; “Detener/Reiniciar” sigue respondiendo durante una ejecución adversarial.
- La ejecución termina con un mensaje de presupuesto agotado en ciclos infinitos con cuerpo vacío y no vacío.
- El tamaño máximo de salida, snapshots, trazas y memoria observable está limitado.
- Cambiar el código invalida toda vista calculada o la marca como última versión válida.
- Las pruebas cubren operadores, límites, referencias, arreglos y POO; todas pasan en CI.
- Cada exportación Python/Rust pasa por un validador de sintaxis/compilación para las funciones declaradas como soportadas.
- Los casos secretos no se envían al navegador si se pretende usarlos como evaluación confiable.
- Las cabeceras HTTP desplegadas coinciden con la política aprobada.

## 8. Conclusión

La nueva versión está claramente mejor: varias recomendaciones anteriores sí se aplicaron y la calidad defensiva del intérprete mejoró. Las correcciones pendientes son ahora más específicas, pero el principal riesgo —congelación de la pestaña durante evaluación síncrona— no está completamente cerrado. El transpilador sigue siendo experimental y las pruebas ocultas solo pueden considerarse material educativo público mientras estén incluidas en los recursos del cliente.

**Recomendación final:** continuar con una beta pública educativa, pero aplazar la etiqueta de “producción estable” hasta cerrar los dos P1 del motor (límite de iteraciones y coste de snapshots), añadir pruebas automatizadas y aclarar el modelo de evaluación. Esta conclusión se basa en revisión estática; las verificaciones dinámicas indicadas siguen pendientes.
