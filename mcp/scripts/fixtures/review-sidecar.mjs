import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const log = event => appendFileSync(process.env.ESSAY_QA_AUDIT, JSON.stringify(event) + '\n');
const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
const active = new Map();
log({ type: 'fixture_started', pid: process.pid, ppid: process.ppid, provider: 'fixture-no-model', imports: ['node:readline', 'node:fs', 'node:crypto'] });
createInterface({ input: process.stdin }).on('line', line => {
    const r = JSON.parse(line);
    if (r.type === 'ping') {
        emit({ id: r.id, type: 'complete', result: 'pong' });
        return;
    }
    if (r.type === 'cancel') {
        log({ type: 'cancel_received', id: r.id });
        clearTimeout(active.get(r.id));
        active.delete(r.id);
        emit({ id: r.id, type: 'error', code: 'CANCELLED', message: 'Fixture cancelled' });
        return;
    }
    if (!['critique', 'interrogate'].includes(r.type))
        throw Error('Unexpected fixture request');
    log({ type: 'fixture_request', id: r.id, requestType: r.type, pase: r.pase, sourceCount: r.fuentes?.length ?? 0 });
    emit({ id: r.id, type: 'started' });
    const t = setTimeout(() => {
        let result;
        if (r.type === 'interrogate')
            result = '¿Qué evidencia respalda la contratación?\n¿Cómo se mide el resultado?';
        else if (r.text.includes('CLEAN_NATIVE_FIXTURE'))
            result = JSON.stringify({ vacio: true });
        else
            result = JSON.stringify({ cita: 'Alpha evidence', severidad: 'media', mensaje: 'Precisa el alcance de la evidencia.', reemplazo: 'Verified evidence', ...(r.rubrica?.criterios?.[0] ? { criterioId: r.rubrica.criterios[0].id } : {}), ...(r.fuentes?.[0] ? { evidence: [{ sourceId: r.fuentes[0].id, quote: r.fuentes[0].contenido, from: 0, to: r.fuentes[0].contenido.length, relation: 'supports' }] } : {}) });
        const provenance = { profileId: r.reviewerProfile ?? 'runtime-baseline', requestedModel: 'fixture-no-model', resolvedModel: 'fixture-no-model', sdkVersion: 'fixture', promptHash: 'fixture', sourceHashes: (r.fuentes ?? []).map(s => ({ sourceId: s.id, sha256: createHash('sha256').update(s.contenido).digest('hex') })), startedAt: new Date().toISOString(), tools: [], settingSources: [] };
        emit({ id: r.id, type: 'token', delta: result });
        emit({ id: r.id, type: 'complete', result, costUsd: 0, provenance });
        log({ type: 'fixture_complete', id: r.id });
        active.delete(r.id);
    }, r.text.includes('CANCEL_NATIVE_FIXTURE') ? 60000 : 50);
    active.set(r.id, t);
});
process.on('SIGTERM', () => { for (const t of active.values())
    clearTimeout(t); process.exit(0); });
