// Shared by the client, which labels the anchor a comment is about to be filed
// against, and by the structuring step, which labels the finished ticket. It
// lives alone because the client cannot import the module that shells out to
// Claude.

/** "1:07" style label for a number of seconds into the draft. */
export function formatTimestampLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
