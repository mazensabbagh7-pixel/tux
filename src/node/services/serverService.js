import { createOrpcServer } from "@/node/orpc/server";
import { ServerLockfile } from "./serverLockfile";
import * as fs from "fs/promises";
import * as path from "path";
import { log } from "./log";
import * as os from "os";
import { VERSION } from "@/version";
import { buildMuxMdnsServiceOptions, MdnsAdvertiserService } from "./mdnsAdvertiserService";
function isLoopbackHost(host) {
    const normalized = host.trim().toLowerCase();
    // IPv4 loopback range (RFC 1122): 127.0.0.0/8
    if (normalized.startsWith("127.")) {
        return true;
    }
    return normalized === "localhost" || normalized === "::1";
}
function formatHostForUrl(host) {
    const trimmed = host.trim();
    // IPv6 URLs must be bracketed: http://[::1]:1234
    if (trimmed.includes(":")) {
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            return trimmed;
        }
        return `[${trimmed}]`;
    }
    return trimmed;
}
function buildHttpBaseUrl(host, port) {
    return `http://${formatHostForUrl(host)}:${port}`;
}
function getNonInternalInterfaceAddresses(networkInterfaces, family) {
    const addresses = [];
    const emptyInfos = [];
    for (const name of Object.keys(networkInterfaces)) {
        const infos = networkInterfaces[name] ?? emptyInfos;
        for (const info of infos) {
            const infoFamily = info.family;
            if (infoFamily !== family) {
                continue;
            }
            if (info.internal) {
                continue;
            }
            const address = info.address;
            // Filter out link-local addresses (they are rarely what users want to copy/paste).
            if (family === "IPv4" && address.startsWith("169.254.")) {
                continue;
            }
            if (family === "IPv6" && address.toLowerCase().startsWith("fe80:")) {
                continue;
            }
            addresses.push(address);
        }
    }
    return Array.from(new Set(addresses)).sort();
}
/**
 * Compute base URLs that are reachable from other devices (LAN/VPN).
 *
 * NOTE: This is for UI/display and should not be used for lockfile discovery,
 * since lockfiles are local-machine concerns.
 */
export function computeNetworkBaseUrls(options) {
    const bindHost = options.bindHost.trim();
    if (!bindHost) {
        return [];
    }
    if (isLoopbackHost(bindHost)) {
        return [];
    }
    const networkInterfaces = options.networkInterfaces ?? os.networkInterfaces();
    if (bindHost === "0.0.0.0") {
        return getNonInternalInterfaceAddresses(networkInterfaces, "IPv4").map((address) => buildHttpBaseUrl(address, options.port));
    }
    if (bindHost === "::") {
        return getNonInternalInterfaceAddresses(networkInterfaces, "IPv6").map((address) => buildHttpBaseUrl(address, options.port));
    }
    return [buildHttpBaseUrl(bindHost, options.port)];
}
export class ServerService {
    constructor() {
        this.launchProjectPath = null;
        this.server = null;
        this.lockfile = null;
        this.apiAuthToken = null;
        this.serverInfo = null;
        this.mdnsAdvertiser = new MdnsAdvertiserService();
        this.sshHost = undefined;
    }
    /**
     * Set the launch project path
     */
    setLaunchProject(path) {
        this.launchProjectPath = path;
    }
    /**
     * Get the launch project path
     */
    getLaunchProject() {
        return Promise.resolve(this.launchProjectPath);
    }
    /**
     * Set the SSH hostname for editor deep links (browser mode)
     */
    setSshHost(host) {
        this.sshHost = host;
    }
    /**
     * Get the SSH hostname for editor deep links (browser mode)
     */
    getSshHost() {
        return this.sshHost;
    }
    /**
     * Set the auth token used for the HTTP/WS API server.
     *
     * This is injected by the desktop app on startup so the server can be restarted
     * without needing to plumb the token through every callsite.
     */
    setApiAuthToken(token) {
        this.apiAuthToken = token;
    }
    /** Get the auth token used for the HTTP/WS API server (if initialized). */
    getApiAuthToken() {
        return this.apiAuthToken;
    }
    /**
     * Start the HTTP/WS API server.
     *
     * @throws Error if a server is already running (check lockfile first)
     */
    async startServer(options) {
        if (this.server) {
            throw new Error("Server already running in this process");
        }
        // Create lockfile instance for checking - don't store yet
        const lockfile = new ServerLockfile(options.muxHome);
        // Check for existing server (another process)
        const existing = await lockfile.read();
        if (existing) {
            throw new Error(`Another mux server is already running at ${existing.baseUrl} (PID: ${existing.pid})`);
        }
        const bindHost = typeof options.host === "string" && options.host.trim() ? options.host.trim() : "127.0.0.1";
        this.apiAuthToken = options.authToken;
        const staticDir = path.join(__dirname, "../..");
        let serveStatic = options.serveStatic ?? false;
        if (serveStatic) {
            const indexPath = path.join(staticDir, "index.html");
            try {
                await fs.access(indexPath);
            }
            catch {
                log.warn(`API server static UI requested, but ${indexPath} is missing. Disabling.`);
                serveStatic = false;
            }
        }
        const serverOptions = {
            host: bindHost,
            port: options.port ?? 0,
            context: options.context,
            authToken: options.authToken,
            router: options.router,
            serveStatic,
            staticDir,
        };
        const server = await createOrpcServer(serverOptions);
        const networkBaseUrls = computeNetworkBaseUrls({ bindHost, port: server.port });
        // Acquire the lockfile - clean up server if this fails
        try {
            await lockfile.acquire(server.baseUrl, options.authToken, {
                bindHost,
                port: server.port,
                networkBaseUrls,
            });
        }
        catch (err) {
            await server.close();
            throw err;
        }
        // Only store references after successful acquisition - ensures stopServer
        // won't delete another process's lockfile if we failed before acquiring
        this.lockfile = lockfile;
        this.server = server;
        this.serverInfo = {
            baseUrl: server.baseUrl,
            token: options.authToken,
            bindHost,
            port: server.port,
            networkBaseUrls,
        };
        const mdnsAdvertisementEnabled = options.context.config.getMdnsAdvertisementEnabled();
        // "auto" mode: only advertise when the bind host is reachable from other devices.
        if (mdnsAdvertisementEnabled !== false && !isLoopbackHost(bindHost)) {
            const instanceName = options.context.config.getMdnsServiceName() ?? `mux-${os.hostname()}`;
            const serviceOptions = buildMuxMdnsServiceOptions({
                bindHost,
                port: server.port,
                instanceName,
                version: VERSION.git_describe,
                authRequired: options.authToken.trim().length > 0,
            });
            try {
                await this.mdnsAdvertiser.start(serviceOptions);
            }
            catch (err) {
                log.warn("Failed to advertise mux API server via mDNS:", err);
            }
        }
        else if (mdnsAdvertisementEnabled === true && isLoopbackHost(bindHost)) {
            log.warn("mDNS advertisement requested, but the API server is loopback-only. " +
                "Set apiServerBindHost to 0.0.0.0 (or a LAN IP) to enable LAN discovery.");
        }
        return this.serverInfo;
    }
    /**
     * Stop the HTTP/WS API server and release the lockfile.
     */
    async stopServer() {
        try {
            await this.mdnsAdvertiser.stop();
        }
        catch (err) {
            log.warn("Failed to stop mDNS advertiser:", err);
        }
        if (this.lockfile) {
            await this.lockfile.release();
            this.lockfile = null;
        }
        if (this.server) {
            await this.server.close();
            this.server = null;
        }
        this.serverInfo = null;
    }
    /**
     * Get information about the running server.
     * Returns null if no server is running in this process.
     */
    getServerInfo() {
        return this.serverInfo;
    }
    /**
     * Check if a server is running in this process.
     */
    isServerRunning() {
        return this.server !== null;
    }
}
//# sourceMappingURL=serverService.js.map