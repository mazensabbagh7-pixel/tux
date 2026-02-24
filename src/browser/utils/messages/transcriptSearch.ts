const TRANSCRIPT_SEARCH_SCOPE_SELECTOR = "[data-message-content]";
const TRANSCRIPT_SEARCH_EXCLUDED_SELECTOR = "button, [role='button'], input, textarea, select";

export interface TranscriptTextMatch {
  textNode: Text;
  startOffset: number;
  endOffset: number;
}

/**
 * Find case-insensitive text matches in rendered transcript message content.
 *
 * We intentionally scope to message content blocks so "find in transcript" ignores
 * surrounding chat chrome (buttons, metadata rows, warnings, etc.).
 */
export function findTranscriptTextMatches(options: {
  transcriptRoot: HTMLElement;
  query: string;
}): TranscriptTextMatch[] {
  const query = options.query;
  if (query.length === 0) {
    return [];
  }

  const normalizedNeedle = query.toLocaleLowerCase();
  if (normalizedNeedle.length === 0) {
    return [];
  }

  const textNodeFilter = typeof NodeFilter === "undefined" ? 4 : NodeFilter.SHOW_TEXT;
  const matches: TranscriptTextMatch[] = [];

  const searchableContainers = options.transcriptRoot.querySelectorAll<HTMLElement>(
    TRANSCRIPT_SEARCH_SCOPE_SELECTOR
  );

  for (const container of searchableContainers) {
    const walker = document.createTreeWalker(container, textNodeFilter);
    for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
      if (current.nodeType !== 3) {
        continue;
      }

      const textNode = current as Text;
      const parentElement = textNode.parentElement;
      if (!parentElement) {
        continue;
      }

      if (parentElement.closest(TRANSCRIPT_SEARCH_EXCLUDED_SELECTOR)) {
        continue;
      }

      const textValue = textNode.nodeValue ?? "";
      if (textValue.length === 0) {
        continue;
      }

      const normalizedHaystack = textValue.toLocaleLowerCase();
      let searchStart = 0;

      while (searchStart <= normalizedHaystack.length - normalizedNeedle.length) {
        const matchStart = normalizedHaystack.indexOf(normalizedNeedle, searchStart);
        if (matchStart === -1) {
          break;
        }

        matches.push({
          textNode,
          startOffset: matchStart,
          endOffset: matchStart + normalizedNeedle.length,
        });

        searchStart = matchStart + Math.max(1, normalizedNeedle.length);
      }
    }
  }

  return matches;
}

export function focusTranscriptTextMatch(match: TranscriptTextMatch): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  try {
    const range = document.createRange();
    range.setStart(match.textNode, match.startOffset);
    range.setEnd(match.textNode, match.endOffset);

    selection.removeAllRanges();
    selection.addRange(range);

    const scrollTarget =
      match.textNode.parentElement?.closest<HTMLElement>("[data-message-id]") ??
      match.textNode.parentElement;

    scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  } catch {
    return false;
  }
}
