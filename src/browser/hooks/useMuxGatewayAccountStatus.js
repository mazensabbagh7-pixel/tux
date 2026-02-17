import { useCallback, useState } from "react";
import { useAPI } from "@/browser/contexts/API";
import { updatePersistedState } from "@/browser/hooks/usePersistedState";
import { CUSTOM_EVENTS, createCustomEvent } from "@/common/constants/events";
import { GATEWAY_CONFIGURED_KEY } from "@/common/constants/storage";
import { MUX_GATEWAY_SESSION_EXPIRED_MESSAGE } from "@/common/constants/muxGatewayOAuth";
import { formatCostWithDollar } from "@/common/utils/tokens/usageAggregator";
export function formatMuxGatewayBalance(remainingMicrodollars) {
    if (remainingMicrodollars === null || remainingMicrodollars === undefined) {
        return "—";
    }
    return formatCostWithDollar(remainingMicrodollars / 1000000);
}
export function useMuxGatewayAccountStatus() {
    const { api } = useAPI();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const refresh = useCallback(async () => {
        if (!api) {
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const result = await api.muxGateway.getAccountStatus();
            if (result.success) {
                setData(result.data);
                return;
            }
            if (result.error === MUX_GATEWAY_SESSION_EXPIRED_MESSAGE) {
                updatePersistedState(GATEWAY_CONFIGURED_KEY, false);
                window.dispatchEvent(createCustomEvent(CUSTOM_EVENTS.MUX_GATEWAY_SESSION_EXPIRED));
                setData(null);
                setError(null);
                return;
            }
            setError(result.error);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        }
        finally {
            setIsLoading(false);
        }
    }, [api]);
    return { data, error, isLoading, refresh };
}
//# sourceMappingURL=useMuxGatewayAccountStatus.js.map