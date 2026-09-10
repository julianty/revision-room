"use client";

import type { RevisionTicket } from "@/lib/ticket-schema";

// Presentational only: renders the tickets a revision round produced. No
// fetching, no session state — the page owns getting tickets here.

const SENTIMENT_STYLES: Record<RevisionTicket["sentiment"], string> = {
  change: "bg-amber-100 text-amber-900 border border-amber-300",
  keep: "bg-emerald-100 text-emerald-900 border border-emerald-300",
  unclear: "bg-slate-200 text-slate-800 border border-slate-300",
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
        className || "bg-slate-100 text-slate-800 border border-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

export default function TicketList({ tickets }: { tickets: RevisionTicket[] }) {
  if (!tickets || tickets.length === 0) {
    return <p className="text-sm text-slate-500">No tickets yet.</p>;
  }

  // Ascending by the moment in the draft each ticket anchors to, so the
  // writer can work through the track top to bottom.
  const orderedTickets = [...tickets].sort((a, b) => a.trackTimestamp - b.trackTimestamp);

  return (
    <ul className="flex flex-col gap-3">
      {orderedTickets.map((ticket) => (
        <li
          key={ticket.id}
          className={`flex gap-4 rounded-md border p-4 ${
            ticket.needsClarification
              ? "border-l-4 border-l-rose-500 border-y-rose-200 border-r-rose-200 bg-rose-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="shrink-0 font-mono text-2xl font-bold leading-none text-slate-900">
            {ticket.timestampLabel}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {ticket.section && (
                <Badge className="bg-indigo-100 text-indigo-900 border border-indigo-300">
                  {ticket.section}
                </Badge>
              )}
              <Badge>{ticket.category}</Badge>
              <Badge className={SENTIMENT_STYLES[ticket.sentiment]}>{ticket.sentiment}</Badge>
              {ticket.needsClarification && (
                <Badge className="bg-rose-600 text-white border border-rose-700">
                  Needs clarification
                </Badge>
              )}
            </div>

            <blockquote className="border-l-2 border-slate-300 pl-3 text-sm italic text-slate-700">
              &ldquo;{ticket.quote}&rdquo;
            </blockquote>

            <p className="text-sm font-medium text-slate-900">{ticket.action}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
