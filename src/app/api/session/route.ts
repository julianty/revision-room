// Thin route: turns a round of captured SpokenComments into a saved
// RevisionSession. All judgment lives in buildRevisionTickets; all
// persistence and demo replay live in session-store.

import { buildRevisionTickets } from "@/lib/tickets";
import { isDemoMode, loadRecordedSession, saveRevisionSession } from "@/lib/session-store";
import type { RevisionSession, SpokenComment } from "@/lib/ticket-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo mode hands the recorded round straight to the page on load, so the
// presentation can show real tickets without a microphone or a network.
export async function GET() {
  if (!isDemoMode()) return Response.json(null, { status: 404 });
  return Response.json(await loadRecordedSession());
}

export async function POST(request: Request) {
  if (isDemoMode()) {
    const recorded = await loadRecordedSession();
    return Response.json(recorded);
  }

  const body = (await request.json()) as {
    comments: SpokenComment[];
    roundNumber?: number;
  };

  // Nothing was said, so there is no round to structure — and no reason to
  // overwrite the recorded session the demo replays.
  if (!body.comments?.length) {
    return Response.json({ error: "No spoken comments in this round." }, { status: 400 });
  }

  const tickets = await buildRevisionTickets(body.comments);
  tickets.sort((a, b) => a.trackTimestamp - b.trackTimestamp);

  const session: RevisionSession = {
    sessionId: crypto.randomUUID(),
    trackId: "draft-track",
    createdAt: new Date().toISOString(),
    comments: body.comments,
    tickets,
    roundNumber: body.roundNumber ?? Number(process.env.REVISION_ROUND ?? 1),
  };

  await saveRevisionSession(session);

  return Response.json(session);
}
