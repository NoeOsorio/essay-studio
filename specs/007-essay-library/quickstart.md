# Quickstart: Verifying the Essay Library

Everything runs on generated data through `ESSAY_STUDIO_DATA_DIR`. None of Noe's essays are used, not even a copy.

## Setup

1. Build for real: `npm run sidecar:build`, then `npm run tauri:build`. Timing is judged only on this release build.
2. Generate data: `node scripts/library-fixture.mjs generate <absolute-scratch-dir> 1000`. The script refuses the real app data directory.
3. Launch: `ESSAY_STUDIO_DATA_DIR=<absolute-scratch-dir> "src-tauri/target/release/bundle/macos/Essay Studio.app/Contents/MacOS/app"` (confirm the binary name in the bundle).
4. Drive and capture the running app with computer use.

## Real cases (SC-006), run on every change

| Case | Data | Good result | Must not happen |
|---|---|---|---|
| Open a library | Generated, 5 essays, then 13 | R1.1 or R1.3 by count, the newest essay featured, words and minutes right | First-use animation, a missing essay |
| Continue the latest | Same | Seguir escribiendo opens it unchanged | Text, notes or marks differ |
| Find by a word from inside a body | Same | Shows with the excerpt and the word emphasized | Match from a note, source or annotation only |
| Browse 1000 | Fixture | Scrolls end to end with no blank gaps, month jump lands right | Repeats of the desk cards, a missing essay |
| First use | Empty directory | R1.2 with its storyboard; a choice opens that type | Counter, eyebrow, explanatory text |

## Timing (release build, 1000 essays)

Add temporary `performance.now()` logs, removed afterward, or read the WebKit inspector timeline.

- SC-001: under 1 s from launch to usable list. Take it three ways: warm, first build (delete `library/`), and first launch after a reboot for a cold file cache.
- SC-002: under 200 ms from keystroke to painted results, including the first search after launch.
- Filter change paints in one or two frames. Scroll stays near 16 ms per frame.

## The index never lies (SC-004, User Story 5)

After each step run `node scripts/library-fixture.mjs check <dir>`, which compares the index to the essay files and prints ids and field names only, never text.

| Step | Expected |
|---|---|
| Edit an essay, return to the list | Title, excerpt, words, minutes and stamp current |
| `kill -9` during autosave, 20 times, reopen | Check passes 20 of 20 |
| Restore an old version, return | List shows the restored state |
| Delete `library/index.v1.json` | Rebuilt, list identical |
| Truncate it, or change `version` | Rebuilt, list identical |
| Delete one essay file by hand with the app open, refocus the window | It leaves the list |
| Replace one essay file with broken JSON | Others show; the broken file's bytes are identical afterward (compare hash) |
| Delete from the list | Same confirmation as today; the essay's text is gone from the index |

## Same value as the editor (FR-008)

Pick reviewed essays, including a stale one, one with partial coverage, and an older essay with underlines and no review record. The card or ledger stamp must equal the editor stamp.

## Reduced motion

Turn on Reduce Motion in macOS. R1.2 shows a still title and still notes. Confirm the empty states (first use, and 004's empty board) are the only loops in the app.

## MCP

With the app running against the fixture: `list_essays` returns the six fields per essay, no excerpts or marks, and the window does not stall while answering. `open_essay` and a document edit still work.

## ⌘K

On the list it focuses search. With the editor focused and with the board focused it does nothing and breaks nothing.

## Mechanical checks

- `grep -rn $'\u00B7' src/components/library src/lib/library src-tauri/src/library.rs` (the middle dot, U+00B7) is empty.
- No `uppercase` utility, no text below 12 px, no em-dash in visible strings under `src/components/library`.
- `grep -rn "essayToMeta\|upsertMeta" src` is empty.
- A hash of every file in the fixture's `essays/` before and after a run with no edits is identical, so building the index writes nothing there.
- `npm run lint`, `npm run build`, `npm run test:e2e`, `cargo test` in `src-tauri`.
