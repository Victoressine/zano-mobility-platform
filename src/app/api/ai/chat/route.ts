// ========================================
// Zano AI Assistant - Chat Endpoint
//
// OpenRouter + tool-use loop that can query
// live trip data from Firestore.
// ========================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { adminAuth, adminDb } from "@/lib/firebase/admin";

import {
  getTripById,
  searchTripsByLocation,
  searchTripsByRoute,
  sortTrips,
  type ResolvedTrip,
  type TripSortBy,
} from "@/lib/ai/tripSearch";

// ========================================
// Config
// ========================================

// OpenRouter automatically chooses an available
// free model that supports the requested features.
const MODEL = "openrouter/free";

const MAX_TOKENS = 1024;
const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY_MESSAGES = 20;

// ========================================
// Types
// ========================================

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages?: IncomingMessage[];
};

// ========================================
// OpenRouter Client
// ========================================

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Zano Mobility",
  },
});

// ========================================
// Tool Definitions
// ========================================

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_trips",
      description:
        "Search for scheduled trips on a specific origin -> destination route, " +
        "optionally for a given travel date. Use this whenever the passenger " +
        "names both a departure city and a destination city. Returns real, " +
        "bookable trips with operator, times, fare (GHS) and seats left.",
      parameters: {
        type: "object",
        properties: {
          origin: {
            type: "string",
            description: "Departure city, e.g. 'Accra'.",
          },
          destination: {
            type: "string",
            description: "Destination city, e.g. 'Kumasi'.",
          },
          date: {
            type: "string",
            description:
              "Travel date in YYYY-MM-DD format. Omit to search the next available departure(s).",
          },
          passengers: {
            type: "number",
            description: "Number of seats needed. Defaults to 1.",
          },
          sort_by: {
            type: "string",
            enum: ["cheapest", "earliest", "fastest", "most_seats"],
            description:
              "How to order the returned trips. Defaults to earliest.",
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
        "Find trips that pass through a specific town, city or boarding " +
        "point, even if it isn't the trip's origin or final destination. " +
        "Use this when the passenger describes where they currently are " +
        "rather than a clean origin/destination pair, e.g. 'I'm in Nkawkaw " +
        "and want to go to Kumasi' or 'which buses pass through Kumasi'.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "Town, city or boarding point name to search for.",
          },
          date: {
            type: "string",
            description:
              "Travel date in YYYY-MM-DD format, if known.",
          },
          passengers: {
            type: "number",
            description:
              "Number of seats needed. Defaults to 1.",
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
        "Look up full details for one specific trip by its trip ID, " +
        "including its boarding points. Use this after search_trips or " +
        "find_trips_through_location to answer a follow-up question about " +
        "one particular trip.",
      parameters: {
        type: "object",
        properties: {
          trip_id: {
            type: "string",
            description:
              "The Firestore trip document ID.",
          },
          date: {
            type: "string",
            description:
              "Travel date in YYYY-MM-DD format, if known.",
          },
        },
        required: ["trip_id"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "get_my_bookings",
      description:
        "Look up the signed-in passenger's own recent bookings " +
        "(trip, seats, status, amount). Only works if the passenger is " +
        "signed in. Use this to answer questions about 'my booking', " +
        "'my ticket', 'did my payment go through', etc. Never use this " +
        "to look up another passenger's booking.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// ========================================
// System Prompt
// ========================================

function buildSystemPrompt(signedIn: boolean): string {
  const now = new Date();

  const accraNow = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
  }).format(now);

  return `You are the Zano AI Assistant, a friendly and efficient travel assistant built into the Zano bus booking platform for Ghana intercity travel.

Current date/time in Ghana (Africa/Accra, UTC+0): ${accraNow}.
Today's date is ${todayIso}.

Use this date to resolve relative dates like "today", "tomorrow morning" or "this afternoon" into a YYYY-MM-DD date before calling a tool.

"Morning" is roughly 05:00-11:59.
"Afternoon" is roughly 12:00-16:59.
"Evening/night" is roughly 17:00-late.

The passenger is currently ${
    signedIn ? "signed in" : "NOT signed in"
  }.

What you can help with:

- Finding trips by route ("Accra to Kumasi tomorrow") using search_trips.
- Finding trips that pass through a passenger's current location using find_trips_through_location.
- Comparing trips by price, departure/arrival time, duration, bus type and seats left.
- Recommending the best trip for a stated priority.
- Answering questions about a specific trip's boarding points using get_trip_details.
- Answering questions about the passenger's own bookings using get_my_bookings if signed in.
- General Zano support questions.

Hard rules:

- NEVER invent a trip, fare, time, operator or seat count.
- Only state trip facts returned by a tool call.
- If a tool returns no trips, say so plainly.
- When the passenger gives a location such as Nkawkaw, use find_trips_through_location.
- When searching through a location, do not require the location to be the trip's origin or final destination.
- When search_trips or find_trips_through_location returns trips, the matching trips are automatically shown as result cards below your reply.
- Do NOT re-list every trip's full details in your text.
- Give a short 1-3 sentence summary and recommendation.
- If the passenger gives a priority such as cheapest, earliest or fastest, use the matching sort option.
- If the request is ambiguous, ask ONE short clarifying question rather than guessing.
- If get_my_bookings is called while the passenger is not signed in, tell them they need to sign in.
- Booking, seat selection, payment and tickets happen on the Zano website.
- Do not create bookings directly through the AI.
- Currency is Ghanaian Cedi (GH₵ / GHS).
- Keep replies conversational, warm and concise.
- Avoid walls of text.`;
}

// ========================================
// Tool Execution
// ========================================

type ToolRunResult = {
  toolResultContent: string;
  trips?: ResolvedTrip[];
};

async function runTool(
  toolName: string,
  input: Record<string, unknown>,
  uid: string | null
): Promise<ToolRunResult> {
  try {
    // ----------------------------------------
    // Search route
    // ----------------------------------------

    if (toolName === "search_trips") {
      const origin = String(input.origin ?? "").trim();
      const destination = String(input.destination ?? "").trim();

      if (!origin || !destination) {
        return {
          toolResultContent:
            "Missing origin or destination. Ask the passenger for both.",
        };
      }

      const trips = await searchTripsByRoute({
        origin,
        destination,
        date:
          typeof input.date === "string"
            ? input.date
            : undefined,
        passengers:
          typeof input.passengers === "number"
            ? input.passengers
            : undefined,
      });

      const sorted = sortTrips(
        trips,
        input.sort_by as TripSortBy | undefined
      );

      return {
        toolResultContent: JSON.stringify({
          count: sorted.length,
          trips: sorted,
        }),
        trips: sorted,
      };
    }

    // ----------------------------------------
    // Find trips through location
    // ----------------------------------------

    if (toolName === "find_trips_through_location") {
      const location = String(input.location ?? "").trim();

      if (!location) {
        return {
          toolResultContent:
            "Missing location. Ask the passenger where they currently are.",
        };
      }

      const trips = await searchTripsByLocation({
        location,
        date:
          typeof input.date === "string"
            ? input.date
            : undefined,
        passengers:
          typeof input.passengers === "number"
            ? input.passengers
            : undefined,
      });

      const sorted = sortTrips(trips, "earliest");

      return {
        toolResultContent: JSON.stringify({
          count: sorted.length,
          trips: sorted,
        }),
        trips: sorted,
      };
    }

    // ----------------------------------------
    // Get trip details
    // ----------------------------------------

    if (toolName === "get_trip_details") {
      const tripId = String(input.trip_id ?? "").trim();

      if (!tripId) {
        return {
          toolResultContent: "Missing trip_id.",
        };
      }

      const trip = await getTripById(
        tripId,
        typeof input.date === "string"
          ? input.date
          : undefined
      );

      if (!trip) {
        return {
          toolResultContent:
            "No trip found with that ID, or it is no longer available.",
        };
      }

      return {
        toolResultContent: JSON.stringify(trip),
        trips: [trip],
      };
    }

    // ----------------------------------------
    // Get passenger bookings
    // ----------------------------------------

    if (toolName === "get_my_bookings") {
      if (!uid) {
        return {
          toolResultContent:
            "The passenger is not signed in, so their bookings cannot be looked up. Ask them to sign in.",
        };
      }

      const snapshot = await adminDb
        .collection("bookings")
        .where("userId", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get();

      const bookings = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();

        return {
          bookingId: docSnapshot.id,
          origin: data.origin ?? "",
          destination: data.destination ?? "",
          companyName: data.companyName ?? "",
          busType: data.busType ?? "",
          departureAt:
            data.departureAt?.toDate?.().toISOString?.() ??
            null,
          seatNumbers: data.seatNumbers ?? [],
          totalAmount: data.totalAmount ?? null,
          status: data.status ?? "",
          paymentStatus: data.paymentStatus ?? "",
        };
      });

      return {
        toolResultContent: JSON.stringify({
          count: bookings.length,
          bookings,
        }),
      };
    }

    return {
      toolResultContent: `Unknown tool: ${toolName}`,
    };
  } catch (error) {
    console.error(
      `AI assistant tool "${toolName}" failed:`,
      error
    );

    return {
      toolResultContent:
        "This tool failed unexpectedly. Let the passenger know you are having trouble looking that up right now.",
    };
  }
}

// ========================================
// Auth Helper
// ========================================

async function resolveUid(
  request: NextRequest
): Promise<string | null> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.slice("Bearer ".length).trim();

  if (!idToken) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

// ========================================
// POST Handler
// ========================================

export async function POST(request: NextRequest) {
  // ----------------------------------------
  // Check OpenRouter configuration
  // ----------------------------------------

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      {
        error:
          "The AI assistant is not configured yet (missing OPENROUTER_API_KEY).",
      },
      { status: 503 }
    );
  }

  // ----------------------------------------
  // Parse request
  // ----------------------------------------

  let body: ChatRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      { status: 400 }
    );
  }

  const incoming = Array.isArray(body.messages)
    ? body.messages
    : [];

  if (incoming.length === 0) {
    return NextResponse.json(
      {
        error: "No messages provided.",
      },
      { status: 400 }
    );
  }

  // ----------------------------------------
  // Validate last message
  // ----------------------------------------

  const lastMessage = incoming[incoming.length - 1];

  if (
    lastMessage.role !== "user" ||
    typeof lastMessage.content !== "string" ||
    !lastMessage.content.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "The last message must be a non-empty user message.",
      },
      { status: 400 }
    );
  }

  // ----------------------------------------
  // Resolve Firebase user
  // ----------------------------------------

  const uid = await resolveUid(request);

  // ----------------------------------------
  // Prepare OpenRouter messages
  // ----------------------------------------

  const trimmedHistory = incoming.slice(
    -MAX_HISTORY_MESSAGES
  );

  const system = buildSystemPrompt(Boolean(uid));

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: system,
    },
    ...trimmedHistory.map(
      (message): ChatCompletionMessageParam => ({
        role: message.role,
        content: message.content,
      })
    ),
  ];

  let latestTrips: ResolvedTrip[] | undefined;

  const toolsUsed: string[] = [];

  // ========================================
  // Tool Calling Loop
  // ========================================

  try {
    for (
      let round = 0;
      round < MAX_TOOL_ROUNDS;
      round++
    ) {
      const response =
        await openrouter.chat.completions.create({
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: MAX_TOKENS,
        });

      const choice = response.choices[0];

      if (!choice) {
        throw new Error(
          "OpenRouter returned no response choices."
        );
      }

      const assistantMessage = choice.message;

      // ----------------------------------------
      // No tool call = final answer
      // ----------------------------------------

      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        const finalText =
          assistantMessage.content?.trim() ?? "";

        return NextResponse.json({
          reply:
            finalText ||
            "I'm not sure how to help with that yet — could you rephrase it?",
          trips: latestTrips,
          toolsUsed,
        });
      }

      // ----------------------------------------
      // Add assistant tool-call message
      // ----------------------------------------

      messages.push(assistantMessage);

      // ----------------------------------------
      // Execute every requested tool
      // ----------------------------------------

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") {
          continue;
        }

        const toolName = toolCall.function.name;

        toolsUsed.push(toolName);

        let toolInput: Record<string, unknown> = {};

        try {
          toolInput = JSON.parse(
            toolCall.function.arguments || "{}"
          );
        } catch {
          toolInput = {};
        }

        const result = await runTool(
          toolName,
          toolInput,
          uid
        );

        if (result.trips) {
          latestTrips = result.trips;
        }

        // ----------------------------------------
        // Send tool result back to OpenRouter
        // ----------------------------------------

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.toolResultContent,
        });
      }
    }

    // ----------------------------------------
    // Tool loop exceeded
    // ----------------------------------------

    return NextResponse.json({
      reply:
        "I looked into a few options but couldn't settle on an answer in time. Could you narrow down what you're looking for?",
      trips: latestTrips,
      toolsUsed,
    });
  } catch (error) {
    console.error(
      "OpenRouter AI assistant error:",
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error
    );

    return NextResponse.json(
      {
        error:
          "The AI assistant is temporarily unavailable. Please try again shortly.",
      },
      { status: 502 }
    );
  }
}