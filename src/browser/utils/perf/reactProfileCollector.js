const MAX_REACT_PROFILE_SAMPLES = 20000;
const fallbackStore = {
    samples: [],
    droppedSampleCount: 0,
};
function getReactProfileStore() {
    if (typeof window === "undefined") {
        return fallbackStore;
    }
    window.__muxReactProfileStore__ ?? (window.__muxReactProfileStore__ = {
        samples: [],
        droppedSampleCount: 0,
    });
    return window.__muxReactProfileStore__;
}
export function isReactProfileCollectionEnabled() {
    return typeof window !== "undefined" && window.api?.enableReactPerfProfile === true;
}
function summarizeSamples(samples) {
    const byProfilerId = {};
    let totalActualDuration = 0;
    for (const sample of samples) {
        totalActualDuration += sample.actualDuration;
        const existing = byProfilerId[sample.id];
        if (existing) {
            existing.sampleCount += 1;
            existing.totalActualDuration += sample.actualDuration;
            existing.maxActualDuration = Math.max(existing.maxActualDuration, sample.actualDuration);
            existing.phases[sample.phase] = (existing.phases[sample.phase] ?? 0) + 1;
            continue;
        }
        byProfilerId[sample.id] = {
            sampleCount: 1,
            totalActualDuration: sample.actualDuration,
            maxActualDuration: sample.actualDuration,
            phases: {
                [sample.phase]: 1,
            },
        };
    }
    return { totalActualDuration, byProfilerId };
}
export function getReactProfileSnapshot() {
    const store = getReactProfileStore();
    const samples = store.samples.slice();
    const summary = summarizeSamples(samples);
    return {
        enabled: isReactProfileCollectionEnabled(),
        sampleCount: samples.length,
        droppedSampleCount: store.droppedSampleCount,
        totalActualDuration: summary.totalActualDuration,
        capturedAt: new Date().toISOString(),
        byProfilerId: summary.byProfilerId,
        samples,
    };
}
export function resetReactProfileSamples() {
    const store = getReactProfileStore();
    store.samples = [];
    store.droppedSampleCount = 0;
}
function appendReactSample(sample) {
    if (!isReactProfileCollectionEnabled()) {
        return;
    }
    const store = getReactProfileStore();
    if (store.samples.length >= MAX_REACT_PROFILE_SAMPLES) {
        store.droppedSampleCount += 1;
        return;
    }
    store.samples.push({
        ...sample,
        interactionCount: sample.interactionCount ?? 0,
        recordedAt: Date.now(),
    });
}
export function recordSyntheticReactRenderSample(sample) {
    appendReactSample(sample);
}
function ensureReactProfilerPageApi() {
    if (typeof window === "undefined") {
        return;
    }
    if (window.__muxReactProfiler) {
        return;
    }
    window.__muxReactProfiler = {
        reset: () => {
            resetReactProfileSamples();
        },
        snapshot: () => getReactProfileSnapshot(),
    };
}
ensureReactProfilerPageApi();
//# sourceMappingURL=reactProfileCollector.js.map