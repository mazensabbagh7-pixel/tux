import { GlobalWindow } from "happy-dom";
// NOTE: installDom intentionally mutates globalThis.* (window/document/etc) to give UI
// tests a DOM environment.
//
// Some Radix internals decide at module-eval time whether to enable useLayoutEffect based
// on `globalThis.document`. See the bootstrap at the bottom of this module.
export function installDom() {
    const previous = {
        window: globalThis.window,
        document: globalThis.document,
        Element: globalThis.Element,
        DocumentFragment: globalThis.DocumentFragment,
        navigator: globalThis.navigator,
        HTMLInputElement: globalThis.HTMLInputElement,
        localStorage: globalThis.localStorage,
        NodeFilter: globalThis.NodeFilter,
        HTMLElement: globalThis.HTMLElement,
        Node: globalThis.Node,
        Image: globalThis.Image,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        getComputedStyle: globalThis.getComputedStyle,
        cancelAnimationFrame: globalThis.cancelAnimationFrame,
        ResizeObserver: globalThis.ResizeObserver,
        MutationObserver: globalThis.MutationObserver,
        IntersectionObserver: globalThis
            .IntersectionObserver,
    };
    const domWindow = new GlobalWindow({ url: "http://localhost" });
    globalThis.window = domWindow;
    globalThis.document = domWindow.document;
    globalThis.navigator = domWindow.navigator;
    globalThis.getComputedStyle = domWindow.getComputedStyle.bind(domWindow);
    globalThis.localStorage = domWindow.localStorage;
    globalThis.Element = domWindow.Element;
    globalThis.DocumentFragment =
        domWindow.DocumentFragment;
    globalThis.HTMLInputElement =
        domWindow.HTMLInputElement;
    globalThis.HTMLElement = domWindow.HTMLElement;
    globalThis.MutationObserver =
        domWindow.MutationObserver;
    globalThis.NodeFilter = domWindow.NodeFilter;
    globalThis.Node = domWindow.Node;
    // Image is used by react-dnd-html5-backend for drag preview
    globalThis.Image = domWindow.Image ?? class MockImage {
    };
    // DataTransfer is used by drag-drop tests
    if (!globalThis.DataTransfer) {
        globalThis.DataTransfer =
            domWindow.DataTransfer ?? class MockDataTransfer {
            };
    }
    // happy-dom doesn't always define these on globalThis in node env.
    if (!globalThis.requestAnimationFrame) {
        globalThis.requestAnimationFrame = (cb) => {
            return window.setTimeout(() => cb(Date.now()), 0);
        };
    }
    if (!globalThis.cancelAnimationFrame) {
        globalThis.cancelAnimationFrame = (id) => {
            window.clearTimeout(id);
        };
    }
    // Some UI code paths rely on ResizeObserver for layout/scroll stabilization.
    if (!globalThis.ResizeObserver) {
        class ResizeObserver {
            constructor(_callback) { }
            observe(_target) { }
            unobserve(_target) { }
            disconnect() { }
        }
        globalThis.ResizeObserver = ResizeObserver;
    }
    // Used by ReviewPanel/HunkViewer for lazy visibility tracking.
    if (!globalThis.IntersectionObserver) {
        class IntersectionObserver {
            constructor(_callback, _options) { }
            observe(_target) { }
            unobserve(_target) { }
            disconnect() { }
            takeRecords() {
                return [];
            }
        }
        globalThis.IntersectionObserver =
            IntersectionObserver;
    }
    // React DOM's getCurrentEventPriority reads window.event to determine update priority.
    // In happy-dom, this may be undefined, causing errors. Polyfill with undefined-safe getter.
    if (!("event" in domWindow)) {
        Object.defineProperty(domWindow, "event", {
            get: () => undefined,
            configurable: true,
        });
    }
    // matchMedia is used by some components and by Radix.
    if (!domWindow.matchMedia) {
        domWindow.matchMedia = ((_query) => {
            return {
                matches: false,
                media: _query,
                onchange: null,
                addListener: () => {
                    // deprecated
                },
                removeListener: () => {
                    // deprecated
                },
                addEventListener: () => {
                    // noop
                },
                removeEventListener: () => {
                    // noop
                },
                dispatchEvent: () => false,
            };
        });
    }
    return () => {
        domWindow.close();
        globalThis.Element = previous.Element;
        globalThis.window = previous.window;
        globalThis.DocumentFragment =
            previous.DocumentFragment;
        globalThis.document = previous.document;
        globalThis.navigator = previous.navigator;
        globalThis.HTMLInputElement =
            previous.HTMLInputElement;
        globalThis.localStorage = previous.localStorage;
        globalThis.HTMLElement = previous.HTMLElement;
        globalThis.NodeFilter = previous.NodeFilter;
        globalThis.MutationObserver =
            previous.MutationObserver;
        globalThis.Node = previous.Node;
        globalThis.Image = previous.Image;
        globalThis.requestAnimationFrame = previous.requestAnimationFrame;
        globalThis.getComputedStyle = previous.getComputedStyle;
        globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
        globalThis.IntersectionObserver =
            previous.IntersectionObserver;
        globalThis.ResizeObserver =
            previous.ResizeObserver;
    };
}
/**
 * Bootstrap a baseline Happy DOM document early.
 *
 * Radix's @radix-ui/react-use-layout-effect decides at module evaluation time whether
 * to use React.useLayoutEffect based on `globalThis.document`. In Jest's node
 * environment, `document` starts undefined, which makes Radix fall back to a noop and
 * breaks Portals (Dialogs/Tooltips/etc).
 *
 * We install a baseline DOM once on module import so downstream UI modules see a truthy
 * `document` during evaluation. Individual tests still call installDom() to get an
 * isolated Window per test.
 */
if (typeof globalThis.document === "undefined") {
    installDom();
}
//# sourceMappingURL=dom.js.map