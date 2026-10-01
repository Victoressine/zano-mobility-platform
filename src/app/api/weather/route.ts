import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const location = searchParams.get("location");
    const date = searchParams.get("date");

    if (!location || !date) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide location and date.",
        },
        { status: 400 }
      );
    }

    // Find the location coordinates
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        location
      )}&count=1&language=en&format=json`
    );

    if (!geoResponse.ok) {
      throw new Error("Could not find location.");
    }

    const geoData = await geoResponse.json();

    if (!geoData.results || geoData.results.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Location "${location}" not found.`,
        },
        { status: 404 }
      );
    }

    const place = geoData.results[0];

    // Get weather forecast
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,rain_sum&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Africa%2FAccra&start_date=${date}&end_date=${date}`
    );

    if (!weatherResponse.ok) {
      throw new Error("Could not get weather forecast.");
    }

    const weatherData = await weatherResponse.json();

    return NextResponse.json({
      success: true,
      location: {
        name: place.name,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
      },
      date,
      weather: {
        maxTemperature: weatherData.daily?.temperature_2m_max?.[0],
        minTemperature: weatherData.daily?.temperature_2m_min?.[0],
        rainProbability:
          weatherData.daily?.precipitation_probability_max?.[0],
        rainAmount: weatherData.daily?.rain_sum?.[0],
        weatherCode: weatherData.daily?.weather_code?.[0],
      },
      hourly: weatherData.hourly,
      source: "Open-Meteo",
    });
  } catch (error) {
    console.error("Weather API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to fetch weather information.",
      },
      { status: 500 }
    );
  }
}