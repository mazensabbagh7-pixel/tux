/**
 * Jest setup file to ensure Symbol.dispose is available in test environment.
 * Required for explicit resource management (using declarations) to work.
 */
var _a, _b;
import assert from "assert";
import "disposablestack/auto";
assert.equal(typeof Symbol.dispose, "symbol");
// Use fast approximate token counting in Jest to avoid 10s WASM cold starts
// Individual tests can override with MUX_FORCE_REAL_TOKENIZER=1
// Many renderer components gate test-only behavior on `import.meta.env.MODE === "test"`.
// In Jest, `import.meta.env` is rewritten to `process.env` by our Babel plugin.
(_a = process.env).MODE ?? (_a.MODE = "test");
if (process.env.MUX_FORCE_REAL_TOKENIZER !== "1") {
    (_b = process.env).MUX_APPROX_TOKENIZER ?? (_b.MUX_APPROX_TOKENIZER = "1");
}
// Some deps (e.g. json-schema-ref-parser) treat `window` existence as "browser"
// and then read from the global `location` object. Some Happy DOM-based tests
// attach `globalThis.window` without defining global `location`, which can crash
// code paths that only check `typeof window !== "undefined"`.
if (!Object.getOwnPropertyDescriptor(globalThis, "location")) {
    let fallbackLocation = { href: "file:///" };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        get() {
            const win = globalThis.window;
            return win?.location ?? win?.window?.location ?? fallbackLocation;
        },
        set(value) {
            fallbackLocation = value;
        },
    });
}
assert.equal(typeof Symbol.asyncDispose, "symbol");
// Polyfill File for undici in jest environment
// undici expects File to be available globally but jest doesn't provide it
if (typeof globalThis.File === "undefined") {
    globalThis.File = class File extends Blob {
        constructor(bits, name, options) {
            super(bits, options);
            this.name = name;
            this.lastModified = options?.lastModified ?? Date.now();
        }
    };
}
// Preload tokenizer and AI SDK modules for integration tests
// This eliminates ~10s initialization delay on first use
if (process.env.TEST_INTEGRATION === "1") {
    // Store promise globally to ensure it blocks subsequent test execution
    globalThis.__muxPreloadPromise = (async () => {
        const { preloadTestModules } = await import("./ipc/setup");
        await preloadTestModules();
    })();
    // Add a global beforeAll to block until preload completes
    beforeAll(async () => {
        await globalThis.__muxPreloadPromise;
    }, 30000); // 30s timeout for preload
}
//# sourceMappingURL=setup.js.map