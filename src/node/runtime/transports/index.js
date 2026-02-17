import { OpenSSHTransport } from "./OpenSSHTransport";
import { SSH2Transport } from "./SSH2Transport";
export { OpenSSHTransport, SSH2Transport };
export function createSSHTransport(config, useSSH2) {
    return useSSH2 ? new SSH2Transport(config) : new OpenSSHTransport(config);
}
//# sourceMappingURL=index.js.map