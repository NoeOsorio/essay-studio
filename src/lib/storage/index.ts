// Thin wrapper around the Tauri storage commands defined in
// `src-tauri/src/storage.rs`. The renderer never touches the
// filesystem directly.

import { invoke } from "@tauri-apps/api/core";
import type { Essay, EssayMeta, Snapshot, SnapshotMeta } from "./types";

export async function listEssays(): Promise<EssayMeta[]> {
  return invoke<EssayMeta[]>("essay_list");
}

export async function readEssay(id: string): Promise<Essay> {
  return invoke<Essay>("essay_read", { id });
}

export async function writeEssay(essay: Essay): Promise<void> {
  await invoke("essay_write", { essay });
}

export async function deleteEssay(id: string): Promise<void> {
  await invoke("essay_delete", { id });
}

/** Version history (sesión 12). */

export async function listHistory(id: string): Promise<SnapshotMeta[]> {
  return invoke<SnapshotMeta[]>("history_list", { id });
}

export async function readSnapshot(
  id: string,
  takenAt: string,
): Promise<Snapshot> {
  // Tauri converts camelCase command args to snake_case in the
  // Rust-side function signature, so we send `takenAt` and Rust
  // sees `taken_at`.
  return invoke<Snapshot>("history_read", { id, takenAt });
}

export async function appendSnapshot(snapshot: Snapshot): Promise<void> {
  await invoke("history_append", { snapshot });
}

export type { Essay, EssayMeta, EssayMode } from "./types";
