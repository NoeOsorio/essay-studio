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
- **`STALE_REVISION`:** lee de nuevo antes de editar. No reenvíes la misma edición
  con una revisión que ya cambió.
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
La versión de capacidades debe ser al menos `3` para usar las operaciones nuevas.
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
