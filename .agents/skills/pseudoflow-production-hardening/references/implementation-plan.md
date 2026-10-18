# Plan de remediación para PseudoFlow

Este documento es una guía específica del proyecto. Inspecciona primero la implementación actual; los nombres de archivos pueden haber cambiado.

## Orden sugerido

### P0 — Límites y cancelación

1. Localiza el acumulador de salida del intérprete. Define un presupuesto global de caracteres y un máximo por línea. La comprobación debe suceder antes de concatenar la nueva cadena.
2. Unifica las rutas de `Escribir` y `EscribirSinSaltar` en una única API de salida limitada para que ninguna instrucción eluda los límites.
3. Revisa el servicio de validación y el Worker. Crea un ciclo de vida de operación con `operationId`, estado terminal único, función de cancelación, limpieza de temporizadores y listeners e ignorado de resultados tardíos.
4. Añade tests primero para reproducir los defectos actuales; luego implementa la corrección.

### P1 — Ejecución interactiva aislada

1. Identifica la lógica del botón ejecutar, paso, reset, stop y `Leer`.
2. Define mensajes serializables con discriminante (`type`) y payload tipado.
3. Instancia el intérprete dentro del Worker. Devuelve snapshots acotados, mensajes de consola, estado de ejecución y errores; nunca envíes instancias, funciones o generadores.
4. Mantén un `sessionId` para descartar eventos obsoletos.
5. Distingue presupuesto de ejecución activa de tiempo pausado/espera de entrada.
6. Verifica empaquetado, CSP y compatibilidad con Cloudflare Pages.

### P1 — Transpiladores

1. Construye una tabla de construcciones fuente y soporte por destino.
2. Implementa generadores desde AST con precedencia y escape explícitos, o rechaza lo que no sea soportado.
3. Comparte fixtures de pseudocódigo, salida del intérprete y resultado esperado de cada destino.
4. Ejecuta Python y Rust reales cuando las toolchains estén disponibles.

### P2 — Defensa profunda y despliegue

1. Asegura cuotas para tokens, longitud de código, profundidad de bloques/expresiones, llamadas, arreglos y trazas.
2. Decide si los casos de prueba deben ser públicos o confidenciales. Para confidencialidad, no incluyas los datos esperados en el bundle del cliente; usa validación de servidor.
3. Revisa source maps, CSP, headers, archivos estáticos y build de producción.
4. Mide con una prueba reproducible; no afirmes mejoras de rendimiento sin medir.

## Límites iniciales

No fijes números arbitrarios en múltiples sitios. Centraliza la política de recursos y documenta los valores junto a las pruebas. Los límites deben equilibrar uso educativo legítimo y protección contra bloqueos; usa valores configurable/deterministas cuando corresponda. Siempre verifica límite exacto, límite + 1 y reinicio de ejecución.
