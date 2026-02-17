import fsPromises from "fs/promises";
import path from "path";
const PERF_ARTIFACTS_ROOT = path.resolve(__dirname, "..", "..", "..", "artifacts", "perf");
const DEFAULT_TRACE_CATEGORIES = [
    "devtools.timeline",
    "blink.user_timing",
    "v8.execute",
    "toplevel",
].join(",");
function sanitizeForPath(value) {
    const compact = value
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-_]/g, "")
        .toLowerCase();
    return compact.length > 0 ? compact : `perf-${Date.now()}`;
}
function decodeProtocolChunk(chunk) {
    if (!chunk.base64Encoded) {
        return chunk.data;
    }
    return Buffer.from(chunk.data, "base64").toString("utf-8");
}
async function readProtocolStream(client, streamHandle) {
    const chunks = [];
    try {
        while (true) {
            const chunk = (await client.send("IO.read", {
                handle: streamHandle,
            }));
            chunks.push(decodeProtocolChunk(chunk));
            if (chunk.eof) {
                break;
            }
        }
    }
    finally {
        await client.send("IO.close", { handle: streamHandle }).catch(() => undefined);
    }
    return chunks.join("");
}
async function stopTracing(client) {
    const tracingComplete = new Promise((resolve, reject) => {
        const onComplete = (event) => {
            client.off("Tracing.tracingComplete", onComplete);
            if (!event.stream) {
                reject(new Error("Tracing completed without a stream handle"));
                return;
            }
            resolve(event.stream);
        };
        client.on("Tracing.tracingComplete", onComplete);
    });
    await client.send("Tracing.end");
    const streamHandle = await tracingComplete;
    const traceJson = await readProtocolStream(client, streamHandle);
    try {
        return JSON.parse(traceJson);
    }
    catch {
        return {
            parseError: "Failed to parse trace JSON",
            rawTrace: traceJson,
        };
    }
}
function toMetricsRecord(metrics) {
    const result = {};
    if (!metrics) {
        return result;
    }
    for (const metric of metrics) {
        result[metric.name] = metric.value;
    }
    return result;
}
async function maybeGetHeapUsage(client) {
    try {
        const usage = (await client.send("Runtime.getHeapUsage"));
        return usage;
    }
    catch {
        return undefined;
    }
}
export async function withChromeProfiles(page, options, action) {
    const client = await page.context().newCDPSession(page);
    const includeHeapUsage = options.includeHeapUsage ?? true;
    const traceCategories = options.traceCategories ?? DEFAULT_TRACE_CATEGORIES;
    await client.send("Performance.enable");
    await client.send("Profiler.enable");
    await client.send("Runtime.enable");
    let heapUsageBefore;
    if (includeHeapUsage) {
        heapUsageBefore = await maybeGetHeapUsage(client);
    }
    await client.send("Profiler.start");
    await client.send("Tracing.start", {
        categories: traceCategories,
        transferMode: "ReturnAsStream",
    });
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    let actionError;
    try {
        await action();
    }
    catch (error) {
        actionError = error;
    }
    const endedAt = new Date().toISOString();
    const wallTimeMs = Date.now() - startTime;
    let metrics = {};
    try {
        const perfMetrics = (await client.send("Performance.getMetrics"));
        metrics = toMetricsRecord(perfMetrics.metrics);
    }
    catch {
        metrics = {};
    }
    let heapUsageAfter;
    if (includeHeapUsage) {
        heapUsageAfter = await maybeGetHeapUsage(client);
    }
    let cpuProfile = null;
    let trace = null;
    try {
        const profileStop = (await client.send("Profiler.stop"));
        cpuProfile = profileStop.profile ?? null;
    }
    finally {
        trace = await stopTracing(client).catch((error) => ({
            error: error instanceof Error ? error.message : String(error),
        }));
        await Promise.allSettled([
            client.send("Performance.disable"),
            client.send("Profiler.disable"),
            client.send("Runtime.disable"),
        ]);
    }
    if (actionError) {
        throw actionError;
    }
    return {
        label: options.label,
        startedAt,
        endedAt,
        wallTimeMs,
        metrics,
        trace,
        cpuProfile,
        heapUsage: includeHeapUsage
            ? {
                before: heapUsageBefore,
                after: heapUsageAfter,
            }
            : undefined,
    };
}
export async function resetReactProfileSamples(page) {
    return page.evaluate(() => {
        const reactProfiler = window.__muxReactProfiler;
        if (!reactProfiler?.reset) {
            return false;
        }
        reactProfiler.reset();
        return true;
    });
}
export async function readReactProfileSnapshot(page) {
    return page.evaluate(() => {
        const reactProfiler = window.__muxReactProfiler;
        return reactProfiler?.snapshot ? reactProfiler.snapshot() : null;
    });
}
async function writeJsonFile(filePath, payload) {
    await fsPromises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}
export async function writePerfArtifacts(args) {
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
    const runDirName = `${sanitizeForPath(args.runLabel)}-${timestamp}`;
    const runDirectory = path.join(PERF_ARTIFACTS_ROOT, sanitizeForPath(args.testInfo.project.name), runDirName);
    await fsPromises.mkdir(runDirectory, { recursive: true });
    const cpuProfilePath = path.join(runDirectory, "chrome-cpu-profile.json");
    const tracePath = path.join(runDirectory, "chrome-trace.json");
    const reactProfilePath = path.join(runDirectory, "react-profile.json");
    const summaryPath = path.join(runDirectory, "perf-summary.json");
    await writeJsonFile(cpuProfilePath, args.chromeProfile.cpuProfile);
    await writeJsonFile(tracePath, args.chromeProfile.trace);
    await writeJsonFile(reactProfilePath, args.reactProfile);
    await writeJsonFile(summaryPath, {
        schemaVersion: 1,
        runLabel: args.runLabel,
        test: {
            title: args.testInfo.title,
            testId: args.testInfo.testId,
            file: args.testInfo.file,
            projectName: args.testInfo.project.name,
            retry: args.testInfo.retry,
        },
        historyProfile: args.historyProfile,
        chromeProfile: {
            label: args.chromeProfile.label,
            startedAt: args.chromeProfile.startedAt,
            endedAt: args.chromeProfile.endedAt,
            wallTimeMs: args.chromeProfile.wallTimeMs,
            metrics: args.chromeProfile.metrics,
            heapUsage: args.chromeProfile.heapUsage,
            files: {
                cpuProfile: path.basename(cpuProfilePath),
                trace: path.basename(tracePath),
                reactProfile: path.basename(reactProfilePath),
            },
        },
    });
    return runDirectory;
}
//# sourceMappingURL=perfProfile.js.map