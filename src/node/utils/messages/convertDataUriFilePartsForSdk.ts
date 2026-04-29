import assert from "node:assert";
import type { MuxMessage } from "@/common/types/message";

const DATA_URI_PREFIX = "data:";

function detectImageMediaTypeFromBase64(base64Data: string): string | undefined {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64Data, "base64");
  } catch {
    return undefined;
  }

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 6) {
    const gifHeader = bytes.subarray(0, 6).toString("ascii");
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
      return "image/gif";
    }
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return undefined;
}

function resolveMediaType(metadataMediaType: string | undefined, base64Data: string): string | undefined {
  const detectedMediaType = detectImageMediaTypeFromBase64(base64Data);
  return detectedMediaType ?? metadataMediaType;
}

interface ParsedDataUri {
  mediaType?: string;
  base64Data: string;
}

function parseDataUriToBase64(dataUri: string): ParsedDataUri {
  assert(dataUri.toLowerCase().startsWith(DATA_URI_PREFIX), "Expected a data URI file part");

  const commaIndex = dataUri.indexOf(",");
  assert(commaIndex !== -1, "Malformed data URI in file part: missing comma");

  const metadata = dataUri.slice(DATA_URI_PREFIX.length, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);

  const metadataTokens = metadata
    .split(";")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const mediaType = metadataTokens.find((token) => token.includes("/"));
  const hasBase64Flag = metadataTokens.some((token) => token.toLowerCase() === "base64");

  if (hasBase64Flag) {
    return {
      mediaType: resolveMediaType(mediaType, payload),
      base64Data: payload,
    };
  }

  let decodedPayload: string;
  try {
    decodedPayload = decodeURIComponent(payload);
  } catch (error) {
    assert.fail(
      `Malformed data URI in file part: invalid URL encoding (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const base64Data = Buffer.from(decodedPayload, "utf8").toString("base64");
  return {
    mediaType: resolveMediaType(mediaType, base64Data),
    base64Data,
  };
}

/**
 * Rewrites user file-part data URIs into raw base64 payloads in `url`.
 *
 * convertToModelMessages() maps FileUIPart.url -> FilePart.data. If url remains a data:
 * URI string, downstream prompt prep can treat it as a URL and attempt to download it.
 * Converting to raw base64 keeps the payload inline and avoids URL download validation.
 */
export function convertDataUriFilePartsForSdk(messages: MuxMessage[]): MuxMessage[] {
  let changedAnyMessage = false;

  const convertedMessages = messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    let changedMessage = false;

    const convertedParts: MuxMessage["parts"] = message.parts.map((part) => {
      if (part.type !== "file" || !part.url.toLowerCase().startsWith(DATA_URI_PREFIX)) {
        return part;
      }

      const { mediaType, base64Data } = parseDataUriToBase64(part.url);

      changedMessage = true;
      return {
        ...part,
        mediaType: mediaType ?? part.mediaType,
        url: base64Data,
      };
    });

    if (!changedMessage) {
      return message;
    }

    changedAnyMessage = true;
    return {
      ...message,
      parts: convertedParts,
    };
  });

  return changedAnyMessage ? convertedMessages : messages;
}
