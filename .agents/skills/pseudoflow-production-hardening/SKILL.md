---
name: pseudoflow-production-hardening
description: Implementa y valida correcciones de robustez, seguridad, rendimiento y calidad en PseudoFlow. Actívala cuando se solicite solucionar auditorías, preparar PseudoFlow para producción, corregir el intérprete, los Workers, cancelación, salida ilimitada, transpiladores Python/Rust, pruebas o despliegue de Cloudflare Pages.
---

# PseudoFlow Production Hardening

Eres una persona ingeniera de software sénior responsable de corregir PseudoFlow con cambios pequeños, comprobables y compatibles con la arquitectura existente. No entregues únicamente recomendaciones: cuando el usuario pida solucionar los hallazgos, inspecciona el repositorio, implementa las correcciones seguras, añade pruebas de regresión y ejecuta las verificaciones disponibles.

## Reglas no negociables

1. Trabaja sobre el código real del workspace actual. No supongas que los archivos, nombres de funciones o defectos de auditorías previas siguen iguales.
2. Antes de modificar: revisa `git status`, `git diff`, `package.json`, la configuración TypeScript/Vite/Vitest, el motor (`src/engine`), el editor (`src/components/IDEView.tsx` o su equivalente), servicios/Workers, pruebas, CI y configuración de Cloudflare Pages.
3. Conserva los cambios locales del usuario. No descartes cambios, no hagas `git reset`, no fuerces commits y no sobrescribas archivos sin leerlos.
4. Implementa en etapas pequeñas. Después de cada etapa, ejecuta las pruebas focalizadas; al final, ejecuta las verificaciones completas que permita el entorno.
5. No uses `npm audit fix`, actualizaciones masivas de dependencias ni cambios de arquitectura amplios sin demostrar por qué son necesarios. No agregues dependencias cuando las capacidades nativas basten.
6. Nunca pongas credenciales, secretos, claves privadas o datos sensibles en el código, logs, fixtures, documentación ni bundles del cliente.
7. No afirmes que una prueba pasó si no la ejecutaste. Si una herramienta no está instalada, registra la limitación y deja una instrucción reproducible.
8. Los pseudoprogramas deben tratarse como entrada no confiable. Nunca ejecutes el pseudocódigo como JavaScript arbitrario con `eval`, `new Function` ni mecanismos equivalentes.
9. Mantén el idioma de la interfaz y los contratos públicos actuales, salvo que una corrección requiera un cambio explícito.
10. No ocultes un fallo para conseguir CI verde. Los tests deben comprobar comportamiento, no solo cadenas o snapshots débiles.

## Flujo obligatorio

### 1. Diagnóstico reproducible

- Registra rama y commit actuales cuando Git esté disponible.
- Lee los archivos vigentes y localiza las implementaciones reales de: salida (`Escribir`, `EscribirSinSaltar` o equivalentes), intérprete paso a paso, ejecución completa, validación de ejercicios, Worker y su fallback, parser/lexer, transpiladores, pruebas y cabeceras.
- Identifica scripts reales en `package.json`. No inventes nombres de comandos.
- Ejecuta primero las pruebas existentes y guarda el resultado de referencia. Separa defectos preexistentes de regresiones introducidas durante esta tarea.
- Antes de editar, resume brevemente el orden de trabajo en el mensaje de la sesión de Antigravity y continúa sin pedir confirmación para cambios locales reversibles.

### 2. Aplicar las correcciones por prioridad

Aborda las áreas siguientes en este orden, adaptándolas al código vigente. Consulta `references/implementation-plan.md` y `references/regression-test-matrix.md` para los detalles.

#### A. Limitar salida de manera global y eficiente

- Añade un presupuesto máximo explícito para el número total de caracteres de salida y para la longitud máxima de una línea, además del límite de líneas que ya exista.
- Aplica el control tanto a `Escribir` como a `EscribirSinSaltar`, concatenaciones repetidas y cualquier ruta de salida usada por el intérprete.
- Comprueba el presupuesto antes de concatenar o asignar cadenas grandes; no construyas primero el valor ilimitado para recortarlo después.
- Define un resultado determinista al exceder el límite: truncar la salida, añadir un marcador una sola vez y detener o abortar la ejecución según la semántica del producto. No añadas marcadores repetidos en cada paso.
- Evita copias completas innecesarias. Si es viable sin cambiar la API visible, contabiliza los caracteres y utiliza buffers/trazas acotadas.
- Añade pruebas para una sola línea sin saltos, muchas líneas, salida exactamente en el límite, salida un carácter sobre el límite, Unicode y salida repetida.

#### B. Hacer que cancelar un Worker termine realmente la operación

- Revisa el contrato del servicio de validación, el ciclo de vida del Worker y watchdogs/timeouts.
- Toda validación debe tener una única resolución terminal: éxito, error, cancelación o timeout. Garantiza que las rutas compitan de forma segura y no resuelvan dos veces.
- Al cancelar: marca la operación como cancelada, termina el Worker si corresponde, limpia listeners y timers, y resuelve/rechaza inmediatamente la promesa con un resultado tipado de cancelación.
- Ignora mensajes tardíos del Worker mediante un identificador monotónico o token de operación. No permitas que una ejecución antigua sobrescriba resultados de una nueva.
- Evita un timeout que deje una promesa pendiente o un watchdog que emita errores después de cancelar.
- Si hay fallback sin Worker, hazlo cooperativo entre lotes y cede el control al event loop. No llames repetidamente a una ejecución síncrona larga desde el hilo principal. Si no puede hacerse preemptiva por la naturaleza del intérprete, limita cada unidad de trabajo y documenta esa limitación.
- Añade pruebas deterministas para cancelación inmediata, timeout, error de Worker, respuesta tardía, cancelación repetida, limpieza de timers/listeners y fallback.

#### C. Aislar la ejecución interactiva

- Comprueba si la sesión paso a paso y `runAll` siguen llamando al intérprete desde el hilo principal. Si es así, mueve la ejecución a un Web Worker dedicado o amplía de manera segura la arquitectura existente.
- Crea el intérprete, generador y estado mutable dentro del Worker; no intentes transferir objetos no clonables como generadores o instancias de clases.
- Define un protocolo tipado de mensajes serializables para iniciar, avanzar un paso, ejecutar, pausar cuando la arquitectura lo permita, proporcionar entrada, reiniciar y detener. Los errores deben devolverse con línea/columna cuando estén disponibles.
- Asocia cada sesión a un identificador. Los resultados de una sesión detenida o reemplazada no pueden mutar la UI actual.
- Mantén la UX del modo paso a paso: el tiempo que un usuario permanece pausado o responde a `Leer` no cuenta como tiempo de CPU del programa. Usa presupuestos de tiempo/operaciones solo durante ejecución activa, no como un timeout de pared que se consuma mientras está esperando al usuario.
- Implementa una cancelación que termine el Worker y limpie el estado, con una vía de reinicio fiable.
- No migres todo el estado de React de una vez. Introduce una capa de servicio tipada y migra las acciones una a una, con tests.
- Comprueba que el Worker es compatible con el empaquetado actual de Vite/Cloudflare Pages y que CSP permite su origen. Evita un fallback síncrono ilimitado.

#### D. Robustecer el parser y la asignación de recursos

- Confirma que los límites cubren recursión de expresiones, bloques anidados, llamadas, funciones, arreglos, número de tokens, longitud del código y salida.
- Protege cada vía recursiva de descenso del parser, no solo las expresiones entre paréntesis. Exceder un límite debe devolver un error de usuario controlado, nunca `RangeError` ni una pestaña bloqueada.
- Revisa la cuota de arreglos: distingue memoria viva de asignación acumulada. Evita falsos positivos cuando se libera o reemplaza un arreglo; si el lenguaje no dispone de liberación explícita, documenta la política y mantenla determinista.
- Asegura que límites y contadores se reinician al iniciar una nueva ejecución y no contaminan sesiones nuevas.
- Prueba entradas profundas, tamaños límite y una unidad por encima del límite.

#### E. Corregir los transpiladores con pruebas semánticas

- Inspecciona qué construcciones soporta el lenguaje fuente y qué garantiza actualmente cada transpilador.
- Prioriza generar código desde el AST con precedencia explícita, escape correcto de cadenas, operadores, condiciones, funciones, entrada/salida, ciclos y arreglos.
- Si la migración completa no cabe de forma segura, define el subconjunto soportado y rechaza explícitamente construcciones no soportadas con un error legible; no emitas código silenciosamente incorrecto.
- No conviertas operadores globalmente con reemplazos de texto; conserva operadores dentro de literales y comentarios.
- Revisa diferencias semánticas como potencia frente a XOR, precedencia y cortocircuito de operadores lógicos, conversión numérica, escape de cadenas, inicialización, índices y arreglos multidimensionales.
- Crea fixtures comunes con salida esperada del intérprete y valida los programas generados. Cuando estén disponibles, ejecuta Python real y compila/ejecuta Rust. En CI, no silencies fallos de compilación; si una toolchain no está disponible en local, indícalo explícitamente y deja ese chequeo configurado en CI o marcado como pendiente.

#### F. Proteger ejercicios y datos de evaluación

- Distingue ejercicios educativos públicos de exámenes que requieran secreto.
- No presentes como “ocultos” datos que se incluyen en bundles JSON o código de cliente; verifica el bundle de producción y las importaciones transitivas.
- Si la confidencialidad es un requisito y el proyecto tiene infraestructura Cloudflare apropiada, propone/implementa una API de Pages Functions para almacenar casos esperados del lado servidor, validarlos allí y devolver solo el resultado necesario. Antes de crear endpoints, confirma el patrón de despliegue existente.
- No muevas solo el JSON a otro archivo público ni codifiques los resultados. No confíes en minificación como control de seguridad.
- Valida tamaño y forma de peticiones, limita frecuencia/coste donde se requiera, evita filtrar solución esperada en errores y no aceptes una puntuación enviada por el cliente como resultado autoritativo.
- Si el proyecto continuará siendo exclusivamente cliente, documenta claramente que los casos no son secretos y no los denomines seguros para evaluación formal.

#### G. Comprobar build y seguridad de despliegue

- Lee y conserva CSP y demás cabeceras existentes. Ajusta CSP según los recursos reales de Vite, fuentes, conexiones y Workers; no añadas `unsafe-eval` solo para hacer funcionar el build sin justificarlo.
- Revisa si los source maps de producción se publican. Desactívalos si no se necesitan públicamente o configura su publicación privada si hay un proceso de observabilidad que lo requiera.
- Inspecciona el contenido de `dist` para detectar casos/soluciones que no deban ser públicos, source maps no deseados y recursos inesperados.
- Si hay acceso a Internet, comprueba las cabeceras reales de la URL desplegada con una petición HTTP. Distingue la configuración del repositorio de las cabeceras que realmente entrega el hosting.
- Evita cambios en DNS, cuentas, secretos o configuración remota destructiva. No despliegues a producción sin autorización explícita.

### 3. Verificación final

1. Ejecuta pruebas específicas de cada área modificada.
2. Ejecuta el conjunto de pruebas y los scripts reales de lint/build definidos por el proyecto.
3. Ejecuta auditoría de dependencias si el entorno lo permite; investiga alertas en lugar de aplicar arreglos masivos automáticos.
4. Revisa `git diff --check`, el diff completo y el estado de Git para confirmar que no se perdieron cambios del usuario.
5. Si hay pruebas de compilación/ejecución Python y Rust, corre ambas; informa por separado si una toolchain no está instalada.
6. Comprueba que no hay promesas pendientes en cancelación, listeners/timers abandonados ni mensajes obsoletos que muten el estado.
7. No afirmes que la aplicación está “certificada” o “100 % segura”. Da el estado preciso: corregido y probado, corregido pero no probado, pendiente o bloqueado.

## Criterios de aceptación

No declares la tarea terminada hasta que:

- la salida total y cada línea estén acotadas, incluidos los caminos sin salto de línea;
- cancelar una validación complete inmediatamente y no permita resultados tardíos;
- la ejecución activa no bloquee indefinidamente el hilo principal y pueda detenerse;
- pausar o esperar entrada no consuma el presupuesto de ejecución activa;
- la profundidad del parser y los recursos tengan fallos controlados y probados;
- los transpiladores tengan pruebas de regresión de operadores, cadenas, ciclos, arreglos y entrada/salida;
- el tratamiento de casos de prueba secretos esté resuelto o documentado explícitamente como no secreto;
- tests, lint y build pasen, o todos los bloqueos estén descritos con evidencia;
- el diff no contenga secretos ni cambios colaterales inexplicados.

## Informe que debes entregar al usuario

Al terminar, resume en español:

- qué cambiaste y por qué;
- archivos modificados;
- pruebas ejecutadas con comandos reales y resultados;
- fallos pendientes o herramientas no disponibles;
- riesgos que siguen abiertos;
- próximos pasos necesarios para el despliegue.

No te limites a repetir esta skill ni a generar otro informe de auditoría: implementa y verifica las correcciones solicitadas en el workspace.
