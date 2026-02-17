/**
 * SSH config parsing utilities (ssh-config wrapper).
 */
import { spawnSync } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import SSHConfig, { glob } from "ssh-config";
import { log } from "@/node/services/log";
const DEFAULT_SSH_PORT = 22;
function getHomeDir() {
    return process.env.USERPROFILE ?? os.homedir();
}
function getDefaultUsername() {
    try {
        return os.userInfo().username;
    }
    catch {
        return process.env.USER ?? process.env.USERNAME ?? "";
    }
}
function expandHomePath(value, homeDir) {
    if (value === "~") {
        return homeDir;
    }
    if (value.startsWith("~/") || value.startsWith("~\\")) {
        return path.join(homeDir, value.slice(2));
    }
    return value;
}
function normalizeIdentityFile(value, homeDir) {
    const expanded = expandHomePath(value, homeDir);
    if (path.isAbsolute(expanded)) {
        return expanded;
    }
    return path.join(homeDir, expanded);
}
function parseHostAndUser(host) {
    const trimmed = host.trim();
    const atIndex = trimmed.lastIndexOf("@");
    if (atIndex > 0) {
        const user = trimmed.slice(0, atIndex).trim();
        const hostname = trimmed.slice(atIndex + 1).trim();
        if (user && hostname) {
            return { host: hostname, user };
        }
    }
    return { host: trimmed };
}
function isParsedValueToken(value) {
    return typeof value === "object" && value !== null && "val" in value && "separator" in value;
}
function tokensToString(tokens) {
    return tokens
        .map(({ val, separator, quoted }) => {
        const rendered = quoted ? `"${val}"` : val;
        return `${separator}${rendered}`;
    })
        .join("")
        .trimStart();
}
function getConfigValue(config, key) {
    const match = Object.entries(config).find(([configKey]) => configKey.toLowerCase() === key.toLowerCase());
    return match?.[1];
}
function toStringValue(value) {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        const first = value[0];
        if (typeof first === "string") {
            return first;
        }
        if (isParsedValueToken(first)) {
            return tokensToString(value);
        }
    }
    return undefined;
}
function getCriteriaValue(criteria, key) {
    const match = Object.entries(criteria).find(([criteriaKey]) => criteriaKey.toLowerCase() === key.toLowerCase());
    return match?.[1];
}
function criteriaToString(value) {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return value[0]?.val;
    }
    return undefined;
}
function criteriaToStringArray(value) {
    if (typeof value === "string") {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.map(({ val }) => val);
    }
    return [];
}
function expandMatchExecTokens(command, hostName, user) {
    return command.replace(/%(%|h|r)/g, (_match, token) => {
        switch (token) {
            case "%":
                return "%";
            case "h":
                return hostName;
            case "r":
                return user ?? "";
            default:
                return _match;
        }
    });
}
/**
 * Handle `Match host ... !exec ...` blocks that ssh-config doesn't evaluate.
 *
 * Limitation: Only applies ProxyCommand from matching Match blocks. Other directives
 * like User, Port, IdentityFile in the same block are ignored. This is sufficient for
 * Coder configs which only set ProxyCommand in Match blocks.
 */
function applyNegatedExecMatch(config, hostName, user, computed) {
    if (getConfigValue(computed, "ProxyCommand")) {
        return;
    }
    for (const line of config) {
        if (line.type !== SSHConfig.DIRECTIVE || line.param !== "Match") {
            continue;
        }
        if (!("criteria" in line)) {
            continue;
        }
        const criteria = line.criteria;
        const hostCriterion = getCriteriaValue(criteria, "host");
        const negatedExec = getCriteriaValue(criteria, "!exec");
        if (!hostCriterion || !negatedExec) {
            continue;
        }
        const hostPatterns = criteriaToStringArray(hostCriterion);
        if (!glob(hostPatterns, hostName)) {
            continue;
        }
        const execCommand = criteriaToString(negatedExec);
        if (!execCommand) {
            continue;
        }
        const expandedCommand = expandMatchExecTokens(execCommand, hostName, user);
        const execResult = spawnSync(expandedCommand, { shell: true });
        if (execResult.status === 0) {
            continue;
        }
        const proxyLine = line.config.find((subline) => subline.type === SSHConfig.DIRECTIVE && subline.param.toLowerCase() === "proxycommand");
        if (proxyLine?.type === SSHConfig.DIRECTIVE) {
            computed.ProxyCommand = proxyLine.value;
            return;
        }
    }
}
function toStringArray(value) {
    if (typeof value === "string") {
        return [value];
    }
    if (Array.isArray(value)) {
        const first = value[0];
        if (typeof first === "string") {
            return value;
        }
        if (isParsedValueToken(first)) {
            return [tokensToString(value)];
        }
    }
    return [];
}
async function loadSSHConfig() {
    const homeDir = getHomeDir();
    const configPath = path.join(homeDir, ".ssh", "config");
    try {
        const content = await fs.readFile(configPath, "utf8");
        const parsed = SSHConfig.parse(content);
        return parsed;
    }
    catch (error) {
        if (error?.code !== "ENOENT") {
            log.debug("Failed to read SSH config", {
                configPath,
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return null;
    }
}
export async function resolveSSHConfig(host) {
    const { host: hostAlias, user: userOverride } = parseHostAndUser(host);
    const homeDir = getHomeDir();
    const config = await loadSSHConfig();
    const computed = config
        ? userOverride
            ? config.compute({ Host: hostAlias, User: userOverride })
            : config.compute(hostAlias)
        : {};
    const hostName = toStringValue(getConfigValue(computed, "HostName")) ?? hostAlias;
    const userFromConfig = toStringValue(getConfigValue(computed, "User"));
    if (config) {
        // Default to local username for %r expansion if no User is specified
        const matchExecUser = userOverride ?? userFromConfig ?? getDefaultUsername();
        applyNegatedExecMatch(config, hostName, matchExecUser, computed);
    }
    const portValue = toStringValue(getConfigValue(computed, "Port"));
    const identityValues = toStringArray(getConfigValue(computed, "IdentityFile"));
    const proxyCommandRaw = toStringValue(getConfigValue(computed, "ProxyCommand"));
    const port = portValue ? Number.parseInt(portValue, 10) : DEFAULT_SSH_PORT;
    const identityFiles = identityValues.map((value) => normalizeIdentityFile(value, homeDir));
    const proxyCommand = proxyCommandRaw && proxyCommandRaw.toLowerCase() !== "none"
        ? proxyCommandRaw.trim()
        : undefined;
    return {
        host: hostAlias,
        hostName,
        user: userOverride ?? userFromConfig,
        port: Number.isFinite(port) ? port : DEFAULT_SSH_PORT,
        identityFiles,
        proxyCommand,
    };
}
//# sourceMappingURL=sshConfigParser.js.map