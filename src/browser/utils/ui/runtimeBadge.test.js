import { describe, it, expect } from "@jest/globals";
import { extractSshHostname } from "./runtimeBadge";
describe("extractSshHostname", () => {
    it("should return null for undefined runtime config", () => {
        expect(extractSshHostname(undefined)).toBeNull();
    });
    it("should return null for local runtime", () => {
        const config = {
            type: "local",
            srcBaseDir: "/home/user/.mux/src",
        };
        expect(extractSshHostname(config)).toBeNull();
    });
    it("should extract hostname from simple host", () => {
        const config = {
            type: "ssh",
            host: "myserver",
            srcBaseDir: "/home/user/.mux/src",
        };
        expect(extractSshHostname(config)).toBe("myserver");
    });
    it("should extract hostname from user@host format", () => {
        const config = {
            type: "ssh",
            host: "user@myserver.example.com",
            srcBaseDir: "/home/user/.mux/src",
        };
        expect(extractSshHostname(config)).toBe("myserver.example.com");
    });
    it("should handle hostname with port in host string", () => {
        const config = {
            type: "ssh",
            host: "myserver:2222",
            srcBaseDir: "/home/user/.mux/src",
        };
        expect(extractSshHostname(config)).toBe("myserver");
    });
    it("should handle user@host:port format", () => {
        const config = {
            type: "ssh",
            host: "user@myserver.example.com:2222",
            srcBaseDir: "/home/user/.mux/src",
        };
        expect(extractSshHostname(config)).toBe("myserver.example.com");
    });
    it("should handle SSH config alias", () => {
        const config = {
            type: "ssh",
            host: "my-server-alias",
            srcBaseDir: "/home/user/.mux/src",
        };
        expect(extractSshHostname(config)).toBe("my-server-alias");
    });
});
//# sourceMappingURL=runtimeBadge.test.js.map