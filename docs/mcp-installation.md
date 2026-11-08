# Instalar el MCP de Essay Studio

Esta guía conecta **Codex, Claude Desktop o Claude Code** con la app abierta para
leer ensayos, editar texto y organizar sticky notes. El servidor actual es local,
usa transporte **stdio** y requiere **macOS**. El adaptador y Essay Studio deben
ejecutarse con el mismo usuario del Mac.

## 1. Preparación común

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

Conectar el MCP no ejecuta los sabios ni un benchmark. Las respuestas del cliente
de IA y las evaluaciones que solicites después usan las condiciones de sus
respectivos planes.

## 2. Codex: app y CLI

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

## 3. Claude Code

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

## 4. Claude Desktop

1. Abre **Settings → Developer → Edit Config** en Claude Desktop.
2. Localiza `~/Library/Application Support/Claude/claude_desktop_config.json`.
3. Añade una entrada `essay-studio` dentro de `mcpServers`, conservando los
   servidores y demás ajustes existentes.
4. Guarda JSON válido y cierra completamente Claude Desktop; después ábrelo.
5. Comprueba `essay-studio` y sus herramientas en las conexiones del cliente.

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

## 5. Confirmar que funciona

Con Essay Studio abierto, pide al cliente:

> Usa el MCP de Essay Studio y llama a get_basic_info. Dime qué ensayo está
> abierto y cuántas notas tiene, sin modificar nada.

La herramienta devuelve el contexto vivo. Si estás en la lista de ensayos,
`essay` puede ser `null`: no es un fallo de conexión. Abre un ensayo para leer el
documento o el tablero. El registro actual expone **15 herramientas**; la
comprobación útil es que una llamada real responda, no sólo ver sus nombres.

Para editar: leer el documento/tablero, usar el `essayId` y la `revision`
recibidos, aplicar el cambio y cerrar el lote con `finish_work`. Para organizar
notas se usa `organize_notes`; `get_board_image` permite comprobar el resultado.
Las herramientas no dependen de que la interfaz de los sabios esté disponible.

El registro en Codex y la conexión nativa se han probado en este proyecto.
Las instrucciones de Claude Desktop y Claude Code se contrastaron con sus guías
y la ayuda de la CLI; no implican una instalación o prueba en esos clientes.

## 6. Problemas frecuentes

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

## 7. Claude web y otros equipos

Esta implementación no ofrece un endpoint HTTP público ni un conector remoto.
La configuración stdio anterior está destinada a clientes que pueden ejecutar
el adaptador en el Mac donde está abierta la app. No es una URL para pegar en
Claude web ni permite conectarse desde otro equipo. Windows/Linux no están
soportados por el puente actual.

## 8. Desarrollo con datos aislados

Para QA, inicia la app con `ESSAY_STUDIO_DATA_DIR` apuntando a una carpeta
absoluta desechable. Configura **en el entorno del adaptador**, no como argumento
de una herramienta, `ESSAY_STUDIO_MCP_CONNECTION_FILE` con la ruta a
`<carpeta>/mcp/connection.json`. En Codex/Claude Desktop se puede usar el campo
`env`; Claude Code permite `--env`. La variable indica la ubicación del archivo
privado: no contiene ni sustituye el token.

La configuración normal no necesita ninguna de esas variables. No compartas ni
versiones descriptores de conexión, configuraciones personales o bibliotecas
privadas.
