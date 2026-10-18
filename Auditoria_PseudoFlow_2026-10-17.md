# Auditoría técnica de PseudoFlow

**Fecha:** 17 de octubre de 2026  
**Repositorio revisado:** https://github.com/daniel95-sv/PseudoFlow  
**Aplicación publicada:** https://pseudoflow.pages.dev/  
**Tipo de revisión:** auditoría estática del código público y configuración visible; no equivale a una prueba de penetración ni a una certificación de producción.

## 1. Dictamen ejecutivo

PseudoFlow tiene una base prometedora: React + TypeScript, despliegue estático en Cloudflare Pages y un motor propio de lexer/parser/intérprete. La arquitectura sin backend limita la superficie de ataque de servidor y mantiene la ejecución de pseudocódigo en el navegador. El repositorio describe generación de diagramas, estructogramas, tabla de traza, clases UML y conversión a Python/Rust.

**Dictamen: no recomiendo declarar la versión actual “lista para producción fiable” todavía.** Los riesgos más importantes son la ejecución sin límites de recursos, estados de ejecución desincronizados respecto al editor, errores semánticos que se convierten silenciosamente en cero, ausencia de presentación de errores de ejecución y una transpilación basada en sustituciones de texto que puede generar código inválido. Además, las pruebas automatizadas y la verificación de dependencias no quedaron demostradas en el repositorio revisado.

| Área | Evaluación estática | Comentario |
|---|---|---|
| Seguridad del servidor | Riesgo bajo aparente | No se identifica backend propio en la arquitectura descrita; no es un pentest. |
| Aislamiento/recursos del intérprete | **Riesgo alto** | No hay cuotas explícitas de pasos, memoria, tamaño de arreglo ni profundidad de llamadas. |
| Corrección funcional | **Riesgo alto** | El programa ejecutado puede no corresponder al texto visible; errores semánticos se silencian. |
| Transpilación Python/Rust | **Riesgo alto** | Reglas regex sencillas alteran operadores y no cubren de forma fiable la gramática completa. |
| Calidad y entrega | Riesgo medio-alto | Hay build y lint, pero no se observa un comando de pruebas automatizadas ni validación CI declarada. |
| Accesibilidad y móviles | Riesgo medio | Hay controles construidos con `div` clicables y no se observaron breakpoints CSS para la IDE. |

**No se confirmó una vulnerabilidad crítica de exfiltración de datos en los archivos inspeccionados.** Eso no significa que el proyecto esté libre de vulnerabilidades: no se ejecutaron pruebas dinámicas, escaneo de dependencias ni revisión de la configuración real del panel de Cloudflare.

## 2. Hallazgos priorizados

### P1 — El intérprete puede bloquear la pestaña o agotar memoria

**Evidencia:** `Interpreter.runAll()` avanza un generador dentro de un `while` síncrono hasta que termina; los bucles `Mientras` y `Repetir` no establecen un límite de iteraciones; la creación de arreglos usa `new Array(sizes[0])` y la creación multidimensional recurre sin un límite total de elementos. La validación de ejercicios ejecuta los casos directamente en el hilo de la interfaz.

**Impacto:** un bucle infinito, una recursión excesiva o una dimensión enorme puede congelar la aplicación, disparar el consumo de memoria o hacer que el navegador termine la pestaña. Afecta tanto a estudiantes que cometen un error como a cualquier programa compartido que alguien intente ejecutar.

**Corrección recomendada:**
1. Añadir límites validados antes de ejecutar: tamaño máximo del código, nodos del AST, pasos por ejecución, pasos por caso de prueba, profundidad de llamadas y cantidad total de elementos de arreglos.
2. Validar que cada dimensión sea un entero finito no negativo y que el producto de todas las dimensiones no exceda el límite.
3. Ejecutar el motor en un `Web Worker` que pueda terminarse por timeout; no confiar solo en `setTimeout` si el bucle síncrono bloquea el hilo.
4. Interrumpir con un error visible y recuperable, por ejemplo: “Se alcanzó el límite de pasos; revisa si existe un bucle infinito”.

### P1 — La ejecución puede usar código anterior al que aparece en pantalla

**Evidencia:** el efecto que analiza `code` actualiza AST/diagramas, pero no invalida el `interpreter` ni `stepGenerator` al editar. Además, al seleccionar un ejercicio o ejemplo se llama a `setCode(...)` y luego a `handleReset()` en el mismo flujo; `handleReset()` lee el valor `code` de su cierre de React, que todavía puede ser el anterior.

**Impacto:** el usuario puede ver un ejercicio nuevo y ejecutar el algoritmo anterior, o editar código y continuar una ejecución cuyo AST pertenece a una versión previa. Esto invalida resultados de aprendizaje y pruebas.

**Corrección recomendada:**
- Separar la creación del intérprete de los handlers que cambian el texto.
- Crear `createInterpreter(sourceCode)` que reciba explícitamente el texto que debe analizar, en vez de depender del estado capturado.
- Cuando cambie el código, detener la ejecución, limpiar el generador y marcar el intérprete como desactualizado.
- Asociar el intérprete a una versión/hash del código y no permitir ejecutar si no coincide con la versión actual.
- Agregar pruebas de regresión para editar después de ejecutar y para seleccionar ejercicio/ejemplo desde un código distinto.

### P1 si se usa para evaluación — Los casos “ocultos” no son secretos

**Evidencia:** `exercises.json` se importa al frontend y el validador combina `visibleCases` y `hiddenCases`. Cuando falla un caso, la interfaz presenta tanto la salida real como la esperada, incluso si marca ese caso como “oculto”.

**Impacto:** cualquiera puede inspeccionar los datos que el navegador descarga o la salida visual y conocer las soluciones esperadas. En una aplicación estática no es posible mantener secretos los tests que se entregan al cliente.

**Corrección recomendada:** si son solo ejercicios pedagógicos, llamar a esos casos “casos adicionales” y no prometer confidencialidad. Si sirven para calificación o evaluación real, mover los casos secretos y la evaluación a un backend confiable; mostrar al cliente solo el resultado general o una pista que no revele la respuesta.

### P1/P2 — La transpilación puede producir código Python o Rust inválido

**Evidencia:** `src/engine/transpiler.ts` procesa el texto línea por línea mediante expresiones regulares. En las condiciones, sustituye cada `=` por `==`; eso cambia `<=` por `<==` y `>=` por `>==`. La versión Rust tampoco normaliza consistentemente el operador `<>`. Además, la generación de `Escribir` en Rust puede pasar varios elementos a un `println!("{}", ...)` con un solo marcador de formato, y las reglas no analizan de forma estructural toda la gramática.

**Impacto:** el código mostrado como resultado de la transpilación puede no compilar, ejecutar una lógica diferente o no representar características soportadas por el intérprete.

**Corrección recomendada:** generar código desde el AST, no con sustituciones globales sobre texto; definir la matriz de características soportadas en cada lenguaje y emitir errores explícitos para construcciones no soportadas. Agregar tests de compilación/sintaxis para `=`, `<>`, `<`, `<=`, `>`, `>=`, bucles ascendentes/descendentes, cadenas, arreglos, funciones y POO. Hasta entonces, etiquetar la exportación como experimental.

### P2 — Variables desconocidas y funciones desconocidas se convierten silenciosamente en `0`

**Evidencia:** `resolveVariable()` devuelve `0` cuando no encuentra una variable; `callBuiltIn()` también devuelve `0` si el nombre de función no está soportado.

**Impacto:** un error tipográfico como `total <- totla + 1` o una función mal escrita puede generar resultados incorrectos sin un mensaje de error útil. En una herramienta educativa, esto es especialmente perjudicial porque el motor refuerza una interpretación falsa del algoritmo.

**Corrección recomendada:** emitir errores semánticos con nombre, línea y columna. Solo inicializar a cero una variable si la gramática y el modelo del lenguaje lo permiten expresamente. Para funciones incorporadas, usar una lista blanca y rechazar nombres desconocidos y aridades incorrectas.

### P2 — Los errores de ejecución quedan ocultos para el usuario

**Evidencia:** `generateSteps()` captura excepciones y guarda el mensaje en `interpreter.error`; en `IDEView.tsx` el aviso mostrado está conectado a `syntaxError`, pero no se observa un render de `interpreter.error`.

**Impacto:** ante división por cero, índice fuera de rango u otro error de ejecución, el programa puede detenerse sin explicar la causa. El usuario puede confundir un error semántico con un programa que terminó normalmente.

**Corrección recomendada:** mostrar una consola de errores separada para errores sintácticos, semánticos y de ejecución. Incluir línea/columna, estado final (`Completado`, `Esperando entrada`, `Detenido por límite`, `Error`) y una acción clara para reiniciar.

### P2 — El lexer descarta caracteres ilegales y acepta cadenas/comentarios incompletos

**Evidencia:** el fallback del lexer avanza un carácter desconocido sin emitir token ni error. La lectura de cadenas termina también al llegar al final del archivo sin exigir una comilla de cierre; el comentario de bloque tampoco lanza un error si falta `*/`.

**Impacto:** un error de escritura puede desaparecer del programa o generar diagnósticos confusos. También se permite que una cadena aparentemente mal formada atraviese líneas.

**Corrección recomendada:** convertir caracteres desconocidos y literales/comentarios sin cerrar en errores léxicos con línea y columna. Validar formato numérico —por ejemplo, varios puntos decimales— y definir explícitamente si se permite notación científica. Añadir pruebas de fuzzing al lexer/parser y asegurar que cada entrada inválida termina con un error controlado y nunca en un bucle del parser.

### P2 — Límites de semántica no definidos

- El operador de potencia se construye con un bucle que lo hace asociativo a la izquierda; expresiones como `2 ^ 3 ^ 2` pueden diferir de la convención matemática habitual.
- En los operadores lógicos se evalúan ambos operandos antes de aplicar `Y`/`O`; no existe cortocircuito. Si el lenguaje pretende semántica de cortocircuito, una expresión como `Falso Y (1 / 0 > 0)` puede generar un error inesperado.
- `Dimension` convierte dimensiones a enteros mediante `Math.floor`, pero no valida límites antes de reservar memoria.

**Corrección recomendada:** documentar la semántica oficial del lenguaje, implementar precedencia/asociatividad de forma deliberada y validar valores numéricos, rangos de índices y tamaños de arreglos. Añadir pruebas de conformidad para cada operador.

### P2 — Tipado TypeScript insuficientemente estricto y falta de pruebas demostrables

**Evidencia:** `package.json` define `build` y `lint`, pero no un script de pruebas. `tsconfig.app.json` no activa `strict`, `noImplicitAny` ni `noUncheckedIndexedAccess`; el editor utiliza tipos `any` para ejercicios y resultados de validación. En el árbol público revisado no se observó un flujo de CI que ejecute compilación, lint y pruebas antes de publicar.

**Impacto:** errores de estados, formas de datos incompletas y defectos de regresión pueden escapar a la compilación.

**Corrección recomendada:** activar progresivamente `strict: true`, `noImplicitAny` y `noUncheckedIndexedAccess`; definir tipos explícitos para módulos, ejercicios, casos de prueba y resultados; añadir Vitest para lexer/parser/intérprete/transpiladores, React Testing Library para flujos de UI y Playwright para flujos críticos en navegador. Configurar CI con `npm ci`, build, lint y tests; no desplegar si cualquiera falla.

### P2 — Accesibilidad y experiencia móvil incompletas

**Evidencia:** los acordeones de módulos y elementos de ejercicios/ejemplos usan `div` con `onClick`, en vez de controles semánticos accesibles por teclado. El `textarea` del editor no muestra una etiqueta accesible visible en el componente revisado. En `index.css` no se encontraron reglas `@media`; el área IDE tiene altura `100vh` y `overflow: hidden`, y el diseño principal depende de un layout horizontal.

**Impacto:** navegación por teclado/lector de pantalla deficiente y riesgo de que la IDE sea incómoda o se recorte en pantallas pequeñas. Esto requiere validación real por tamaño de viewport y lector de pantalla.

**Corrección recomendada:** convertir controles clicables en `<button>` o aplicar semántica y gestión de teclado correctas; añadir etiquetas/ARIA y estados de foco visibles; implementar breakpoints de escritorio/tablet/móvil; probar al menos 320, 375, 768 y 1280 px y ejecutar una revisión WCAG automática y manual.

### P2 — La interfaz bilingüe no está completamente traducida

**Evidencia:** aunque existe el selector ES/EN, diversos rótulos de la IDE —controles de ejecución, pestañas, consola y etiquetas de actividad— están escritos directamente en español.

**Impacto:** experiencia incoherente al seleccionar inglés y riesgo de confundir al usuario.

**Corrección recomendada:** centralizar todos los textos en diccionarios de traducción y probar el recorrido completo en ambos idiomas, incluidos errores, validación, ayudas, controles e indicaciones de entrada.

### P2/P3 — Faltan controles y pruebas dinámicas de cabeceras

**Evidencia:** `public/_headers` configura `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS y caché de activos, lo cual es positivo. No se ve una política `Content-Security-Policy` en ese archivo.

**Impacto:** se pierde una capa importante de defensa en profundidad frente a contenido inesperado. No se puede concluir solo con el archivo que las cabeceras efectivas de producción sean idénticas; deben verificarse sobre las respuestas HTTP publicadas.

**Corrección recomendada:** definir una CSP compatible con el uso real de inline styles y JSON-LD, probarla primero en `Content-Security-Policy-Report-Only` y luego aplicarla. Verificar cabeceras efectivas con un escáner HTTP tras el despliegue. Mantener `frame-ancestors 'none'` y `object-src 'none'` si no hay necesidad de excepciones.

### P3 — SEO multilingüe incoherente

**Evidencia:** `index.html` y `public/sitemap.xml` asignan `hreflang="es"`, `hreflang="en"` y `x-default` a la misma URL. El idioma parece cambiar solo en el estado del cliente, sin una URL indexable distinta por idioma.

**Impacto:** los buscadores no reciben páginas separadas en español e inglés y las señales `hreflang` no identifican versiones diferenciadas.

**Corrección recomendada:** si el SEO bilingüe es importante, publicar rutas independientes (`/es/` y `/en/`) con `canonical`, título, descripción y contenido de cada idioma. Si no se crearán rutas, eliminar señales `hreflang` que sugieren variantes que no existen.

### P3 — El código del estudiante se pierde al recargar

**Evidencia:** `App.tsx` persiste tema e idioma en `localStorage`; el texto del programa se inicializa con un ejemplo por defecto dentro de la IDE y no se observa persistencia equivalente del código del editor.

**Impacto:** recargar o cerrar la pestaña puede eliminar trabajo del estudiante.

**Corrección recomendada:** ofrecer guardar/abrir `.pseudo` y descarga del código; opcionalmente guardar borrador local con límite de tamaño y un control explícito de borrado. Informar al usuario de dónde se guardan los datos.

## 3. Aspectos positivos que conviene conservar

- Arquitectura de cliente estático: no se observó una API de aplicación ni almacenamiento de código en servidor en los componentes revisados.
- Separación por módulos de lexer, parser, intérprete, generación de diagramas y vistas React.
- El intérprete construye su propio AST; en los módulos revisados no se observó necesidad de ejecutar JavaScript nativo generado desde el pseudocódigo.
- La UI renderiza los valores del pseudocódigo mediante texto React, en vez de interpolarlos como HTML crudo en los componentes inspeccionados.
- `public/_headers` ya incluye varias cabeceras de seguridad y una política de caché para assets versionados.
- El comando de build ejecuta TypeScript antes de Vite (`tsc -b && vite build`).

## 4. Plan de remediación recomendado

### Fase 0 — Antes de declarar una versión estable
1. Corregir la sincronización código/AST/intérprete y los handlers de selección de ejercicio/ejemplo.
2. Añadir límites duros de pasos, tiempo, memoria aproximada, tamaño de arreglos y profundidad de llamadas; proteger la interfaz con un Worker terminable.
3. Mostrar errores de ejecución y dejar de convertir identificadores/funciones desconocidas en `0`.
4. Etiquetar los casos ocultos como no confidenciales o mover evaluación sensible al servidor.
5. Deshabilitar temporalmente la transpilación como función “garantizada” hasta disponer de pruebas de salida válida.

### Fase 1 — Calidad de ingeniería
1. Activar TypeScript estricto gradualmente.
2. Añadir pruebas unitarias para lexer/parser/interpreter y pruebas de regresión para todos los hallazgos P1/P2.
3. Añadir pruebas de fuzzing o corpus de entradas inválidas, incluyendo comentarios/cadenas sin cerrar, caracteres extraños, recursión y dimensiones extremas.
4. Añadir CI con `npm ci`, `npm run build`, `npm run lint` y `npm test`.
5. Ejecutar `npm audit`/escáner SCA sobre el `package-lock.json` en CI y fijar una política de actualización de dependencias.

### Fase 2 — Producto, accesibilidad y despliegue
1. Completar traducciones ES/EN y persistencia/exportación local del código.
2. Semantizar controles y revisar teclado, foco, contraste y lectores de pantalla.
3. Añadir breakpoints y pruebas de viewport móvil.
4. Ajustar CSP, verificar cabeceras reales del despliegue y documentar el proceso de rollback.
5. Corregir URLs `hreflang` o eliminar señales multilingües duplicadas.

## 5. Criterios de aceptación para producción

La versión no debería considerarse estable hasta que se demuestre todo lo siguiente:

- [ ] `npm ci`, build y lint pasan desde un checkout limpio.
- [ ] Existe una suite de pruebas automatizadas y la CI la ejecuta en cada pull request.
- [ ] Una modificación del código siempre invalida la ejecución anterior; al escoger un ejercicio, el código visible y el que se ejecuta coinciden.
- [ ] Bucles infinitos, recursión extrema y arreglos demasiado grandes se detienen con un mensaje claro sin congelar toda la interfaz.
- [ ] Los errores léxicos, sintácticos, semánticos y de ejecución se distinguen y muestran línea/columna cuando corresponda.
- [ ] No se reporta “oculto” para casos que están descargados al cliente; la evaluación sensible se ejecuta en servidor.
- [ ] Los resultados de transpilación pasan una prueba de sintaxis/compilación para cada característica marcada como soportada.
- [ ] La IDE funciona con teclado y en tamaños móviles soportados.
- [ ] Se han revisado las dependencias mediante un escáner SCA y verificado las cabeceras HTTP del dominio publicado.

## 6. Alcance y limitaciones de esta auditoría

La revisión se basó en el código fuente público que fue accesible en GitHub, el `package.json`, `tsconfig`, archivos de despliegue estático y el código de los componentes/engine mencionados. No pude ejecutar un checkout del repositorio en este entorno, por lo que **no** afirmo haber ejecutado `npm run build`, `npm run lint`, `npm audit`, pruebas de navegador, Lighthouse, axe, ni pruebas de carga. Tampoco se inspeccionó el panel privado de Cloudflare ni se realizó una prueba de penetración sobre infraestructura.

Las observaciones de código son hallazgos estáticos reproducibles por lectura; los resultados sobre rendimiento real, accesibilidad efectiva, cabeceras HTTP publicadas y compatibilidad exacta de dependencias requieren la fase dinámica de validación.

## 7. Referencias de código principales

- Repositorio y descripción del producto: https://github.com/daniel95-sv/PseudoFlow
- Estado/editor y handlers de selección: https://github.com/daniel95-sv/PseudoFlow/blob/main/src/components/IDEView.tsx
- Aplicación y persistencia de tema/idioma: https://github.com/daniel95-sv/PseudoFlow/blob/main/src/App.tsx
- Lexer: https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/lexer.ts
- Parser: https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/parser.ts
- Intérprete: https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/interpreter.ts
- Transpiladores: https://github.com/daniel95-sv/PseudoFlow/blob/main/src/engine/transpiler.ts
- Cabeceras estáticas: https://github.com/daniel95-sv/PseudoFlow/blob/main/public/_headers
- Configuración de scripts y dependencias: https://github.com/daniel95-sv/PseudoFlow/blob/main/package.json
