# Matriz de regresión para endurecimiento de PseudoFlow

Adapta nombres de tests y APIs a la implementación vigente. Cubre comportamiento, no solo el texto de código generado.

| Área | Caso mínimo obligatorio | Resultado esperado |
|---|---|---|
| Salida total | Emitir texto repetidamente sin salto de línea hasta superar la cuota | Se mantiene dentro de la cuota; truncamiento/mensaje único; no hay crecimiento ilimitado |
| Salida por línea | Emitir una cadena superior al máximo de línea | Truncamiento controlado o error tipado; la interfaz no se bloquea |
| Salida límite | Exactamente el máximo de caracteres y un carácter adicional | Primer caso aceptado; segundo controlado de forma determinista |
| Unicode | Emoji y caracteres multibyte cerca del límite | La política de conteo está documentada y no rompe caracteres de forma accidental |
| Reinicio | Ejecutar, alcanzar límite y reiniciar | Contadores y salida de la sesión anterior no contaminan la nueva |
| Cancelar Worker | Cancelar durante validación | La promesa termina inmediatamente, el Worker se detiene y el timer se limpia |
| Worker tardío | Enviar una respuesta tras cancelar o iniciar otra validación | La respuesta antigua se ignora y no modifica UI ni resultados actuales |
| Timeout | Worker que no responde | Una finalización de error/cancelación única; no queda promesa pendiente |
| Error Worker | Error de inicialización y error durante ejecución | Estado recuperable; fallback solo si es seguro y está diseñado |
| Fallback | Validar muchos casos sin Worker | Lotes cooperativos; UI responde; cada caso tiene límites; cancelación comprobada |
| Ejecución interactiva | Ejecutar un ciclo largo y pulsar detener | UI sigue respondiendo; sesión termina dentro del SLA definido |
| Paso a paso | Pausar durante más tiempo que el límite de ejecución activa | No se marca como timeout mientras está pausado |
| Entrada | Esperar `Leer`, responder tarde y continuar | El tiempo de espera humana no consume cuota de CPU del programa |
| Sesiones obsoletas | Ejecutar y reiniciar rápido o cambiar de ejercicio | No llegan resultados de la sesión anterior |
| Parser profundo | Paréntesis, bloques, bucles o condicionales anidados más allá de la cuota | Error controlado, no `RangeError` ni bloqueo |
| Arreglos | Tamaño exacto, tamaño + 1, arreglos multidimensionales y asignaciones repetidas | Cuotas deterministas sin filtraciones ni falsos positivos no explicados |
| Potencia | Expresiones encadenadas y precedencia del operador | Resultado coherente entre intérprete y cada destino soportado |
| Operadores | `<`, `<=`, `>`, `>=`, `=`, `==`, `^`, `Y`, `O`, `No` | Los operadores no se corrompen por reemplazos de texto; semántica documentada |
| Literales | Cadenas con `=`, comillas, barra invertida, palabras reservadas y saltos de línea | El contenido del literal permanece intacto y escapado correctamente |
| Bucles | `Para`, `Mientras`, anidados, cuerpo vacío y límites | El código generado compila y termina con el mismo resultado esperado |
| Entrada/salida | Leer números/texto y combinar expresiones de impresión | Código destino válido y salida equivalente dentro del subconjunto soportado |
| Python | Ejecutar fixtures generados con la versión soportada | Código compila/ejecuta y produce la salida esperada |
| Rust | Compilar y ejecutar fixtures generados con toolchain soportada | Compila sin warnings críticos/errores y produce salida esperada |
| Datos secretos | Buscar respuestas de evaluación en `dist` y chunks JS | Si son secretos, no aparecen en artefactos públicos; si son práctica, la limitación está documentada |
| Source maps | Inspeccionar `dist` para `.map` | No hay mapas públicos no deseados |
| CSP/headers | Consultar respuesta HTTP del dominio publicado | CSP y cabeceras efectivas coinciden con la política aprobada |
| CI | Ejecutar pruebas, lint, build, auditoría de dependencias | Todo pasa o quedan bloqueos documentados con salida real |

## Comandos

No asumas nombres de scripts. Inspecciona `package.json` y ejecuta los que existan. Como mínimo, considera instalación limpia con lockfile, pruebas, lint, build y auditoría de dependencias. Si Python/Rust forman parte de la verificación de CI, instala/fija versiones de toolchain de forma reproducible.
