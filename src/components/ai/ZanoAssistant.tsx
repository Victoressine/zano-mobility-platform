"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

type TripCard = {
  id: string;
  origin: string;
  destination: string;
  companyName: string;
  busType: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  fare: number;
  availableSeats: number;
  travelDate: string;
  boardingPoints: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trips?: TripCard[];
};

const SUGGESTED_PROMPTS = [
  "Find a bus from Accra to Kumasi tomorrow morning",
  "What's the cheapest trip to Takoradi?",
  "What buses are available today?",
  "Where can I board near Kumasi?",
];

function createId() {
  return Math.random().toString(36).slice(2);
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Accra",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}m`;
  }

  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function TripResultCard({ trip }: { trip: TripCard }) {
  const params = new URLSearchParams({
    passengers: "1",
  });

  if (trip.travelDate) {
    params.set("travelDate", trip.travelDate);
  }

  return (
    <div className="w-[245px] flex-shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-black text-[#002451]">
          {trip.companyName}
        </p>

        <span className="rounded-full bg-[#39b5f4]/10 px-2 py-1 text-[10px] font-bold text-[#002451]">
          {trip.busType}
        </span>
      </div>

      <p className="mt-3 text-sm font-black text-[#10172a]">
        {formatTime(trip.departureAt)} → {formatTime(trip.arrivalAt)}
      </p>

      <p className="mt-1 text-[11px] text-slate-500">
        {trip.origin} → {trip.destination}
      </p>

      <p className="text-[11px] text-slate-500">
        {formatDuration(trip.durationMinutes)}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm font-black text-[#ff7417]">
          {formatMoney(trip.fare)}
        </p>

        <p className="text-[10px] text-slate-500">
          {trip.availableSeats} seats
        </p>
      </div>

      {trip.boardingPoints?.length > 0 && (
        <p className="mt-2 truncate text-[10px] text-slate-500">
          Boarding: {trip.boardingPoints.join(", ")}
        </p>
      )}

      <Link
        href={`/trips/${trip.id}?${params.toString()}`}
        className="mt-3 flex h-9 items-center justify-center rounded-xl bg-[#ff7417] text-xs font-black text-white transition hover:bg-[#e96308]"
      >
        Select trip
      </Link>
    </div>
  );
}

export default function ZanoAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Position of the floating Zano button/window
  const [position, setPosition] = useState({
    right: 20,
    bottom: 20,
  });

  const [isDragging, setIsDragging] = useState(false);

  const dragStart = useRef({
    x: 0,
    y: 0,
    right: 20,
    bottom: 20,
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const deltaX = event.clientX - dragStart.current.x;
      const deltaY = event.clientY - dragStart.current.y;

      const newRight = Math.max(
        10,
        Math.min(
          window.innerWidth - 80,
          dragStart.current.right - deltaX
        )
      );

      const newBottom = Math.max(
        10,
        Math.min(
          window.innerHeight - 80,
          dragStart.current.bottom - deltaY
        )
      );

      setPosition({
        right: newRight,
        bottom: newBottom,
      });
    }

    function handlePointerUp() {
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  function startDragging(event: React.PointerEvent) {
    event.preventDefault();

    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      right: position.right,
      bottom: position.bottom,
    };

    setIsDragging(true);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();

    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    const conversation = [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user" as const,
        content: trimmed,
      },
    ];

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: conversation,
        }),
      });

      const responseText = await response.text();

      let data: {
        reply?: string;
        trips?: TripCard[];
        error?: string;
      } = {};

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `Zano AI returned an invalid response (${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Zano AI request failed (${response.status}).`
        );
      }

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content:
          data.reply || "I couldn't generate a response. Please try again.",
        trips: Array.isArray(data.trips) ? data.trips : undefined,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      console.error("Zano AI error:", error);

      const errorMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "Something went wrong while connecting to Zano AI.",
      };

      setMessages((current) => [...current, errorMessage]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <>
      {/* Floating Zano button */}
      <div
        className="fixed z-[9999]"
        style={{
          right: `${position.right}px`,
          bottom: `${position.bottom}px`,
        }}
      >
        <button
          type="button"
          onPointerDown={startDragging}
          onClick={() => {
            if (!isDragging) {
              setIsOpen((current) => !current);
            }
          }}
          aria-label={isOpen ? "Close Zano AI" : "Open Zano AI"}
          className={`group relative flex h-[68px] min-w-[68px] items-center justify-center gap-1 rounded-full border-2 border-white bg-[#002451] px-4 text-white shadow-2xl transition ${
            isDragging
              ? "scale-105 cursor-grabbing"
              : "cursor-grab hover:scale-105"
          }`}
        >
          {/* Robot */}
          <span className="text-2xl leading-none transition group-hover:scale-110">
            🤖
          </span>

          {/* Zano text */}
          <span className="text-sm font-black tracking-tight">
            Zano
          </span>

          {/* Online indicator */}
          <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-[#002451] bg-[#39d353]" />
        </button>

        {/* Assistant panel */}
        {isOpen && (
          <div className="absolute bottom-[82px] right-0 flex h-[70vh] max-h-[650px] w-[92vw] max-w-[410px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_25px_80px_rgba(0,36,81,0.25)]">
            {/* Header */}
            <div
              onPointerDown={startDragging}
              className="flex cursor-grab items-center gap-3 bg-[#002451] px-4 py-4 text-white active:cursor-grabbing"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff7417] text-2xl shadow-lg">
                🤖
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-base font-black">Zano</p>

                  <span className="rounded-full bg-[#39d353]/15 px-2 py-0.5 text-[9px] font-bold text-[#39d353]">
                    AI
                  </span>
                </div>

                <p className="text-[11px] text-slate-300">
                  Your personal travel assistant
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-white/20"
                aria-label="Close Zano"
              >
                ×
              </button>
            </div>

            {/* Chat */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto bg-[#f7f9fc] px-3 py-4"
            >
              {messages.length === 0 && (
                <div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#002451] text-lg">
                        🤖
                      </div>

                      <div>
                        <p className="text-sm font-black text-[#002451]">
                          Hello! I&apos;m Zano 👋
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          I can help you find buses, compare fares,
                          check seats, find boarding points and plan
                          your journey.
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="mb-2 mt-5 px-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Try asking me
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold text-[#002451] shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff7417] hover:text-[#ff7417]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-4">
                {messages.map((message) => (
                  <div key={message.id}>
                    <div
                      className={
                        message.role === "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      {message.role === "assistant" && (
                        <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#002451] text-sm">
                          🤖
                        </div>
                      )}

                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[82%] rounded-2xl rounded-br-sm bg-[#ff7417] px-4 py-3 text-sm leading-6 text-white shadow-sm"
                            : "max-w-[82%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-[#10172a] shadow-sm"
                        }
                      >
                        {message.content}
                      </div>
                    </div>

                    {message.trips && message.trips.length > 0 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-2 pl-10">
                        {message.trips.map((trip) => (
                          <TripResultCard
                            key={trip.id}
                            trip={trip}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {isSending && (
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#002451] text-sm">
                      🤖
                    </div>

                    <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-[#ff7417]" />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-[#ff7417]"
                          style={{ animationDelay: "120ms" }}
                        />
                        <span
                          className="h-2 w-2 animate-bounce rounded-full bg-[#ff7417]"
                          style={{ animationDelay: "240ms" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex gap-2 border-t border-slate-200 bg-white p-3"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isSending}
                placeholder="Ask Zano anything about your trip..."
                className="h-11 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-[#f7f9fc] px-4 text-sm text-[#10172a] outline-none transition placeholder:text-slate-400 focus:border-[#ff7417] focus:ring-2 focus:ring-[#ff7417]/10"
              />

              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="h-11 rounded-2xl bg-[#ff7417] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#e96308] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}