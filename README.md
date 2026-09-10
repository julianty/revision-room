# Revision Room

## 1. What this is

Revision Room turns a client's spoken (or typed) reactions to a draft song into a structured,
timestamped list of revision tickets a writer can work from directly, without anyone
hand-translating an email first.

## 2. The outcome it targets

It attacks friction point F2 (revision friction) with the goal of reducing cost. Today,
feedback usually arrives as untimestamped prose — "the chorus works, verse two feels corny,
I liked the drums in the other version" — and someone has to guess what it points at before a
writer can act on it. A guess that's wrong sends the revision down the wrong path, and the
client has to sit through another round to say the same thing again, more clearly. Anchoring
each comment to the exact second of the draft it was about, and having a model turn it into an
imperative action note before the writer ever sees it, removes that translation step and cuts
the odds of a revision missing and needing a repeat pass.

The rough arithmetic, illustrative rather than measured: a revision round costs roughly half
a day of writer time plus a day of calendar waiting on client availability. If ambiguous
feedback causes even one round in four to miss and repeat, cutting that repeat rate takes a
measurable slice off the cost of every track that needs revising. The session records which
`roundNumber` it belongs to precisely so that rate is something a team could actually measure
over time rather than estimate.

## 3. What actually works

Real and exercised in this build:

- **Pause-to-comment capture.** An `<audio>` element plays the draft. Pausing it (button or
  spacebar) records `audioEl.currentTime` and opens a comment turn; resuming (or, in typed
  mode, hitting the "Add comment" button) closes it and appends a `SpokenComment` with the
  reaction back-off applied (`anchorTimestamp = pausedAt - 2.5s`, floored at 0). This lives in
  `src/lib/pause-to-comment.ts`.
- **Typed capture is the default and is fully wired.** The UI defaults to a "Typing" mode: the
  client pauses the draft, writes the reaction in a text box, and it becomes a `SpokenComment`
  with the same anchor-timestamp logic as the spoken path. This is not a fallback bolted on
  after the fact — both paths converge on one `appendComment` function.
- **Spoken capture is real and does run**, using the browser's `SpeechRecognition`. It starts
  on pause and stops on resume, and only commits the engine's settled/final transcript segments
  rather than its live interim guesses (fixed in commit `5588a46` after testing showed interim
  text got committed too early). In real testing on this machine, recognition accuracy was
  still inconsistent — Chrome sometimes returned confidently wrong words rather than dropping
  in a way that's obvious. Typing mode exists as the reliable path specifically because of
  this; treat spoken capture as demonstrable but not dependable.
- **Structuring via Claude Code as a subprocess.** `buildRevisionTickets()` in
  `src/lib/tickets.ts` shells out to `claude -p "<prompt>" --output-format json --model
  claude-sonnet-5`, reads the model's answer out of the envelope's `result` field, and parses
  a JSON array of tickets out of it. This was confirmed working against the real CLI, and one
  real structuring run produced sensible tickets, including one correctly flagged
  `needsClarification: true` for a vague comment ("it's fine but feels a bit flat, I don't
  know, something about it"). No API key is involved anywhere in this path.
- **The `RevisionSession` artifact.** `POST /api/session` writes the full session — comments and
  tickets together — to `out/session.json` via `src/lib/session-store.ts`, matching the schema
  in `src/lib/ticket-schema.ts` exactly.
- **`DEMO_MODE=1` replay.** With the flag set, `GET /api/session` and `POST /api/session` both
  return the recorded `out/session.json` instead of touching the microphone, the DOM `<audio>`
  element's live state, or the `claude` subprocess. The page loads it automatically and labels
  the ticket list as a replay.

Stubbed / not what it looks like:

- **The recorded `out/session.json` is stale relative to the current fixture.** It was
  produced against an earlier placeholder scratch track (`trackId: "draft-track"`), which has
  since been replaced in `public/fixtures/` by the real draft, `salt-and-water.mp3` (the
  current API route stamps new sessions with `trackId: "salt-and-water"`). The quotes and
  timestamps in the committed `out/session.json` do not correspond to what's actually in
  `salt-and-water.mp3` — they were sensible for a different piece of audio. The structuring
  step itself works; the specific recording on disk needs to be redone against the current
  track before it's shown as "this is what the app produced," and DEMO_MODE will replay
  whatever recording exists until that happens.
- **Section inference has no ground truth to check against.** The model is told the draft's
  total runtime and asked to infer the section (verse, chorus, etc.) from timestamp and
  wording alone, because no real section map is available to this app. That's a reasonable
  approach, but it means a `section` label is the model's best guess, not a verified fact.

Not built at all (see section 7):

- The spoken follow-up question (Phase 3 / `speechSynthesis`) for `needsClarification`
  tickets.

## 4. How it works

1. The client opens the draft in the browser and listens to it, same as any audio player.
2. Whenever something strikes them, they pause — with the spacebar or the player's own pause
   button.
3. The moment they pause opens a comment turn. They either say what struck them out loud, or
   (the default, more reliable path) type it into a box that appears. Either way, the app also
   records the exact playback position at the moment they paused.
4. Because people tend to pause just after the line or moment they reacted to — they hear it,
   register it, then reach for pause — the app backs the raw pause position off by 2.5 seconds
   to get the anchor timestamp: roughly where the reaction actually started, not where the
   client's hand caught up to it. Both the raw pause position and the anchor timestamp are kept.
5. Resuming playback (or submitting the typed note) closes the comment turn. This repeats for
   as many comments as the client wants to leave over one listen-through — this one listen is a
   revision round.
6. When the client is done, they trigger "Build revision tickets." All of the round's comments
   are sent together to a structuring step that classifies each one, infers which part of the
   song it's about from its anchor timestamp and wording, writes an imperative note a writer can
   act on (e.g. "Rewrite the second line of verse 2 to lose the forced rhyme"), and flags
   whether it's too vague to act on as-is — that flag is what tells a writer a comment needs a
   clarifying question back to the client before work starts on it.
7. The result — every comment plus every ticket derived from it, tagged with which revision
   round it belongs to — is written out as one structured file and shown on the page in
   timestamp order, with anything needing clarification visibly marked. That file is the
   artifact a writer, not just the browser tab, can work from.

## 5. Setup

Prerequisites:

- Node.js 22 (this build ran on Node 22).
- Google Chrome. The spoken-capture path depends on Chrome's `SpeechRecognition`, which is not
  implemented consistently (or at all) in other browsers. Typed capture works in any modern
  browser.
- The Claude Code CLI (`claude`) installed and on `PATH`, and signed in. The structuring step
  shells out to it; there is no separate API key to configure.
- No paid API keys are required anywhere in this build.

Install:

```bash
npm install
cp .env.example .env.local   # optional — defaults already work
```

## 6. The primary path

Live path — capture real comments and structure them for real:

```bash
npm run dev
```

Open `http://localhost:3000` in Chrome, play the draft (`salt-and-water.mp3`), pause a few
times to leave comments (typing or speaking), then click "Build revision tickets." This calls
the `claude` CLI and writes a fresh `out/session.json`.

Demo / offline path — replays a saved recording instead of capturing or calling anything live:

```bash
npm run demo
```

This runs `next dev` with `DEMO_MODE=1` and loads `out/session.json` straight into the page on
open, so the ticket list shows without a microphone, a network call, or a live subprocess.

**Caveat:** the `out/session.json` currently committed in this repo was recorded against an
earlier placeholder track, not the `salt-and-water.mp3` fixture now in `public/fixtures/` — see
section 3. Re-running the live path once, saving that output over the current file, is what
should happen before this is actually presented as "here's what the app produced."

## 7. What was not built, and why

Cut deliberately, per the build's own scope rules, and verified against the code rather than
assumed:

- **The spoken follow-up question (Phase 3).** The interaction loop already gives Claude a
  natural turn to ask "you said verse two feels corny — is that the lyrics or the delivery?"
  before playback resumes on a `needsClarification` ticket, but neither the `speechSynthesis`
  question nor the answer-merge into the ticket's `action` was built. `needsClarification` is
  computed and surfaced in the UI; nothing currently acts on it automatically.
- **Multiple reviewers, speaker diarization, or contribution aggregation.** One client, one
  listen-through, one round. There is no notion of more than one speaker.
- **A writer-side dashboard or ticket-editing UI.** Tickets render read-only, in timestamp
  order, on the same page the client used to record comments. There is no separate surface for
  a writer to edit, reassign, or resolve a ticket.
- **Auth, accounts, or persistence beyond a JSON file on disk.** `out/session.json` is
  overwritten by each live run; there is no history of past rounds beyond whatever the last
  write left behind.
- **Any real integration with an existing product surface, or a database.** No Supabase, no
  external service beyond the `claude` CLI subprocess and the browser's own speech APIs.
- **Music generation or audio editing.** The draft track is fixed; nothing in this build writes
  or modifies audio.
- **Browser support beyond Chrome**, tests, CI, containerization, error handling beyond the
  happy path, retries, streaming, or latency work. None of these were in scope for a 90-minute
  build of one narrow path.

What two more hours would buy: re-recording `out/session.json` against `salt-and-water.mp3`
so the demo data matches the demo track; the Phase 3 spoken follow-up and answer-merge; and
some minimal handling for a `claude` subprocess failure or timeout (today a failed structuring
call surfaces as a generic error message on the page, not a graceful degradation).

## 8. AI-use disclosure

Claude Code was used to write the code in this repository, and is also used at runtime: the
structuring step (`src/lib/tickets.ts`) shells out to the `claude` CLI
(`claude -p "<prompt>" --output-format json --model claude-sonnet-5`) to turn a round of raw
spoken/typed comments into classified, actionable revision tickets. That subprocess call is
real inference, not a canned response — it is the one load-bearing external dependency this
build has, and it was verified directly from a shell before anything was built on top of it.

## 9. Attribution

- Built with Next.js, React, and Tailwind CSS (see `package.json` for exact versions).
- Speech-to-text uses Chrome's built-in `SpeechRecognition` API. This is free and requires no
  key, but it is not local or offline — Chrome streams the captured audio to Google's servers
  for transcription. Revision Room should not be described as an offline tool.
- Audio fixture: `public/fixtures/salt-and-water.mp3` ("Salt and Water"). Provenance:
  **[PLACEHOLDER — provenance not recorded; repository owner to confirm and replace this
  line before this README is presented or shared.]**
