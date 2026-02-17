/**
 * Signing Service
 *
 * Provides message signing for mux.md shares.
 *
 * - Loads unencrypted key files from disk via sshpk
 * - Can sign via SSH agent (SSH_AUTH_SOCK), including 1Password's SSH agent
 * - Produces mux.md-compatible SignatureEnvelopes (no private key bytes cross IPC)
 * - Detects GitHub username via `gh auth status`
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { computeFingerprint, createSignatureEnvelope, parsePublicKey, } from "@coder/mux-md-client";
import sshpk from "sshpk";
import { OpenSSHAgent } from "ssh2";
import { getMuxHome } from "@/common/constants/paths";
import { execAsync } from "@/node/utils/disposableExec";
import { log } from "@/node/services/log";
const SUPPORTED_AGENT_KEY_TYPES = new Set([
    "ssh-ed25519",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
]);
/**
 * Probe whether the @coder/mux-md-client/ssh-agent subpath is importable.
 * Caches the result so we only pay the cost once. If the module is missing
 * (e.g. bun resolved to a version without the export), ssh-agent signing is
 * silently unavailable and the service falls back to disk keys.
 */
let sshAgentModuleAvailable = null;
async function isSshAgentModuleAvailable() {
    if (sshAgentModuleAvailable != null)
        return sshAgentModuleAvailable;
    try {
        // eslint-disable-next-line no-restricted-syntax -- startup resilience probe
        await import("@coder/mux-md-client/ssh-agent");
        sshAgentModuleAvailable = true;
    }
    catch {
        log.warn("[SigningService] @coder/mux-md-client/ssh-agent is not available — ssh-agent signing disabled. " +
            "This usually means the package resolved to a version missing the export.");
        sshAgentModuleAvailable = false;
    }
    return sshAgentModuleAvailable;
}
const AGENT_KEY_TYPE_PRIORITY = {
    ed25519: 0,
    "ecdsa-p256": 1,
    "ecdsa-p384": 2,
    "ecdsa-p521": 3,
};
/** Default paths to check for signing keys, in order of preference */
export function getDefaultKeyPaths() {
    return [
        join(getMuxHome(), "message_signing_key"), // Explicit mux key (any supported type, symlink-friendly)
        join(homedir(), ".ssh", "id_ed25519"), // SSH Ed25519
        join(homedir(), ".ssh", "id_ecdsa"), // SSH ECDSA
    ];
}
function normalizeOpenSshPublicKey(publicKey) {
    const parts = publicKey.trim().split(/\s+/);
    if (parts.length < 2)
        return null;
    return `${parts[0]} ${parts[1]}`;
}
/**
 * Service for message signing (Ed25519 or ECDSA).
 * Loads keys from disk or uses an SSH agent if available.
 */
export class SigningService {
    constructor(keyPaths) {
        this.signingKey = null;
        this.keyLoadAttempted = false;
        this.keyLoadPromise = null;
        this.keyLoadError = null;
        this.hasEncryptedKey = false;
        this.identityCache = null;
        this.identityPromise = null;
        this.keyPaths = keyPaths ?? getDefaultKeyPaths();
        assert(this.keyPaths.length > 0, "SigningService: keyPaths must be non-empty");
    }
    static isParsedKey(value) {
        return (typeof value === "object" &&
            value !== null &&
            "type" in value &&
            typeof value.getPublicSSH === "function");
    }
    static unwrapSshAgentIdentity(identity) {
        if (SigningService.isParsedKey(identity))
            return identity;
        const pubKey = identity.pubKey;
        if (SigningService.isParsedKey(pubKey))
            return pubKey;
        if (typeof pubKey === "object" && pubKey !== null && "pubKey" in pubKey) {
            const inner = pubKey.pubKey;
            if (SigningService.isParsedKey(inner))
                return inner;
        }
        return null;
    }
    static isSupportedDiskKeyType(type) {
        return type === "ed25519" || type === "ecdsa";
    }
    /**
     * Load a signing keypair from disk using sshpk.
     * Supports Ed25519 and ECDSA keys in PEM or OpenSSH format.
     */
    tryLoadDiskKeyPair(keyPaths) {
        for (const keyPath of keyPaths) {
            if (!existsSync(keyPath))
                continue;
            try {
                log.info("[SigningService] Attempting to load key from:", keyPath);
                const keyData = readFileSync(keyPath, "utf-8");
                // Parse with sshpk (auto-detects format)
                const privateKey = sshpk.parsePrivateKey(keyData, "auto", { filename: keyPath });
                // Verify it's a supported key type
                if (!SigningService.isSupportedDiskKeyType(privateKey.type)) {
                    log.info("[SigningService] Key at", keyPath, "is", privateKey.type, "- not supported (need ed25519 or ecdsa), skipping");
                    continue;
                }
                // Get public key in OpenSSH format
                const publicKeyOpenSSH = privateKey.toPublic().toString("ssh");
                // Extract raw private key bytes for use with mux-md-client signing
                const privateKeyBytes = this.extractPrivateKeyBytes(privateKey);
                const keyPair = { privateKey, privateKeyBytes, publicKeyOpenSSH };
                log.info("[SigningService] Loaded", privateKey.type, "key from:", keyPath);
                log.info("[SigningService] Public key:", publicKeyOpenSSH.slice(0, 50) + "...");
                return keyPair;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                // Check for encrypted key
                if (message.includes("encrypted") || message.includes("passphrase")) {
                    log.info("[SigningService] Encrypted key at", keyPath, "- skipping (passphrase required)");
                    this.hasEncryptedKey = true;
                    continue;
                }
                log.warn("[SigningService] Failed to load key from", keyPath + ":", message);
            }
        }
        return null;
    }
    async listSshAgentKeyCandidates(sshAuthSock) {
        assert(sshAuthSock.trim().length > 0, "listSshAgentKeyCandidates: sshAuthSock must be non-empty");
        const agent = new OpenSSHAgent(sshAuthSock);
        const identities = await new Promise((resolve, reject) => {
            agent.getIdentities((err, keys) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(keys ?? []);
            });
        });
        const candidates = [];
        for (const identity of identities) {
            const parsedIdentity = SigningService.unwrapSshAgentIdentity(identity);
            if (!parsedIdentity)
                continue;
            if (!SUPPORTED_AGENT_KEY_TYPES.has(parsedIdentity.type))
                continue;
            // OpenSSH public key format: "<type> <base64(blob)> [comment]"
            const publicKeyOpenSSH = `${parsedIdentity.type} ${parsedIdentity
                .getPublicSSH()
                .toString("base64")}`;
            try {
                const parsed = parsePublicKey(publicKeyOpenSSH);
                const fingerprint = await computeFingerprint(parsed.keyBytes);
                candidates.push({
                    publicKeyOpenSSH,
                    fingerprint,
                    muxKeyType: parsed.type,
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.debug("[SigningService] Skipping unsupported SSH agent key:", message);
            }
        }
        return candidates;
    }
    pickPreferredAgentKey(candidates) {
        let best = null;
        for (const candidate of candidates) {
            if (!best) {
                best = candidate;
                continue;
            }
            if (AGENT_KEY_TYPE_PRIORITY[candidate.muxKeyType] < AGENT_KEY_TYPE_PRIORITY[best.muxKeyType]) {
                best = candidate;
            }
        }
        return best;
    }
    async trySelectSshAgentKey() {
        const desiredPublicKeyRaw = process.env.MUX_SIGNING_PUBLIC_KEY?.trim();
        const desiredFingerprint = process.env.MUX_SIGNING_KEY_FINGERPRINT?.trim();
        const hasOverride = Boolean(desiredPublicKeyRaw?.length) || Boolean(desiredFingerprint?.length);
        // If the ssh-agent module isn't available, skip agent key selection entirely
        // so the service falls back to disk keys. But if the caller explicitly requested
        // a specific key via env overrides, report an error — silently signing with a
        // different disk key would produce signatures that fail verification.
        if (!(await isSshAgentModuleAvailable())) {
            if (hasOverride) {
                return {
                    selection: null,
                    error: "SSH agent signing module is unavailable (possible dependency resolution issue). " +
                        "Cannot honor MUX_SIGNING_PUBLIC_KEY/MUX_SIGNING_KEY_FINGERPRINT — try updating mux.",
                };
            }
            return { selection: null, error: null };
        }
        const sshAuthSock = process.env.SSH_AUTH_SOCK?.trim();
        if (!sshAuthSock) {
            if (hasOverride) {
                return {
                    selection: null,
                    error: "MUX_SIGNING_PUBLIC_KEY/MUX_SIGNING_KEY_FINGERPRINT is set but SSH_AUTH_SOCK is not set",
                };
            }
            return { selection: null, error: null };
        }
        let candidates;
        try {
            candidates = await this.listSshAgentKeyCandidates(sshAuthSock);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.info("[SigningService] Failed to query SSH agent:", message);
            if (hasOverride) {
                return {
                    selection: null,
                    error: `Failed to query SSH agent (SSH_AUTH_SOCK=${sshAuthSock})`,
                };
            }
            return { selection: null, error: null };
        }
        if (candidates.length === 0) {
            if (hasOverride) {
                return { selection: null, error: `No supported signing keys found in SSH agent` };
            }
            return { selection: null, error: null };
        }
        // Apply optional selection constraints for agent-backed keys.
        if (hasOverride) {
            let filtered = candidates;
            if (desiredPublicKeyRaw) {
                const normalized = normalizeOpenSshPublicKey(desiredPublicKeyRaw);
                if (!normalized) {
                    return {
                        selection: null,
                        error: "MUX_SIGNING_PUBLIC_KEY must be an OpenSSH public key string (e.g. 'ssh-ed25519 AAAA...')",
                    };
                }
                try {
                    parsePublicKey(normalized);
                }
                catch {
                    return {
                        selection: null,
                        error: "MUX_SIGNING_PUBLIC_KEY is not a supported SSH public key",
                    };
                }
                filtered = filtered.filter((c) => c.publicKeyOpenSSH === normalized);
            }
            if (desiredFingerprint) {
                filtered = filtered.filter((c) => c.fingerprint === desiredFingerprint);
            }
            if (filtered.length === 0) {
                return {
                    selection: null,
                    error: "No SSH agent key matched MUX_SIGNING_PUBLIC_KEY/MUX_SIGNING_KEY_FINGERPRINT (check your SSH agent)",
                };
            }
            const chosen = filtered[0];
            return {
                selection: {
                    kind: "ssh-agent",
                    sshAuthSock,
                    publicKeyOpenSSH: chosen.publicKeyOpenSSH,
                    fingerprint: chosen.fingerprint,
                },
                error: null,
            };
        }
        // Otherwise, pick a reasonable default.
        const chosen = this.pickPreferredAgentKey(candidates);
        if (!chosen) {
            return { selection: null, error: null };
        }
        return {
            selection: {
                kind: "ssh-agent",
                sshAuthSock,
                publicKeyOpenSSH: chosen.publicKeyOpenSSH,
                fingerprint: chosen.fingerprint,
            },
            error: null,
        };
    }
    async loadSigningKey() {
        if (this.keyLoadAttempted)
            return this.signingKey;
        if (this.keyLoadPromise)
            return this.keyLoadPromise;
        this.keyLoadPromise = (async () => {
            try {
                const loaded = await this.doLoadSigningKey();
                this.signingKey = loaded;
                return loaded;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.warn("[SigningService] Unexpected key load error:", message);
                this.signingKey = null;
                this.keyLoadError = "Failed to load signing key";
                return null;
            }
            finally {
                this.keyLoadAttempted = true;
                this.keyLoadPromise = null;
            }
        })();
        return this.keyLoadPromise;
    }
    async doLoadSigningKey() {
        this.keyLoadError = null;
        this.hasEncryptedKey = false;
        // 1) Explicit disk key always wins.
        const explicitPath = this.keyPaths[0];
        if (explicitPath) {
            const explicitDisk = this.tryLoadDiskKeyPair([explicitPath]);
            if (explicitDisk) {
                return { kind: "disk", keyPair: explicitDisk };
            }
        }
        // 2) Prefer SSH-agent keys over default ~/.ssh/id_* keys.
        const agentResult = await this.trySelectSshAgentKey();
        if (agentResult.error) {
            this.keyLoadError = agentResult.error;
            return null;
        }
        if (agentResult.selection) {
            return agentResult.selection;
        }
        // 3) Fall back to disk defaults.
        const fallbackDisk = this.tryLoadDiskKeyPair(this.keyPaths.slice(1));
        if (fallbackDisk) {
            return { kind: "disk", keyPair: fallbackDisk };
        }
        // Set appropriate error based on what we found.
        if (this.hasEncryptedKey) {
            this.keyLoadError =
                "Signing key requires a passphrase. Encrypted key files are skipped unless loaded in your SSH agent (SSH_AUTH_SOCK).";
        }
        else {
            this.keyLoadError =
                "No signing key found. Create ~/.mux/message_signing_key or ensure your SSH agent is running (SSH_AUTH_SOCK).";
        }
        log.info("[SigningService]", this.keyLoadError);
        return null;
    }
    /**
     * Extract raw private key bytes from sshpk key for use with mux-md-client.
     */
    extractPrivateKeyBytes(privateKey) {
        // sshpk stores keys with a 'part' object lookup by key component name
        // For Ed25519: part.k contains the 32-byte seed (private key)
        // For ECDSA: part.d contains the private scalar
        // The types are incomplete, so we use type assertions
        const parts = privateKey.part;
        if (privateKey.type === "ed25519") {
            const kPart = parts.k;
            if (!kPart)
                throw new Error("Ed25519 key missing 'k' component");
            return new Uint8Array(kPart.data);
        }
        else if (privateKey.type === "ecdsa") {
            const dPart = parts.d;
            if (!dPart)
                throw new Error("ECDSA key missing 'd' component");
            // sshpk may pad with leading zero byte for ASN.1 encoding; strip it
            let data = dPart.data;
            if (data[0] === 0 && data.length > 32) {
                data = data.subarray(1);
            }
            return new Uint8Array(data);
        }
        throw new Error(`Unsupported key type: ${privateKey.type}`);
    }
    /**
     * Detect identity: GitHub username via `gh auth status`.
     * Result is cached after first call.
     */
    async detectIdentity() {
        if (this.identityCache)
            return this.identityCache;
        if (this.identityPromise)
            return this.identityPromise;
        this.identityPromise = this.doDetectIdentity();
        this.identityCache = await this.identityPromise;
        this.identityPromise = null;
        return this.identityCache;
    }
    async doDetectIdentity() {
        let githubUser = null;
        let error = null;
        // Detect GitHub username via CLI
        try {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const proc = __addDisposableResource(env_1, execAsync("gh auth status 2>&1"), false);
                const { stdout } = await proc.result;
                const accountMatch = /account\s+(\S+)/i.exec(stdout);
                if (accountMatch) {
                    githubUser = accountMatch[1];
                    log.info("[SigningService] Detected GitHub user:", githubUser);
                }
                else if (stdout.includes("Logged in")) {
                    log.warn("[SigningService] gh auth status indicates logged in but couldn't parse username");
                    error = "Could not parse GitHub username from gh auth status";
                }
                else {
                    error = "Not logged in to GitHub CLI (run: gh auth login)";
                }
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("command not found") || message.includes("ENOENT")) {
                log.info("[SigningService] gh CLI not installed");
                error = "GitHub CLI not installed (brew install gh)";
            }
            else {
                log.info("[SigningService] gh auth status failed:", message);
                error = "GitHub CLI error";
            }
        }
        return { githubUser, error };
    }
    /**
     * Get signing capabilities - public key and identity info.
     */
    async getCapabilities() {
        const signingKey = await this.loadSigningKey();
        if (!signingKey) {
            return {
                publicKey: null,
                githubUser: null,
                error: this.keyLoadError
                    ? { message: this.keyLoadError, hasEncryptedKey: this.hasEncryptedKey }
                    : null,
            };
        }
        const identity = await this.detectIdentity();
        const publicKey = signingKey.kind === "disk"
            ? signingKey.keyPair.publicKeyOpenSSH
            : signingKey.publicKeyOpenSSH;
        return {
            publicKey,
            githubUser: identity.githubUser,
            error: identity.error ? { message: identity.error, hasEncryptedKey: false } : null,
        };
    }
    /**
     * Sign a mux.md share payload.
     *
     * Returns a mux.md SignatureEnvelope that can be embedded during upload.
     *
     * @throws Error if no signing key is available.
     */
    async signMessage(content) {
        assert(typeof content === "string", "signMessage: content must be a string");
        const signingKey = await this.loadSigningKey();
        if (!signingKey) {
            throw new Error(this.keyLoadError ?? "No signing key available");
        }
        const identity = await this.detectIdentity();
        const githubUser = identity.githubUser ?? undefined;
        const bytes = new TextEncoder().encode(content);
        if (signingKey.kind === "disk") {
            const envelope = await createSignatureEnvelope(bytes, signingKey.keyPair.privateKeyBytes, signingKey.keyPair.publicKeyOpenSSH, { githubUser });
            assert(normalizeOpenSshPublicKey(envelope.publicKey) ===
                normalizeOpenSshPublicKey(signingKey.keyPair.publicKeyOpenSSH), "signMessage: disk signature returned unexpected public key");
            return envelope;
        }
        // eslint-disable-next-line no-restricted-syntax -- not circular-dep hiding; startup resilience
        const sshAgentModule = await import("@coder/mux-md-client/ssh-agent").catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            log.error("[SigningService] Failed to load ssh-agent signing module:", message);
            throw new Error("SSH agent signing is unavailable — the @coder/mux-md-client/ssh-agent module failed to load. " +
                "Try updating mux or falling back to disk key signing.");
        });
        const envelope = await sshAgentModule.createSshAgentSignatureEnvelope(bytes, {
            sshAuthSock: signingKey.sshAuthSock,
            publicKey: signingKey.publicKeyOpenSSH,
            fingerprint: signingKey.fingerprint,
            githubUser,
        });
        assert(normalizeOpenSshPublicKey(envelope.publicKey) ===
            normalizeOpenSshPublicKey(signingKey.publicKeyOpenSSH), "signMessage: ssh-agent signature returned unexpected public key");
        return envelope;
    }
    /**
     * Clear all cached state including key and identity.
     * Allows re-detection after user creates a key or logs in.
     */
    clearIdentityCache() {
        this.signingKey = null;
        this.keyLoadAttempted = false;
        this.keyLoadPromise = null;
        this.keyLoadError = null;
        this.hasEncryptedKey = false;
        this.identityCache = null;
        this.identityPromise = null;
        log.info("[SigningService] Cleared key and identity cache");
    }
}
// Singleton instance
let signingService = null;
export function getSigningService() {
    signingService ?? (signingService = new SigningService());
    return signingService;
}
//# sourceMappingURL=signingService.js.map