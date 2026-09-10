// The drafts a client can review in a sitting. A revision room holds more than
// one song — the client tabs between drafts and each keeps its own comments —
// so the track a comment belongs to is named here rather than hardcoded at the
// player or in the structuring prompt.

export type Draft = {
  trackId: string;
  title: string;
  audioSrc: string;
  // Runtime matters to structuring: section inference is grounded in where a
  // comment lands in the song, and a two-minute draft divides differently
  // from a one-minute one.
  durationSeconds: number;
};

export const DRAFTS: Draft[] = [
  {
    trackId: "salt-and-water",
    title: "Salt and Water",
    audioSrc: "/fixtures/salt-and-water.mp3",
    durationSeconds: 178,
  },
  {
    trackId: "first-light-ignition",
    title: "First Light Ignition",
    audioSrc: "/fixtures/first-light-ignition.mp3",
    durationSeconds: 68,
  },
];

export const DEFAULT_TRACK_ID = DRAFTS[0].trackId;

export function findDraft(trackId: string): Draft | undefined {
  return DRAFTS.find((draft) => draft.trackId === trackId);
}
