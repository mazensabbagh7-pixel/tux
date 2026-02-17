import * as fs from "fs";
import * as path from "path";
import * as jsonc from "jsonc-parser";
import writeFileAtomic from "write-file-atomic";
import { Ok, Err } from "@/common/types/result";
import assert from "@/common/utils/assert";
import { log } from "@/node/services/log";
export class MCPConfigService {
    constructor(config) {
        assert(typeof config.rootDir === "string" && config.rootDir.trim().length > 0, "MCPConfigService: config.rootDir must be a non-empty string");
        this.config = config;
    }
    getGlobalConfigPath() {
        return path.join(this.config.rootDir, "mcp.jsonc");
    }
    getRepoOverridePath(projectPath) {
        return path.join(projectPath, ".mux", "mcp.jsonc");
    }
    async pathExists(targetPath) {
        try {
            await fs.promises.access(targetPath, fs.constants.F_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    async ensureMuxRootDir() {
        if (!(await this.pathExists(this.config.rootDir))) {
            await fs.promises.mkdir(this.config.rootDir, { recursive: true });
        }
    }
    /**
     * Normalize a raw config entry into a strongly-typed server definition.
     *
     * Supported raw formats:
     * - string: stdio command
     * - object w/ command: stdio
     * - object w/ url: http/sse/auto (defaults to auto)
     */
    normalizeEntry(entry) {
        if (typeof entry === "string") {
            return { transport: "stdio", command: entry, disabled: false };
        }
        if (!entry || typeof entry !== "object") {
            // Fail closed for invalid shapes.
            return { transport: "stdio", command: "", disabled: true };
        }
        const obj = entry;
        const disabled = typeof obj.disabled === "boolean" ? obj.disabled : false;
        const toolAllowlist = Array.isArray(obj.toolAllowlist)
            ? obj.toolAllowlist.filter((v) => typeof v === "string")
            : undefined;
        const transport = obj.transport === "stdio" ||
            obj.transport === "http" ||
            obj.transport === "sse" ||
            obj.transport === "auto"
            ? obj.transport
            : undefined;
        const command = typeof obj.command === "string" ? obj.command : undefined;
        const url = typeof obj.url === "string" ? obj.url : undefined;
        const headersRaw = obj.headers;
        let headers;
        if (headersRaw && typeof headersRaw === "object" && !Array.isArray(headersRaw)) {
            const next = {};
            for (const [k, v] of Object.entries(headersRaw)) {
                if (typeof v === "string") {
                    next[k] = v;
                    continue;
                }
                if (v && typeof v === "object" && !Array.isArray(v)) {
                    const secret = v.secret;
                    if (typeof secret === "string") {
                        next[k] = { secret };
                    }
                }
            }
            if (Object.keys(next).length > 0) {
                headers = next;
            }
        }
        // If it has a url, prefer HTTP-based transports (default to auto).
        if (url) {
            const httpTransport = transport && transport !== "stdio" ? transport : "auto";
            return {
                transport: httpTransport,
                url,
                headers,
                disabled,
                toolAllowlist,
            };
        }
        // Otherwise, treat it as stdio.
        return {
            transport: "stdio",
            command: command ?? "",
            disabled,
            toolAllowlist,
        };
    }
    async readConfigFile(filePath) {
        try {
            const exists = await this.pathExists(filePath);
            if (!exists) {
                return { servers: {} };
            }
            const raw = await fs.promises.readFile(filePath, "utf-8");
            const parsed = jsonc.parse(raw);
            if (!parsed || typeof parsed !== "object" || !parsed.servers) {
                return { servers: {} };
            }
            // Normalize all entries on read
            const servers = {};
            for (const [name, entry] of Object.entries(parsed.servers)) {
                servers[name] = this.normalizeEntry(entry);
            }
            return { servers };
        }
        catch (error) {
            // Defensive: never crash on startup due to corrupt config.
            log.error("Failed to read MCP config", { filePath, error });
            return { servers: {} };
        }
    }
    async getGlobalConfig() {
        return this.readConfigFile(this.getGlobalConfigPath());
    }
    async getRepoOverrideConfig(projectPath) {
        return this.readConfigFile(this.getRepoOverridePath(projectPath));
    }
    async saveGlobalConfig(config) {
        await this.ensureMuxRootDir();
        const filePath = this.getGlobalConfigPath();
        // Write minimal format:
        // - string for stdio servers without extra settings
        // - object when:
        //   - disabled/toolAllowlist set, or
        //   - non-stdio transport, or
        //   - headers present
        //
        // toolAllowlist: undefined = all tools (omit), [] = no tools, [...] = those tools
        const output = {};
        for (const [name, entry] of Object.entries(config.servers)) {
            const hasSettings = entry.disabled || entry.toolAllowlist !== undefined;
            if (entry.transport === "stdio") {
                if (!hasSettings) {
                    output[name] = entry.command;
                    continue;
                }
                const obj = {
                    command: entry.command,
                };
                if (entry.disabled)
                    obj.disabled = true;
                if (entry.toolAllowlist !== undefined)
                    obj.toolAllowlist = entry.toolAllowlist;
                output[name] = obj;
                continue;
            }
            const obj = {
                transport: entry.transport,
                url: entry.url,
            };
            if (entry.headers)
                obj.headers = entry.headers;
            if (entry.disabled)
                obj.disabled = true;
            if (entry.toolAllowlist !== undefined)
                obj.toolAllowlist = entry.toolAllowlist;
            output[name] = obj;
        }
        await writeFileAtomic(filePath, JSON.stringify({ servers: output }, null, 2), {
            encoding: "utf-8",
            mode: 0o600,
        });
    }
    /**
     * List configured servers.
     *
     * - When no projectPath is provided: returns global servers from <muxHome>/mcp.jsonc
     * - When projectPath is provided: merges global + <projectPath>/.mux/mcp.jsonc (override wins)
     */
    async listServers(projectPath) {
        const globalCfg = await this.getGlobalConfig();
        if (!projectPath) {
            return globalCfg.servers;
        }
        const repoCfg = await this.getRepoOverrideConfig(projectPath);
        // Repo overrides win by server name.
        return {
            ...globalCfg.servers,
            ...repoCfg.servers,
        };
    }
    async addServer(name, input) {
        if (!name.trim()) {
            return Err("Server name is required");
        }
        const transport = input.transport ?? "stdio";
        if (transport === "stdio") {
            if (!input.command?.trim()) {
                return Err("Command is required");
            }
        }
        else {
            if (!input.url?.trim()) {
                return Err("URL is required");
            }
        }
        const cfg = await this.getGlobalConfig();
        const existing = cfg.servers[name];
        const base = {
            disabled: existing?.disabled ?? false,
            toolAllowlist: existing?.toolAllowlist,
        };
        const next = transport === "stdio"
            ? {
                transport: "stdio",
                command: input.command,
                ...base,
            }
            : {
                transport,
                url: input.url,
                headers: input.headers,
                ...base,
            };
        cfg.servers[name] = next;
        try {
            await this.saveGlobalConfig(cfg);
            return Ok(undefined);
        }
        catch (error) {
            log.error("Failed to save MCP server", { name, error });
            return Err(error instanceof Error ? error.message : String(error));
        }
    }
    async setServerEnabled(name, enabled) {
        const cfg = await this.getGlobalConfig();
        const entry = cfg.servers[name];
        if (!entry) {
            return Err(`Server ${name} not found`);
        }
        cfg.servers[name] = { ...entry, disabled: !enabled };
        try {
            await this.saveGlobalConfig(cfg);
            return Ok(undefined);
        }
        catch (error) {
            log.error("Failed to update MCP server enabled state", { name, error });
            return Err(error instanceof Error ? error.message : String(error));
        }
    }
    async removeServer(name) {
        const cfg = await this.getGlobalConfig();
        if (!cfg.servers[name]) {
            return Err(`Server ${name} not found`);
        }
        delete cfg.servers[name];
        try {
            await this.saveGlobalConfig(cfg);
            return Ok(undefined);
        }
        catch (error) {
            log.error("Failed to remove MCP server", { name, error });
            return Err(error instanceof Error ? error.message : String(error));
        }
    }
    async setToolAllowlist(name, toolAllowlist) {
        const cfg = await this.getGlobalConfig();
        const entry = cfg.servers[name];
        if (!entry) {
            return Err(`Server ${name} not found`);
        }
        // [] = no tools allowed, [...tools] = those tools allowed
        cfg.servers[name] = {
            ...entry,
            toolAllowlist,
        };
        try {
            await this.saveGlobalConfig(cfg);
            return Ok(undefined);
        }
        catch (error) {
            log.error("Failed to update MCP server tool allowlist", { name, error });
            return Err(error instanceof Error ? error.message : String(error));
        }
    }
}
//# sourceMappingURL=mcpConfigService.js.map