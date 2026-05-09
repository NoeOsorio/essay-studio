// Thin wrapper around the Tauri storage commands defined in
// `src-tauri/src/storage.rs`. The renderer never touches the
// filesystem directly.

import { invoke } from "@tauri-apps/api/core";
import type { Essay, EssayMeta } from "./types";

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

export type { Essay, EssayMeta, EssayMode } from "./types";
