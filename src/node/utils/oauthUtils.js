/** Create a deferred promise that can be resolved externally. */
export function createDeferred() {
    let resolve;
    const promise = new Promise((res) => {
        resolve = res;
    });
    return { promise, resolve };
}
/** Gracefully close an HTTP server, resolving when all connections are drained. */
export function closeServer(server) {
    return new Promise((resolve) => {
        server.close(() => resolve());
    });
}
/** Escape HTML special characters to prevent XSS in rendered callback pages. */
export function escapeHtml(input) {
    return input
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
/**
 * Render the HTML page returned to the browser after an OAuth callback.
 *
 * All four loopback-based services (Gateway, Governor, Codex, MCP) return an
 * HTML page with a title, message, and auto-close script on success. The
 * structure mirrors the common pattern found across those services:
 *
 * - `<!doctype html>` with basic inline styling (centered, system font)
 * - Title in `<h1>`, message in `<p>`
 * - Auto-close `<script>` that calls `window.close()` on success
 * - Support for `extraHead` for provider-specific customization (e.g.
 *   Gateway uses an external CSS link)
 */
export function renderOAuthCallbackHtml(options) {
    const title = escapeHtml(options.title);
    const message = escapeHtml(options.message);
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 600px; margin: 4rem auto; padding: 1rem; }
      h1 { margin-bottom: 1rem; }
      .muted { color: #666; }
    </style>${options.extraHead ? `\n    ${options.extraHead}` : ""}
  </head>
  <body>
    <h1>${title}</h1>
    <p>${message}</p>
    ${options.success
        ? '<p class="muted">Mux should now be in the foreground. You can close this tab.</p>'
        : '<p class="muted">You can close this tab.</p>'}
    <script>
      (() => {
        const ok = ${options.success ? "true" : "false"};
        if (!ok) return;
        try { window.close(); } catch {}
        setTimeout(() => { try { window.close(); } catch {} }, 50);
      })();
    </script>
  </body>
</html>`;
}
//# sourceMappingURL=oauthUtils.js.map