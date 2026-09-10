# Revision Room — build brief

This file is the working spec for this repository. Read it before writing code. It defines
one narrow path, in phases, with a hard checkpoint after Phase 2. Do not build ahead of the
current phase.

---

## 1. What this is

**Revision Room** turns a client's spoken reactions to a draft song into a structured,
timestamped list of revision tickets that the writer can work from directly.

The client listens to the draft in the browser. When something strikes them, they pause and
say it out loud. We capture the playback position at the moment they paused along with what
they said, and turn the session into revision tickets anchored to exact points in the track.

**Friction point attacked: F2 (revision friction).**
**Business outcome targeted: reduce cost.**

The mechanism: today, feedback arrives as untimestamped prose in email ("the chorus works,
verse two feels corny, I liked the drums in the other version"). Someone translates it into
production notes by hand, and ambiguous feedback causes revisions that miss and need another
round. Pausing to speak keeps the location information that prose throws away, and
structuring it removes the manual translation step.

---

## 2. Constraints that shape every decision

- **Total build window: 90 minutes.** Scope discipline is a scored criterion. One narrow path
  that genuinely works beats a broad skeleton that does not.
- **Solo developer, no ops team.** Nothing that requires infrastructure to operate.
- **No API keys.** Everything below runs without paid credentials. See Section 3.
- **Honesty is scored.** Anything stubbed, mocked, or faked must be labeled as such in the
  README. Presenting a stub as working is penalized; labeling it costs nothing.
- **The automated review reads the README as if it were source code.** Naming matters more
  than usual — see Section 8.

---

## 3. Stack — no API keys anywhere

- **Next.js (App Router) + TypeScript**, single app, run with `npm run dev`.
- **Tailwind** for minimal UI. No component library.
- **Speech to text: Web Speech API (`SpeechRecognition`).** Built into Chrome. Starts when
  the client pauses, stops when they resume. No key, no install.
- **Text to speech: Web Speech API (`speechSynthesis`).** Used only in Phase 3.
- **Structuring: Claude Code as a subprocess.** The API route shells out to
  `claude -p "<prompt>" --output-format json` and parses stdout. Real inference, no key.
- **Storage:** write output to `./out/session.json` on disk. No database, no Supabase.
- Commit a `.env.example` even though little is needed. Never commit a real credential.

### Verify the subprocess call FIRST

Before building anything on top of it, confirm from a shell that
`claude -p "say hi" --output-format json` returns parseable output. This is the only load-
bearing external dependency in the build. Find out at minute 8, not minute 55. If it does not
behave, fall back to rule-based structuring and say so plainly in the README.

### A note on Web Speech

Chrome's `SpeechRecognition` streams audio to Google's servers. It is free and keyless, which
is what this build needs, but it is not truly offline. Disclose this in the README's
attribution section. Do not describe the app as offline.

---

## 4. The data contract — build this first

Before any UI or API work, create `src/lib/ticket-schema.ts`. Everything else in the repo
exists to produce this artifact.

```ts
export type SpokenComment = {
  id: string;
  pausedAt: number; // audioEl.currentTime when the client hit pause
  anchorTimestamp: number; // pausedAt minus the reaction back-off (see §5, Phase 1)
  transcript: string; // what they said, verbatim, from SpeechRecognition
};

export type RevisionTicket = {
  id: string;
  commentId: string; // the SpokenComment this came from
  trackTimestamp: number; // seconds into the draft this refers to
  timestampLabel: string; // "1:07", for display
  quote: string; // the client's own words, verbatim
  section: string | null; // "verse 2", "chorus", "intro" — null if not inferable
  category: "lyrics" | "melody" | "arrangement" | "vocals" | "mix" | "other";
  sentiment: "change" | "keep" | "unclear";
  action: string; // imperative note for the writer
  needsClarification: boolean; // true when too vague to act on
};

export type RevisionSession = {
  sessionId: string;
  trackId: string;
  createdAt: string;
  comments: SpokenComment[];
  tickets: RevisionTicket[];
  roundNumber: number; // instrumentation: which revision round this is
};
```

Keep this file small and single-purpose. It is the anchor for the "structured,
machine-readable artifact" requirement, and the automated review matches each requirement to
one best-fitting place in the repo.

---

## 5. Build phases

### Phase 0 — Skeleton (target: 10 min)

- Run the subprocess check in Section 3 before anything else.
- `create-next-app` with TypeScript + Tailwind.
- Commit immediately, then commit as you go. Commit history is how the timed window is
  verified — do not save it all for one commit at the end.
- Create `src/lib/ticket-schema.ts` from Section 4.
- Place a royalty-free or self-made audio file at `public/fixtures/draft-track.mp3`. Note its
  provenance — it goes in the README's attribution section.

### Phase 1 — Pause-to-comment capture (target: 20 min)

One page, `/`, with an `<audio>` element playing the fixture track. The interaction loop:

1. Client pauses the track (button or spacebar).
2. On pause: read `audioEl.currentTime`, start `SpeechRecognition`, show a listening
   indicator.
3. Client speaks their comment. Recognition returns a transcript.
4. On resume: stop recognition, append a `SpokenComment`, continue playback.
5. Repeat until the track ends. Then POST all comments to `/api/session`.

**The reaction back-off.** People pause _after_ the thing they reacted to — they hear the
corny line, register it, then reach for the button. So `pausedAt` runs a beat late. Set
`anchorTimestamp = Math.max(0, pausedAt - 2.5)` and keep both fields. This is a real
observation about how people give feedback; mention it in README section 4.

Keep the UI plain — a player, a listening indicator, and a running list of captured comments.
Polished visual design for its own sake is explicitly out of scope; clear beats pretty.

### Phase 2 — Structure (target: 25 min)

`POST /api/session`:

1. `buildRevisionTickets()` in `src/lib/tickets.ts` — one call to Claude via subprocess.
   Input: the `SpokenComment[]` with their anchor timestamps. Output: `RevisionTicket[]`
   matching the schema exactly.
2. Prompt it to preserve the client's verbatim quote, infer the song section from the
   timestamp and wording, write an imperative action note, and set `needsClarification: true`
   on anything too vague to act on.
3. Write the `RevisionSession` to `./out/session.json` and return it.

Render the tickets on the page in time order, timestamp label prominent, clarification-needed
ones visibly marked.

**What Claude is doing here is judgment, not cleanup.** It classifies each comment, infers
which part of the song is meant, writes something the writer can act on, and flags what is
too vague. That distinction is the difference between this and a transcription tool — make it
obvious in the code and in README section 4.

Each capability lives in its own clearly named module. Do not scatter this logic across route
handlers.

### ⛳ CHECKPOINT — stop here

The primary path now runs end to end. **Commit, then verify:**

- [ ] `npm run dev`, play the track, pause and comment three or four times, get real tickets
      with sensible timestamps.
- [ ] `out/session.json` exists and matches the schema.
- [ ] Run it once for real and **save the output** — that saved result is what the demo shows.
      Produce it now, while there is still time to fix it if it comes out wrong.
- [ ] `DEMO_MODE=1` replays the saved session instead of calling anything. Ten lines. This is
      what you actually present — conference wifi does not get you an extension.
- [ ] No secrets in the repo or its history.

**Do not start Phase 3 until every box above is checked.** If time is short, skip to Phase 4.
A working Phase 2 with an honest README outscores a half-finished Phase 3.

### Phase 3 — The spoken follow-up (target: 15 min, optional)

This is what makes it a voice agent rather than a transcriber. The pause-to-comment loop
already gives you a natural turn to put it in.

- After the client finishes a comment, if it came back `needsClarification`, the agent asks
  one follow-up out loud via `speechSynthesis` before playback resumes:
  "You said verse two feels corny — is that the lyrics or the delivery?"
- Recognition captures the answer and merges it into that ticket's `action`.

If only the question ships and the answer-merge does not, that is fine — say so plainly in the
README. One well-designed question, honestly labeled, is worth more than a fake multi-turn
loop.

### Phase 4 — README (target: 15 min, not optional)

Write `README.md` with exactly these nine sections, in this order:

1. **What this is** — two sentences: concept name, what it does for the business.
2. **The outcome it targets** — cost, friction ID F2, and one or two sentences on the
   mechanism including the rough arithmetic.
3. **What actually works** — an honest inventory: what is real, what is stubbed, what is
   faked. Write this before the demo script; it is the same list.
4. **How it works** — plain language, step by step, in the vocabulary of the problem
   (revision round, feedback, anchor timestamp, brief), not the file tree.
5. **Setup** — prerequisites with versions, install steps, Chrome requirement for Web Speech,
   the Claude CLI dependency, and the fact that no paid API keys are required.
6. **The primary path** — exactly what to run to see it work, including `DEMO_MODE=1`.
7. **What was not built, and why** — the deliberate cuts, and what two more hours would buy.
   Evidence of scope discipline, not an apology.
8. **AI-use disclosure** — tools and models, including Claude Code used both to write this
   code and as the runtime structuring step.
9. **Attribution** — third-party components, the audio fixture's provenance, and the Web
   Speech / Google note from Section 3.

---

## 6. Explicitly not building

State this list in README section 7. Do not build any of it.

- Multiple reviewers, speaker diarization, or contribution aggregation.
- A writer-side dashboard or ticket-editing UI.
- Auth, accounts, or persistence beyond a JSON file on disk.
- Supabase or any real integration with the existing product surface.
- Music generation or audio editing.
- Browser support beyond Chrome.
- Tests, CI, containerization, or error handling beyond the happy path.
- Retry, streaming, or latency optimization.

---

## 7. Requirement coverage

Keep this table accurate as the build progresses. Every mandatory item must have an obvious
home in the repository.

| ID    | Requirement                                      | Where it lives                                     |
| ----- | ------------------------------------------------ | -------------------------------------------------- |
| MR-1  | Captures, generates, or transforms audio         | Mic capture on pause; `speechSynthesis` in Phase 3 |
| MR-2  | Person-supplied input as entry point             | Pause-and-speak loop on `/`                        |
| MR-3  | Structured machine-readable artifact             | `RevisionSession` → `out/session.json`             |
| MR-4  | Single runnable entry point                      | `npm run dev`, documented in README §6             |
| MR-5  | README states concept, friction ID, outcome      | README §1–2                                        |
| MR-6  | README separates functional from stubbed         | README §3                                          |
| OR-1  | Transcribes spoken audio to text                 | `SpeechRecognition` capture                        |
| OR-2  | Generates spoken response                        | Phase 3 only — omit the row if not built           |
| OR-3  | Asks a follow-up when an answer is vague         | Phase 3 only — driven by `needsClarification`      |
| OR-6  | Maps output onto brief fields                    | Ticket `category` / `section`                      |
| OR-11 | Logs events to measure the outcome               | `roundNumber` on the session                       |
| OR-12 | Config from environment, `.env.example` provided | `.env.example`                                     |
| OR-13 | Offline demo mode using recorded fixtures        | `DEMO_MODE=1` replays `out/session.json`           |

Do not add capabilities purely to fill rows. An unmatched optional requirement costs nothing;
a repository full of capabilities that never come up in the demo reads as padding.

---

## 8. Naming and comment conventions

The automated review matches requirement text against the repository semantically, and reads
documentation the same way it reads source. Two rules follow:

- **Name things in the vocabulary of the problem:** `RevisionTicket`, `SpokenComment`,
  `buildRevisionTickets`, `anchorTimestamp`, `revisionRound`. Not `processData`,
  `handleBlob`, `Item`.
- **Write comments about intent, not mechanics.** "Backs the anchor off by a couple of seconds
  because people pause after the line they reacted to, not during it" is useful. "Subtract 2.5
  from the timestamp" is not.

Give each capability exactly one home. A capability scattered across several loosely related
files matches weakly; one well-named module that clearly owns it matches strongly.

---

## 9. Demo cut (two minutes, prepared during the build window)

Not code, but shape the build around it:

- ~20 seconds: what it is and why Business Bangerz would want it.
- ~40 seconds: play the track, pause, say a comment, show it land anchored to that moment.
- ~40 seconds: cut to the **pre-baked** ticket list. Say out loud that it is pre-baked.
- ~20 seconds: what is real, what is stubbed, what you cut.
