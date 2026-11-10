
export type WeatherResult = {
  success: boolean;
  location?: string;
  travelAdvice?: string;
  latitude?: number;
  longitude?: number;
  date?: string;
  temperatureMax?: number;
  temperatureMin?: number;
  apparentTemperatureMax?: number;
  apparentTemperatureMin?: number;
  precipitationProbability?: number;
  precipitation?: number;
  windSpeed?: number;
  weatherCode?: number;
  condition?: string;
  error?: string;
};

type GeocodingResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
  error?: boolean;
  reason?: string;
};

type WeatherForecast = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    apparent_temperature_max?: number[];
    apparent_temperature_min?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
  error?: boolean;
  reason?: string;
};

const GEOCODING_API =
  "https://geocoding-api.open-meteo.com/v1/search";

const FORECAST_API =
  "https://api.open-meteo.com/v1/forecast";

const REQUEST_TIMEOUT_MS = 10000;
const FORECAST_DAYS = 7;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const parsed = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function getNumericValue(
  values: number[] | undefined,
  index: number
): number | undefined {
  const value = values?.[index];

  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : undefined;
}

function getWeatherCondition(code: number): string {
  switch (code) {
    case 0:
      return "Clear sky";

    case 1:
      return "Mainly clear";

    case 2:
      return "Partly cloudy";

    case 3:
      return "Overcast";

    case 45:
    case 48:
      return "Foggy";

    case 51:
    case 53:
    case 55:
      return "Drizzle";

    case 56:
    case 57:
      return "Freezing drizzle";

    case 61:
    case 63:
    case 65:
      return "Rain";

    case 66:
    case 67:
      return "Freezing rain";

    case 71:
    case 73:
    case 75:
      return "Snow";

    case 77:
      return "Snow grains";

    case 80:
    case 81:
    case 82:
      return "Rain showers";

    case 85:
    case 86:
      return "Snow showers";

    case 95:
      return "Thunderstorm";

    case 96:
    case 99:
      return "Thunderstorm with hail";

    default:
      return "Unknown conditions";
  }
}

function getTravelAdvice(
  weatherCode: number,
  precipitationProbability?: number,
  windSpeed?: number
): string {
  if ([95, 96, 99].includes(weatherCode)) {
    return (
      "Thunderstorms are forecast. " +
      "Allow extra travel time and check with " +
      "your bus operator for possible delays."
    );
  }

  if (
    [45, 48].includes(weatherCode)
  ) {
    return (
      "Foggy conditions are forecast. " +
      "Visibility may be reduced, so allow " +
      "extra travel time."
    );
  }

  if (
    windSpeed !== undefined &&
    windSpeed >= 50
  ) {
    return (
      "Strong winds are forecast. " +
      "Check travel updates before departure " +
      "and allow additional journey time."
    );
  }

  if (
    [
      51, 53, 55,
      56, 57,
      61, 63, 65,
      66, 67,
      80, 81, 82,
    ].includes(weatherCode)
  ) {
    return (
      "Rain or drizzle is forecast. " +
      "Carry an umbrella and allow extra " +
      "time for your journey."
    );
  }

  if (
    precipitationProbability !== undefined &&
    precipitationProbability >= 70
  ) {
    return (
      "There is a high probability of " +
      "precipitation during the day. " +
      "Carry an umbrella and check the " +
      "forecast before departure."
    );
  }

  if (
    [0, 1, 2].includes(weatherCode)
  ) {
    return (
      "Generally favourable weather is " +
      "forecast for travelling. Check for " +
      "updates before your departure."
    );
  }

  return (
    "Check the latest weather forecast " +
    "before departure and allow sufficient " +
    "time for your journey."
  );
}

function normalizeLocation(location: string): string {
  return location
    .trim()
    .replace(/\s+/g, " ")
    .replace(
      /,\s*(ghana|gh)$/i,
      ""
    )
    .trim();
}

function isGeocodingResult(
  value: unknown
): value is GeocodingResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    (value.country_code === undefined ||
      value.country_code === "GH")
  );
}

function selectLocation(
  results: unknown,
  requestedLocation: string
): GeocodingResult | undefined {
  if (!Array.isArray(results)) {
    return undefined;
  }

  const validResults = results.filter(
    isGeocodingResult
  );

  const normalizedRequest =
    requestedLocation.toLowerCase();

  const exactMatch = validResults.find(
    (place) =>
      place.name.trim().toLowerCase() ===
      normalizedRequest
  );

  return exactMatch ?? validResults[0];
}

async function fetchJson(
  url: string
): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(
      REQUEST_TIMEOUT_MS
    ),
  });

  if (!response.ok) {
    throw new Error(
      `Weather API returned HTTP ${response.status}`
    );
  }

  return response.json() as Promise<unknown>;
}

export async function getWeather(
  location: string,
  date?: string
): Promise<WeatherResult> {
  try {
    // 1. Validate the requested location.
    if (typeof location !== "string") {
      return {
        success: false,
        error: "A valid location is required.",
      };
    }

    const cleanLocation =
      normalizeLocation(location);

    if (!cleanLocation) {
      return {
        success: false,
        error: "Location is required.",
      };
    }

    if (cleanLocation.length > 100) {
      return {
        success: false,
        error: "Location name is too long.",
      };
    }

    // 2. Validate the requested forecast date.
    const requestedDate =
      date?.trim() || undefined;

    if (
      requestedDate &&
      !isValidDate(requestedDate)
    ) {
      return {
        success: false,
        error:
          "Invalid date. Use YYYY-MM-DD format.",
      };
    }

    // 3. Find the location in Ghana.
    const geocodeUrl =
      GEOCODING_API +
      "?" +
      new URLSearchParams({
        name: cleanLocation,
        count: "10",
        countryCode: "GH",
        language: "en",
        format: "json",
      }).toString();

    const geocodeData =
      await fetchJson(geocodeUrl);

    if (!isRecord(geocodeData)) {
      return {
        success: false,
        error:
          "Invalid response from the location service.",
      };
    }

    const geocoding =
      geocodeData as GeocodingResponse;

    if (geocoding.error) {
      return {
        success: false,
        error:
          "The location service is currently unavailable.",
      };
    }

    const place = selectLocation(
      geocoding.results,
      cleanLocation
    );

    if (!place) {
      return {
        success: false,
        error:
          `Could not find "${cleanLocation}" in Ghana. ` +
          "Please check the city or town name.",
      };
    }

    // 4. Retrieve the seven-day forecast.
    const forecastUrl =
      FORECAST_API +
      "?" +
      new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        daily: [
          "weather_code",
          "temperature_2m_max",
          "temperature_2m_min",
          "apparent_temperature_max",
          "apparent_temperature_min",
          "precipitation_probability_max",
          "precipitation_sum",
          "wind_speed_10m_max",
        ].join(","),
        timezone: "auto",
        forecast_days: String(FORECAST_DAYS),
        temperature_unit: "celsius",
        wind_speed_unit: "kmh",
        precipitation_unit: "mm",
      }).toString();

    const forecastData =
      await fetchJson(forecastUrl);

    if (!isRecord(forecastData)) {
      return {
        success: false,
        error:
          "Invalid response from the weather service.",
      };
    }

    const forecast =
      forecastData as WeatherForecast;

    if (forecast.error) {
      return {
        success: false,
        error:
          "The weather service could not provide a forecast.",
      };
    }

    const daily = forecast.daily;
    const dates = daily?.time;

    if (
      !Array.isArray(dates) ||
      dates.length === 0 ||
      !dates.every(
        (value) => typeof value === "string"
      )
    ) {
      return {
        success: false,
        error:
          "No weather forecast dates are available.",
      };
    }

    // 5. Select the requested date.
    // The first date is today in the location's
    // timezone, as supplied by Open-Meteo.
    const selectedDate =
      requestedDate ?? dates[0];

    const dailyIndex =
      dates.indexOf(selectedDate);

    if (dailyIndex === -1) {
      return {
        success: false,
        location: place.name,
        date: selectedDate,
        error:
          `A forecast for ${selectedDate} is ` +
          "not available. Weather forecasts " +
          "are currently limited to the next " +
          `${FORECAST_DAYS} days.`,
      };
    }

    // 6. Extract and validate weather values.
    const weatherCode = getNumericValue(
      daily?.weather_code,
      dailyIndex
    );

    if (weatherCode === undefined) {
      return {
        success: false,
        location: place.name,
        date: selectedDate,
        error:
          "Weather conditions are unavailable " +
          "for the selected date.",
      };
    }

    const temperatureMax = getNumericValue(
      daily?.temperature_2m_max,
      dailyIndex
    );

    const temperatureMin = getNumericValue(
      daily?.temperature_2m_min,
      dailyIndex
    );

    const apparentTemperatureMax =
      getNumericValue(
        daily?.apparent_temperature_max,
        dailyIndex
      );

    const apparentTemperatureMin =
      getNumericValue(
        daily?.apparent_temperature_min,
        dailyIndex
      );

    const precipitationProbability =
      getNumericValue(
        daily?.precipitation_probability_max,
        dailyIndex
      );

    const precipitation = getNumericValue(
      daily?.precipitation_sum,
      dailyIndex
    );

    const windSpeed = getNumericValue(
      daily?.wind_speed_10m_max,
      dailyIndex
    );

    // 7. Return the forecast and travel advice.
    return {
      success: true,
      location: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      date: selectedDate,
      temperatureMax,
      temperatureMin,
      apparentTemperatureMax,
      apparentTemperatureMin,
      precipitationProbability,
      precipitation,
      windSpeed,
      weatherCode,
      condition:
        getWeatherCondition(weatherCode),
      travelAdvice: getTravelAdvice(
        weatherCode,
        precipitationProbability,
        windSpeed
      ),
    };
  } catch (error) {
    console.error(
      "Zano weather service error:",
      error
    );

    if (
      error instanceof Error &&
      (
        error.name === "TimeoutError" ||
        error.name === "AbortError"
      )
    ) {
      return {
        success: false,
        error:
          "The weather service took too long " +
          "to respond. Please try again.",
      };
    }

    return {
      success: false,
      error:
        "Unable to retrieve weather information " +
        "at the moment. Please try again later.",
    };
  }
}
