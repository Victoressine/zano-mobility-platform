import {
  searchTripsByRoute,
  searchTripsByLocation,
  searchAllTrips,
  sortTrips,
  type ResolvedTrip,
  type TripSortBy,
} from "@/lib/ai/tripSearch";
import { getWeather, type WeatherResult } from "@/lib/ai/weather";

export type ZanoAIMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ZanoAIResponse = {
  success: boolean;
  message: string;
  trips?: ResolvedTrip[];
  weather?: WeatherResult;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDateFromMessage(message: string): string | undefined {
  const lower = normalizeText(message);
  const now = new Date();

  if (lower.includes("tomorrow")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return [
      tomorrow.getUTCFullYear(),
      String(tomorrow.getUTCMonth() + 1).padStart(2, "0"),
      String(tomorrow.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  if (lower.includes("today")) {
    return [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  return undefined;
}

function detectSort(message: string): TripSortBy {
  const lower = normalizeText(message);

  if (
    lower.includes("cheapest") ||
    lower.includes("lowest price") ||
    lower.includes("cheaper")
  ) {
    return "cheapest";
  }

  if (
    lower.includes("fastest") ||
    lower.includes("quickest") ||
    lower.includes("shortest")
  ) {
    return "fastest";
  }

  if (
    lower.includes("most seats") ||
    lower.includes("more seats") ||
    lower.includes("available seats")
  ) {
    return "most_seats";
  }

  return "earliest";
}

function extractRoute(message: string): {
  origin: string;
  destination: string;
} | null {
  const patterns = [
    /from\s+(.+?)\s+to\s+(.+?)(?=\s+(?:tomorrow|today|tonight|this\s+morning|this\s+afternoon|this\s+evening|in\s+the\s+morning|in\s+the\s+afternoon|in\s+the\s+evening|with\s+(?:a\s+)?budget|under\b|below\b|maximum\b|up\s+to\b|cheapest\b|fastest\b)|[?!.,]|$)/i,

    /between\s+(.+?)\s+and\s+(.+?)(?=\s+(?:tomorrow|today|tonight|with\s+(?:a\s+)?budget|under\b|below\b|maximum\b|up\s+to\b)|[?!.,]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match) {
      const origin = match[1].trim();
      const destination = match[2].trim();

      if (origin && destination) {
        return {
          origin,
          destination,
        };
      }
    }
  }

  return null;
}

function extractLocationAfterKeyword(
  message: string,
  keywords: string[]
): string | null {
  const escapedKeywords = keywords.join("|");

  const pattern = new RegExp(
    `(?:${escapedKeywords})\\s+(?:in|at|for)\\s+([a-zA-Z\\s-]+?)(?:\\?|$)`,
    "i"
  );

  const match = message.match(pattern);

  if (!match) {
    return null;
  }

  return match[1].trim();
}

function isWeatherRequest(message: string): boolean {
  const lower = normalizeText(message);

  return (
    lower.includes("weather") ||
    lower.includes("forecast") ||
    lower.includes("temperature") ||
    lower.includes("rain") ||
    lower.includes("raining")
  );
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTrip(trip: ResolvedTrip, index: number): string {
  const durationHours = Math.floor(trip.durationMinutes / 60);
  const durationMinutes = trip.durationMinutes % 60;

  const duration =
    durationHours > 0
      ? `${durationHours}h ${durationMinutes}m`
      : `${durationMinutes}m`;

  const boarding =
    trip.boardingPoints.length > 0
      ? `\n   Boarding: ${trip.boardingPoints.join(", ")}`
      : "";

  return (
    `${index + 1}. ${trip.companyName}\n` +
    `   ${trip.origin} → ${trip.destination}\n` +
    `   Departure: ${formatTime(trip.departureAt)}\n` +
    `   Arrival: ${formatTime(trip.arrivalAt)}\n` +
    `   Duration: ${duration}\n` +
    `   Fare: GHS ${trip.fare}\n` +
    `   Seats available: ${trip.availableSeats}\n` +
    `   Bus: ${trip.busType}` +
    boarding
  );
}

function formatTrips(
  trips: ResolvedTrip[],
  origin: string,
  destination: string,
  date?: string
): string {
  if (trips.length === 0) {
    return (
      `I couldn't find an available trip from ${origin} to ${destination}` +
      `${date ? ` for ${date}` : ""}.`
    );
  }

  const shownTrips = trips.slice(0, 5);

  return (
    `I found ${trips.length} available trip${
      trips.length === 1 ? "" : "s"
    } from ${origin} to ${destination}` +
    `${date ? ` for ${date}` : ""}:\n\n` +
    shownTrips.map((trip, index) => formatTrip(trip, index)).join("\n\n")
  );
}

function formatWeather(weather: WeatherResult): string {
  if (!weather.success) {
    return (
      weather.error ||
      "I couldn't retrieve the weather information right now."
    );
  }

  return (
    `Weather in ${weather.location} for ${weather.date}:\n\n` +
    `Condition: ${weather.condition}\n` +
    `Maximum temperature: ${weather.temperatureMax}°C\n` +
    `Minimum temperature: ${weather.temperatureMin}°C\n` +
    `Feels like up to: ${weather.apparentTemperatureMax}°C\n` +
    `Chance of precipitation: ${weather.precipitationProbability}%\n` +
    `Expected precipitation: ${weather.precipitation} mm\n` +
    `Maximum wind speed: ${weather.windSpeed} km/h`
  );
}

function getWeatherLocationsFromRoute(message: string): {
  origin: string;
  destination: string;
} | null {
  const route = extractRoute(message);

  if (!route) {
    return null;
  }

  return route;
}

async function handleWeatherRequest(
  message: string
): Promise<ZanoAIResponse | null> {
  const route = getWeatherLocationsFromRoute(message);
  const date = getDateFromMessage(message);

  /*
   * Example:
   * "What is the weather condition from Accra to Kumasi?"
   *
   * We check both cities.
   */
  if (route) {
    const [originWeather, destinationWeather] = await Promise.all([
      getWeather(route.origin, date),
      getWeather(route.destination, date),
    ]);

    const originText = formatWeather(originWeather);
    const destinationText = formatWeather(destinationWeather);

    return {
      success: true,
      message:
        `Here is the weather information for your ${route.origin} → ${route.destination} trip:\n\n` +
        `📍 ${route.origin}\n${originText}\n\n` +
        `📍 ${route.destination}\n${destinationText}`,
      weather: destinationWeather,
    };
  }

  const location = extractLocationAfterKeyword(message, [
    "weather",
    "forecast",
    "temperature",
  ]);

  if (!location) {
    return null;
  }

  const weather = await getWeather(location, date);

  return {
    success: true,
    message: formatWeather(weather),
    weather,
  };
}

async function handleTripRequest(
  message: string
): Promise<ZanoAIResponse | null> {
  const route = extractRoute(message);

  if (!route) {
    return null;
  }

  /*
   * If the user is specifically asking about weather,
   * let the weather handler deal with the route.
   */
  if (isWeatherRequest(message)) {
    return null;
  }

  const date = getDateFromMessage(message);
  const sortBy = detectSort(message);

  const trips = await searchTripsByRoute({
    origin: route.origin,
    destination: route.destination,
    date,
    passengers: 1,
  });

  let sortedTrips = sortTrips(trips, sortBy);

  // If the user specifies a budget, keep trips at or below it.
  const budgetMatch = message.match(
    /(?:budget(?:\s+of)?|under|below|maximum(?:\s+of)?|up\s+to)\s*(?:gh₵|ghs|ghc|₵)?\s*([\d,]+(?:\.\d+)?)/i
  );

  if (budgetMatch) {
    const budget = Number(budgetMatch[1].replace(/,/g, ""));
    if (Number.isFinite(budget)) {
      sortedTrips = sortedTrips.filter((trip) => trip.fare <= budget);
    }
  }

  /*
   * Morning / afternoon / evening filtering.
   */
  const lower = normalizeText(message);

  let filteredTrips = sortedTrips;

  if (
    lower.includes("morning") ||
    lower.includes("in the morning")
  ) {
    filteredTrips = sortedTrips.filter((trip) => {
      const hour = new Date(trip.departureAt).getUTCHours();
      return hour >= 5 && hour < 12;
    });
  }

  if (
    lower.includes("afternoon") ||
    lower.includes("in the afternoon")
  ) {
    filteredTrips = sortedTrips.filter((trip) => {
      const hour = new Date(trip.departureAt).getUTCHours();
      return hour >= 12 && hour < 17;
    });
  }

  if (
    lower.includes("evening") ||
    lower.includes("tonight") ||
    lower.includes("in the evening")
  ) {
    filteredTrips = sortedTrips.filter((trip) => {
      const hour = new Date(trip.departureAt).getUTCHours();
      return hour >= 17;
    });
  }

  return {
    success: true,
    message: formatTrips(
      filteredTrips,
      route.origin,
      route.destination,
      date
    ),
    trips: filteredTrips,
  };
}

async function handleBasicConversation(
  message: string
): Promise<ZanoAIResponse> {
  const lower = normalizeText(message);

  if (
    lower === "hello" ||
    lower === "hi" ||
    lower === "hey" ||
    lower.includes("hello zano") ||
    lower.includes("hi zano")
  ) {
    return {
      success: true,
      message:
        "Hi! 👋 I'm Zano AI. I can help you find buses, compare fares and seats, check boarding points, and check the weather for your trip. Where are you travelling from and where are you going?",
    };
  }

  if (
    lower.includes("what can you do") ||
    lower.includes("what do you do") ||
    lower.includes("help me")
  ) {
    return {
      success: true,
      message:
        "I'm Zano AI 🤖. I can help you:\n\n" +
        "🚌 Find available buses\n" +
        "💰 Compare fares\n" +
        "💺 Check available seats\n" +
        "📍 Find boarding points\n" +
        "🌦️ Check weather conditions\n" +
        "📅 Plan trips for today or tomorrow\n\n" +
        "For example, try: \"Find a bus from Accra to Kumasi tomorrow morning.\"",
    };
  }

  if (
    lower.includes("thank you") ||
    lower.includes("thanks")
  ) {
    return {
      success: true,
      message:
        "You're welcome! 😊 I'm here whenever you're ready to plan your trip.",
    };
  }

  // General searches for buses without a specified route.
  const asksForAllRoutes =
    lower.includes("all available routes") ||
    lower.includes("show me all routes") ||
    lower.includes("available routes");

  const asksForGeneralAvailability =
    lower.includes("what buses are available") ||
    lower.includes("buses available today") ||
    lower.includes("buses available tomorrow") ||
    lower.includes("all available buses") ||
    lower.includes("show me all buses") ||
    lower.includes("all buses leaving");

  if (asksForAllRoutes || asksForGeneralAvailability) {
    const date = getDateFromMessage(message);

    // For a general route list, search upcoming trips across
    // the next 7 days. Explicit today/tomorrow requests keep
    // their requested date.
    const today = new Date();
    const formatDate = (value: Date) =>
      `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;

    const datesToSearch = date
      ? [date]
      : asksForAllRoutes
        ? Array.from({ length: 7 }, (_, index) => {
            const value = new Date(today);
            value.setUTCDate(value.getUTCDate() + index);
            return formatDate(value);
          })
        : [formatDate(today)];

    const tripGroups = await Promise.all(
      datesToSearch.map((travelDate) =>
        searchAllTrips({ date: travelDate, passengers: 1, limit: 100 })
      )
    );

    const uniqueTrips = new Map<string, ResolvedTrip>();
    tripGroups.flat().forEach((trip) => {
      uniqueTrips.set(`${trip.id}-${trip.travelDate}`, trip);
    });

    const sortedTrips = sortTrips(
      Array.from(uniqueTrips.values()),
      detectSort(message)
    );

    if (sortedTrips.length === 0) {
      return {
        success: true,
        message: date
          ? `I couldn't find any available trips for ${date}. Try another date or specify a route, such as Accra to Kumasi.`
          : "I couldn't find any available trips in the current schedule. Please try again later or search for a specific route.",
        trips: [],
      };
    }

    const routes = Array.from(
      new Set(sortedTrips.map((trip) => `${trip.origin} → ${trip.destination}`))
    );

    const messageText = asksForAllRoutes
      ? `Here are the routes with available trips${date ? ` for ${date}` : ""}:\n\n` +
        routes.map((route) => `• ${route}`).join("\n")
      : `I found ${sortedTrips.length} available trip${sortedTrips.length === 1 ? "" : "s"}${date ? ` for ${date}` : ""}:\n\n` +
        sortedTrips.slice(0, 10).map((trip, index) => formatTrip(trip, index)).join("\n\n") +
        (sortedTrips.length > 10 ? "\n\nShowing the first 10 trips. Tell me your route to narrow the results." : "");

    return {
      success: true,
      message: messageText,
      trips: sortedTrips,
    };
  }

  // Ask for the details needed to start the booking process.
  if (
    lower.includes("book a trip") ||
    lower.includes("book me") ||
    lower.includes("help me book") ||
    lower.includes("make a booking") ||
    lower.includes("reserve a bus") ||
    lower.includes("start booking assistance") ||
    lower.includes("booking assistance") ||
    lower.includes("start booking") ||
    lower === "booking"
  ) {
    return {
      success: true,
      message:
        "Absolutely! 🚌 Let's find a trip for you. Please tell me:\n\n" +
        "1. Your departure city\n" +
        "2. Your destination\n" +
        "3. Your travel date\n" +
        "4. Number of passengers\n\n" +
        "I'll help you find an available trip. Your booking is only confirmed after you complete the booking process on Zano.",
    };
  }

  if (
    lower.includes("track my trip") ||
    lower.includes("track my bus") ||
    lower.includes("track my journey") ||
    lower.includes("live location")
  ) {
    return {
      success: true,
      message:
        "📍 You can check trip progress through your Zano booking or trip-tracking page when tracking is available for your journey. I can't see a live bus location from this chat alone. If you share your booking status or trip details (without payment or private account information), I can help you understand the next step.",
    };
  }

  if (
    lower.includes("where can i board") ||
    lower.includes("boarding point") ||
    lower.includes("boarding points") ||
    lower.includes("where do i board")
  ) {
    const location =
      extractLocationAfterKeyword(message, ["board", "boarding"]) ||
      (lower.includes("accra") ? "Accra" : null);

    if (location) {
      const today = new Date();
      const dates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() + index);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      });

      const tripGroups = await Promise.all(
        dates.map((date) => searchTripsByLocation({ location, date }))
      );

      const uniqueTrips = new Map<string, ResolvedTrip>();
      tripGroups.flat().forEach((trip) => {
        uniqueTrips.set(`${trip.id}-${trip.travelDate}`, trip);
      });
      const trips = Array.from(uniqueTrips.values());

      const points = Array.from(
        new Set(trips.flatMap((trip) => trip.boardingPoints))
      );

      return {
        success: true,
        message: points.length
          ? `📍 Boarding points found for trips matching ${location}:\n- ${points.join("\n- ")}`
          : `I couldn't find saved boarding points for ${location} yet. Please check the boarding details on your selected trip.`,
        trips,
      };
    }

    return {
      success: true,
      message:
        "Tell me the city or the bus trip you're asking about, and I'll check the boarding points saved for matching trips.",
    };
  }

  if (
    lower.includes("fastest") ||
    lower.includes("quickest") ||
    lower.includes("shortest")
  ) {
    return {
      success: true,
      message:
        "I can compare journey durations once I know your route. For example: “Which is the fastest bus from Accra to Kumasi?”",
    };
  }

  // Find the cheapest upcoming trip, even without a specified route.
  if (
    lower.includes("cheapest") ||
    lower.includes("lowest fare") ||
    lower.includes("lowest price") ||
    lower.includes("cheapest trip") ||
    lower.includes("cheapest bus")
  ) {
    const requestedDate = getDateFromMessage(message);
    const today = new Date();

    const dates = requestedDate
      ? [requestedDate]
      : Array.from({ length: 7 }, (_, index) => {
          const date = new Date(today);
          date.setUTCDate(date.getUTCDate() + index);
          return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        });

    const groups = await Promise.all(
      dates.map((date) =>
        searchAllTrips({ date, passengers: 1, limit: 100 })
      )
    );

    const uniqueTrips = new Map<string, ResolvedTrip>();
    groups.flat().forEach((trip) => {
      uniqueTrips.set(`${trip.id}-${trip.travelDate}`, trip);
    });

    const trips = sortTrips(
      Array.from(uniqueTrips.values()),
      "cheapest"
    );

    if (trips.length === 0) {
      return {
        success: true,
        message: "I couldn't find an available trip in the schedule for the next 7 days. Try another travel date or ask about a specific route.",
        trips: [],
      };
    }

    return {
      success: true,
      message:
        "💰 The cheapest available trip I found" +
        (requestedDate ? ` for ${requestedDate}` : " in the next 7 days") +
        " is:\n\n" +
        formatTrip(trips[0], 0),
      trips: [trips[0]],
    };
  }

  return {
    success: true,
    message:
      "I'm Zano AI 🤖. I can help with bus searches, fare budgets, boarding points, and travel planning. Tell me your route or ask me a specific question about your trip.",
  };
}

export async function ZanoAI(
  messages: ZanoAIMessage[]
): Promise<ZanoAIResponse> {
  try {
    const latestMessage =
      [...messages]
        .reverse()
        .find((message) => message.role === "user")
        ?.content?.trim() || "";

    if (!latestMessage) {
      return {
        success: false,
        message: "Please tell me what you'd like help with.",
      };
    }

    /*
     * WEATHER
     */
    if (isWeatherRequest(latestMessage)) {
      const weatherResponse =
        await handleWeatherRequest(latestMessage);

      if (weatherResponse) {
        return weatherResponse;
      }
    }

    /*
     * TRIP SEARCH
     */
    const tripResponse =
      await handleTripRequest(latestMessage);

    if (tripResponse) {
      return tripResponse;
    }

    /*
     * BASIC CONVERSATION
     */
    return handleBasicConversation(latestMessage);
  } catch (error) {
    console.error("ZanoAI error:", error);

    return {
      success: false,
      message:
        "I couldn't process your request right now. Please try again.",
    };
  }
}