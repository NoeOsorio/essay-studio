# Instalar el MCP de Essay Studio

Esta guía conecta **Codex, Claude Desktop o Claude Code** con la app abierta para
leer ensayos, editar texto y organizar sticky notes. El servidor actual es local,
usa transporte **stdio** y requiere **macOS**. El adaptador y Essay Studio deben
ejecutarse con el mismo usuario del Mac.

## Preparación común

Necesitas:

- Essay Studio **0.2.0 o posterior con MCP**, instalado o ejecutándose con Tauri.
- Node.js **22 o posterior** y npm.
- Una copia de este repositorio: el paquete de la app no instala por sí solo el
  adaptador externo en los clientes.
- El cliente que quieras conectar; para los comandos siguientes, su CLI en el PATH.

Desde la carpeta del repositorio:

```bash
node --version
npm --prefix mcp ci --ignore-scripts
npm --prefix mcp run build

ESSAY_STUDIO_REPO="$(pwd -P)"
ESSAY_STUDIO_NODE="$(node -p 'process.execPath')"
ESSAY_STUDIO_MCP="$ESSAY_STUDIO_REPO/mcp/dist/mcp/src/server.js"
test -f "$ESSAY_STUDIO_MCP"
```

Mantén esta terminal abierta: las instrucciones de CLI reutilizan esas variables.
Si cambias de terminal, vuelve a definirlas desde la carpeta del repositorio.
La ruta compilada es `mcp/dist/mcp/src/server.js`, con los dos segmentos `mcp`.

Abre Essay Studio y comprueba que la barra diga **MCP local disponible**. Si está
desconectado, pulsa **Conectar MCP**. El adaptador encuentra automáticamente el
socket privado de la app. No copies el contenido de `connection.json` ni añadas
tokens o API keys a las configuraciones siguientes.

Conectar el MCP no ejecuta los revisores ni un benchmark. Las respuestas del cliente
de IA y las evaluaciones que solicites después usan las condiciones de sus
respectivos planes.

## Codex: app y CLI

Registra el servidor con rutas absolutas:

```bash
codex mcp add essay-studio -- "$ESSAY_STUDIO_NODE" "$ESSAY_STUDIO_MCP"
codex mcp get essay-studio
codex mcp list
```

El registro se guarda en `~/.codex/config.toml`. La documentación oficial de
OpenAI describe la configuración MCP compartida por los clientes locales de
Codex. Comprueba también las herramientas disponibles en el chat: que el servidor
aparezca en la lista de configuración no demuestra que ese chat lo haya cargado.
Si falta, vuelve a abrir el cliente/chat y comprueba otra vez la conexión.

Para quitar sólo este registro:

```bash
codex mcp remove essay-studio
```

[Documentación oficial de OpenAI: MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=app).

## Claude Code

Usa alcance de usuario para que el servidor esté disponible en tus proyectos:

```bash
claude mcp add --transport stdio --scope user essay-studio -- "$ESSAY_STUDIO_NODE" "$ESSAY_STUDIO_MCP"
claude mcp get essay-studio
claude mcp list
```

Dentro de Claude Code, abre `/mcp` y comprueba el estado de `essay-studio` y sus
herramientas. Acepta los permisos que correspondan a las acciones que quieras
realizar. El alcance `user` se guarda en `~/.claude.json`; es independiente de la
configuración de Claude Desktop.

Para compartir deliberadamente una configuración de proyecto se puede usar
`--scope project` en lugar de `--scope user`. Eso crea o modifica `.mcp.json`;
las rutas absolutas de un Mac no son portables a los de tus compañeros.

Para quitar el registro de usuario:

```bash
claude mcp remove --scope user essay-studio
```

[Documentación oficial de Claude Code: MCP](https://code.claude.com/docs/en/mcp).

## Claude Desktop

- Abre **Settings → Developer → Edit Config** en Claude Desktop.
- Localiza `~/Library/Application Support/Claude/claude_desktop_config.json`.
- Añade una entrada `essay-studio` dentro de `mcpServers`, conservando los
   servidores y demás ajustes existentes.
- Guarda JSON válido y cierra completamente Claude Desktop; después ábrelo.
- Comprueba `essay-studio` y sus herramientas en las conexiones del cliente.

Ejemplo de configuración; sustituye ambas rutas por las de tu Mac:

```json
{
  "mcpServers": {
    "essay-studio": {
      "command": "/ruta/absoluta/al/binario/node",
      "args": ["/ruta/absoluta/essay-studio/mcp/dist/mcp/src/server.js"]
    }
  }
}
```

También puedes generar el bloque con las rutas reales desde la terminal del
paso 1, sin escribir ni reemplazar tu configuración:

```bash
"$ESSAY_STUDIO_NODE" -e 'console.log(JSON.stringify({mcpServers:{"essay-studio":{command:process.execPath,args:[process.argv[1]]}}},null,2))' "$ESSAY_STUDIO_MCP"
```

Usa el binario absoluto de Node: una app abierta desde el Dock puede no heredar
el PATH de nvm u otro gestor. El JSON no expande las variables de shell de esta
guía; pega las rutas generadas, no los nombres de las variables.

Para desinstalar la conexión, elimina sólo la entrada `essay-studio` de
`mcpServers`, conserva JSON válido y reinicia Claude Desktop.

[Guía oficial del protocolo: servidores locales en Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

## Confirmar que funciona

Con Essay Studio abierto, pide al cliente:

> Usa el MCP de Essay Studio y llama a get_basic_info. Dime qué ensayo está
> abierto y cuántas notas tiene, sin modificar nada.

La herramienta devuelve el contexto vivo. Si estás en la lista de ensayos,
`essay` puede ser `null`: no es un fallo de conexión. Abre un ensayo para leer el
documento o el tablero. El registro actual expone las capacidades anunciadas por `get_basic_info`; la
comprobación útil es que una llamada real responda, no sólo ver sus nombres.

Para editar: leer el documento/tablero, usar el `essayId` y la `revision`
recibidos, aplicar el cambio y cerrar el lote con `finish_work`. Para organizar
notas se usa `organize_notes`; `get_board_image` permite comprobar el resultado.
Las herramientas no dependen de que la interfaz de los revisores esté disponible.

El registro en Codex y la conexión nativa se han probado en este proyecto.
Las instrucciones de Claude Desktop y Claude Code se contrastaron con sus guías
y la ayuda de la CLI; no implican una instalación o prueba en esos clientes.

## Problemas frecuentes

- **El servidor existe, pero el chat no tiene sus herramientas:** comprueba la
  conexión en ese cliente y vuelve a abrirlo/chat si hace falta. Cada cliente
  mantiene su propio registro y sesión.
- **`DISCONNECTED`:** abre Essay Studio, pulsa **Conectar MCP** y repite primero
  una lectura. Si acabas de revocar la sesión, el cliente debe reconectarse.
- **Node o `server.js` no encontrados:** repite la preparación, comprueba las
  rutas absolutas y reconstruye el adaptador. Si actualizas Node mediante nvm o
  mueves el repositorio, actualiza las rutas en cada cliente.
- **`STALE_REVISION`:** pasó demasiado tiempo o cambió el ensayo abierto. Lee de
  nuevo antes de editar. Mientras escribes, tu asistente ya no necesita releer: las
  herramientas que apuntan por id (correcciones, notas, fuentes, rúbrica, tablero)
  ignoran la revisión, y las ediciones por posición se mueven solas más allá de lo
  que tecleaste.
- **`RANGE_CHANGED`:** escribiste justo en el texto que tu asistente quería cambiar.
  El error trae el texto como está ahora; no se cambió nada.
- **Guardado fallido o resultado incierto:** lee el estado actual y reintenta
  `finish_work`; no repitas a ciegas una edición que pudo haberse aplicado.
- **No cambies los permisos del socket a públicos:** la app y el adaptador
  comprueban que el directorio y sus archivos sean privados y del mismo usuario.

**Desconectar** en Essay Studio revoca el acceso de todos los clientes de esa
sesión. Quitar el registro de un cliente no borra ensayos ni notas.

## Claude web y otros equipos

Esta implementación no ofrece un endpoint HTTP público ni un conector remoto.
La configuración stdio anterior está destinada a clientes que pueden ejecutar
el adaptador en el Mac donde está abierta la app. No es una URL para pegar en
Claude web ni permite conectarse desde otro equipo. Windows/Linux no están
soportados por el puente actual.

## Desarrollo con datos aislados

Para QA, inicia la app con `ESSAY_STUDIO_DATA_DIR` apuntando a una carpeta
absoluta desechable. Configura **en el entorno del adaptador**, no como argumento
de una herramienta, `ESSAY_STUDIO_MCP_CONNECTION_FILE` con la ruta a
`<carpeta>/mcp/connection.json`. En Codex/Claude Desktop se puede usar el campo
`env`; Claude Code permite `--env`. La variable indica la ubicación del archivo
privado: no contiene ni sustituye el token.

La configuración normal no necesita ninguna de esas variables. No compartas ni
versiones descriptores de conexión, configuraciones personales o bibliotecas
privadas.

## Capacidades ampliadas

Actualiza y compila tanto la app como el adaptador. `get_basic_info` devuelve
`capabilities.capabilityVersion` y la lista de herramientas con su efecto.
La versión de capacidades debe ser al menos `4` para usar las operaciones nuevas.
Un cliente que conserva herramientas antiguas debe reconectarse antes de trabajar.

El MCP permite editar objetos y encabezados, conexiones, formato del documento,
selección y cámara, fuentes, rúbrica, ensayos y versiones. `editor_history` recibe
`surface: "document"`, `surface: "board"` o `surface: "title"` y `direction: "undo"` o `"redo"`.
Los encabezados son objetos de texto; organizar por temas no crea contenedores.

Usa un `operationId` estable, preferiblemente un UUID, para cada acción nueva.
Conserva ese mismo identificador al consultar un resultado incierto. Reutilizarlo
con otros argumentos se rechaza. Tras reiniciar la app, una operación previamente
registrada no se ejecuta otra vez: primero consulta el estado guardado. Los
clientes antiguos conservan sus herramientas, pero deben adoptar identificadores
para obtener esta protección en sus ediciones.

Las colecciones aceptan `query`, `offset` y `limit`; la respuesta indica la
continuación. Fuentes, anotaciones y versiones permiten pedir el contenido por
rangos. `get_document` ofrece bloques y contenido enriquecido con `format: "json"`.
Sus posiciones siguen siendo las del documento nativo, no índices del texto plano.

`start_review` y `start_interrogation` requieren `userRequested: true` y una petición
explícita del usuario. Inician un trabajo y devuelven su identificador; no aplican
resultados. Consulta `get_review_job`, cancela con `cancel_review_job` y aplica
selecciones mediante `apply_review_results`. Editar, ordenar y consultar no ejecuta
modelos. No hay fallback a API keys ni promoción automática de perfiles candidatos.

`delete_essay` y `restore_version` requieren `confirm: true`. Borrar fuentes o
criterios también exige confirmación explícita. Una restauración se detiene si
falla el respaldo o cambia el contenido mientras se carga la versión.

Las importaciones reciben contenido proporcionado por el cliente. Ninguna
herramienta recibe rutas arbitrarias para leer archivos ni ejecuta código.

Para adjuntos del tablero, `create_asset` admite una fuente HTTPS explícita;
`import_board_asset` recibe bytes base64 mediante begin, append y finish. Cada
fragmento lleva su propio identificador de operación y el desplazamiento en bytes
decodificados. Begin devuelve también el assetId para comprobar un guardado
incierto con `get_asset`. Si editas el ensayo durante la carga, cancela y vuelve a
iniciarla con la revisión nueva. `list_assets` permite localizar adjuntos sin
devolver los datos inline. Solo se elimina un adjunto que no esté referenciado.

La verificación local comprobó el descubrimiento de herramientas en Codex y la
conexión de Claude Code. La comprobación de Claude Desktop con una sesión iniciada
está pendiente en NOE-550; no se presupone compatibilidad verificada de ese cliente.

La prueba completa de herramientas se puede repetir con
`npm --prefix mcp run verify:native -- --app "/Applications/Essay Studio.app" --output "/private/tmp/essay-studio-mcp-report"`.
Usa una copia de la app, datos temporales y un proveedor simulado que no ejecuta
modelos. El JSON resultante incluye cada herramienta y sus comprobaciones.

`get_document` acepta `includeEvaluation: true` para leer puntuación, cobertura,
criterios y estado de una evaluación guardada, incluso sin anotaciones. Usa
`set_app_view` con `scorebarVisible` para ocultar o mostrar el sello de la nota
durante la sesión; el contexto devuelve `activePanel` y `scorebarDismissed`.

`apply_review_results` guarda las anotaciones elegidas como correcciones del
ensayo, por el mismo camino que el panel de revisión: la nota, la cobertura y las
tarjetas quedan consistentes. Una cita que ya no se encuentra se guarda como
corrección sin subrayado. `edit_annotations` trabaja con el identificador de la
corrección: `apply` sustituye el texto y la marca como resuelta, `discard` la marca
como no aplicable y `clear` borra todas junto con la evaluación. Las preguntas de
una interrogación aparecen como notas en el tablero, una columna por revisor.

`group_nodes` agrupa y desagrupa objetos mediante el historial nativo.
`list_board_pages` busca páginas y devuelve resultados acotados; `edit_board_page`
crea, renombra, elimina o mueve objetos conectados a otra página. Eliminar exige
`confirm: true`, respeta objetos bloqueados y nunca elimina la última página.
`set_board_page` cambia y guarda la página activa sin invalidar una evaluación.
El máximo de páginas lo fija tldraw y aparece en la consulta.

La importación acepta `image/svg+xml` para vectores estáticos, texto y referencias
locales. Rechaza scripts, HTML, eventos, referencias externas, animación, filtros
y grafos de referencias excesivos antes de guardar. No admite SVG activo ni HTML.
`get_basic_info.titleHistory` indica si el título está listo y permite deshacer
o rehacer. El título conserva su propio historial, aislado del cuerpo y las fuentes.

## Revisar el ensayo con tu asistente

Tu asistente puede hacer la revisión y escribirla en la app, sin que la app
llame a ningún modelo y sin costo para ella. Las correcciones aparecen como las
de los agentes (subrayado en el texto y tarjeta en Correcciones), bajo el nombre
«Tu asistente», y cuentan en el sello.

1. Lee el ensayo con `get_document`. Pide `includeAnnotations` si quieres ver lo
   que ya está marcado y `includeRubric` si hay rúbrica.
2. Envía las correcciones con `add_findings`: `essayId`, `revision`,
   `operationId` y `findings`, hasta 100 por llamada. Cada una lleva `cita` (texto
   literal del ensayo), `mensaje` (qué falla y por qué importa, sin el texto
   nuevo), `severidad` (`alta`, `media` o `baja`) y, si quieres, `reemplazo`
   (texto para pegar), `criterioId` (de la rúbrica) y `occurrence` (cuál
   repetición de la cita subrayar, desde 0). Una corrección por problema.
3. La respuesta trae `added` (cada `id` y si se subrayó, `located`), `rejected`
   (índice y motivo de las que no entraron) y la nueva `revision`. Una cita que no
   está en el texto queda como tarjeta sin subrayado.

Lo que envías se suma a lo anterior. Con `replaceOwn: true` se reemplazan solo
las correcciones abiertas de tu asistente. Un reemplazo con cifras o nombres que
no están en el ensayo ni en sus fuentes se descarta (la corrección se queda).
Un solo deshacer quita los subrayados de toda la llamada. Para consultar,
aplicar, descartar o limpiar usa `list_annotations` (filtro `sage: "as"`) y
`edit_annotations`.

### Poner una referencia en una nota y vincularla a una corrección

Cuando una corrección necesita más contexto del que cabe en la tarjeta (una
cita larga, una fuente, un ejemplo), déjalo en una nota del tablero y vincula la
corrección a esa nota. La tarjeta muestra entonces «Ver nota», que abre el
tablero centrado en la nota y su vista de lectura.

1. Crea la nota con `create_note` (`text`, `title` si quieres, `x`, `y`,
   `author: "tu"` o el que corresponda). La respuesta trae el id de la nota en `changedIds`
   (por ejemplo `shape:abc`); también lo devuelve `get_board`.
2. Vincúlala al enviar la corrección: en `add_findings`, el elemento lleva
   `noteId` con ese `id`. Si no es una nota del tablero de este ensayo, ese
   elemento viene en `rejected` con el motivo y el resto se escribe.
3. Para vincular o desvincular una corrección que ya existe usa `link_note`:
   `essayId`, `revision`, `operationId`, `findingId` y `noteId` (el id de la
   nota, o `null` para quitar el vínculo). Un solo deshacer revierte el cambio.

`get_annotation` y `list_annotations` devuelven `noteId` (o `null`). Si la nota se
borra, la tarjeta deja de mostrar «Ver nota» y `noteId` vuelve como `null`.

### Referencias de una nota (capacidades 9)

Una nota puede llevar su referencia en un apartado propio, sin ocupar espacio en
el texto. El tablero muestra una sola línea (autor, año y página) y la referencia
completa se abre desde ahí con «Copiar referencia completa», «Copiar cita en el texto» y «Ver en
Fuentes».

- `create_note` y `update_nodes` aceptan `reference`: `sourceId` (una fuente de
  Fuentes, de `list_sources`) o `apa` (texto completo, solo si la obra no está en
  Fuentes), más `inText` y `locator` («p. 12») si quieres. `reference: null`
  en `update_nodes` la quita. Si la obra no está en Fuentes, créala antes con
  `edit_source` y usa su `sourceId`: así la nota se mantiene al día con la fuente.
- Nunca pongas la referencia en el texto de la nota. Para limpiar una nota que ya
  la tiene en el texto, usa `update_nodes` con `text` sin la referencia y
  `reference` con ella.
- `get_node` y `get_board` devuelven `reference` en cada nota (`null` si no tiene),
  con `label` (la línea corta) y `apaText` (la referencia completa).
- Si borras la fuente, la nota conserva una copia de la referencia.

## Correcciones, agentes y preguntas (capacidades 6)

La versión de capacidades es la 6.

- `edit_annotations` ahora también cierra y reabre: `resolve` es «Ya lo resolví»
  (cierra sin tocar el texto) y `reopen` devuelve una corrección resuelta; con
  `apply`, `discard` y `clear` hace lo mismo que las tarjetas.
- `list_agents` lista los cuatro agentes fijos (con descripción, ejemplos y cuándo
  corren) y los agentes propios con todos sus campos. `edit_agent` crea, cambia o
  borra un agente propio con las reglas del formulario de Ajustes (nombre de 1 a 40
  caracteres, instrucciones de 1 a 2000); no necesita ensayo abierto.
  `improve_agent_instructions` hace lo de «Mejorar»: devuelve la reescritura y solo
  la guarda con `apply: true`. Usa un modelo, así que pídelo solo cuando el usuario
  lo quiera.
- Los agentes propios entran en las corridas: `start_review.pases` acepta
  `custom:<id>` y `start_interrogation.sages` acepta `c_<id>`. Sin lista,
  `start_review` usa los pases de la app (con los agentes propios encendidos por
  defecto) y `start_interrogation` usa solo los agentes fijos del tipo de ensayo, igual
  que arranca el panel de preguntas; los agentes propios se piden por nombre. Cada
  pase o agente es una llamada al modelo. Las correcciones de un
  agente propio llevan su nombre y color, y solo traen texto de reemplazo si el
  agente puede pegar.
- `start_interrogation.ownQuestion` hace una pregunta tuya sobre el texto; la
  responde un agente y queda en una nota con la pregunta como título.
- `list_annotations` filtra por `criterioId`, por `pase` (`asistente` o
  `custom:<id>`) y por `sage` (`as` o `c_<id>`), y cada elemento trae `criterioId`,
  `reemplazo` y `noteId`.
- `get_basic_info` informa `reviewRun` y `questionRun`, aunque la corrida la haya
  iniciado la persona desde los paneles. `control_run` cancela o reintenta esa
  corrida (reintentar usa modelos y pide `userRequested: true`). `get_review_job`
  devuelve `omittedSources`, las fuentes que no cupieron.

## Fuentes, rúbrica, biblioteca y vistas (capacidad 7)

- `edit_rubric` conserva la consigna guardada. `get_rubric` y `get_document` con
  `includeRubric` la devuelven en `assignment` (por trozos con `textOffset` y
  `textLimit`).
- `import_assignment` guarda la consigna (texto, o un PDF, TXT o Markdown en trozos
  base64 con `begin`, `append` y `finish`) y la IA lee los criterios. Usa un modelo:
  pide `userRequested: true`. Con la rúbrica vacía los criterios se aplican (`applied`);
  si ya tiene criterios devuelve `proposal` con un `proposalId` y no cambia nada hasta
  que la persona acepta y llamas a `confirm_rubric_proposal`, que guarda una versión y
  reemplaza la rúbrica. `retry` vuelve a leer la consigna guardada.
- `edit_source` `create` e `import` pasan por la misma puerta que el panel Fuentes:
  rechazan un texto idéntico (`DUPLICATE_SOURCE`, salvo `allowDuplicate`), respetan los
  límites y la IA lee la cita en segundo plano (un modelo; `readCitation: false` lo
  evita). `update` acepta `authors`, `year` (cuatro dígitos) y `publication`, y
  `restore` devuelve una fuente borrada con la herramienta. `import_source_file` sube un
  PDF, TXT o Markdown en trozos. `read_source_citation` repite la lectura de la cita
  (`userRequested: true`). `get_source` y `list_sources` traen `authors`, `year`,
  `publication`, `citationReadAt` y `reading`.
- `list_essays` busca en título y cuerpo (con `snippet`), filtra por `reviewState`
  (`revisado`, `sin_revisar`, `desactualizado`), ordena con `sort` (`recientes`,
  `antiguos`, `nota`, `titulo`, `relevantes`) y trae `score` por ensayo. `delete_essay`
  borra también un ensayo que no está abierto (`confirm: true`); no toca el abierto.
- `set_app_view.panel` abre además: `settings` (Ajustes, con `agentId`; sin ensayo),
  `report` (la tarjeta de la nota), `corrections` (con `criterioId` opcional), `note`
  (`noteId`, lectura grande), `version` (`takenAt`, vista previa en Historial) e
  `interrogation` con `sages`, `sourceId` o `text` ya elegidos. `get_basic_info.appView`
  dice cuáles están abiertas.

## Skill para asistentes

`skills/essay-studio/SKILL.md` le enseña a Claude, Codex u otro asistente a trabajar bien en Essay Studio: revisar con correcciones que ofrecen «Usar este texto», poner referencias en su apartado de cada nota, vincular notas y correcciones, y editar mientras escribes. Para instalarla, copia la carpeta `skills/essay-studio` a `~/.claude/skills/` (Claude Code), `~/.codex/skills/` (Codex) o `~/.agents/skills/`. Si cambias las herramientas del MCP, actualiza también la skill.
