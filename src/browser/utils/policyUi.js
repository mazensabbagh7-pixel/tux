import { SUPPORTED_PROVIDERS } from "@/common/constants/providers";
import { RUNTIME_MODE } from "@/common/types/runtime";
/**
 * Parse a model string into provider and modelId.
 * Returns null if the string doesn't match the expected "provider:modelId" format.
 */
export function parseModelString(modelString) {
    const colonIndex = modelString.indexOf(":");
    if (colonIndex <= 0 || colonIndex === modelString.length - 1) {
        return null;
    }
    return {
        provider: modelString.slice(0, colonIndex),
        modelId: modelString.slice(colonIndex + 1),
    };
}
/**
 * Check if a model is allowed by the effective policy.
 * Returns true if no policy is set, or if the model's provider is in the allowlist
 * and either no model restrictions exist or the model is in the allowed list.
 */
export function isModelAllowedByPolicy(policy, modelString) {
    const providerAccess = policy?.providerAccess;
    if (providerAccess == null) {
        return true;
    }
    const parsed = parseModelString(modelString);
    if (!parsed) {
        return true;
    }
    const providerPolicy = providerAccess.find((p) => p.id === parsed.provider);
    if (!providerPolicy) {
        return false;
    }
    const allowedModels = providerPolicy.allowedModels ?? null;
    if (allowedModels === null) {
        return true;
    }
    return allowedModels.includes(parsed.modelId);
}
export function getAllowedProvidersForUi(policy) {
    const access = policy?.providerAccess;
    if (access == null) {
        return [...SUPPORTED_PROVIDERS];
    }
    const allowed = new Set(access.map((p) => p.id));
    return SUPPORTED_PROVIDERS.filter((p) => allowed.has(p));
}
export function getPolicyRuntimeIdFromParsedRuntime(runtime) {
    if (runtime.mode === RUNTIME_MODE.SSH) {
        return runtime.coder ? "ssh+coder" : "ssh";
    }
    return runtime.mode;
}
export function isParsedRuntimeAllowedByPolicy(policy, runtime) {
    const allowedRuntimes = policy?.runtimes;
    if (allowedRuntimes == null) {
        return true;
    }
    return allowedRuntimes.includes(getPolicyRuntimeIdFromParsedRuntime(runtime));
}
export function getAllowedRuntimeModesForUi(policy) {
    const allowedRuntimes = policy?.runtimes;
    if (allowedRuntimes == null) {
        return { allowedModes: null, allowSshHost: true, allowSshCoder: true };
    }
    const allowSshHost = allowedRuntimes.includes("ssh");
    const allowSshCoder = allowedRuntimes.includes("ssh+coder");
    const allowedModes = [];
    if (allowedRuntimes.includes("local")) {
        allowedModes.push(RUNTIME_MODE.LOCAL);
    }
    if (allowedRuntimes.includes("worktree")) {
        allowedModes.push(RUNTIME_MODE.WORKTREE);
    }
    if (allowSshHost || allowSshCoder) {
        allowedModes.push(RUNTIME_MODE.SSH);
    }
    if (allowedRuntimes.includes("docker")) {
        allowedModes.push(RUNTIME_MODE.DOCKER);
    }
    if (allowedRuntimes.includes("devcontainer")) {
        allowedModes.push(RUNTIME_MODE.DEVCONTAINER);
    }
    return { allowedModes, allowSshHost, allowSshCoder };
}
//# sourceMappingURL=policyUi.js.map