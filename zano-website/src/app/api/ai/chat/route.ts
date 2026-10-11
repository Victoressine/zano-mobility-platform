
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ZanoAI,
  type ZanoAIMessage,
} from "@/lib/ai/ZanoAI";

/* ========================================
   Zano AI API Configuration
======================================== */

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const MAX_MESSAGES = 20;

const MAX_MESSAGE_LENGTH = 4000;

const MAX_REQUEST_SIZE = 100_000;

/* ========================================
   Types
======================================== */

type ChatRequestBody = {
  message?: unknown;
  messages?: unknown;
};

type ChatErrorResponse = {
  success: false;
  error: string;
};

/* ========================================
   JSON Error Response
======================================== */

function errorResponse(
  message: string,
  status: number
) {
  return NextResponse.json<ChatErrorResponse>(
    {
      success: false,
      error: message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

/* ========================================
   Message Validation
======================================== */

function isValidMessage(
  value: unknown
): value is ZanoAIMessage {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const message = value as Record<
    string,
    unknown
  >;

  return (
    (message.role === "user" ||
      message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <=
      MAX_MESSAGE_LENGTH
  );
}

/* ========================================
   Normalize Chat Messages
======================================== */

function normalizeMessages(
  body: ChatRequestBody
):
  | {
      success: true;
      messages: ZanoAIMessage[];
    }
  | {
      success: false;
      error: string;
    } {
  /*
   * Supports both:
   *
   * { message: "Hello" }
   *
   * and:
   *
   * {
   *   messages: [
   *     {
   *       role: "user",
   *       content: "Hello"
   *     }
   *   ]
   * }
   */

  if (body.messages !== undefined) {
    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0
    ) {
      return {
        success: false,
        error:
          "A valid messages array is required.",
      };
    }

    const recentMessages =
      body.messages.slice(-MAX_MESSAGES);

    if (
      !recentMessages.every(
        isValidMessage
      )
    ) {
      return {
        success: false,
        error:
          "One or more messages are invalid.",
      };
    }

    const messages =
      recentMessages.map(
        (message) => ({
          role: message.role,
          content:
            message.content.trim(),
        })
      );

    if (
      messages[
        messages.length - 1
      ].role !== "user"
    ) {
      return {
        success: false,
        error:
          "The latest message must be from the user.",
      };
    }

    return {
      success: true,
      messages,
    };
  }

  if (
    typeof body.message === "string"
  ) {
    const message =
      body.message.trim();

    if (!message) {
      return {
        success: false,
        error:
          "Please provide a message.",
      };
    }

    if (
      message.length >
      MAX_MESSAGE_LENGTH
    ) {
      return {
        success: false,
        error:
          "Your message is too long.",
      };
    }

    return {
      success: true,
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    };
  }

  return {
    success: false,
    error:
      "Please provide a message.",
  };
}

/* ========================================
   POST /api/ai/chat
======================================== */

export async function POST(
  request: NextRequest
) {
  try {
    /* ------------------------------------
       Validate Content Type
    ------------------------------------ */

    const contentType =
      request.headers.get(
        "content-type"
      ) ?? "";

    if (
      !contentType
        .toLowerCase()
        .includes(
          "application/json"
        )
    ) {
      return errorResponse(
        "Content-Type must be application/json.",
        415
      );
    }

    /* ------------------------------------
       Read Request Body Safely
    ------------------------------------ */

    const contentLength =
      request.headers.get(
        "content-length"
      );

    if (
      contentLength !== null &&
      Number(contentLength) >
        MAX_REQUEST_SIZE
    ) {
      return errorResponse(
        "Request is too large.",
        413
      );
    }

    let rawBody = "";

    try {
      const reader =
        request.body?.getReader();

      if (!reader) {
        return errorResponse(
          "Please provide a message.",
          400
        );
      }

      const decoder =
        new TextDecoder();

      let receivedBytes = 0;

      while (true) {
        const {
          done,
          value,
        } = await reader.read();

        if (done) {
          break;
        }

        receivedBytes +=
          value.byteLength;

        if (
          receivedBytes >
          MAX_REQUEST_SIZE
        ) {
          await reader.cancel();

          return errorResponse(
            "Request is too large.",
            413
          );
        }

        rawBody +=
          decoder.decode(
            value,
            {
              stream: true,
            }
          );
      }

      rawBody +=
        decoder.decode();
    } catch {
      return errorResponse(
        "Unable to read request body.",
        400
      );
    }

    /* ------------------------------------
       Parse JSON
    ------------------------------------ */

    let parsedBody: unknown;

    try {
      parsedBody =
        JSON.parse(rawBody);
    } catch {
      return errorResponse(
        "Invalid JSON request body.",
        400
      );
    }

    if (
      typeof parsedBody !==
        "object" ||
      parsedBody === null ||
      Array.isArray(
        parsedBody
      )
    ) {
      return errorResponse(
        "Invalid chat request.",
        400
      );
    }

    const body =
      parsedBody as ChatRequestBody;

    /* ------------------------------------
       Normalize Messages
    ------------------------------------ */

    const normalized =
      normalizeMessages(body);

    if (
      !normalized.success
    ) {
      return errorResponse(
        normalized.error,
        400
      );
    }

    /* ------------------------------------
       Execute Existing Zano AI
    ------------------------------------ */

    const result =
      await ZanoAI(
        normalized.messages
      );

    /* ------------------------------------
       Return AI Response
    ------------------------------------ */

    return NextResponse.json(
      result,
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Zano AI API error:",
      error
    );

    return errorResponse(
      "Zano AI is temporarily unavailable. Please try again.",
      500
    );
  }
}
