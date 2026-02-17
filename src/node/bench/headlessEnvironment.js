import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import createIPCMock from "electron-mock-ipc";
import { Config } from "@/node/config";
import { ServiceContainer } from "@/node/services/serviceContainer";
function createMockBrowserWindow() {
    const sentEvents = [];
    const mockWindow = {
        webContents: {
            send: (channel, data) => {
                sentEvents.push({ channel, data });
            },
            openDevTools: () => {
                throw new Error("openDevTools is not supported in headless mode");
            },
        },
        isMinimized: () => false,
        restore: () => undefined,
        focus: () => undefined,
        loadURL: () => {
            throw new Error("loadURL should not be called in headless mode");
        },
        on: () => undefined,
        setTitle: () => undefined,
    };
    return { window: mockWindow, sentEvents };
}
async function establishRootDir(providedRootDir) {
    if (providedRootDir) {
        return {
            rootDir: providedRootDir,
            dispose: async () => {
                // Caller owns the directory; nothing to clean up.
            },
        };
    }
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mux-headless-"));
    return {
        rootDir: tempRoot,
        dispose: async () => {
            await fs.rm(tempRoot, { recursive: true, force: true });
        },
    };
}
function assertMockedElectron(mocked) {
    if (!mocked || typeof mocked !== "object") {
        throw new Error("Failed to initialize electron-mock-ipc");
    }
    if (!("ipcMain" in mocked) || !mocked.ipcMain) {
        throw new Error("electron-mock-ipc returned an invalid ipcMain");
    }
    if (!("ipcRenderer" in mocked) || !mocked.ipcRenderer) {
        throw new Error("electron-mock-ipc returned an invalid ipcRenderer");
    }
}
export async function createHeadlessEnvironment(options = {}) {
    const { rootDir, dispose: disposeRootDir } = await establishRootDir(options.rootDir);
    const config = new Config(rootDir);
    const { window: mockWindow, sentEvents } = createMockBrowserWindow();
    const mockedElectron = createIPCMock();
    assertMockedElectron(mockedElectron);
    const mockIpcMainModule = mockedElectron.ipcMain;
    const mockIpcRendererModule = mockedElectron.ipcRenderer;
    const services = new ServiceContainer(config);
    await services.initialize();
    services.windowService.setMainWindow(mockWindow);
    const dispose = async () => {
        sentEvents.length = 0;
        await disposeRootDir();
    };
    return {
        config,
        services,
        mockIpcMain: mockIpcMainModule,
        mockIpcRenderer: mockIpcRendererModule,
        mockWindow,
        sentEvents,
        rootDir,
        dispose,
    };
}
//# sourceMappingURL=headlessEnvironment.js.map