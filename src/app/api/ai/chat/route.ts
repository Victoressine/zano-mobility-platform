import { NextRequest, NextResponse } from "next/server";
import { ZanoAI, type ZanoAIMessage } from "@/lib/ai/ZanoAI";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !Array.isArray(body.messages)) {
      return NextResponse.json(
        {
          success: false,
          error: "A valid messages array is required.",
        },
        { status: 400 }
      );
    }

    const messages: ZanoAIMessage[] = body.messages
      .filter(
        (message: unknown): message is ZanoAIMessage =>
          typeof message === "object" &&
          message !== null &&
          "role" in message &&
          "content" in message &&
          ((message as ZanoAIMessage).role === "user" ||
            (message as ZanoAIMessage).role === "assistant") &&
          typeof (message as ZanoAIMessage).content === "string"
      )
      .slice(-20);

    if (messages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a message.",
        },
        { status: 400 }
      );
    }

    const result = await ZanoAI(messages);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Zano AI API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Zano AI is temporarily unavailable. Please try again.",
      },
      { status: 500 }
    );
  }
}