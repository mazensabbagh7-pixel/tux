import { z } from "zod";
/**
 * Generic Result schema for success/failure discriminated unions
 */
export const ResultSchema = (dataSchema, errorSchema = z.string()) => z.discriminatedUnion("success", [
    z.object({ success: z.literal(true), data: dataSchema }),
    z.object({ success: z.literal(false), error: errorSchema }),
]);
//# sourceMappingURL=result.js.map