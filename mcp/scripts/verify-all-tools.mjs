import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
// Native end-to-end acceptance. Model responses are fixtures; production SDK
// generation is never invoked. The installed app and personal data stay intact.
if (process.platform !== 'darwin')
    throw Error('Native acceptance requires macOS.');
const root = fileURLToPath(new URL('../..', import.meta.url));
const option = (name, fallback) => { const index = process.argv.indexOf(name); if (index < 0)
    return fallback; if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--'))
    throw Error('Missing value for ' + name); return resolve(process.argv[index + 1]); };
const reuseReady = option('--reuse-ready', null);
const data = reuseReady ?? await mkdtemp('/private/tmp/es-all-');
if(reuseReady && !reuseReady.startsWith('/private/tmp/es-all-')) throw Error('Resume only a private acceptance directory.');
const outputs = option('--output', join(data, 'report'));
await mkdir(outputs, { recursive: true });
const sourceApp = option('--app', '/Applications/Essay Studio.app');
const qaApp = join(data, 'Essay MCP QA.app');
console.error('Preparing isolated native app');
if(!reuseReady) execFileSync('/usr/bin/ditto', [sourceApp, qaApp]);
const fixture = fileURLToPath(new URL('./fixtures/review-sidecar.mjs', import.meta.url));
const audit = data + '/fixture-audit.jsonl';
const qaExecutable = join(qaApp, 'Contents/MacOS/app');
const appVersion = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(qaApp, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
const binarySha256 = createHash('sha256').update(await readFile(qaExecutable)).digest('hex');
const app = reuseReady ? null : spawn('/usr/bin/open', ['-n', qaApp, '--env', 'ESSAY_STUDIO_DATA_DIR=' + data, '--env', 'SAGE_SIDECAR_PATH=' + fixture, '--env', 'ESSAY_QA_AUDIT=' + audit], { stdio: ['ignore', 'ignore', 'pipe'] });
let nativePid;
let startupError = '';
app?.stderr.on('data', chunk => { startupError = (startupError + chunk.toString()).slice(-4000); });
const client = new Client({ name: 'all-tools-native-qa', version: '1.0.0' }, { capabilities: {} });
let tools = [], essayId, revision;
const calls = [], checks = [], coverage = new Map();
let errors = [];
let fixtureVerified = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assert(v, label) { checks.push({ label, passed: !!v }); if (!v)
    throw Error(label); }
async function auditLines() { try {
    return (await readFile(audit, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
}
catch {
    return [];
} }
async function raw(name, args = {}) {
    const start = performance.now();
    const r = await client.callTool({ name, arguments: args });
    const text = r.content.find(c => c.type === 'text')?.text;
    const value = text ? JSON.parse(text) : {};
    calls.push({ tool: name, operation: args.operation ?? args.direction ?? args.layout ?? null, ok: !r.isError, error: value.error?.code ?? null, durationMs: Math.round(performance.now() - start) });
    if (value.revision)
        revision = value.revision;
    console.error(name, r.isError ? 'ERROR ' + value.error?.code : 'ok');
    return { r, value };
}
async function call(name, args = {}) {
    let response = await raw(name, args);
    // A cold macOS editor can outlive one native acknowledgement window.
    // Reconcile with reads and the same operation ID; never dispatch a new intent.
    if (response.r.isError && response.value.error?.code === 'OUTCOME_UNKNOWN' && args.operationId) {
        const recoveryDeadline = Date.now() + 3 * 30000;
        while (Date.now() < recoveryDeadline) {
            const context = await raw('get_basic_info');
            if (!context.r.isError) {
                response = await raw(name, args);
                if (!response.r.isError || response.value.error?.code !== 'OUTCOME_UNKNOWN') break;
            }
            await pause(100);
        }
    }
    if (response.r.isError) throw Error(name + ': ' + JSON.stringify(response.value.error));
    coverage.set(name, (coverage.get(name) ?? 0) + 1);
    return response.value;
}

function scoped(name, args = {}) { const definition = tools.find(t => t.name === name); return { ...(definition?.inputSchema.properties.essayId && essayId ? { essayId } : {}), ...args }; }
async function read(name, args = {}) { return call(name, scoped(name, args)); }
async function info() { const v = await call('get_basic_info'); revision = v.revision; return v; }
async function edit(name, args = {}) { await info(); return call(name, scoped(name, { revision, operationId: randomUUID(), ...args })); }
async function refused(name, args, codes) { const { r, value } = await raw(name, scoped(name, { revision, operationId: randomUUID(), ...args })); assert(r.isError && codes.includes(value.error?.code), name + ' rejects ' + codes.join('/')); }
const textOf = node => node.text ?? JSON.stringify(node.props?.richText ?? {});
async function replaceDoc(text) { const d = await read('get_document'); return edit('edit_document', { operation: 'rich_replace', from: 0, to: d.range.documentSize, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }); }
async function waitJob(jobId) { const end = Date.now() + 10000; while (Date.now() < end) {
    const j = await read('get_review_job', { jobId });
    if (j.status !== 'running')
        return j;
    await pause(30);
} throw Error('Job did not finish'); }
async function startReview() { assert(fixtureVerified, 'Fixture verified before model tool'); return edit('start_review', { userRequested: true, pases: ['coherencia'] }); }
async function applyReview() { await replaceDoc('Alpha evidence supports the hiring claim.'); const j = await waitJob((await startReview()).jobId); assert(j.status === 'completed' && j.total === 1, 'Review completes with fixture result'); assert(j.tasks[0].provenance.resolvedModel === 'fixture-no-model', 'Fixture provenance is visible'); await edit('apply_review_results', { jobId: j.jobId, annotationIds: j.results.map(r => r.id) }); return j; }
try {
    // First-launch code validation and a busy macOS session can exceed a minute.
    // This is a startup budget; native tool acknowledgement remains 30 seconds.
    const readyBy = Date.now() + 180000;
    let bridgeReady = false;
    while (Date.now() < readyBy) {
        try {
            const a = await auditLines();
            const started = a.filter(e => e.type === 'fixture_started').at(-1);
            if (started) {
                const command = execFileSync('/bin/ps', ['-p', String(started.ppid), '-o', 'command='], { encoding: 'utf8' }).trim();
                if (command === qaExecutable) {
                    nativePid = started.ppid;
                    await access(data + '/mcp/connection.json');
                    bridgeReady = true;
                    fixtureVerified = true;
                    break;
                }
            }
        }
        catch { }
        await pause(100);
    }
    if (!fixtureVerified)
        console.error(JSON.stringify({ launcherPid: app?.pid, nativePid, bridgeReady, exitCode: app?.exitCode, signalCode: app?.signalCode, startupError }));
    assert(!!nativePid, 'Fixture process ownership verified');
    assert(bridgeReady && fixtureVerified, 'Native private MCP bridge ready');
    const fixtureHash = createHash('sha256').update(await readFile(fixture)).digest('hex');
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [root + '/mcp/dist/mcp/src/server.js'], env: { ...process.env, ESSAY_STUDIO_MCP_CONNECTION_FILE: data + '/mcp/connection.json' } }));
    tools = (await client.listTools()).tools;
    const expected = [...(await readFile(root + '/shared/mcp.ts', 'utf8')).matchAll(/tool\("([a-z_]+)"/g)].map(m => m[1]).sort();
    assert(equal(tools.map(t => t.name).sort(), expected), 'Expected registered tool inventory');
    const initial = await info();
    assert(initial.capabilities.capabilityVersion === 2 && initial.view === 'list', 'Native app context and capability');
    const empty = await read('list_essays');
    assert(empty.total === 0, 'Isolated library initially empty');
    const profiles = await read('list_reviewer_profiles');
    assert(profiles.profiles.length > 0, 'Profiles read without inference');
    const created = await edit('create_essay', { title: 'All tools native QA', mode: 'academico', language: 'es' });
    essayId = created.essayId;
    assert(!!essayId, 'Essay created');
    const neverEvaluated = (await read('get_document', { includeEvaluation: true })).evaluation;
    assert(!neverEvaluated.wasEvaluated && neverEvaluated.overall === null, 'Never-evaluated state exposed');
    await edit('update_essay', { mode: 'blog', language: 'en', reviewerProfile: profiles.defaultProfile });
    let current = await info();
    assert(current.essay.mode === 'blog' && current.essay.language === 'en', 'Essay settings read back');
    await edit('update_essay', { mode: 'academico', language: 'es' });
    await edit('edit_document', { operation: 'insert', from: 1, text: 'Alpha evidence.' });
    assert((await read('get_document')).text === 'Alpha evidence.', 'Plain insert');
    await edit('edit_document', { operation: 'replace', from: 1, to: 6, text: 'Other' });
    assert((await read('get_document')).text.startsWith('Other'), 'Plain replace changes content');
    await edit('edit_document', { operation: 'replace', from: 1, to: 6, text: 'Alpha' });
    await edit('edit_document', { operation: 'rename', title: 'All tools renamed' });
    assert((await info()).essay.title === 'All tools renamed', 'Native title rename');
    await edit('edit_document', { operation: 'format', from: 1, to: 6, formatting: { markType: 'bold' } });
    assert(JSON.stringify(await read('get_document', { format: 'json' })).includes('bold'), 'Native format');
    await edit('set_text_selection', { from: 1, to: 6 });
    assert((await read('get_selection')).textSelection.text === 'Alpha', 'Selection exact text');
    const before = (await read('get_document')).text;
    await edit('edit_document', { operation: 'rich_insert', from: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich added' }] }] });
    assert((await read('get_document')).text.includes('Rich added'), 'Rich insert');
    await edit('editor_history', { surface: 'document', direction: 'undo' });
    assert((await read('get_document')).text === before, 'Document undo state');
    await edit('editor_history', { surface: 'document', direction: 'redo' });
    assert((await read('get_document')).text.includes('Rich added'), 'Document redo state');
    await replaceDoc('Alpha evidence supports the hiring claim.');
    const heading = (await edit('create_node', { type: 'text', x: 0, y: 0, text: 'Candidatos a marco teorico' })).changedIds[0];
    const n1 = (await edit('create_note', { text: 'Workshop', x: 0, y: 100, author: 'tu', kind: 'concepto' })).changedIds[0];
    const n2 = (await edit('create_note', { text: 'Protocolo', x: 300, y: 100 })).changedIds[0];
    const n3 = (await edit('create_note', { text: 'App', x: 600, y: 100 })).changedIds[0];
    await edit('update_nodes', { nodes: [{ id: heading, text: 'Candidatos a marco teórico' }, { id: n1, author: 'sis', kind: 'cita', rotation: 0.1 }] });
    const updated = await read('get_node', { id: n1 });
    assert(updated.meta.author === 'sis' && updated.meta.kind === 'cita' && updated.rotation === 0.1, 'Generic updates preserve metadata');
    assert(textOf(await read('get_node', { id: heading })).includes('Candidatos a marco teórico'), 'Text heading read');
    const arrow = (await edit('connect_notes', { fromId: n1, toId: n2 })).changedIds[0];
    await edit('update_connection', { id: arrow, toId: n3, text: 'Apoyo', props: { color: 'blue' } });
    const a = await read('get_node', { id: arrow });
    assert(a.bindings.some(b => b.terminal === 'end' && b.toId === n3) && a.props.color === 'blue' && textOf(a).includes('Apoyo'), 'Arrow label endpoint and style');
    const clone = (await edit('duplicate_nodes', { ids: [n1, n3, arrow], offsetX: 0, offsetY: 600 })).changedIds;
    assert(clone.length === 3 && clone.every(id => ![n1, n3, arrow].includes(id)), 'Native clones distinct');
    const cloneArrow = (await Promise.all(clone.map(id => read('get_node', { id })))).find(n => n.type === 'arrow');
    assert(equal(cloneArrow.bindings.map(b => b.toId).sort(), clone.filter(id => id !== cloneArrow.id).sort()), 'Cloned internal bindings');
    const orderBefore = (await read('get_board')).nodes.map(n => n.id);
    await edit('reorder_nodes', { ids: [heading], position: 'front' });
    const orderAfter = (await read('get_board')).nodes.map(n => n.id);
    assert(orderBefore.indexOf(heading) !== orderAfter.indexOf(heading) && orderAfter.at(-1) === heading, 'Native stacking order changes');
    const pre = (await read('get_node', { id: n2 }));
    await edit('update_nodes', { nodes: [{ id: n2, x: 700 }] });
    await edit('editor_history', { surface: 'board', direction: 'undo' });
    assert((await read('get_node', { id: n2 })).x === pre.x, 'Board undo');
    await edit('editor_history', { surface: 'board', direction: 'redo' });
    assert((await read('get_node', { id: n2 })).x === 700, 'Board redo');
    await edit('update_nodes', { nodes: [{ id: n3, isLocked: true }] });
    await refused('update_nodes', { nodes: [{ id: n3, x: 999 }] }, ['NODE_LOCKED']);
    await edit('update_nodes', { nodes: [{ id: n3, isLocked: false }] });
    const fixed = await read('get_node', { id: heading });
    const organized = await edit('organize_notes', { scope: 'ids', ids: [n1, n2, n3], layout: 'grid', columns: 3, gap: 48 });
    assert(organized.changedIds?.length > 0 || organized.movedIds?.length > 0, 'Organization reports moved shapes');
    const aligned = await Promise.all([n1, n2, n3].map(id => read('get_node', { id })));
    assert(aligned.every(n => n.y === aligned[0].y), 'Grid row alignment');
    assert((await read('get_node', { id: heading })).x === fixed.x, 'Unselected heading unchanged');
    await edit('organize_notes', { scope: 'ids', ids: [n1, n2, n3], layout: 'align', axis: 'y' });
    await edit('organize_notes', { scope: 'ids', ids: [n1, n2, n3], layout: 'distribute', axis: 'x' });
    await edit('organize_notes', { scope: 'ids', ids: [n1, n2, n3], layout: 'columns', groups: [{ label: 'Outcomes', ids: [n1, n2, n3] }], gap: 40 });
    await edit('set_board_view', { selectedIds: [n1, n2], focusIds: [n1, n2] });
    assert(equal((await read('get_selection')).boardNodeIds.sort(), [n1, n2].sort()), 'Native board selection');
    const camera = await edit('set_board_view', { zoom: 1, x: 10, y: 20 });
    assert(camera.camera.z === 1 && camera.camera.x === 10 && camera.camera.y === 20, 'Native camera readback');
    const filtered = await read('get_board', { types: ['note'], query: 'Workshop', limit: 1 });
    assert(filtered.total >= 1 && filtered.nodes.length === 1, 'Board search and bounded page');
    for (const panel of ['sources', 'rubric', 'history', 'review', 'interrogation', 'none']) {
        await edit('set_app_view', { panel });
        assert((await info()).activePanel === (panel === 'none' ? null : panel), 'Panel state observed: ' + panel);
    }
    await edit('set_app_view', { boardOpen: false });
    assert(!(await info()).board.open, 'Hide board observed');
    await edit('set_app_view', { boardOpen: true });
    assert((await info()).board.open, 'Show board observed');
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    const u = await edit('import_board_asset', { operation: 'begin', type: 'image', mimeType: 'image/gif', fileName: 'pixel.gif', totalBytes: gif.length });
    await edit('import_board_asset', { operation: 'append', uploadId: u.uploadId, offset: 0, data: gif.toString('base64') });
    await edit('import_board_asset', { operation: 'finish', uploadId: u.uploadId });
    const asset = await read('get_asset', { id: u.assetId });
    assert(asset.props?.w === 1 && asset.props?.h === 1, 'Decoded image metadata');
    const partial = await edit('import_board_asset', { operation: 'begin', type: 'image', mimeType: 'image/gif', fileName: 'cancel.gif', totalBytes: gif.length });
    await edit('import_board_asset', { operation: 'cancel', uploadId: partial.uploadId });
    await refused('import_board_asset', { operation: 'append', uploadId: partial.uploadId, offset: 0, data: gif.toString('base64') }, ['UPLOAD_NOT_FOUND']);
    const remote = await edit('create_asset', { type: 'bookmark', src: 'https://example.com/mcp-qa', props: { title: 'QA bookmark' } });
    const remoteId = remote.assetId ?? remote.id ?? remote.asset?.id;
    assert(!!remoteId, 'Remote asset ID');
    assert((await read('list_assets', { query: 'QA bookmark' })).total === 1, 'Asset discovery filter');
    assert((await read('get_asset', { id: u.assetId, fields: ['data'], textLimit: 32 })).data.text.length > 0, 'Bounded asset data');
    const image = (await edit('create_node', { type: 'image', x: 1000, y: 0, props: { assetId: u.assetId, w: 40, h: 40 } })).changedIds[0];
    await refused('delete_asset', { id: u.assetId }, ['ASSET_IN_USE']);
    await edit('delete_nodes', { ids: [image, ...clone] });
    assert(!(await read('get_board')).nodes.some(n => n.id === image), 'Node deletion readback');
    await edit('delete_asset', { id: u.assetId });
    await edit('delete_asset', { id: remoteId });
    assert((await read('list_assets')).total === 0, 'Unused asset deletion');
    const s1 = await edit('edit_source', { operation: 'create', name: 'Evidence A', content: 'Literal evidence A', citation: 'Example (2026)' });
    await edit('edit_source', { operation: 'update', id: s1.id, content: 'Literal evidence updated' });
    const imported = await edit('edit_source', { operation: 'import', name: 'Imported source', content: 'Other source', fileName: 'source.md' });
    assert((await read('list_sources', { origin: 'archivo', query: 'Imported' })).items[0].id === imported.id, 'Source filtered metadata');
    assert((await read('get_source', { id: s1.id })).text === 'Literal evidence updated', 'Source text update');
    const criterion = await edit('edit_rubric', { operation: 'create', name: 'Argumento', description: 'Evidence supports claim', weight: 3 });
    await edit('edit_rubric', { operation: 'update', id: criterion.id, weight: 5 });
    assert((await read('get_rubric', { query: 'Argumento' })).items[0].peso === 5, 'Rubric stable criterion update');
    const version = await edit('create_version');
    assert((await read('get_version', { takenAt: version.takenAt })).text.includes('Alpha evidence'), 'Version text preview');
    assert((await read('list_versions', { kind: 'manual' })).items.some(v => v.takenAt === version.takenAt), 'Version list contains explicit save');
    await edit('edit_document', { operation: 'insert', from: 1, text: 'Changed ' });
    await edit('restore_version', { takenAt: version.takenAt, confirm: true });
    assert((await read('get_document')).text.startsWith('Alpha evidence'), 'Version restore content');
    const review = await applyReview();
    const anns = await read('list_annotations', { query: 'Precisa', pase: 'coherencia' });
    assert(anns.total === 1, 'Saved annotations paginated');
    const detail = await read('get_annotation', { id: anns.items[0].id, textLimit: 131072 });
    assert(JSON.parse(detail.text).mensaje === 'Precisa el alcance de la evidencia.', 'Annotation detail');
    await edit('edit_annotations', { operation: 'discard', ids: [anns.items[0].id] });
    assert((await read('list_annotations')).total === 0, 'Discard annotation only');
    await applyReview();
    let annotation = (await read('list_annotations')).items[0];
    await edit('edit_annotations', { operation: 'apply', ids: [annotation.id] });
    assert((await read('get_document')).text.includes('Verified evidence'), 'Apply suggestion replacement');
    await applyReview();
    await edit('edit_annotations', { operation: 'clear' });
    assert((await read('list_annotations')).total === 0, 'Clear evaluation annotations');
    await replaceDoc('CLEAN_NATIVE_FIXTURE');
    const partialClean = await waitJob((await edit('start_review', { userRequested: true, pases: ['coherencia'] })).jobId);
    await edit('apply_review_results', { jobId: partialClean.jobId, annotationIds: [] });
    let evaluation = (await read('get_document', { includeEvaluation: true })).evaluation;
    assert(evaluation.wasEvaluated && evaluation.overall === 7 && evaluation.missingPasses.length === 3, 'Partial clean evaluation is distinct from full coverage');
    const fullClean = await waitJob((await edit('start_review', { userRequested: true, pases: ['coherencia', 'estilo', 'argumento', 'apa'] })).jobId);
    await edit('apply_review_results', { jobId: fullClean.jobId, annotationIds: [] });
    evaluation = (await read('get_document', { includeEvaluation: true })).evaluation;
    assert(evaluation.wasEvaluated && evaluation.overall === 10 && !evaluation.isStale && evaluation.criteria.total === 1, 'Full clean evaluation score exposed');
    await edit('close_essay');
    await read('open_essay', { essayId });
    evaluation = (await read('get_document', { includeEvaluation: true })).evaluation;
    assert(evaluation.wasEvaluated && evaluation.overall === 10, 'Clean evaluation persists after reopen');
    await edit('set_app_view', { scorebarVisible: false });
    assert((await info()).scorebarDismissed === true && !(await read('get_document', { includeEvaluation: true })).evaluation.visible, 'Score visibility hidden');
    await edit('set_app_view', { scorebarVisible: true });
    assert((await info()).scorebarDismissed === false && (await read('get_document', { includeEvaluation: true })).evaluation.visible, 'Score visibility restored');
    await edit('edit_document', { operation: 'insert', from: 1, text: 'Changed ' });
    assert((await read('get_document', { includeEvaluation: true })).evaluation.isStale, 'Changed evaluated essay reports stale');
    await edit('edit_annotations', { operation: 'clear' });
    evaluation = (await read('get_document', { includeEvaluation: true })).evaluation;
    assert(!evaluation.wasEvaluated && evaluation.overall === null, 'Clear removes clean evaluation metadata');
    const q = await edit('start_interrogation', { userRequested: true, sages: ['sis'], sourceId: s1.id });
    const completedQ = await waitJob(q.jobId);
    const countBefore = (await read('get_board')).total;
    await edit('apply_review_results', { jobId: q.jobId, questionIds: completedQ.results.map(r => r.id) });
    assert((await read('get_board')).total === countBefore + completedQ.results.length, 'Question results materialized');
    const held = await edit('start_interrogation', { userRequested: true, sages: ['em'], text: 'CANCEL_NATIVE_FIXTURE' });
    assert((await read('get_review_job', { jobId: held.jobId })).status === 'running', 'Cancel target is running');
    await read('cancel_review_job', { jobId: held.jobId });
    assert((await read('get_review_job', { jobId: held.jobId })).status === 'cancelled', 'Running job cancelled');
    const cancelDeadline = Date.now() + 5000;
    let cancelSeen = false;
    while (Date.now() < cancelDeadline) {
        const audit = await auditLines();
        const heldRequest = audit.filter(e => e.type === 'fixture_request').at(-1);
        if (audit.some(e => e.type === 'cancel_received' && e.id === heldRequest?.id)) {
            cancelSeen = true;
            break;
        }
        await pause(30);
    }
    assert(cancelSeen, 'Actual fixture transport received cancellation');
    const jobDetail = await read('get_review_job', { jobId: review.jobId, resultId: review.results[0].id, from: 0, to: 64 });
    assert(jobDetail.detail.json.length === 64 && jobDetail.detail.length > 64, 'Bounded review result detail');
    const requestCount = (await auditLines()).filter(e => e.type === 'fixture_request').length;
    await refused('start_review', { userRequested: false, pases: ['coherencia'] }, ['INVALID_ARGUMENTS', 'EXPLICIT_REQUEST_REQUIRED']);
    assert((await auditLines()).filter(e => e.type === 'fixture_request').length === requestCount, 'Unrequested model execution never dispatched');
    const advertisedLimit = tools.find(t => t.name === 'get_review_job').inputSchema.properties.limit.maximum;
    const boundary = await raw('get_review_job', { essayId, jobId: review.jobId, limit: advertisedLimit });
    checks.push({ label: 'Review-job advertised page boundary accepted', passed: !boundary.r.isError });
    if (boundary.r.isError)
        errors.push('get_review_job advertises limit ' + advertisedLimit + ' but rejects it: ' + boundary.value.error?.code);
    await edit('edit_source', { operation: 'delete', id: imported.id, confirm: true });
    assert(!(await read('list_sources')).items.some(s => s.id === imported.id), 'Source delete');
    await edit('edit_rubric', { operation: 'delete', id: criterion.id, confirm: true });
    assert((await read('get_rubric')).total === 0, 'Criterion delete');
    const imageResponse = await raw('get_board_image', { essayId });
    assert(!imageResponse.r.isError && imageResponse.r.content.some(c => c.type === 'image'), 'Native board PNG');
    coverage.set('get_board_image', 1);
    await writeFile(outputs + '/essay-studio-all-tools-board.png', Buffer.from(imageResponse.r.content.find(c => c.type === 'image').data, 'base64'));
    const saved = await read('finish_work');
    assert(saved.saved === true, 'Durable finish');
    const boardCount = (await read('get_board')).total;
    await edit('close_essay');
    assert((await info()).view === 'list', 'Essay closed');
    assert((await read('list_essays', { query: 'All tools renamed' })).total === 1, 'Saved essay searchable');
    await read('open_essay', { essayId });
    assert((await read('get_board')).total === boardCount, 'Board durable reopen');
    const deletedId = essayId;
    await edit('delete_essay', { confirm: true });
    essayId = undefined;
    assert(!(await read('list_essays')).items.some(e => e.id === deletedId), 'Essay removed from library');
    const reopen = await raw('open_essay', { essayId: deletedId });
    assert(reopen.r.isError, 'Deleted essay cannot reopen');
    const missing = tools.filter(t => !coverage.has(t.name)).map(t => t.name);
    assert(missing.length === 0, 'Every advertised tool has a successful call');
    const report = { status: errors.length ? 'failed' : 'passed', native: true, appVersion, binarySha256, transport: 'MCP stdio -> authenticated Unix socket -> installed Tauri app -> native editors', provider: 'fixture JSON-lines sidecar, no SDK/model inference', fixtureHash, fixtureProcessVerified: true, tools: tools.map(t => ({ name: t.name, successfulCalls: coverage.get(t.name) ?? 0, providerSimulation: ['start_review', 'start_interrogation', 'get_review_job', 'cancel_review_job', 'apply_review_results'].includes(t.name) })), checks, calls, errors, fixtureAudit: await auditLines(), remainingLimits: ['Actual model access and review quality were not tested', 'Panel and score visibility state observed through MCP; pixels not compared', 'Native board grouping and page management are not yet exposed', 'SVG/HTML import is deliberately rejected; separate title undo history is not exposed'], dataDir: data };
    await writeFile(outputs + '/essay-studio-all-tools-native.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, toolCount: tools.length, covered: coverage.size, checks: checks.length, errors, dataDir: data }));
    if (errors.length)
        process.exitCode = 1;
}
catch (error) {
    errors.push(String(error));
    await writeFile(outputs + '/essay-studio-all-tools-native.json', JSON.stringify({ status: 'failed', tools: tools.map(t => ({ name: t.name, successfulCalls: coverage.get(t.name) ?? 0 })), checks, calls, errors, dataDir: data, fixtureAudit: await auditLines() }, null, 2));
    console.error(error);
    process.exitCode = 1;
}
finally {
    await client.close().catch(() => { });
    if (nativePid) { try { process.kill(nativePid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
}
