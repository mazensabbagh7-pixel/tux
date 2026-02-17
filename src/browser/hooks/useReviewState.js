/**
 * Hook for managing hunk read state
 * Provides interface for tracking which hunks have been reviewed with localStorage persistence
 */
import { useCallback, useMemo, useEffect, useState } from "react";
import { usePersistedState } from "./usePersistedState";
import { getReviewStateKey } from "@/common/constants/storage";
/**
 * Maximum number of read states to keep per workspace (LRU eviction)
 */
const MAX_READ_STATES = 1024;
/**
 * Evict oldest read states if count exceeds max
 * Keeps the newest MAX_READ_STATES entries
 * Exported for testing
 */
export function evictOldestReviews(readState, maxCount) {
    const entries = Object.entries(readState);
    if (entries.length <= maxCount)
        return readState;
    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    // Keep only the newest maxCount
    return Object.fromEntries(entries.slice(0, maxCount));
}
/**
 * Hook for managing hunk read state for a workspace
 * Persists read states to localStorage with automatic LRU eviction
 */
export function useReviewState(workspaceId) {
    const [reviewState, setReviewState] = usePersistedState(getReviewStateKey(workspaceId), {
        workspaceId,
        readState: {},
        lastUpdated: Date.now(),
    });
    // Apply LRU eviction on initial load
    const [hasAppliedEviction, setHasAppliedEviction] = useState(false);
    useEffect(() => {
        if (!hasAppliedEviction) {
            setHasAppliedEviction(true);
            const evicted = evictOldestReviews(reviewState.readState, MAX_READ_STATES);
            if (Object.keys(evicted).length !== Object.keys(reviewState.readState).length) {
                setReviewState((prev) => ({
                    ...prev,
                    readState: evicted,
                    lastUpdated: Date.now(),
                }));
            }
        }
    }, [hasAppliedEviction, reviewState.readState, setReviewState]);
    /**
     * Check if a hunk is marked as read
     */
    const isRead = useCallback((hunkId) => {
        return reviewState.readState[hunkId]?.isRead ?? false;
    }, [reviewState.readState]);
    /**
     * Mark one or more hunks as read
     * Optimized to only update changed entries
     */
    const markAsRead = useCallback((hunkIds) => {
        const ids = Array.isArray(hunkIds) ? hunkIds : [hunkIds];
        if (ids.length === 0)
            return;
        const timestamp = Date.now();
        setReviewState((prev) => {
            // Check if any IDs actually need updating (not already read)
            const needsUpdate = ids.some((id) => !prev.readState[id]?.isRead);
            if (!needsUpdate)
                return prev; // Early return - no state change
            // Only spread if we're actually changing something
            const newReadState = { ...prev.readState };
            for (const hunkId of ids) {
                newReadState[hunkId] = {
                    hunkId,
                    isRead: true,
                    timestamp,
                };
            }
            return {
                ...prev,
                readState: newReadState,
                lastUpdated: timestamp,
            };
        });
    }, [setReviewState]);
    /**
     * Mark a hunk as unread
     */
    const markAsUnread = useCallback((hunkId) => {
        setReviewState((prev) => {
            // Early return if not currently read
            if (!prev.readState[hunkId])
                return prev;
            const { [hunkId]: _, ...rest } = prev.readState;
            return {
                ...prev,
                readState: rest,
                lastUpdated: Date.now(),
            };
        });
    }, [setReviewState]);
    /**
     * Toggle read state of a hunk
     */
    const toggleRead = useCallback((hunkId) => {
        if (isRead(hunkId)) {
            markAsUnread(hunkId);
        }
        else {
            markAsRead(hunkId);
        }
    }, [isRead, markAsRead, markAsUnread]);
    /**
     * Clear all read states
     */
    const clearAll = useCallback(() => {
        setReviewState((prev) => ({
            ...prev,
            readState: {},
            lastUpdated: Date.now(),
        }));
    }, [setReviewState]);
    /**
     * Calculate number of read hunks
     */
    const readCount = useMemo(() => {
        return Object.values(reviewState.readState).filter((state) => state.isRead).length;
    }, [reviewState.readState]);
    return {
        isRead,
        markAsRead,
        markAsUnread,
        toggleRead,
        clearAll,
        readCount,
    };
}
//# sourceMappingURL=useReviewState.js.map