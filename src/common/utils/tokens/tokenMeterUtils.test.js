import { describe, expect, test } from "bun:test";
import { formatTokens } from "./tokenMeterUtils";
describe("formatTokens", () => {
    test("formats small numbers as-is with locale formatting", () => {
        expect(formatTokens(0)).toBe("0");
        expect(formatTokens(500)).toBe("500");
        expect(formatTokens(999)).toBe("999");
    });
    test("formats thousands with k suffix", () => {
        expect(formatTokens(1000)).toBe("1.0k");
        expect(formatTokens(1500)).toBe("1.5k");
        expect(formatTokens(58507)).toBe("58.5k");
        expect(formatTokens(999999)).toBe("1000.0k");
    });
    test("formats millions with M suffix", () => {
        expect(formatTokens(1000000)).toBe("1.0M");
        expect(formatTokens(1500000)).toBe("1.5M");
        expect(formatTokens(58507900)).toBe("58.5M");
        expect(formatTokens(4133000)).toBe("4.1M");
    });
});
//# sourceMappingURL=tokenMeterUtils.test.js.map