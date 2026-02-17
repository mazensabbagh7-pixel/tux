/**
 * Web Worker for syntax highlighting (Shiki)
 * Moves expensive highlighting work off the main thread
 */
import * as Comlink from "comlink";
import { createHighlighter } from "shiki";
import { SHIKI_DARK_THEME, SHIKI_LIGHT_THEME } from "../utils/highlighting/shiki-shared";
// Singleton highlighter instance within worker
let highlighter = null;
let highlighterPromise = null;
async function getHighlighter() {
    if (highlighter)
        return highlighter;
    // Must use if-check instead of ??= to prevent race condition
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: [SHIKI_DARK_THEME, SHIKI_LIGHT_THEME],
            langs: [],
        });
    }
    highlighter = await highlighterPromise;
    return highlighter;
}
// Map detected language to Shiki language ID
function mapToShikiLang(detectedLang) {
    const mapping = {
        text: "plaintext",
        sh: "bash",
    };
    return mapping[detectedLang] || detectedLang;
}
const api = {
    async highlight(code, language, theme) {
        const hl = await getHighlighter();
        const shikiLang = mapToShikiLang(language);
        // Load language on-demand
        const loadedLangs = hl.getLoadedLanguages();
        if (!loadedLangs.includes(shikiLang)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            await hl.loadLanguage(shikiLang);
        }
        const shikiTheme = theme === "light" ? SHIKI_LIGHT_THEME : SHIKI_DARK_THEME;
        return hl.codeToHtml(code, {
            lang: shikiLang,
            theme: shikiTheme,
        });
    },
};
Comlink.expose(api);
//# sourceMappingURL=highlightWorker.js.map