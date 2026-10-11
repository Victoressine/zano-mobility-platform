export type WeatherResult = {
  success: boolean;
  location?: string;
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
};

function getWeatherCondition(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if (code === 51 || code === 53 || code === 55) {
    return "Drizzle";
  }
  if (code === 56 || code === 57) {
    return "Freezing drizzle";
  }
  if (code === 61 || code === 63 || code === 65) {
    return "Rain";
  }
  if (code === 66 || code === 67) {
    return "Freezing rain";
  }
  if (code === 71 || code === 73 || code === 75) {
    return "Snow";
  }
  if (code === 77) return "Snow grains";
  if (code === 80 || code === 81 || code === 82) {
    return "Rain showers";
  }
  if (code === 85 || code === 86) {
    return "Snow showers";
  }
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) {
    return "Thunderstorm with hail";
  }

  return "Unknown conditions";
}

export async function getWeather(
  location: string,
  date?: string
): Promise<WeatherResult> {
  try {
    const cleanLocation = location.trim();

    if (!cleanLocation) {
      return {
        success: false,
        error: "Location is required.",
      };
    }

    const geocodeUrl =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: cleanLocation,
        count: "1",
        language: "en",
        format: "json",
      }).toString();

    const geocodeResponse = await fetch(
      geocodeUrl,
      {
        cache: "no-store",
      }
    );

    if (!geocodeResponse.ok) {
      return {
        success: false,
        error: "Unable to find that location.",
      };
    }

    const geocodeData =
      (await geocodeResponse.json()) as {
        results?: GeocodingResult[];
      };

    const place = geocodeData.results?.[0];

    if (!place) {
      return {
        success: false,
        error: `Could not find weather information for ${cleanLocation}.`,
      };
    }

    const forecastUrl =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
        timezone: "auto",
        forecast_days: "7",
      }).toString();

    const forecastResponse = await fetch(
      forecastUrl,
      {
        cache: "no-store",
      }
    );

    if (!forecastResponse.ok) {
      return {
        success: false,
        error:
          "Weather service is currently unavailable.",
      };
    }

    const forecast =
      (await forecastResponse.json()) as WeatherForecast;

    const dates = forecast.daily?.time ?? [];

    const requestedDate =
      date || dates[0];

    if (!requestedDate) {
      return {
        success: false,
        error:
          "No weather forecast date was available.",
      };
    }

    const dailyIndex =
      dates.indexOf(requestedDate);

    if (dailyIndex < 0) {
      return {
        success: false,
        error:
          `Weather forecast is not available for ${requestedDate}.`,
      };
    }

    const weatherCode =
      forecast.daily?.weather_code?.[dailyIndex];

    if (typeof weatherCode !== "number") {
      return {
        success: false,
        error:
          "Weather condition is unavailable.",
      };
    }

    return {
      success: true,
      location: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      date: requestedDate,
      temperatureMax:
        forecast.daily
          ?.temperature_2m_max?.[dailyIndex],
      temperatureMin:
        forecast.daily
          ?.temperature_2m_min?.[dailyIndex],
      apparentTemperatureMax:
        forecast.daily
          ?.apparent_temperature_max?.[dailyIndex],
      apparentTemperatureMin:
        forecast.daily
          ?.apparent_temperature_min?.[dailyIndex],
      precipitationProbability:
        forecast.daily
          ?.precipitation_probability_max?.[
            dailyIndex
          ],
      precipitation:
        forecast.daily
          ?.precipitation_sum?.[dailyIndex],
      windSpeed:
        forecast.daily
          ?.wind_speed_10m_max?.[dailyIndex],
      weatherCode,
      condition:
        getWeatherCondition(weatherCode),
    };
  } catch (error) {
    console.error(
      "Zano weather service error:",
      error
    );

    return {
      success: false,
      error:
        "Unable to retrieve weather information.",
    };
  }
}