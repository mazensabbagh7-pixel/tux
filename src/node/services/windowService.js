import { log } from "@/node/services/log";
export class WindowService {
    constructor() {
        this.mainWindow = null;
    }
    setMainWindow(window) {
        this.mainWindow = window;
    }
    focusMainWindow() {
        const mainWindow = this.mainWindow;
        if (!mainWindow) {
            return;
        }
        const isDestroyed = typeof mainWindow.isDestroyed === "function"
            ? mainWindow.isDestroyed()
            : false;
        if (isDestroyed) {
            return;
        }
        try {
            if (typeof mainWindow.isMinimized === "function" &&
                mainWindow.isMinimized() &&
                typeof mainWindow.restore === "function") {
                mainWindow.restore();
            }
            if (typeof mainWindow.show === "function") {
                mainWindow.show();
            }
            if (typeof mainWindow.focus === "function") {
                mainWindow.focus();
            }
        }
        catch (error) {
            log.debug("WindowService: focusMainWindow failed", error);
        }
    }
    send(channel, ...args) {
        const isDestroyed = this.mainWindow &&
            typeof this.mainWindow.isDestroyed === "function"
            ? this.mainWindow.isDestroyed()
            : false;
        if (this.mainWindow && !isDestroyed) {
            this.mainWindow.webContents.send(channel, ...args);
            return;
        }
        log.debug("WindowService: send called but mainWindow is not set or destroyed", channel, ...args);
    }
    setTitle(title) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.setTitle(title);
        }
        else {
            log.debug("WindowService: setTitle called but mainWindow is not set or destroyed");
        }
    }
}
//# sourceMappingURL=windowService.js.map