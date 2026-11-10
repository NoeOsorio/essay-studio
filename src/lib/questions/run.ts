// The question run. This module owns the promises, the landing queue and the
// bookkeeping; the store holds only the view state (`questionRun`). A run
// outlives any panel: closing the panel changes nothing here. Leaving the
// essay stops the run and tears it down. Follows contracts/renderer-run.md
// and data-model.md, "State transitions".
//
// The interrogatorio entries are never accumulated. They are derived, every
// time, from the run's notes that are still on the board, so a discarded
// note leaves the entries and an undone discard brings it back.

import type { Editor, TLShapeId } from "tldraw";
import {
  ask,
  cancelSidecarRequest,
  interrogate,
  SidecarRequestError,
} from "@/lib/agents";
import { peelNote } from "@/lib/canvas/note-motion";
import { ensureBoard } from "@/lib/mcp/board";
import { ALL_SAGES } from "@/lib/sages";
import {
  registerEssayLeaveHook,
  useStore,
  type AgentRunState,
  type FailureKind,
  type QuestionRun,
} from "@/lib/store";
import type { Interrogatorio, Sage } from "@/lib/storage/types";
import { MAX_QUESTION_CHARS, QUESTIONS_PER_AGENT, sourceFits } from "../../../sidecar/src/review-contract";
import { beginLanding, endLanding, land, type LandingSession } from "./landing";

/** Gap between two landings, so the notes arrive one by one. */
const LANDING_PACE_MS = 60;

export type QuestionSource = { fuenteId?: string; label: string; text: string };

type Task = {
  sage: Sage;
  requestId: string | null;
  /** The request reported its final event (complete, error or sidecar down). */
  terminal: boolean;
  /** The request finished well. Its questions may still be queued. */
  completed: boolean;
  /** How many more questions this agent may land. */
  slots: number;
  /** Questions already accepted, so a retry never repeats one. */
  seen: Set<string>;
  /** Queued or landing right now. */
  pending: number;
  attempt: number;
};

/** The writer's own question: one request, answered whole by one agent. */
type OwnTask = {
  sage: Sage;
  question: string;
  requestId: string | null;
  terminal: boolean;
  completed: boolean;
  /** The answer is queued or landing right now. */
  pending: number;
  attempt: number;
};

/** `text` is what the note says; for an own question that is the answer, and `question` is the note title. */
type Known = { sage: Sage; text: string; question?: string; order: number; present: boolean };

type Job = { sage: Sage; text: string; question?: string };

type Active = {
  runId: string;
  essayId: string;
  language: "es" | "en";
  source: QuestionSource;
  startedAt: string;
  view: QuestionRun;
  tasks: Map<Sage, Task>;
  ownTask: OwnTask | null;
  session: Promise<LandingSession>;
  sessionRef: LandingSession | null;
  queue: Job[];
  draining: boolean;
  /** Every note this run put on the board, whether or not it is still there. */
  known: Map<string, Known>;
  order: number;
  cost: Map<Sage, number>;
  ownCost: number;
  halted: boolean;
  dirty: boolean;
  attached: { editor: Editor; detach: () => void } | null;
  unregisterLeave: () => void;
};

let active: Active | null = null;

function publish(run: Active): void {
  if (active !== run) return;
  const view = run.view;
  useStore.getState().setQuestionRun({
    ...view,
    source: { ...view.source },
    agents: view.agents.map((a) => ({ ...a })),
    ...(view.own ? { own: { ...view.own } } : {}),
    justLanded: [...view.justLanded],
  });
}

function agent(run: Active, sage: Sage): AgentRunState {
  const found = run.view.agents.find((a) => a.sage === sage);
  if (!found) throw new Error("unknown agent");
  return found;
}

function failureOf(code: string | undefined): FailureKind {
  if (code === "NO_QUESTIONS" || code === "NO_ANSWER") return "unusable";
  if (code === "TIMEOUT") return "timeout";
  return "generic";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Start asking. Opens the board when it is closed. */
export function startQuestionRun(input: { source: QuestionSource; sages: Sage[]; ownQuestion?: string }): void {
  const state = useStore.getState();
  const essay = state.current;
  if (!essay || state.view !== "editor") return;
  const running = state.questionRun;
  if (running && running.status !== "ended") return;
  const sages = ALL_SAGES.filter((s) => input.sages.includes(s));
  const text = input.source.text;
  if (sages.length === 0 || text.trim().length === 0 || !sourceFits(text)) return;
  // The writer's own question is answered by Evidencia, or by the first agent that is on.
  const question = (input.ownQuestion ?? "").trim().slice(0, MAX_QUESTION_CHARS);
  const answerer: Sage = sages.includes("em") ? "em" : sages[0];

  // The next run closes the previous run's discard window.
  if (active) teardown(active);

  const runId = crypto.randomUUID();
  const run: Active = {
    runId,
    essayId: essay.id,
    language: essay.language ?? "es",
    source: input.source,
    startedAt: new Date().toISOString(),
    view: {
      runId,
      essayId: essay.id,
      source: { ...(input.source.fuenteId ? { fuenteId: input.source.fuenteId } : {}), label: input.source.label },
      status: "running",
      agents: sages.map((sage) => ({ sage, phase: "thinking", landedCount: 0, failure: null })),
      ...(question ? { own: { sage: answerer, question, phase: "thinking" as const, failure: null } } : {}),
      justLanded: [],
    },
    tasks: new Map(
      sages.map((sage) => [
        sage,
        { sage, requestId: null, terminal: false, completed: false, slots: QUESTIONS_PER_AGENT, seen: new Set<string>(), pending: 0, attempt: 0 },
      ]),
    ),
    ownTask: question
      ? { sage: answerer, question, requestId: null, terminal: false, completed: false, pending: 0, attempt: 0 }
      : null,
    session: beginLanding(essay.id, sages, question !== ""),
    sessionRef: null,
    queue: [],
    draining: false,
    known: new Map(),
    order: 0,
    cost: new Map(),
    ownCost: 0,
    halted: false,
    dirty: false,
    attached: null,
    unregisterLeave: () => {},
  };
  run.unregisterLeave = registerEssayLeaveHook(() => leave(run));
  active = run;
  publish(run);

  run.session.then(
    (session) => {
      run.sessionRef = session;
      // Stopped while the board was still opening.
      if (run.halted || active !== run) endLanding(session);
    },
    (err) => {
      if (active !== run || run.halted) return;
      console.warn("question run could not open the board", err);
      for (const task of run.tasks.values()) {
        if (task.requestId && !task.terminal) void cancelSidecarRequest(task.requestId);
        task.terminal = true;
        const a = agent(run, task.sage);
        if (a.phase === "thinking" || a.phase === "landing") {
          a.phase = "failed";
          a.failure = "generic";
        }
      }
      if (run.ownTask) {
        if (run.ownTask.requestId && !run.ownTask.terminal) void cancelSidecarRequest(run.ownTask.requestId);
        run.ownTask.terminal = true;
        if (run.view.own && run.view.own.phase === "thinking") {
          run.view.own.phase = "failed";
          run.view.own.failure = "generic";
        }
      }
      run.queue.length = 0;
      checkEnded(run);
      publish(run);
    },
  );

  for (const sage of sages) startTask(run, sage);
  if (run.ownTask) startOwn(run);
}

function startOwn(run: Active): void {
  const task = run.ownTask;
  if (!task) return;
  const attempt = ++task.attempt;
  const requestId = crypto.randomUUID();
  task.requestId = requestId;
  task.terminal = false;
  task.completed = false;

  // The source is the one he chose and nothing else: no essay, no other sources.
  ask({
    sage: task.sage,
    text: run.source.text,
    question: task.question,
    language: run.language,
    requestId,
  }).then(
    ({ result, costUsd }) => {
      if (active !== run || task.attempt !== attempt) return;
      task.terminal = true;
      task.completed = true;
      if (costUsd) run.ownCost += costUsd;
      const answer = result.trim();
      if (run.halted) {
        // Stopped: nothing lands.
      } else if (answer === "") {
        failOwn(run, "unusable");
      } else {
        task.pending++;
        run.queue.push({ sage: task.sage, text: answer, question: task.question });
        void drain(run);
      }
      checkEnded(run);
      publish(run);
    },
    (err: unknown) => {
      if (active !== run || task.attempt !== attempt) return;
      task.terminal = true;
      const code = err instanceof SidecarRequestError ? err.code : undefined;
      if (code !== "CANCELLED" && !run.halted && run.view.own?.phase === "thinking") {
        console.warn("own question failed", task.sage, code, err instanceof Error ? err.message : err);
        failOwn(run, failureOf(code));
      }
      checkEnded(run);
      publish(run);
    },
  );
}

function failOwn(run: Active, failure: FailureKind): void {
  const own = run.view.own;
  if (!own || own.phase === "done" || own.phase === "stopped") return;
  own.phase = "failed";
  own.failure = failure;
}

function startTask(run: Active, sage: Sage): void {
  const task = run.tasks.get(sage);
  if (!task) return;
  const attempt = ++task.attempt;
  const requestId = crypto.randomUUID();
  task.requestId = requestId;
  task.terminal = false;
  task.completed = false;

  interrogate({
    sage,
    text: run.source.text,
    language: run.language,
    requestId,
    onUpdate: (u) => {
      if (u.kind !== "question") return;
      if (active !== run || run.halted || task.attempt !== attempt) return;
      accept(run, task, u.text);
    },
  }).then(
    ({ costUsd }) => {
      if (active !== run || task.attempt !== attempt) return;
      task.terminal = true;
      task.completed = true;
      if (costUsd) run.cost.set(sage, (run.cost.get(sage) ?? 0) + costUsd);
      settleAgent(run, task);
      checkEnded(run);
      publish(run);
    },
    (err: unknown) => {
      if (active !== run || task.attempt !== attempt) return;
      task.terminal = true;
      const code = err instanceof SidecarRequestError ? err.code : undefined;
      const a = agent(run, sage);
      if (code !== "CANCELLED" && !run.halted && (a.phase === "thinking" || a.phase === "landing")) {
        // Raw messages can name vendors: they go to the log, never to the screen.
        console.warn("question agent failed", sage, code, err instanceof Error ? err.message : err);
        a.phase = "failed";
        a.failure = failureOf(code);
      }
      checkEnded(run);
      publish(run);
    },
  );
}

/** A finished question from an agent: queue it unless it is a repeat or over the limit. */
function accept(run: Active, task: Task, text: string): void {
  const clean = text.trim();
  if (clean === "" || task.slots <= 0 || task.seen.has(clean)) return;
  task.seen.add(clean);
  task.slots--;
  task.pending++;
  run.queue.push({ sage: task.sage, text: clean });
  void drain(run);
}

async function drain(run: Active): Promise<void> {
  if (run.draining) return;
  run.draining = true;
  try {
    while (run.queue.length > 0 && active === run && !run.halted) {
      const job = run.queue.shift();
      if (!job) break;
      const own = job.question !== undefined;
      const task = own ? undefined : run.tasks.get(job.sage);
      try {
        const session = await run.session;
        if (run.halted || active !== run) break;
        const id = await land(session, {
          sage: job.sage,
          text: job.text,
          ...(own ? { title: job.question } : {}),
          ...(run.source.fuenteId ? { fuenteId: run.source.fuenteId } : {}),
        });
        if (active !== run) break;
        // The board is mounted (the landing just used it); follow its deletes and undos.
        attachRunToEditor(await ensureBoard(run.essayId));
        run.known.set(id, {
          sage: job.sage,
          text: job.text,
          ...(own ? { question: job.question } : {}),
          order: run.order++,
          present: true,
        });
        if (!own) {
          const a = agent(run, job.sage);
          a.landedCount++;
          if (a.phase === "thinking") a.phase = "landing";
        }
        run.view.justLanded.push(id);
        rebuildEntries(run);
      } catch (err) {
        if (!run.halted && active === run) {
          console.warn("question could not land", err);
          if (own) failOwn(run, "generic");
          else failAgent(run, job.sage);
        }
      } finally {
        if (task) task.pending--;
        else if (own && run.ownTask) run.ownTask.pending--;
      }
      if (task) settleAgent(run, task);
      else if (own) settleOwn(run);
      checkEnded(run);
      publish(run);
      // Always a gap after a landing, so two notes never arrive on the same frame.
      if (!run.halted && active === run) await sleep(LANDING_PACE_MS);
    }
  } finally {
    run.draining = false;
  }
  if (active === run) {
    checkEnded(run);
    publish(run);
  }
}

/** A landing that cannot happen ends that agent's run; its queued questions go with it. */
function failAgent(run: Active, sage: Sage): void {
  const task = run.tasks.get(sage);
  const a = agent(run, sage);
  if (task?.requestId && !task.terminal) void cancelSidecarRequest(task.requestId);
  if (task) {
    task.pending -= run.queue.filter((j) => j.sage === sage && j.question === undefined).length;
    task.terminal = true;
  }
  run.queue = run.queue.filter((j) => j.sage !== sage || j.question !== undefined);
  if (a.phase === "thinking" || a.phase === "landing") {
    a.phase = "failed";
    a.failure = "generic";
  }
}

/** An agent is done when its request finished and all its questions landed. */
function settleAgent(run: Active, task: Task): void {
  const a = agent(run, task.sage);
  if (task.completed && task.pending <= 0 && (a.phase === "thinking" || a.phase === "landing")) {
    a.phase = "done";
  }
}

/** His own question is done when the answer landed. */
function settleOwn(run: Active): void {
  const own = run.view.own;
  const task = run.ownTask;
  if (own && task && own.phase === "thinking" && task.completed && task.pending <= 0) own.phase = "done";
}

function checkEnded(run: Active): void {
  if (run.view.status === "ended") return;
  const ownSettled = !run.view.own || run.view.own.phase !== "thinking";
  const settled =
    ownSettled &&
    run.view.agents.every((a) => a.phase === "done" || a.phase === "failed" || a.phase === "stopped");
  const allTerminal =
    [...run.tasks.values()].every((t) => t.terminal) && (run.ownTask ? run.ownTask.terminal : true);
  const idle = run.queue.length === 0 && !run.draining;
  if (run.view.status === "running" && settled && idle) {
    run.view.status = "ended";
  } else if (run.view.status === "stopping" && allTerminal) {
    run.view.status = "ended";
  }
}

/** Ask again for one agent that failed. Lands only what it still lacks. */
export function retryAgent(sage: Sage): void {
  const run = active;
  if (!run || run.halted || run.view.status === "stopping") return;
  const a = run.view.agents.find((x) => x.sage === sage);
  const task = run.tasks.get(sage);
  if (!a || !task || a.phase !== "failed") return;
  task.slots = Math.max(0, QUESTIONS_PER_AGENT - a.landedCount);
  a.phase = "thinking";
  a.failure = null;
  run.view.status = "running";
  publish(run);
  startTask(run, sage);
}

/** Ask again for his own question after it failed. */
export function retryOwn(): void {
  const run = active;
  const own = run?.view.own;
  if (!run || run.halted || run.view.status === "stopping" || !run.ownTask || !own || own.phase !== "failed") return;
  own.phase = "thinking";
  own.failure = null;
  run.view.status = "running";
  publish(run);
  startOwn(run);
}

/** Stop every agent. Synchronous up to writing the entries. */
export function stopQuestionRun(): void {
  const run = active;
  if (!run || run.view.status !== "running") return;
  halt(run);
  publish(run);
}

function halt(run: Active): void {
  run.halted = true;
  run.view.status = "stopping";
  run.queue.length = 0;
  if (run.sessionRef) endLanding(run.sessionRef);
  for (const task of run.tasks.values()) {
    task.pending = 0;
    if (!task.terminal && task.requestId) void cancelSidecarRequest(task.requestId);
  }
  if (run.ownTask) {
    run.ownTask.pending = 0;
    if (!run.ownTask.terminal && run.ownTask.requestId) void cancelSidecarRequest(run.ownTask.requestId);
  }
  for (const a of run.view.agents) {
    if (a.phase === "thinking" || a.phase === "landing") {
      a.phase = "stopped";
      a.failure = null;
    }
  }
  if (run.view.own?.phase === "thinking") {
    run.view.own.phase = "stopped";
    run.view.own.failure = null;
  }
  rebuildEntries(run);
  checkEnded(run);
}

/** Leaving the essay: stop, write the entries to the essay that is still open, and let go. */
function leave(run: Active): void {
  if (active !== run) return;
  if (!run.halted) halt(run);
  teardown(run);
  useStore.getState().setQuestionRun(null);
}

/** Close the discard window: no more hooks, listeners or camera following. */
function teardown(run: Active): void {
  run.attached?.detach();
  run.attached = null;
  run.unregisterLeave();
  if (run.sessionRef) endLanding(run.sessionRef);
  else void run.session.then((s) => endLanding(s), () => {});
  run.halted = true;
  if (active === run) active = null;
}

/** The note stays; the offer to keep or discard it goes away. */
export function keepNote(shapeId: string): void {
  const run = active;
  if (!run) return;
  run.view.justLanded = run.view.justLanded.filter((id) => id !== shapeId);
  publish(run);
}

/** Take the note off the board with one undo step. The entries follow the board. */
export function discardNote(shapeId: string): void {
  const run = active;
  if (!run || !run.known.has(shapeId)) return;
  run.view.justLanded = run.view.justLanded.filter((id) => id !== shapeId);
  publish(run);
  void ensureBoard(run.essayId).then(
    (editor) => {
      if (!editor.getShape(shapeId as TLShapeId)) return;
      editor.markHistoryStoppingPoint("discard-question");
      peelNote(editor, shapeId as TLShapeId);
    },
    (err) => console.warn("question could not be discarded", err),
  );
}

/**
 * Called by the board when a new editor mounts (the board was hidden and
 * shown again), so the discard window keeps following deletes and undos.
 */
export function attachRunToEditor(editor: Editor): void {
  const run = active;
  if (!run || run.attached?.editor === editor) return;
  run.attached?.detach();
  const mark = (id: string, present: boolean) => {
    const known = run.known.get(id);
    if (!known || known.present === present) return;
    known.present = present;
    run.dirty = true;
  };
  const offCreate = editor.sideEffects.registerAfterCreateHandler("shape", (shape) => mark(shape.id, true));
  const offDelete = editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => mark(shape.id, false));
  const offComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
    if (!run.dirty) return;
    run.dirty = false;
    rebuildEntries(run);
    publish(run);
  });
  run.attached = {
    editor,
    detach: () => {
      offCreate();
      offDelete();
      offComplete();
    },
  };
  // A fresh editor loaded the saved board: check what is still there.
  for (const id of run.known.keys()) mark(id, !!editor.getShape(id as TLShapeId));
}

/**
 * Entries are what the run's notes on the board say right now. One entry per
 * agent, in agent order, questions in the order they landed.
 */
function rebuildEntries(run: Active): void {
  const entries: Interrogatorio[] = [];
  for (const sage of ALL_SAGES) {
    const questions = [...run.known.values()]
      .filter((k) => k.sage === sage && k.present && k.question === undefined)
      .sort((a, b) => a.order - b.order)
      .map((k) => k.text);
    if (questions.length === 0) continue;
    const cost = run.cost.get(sage);
    entries.push({
      sage,
      preguntas: questions,
      generadoEn: run.startedAt,
      ...(cost ? { costoUsd: cost } : {}),
      runId: run.runId,
      ...(run.source.fuenteId ? { fuenteId: run.source.fuenteId } : {}),
    });
  }
  // His own question is its own entry: the question, not the answer on the note.
  const own = [...run.known.values()].find((k) => k.question !== undefined && k.present);
  if (own?.question !== undefined) {
    entries.push({
      sage: own.sage,
      preguntas: [own.question],
      generadoEn: run.startedAt,
      ...(run.ownCost ? { costoUsd: run.ownCost } : {}),
      runId: run.runId,
      ...(run.source.fuenteId ? { fuenteId: run.source.fuenteId } : {}),
      propia: true,
    });
  }
  run.view.justLanded = run.view.justLanded.filter((id) => run.known.get(id)?.present);
  const store = useStore.getState();
  if (store.current?.id !== run.essayId) return;
  store.replaceInterrogatoriosForRun(run.runId, entries);
}
