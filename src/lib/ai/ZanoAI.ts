import {
  searchTripsByRoute,
  searchTripsByLocation,
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
    /from\s+(.+?)\s+to\s+(.+?)(?:\s+tomorrow|\s+today|\s+tonight|\s+this\s+morning|\s+this\s+afternoon|\s+this\s+evening|\s+in\s+the\s+morning|\s+in\s+the\s+afternoon|\s+in\s+the\s+evening|\?|$)/i,

    /between\s+(.+?)\s+and\s+(.+?)(?:\s+tomorrow|\s+today|\?|$)/i,
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

  const sortedTrips = sortTrips(trips, sortBy);

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

function handleBasicConversation(
  message: string
): ZanoAIResponse {
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

  return {
    success: true,
    message:
      "I'm Zano AI 🤖. Tell me where you're travelling from, where you're going, and when you'd like to travel. I can also check the weather for your trip.",
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