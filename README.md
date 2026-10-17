# PseudoLearn - Web App Unificada e Independiente

Aplicación web integral desarrollada a partir de la ingeniería inversa del sitio web oficial ([pseudolearn.app](https://pseudolearn.app/)) y del instalador de escritorio (`PseudoLearn-Setup.exe`).

Esta solución unifica la experiencia de presentación web con un **Entorno de Desarrollo Integrado (IDE)** en el navegador, ejecutándose **100% en el lado del cliente** sin dependencias de backend ni instalación previa.

---

## 🚀 Características Principales

1. **4 Superficies Sincronizadas en Tiempo Real**:
   - **Editor de Código**: Numeración de líneas, coloreado sintáctico e iluminación en tiempo real de la sentencia en ejecución.
   - **Ordinograma (Diagrama de Flujo SVG)**: Generación geométrica automática basada en el AST del algoritmo con resaltado activo del bloque en ejecución.
   - **Estructograma (Nassi-Shneiderman)**: Visualización estructurada de bloques secuenciales, condicionales (`Si / SiNo`) y bucles (`Mientras`, `Repetir`, `Para`).
   - **Tabla Dinámica de Escritorio (Trace Desk)**: Seguimiento paso a paso del estado de la memoria, valores de variables en cada paso, soporte de paso por referencia y aliasing/identidad de objetos (`#1`, `#2`).

2. **Superficies Adicionales**:
   - **Diagrama de Clases UML**: Representación automática de clases, atributos, métodos y jerarquías de herencia (`HeredaDe`).
   - **Transpilación en Vivo**: Conversión inmediata del pseudocódigo a código idiomático en **Python 3** y **Rust**.

3. **Motor de Ejecución 100% en Cliente**:
   - Analizador léxico (Lexer) y sintáctico (Parser) descendente recursivo completo.
   - Intérprete paso a paso con control de velocidad (0.5x, 1x, 2x, 4x, 8x), pausa, reanudación y ejecución completa.
   - Consola de entrada/salida interactiva (`Escribir` y `Leer`).
   - Soporte exhaustivo para Programación Orientada a Objetos: `Clase`, `Constructor`, `Metodo`, `Este` (this), `Super`, creación de instancias (`Instanciar` / `new`) y enlace dinámico.

4. **Ruta Pedagógica Completa**:
   - **15 Módulos** organizados en los 3 Tramos oficiales:
     - **Tramo A**: Fundamentos y lógica estructurada básica.
     - **Tramo B**: Funciones, procedimientos, alcance y modularización.
     - **Tramo C**: Programación Orientada a Objetos, estructuras dinámicas y algoritmos avanzados.
   - **95 Ejercicios Guiados**: Con enunciados completos, código inicial, soluciones de referencia y **suite de validación automática** de casos de prueba visibles y ocultos.
   - **86 Ejemplos Ejecutables**: Catálogo completo de algoritmos listos para cargar y ejecutar con un clic.

5. **Diseño y Estética Fiel**:
   - Paleta cromática oficial extraída del sitio web (tokens `--pl-canvas`, `--pl-field`, `--pl-brand`, etc.).
   - Soporte completo para **Modo Oscuro** y **Modo Claro**.
   - Soporte bilingüe (**Español** e **Inglés**) para palabras reservadas del pseudocódigo y de la interfaz.

---

## 🛠️ Tecnologías Utilizadas

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite 6
- **Iconografía**: Lucide React
- **Estilos**: Vanilla CSS con sistema de diseño de tokens y variables nativas

---

## 📦 Instalación y Ejecución Local

### Prerrequisitos
- Node.js >= 18.x (probado en Node.js v24.14.0)
- npm >= 9.x

### Pasos para iniciar

```bash
# 1. Navegar al directorio del proyecto
cd C:/Users/MyPC/Documents/Pseudolearn/web-app-clone

# 2. Instalar dependencias (si aún no se han instalado)
npm install

# 3. Iniciar el servidor de desarrollo Vite
npm run dev
```

El servidor iniciará localmente (típicamente en `http://localhost:5173/`). Abre esta URL en cualquier navegador moderno.

### Compilar para Producción

```bash
npm run build
```

Los archivos optimizados para producción se generarán en la carpeta `dist/`. Pueden desplegarse en cualquier hosting estático (Vercel, Netlify, GitHub Pages, Cloudflare Pages, Firebase Hosting, etc.).

---

## 📂 Estructura del Proyecto

```
web-app-clone/
├── index.html                   # Entrada HTML con metadatos y fuentes
├── package.json                 # Dependencias y scripts
├── vite.config.ts               # Configuración del bundler Vite
├── src/
│   ├── main.tsx                 # Montaje de la aplicación
│   ├── App.tsx                  # Enrutador principal (Landing <-> IDE)
│   ├── index.css                # Sistema de diseño, tokens y estilos
│   ├── data/                    # Datos extraídos por ingeniería inversa
│   │   ├── modules.json         # 15 módulos pedagógicos
│   │   ├── exercises.json       # 95 ejercicios con casos de prueba
│   │   ├── specifications.json  # Especificación formal del lenguaje
│   │   └── examples.json        # 86 ejemplos de código ejecutables
│   ├── engine/                  # Motor de ejecución e interpretación
│   │   ├── types.ts             # Tipos del AST y del entorno de ejecución
│   │   ├── lexer.ts             # Tokenizador bilingüe (ES / EN)
│   │   ├── parser.ts            # Parser recursivo generador de AST
│   │   ├── interpreter.ts       # Intérprete paso a paso con tabla de traza
│   │   ├── flowchart.ts         # Generador de geometría para diagramas de flujo
│   │   ├── structogram.ts       # Generador de bloques Nassi-Shneiderman
│   │   └── transpiler.ts        # Transpilador a Python 3 y Rust
│   └── components/              # Componentes de interfaz de usuario
│       ├── LandingPage.tsx      # Portada web institucional interactiva
│       ├── IDEView.tsx          # Entorno de desarrollo completo en navegador
│       ├── FlowchartView.tsx    # Visualizador SVG de ordinograma
│       ├── StructogramView.tsx  # Visualizador de estructograma
│       ├── TraceTableView.tsx   # Visualizador de tabla de escritorio
│       ├── UmlClassView.tsx     # Visualizador de diagrama de clases UML
│       └── CodeExportView.tsx   # Panel de exportación a Python y Rust
```

---

## 🔬 Proceso de Ingeniería Inversa (REA)

1. **Inspección de Binarios**:
   - `PseudoLearn-Setup.exe` fue identificado mediante análisis de cabeceras PE y firmas como un instalador **Inno Setup 6.7.0** que empaqueta una aplicación **Flutter Windows x64 (Dart AOT)**.
   - Se empleó el descompilador de instaladores `innounp-2` para extraer 453 archivos internos del instalador.
2. **Extracción de Conocimiento Pedagógico**:
   - Se localizaron los activos originales en `data/flutter_assets/assets/knowledge/`.
   - Se extrajeron y validaron los 15 módulos, los 95 ejercicios guiados con sus pruebas unitarias visibles y ocultas, las 11 especificaciones del lenguaje y los 86 ejemplos.
3. **Análisis Web**:
   - Se extrajeron los tokens de diseño, tipografías y estructura visual del sitio oficial [pseudolearn.app](https://pseudolearn.app/).
4. **Reconstrucción Limpia**:
   - Se programó un motor de ejecución en TypeScript sin dependencias externas pesadas, reproduciendo exactamente la semántica de evaluación paso a paso y la sincronización cuádruple en pantalla.
