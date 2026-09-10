// The single home for the structuring capability: turning a batch of raw
// SpokenComments into RevisionTickets. This is judgment, not transcript
// cleanup — Claude classifies each comment, infers the song section, writes
// an actionable note, and flags what is too vague to act on.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RevisionTicket, SpokenComment } from "@/lib/ticket-schema";

const execFileAsync = promisify(execFile);

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

// The fixture track's known structure, used to ground section inference —
// the model should not have to guess blind from wording alone.
const TRACK_SECTION_MAP = `
0:00-0:09 intro
0:09-0:26 verse 1
0:26-0:43 chorus
0:43-1:00 verse 2
1:00-1:16 final chorus
(total length 1:16)
`.trim();

const CATEGORIES: RevisionTicket["category"][] = [
  "lyrics",
  "melody",
  "arrangement",
  "vocals",
  "mix",
  "other",
];

const SENTIMENTS: RevisionTicket["sentiment"][] = ["change", "keep", "unclear"];

/** "1:07" style label for a number of seconds into the track. */
export function formatTimestampLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function buildPrompt(comments: SpokenComment[]): string {
  const commentBlocks = comments
    .map((comment) => {
      return [
        `- commentId: ${comment.id}`,
        `  anchorTimestamp: ${comment.anchorTimestamp} (${formatTimestampLabel(comment.anchorTimestamp)})`,
        `  transcript: "${comment.transcript}"`,
      ].join("\n");
    })
    .join("\n");

  return `You are producing revision tickets for a songwriter from a client's spoken
reactions to a draft song. This is a judgment task, not transcription cleanup: you must
classify each comment, infer which part of the song it refers to, write something the
writer can act on, and flag what is too vague to act on without a follow-up question.

Each comment's anchorTimestamp has already been backed off a couple of seconds from the
moment the client hit pause, because people pause just after the thing they reacted to,
not during it. Treat anchorTimestamp as the point in the track the comment is about.

Track section map (this fixture track is 1:16 long):
${TRACK_SECTION_MAP}

Comments:
${commentBlocks}

For each comment, produce one ticket object with exactly these fields:
- commentId: echo the comment's id
- quote: the client's own words, verbatim, from the transcript — do not paraphrase
- section: the song section inferred from the anchor timestamp and the wording (e.g.
  "verse 2", "chorus", "intro"), or null if it truly cannot be inferred
- category: exactly one of "lyrics", "melody", "arrangement", "vocals", "mix", "other"
- sentiment: exactly one of "change", "keep", "unclear"
- action: an imperative note the writer can act on directly, e.g. "Rewrite the second
  line of verse 2 to lose the forced rhyme."
- needsClarification: true when the comment is too vague to act on as-is (e.g. "I don't
  know, something about it feels off"), false otherwise

Return ONLY a JSON array, one object per comment, in the same order as the comments above.
No prose, no markdown fences, no explanation — just the JSON array.`;
}

/**
 * Extracts the model's JSON array answer from the CLI's response envelope.
 * The envelope wraps the answer in a `result` string field, which may itself
 * be fenced in ``` or have stray prose around it.
 */
function extractTicketArray(cliStdout: string): unknown[] {
  const envelope = JSON.parse(cliStdout);
  const resultText: string = envelope.result ?? "";

  const fenced = resultText.replace(/```(?:json)?/g, "");
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON array found in structuring response");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

function coerceCategory(value: unknown): RevisionTicket["category"] {
  return CATEGORIES.includes(value as RevisionTicket["category"])
    ? (value as RevisionTicket["category"])
    : "other";
}

function coerceSentiment(value: unknown): RevisionTicket["sentiment"] {
  return SENTIMENTS.includes(value as RevisionTicket["sentiment"])
    ? (value as RevisionTicket["sentiment"])
    : "unclear";
}

/**
 * Structures a full round of spoken feedback into revision tickets in a
 * single subprocess call to Claude Code — one pass of judgment over the
 * whole batch rather than a per-comment round trip.
 */
export async function buildRevisionTickets(
  comments: SpokenComment[]
): Promise<RevisionTicket[]> {
  if (comments.length === 0) return [];

  const prompt = buildPrompt(comments);

  const { stdout } = await execFileAsync(
    "claude",
    ["-p", prompt, "--output-format", "json", "--model", CLAUDE_MODEL],
    { maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
  );

  const rawTickets = extractTicketArray(stdout);
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));

  return rawTickets.map((raw, index) => {
    const candidate = (raw ?? {}) as Record<string, unknown>;
    const commentId =
      typeof candidate.commentId === "string"
        ? candidate.commentId
        : comments[index]?.id;
    const sourceComment = commentsById.get(commentId) ?? comments[index];

    const trackTimestamp = sourceComment.anchorTimestamp;

    const ticket: RevisionTicket = {
      id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
      commentId,
      trackTimestamp,
      timestampLabel: formatTimestampLabel(trackTimestamp),
      quote:
        typeof candidate.quote === "string" ? candidate.quote : sourceComment.transcript,
      section: typeof candidate.section === "string" ? candidate.section : null,
      category: coerceCategory(candidate.category),
      sentiment: coerceSentiment(candidate.sentiment),
      action: typeof candidate.action === "string" ? candidate.action : "",
      needsClarification: Boolean(candidate.needsClarification),
    };

    return ticket;
  });
}
