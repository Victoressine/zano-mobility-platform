import { NextRequest, NextResponse } from "next/server";
import { getWeather } from "@/lib/ai/weather";

export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const location =
      searchParams.get("location");

    const date =
      searchParams.get("date") ||
      undefined;

    if (!location?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Location is required.",
        },
        { status: 400 }
      );
    }

    const weather = await getWeather(
      location,
      date
    );

    if (!weather.success) {
      return NextResponse.json(
        weather,
        { status: 503 }
      );
    }

    return NextResponse.json(weather);
  } catch (error) {
    console.error(
      "Weather API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to retrieve weather information.",
      },
      { status: 500 }
    );
  }
}