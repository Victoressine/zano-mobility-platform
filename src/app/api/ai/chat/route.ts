import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  searchTripsByRoute,
  searchTripsByLocation,
  getTripById,
  sortTrips,
} from "@/lib/ai/tripSearch";

const MODEL = "openrouter/free";
const MAX_TOKENS = 1200;
const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY_MESSAGES = 24;

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer":
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": "Zano Mobility",
  },
});

/* =========================================================
   TYPES
========================================================= */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolResult = {
  success: boolean;
  [key: string]: unknown;
};

/* =========================================================
   ZANO AI SYSTEM PROMPT
========================================================= */

function buildSystemPrompt() {
  const now = new Date();

  const ghanaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const ghanaTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Accra",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  return `
You are Zano AI, the intelligent travel assistant inside Zano Mobility.

Zano helps passengers plan and book intercity bus journeys in Ghana.

Your job is not simply to answer questions.

Your job is to understand the passenger's travel intention, gather only the information that is actually needed, search real Zano trip data, compare options, explain them clearly, and guide the passenger toward completing their journey.

CURRENT GHANA DATE:
${ghanaDate}

CURRENT GHANA TIME:
${ghanaTime}

=========================================================
CORE ZANO VISION
=========================================================

Zano AI should feel like a personal travel agent.

The ideal journey is:

1. Understand what the passenger wants.
2. Ask focused follow-up questions when necessary.
3. Search available trips.
4. Compare available options.
5. Consider the passenger's priorities.
6. Recommend suitable options without inventing facts.
7. Help the passenger choose a trip.
8. Help them continue to seat selection.
9. Help them continue to checkout/payment.
10. Help them access their booking and ticket.
11. Eventually help them track their active journey.

The passenger should not have to repeatedly explain the same information.

=========================================================
SMART CONVERSATION
=========================================================

Remember information already provided in the conversation.

For example, if the user says:

"I want to travel from Accra to Kumasi tomorrow morning."

You already know:

origin = Accra
destination = Kumasi
date = tomorrow
time preference = morning

Do NOT ask those questions again.

Instead, search when enough information is available.

Ask only ONE focused question at a time when something important is missing.

Examples:

User:
"I want to travel tomorrow."

Ask:
"Sure. Where are you travelling from and where are you going?"

User:
"Accra to Kumasi."

If date is known:
Search trips.

If passengers are unknown:
"How many passengers will be travelling?"

If the user says:
"Just me."

Remember passengers = 1.

Do not ask:
"How many passengers?"
again later.

=========================================================
UNDERSTAND NATURAL LANGUAGE
=========================================================

Understand phrases such as:

"tomorrow"
"today"
"this evening"
"tomorrow morning"
"early morning"
"late afternoon"
"tonight"
"cheapest"
"fastest"
"earliest"
"most seats"
"comfortable"
"I don't want to spend too much"
"I need to arrive early"
"I am travelling alone"
"I am travelling with my family"
"I prefer VIP"
"I want something near me"
"show me buses through Nkawkaw"

Convert natural language into appropriate search parameters.

=========================================================
PASSENGER PREFERENCES
=========================================================

Pay attention to preferences expressed during the conversation.

Examples:

budget
departure time
arrival time
number of passengers
bus type
operator
comfort
earliest departure
fastest journey
cheapest fare
number of available seats
boarding location

Use those preferences when comparing trips.

Do not invent preferences the passenger has not expressed.

=========================================================
TRIP SEARCH
=========================================================

When enough information exists to search, USE THE SEARCH TOOLS.

Do not answer with imaginary trips.

Only present trips returned by the tools.

Never invent:

- bus companies
- fares
- departure times
- arrival times
- seats
- trip IDs
- boarding points
- booking references

=========================================================
COMPARING TRIPS
=========================================================

When multiple trips are available, make comparison easy.

For example:

"Here are the available options:

1. VIP Jeoun Transport
   8:00 AM → 12:30 PM
   GHS 128
   30 seats available

2. STC
   9:00 AM → 1:30 PM
   GHS 140
   18 seats available

The first option is cheaper and leaves earlier."

Keep comparisons factual.

If the passenger has stated a preference, explain how the available options relate to it.

=========================================================
RECOMMENDATIONS
=========================================================

You may recommend an option based on the passenger's stated priorities.

Examples:

If they say:
"I want the cheapest."

Prioritize lower fare.

If they say:
"I need to arrive early."

Prioritize earlier arrival.

If they say:
"I want to leave as early as possible."

Prioritize earlier departure.

If they say:
"I want the fastest."

Prioritize shorter journey duration.

Always explain the factual reason for the recommendation.

=========================================================
BOOKING JOURNEY
=========================================================

When a passenger chooses a trip, treat that trip as the current selected trip in the conversation.

Remember:

trip ID
origin
destination
operator
travel date
departure time
arrival time
fare
passenger count

The AI should then guide the passenger toward seat selection.

Example:

"Great choice. I've selected the 8:00 AM trip for you. The next step is choosing your seat."

Do NOT claim that a seat has been booked unless the actual booking system confirms it.

=========================================================
SEATS
=========================================================

The AI must never invent available seats.

If the seat-selection system is not yet connected, explain that the passenger can continue to the trip page to select an available seat.

Do not say:

"Seat 4A is available"

unless the real seat data confirms it.

=========================================================
PAYMENT
=========================================================

The AI must never claim that payment was completed unless the backend confirms it.

The AI can guide the passenger to checkout.

For example:

"Your trip is ready. Continue to checkout to select your seat and complete payment."

The existing Zano checkout/payment system is the source of truth.

=========================================================
BOOKINGS AND TICKETS
=========================================================

Never invent:

booking IDs
ticket numbers
payment references
payment status

Only report these values when returned by the real backend.

=========================================================
WEATHER
=========================================================

Weather information must come from a real weather tool/API.

Never invent weather conditions.

If weather data is unavailable, say that it is unavailable.

Weather should be used as supporting travel information, not as a reason to fabricate a route or delay.

=========================================================
TRAFFIC
=========================================================

Traffic information must come from a real traffic/routing service.

Never claim:

"Traffic is heavy"

unless real traffic data confirms it.

Never claim that a driver has changed route unless the operator/driver system confirms that change.

A routing service's suggested alternative route is NOT the same thing as a confirmed driver route change.

=========================================================
TRIP TRACKING
=========================================================

When trip tracking is connected, use actual tracking data.

You may help answer:

"Where is my bus?"

"Has my bus departed?"

"How far are we?"

"Are we delayed?"

But never invent GPS location, speed, ETA, or route changes.

=========================================================
CONVERSATIONAL STYLE
=========================================================

Be:

friendly
clear
confident
helpful
concise

Avoid long robotic explanations.

Use short paragraphs and bullet points when useful.

Use Ghanaian currency as GHS.

When showing trips, make them easy to scan.

Example:

🚌 VIP Jeoun Transport
📍 Accra → Kumasi
🕐 8:00 AM → 12:30 PM
💰 GHS 128
💺 30 seats available

=========================================================
IMPORTANT SAFETY / ACCURACY RULE
=========================================================

Never make up data.

If the system does not provide the information, say so.

If you need information from the passenger, ask for it.

If a tool returns no results, explain that no matching trip was found and offer a useful next step.

=========================================================
AGENT BEHAVIOR
=========================================================

Think of yourself as moving the passenger through a journey:

DISCOVER
→ UNDERSTAND
→ SEARCH
→ COMPARE
→ SELECT
→ SEAT
→ CHECKOUT
→ PAYMENT
→ TICKET
→ TRACK

Do not force the passenger through every stage.

Move to the next stage naturally when enough information is available.
`;
}

/* =========================================================
   TOOLS
========================================================= */

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_trips",
      description:
        "Search real available Zano trips between an origin and destination.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "Starting location",
          },
          destination: {
            type: "string",
            description: "Destination",
          },
          travel_date: {
            type: "string",
            description:
              "Travel date in YYYY-MM-DD format when known",
          },
          passengers: {
            type: "number",
            description: "Number of passengers",
          },
          sort_by: {
            type: "string",
            enum: [
              "cheapest",
              "earliest",
              "fastest",
              "most_seats",
            ],
          },
        },
        required: ["origin", "destination"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "find_trips_through_location",
      description:
        "Find real Zano trips whose route or boarding points match a location.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
          },
          travel_date: {
            type: "string",
          },
          passengers: {
            type: "number",
          },
        },
        required: ["location"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_trip_details",
      description:
        "Get detailed information about one real Zano trip.",
      parameters: {
        type: "object",
        properties: {
          trip_id: {
            type: "string",
          },
          travel_date: {
            type: "string",
          },
        },
        required: ["trip_id"],
      },
    },
  },
];

/* =========================================================
   TOOL EXECUTION
========================================================= */

async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_trips": {
        const origin = String(args.origin || "").trim();
        const destination = String(args.destination || "").trim();

        if (!origin || !destination) {
          return {
            success: false,
            error: "Origin and destination are required.",
          };
        }

        const passengers = Math.max(
          1,
          Number(args.passengers || 1),
        );

        const trips = await searchTripsByRoute({
          origin,
          destination,
          travelDate:
            typeof args.travel_date === "string"
              ? args.travel_date
              : undefined,
          passengers,
        });

        const sorted = sortTrips(
          trips,
          typeof args.sort_by === "string"
            ? args.sort_by
            : "earliest",
        );

        return {
          success: true,
          count: sorted.length,
          trips: sorted.slice(0, 10),
        };
      }

      case "find_trips_through_location": {
        const location = String(args.location || "").trim();

        if (!location) {
          return {
            success: false,
            error: "Location is required.",
          };
        }

        const passengers = Math.max(
          1,
          Number(args.passengers || 1),
        );

        const trips = await searchTripsByLocation({
          location,
          travelDate:
            typeof args.travel_date === "string"
              ? args.travel_date
              : undefined,
          passengers,
        });

        return {
          success: true,
          count: trips.length,
          trips: trips.slice(0, 10),
        };
      }

      case "get_trip_details": {
        const tripId = String(args.trip_id || "").trim();

        if (!tripId) {
          return {
            success: false,
            error: "Trip ID is required.",
          };
        }

        const trip = await getTripById(
          tripId,
          typeof args.travel_date === "string"
            ? args.travel_date
            : undefined,
        );

        if (!trip) {
          return {
            success: false,
            error: "Trip not found.",
          };
        }

        return {
          success: true,
          trip,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${name}`,
        };
    }
  } catch (error) {
    console.error(`Zano AI tool error: ${name}`, error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "The requested information could not be retrieved.",
    };
  }
}

/* =========================================================
   POST /api/ai/chat
========================================================= */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const incomingMessages = Array.isArray(body?.messages)
      ? body.messages
      : [];

    const messages: ChatMessage[] = incomingMessages
      .filter(
        (message: unknown): message is ChatMessage =>
          typeof message === "object" &&
          message !== null &&
          ((message as ChatMessage).role === "user" ||
            (message as ChatMessage).role === "assistant") &&
          typeof (message as ChatMessage).content === "string",
      )
      .slice(-MAX_HISTORY_MESSAGES);

    if (messages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Please enter a message.",
        },
        { status: 400 },
      );
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Zano AI is not configured yet.",
        },
        { status: 500 },
      );
    }

    const modelMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const completion =
        await openrouter.chat.completions.create({
          model: MODEL,
          messages: modelMessages,
          tools,
          tool_choice: "auto",
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
        });

      const assistantMessage = completion.choices[0]?.message;

      if (!assistantMessage) {
        throw new Error("Zano AI returned an empty response.");
      }

      modelMessages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return NextResponse.json({
          success: true,
          message:
            assistantMessage.content ||
            "I’m ready to help you plan your trip.",
        });
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          continue;
        }

        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(
            toolCall.function.arguments || "{}",
          );
        } catch {
          args = {};
        }

        const result = await executeTool(
          toolCall.function.name,
          args,
        );

        modelMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "I found the information I needed. How would you like to continue?",
    });
  } catch (error) {
    console.error("Zano AI error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          "Zano AI is temporarily unavailable. Please try again.",
      },
      { status: 500 },
    );
  }
}