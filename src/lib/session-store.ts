// The single home for persistence and demo replay. A revision round is
// written to disk once, as the machine-readable artifact this whole app
// exists to produce, and demo mode replays that same recording so the
// presentation never depends on conference wifi or a live subprocess call.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RevisionSession } from "@/lib/ticket-schema";

const SESSION_PATH = path.join(process.cwd(), "out", "session.json");

export async function saveRevisionSession(session: RevisionSession): Promise<void> {
  await mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2), "utf-8");
}

export async function loadRecordedSession(): Promise<RevisionSession | null> {
  try {
    const raw = await readFile(SESSION_PATH, "utf-8");
    return JSON.parse(raw) as RevisionSession;
  } catch {
    return null;
  }
}

// Demo mode replays a real recorded session rather than depending on
// conference wifi (or spending on another live subprocess call).
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}
