import { describe, test, expect } from "bun:test";
import { shouldTriggerAutoCompaction } from "./shouldTriggerAutoCompaction";
describe("shouldTriggerAutoCompaction", () => {
    test("returns false when no autoCompactionCheck provided", () => {
        expect(shouldTriggerAutoCompaction(undefined, false, false)).toBe(false);
    });
    test("returns false when already compacting", () => {
        const check = {
            usagePercentage: 80,
            thresholdPercentage: 60,
            shouldShowWarning: true,
            shouldForceCompact: false,
        };
        expect(shouldTriggerAutoCompaction(check, true, false)).toBe(false);
    });
    test("returns false when editing a message", () => {
        const check = {
            usagePercentage: 80,
            thresholdPercentage: 60,
            shouldShowWarning: true,
            shouldForceCompact: false,
        };
        expect(shouldTriggerAutoCompaction(check, false, true)).toBe(false);
    });
    test("returns false when usage below threshold", () => {
        const check = {
            usagePercentage: 50,
            thresholdPercentage: 60,
            shouldShowWarning: false,
            shouldForceCompact: false,
        };
        expect(shouldTriggerAutoCompaction(check, false, false)).toBe(false);
    });
    test("returns true when usage at threshold", () => {
        const check = {
            usagePercentage: 60,
            thresholdPercentage: 60,
            shouldShowWarning: true,
            shouldForceCompact: false,
        };
        expect(shouldTriggerAutoCompaction(check, false, false)).toBe(true);
    });
    test("returns true when usage above threshold", () => {
        const check = {
            usagePercentage: 85,
            thresholdPercentage: 60,
            shouldShowWarning: true,
            shouldForceCompact: false,
        };
        expect(shouldTriggerAutoCompaction(check, false, false)).toBe(true);
    });
    test("returns false when compaction is already queued", () => {
        const check = {
            usagePercentage: 85,
            thresholdPercentage: 60,
            shouldShowWarning: true,
            shouldForceCompact: false,
        };
        // Even when threshold is exceeded, don't trigger if compaction is already queued
        expect(shouldTriggerAutoCompaction(check, false, false, true)).toBe(false);
    });
    test("returns true when no compaction is queued", () => {
        const check = {
            usagePercentage: 85,
            thresholdPercentage: 60,
            shouldShowWarning: true,
            shouldForceCompact: false,
        };
        // Should trigger when hasQueuedCompaction is false
        expect(shouldTriggerAutoCompaction(check, false, false, false)).toBe(true);
        // Should also trigger when hasQueuedCompaction is undefined (backwards compat)
        expect(shouldTriggerAutoCompaction(check, false, false, undefined)).toBe(true);
    });
});
//# sourceMappingURL=shouldTriggerAutoCompaction.test.js.map