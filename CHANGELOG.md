# Cambios

## 0.5.0

- Rediseño Stationery Desk integrado con la ampliación MCP de 0.4.0: las revisiones iniciadas por MCP escriben en las correcciones persistentes del ensayo, igual que el panel.
- Las preguntas e interrogaciones por MCP crean notas en el tablero con el mismo camino que el panel de preguntas.

## 0.4.0

- Agrupación y páginas nativas del tablero, con conexiones y objetos bloqueados protegidos.
- Historial independiente del título mediante el editor existente, disponible por MCP y menú nativo.
- Importación de SVG estático con validación previa y almacenamiento duradero.
- Capacidades MCP ampliadas sin cambiar el protocolo ni agregar dependencias.

## 0.3.1

- Prueba nativa reproducible de todas las herramientas MCP con biblioteca temporal y generación simulada.
- El límite de páginas de resultados coincide con el anunciado por el MCP.
- Lectura de puntuación, cobertura y estado de evaluaciones guardadas; control de visibilidad y consulta del panel activo.

## 0.3.0

- MCP ampliado para objetos, encabezados, formato, selección, versiones, fuentes y rúbrica.
- Revisiones e interrogaciones como trabajos compartidos con la interfaz, cancelables y separados de su aplicación.
- Consultas por páginas y rangos, identificadores de operación y protección ante reintentos.
- Restauración detenida ante fallos del respaldo o edición concurrente.
- Verificación de modelos sin inferencia durante esta implementación.

## 0.2.0 — 2026-11-07

- MCP local para leer y editar ensayos y organizar notas por temas, cuadrícula,
  alineación o distribución. Conserva conexiones y notas bloqueadas; permite
  deshacer con el historial nativo y comprueba el guardado.
- Perfiles de revisores, procedencia de evaluaciones y comprobación literal de
  evidencia. Corrige reglas APA y evita aplicar revisiones a un ensayo cambiado.
- Piloto de24 casos sintéticos y herramientas de validación, dry-run y evaluación
  ciega. Las claves requieren adjudicación y no se han ejecutado modelos.
- Guardado serializado y protección de ediciones hechas durante la navegación.
