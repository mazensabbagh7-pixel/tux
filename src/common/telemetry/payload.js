/**
 * Telemetry Payload Definitions
 *
 * This file defines all data structures sent to PostHog for user transparency.
 * Users can inspect this file to understand exactly what telemetry data is collected.
 *
 * PRIVACY GUIDELINES:
 * - Randomly generated IDs (e.g., workspace IDs, session IDs) can be sent verbatim
 *   as they contain no user information and are not guessable.
 * - Display names, project names, file paths, or anything that could reveal the
 *   nature of the user's work MUST NOT be sent, even if hashed.
 *   Hashing is vulnerable to rainbow table attacks and brute-force, especially
 *   for common project names or predictable patterns.
 * - For numerical metrics that could leak information (like message lengths), use
 *   base-2 rounding (e.g., 128, 256, 512) to preserve privacy while enabling analysis.
 * - When in doubt, don't send it. Privacy is paramount.
 *
 * NOTE: Base properties (version, backend_platform, electronVersion, nodeVersion,
 * bunVersion) are automatically added by the backend TelemetryService. Frontend
 * code only needs to provide event-specific properties.
 */
export {};
//# sourceMappingURL=payload.js.map