"use client";

import { useEffect, useRef, useState } from "react";
import { usePauseToComment } from "@/lib/pause-to-comment";
import TicketList from "@/components/TicketList";
import type { RevisionSession, SpokenComment } from "@/lib/ticket-schema";

function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { comments, isListening, liveTranscript, isSupported } =
    usePauseToComment(audioRef);

  const [session, setSession] = useState<RevisionSession | null>(null);
  const [isStructuring, setIsStructuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReplay, setIsReplay] = useState(false);

  // In demo mode the recorded revision round loads straight away, so the
  // ticket list can be shown without a live capture or a live model call.
  useEffect(() => {
    fetch("/api/session")
      .then((response) => (response.ok ? response.json() : null))
      .then((recorded: RevisionSession | null) => {
        if (!recorded) return;
        setSession(recorded);
        setIsReplay(true);
      })
      .catch(() => {});
  }, []);

  // Spacebar toggles play/pause, the same as clicking the transport, unless the
  // client is typing somewhere else on the page.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      event.preventDefault();
      const audioEl = audioRef.current;
      if (!audioEl) return;
      if (audioEl.paused) {
        audioEl.play();
      } else {
        audioEl.pause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleBuildTickets() {
    setIsStructuring(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments, roundNumber: 1 }),
      });
      if (!response.ok) {
        throw new Error(`Session request failed with status ${response.status}`);
      }
      const nextSession: RevisionSession = await response.json();
      setSession(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build revision tickets.");
    } finally {
      setIsStructuring(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Revision Room</h1>
          <p className="text-sm text-zinc-600">
            Play the draft. Pause when something strikes you and say it out loud —
            the moment you paused becomes the anchor for that comment.
          </p>
        </header>

        <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <audio
            ref={audioRef}
            controls
            src="/fixtures/draft-track.mp3"
            className="w-full"
          />
          <p className="text-xs text-zinc-500">
            Spacebar toggles play/pause. Pausing starts listening for your comment;
            resuming captures it.
          </p>

          {!isSupported && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This browser does not support SpeechRecognition. Revision Room's
              pause-to-comment capture requires Chrome.
            </p>
          )}

          {isListening && (
            <div className="flex items-center gap-2 rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" />
              <span className="font-medium">Listening — say what struck you</span>
              {liveTranscript && (
                <span className="text-rose-500">&ldquo;{liveTranscript}&rdquo;</span>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Captured comments
          </h2>
          {comments.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No comments captured yet. Pause the draft and speak your reaction.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {comments.map((comment: SpokenComment) => (
                <li
                  key={comment.id}
                  className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-3"
                >
                  <span className="text-xs font-medium text-zinc-500">
                    {formatTimestamp(comment.anchorTimestamp)}
                  </span>
                  <span className="text-sm text-zinc-800">{comment.transcript}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleBuildTickets}
            disabled={comments.length === 0 || isStructuring}
            className="w-fit rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isStructuring ? "Structuring…" : "Build revision tickets"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </section>

        {session && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Revision round {session.roundNumber} — tickets
              {isReplay && " (replaying the recorded session)"}
            </h2>
            <TicketList tickets={session.tickets} />
          </section>
        )}
      </main>
    </div>
  );
}
