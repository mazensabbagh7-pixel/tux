import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clipboard,
  Camera,
  Loader2,
  Monitor,
  MousePointer2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/browser/components/Button/Button";
import { useAPI } from "@/browser/contexts/API";
import { useWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import type { MCPServerInfo, MCPTestResult } from "@/common/types/mcp";
import { getErrorMessage } from "@/common/utils/errors";

interface MCPTestState {
  result: MCPTestResult;
  testedAt: number;
}

type CapabilityId = "screenshot" | "mouse" | "keyboard" | "clipboard" | "status";

const CAPABILITIES: Array<{ id: CapabilityId; label: string; icon: React.ReactNode }> = [
  { id: "screenshot", label: "Screenshots", icon: <Camera className="h-4 w-4" /> },
  { id: "mouse", label: "Mouse control", icon: <MousePointer2 className="h-4 w-4" /> },
  { id: "keyboard", label: "Keyboard input", icon: <Monitor className="h-4 w-4" /> },
  { id: "clipboard", label: "Clipboard", icon: <Clipboard className="h-4 w-4" /> },
  { id: "status", label: "Desktop status", icon: <CheckCircle className="h-4 w-4" /> },
];

function getMcpEndpoint(info: MCPServerInfo): string {
  if (info.transport === "stdio") return info.command;
  return info.url;
}

function isComputerUseServerIdentity(name: string, info: MCPServerInfo): boolean {
  const haystack = `${name} ${getMcpEndpoint(info)}`.toLowerCase();
  return ["desktop", "computer", "desktop-control", "ydotool", "wayland"].some((term) =>
    haystack.includes(term)
  );
}

function hasComputerUseToolset(tools: string[]): boolean {
  const normalizedTools = tools.map((tool) => tool.toLowerCase());
  const hasScreen = normalizedTools.some((tool) => tool.includes("capture_screen") || tool.includes("screenshot"));
  const hasInput = normalizedTools.some(
    (tool) => tool.includes("click_mouse") || tool.includes("type_text") || tool.includes("press_keys")
  );
  const hasDesktopStatus = normalizedTools.some((tool) => tool.includes("desktop_status"));

  return (hasScreen && hasInput) || (hasDesktopStatus && (hasScreen || hasInput));
}

function inferCapabilities(tools: string[]): Set<CapabilityId> {
  const capabilities = new Set<CapabilityId>();
  for (const tool of tools) {
    const lower = tool.toLowerCase();
    if (lower.includes("screen") || lower.includes("screenshot") || lower.includes("capture")) {
      capabilities.add("screenshot");
    }
    if (lower.includes("mouse") || lower.includes("click") || lower.includes("pointer")) {
      capabilities.add("mouse");
    }
    if (lower.includes("key") || lower.includes("type") || lower.includes("keyboard")) {
      capabilities.add("keyboard");
    }
    if (lower.includes("clipboard") || lower.includes("paste") || lower.includes("copy")) {
      capabilities.add("clipboard");
    }
    if (lower.includes("status") || lower.includes("desktop")) {
      capabilities.add("status");
    }
  }
  return capabilities;
}

function formatTestedAt(testedAt: number): string {
  return new Date(testedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusPill(props: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const toneClass =
    props.tone === "ok"
      ? "border-green-500/30 bg-green-500/10 text-green-400"
      : props.tone === "warn"
        ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
        : "border-border-light bg-surface-secondary text-muted";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${toneClass}`}>
      {props.children}
    </span>
  );
}

export function ComputerUseSection() {
  const { api } = useAPI();
  const workspaceContext = useWorkspaceContext();
  const selectedWorkspace = workspaceContext.selectedWorkspace;
  const fallbackWorkspace = useMemo(
    () => Array.from(workspaceContext.workspaceMetadata.values())[0] ?? null,
    [workspaceContext.workspaceMetadata]
  );
  const projectPath = selectedWorkspace?.projectPath ?? fallbackWorkspace?.projectPath ?? null;

  const [servers, setServers] = useState<Record<string, MCPServerInfo>>({});
  const [testResults, setTestResults] = useState<Record<string, MCPTestState>>({});
  const [testingServers, setTestingServers] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverEntries = useMemo(
    () => Object.entries(servers).sort(([a], [b]) => a.localeCompare(b)),
    [servers]
  );

  const candidateEntries = useMemo(
    () =>
      serverEntries.filter(([name, info]) => {
        if (isComputerUseServerIdentity(name, info)) return true;
        const testResult = testResults[name]?.result;
        return testResult?.success ? hasComputerUseToolset(testResult.tools) : false;
      }),
    [serverEntries, testResults]
  );

  const mergedCapabilities = useMemo(() => {
    const capabilities = new Set<CapabilityId>();
    for (const [name] of candidateEntries) {
      const result = testResults[name]?.result;
      if (!result?.success) continue;
      for (const capability of inferCapabilities(result.tools)) {
        capabilities.add(capability);
      }
    }
    return capabilities;
  }, [candidateEntries, testResults]);

  const refresh = React.useCallback(() => {
    if (!api || !projectPath) {
      setServers({});
      setError(projectPath ? null : "Open or select a workspace to inspect computer-use tooling.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    void api.mcp
      .list({ projectPath })
      .then(setServers)
      .catch((err: unknown) => {
        setServers({});
        setError(getErrorMessage(err));
      })
      .finally(() => setLoading(false));
  }, [api, projectPath]);

  const testServer = React.useCallback(
    async (name: string) => {
      if (!api || !projectPath) return;

      setTestingServers((previous) => new Set(previous).add(name));
      try {
        const result = await api.mcp.test({ projectPath, name });
        setTestResults((previous) => ({ ...previous, [name]: { result, testedAt: Date.now() } }));
      } catch (err) {
        setTestResults((previous) => ({
          ...previous,
          [name]: {
            result: { success: false, error: getErrorMessage(err) },
            testedAt: Date.now(),
          },
        }));
      } finally {
        setTestingServers((previous) => {
          const next = new Set(previous);
          next.delete(name);
          return next;
        });
      }
    },
    [api, projectPath]
  );

  const testCandidates = React.useCallback(async () => {
    const enabledCandidates = candidateEntries.filter(([, info]) => !info.disabled).map(([name]) => name);
    await Promise.all(enabledCandidates.map((name) => testServer(name)));
  }, [candidateEntries, testServer]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const testingAny = testingServers.size > 0;
  const enabledCandidateCount = candidateEntries.filter(([, info]) => !info.disabled).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-medium">Computer Use</h2>
        <p className="text-muted mt-1 text-sm">
          Read-only diagnostics for desktop-control MCP tooling. This page only lists and tests
          configured servers; it does not click, type, capture screenshots, or mutate your desktop.
        </p>
      </div>

      <div className="border-border-light bg-surface-secondary/40 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-foreground text-sm font-medium">Computer-use readiness</div>
            <div className="text-muted text-xs">{projectPath ?? "No workspace selected"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={refresh} disabled={loading || !api}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void testCandidates()}
              disabled={!api || !projectPath || enabledCandidateCount === 0 || testingAny}
            >
              {testingAny ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Test detected
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border-border-light bg-surface-primary rounded-md border p-3">
            <div className="text-muted text-xs">Detected servers</div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{candidateEntries.length}</div>
          </div>
          <div className="border-border-light bg-surface-primary rounded-md border p-3">
            <div className="text-muted text-xs">Available capabilities</div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{mergedCapabilities.size}</div>
          </div>
          <div className="border-border-light bg-surface-primary rounded-md border p-3">
            <div className="text-muted text-xs">Tested servers</div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{Object.keys(testResults).length}</div>
          </div>
        </div>

        {error && <div className="text-muted mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">{error}</div>}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          <h3 className="text-foreground text-sm font-medium">Detected MCP servers</h3>
        </div>

        {candidateEntries.length > 0 ? (
          <div className="divide-border-light rounded-lg border">
            {candidateEntries.map(([name, info]) => {
              const testState = testResults[name];
              const result = testState?.result;
              const isTesting = testingServers.has(name);
              const capabilities = result?.success ? inferCapabilities(result.tools) : new Set<CapabilityId>();

              return (
                <div key={name} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-foreground text-sm font-medium">{name}</div>
                        <StatusPill tone={info.disabled ? "warn" : "ok"}>{info.disabled ? "disabled" : "enabled"}</StatusPill>
                        <StatusPill tone="muted">{info.transport}</StatusPill>
                        {isTesting && <StatusPill tone="muted">Testing...</StatusPill>}
                        {result?.success && <StatusPill tone="ok">{result.tools.length} tools</StatusPill>}
                        {result && !result.success && <StatusPill tone="warn">failed</StatusPill>}
                      </div>
                      <div className="text-muted mt-1 truncate text-xs">{getMcpEndpoint(info)}</div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => void testServer(name)}
                      disabled={!api || !projectPath || info.disabled || isTesting}
                    >
                      {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Test
                    </Button>
                  </div>

                  {result && (
                    <div className="mt-2 flex items-start gap-2 text-xs">
                      {result.success ? (
                        <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
                      )}
                      <div className="text-muted min-w-0">
                        {result.success ? (
                          <>
                            Last test passed at {formatTestedAt(testState.testedAt)}. Tools: {result.tools.join(", ") || "none"}
                          </>
                        ) : (
                          <>Last test failed at {formatTestedAt(testState.testedAt)}: {result.error}</>
                        )}
                      </div>
                    </div>
                  )}

                  {capabilities.size > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {CAPABILITIES.filter((capability) => capabilities.has(capability.id)).map((capability) => (
                        <StatusPill key={capability.id} tone="ok">
                          <span className="mr-1">{capability.icon}</span>
                          {capability.label}
                        </StatusPill>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          !loading && (
            <div className="text-muted rounded-lg border border-dashed p-4 text-sm">
              No computer-use MCP server detected. Configure a desktop-control MCP server first, then refresh this page.
            </div>
          )
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <h3 className="text-foreground text-sm font-medium">Safety boundary</h3>
        </div>
        <div className="text-muted rounded-lg border border-dashed p-4 text-sm">
          This first version intentionally exposes diagnostics only. Future click, type, screenshot,
          and clipboard actions should require explicit per-action permission before they run.
        </div>
      </section>
    </div>
  );
}
