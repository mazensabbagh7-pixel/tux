import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Plug, RefreshCw, Server, Wrench } from "lucide-react";
import { Button } from "@/browser/components/Button/Button";
import { useAPI } from "@/browser/contexts/API";
import { useWorkspaceContext } from "@/browser/contexts/WorkspaceContext";
import type { AgentSkillDescriptor, AgentSkillIssue, AgentSkillScope } from "@/common/types/agentSkill";
import type { MCPServerInfo } from "@/common/types/mcp";
import { getErrorMessage } from "@/common/utils/errors";

const SKILL_SCOPE_LABELS: Record<AgentSkillScope, string> = {
  project: "Project",
  global: "Global",
  "built-in": "Built-in",
};

function groupSkillsByScope(skills: AgentSkillDescriptor[]): Record<AgentSkillScope, AgentSkillDescriptor[]> {
  return skills.reduce<Record<AgentSkillScope, AgentSkillDescriptor[]>>(
    (groups, skill) => {
      groups[skill.scope].push(skill);
      return groups;
    },
    { project: [], global: [], "built-in": [] }
  );
}

function getMcpEndpoint(info: MCPServerInfo): string {
  if (info.transport === "stdio") return info.command;
  return info.url;
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

export function PluginsSection() {
  const { api } = useAPI();
  const workspaceContext = useWorkspaceContext();
  const selectedWorkspace = workspaceContext?.selectedWorkspace ?? null;
  const projectPath = selectedWorkspace?.projectPath ?? null;
  const workspaceId = selectedWorkspace?.workspaceId ?? undefined;

  const [skills, setSkills] = useState<AgentSkillDescriptor[]>([]);
  const [invalidSkills, setInvalidSkills] = useState<AgentSkillIssue[]>([]);
  const [mcpServers, setMcpServers] = useState<Record<string, MCPServerInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillGroups = useMemo(() => groupSkillsByScope(skills), [skills]);
  const mcpEntries = useMemo(
    () => Object.entries(mcpServers).sort(([a], [b]) => a.localeCompare(b)),
    [mcpServers]
  );

  const refresh = React.useCallback(() => {
    if (!api || !projectPath) {
      setSkills([]);
      setInvalidSkills([]);
      setMcpServers({});
      setError(projectPath ? null : "Select a workspace to inspect its plugins and tools.");
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([
      api.agentSkills.listDiagnostics({ projectPath, workspaceId }),
      api.mcp.list({ projectPath }),
    ])
      .then(([skillDiagnostics, servers]) => {
        setSkills(skillDiagnostics.skills);
        setInvalidSkills(skillDiagnostics.invalidSkills);
        setMcpServers(servers);
      })
      .catch((err: unknown) => {
        setError(getErrorMessage(err));
        setSkills([]);
        setInvalidSkills([]);
        setMcpServers({});
      })
      .finally(() => setLoading(false));
  }, [api, projectPath, workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-medium">Plugins & Tools</h2>
        <p className="text-muted mt-1 text-sm">
          Read-only inventory of the active workspace skills and MCP tool servers. Use this to see
          what Nux can call before granting broader automation.
        </p>
      </div>

      <div className="border-border-light bg-surface-secondary/40 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-foreground text-sm font-medium">Workspace tool inventory</div>
            <div className="text-muted truncate text-xs">
              {projectPath ?? "No workspace selected"}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading || !api}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border-border-light bg-surface-primary rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4" /> Skills
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{skills.length}</div>
          </div>
          <div className="border-border-light bg-surface-primary rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Server className="h-4 w-4" /> MCP servers
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{mcpEntries.length}</div>
          </div>
          <div className="border-border-light bg-surface-primary rounded-md border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" /> Issues
            </div>
            <div className="text-foreground mt-2 text-2xl font-semibold">{invalidSkills.length}</div>
          </div>
        </div>

        {error && <div className="text-muted mt-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">{error}</div>}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          <h3 className="text-foreground text-sm font-medium">Agent skills</h3>
        </div>

        {(["project", "global", "built-in"] as const).map((scope) => {
          const scopedSkills = skillGroups[scope];
          if (scopedSkills.length === 0) return null;

          return (
            <div key={scope} className="border-border-light rounded-lg border">
              <div className="border-border-light bg-surface-secondary/40 flex items-center justify-between border-b px-4 py-2">
                <div className="text-sm font-medium">{SKILL_SCOPE_LABELS[scope]} skills</div>
                <StatusPill tone="muted">{scopedSkills.length}</StatusPill>
              </div>
              <div className="divide-border-light divide-y">
                {scopedSkills.map((skill) => (
                  <div key={`${skill.scope}:${skill.name}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-foreground rounded bg-black/20 px-1.5 py-0.5 text-xs">/{skill.name}</code>
                      {skill.advertise === false && <StatusPill tone="warn">hidden</StatusPill>}
                    </div>
                    <p className="text-muted mt-1 text-sm">{skill.description}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {!loading && skills.length === 0 && !error && (
          <div className="text-muted rounded-lg border border-dashed p-4 text-sm">No skills discovered for this workspace.</div>
        )}
      </section>

      {invalidSkills.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <h3 className="text-foreground text-sm font-medium">Skill issues</h3>
          </div>
          <div className="divide-border-light rounded-lg border">
            {invalidSkills.map((issue) => (
              <div key={`${issue.scope}:${issue.directoryName}:${issue.displayPath}`} className="px-4 py-3 text-sm">
                <div className="text-foreground font-medium">{issue.directoryName}</div>
                <div className="text-muted mt-1">{issue.message}</div>
                <div className="text-muted/70 mt-1 text-xs">{issue.displayPath}</div>
                {issue.hint && <div className="mt-2 text-xs text-yellow-400">{issue.hint}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4" />
          <h3 className="text-foreground text-sm font-medium">MCP tool servers</h3>
        </div>

        {mcpEntries.length > 0 ? (
          <div className="divide-border-light rounded-lg border">
            {mcpEntries.map(([name, info]) => (
              <div key={name} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-foreground text-sm font-medium">{name}</div>
                  <StatusPill tone={info.disabled ? "warn" : "ok"}>
                    {info.disabled ? "disabled" : "enabled"}
                  </StatusPill>
                  <StatusPill tone="muted">{info.transport}</StatusPill>
                  {info.toolAllowlist && <StatusPill tone="muted">{info.toolAllowlist.length} allowed tools</StatusPill>}
                </div>
                <div className="text-muted mt-1 truncate text-xs">{getMcpEndpoint(info)}</div>
              </div>
            ))}
          </div>
        ) : (
          !loading && !error && <div className="text-muted rounded-lg border border-dashed p-4 text-sm">No MCP servers configured.</div>
        )}
      </section>

      {!loading && !error && projectPath && (
        <div className="text-muted flex items-center gap-2 text-xs">
          <CheckCircle className="h-3.5 w-3.5 text-green-400" /> Inventory loaded without changing configuration.
        </div>
      )}
    </div>
  );
}
