"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
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

type ApiResponse = {
  success?: boolean;
  message?: string;
  reply?: string;
  error?: string;
  trips?: unknown;
};

const QUICK_ACTIONS = [
  {
    icon: "🚌",
    title: "Find a bus",
    prompt: "Find a bus from Accra to Kumasi tomorrow morning",
  },
  {
    icon: "💰",
    title: "Compare fares",
    prompt: "What's the cheapest trip to Takoradi?",
  },
  {
    icon: "💺",
    title: "Check seats",
    prompt: "What buses are available today?",
  },
  {
    icon: "📍",
    title: "Boarding points",
    prompt: "Where can I board near Kumasi?",
  },
] as const;

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(amount: number) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    minimumFractionDigits: 2,
  }).format(amount);
}

function time(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function duration(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes}m`;
}

function isTripCard(value: unknown): value is TripCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trip = value as Record<string, unknown>;
  return (
    typeof trip.id === "string" &&
    trip.id.length > 0 &&
    typeof trip.origin === "string" &&
    typeof trip.destination === "string" &&
    typeof trip.companyName === "string" &&
    typeof trip.busType === "string" &&
    typeof trip.departureAt === "string" &&
    typeof trip.arrivalAt === "string" &&
    typeof trip.durationMinutes === "number" &&
    typeof trip.fare === "number" &&
    Number.isFinite(trip.fare) &&
    typeof trip.availableSeats === "number" &&
    typeof trip.travelDate === "string" &&
    Array.isArray(trip.boardingPoints) &&
    trip.boardingPoints.every((point) => typeof point === "string")
  );
}

function TripResultCard({ trip }: { trip: TripCard }) {
  const params = new URLSearchParams({ passengers: "1" });
  if (trip.travelDate) params.set("travelDate", trip.travelDate);
  const seats = Math.max(0, Math.floor(trip.availableSeats));
  return (
    <article className="w-[255px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <span className="truncate text-xs font-extrabold text-[#002451]">
          {trip.companyName}
        </span>
        <span className="shrink-0 rounded-full bg-[#39b5f4]/15 px-2 py-1 text-[10px] font-bold text-[#002451]">
          {trip.busType}
        </span>
      </div>
      <div className="p-4">
        <p className="text-[11px] font-semibold text-slate-500">
          {trip.origin} → {trip.destination}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-lg font-black text-[#002451]">
            {time(trip.departureAt)}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[10px] font-semibold text-slate-400">
            {duration(trip.durationMinutes)}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-lg font-black text-[#002451]">
            {time(trip.arrivalAt)}
          </span>
        </div>
        {trip.boardingPoints.length > 0 && (
          <p
            className="mt-3 truncate text-[11px] text-slate-500"
            title={trip.boardingPoints.join(", ")}
          >
            📍 {trip.boardingPoints.join(", ")}
          </p>
        )}
        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] text-slate-400">Fare per passenger</p>
            <p className="text-lg font-black text-[#ff7417]">
              {money(trip.fare)}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">
            {seats} seats
          </span>
        </div>
        <Link
          href={`/trips/${encodeURIComponent(trip.id)}?${params.toString()}`}
          className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[#ff7417] text-xs font-extrabold text-white transition hover:bg-[#e96308] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#002451]"
        >
          Select trip →
        </Link>
      </div>
    </article>
  );
}

export default function ZanoAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [position, setPosition] = useState({ right: 20, bottom: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sendingRef = useRef(false);
  const dragRef = useRef({ x: 0, y: 0, right: 20, bottom: 20, moved: false });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);
  useEffect(() => () => abortRef.current?.abort(), []);

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button, a, input")
    )
      return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ...position,
      moved: false,
    };
    setIsDragging(true);
  }

  useEffect(() => {
    if (!isDragging) return;
    function move(event: globalThis.PointerEvent) {
      const drag = dragRef.current;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      setPosition({
        right: Math.max(10, Math.min(window.innerWidth - 76, drag.right - dx)),
        bottom: Math.max(
          10,
          Math.min(window.innerHeight - 76, drag.bottom - dy),
        ),
      });
    }
    function stop() {
      suppressClickRef.current = dragRef.current.moved;
      setIsDragging(false);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [isDragging]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    setInput("");
    const userMessage: ChatMessage = { id: makeId(), role: "user", content };
    const conversation = [...messagesRef.current, userMessage];
    messagesRef.current = conversation;
    setMessages(conversation);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          messages: conversation
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const data: ApiResponse = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Zano AI request failed (${response.status}).`,
        );
      }
      const reply = [data.message, data.reply].find(
        (value) => typeof value === "string" && value.trim(),
      );
      const trips = Array.isArray(data.trips)
        ? data.trips.filter(isTripCard)
        : [];
      if (!reply && trips.length === 0)
        throw new Error("I couldn't generate a response. Please try again.");
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: reply || "Here are the available trips I found.",
        trips,
      };
      messagesRef.current = [...messagesRef.current, assistantMessage];
      setMessages(messagesRef.current);
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "Something went wrong while connecting to Zano AI.",
      };
      messagesRef.current = [...messagesRef.current, errorMessage];
      setMessages(messagesRef.current);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div
      className="fixed z-[9999]"
      style={{ right: position.right, bottom: position.bottom }}
    >
      <button
        type="button"
        aria-label={isOpen ? "Close Zano AI" : "Open Zano AI"}
        aria-expanded={isOpen}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setIsOpen((value) => !value);
        }}
        className="flex h-16 items-center gap-2 rounded-full border-2 border-white bg-[#002451] px-4 text-white shadow-[0_14px_45px_rgba(0,36,81,0.3)] transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff7417]"
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl"
          aria-hidden="true"
        >
          🤖
        </span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-black">Zano AI</span>
          <span className="block text-[10px] text-sky-200">
            Travel assistant
          </span>
        </span>
        <span
          className="h-2.5 w-2.5 rounded-full bg-[#39d353]"
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <section
          role="dialog"
          aria-label="Zano AI travel assistant"
          className="fixed inset-x-0 bottom-0 top-0 flex flex-col overflow-hidden bg-white shadow-2xl sm:absolute sm:inset-auto sm:bottom-[78px] sm:right-0 sm:h-[min(680px,calc(100dvh-110px))] sm:w-[430px] sm:max-w-[calc(100vw-24px)] sm:rounded-[28px] sm:border sm:border-slate-200"
        >
          <header
            onPointerDown={startDrag}
            className="relative shrink-0 bg-[#002451] px-5 pb-5 pt-5 text-white sm:cursor-grab"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff7417] text-2xl shadow-lg"
                aria-hidden="true"
              >
                🤖
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black">Zano AI</h2>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
                    Travel Concierge
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Your personal travel assistant
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Zano AI"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20"
              >
                ×
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] text-sky-100">
              <span className="h-2 w-2 rounded-full bg-[#39d353]" />
              Find routes, compare fares and plan your next trip.
            </div>
          </header>

          <div
            ref={scrollRef}
            aria-live="polite"
            className="min-h-0 flex-1 overflow-y-auto bg-[#f7f9fc] px-4 py-5"
          >
            {messages.length === 0 && (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.title}
                      type="button"
                      disabled={isSending}
                      onClick={() => void sendMessage(action.prompt)}
                      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff7417] disabled:opacity-50"
                    >
                      <span className="text-2xl" aria-hidden="true">
                        {action.icon}
                      </span>
                      <span className="mt-3 block text-xs font-extrabold text-[#002451]">
                        {action.title} →
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-5 text-center text-[11px] text-slate-400">
                  Ask a question or choose an option to get started.
                </p>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id}>
                  <div
                    className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {message.role === "assistant" && (
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#002451] text-sm"
                        aria-hidden="true"
                      >
                        🤖
                      </span>
                    )}
                    <div
                      className={`max-w-[84%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-br-sm bg-[#ff7417] text-white" : "rounded-bl-sm border border-slate-200 bg-white text-[#10172a]"}`}
                    >
                      {message.content}
                    </div>
                  </div>
                  {message.trips && message.trips.length > 0 && (
                    <div
                      className="mt-3 flex gap-3 overflow-x-auto pb-2 pl-10"
                      aria-label="Available trip results"
                    >
                      {message.trips.map((trip) => (
                        <TripResultCard key={trip.id} trip={trip} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#002451] text-sm"
                    aria-hidden="true"
                  >
                    🤖
                  </span>
                  <div
                    className="flex gap-1 rounded-2xl bg-white px-4 py-3 shadow-sm"
                    aria-label="Zano is typing"
                  >
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 animate-bounce rounded-full bg-[#ff7417]"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={submit}
            className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-[#f7f9fc] p-1.5 focus-within:border-[#ff7417] focus-within:ring-2 focus-within:ring-[#ff7417]/10">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isSending}
                maxLength={4000}
                placeholder="Ask Zano anything about your trip..."
                aria-label="Message Zano AI"
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-[#10172a] outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="flex h-10 items-center justify-center rounded-xl bg-[#ff7417] px-4 text-xs font-black text-white transition hover:bg-[#e96308] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send ↗
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Trip availability and fares are subject to confirmation.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
