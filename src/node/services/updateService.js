import { log } from "@/node/services/log";
import { parseDebugUpdater } from "@/common/utils/env";
export class UpdateService {
    constructor() {
        this.impl = null;
        this.currentStatus = { type: "idle" };
        this.subscribers = new Set();
        this.ready = this.initialize().catch((err) => {
            log.error("Failed to initialize UpdateService:", err);
        });
    }
    async initialize() {
        // Check if running in Electron Main process
        if (process.versions.electron) {
            try {
                // Dynamic import to avoid loading electron-updater in CLI
                // eslint-disable-next-line no-restricted-syntax
                const { UpdaterService: DesktopUpdater } = await import("@/desktop/updater");
                this.impl = new DesktopUpdater();
                // Forward updates
                this.impl.subscribe((status) => {
                    this.currentStatus = status;
                    this.notifySubscribers();
                });
                // Sync initial status and push it in case subscribers connected before
                // the updater implementation finished initializing.
                this.currentStatus = this.impl.getStatus();
                this.notifySubscribers();
            }
            catch (err) {
                log.debug("UpdateService: Failed to load desktop updater (likely CLI mode or missing dep):", err);
            }
        }
    }
    async check(options) {
        await this.ready;
        if (this.impl) {
            if (process.versions.electron) {
                try {
                    // eslint-disable-next-line no-restricted-syntax
                    const { app } = await import("electron");
                    const debugConfig = parseDebugUpdater(process.env.DEBUG_UPDATER);
                    if (!app.isPackaged && !debugConfig.enabled) {
                        log.debug("UpdateService: Updates disabled in dev mode");
                        // Ensure status is idle so frontend doesn't show spinner.
                        // Always notify so frontend clears isCheckingOnHover state.
                        this.currentStatus = { type: "idle" };
                        this.notifySubscribers();
                        return;
                    }
                }
                catch (err) {
                    // Ignore errors (e.g. if modules not found), proceed to check
                    log.debug("UpdateService: Error checking env:", err);
                }
            }
            this.impl.checkForUpdates(options);
        }
        else {
            log.debug("UpdateService: check() called but no implementation (CLI mode)");
        }
    }
    async download() {
        await this.ready;
        if (this.impl) {
            await this.impl.downloadUpdate();
        }
    }
    install() {
        if (this.impl) {
            this.impl.installUpdate();
        }
    }
    onStatus(callback) {
        // Send current status immediately
        callback(this.currentStatus);
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    }
    notifySubscribers() {
        for (const sub of this.subscribers) {
            try {
                sub(this.currentStatus);
            }
            catch (err) {
                log.error("Error in UpdateService subscriber:", err);
            }
        }
    }
}
//# sourceMappingURL=updateService.js.map