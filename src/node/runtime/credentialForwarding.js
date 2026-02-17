import { existsSync } from "fs";
import * as fsPromises from "fs/promises";
import * as os from "os";
import * as path from "path";
export function resolveSshAgentForwarding(targetSocketPath) {
    const hostSocketPath = process.platform === "darwin" ? "/run/host-services/ssh-auth.sock" : process.env.SSH_AUTH_SOCK;
    if (!hostSocketPath || !existsSync(hostSocketPath)) {
        return null;
    }
    return { hostSocketPath, targetSocketPath };
}
export function resolveGhToken(env) {
    return env?.GH_TOKEN ?? process.env.GH_TOKEN ?? null;
}
export function getHostGitconfigPath() {
    return path.join(os.homedir(), ".gitconfig");
}
export function hasHostGitconfig() {
    return existsSync(getHostGitconfigPath());
}
export async function readHostGitconfig() {
    const gitconfigPath = getHostGitconfigPath();
    if (!existsSync(gitconfigPath)) {
        return null;
    }
    return fsPromises.readFile(gitconfigPath);
}
//# sourceMappingURL=credentialForwarding.js.map