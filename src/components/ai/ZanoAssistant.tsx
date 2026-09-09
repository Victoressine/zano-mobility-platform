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
  "I'm in Nkawkaw, what buses pass through here?",
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
    <div className="w-[230px] flex-shrink-0 rounded-xl border border-[#c8cad4] bg-white p-3 shadow-sm">
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

      <p className="mt-1 text-[11px] text-[#747680]">
        {trip.origin} → {trip.destination}
      </p>

      <p className="text-[11px] text-[#747680]">
        {formatDuration(trip.durationMinutes)}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm font-black text-[#ff7417]">
          {formatMoney(trip.fare)}
        </p>

        <p className="text-[10px] text-[#747680]">
          {trip.availableSeats} seats
        </p>
      </div>

      {trip.boardingPoints?.length > 0 && (
        <p className="mt-2 truncate text-[10px] text-[#747680]">
          Boarding: {trip.boardingPoints.join(", ")}
        </p>
      )}

      <Link
        href={`/trips/${trip.id}?${params.toString()}`}
        className="mt-3 flex h-9 items-center justify-center rounded-lg bg-[#ff7417] text-xs font-black text-white hover:bg-[#e96308]"
      >
        View trip
      </Link>
    </div>
  );
}

export default function ZanoAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

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
    messages: [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user",
        content: trimmed,
      },
    ],
  }),
});

const responseText = await response.text();

let data: {
  reply?: string;
  trips?: TripCard[];
  error?: string;
};

try {
  data = responseText
    ? JSON.parse(responseText)
    : {};
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

try {
  data = responseText
    ? JSON.parse(responseText)
    : {};
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
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={isOpen ? "Close Zano AI" : "Open Zano AI"}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#ff7417] text-white shadow-xl transition hover:bg-[#e96308]"
      >
        {isOpen ? (
          <span className="text-2xl">×</span>
        ) : (
          <span className="text-lg font-black">Z</span>
        )}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[70vh] max-h-[600px] w-[92vw] max-w-[390px] flex-col overflow-hidden rounded-2xl border border-[#c8cad4] bg-white shadow-2xl">
          <div className="flex items-center gap-3 bg-[#002451] px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff7417] font-black text-white">
              Z
            </div>

            <div>
              <p className="text-sm font-black text-white">
                Zano AI Assistant
              </p>

              <p className="text-[11px] text-[#39b5f4]">
                Your travel assistant
              </p>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-[#f8f7ff] px-3 py-4"
          >
            {messages.length === 0 && (
              <div>
                <p className="text-sm leading-6 text-[#747680]">
                  Hi! I&apos;m the Zano AI Assistant. I can help you find
                  trips, compare fares, check availability and plan your
                  journey.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="rounded-full border border-[#c8cad4] bg-white px-3 py-2 text-left text-[11px] font-semibold text-[#002451] hover:border-[#ff7417] hover:text-[#ff7417]"
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
                    <div
                      className={
                        message.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[#ff7417] px-4 py-3 text-sm text-white"
                          : "max-w-[85%] rounded-2xl rounded-bl-sm border border-[#c8cad4] bg-white px-4 py-3 text-sm text-[#10172a]"
                      }
                    >
                      {message.content}
                    </div>
                  </div>

                  {message.trips && message.trips.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                      {message.trips.map((trip) => (
                        <TripResultCard key={trip.id} trip={trip} />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isSending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-[#c8cad4] bg-white px-4 py-3 text-sm text-[#747680]">
                    Zano is thinking...
                  </div>
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-[#c8cad4] bg-white p-3"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isSending}
              placeholder="Ask about a trip..."
              className="h-10 flex-1 rounded-full border border-[#c8cad4] bg-[#f8f7ff] px-4 text-sm outline-none focus:border-[#ff7417]"
            />

            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="h-10 rounded-full bg-[#ff7417] px-4 text-sm font-black text-white hover:bg-[#e96308] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
