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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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
  const transcriptRef = useRef("");

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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let latest = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        latest += event.results[i][0].transcript;
      }
      transcriptRef.current = latest;
      setLiveTranscript(latest);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Recognition can end on its own (silence timeout) while the client is
      // still paused, thinking. Capture whatever it heard as the comment.
      const capturedAt = pausedAtRef.current;
      const transcript = transcriptRef.current.trim();
      if (capturedAt !== null && transcript.length > 0) {
        appendComment(capturedAt, transcript);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
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
      transcriptRef.current = "";
      setLiveTranscript("");
    }

    const handlePause = () => {
      const currentTime = audioEl.currentTime;
      pausedAtRef.current = currentTime;
      transcriptRef.current = "";
      setPausedAt(currentTime);
      setLiveTranscript("");
      setIsListening(true);
      try {
        recognition.start();
      } catch {
        // Already started (StrictMode double-invoke or a stray pause event) — ignore.
      }
    };

    const handlePlay = () => {
      const capturedAt = pausedAtRef.current;
      const transcript = transcriptRef.current.trim();
      try {
        recognition.stop();
      } catch {
        // Not running — nothing to stop.
      }
      if (capturedAt !== null && transcript.length > 0) {
        appendComment(capturedAt, transcript);
      }
      pausedAtRef.current = null;
      setPausedAt(null);
      setIsListening(false);
      setLiveTranscript("");
    };

    audioEl.addEventListener("pause", handlePause);
    audioEl.addEventListener("play", handlePlay);

    return () => {
      audioEl.removeEventListener("pause", handlePause);
      audioEl.removeEventListener("play", handlePlay);
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
