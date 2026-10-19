# Procedimiento de Publicación, Reversión y Límites Operativos de PseudoFlow

Este documento detalla la arquitectura de entrega, los límites y cuotas operativas del motor de ejecución en cliente, los procedimientos de verificación previa a cualquier lanzamiento y la guía paso a paso para publicación y reversión inmediata (rollback) en **Cloudflare Pages**.

---

## 1. Límites y Cuotas Operativas del Motor de Ejecución

PseudoFlow se ejecuta íntegramente en el navegador del usuario (Client-Side SPA), aislando ejecuciones batch y pruebas automatizadas en **Web Workers** dedicados y gestionando la traza interactiva mediante `InteractiveExecutionService`.

Para garantizar estabilidad contra bucles infinitos, saturación de memoria, recursión excesiva o desbordamiento de salida, se aplican los siguientes límites estrictos:

| Parámetro / Dimensión | Límite Máximo | Justificación / Manejo de Error |
| :--- | :--- | :--- |
| **Pasos de Ejecución (Batch / Workers)** | `100,000` pasos | Límite de seguridad contra bucles infinitos en ejercicios (`InfiniteLoopError`). |
| **Pasos de Ejecución (Paso a Paso Interactivo)** | `50,000` pasos | Protege la memoria del historial de estados de la prueba de escritorio. |
| **Tiempo Límite por Caso (Watchdog de Worker)** | `2,500 ms` | Timeout duro con terminación inmediata del Worker (`worker.terminate()`). |
| **Profundidad de Pila de Llamadas (Recursión)** | `500` frames | Previene desbordamiento del Call Stack del navegador (`StackOverflowError`). |
| **Salida Acumulada por Consola** | `50,000` caracteres | Previene congelamiento del DOM por sentencias `Escribir` masivas en bucles. |
| **Líneas de Salida Máximas** | `2,000` líneas | Se truncan líneas excedentes con aviso explicativo al usuario. |
| **Tamaño de Vector / Arreglo** | `50,000` elementos | Previene asignaciones excesivas de memoria en dimensiones dinámicas. |
| **Dimensiones Máximas de Arreglos** | `3` dimensiones | Soporta escalares, vectores y matrices tridimensionales (`a[i, j, k]`). |
| **Longitud Máxima de Código Fuente** | `250,000` caracteres (~5,000 líneas) | Límite del lexer/parser para mantener respuesta sub-segundo en análisis interactivo. |
| **Seguridad de Objetos / Tablas de Símbolos** | Diccionarios sin prototipo (`Object.create(null)`) | Protección estricta contra contaminación de prototipos (`__proto__`, `constructor`). |

---

## 2. Política de Caché y Entrega de Recursos Estáticos

Configurado en [public/_headers](file:///c:/Users/MyPC/Documents/Menus%20Proyectos/pseudoflow/public/_headers) y [public/_redirects](file:///c:/Users/MyPC/Documents/Menus%20Proyectos/pseudoflow/public/_redirects):

1. **Documento Principal (`/` e `/index.html`)**:
   - `Cache-Control: no-cache, no-store, must-revalidate`
   - Garantiza que cualquier actualización o despliegue sea recibido de inmediato por los usuarios, impidiendo que el navegador intente cargar chunks con hashes de build obsoletos.
2. **Bundles y Activos Inmutables (`/assets/*`)**:
   - `Cache-Control: public, max-age=31536000, immutable`
   - Vite genera hashes de contenido en cada archivo JS/CSS compilado, permitiendo caché perimetral perpetua y descarga ultrarrápida.
3. **Recursos de Metadatos y PWA (`/manifest.webmanifest`, `/favicon.*`, `/pwa-*.png`, `/og-image.png`)**:
   - `Cache-Control: public, max-age=604800, stale-while-revalidate=86400`
4. **Catálogo de IA y Documentación (`/llms.txt`, `/llms-full.txt`, `/ai-catalog.json`)**:
   - `Cache-Control: public, max-age=3600`
5. **Enrutamiento SPA**:
   - `/* /index.html 200` en `_redirects` para admitir deep linking de rutas sin errores 404 del servidor.

---

## 3. Procedimiento de Verificación Previa (Quality Gate)

Antes de autorizar o fusionar cualquier cambio a la rama `main`, se DEBEN ejecutar y superar las 3 comprobaciones locales sin excepciones:

```bash
# 1. Ejecutar suite de pruebas unitarias y de integración (473+ tests)
npm test

# 2. Análisis estático y linter ultrarrápido
npm run lint

# 3. Compilación de tipos TypeScript y empaquetado de producción
npm run build
```

**Criterios de Aceptación:**
- Pruebas vitest: **100% de éxito** (0 fallos).
- `oxlint`: **0 errores, 0 advertencias**.
- `vite build`: Código compilado sin advertencias de tipos en `dist/` en menos de 5 segundos.

---

## 4. Procedimiento de Publicación en Cloudflare Pages

### Método A: Despliegue Continuo con Git (Recomendado)

PseudoFlow está configurado para despliegue automatizado en Cloudflare Pages conectado al repositorio:
1. Crear una rama de trabajo: `git checkout -b feature/nueva-mejora`
2. Realizar commits claros y descriptivos.
3. Subir rama y crear Pull Request hacia `main`.
4. Cloudflare Pages generará automáticamente un **Preview Deployment** con URL única para validar en vivo antes de fusionar.
5. Al fusionar en `main`, Cloudflare Pages ejecuta:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node.js Version**: `>= 18`
6. El despliegue a producción en `https://pseudoflow.pages.dev/` se activa automáticamente en menos de 60 segundos.

### Método B: Despliegue Manual con Wrangler CLI (Solo Emergencias)

Si se requiere desplegar directamente desde la terminal con credenciales autorizadas:

```bash
# 1. Asegurar bundle limpio y validado
npm test
npm run build

# 2. Desplegar carpeta dist al proyecto pseudoflow
npx wrangler pages deploy dist --project-name=pseudoflow --branch=main --commit-dirty=true
```

---

## 5. Procedimiento de Reversión Inmediata (Rollback)

Si un despliegue en producción introduce un error no detectado, Cloudflare Pages permite volver a un despliegue previo en **menos de 5 segundos** de forma atómica:

### Método A: Rollback Instantáneo desde el Dashboard de Cloudflare

1. Ingresar a [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navegar a **Compute (Workers & Pages)** > **Pages** > Proyecto **pseudoflow**.
3. En la pestaña **Deployments**, localizar el último despliegue que funcionaba correctamente (marcado con fecha y commit SHA previo).
4. Hacer clic en los tres puntos (`···`) a la derecha del despliegue objetivo.
5. Seleccionar **Rollback to this deployment**.
6. Confirmar la acción. Cloudflare redirigirá el 100% del tráfico global al build anterior sin necesidad de compilar ni hacer push a git.

### Método B: Rollback vía Wrangler CLI

```bash
# 1. Listar los despliegues recientes con sus IDs y estados
npx wrangler pages deployment list --project-name=pseudoflow

# 2. Revertir al ID del despliegue deseado
npx wrangler pages deployment rollback <DEPLOYMENT_ID> --project-name=pseudoflow
```

### Método C: Reversión en Git

Para mantener el historial sincronizado tras una reversión:
```bash
git revert HEAD -m 1
git push origin main
```
