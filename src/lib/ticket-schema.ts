// The data contract for a revision round. Everything else in this repo exists to
// produce a RevisionSession: the client's spoken reactions, and the actionable
// tickets a writer can work from without anyone hand-translating an email.

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
