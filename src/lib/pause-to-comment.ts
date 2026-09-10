"use client";

import { useEffect, useRef, useState } from "react";
import type { SpokenComment } from "@/lib/ticket-schema";

// Minimal local shape for the browser SpeechRecognition API. Not in lib.dom.d.ts,
// and this build adds no dependency to pull in real types for it.
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = { error: string };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

// The client pauses AFTER the line they reacted to — they hear it, register it,
// then reach for the button — so the raw pause position runs a beat late. Backing
// off by a couple of seconds moves the anchor to roughly where the reaction started.
const REACTION_BACK_OFF_SECONDS = 2.5;

export function usePauseToComment(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const [comments, setComments] = useState<SpokenComment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pausedAtRef = useRef<number | null>(null);
  // What the engine has committed to, versus its running guess. Only the
  // settled text becomes the comment; the guess is for the client to watch.
  const settledTranscriptRef = useRef("");
  const guessTranscriptRef = useRef("");
  // True for as long as the client is paused and still has the floor.
  const hasFloorRef = useRef(false);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition ?? window.webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionCtor) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    const recognition = new SpeechRecognitionCtor();
    // A comment is a whole thought with pauses in it, not one clean utterance, so
    // the engine is told to keep listening across those gaps rather than closing
    // the turn at the first breath.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // Matching the client's own English variant measurably improves recognition
    // of their accent; anything non-English falls back to US English.
    const preferred = typeof navigator !== "undefined" ? navigator.language : "en-US";
    recognition.lang = preferred?.startsWith("en") ? preferred : "en-US";

    recognition.onresult = (event) => {
      let guess = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Settled text accumulates: each new event carries only the segment
          // that just closed, so overwriting here would drop the earlier ones.
          settledTranscriptRef.current =
            `${settledTranscriptRef.current} ${result[0].transcript}`.trim();
        } else {
          guess += result[0].transcript;
        }
      }
      guessTranscriptRef.current = guess;
      setLiveTranscript(`${settledTranscriptRef.current} ${guess}`.trim());
    };

    recognition.onend = () => {
      // Chrome drops the audio stream after a stretch of silence. The client is
      // still paused and may only be gathering the thought, so the turn stays
      // open rather than committing half a comment.
      if (hasFloorRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Could not resume the stream — fall through and keep what was heard.
        }
      }

      setIsListening(false);
      // The engine emits its corrected, high-confidence text as it winds down,
      // which is why the comment is only ever committed here and never from the
      // running guess on screen.
      const capturedAt = pausedAtRef.current;
      const transcript = (
        settledTranscriptRef.current || guessTranscriptRef.current
      ).trim();
      if (capturedAt !== null && transcript.length > 0) {
        appendComment(capturedAt, transcript);
      }
      pausedAtRef.current = null;
      settledTranscriptRef.current = "";
      guessTranscriptRef.current = "";
      setLiveTranscript("");
    };

    recognition.onerror = (event) => {
      // A refused microphone or missing device ends the turn for good. "no-speech"
      // and the like just mean the client has not started talking yet, and the
      // restart in onend keeps their turn open.
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed" ||
        event.error === "audio-capture"
      ) {
        hasFloorRef.current = false;
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    function appendComment(capturedPausedAt: number, transcript: string) {
      const anchorTimestamp = Math.max(0, capturedPausedAt - REACTION_BACK_OFF_SECONDS);
      setComments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          pausedAt: capturedPausedAt,
          anchorTimestamp,
          transcript,
        },
      ]);
    }

    const handlePause = () => {
      const currentTime = audioEl.currentTime;
      pausedAtRef.current = currentTime;
      settledTranscriptRef.current = "";
      guessTranscriptRef.current = "";
      hasFloorRef.current = true;
      setPausedAt(currentTime);
      setLiveTranscript("");
      setIsListening(true);
      try {
        recognition.start();
      } catch {
        // Already listening (StrictMode double-invoke or a stray pause event).
      }
    };

    const handlePlay = () => {
      // Resuming hands the floor back to the track. Stopping asks the engine for
      // its final read of what was said; onend commits the comment once it lands.
      hasFloorRef.current = false;
      setPausedAt(null);
      try {
        recognition.stop();
      } catch {
        // Not running — nothing to stop.
      }
    };

    audioEl.addEventListener("pause", handlePause);
    audioEl.addEventListener("play", handlePlay);

    return () => {
      audioEl.removeEventListener("pause", handlePause);
      audioEl.removeEventListener("play", handlePlay);
      hasFloorRef.current = false;
      try {
        recognition.stop();
      } catch {
        // Not running — nothing to stop.
      }
      recognitionRef.current = null;
    };
  }, [audioRef]);

  return { comments, isListening, liveTranscript, pausedAt, isSupported };
}
