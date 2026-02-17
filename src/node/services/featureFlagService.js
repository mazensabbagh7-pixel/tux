import { FEATURE_FLAG_KEYS } from "@/common/constants/featureFlags";
const FLAG_CACHE_TTL_MS = 10 * 60 * 1000;
export class FeatureFlagService {
    constructor(config, telemetryService) {
        this.cachedVariant = null;
        this.config = config;
        this.telemetryService = telemetryService;
    }
    getOverride() {
        return this.config.getFeatureFlagOverride(FEATURE_FLAG_KEYS.statsTabV1);
    }
    async getVariant() {
        const now = Date.now();
        if (this.cachedVariant && now - this.cachedVariant.fetchedAt < FLAG_CACHE_TTL_MS) {
            return this.cachedVariant.value;
        }
        const value = await this.telemetryService.getFeatureFlag(FEATURE_FLAG_KEYS.statsTabV1);
        const variant = value === true || value === "stats" ? "stats" : "control";
        this.cachedVariant = { value: variant, fetchedAt: now };
        return variant;
    }
    async getStatsTabState() {
        const override = this.getOverride();
        const variant = await this.getVariant();
        // Stats tab is now default-on. Keep the persisted override as a kill switch.
        //
        // - "off": force disabled
        // - "on" | "default": enabled (default behavior)
        const enabled = override !== "off";
        return { enabled, variant, override };
    }
    async setStatsTabOverride(override) {
        await this.config.setFeatureFlagOverride(FEATURE_FLAG_KEYS.statsTabV1, override);
        return this.getStatsTabState();
    }
}
//# sourceMappingURL=featureFlagService.js.map