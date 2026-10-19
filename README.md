# PseudoFlow - Editor de Pseudocódigo Online y Diagramas de Flujo

![PseudoFlow Banner](./public/og-image.png)

[![CI Quality & Validation](https://github.com/daniel95-sv/PseudoFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/daniel95-sv/PseudoFlow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Deployed-F38020?logo=cloudflare&logoColor=white)](https://pseudoflow.pages.dev/)

> **Sitio Oficial / Despliegue en Vivo**: [https://pseudoflow.pages.dev/](https://pseudoflow.pages.dev/)  
> **Repositorio Oficial**: [https://github.com/daniel95-sv/PseudoFlow.git](https://github.com/daniel95-sv/PseudoFlow.git)

**PseudoFlow** es una plataforma educativa web de alto rendimiento que unifica un entorno didáctico completo para aprender programación y algoritmia. Permite escribir y ejecutar pseudocódigo en tiempo real directamente en el navegador, generando automáticamente diagramas de flujo normalizados, estructogramas Nassi-Shneiderman, diagramas de clases UML y tablas dinámicas de prueba de escritorio (trace desk), sincronizadas sentencia a sentencia con el código fuente.

Funciona **100% en el lado del cliente (Client-Side SPA)** mediante Web Workers y aislamiento en memoria, sin requerir servidores de backend, bases de datos ni instalación previa.

---

## 🚀 Características Principales

### 1. Cinco Superficies Didácticas Sincronizadas en Tiempo Real
- **Editor de Pseudocódigo**:
  - Resaltado sintáctico profesional, numeración de líneas, soporte bilingüe (palabras clave en español e inglés) y marcado visual en vivo de la sentencia activa durante la ejecución.
- **Ordinograma (Diagrama de Flujo SVG)**:
  - Generación geométrica automática basada en el AST del algoritmo.
  - Símbolos normalizados ISO/ANSI para inicio/fin, entrada (`Leer`), salida (`Escribir`), procesos/asignaciones, decisiones condicionales (`Si / SiNo`) y bucles (`Mientras`, `Repetir`, `Para`).
  - Iluminación en tiempo real del nodo correspondiente al avanzar la ejecución.
- **Estructograma (Nassi-Shneiderman)**:
  - Visualización estructurada en bloques anidados sin flechas, ideal para comprender el flujo de control estructurado y la jerarquía de decisiones y bucles.
- **Prueba de Escritorio Dinámica (Trace Desk)**:
  - Registro paso a paso del estado de la memoria en cada sentencia.
  - Seguimiento riguroso de variables escalares, arreglos unidimensionales y bidimensionales, paso de parámetros por valor y por referencia encadenado, y aliasing/identidad de instancias de objetos (`#1`, `#2`).
- **Diagrama de Clases UML**:
  - Representación visual automática de clases, modificadores de acceso (público / privado), atributos, métodos y jerarquías de herencia (`HeredaDe`).

### 2. Transpilador en Vivo a Lenguajes Profesionales
- **Python 3**:
  - Genera código idiomático y ejecutable (`while`, `for in range()`, listas anidadas, funciones y clases), preservando literales y constantes lógicas.
- **Rust (Edición 2021)**:
  - Transpila a código Rust fuertemente tipado (`let mut`, tipos primitivos `i64`, `f64`, `String`, `bool`, inicializaciones con `Default::default()`, macro `vec!` bidimensional con indexación segura `as usize`, rangos con `.step_by()` y macros `println!`/`print!`).

### 3. Motor de Ejecución Robusto y Aislado
- **Lexer y Parser Recursivo**:
  - Soporta sintaxis tradicional estilo PSeInt y variantes bilingües modernas (`Definir / define`, `Si / if`, `Mientras / while`, `Para / for`, `Repetir / repeat`, `Segun / switch`, `SubProceso / subroutine / function`).
  - Declaraciones múltiples en una sola línea (`Definir a, b, c Como Entero`) y dimensionamiento múltiple (`Dimension a[5], b[3, 3]`).
  - Negación lógica con palabra reservada `NO` o mediante operador `!`.
- **Intérprete Interactivo y Control de Flujo**:
  - Control de velocidad multimodo (0.5x, 1x, 2x, 4x, 8x), pausa, reanudación inmediata y ejecución paso a paso.
  - Consola interactiva con soporte de lectura por teclado (`Leer`) y salida sin saltos (`Escribir Sin Saltar`).
  - Detección estricta de bucles infinitos (`InfiniteLoopError`), límites de recursión (500 frames) y cuota de salida protegida contra congelamiento de UI.
- **Programación Orientada a Objetos (POO)**:
  - Declaración de clases, constructores, métodos de instancia, atributos públicos/privados, operador de instanciación (`Instanciar` / `Nuevo` / `new`), referencia a la instancia (`Este` / `this`) y llamadas a la superclase (`Super`).
- **Seguridad en Memoria**:
  - Tablas de símbolos construidas con diccionarios limpios (`Object.create(null)`), garantizando protección total contra ataques de *Prototype Pollution*.

### 4. Ruta Pedagógica y Sistema de Retos
- **15 Módulos de Aprendizaje Estructurados en 3 Tramos**:
  - **Tramo 1 (Fundamentos)**: Introducción, variables y tipos, entrada/salida interactiva, operadores aritméticos y lógica booleana.
  - **Tramo 2 (Control y Flujo)**: Condicionales simples y dobles, selección múltiple, bucles con precondición (`Mientras`), postcondición (`Repetir`) y contadores (`Para`).
  - **Tramo 3 (Modularidad y Estructuras)**: Subprocesos y funciones, arreglos unidimensionales (vectores), arreglos multidimensionales (matrices) y POO (clases, objetos y herencia).
- **95 Ejercicios con Autoevaluación en Web Workers**:
  - Pruebas formativas automáticas aisladas que ejecutan casos de prueba visibles y ocultos con temporizador watchdog de 2.5 segundos por caso.
- **86 Algoritmos de Ejemplo**:
  - Catálogo de algoritmos listos para abrir, analizar y ejecutar con un solo clic.

### 5. Adaptabilidad, PWA y Accesibilidad
- **Diseño Responsive**:
  - Modos de escritorio en 2, 3 o 4 columnas redimensionables y vista táctil optimizada para móviles con barra flotante y controles inferiores persistentes.
- **Accesibilidad WAI-ARIA**:
  - Semántica estricta con roles `tablist`, `tab`, `aria-selected` y etiquetas `aria-label` en controles interactivos y lectores de pantalla.
- **Progressive Web App (PWA)**:
  - Totalmente instalable en Android, iOS, Windows y macOS; iconos multirresolución y manifest standalone.

---

## 🛠️ Tecnologías

| Componente | Tecnología |
| :--- | :--- |
| **Interfaz & Vistas** | React 19, TypeScript, Lucide React |
| **Motor de Ejecución** | AST Parser descendente recursivo en TypeScript |
| **Aislamiento & Workers** | Web Workers nativos para validación y ejecución interactiva |
| **Estilos & Diseño** | Vanilla CSS con tokens y temas nativos (Dark / Light) |
| **Bundler & Tooling** | Vite 6, Oxlint, Vitest |
| **Hosting & Edge Delivery** | Cloudflare Pages con caché inmutable y cabeceras de seguridad |

---

## 📦 Instalación y Desarrollo Local

### Prerrequisitos
- **Node.js**: Versión 18 o superior.
- **npm**: Versión 9 o superior.

### Pasos de Instalación

```bash
# 1. Clonar el repositorio oficial
git clone https://github.com/daniel95-sv/PseudoFlow.git
cd PseudoFlow

# 2. Instalar dependencias limpias
npm install

# 3. Iniciar el servidor de desarrollo Vite
npm run dev
```

Abre tu navegador en `http://localhost:5173/`.

### Comprobaciones y Pruebas Locales

```bash
# Ejecutar suite de pruebas unitarias y de integración (475 tests)
npm test

# Ejecutar análisis estático con linter
npm run lint

# Compilar para producción (TypeScript y bundle Vite)
npm run build
```

---

## 🌐 Publicación y Despliegue en Cloudflare Pages

El proyecto se despliega automáticamente en **Cloudflare Pages** tras cada push a la rama `main` verificado por el pipeline de integración continua.

### Procedimiento de Despliegue y Rollback
- **Despliegue Continuo**: Cada commit integrado en la rama `main` ejecuta la validación automatizada en GitHub Actions y actualiza el sitio en vivo en Cloudflare Pages (`https://pseudoflow.pages.dev/`).
- **Rollback Inmediato**: Ante cualquier incidencia en producción, desde el panel de Cloudflare Pages (**Workers & Pages** > **pseudoflow** > **Deployments**) se puede seleccionar el despliegue previo y ejecutar **Rollback to this deployment** en menos de 5 segundos.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia de código abierto **MIT**. Consulta el archivo **[LICENSE](./LICENSE)** para obtener más información.

Desarrollado y mantenido por **Daniel Amilcar Sanchez Vasquez** ([@daniel95-sv](https://github.com/daniel95-sv)) con fines educativos y de divulgación algorítmica abierta.
