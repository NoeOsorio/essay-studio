# Essay Studio — Roadmap

Lo que falta para que la app pase de "demo funcional en dev" a "instalable que usas a diario sin frustración", ordenado por dolor real cuando lo veas en uso. Cada fase es independiente: termina la 0 y ya tienes un .app usable; sigue las demás cuando duela.

Última actualización: **2026-05-30** (sesión 12 cerrada — Fase 2.2 Historial de versiones).

Para el log de qué se hizo en cada sesión y por qué, ver [CLAUDE.md](CLAUDE.md).

---

## ✅ Fase 0 — Build funcional para uso personal (cerrada en sesión 11)

> `npm run tauri:build:full` produce un `.app` con sidecar + prompts empacados que funciona fuera de dev.

- ✅ **0.1 Sidecar en el bundle** — `tauri.conf.json` declara `bundle.resources` (sidecar/dist + sidecar/node_modules + sidecar/package.json + prompts); Rust resuelve via `BaseDirectory::Resource` con walk-up como fallback de dev y env vars como override universal. Costo: `.app` 272 MB / `.dmg` 210 MB (mayormente el binario `claude` de la SDK). Optimización de tamaño pasa a Fase 3.
- ✅ **0.2 Mensaje claro si el sidecar no arranca** — `sage://status` Down + banner rojo arriba del editor con detalle del error y hint "verificá `node` + Claude Code".
- ✅ **0.3 Requisitos documentados** — README sección "Requisitos del usuario final" con macOS / Node / Claude Code.
- ✅ **0.4 Smoke checklist** — en el README, paso a paso para validar el `.app` distribuible la primera vez.

Detalle técnico en [CLAUDE.md → sesión 11](CLAUDE.md). Lo que queda fuera y pasa a Fase 1: auto-respawn del sidecar (1.2) y comando "Reintentar" en el banner.

---

## Fase 1 — Robustez para uso diario (~1-2 días)

> Después de Fase 0, la app funciona, pero algunos flujos pueden frustrar si algo se cae.

### 1.1 Errores visibles al usuario
Hoy hay puntos ciegos donde el usuario no entiende qué pasa:

- **Sidecar muerto durante run** → "el consejo piensa…" infinito.
  Fix: timeout 90s por sabio + toast "X no respondió, reintenta".
- **Cita no resuelta en Evaluar** (la mark no se aplica porque el texto cambió) → se pierde silenciosamente, el event `pluma-roja:unresolved` se dispara pero nadie lo escucha.
  Fix: surface en el footer del modal Evaluar: "3 de 12 anotaciones no se pudieron anclar — revisar".
- **Sin internet / SDK error / rate limit** → mensaje genérico.
  Fix: diferenciar tipo de error en el sidecar y mostrar mensaje específico.

### 1.2 Auto-respawn del sidecar
Hoy si el child Node crashea, queda muerto para siempre hasta restart de la app.

Fix: en `sidecar.rs`, cuando `child.wait()` retorna, reintentar `spawn()` hasta N veces con backoff. Si falla N veces, marcar el estado como "down" y mostrar indicador en topbar.

### 1.3 Indicador de salud del sidecar
Pequeño dot en topbar (verde / ámbar / rojo) que muestra si el sidecar está vivo. Click → status detallado + botón "Reiniciar".

---

## Fase 2 — Features que el uso pide (~1 semana, en orden de dolor)

> Lo que la app NO hace y vas a echar de menos cuando la uses unos días.

### 2.1 Export a Markdown (`.md`)
**Por qué primero:** los ensayos viven en JSON dentro de `~/Library/.../essays/`. Si quieres leerlos fuera de la app, mostrar a un profesor, pegar a Notion — no hay forma. Markdown es el formato más universal y barato de implementar.

**Scope:**
- Botón "Exportar" en topbar (o en el menú nativo, ver 2.7)
- Convierte TipTap JSON → markdown: headings, bold/italic, blockquote, listas, code, hr
- Opción: incluir anotaciones inline como `<!-- COMENTARIO: ... -->` o como notas al pie
- Save dialog nativo de Tauri

### ✅ 2.2 Historial de versiones (snapshots) — cerrada en sesión 12

`<id>.history.jsonl` append-only por ensayo. Auto-snapshot cada 10 min con cambios + al cerrar el ensayo. Manual "Guardar versión ahora". Restore inyecta un `before-restore` automático antes de aplicar. Retención: últimos 20 autos + todos los explícitos. Panel overlay modal en el topbar (lado izquierdo, junto al save badge). Detalle: [CLAUDE.md → sesión 12](CLAUDE.md). **No-scope v1 confirmado:** diff inline, branching, sync entre dispositivos.

### 2.3 Abrir último ensayo al startup
Hoy siempre caes en la lista. Si trabajas en el mismo ensayo por días, son 2 clicks innecesarios cada vez.

Fix: `lastOpenedEssayId` en un settings JSON. Al boot → si existe y el ensayo aún está en disco → abrir directo en editor view. Holding Shift al abrir la app → ir a la lista.

### 2.4 Backup automático
**Por qué:** los datos viven en una sola máquina, una sola carpeta. Un `rm -rf` accidental o un disco muerto = adiós ensayos.

**Scope v1:**
- Cada N writes, copia `essays/` → `essays-backups/<YYYY-MM-DD-HH>/` (configurable retention).
- También permitir "Exportar todo a ZIP" manual desde Settings.

**No-scope v1:** sync a Drive / iCloud / Dropbox (puedes hacerlo manual con el ZIP).

### 2.5 PDF y Word como tipo de fuente
Hoy la biblioteca de fuentes solo soporta `.txt` y `.md`. Para ensayos académicos en serio, los papers vienen en PDF y los handouts en `.docx`.

**Scope:**
- PDF: usar `pdf.js` para extraer texto en cliente (no formato — texto plano va al `Fuente.contenido`).
- Word: `mammoth.js` extrae texto.
- Ambos se guardan como `origen: "archivo"` con `archivoNombre` original.
- El nombre del archivo y el primer header → propuesta auto para `nombre` y `cita`.

### 2.6 Settings panel
Hoy no hay forma de cambiar:
- Atajos de teclado
- Autosave debounce (default 800ms)
- Cuántos snapshots guardar (después de 2.2)
- Cuántos backups (después de 2.4)
- Penalty del Benchmark (default suave: alta -2, media -1, baja -0.5)
- Defaults de sabios por modo (los que decidimos en sesión 8 — pueden cambiar con el uso)

**Scope:** modal de Settings accesible desde menú nativo o ⌘,. Persistir en `settings.json` aparte de los ensayos. Categorías: Editor · Autosave · Benchmark · Sabios · Backup.

### 2.7 Menú nativo de macOS
Tauri 2 expone el menú nativo. Hoy no está configurado → se ve raro en una app de escritorio que no tenga File/Edit/View en la barra superior.

**Scope:**
- **File**: New essay (⌘N), Open from list (⌘O), Close essay (⌘W), Export (⌘E), Quit (⌘Q)
- **Edit**: Undo / Redo / Cut / Copy / Paste / Select All (TipTap los implementa, solo binding)
- **View**: Toggle board (⌘\\), Toggle scorebar (⌘B)
- **Sabios**: Interrogar (⌘I), Evaluar (⌘⇧E), Rúbrica (⌘R), Fuentes (⌘F)
- **Help**: About Essay Studio, Open ROADMAP, Open CLAUDE.md (los dos abren en el browser default)

### 2.8 Onboarding la primera vez
Si nunca has abierto la app, ¿qué ves? La lista vacía con un botón "Nuevo ensayo". Funciona pero no enseña nada sobre el concepto del consejo / rúbrica / fuentes.

**Scope v1:**
- Detectar primer arranque (no hay essays + no hay settings.json)
- Modal o walkthrough breve (4-5 pasos): "Aquí escribes · Aquí los sabios te interrogan · Aquí defines criterios · Aquí guardas fuentes · El benchmark se deriva de las anotaciones"
- Skippeable. Reabrible desde Help → "Mostrar tour de bienvenida"

---

## Fase 3 — Distribución a otros (opcional)

> Solo si decides compartirlo. Para tu uso personal en tu Mac, las Fases 0-2 son suficientes.

### 3.1 Code signing + notarización (macOS)
Sin esto, los usuarios ven "Apple no puede verificar..." y necesitan click-derecho → Open la primera vez. Para distribución pública:
- Apple Developer ID ($99/año)
- `tauri.conf.json` → `bundle.macOS.signingIdentity`
- `notarytool` workflow para mandar el .app a Apple, esperar verificación, stapleear el ticket

Para Windows existe equivalente con cert de Comodo / DigiCert (más caro y menos relevante en tu caso).

### 3.2 Resolver dependencia de Node
Hoy si el usuario no tiene Node en PATH, el sidecar no arranca. Tres opciones:

**Opción A — Bundle Node**: incluir el binario `node` dentro del `.app`. Heavy (+60-80MB) pero independiente. Tauri 2 lo soporta vía `sidecar` binary feature pero requiere wrappear Node con su archivo a ejecutar.

**Opción B — Migrar a Bun standalone** (o Deno compile): produce un binary autocontenido. Cambia el deployment del sidecar significativamente.

**Opción C — Migrar el sidecar a Rust nativo**: el Agent SDK está en TS/Python, no Rust. Significaría rewrite del cliente del SDK desde cero llamando a la API HTTP directamente. Pierde features (caching automático, etc).

Recomendación: **A** si decides distribuir. La fricción de +60MB pesa menos que migrar.

### 3.3 Resolver dependencia de Claude Code
Hoy el sidecar usa OAuth de Claude Code en macOS Keychain → cuenta Max/Pro. Sin Claude Code instalado y logueado, falla.

Para distribución, dos caminos:
- **Hacer Claude Code un requisito explícito** y documentarlo. Mucha gente con Max ya lo tiene.
- **Soportar API key Anthropic como fallback**: panel de settings donde el usuario pega su key. Cambia el modelo de costo a per-request en vez de Max monthly credit.

### 3.4 Onboarding para usuarios sin contexto
Lo de Fase 2.8 es para usuarios que conocen el dominio. Para distribución pública:
- Explicar qué hace el "consejo"
- Cuál es la diferencia entre Interrogar y Evaluar
- Cómo se define una rúbrica
- Sin asumir que conocen psicología organizacional

---

## Fuera de scope (anti-features)

Cosas que NO voy a construir, para evitar scope creep:
- **Multi-window / pestañas** — un ensayo a la vez es deliberado, ayuda al foco.
- **Sync entre dispositivos** — usa Dropbox / iCloud sobre el data dir si lo necesitas.
- **Colaboración multi-usuario en tiempo real** — la app es para escritura individual aumentada por sabios, no para co-editing.
- **Mobile app** — la pantalla pequeña rompe el modelo editor+tablero. iPad podría tener sentido pero no este año.
- **Plugin system** — la voz de los sabios es deliberadamente curada. Permitir plugins de terceros diluye eso.

---

## Decisiones pendientes (cuando llegue el momento)

- **Theme dark** — el paper-tone está construido para light. Dark requeriría rediseñar la paleta entera. Validar primero si lo necesitas o no.
- **Atajos por defecto** — definir el set y documentarlos. Probablemente esperar a Fase 2.7 (menú nativo) para tomar ese trabajo de una sola pasada.
- **Cuántos sabios?** — hoy son 4 (EM/SI/PR/CR). Si en uso encuentras que un quinto sería útil (Histórico? Filosófico?), evaluarlo. Pero cada sabio añadido es trabajo de persona + UX + UI.
- **Per-criterio scoring del sidecar** — hoy el benchmark es derivado de anotaciones. ¿Vale pedirle al sabio una valoración cualitativa per-criterio adicional a las anotaciones? Esperar a tener datos de uso real.

---

## Cómo retomar el roadmap

Cuando vuelvas a este archivo en una sesión nueva con Claude Code:
1. Lee este archivo + [CLAUDE.md](CLAUDE.md) (resumen de sesiones anteriores).
2. Decide qué fase / ítem atacar.
3. Trata cada ítem como una "sesión" autocontenida — scope tight, tests verdes al cerrar, actualizar CLAUDE.md y este ROADMAP marcando lo hecho.
