import { useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2, RefreshCw, RotateCw, Wrench } from "lucide-react";
import { VERSION } from "@/version";
import type { UpdateStatus } from "@/common/orpc/types";
import type { UpdateChannel } from "@/common/types/project";
import NuxLogoDark from "@/browser/assets/logos/nux-logo-dark.svg?react";
import NuxLogoLight from "@/browser/assets/logos/nux-logo-light.svg?react";
import { useTheme } from "@/browser/contexts/ThemeContext";
import { useAPI } from "@/browser/contexts/API";
import { useAboutDialog } from "@/browser/contexts/AboutDialogContext";
import { Button } from "@/browser/components/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "@/browser/components/Dialog/Dialog";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/browser/components/ToggleGroupPrimitive/ToggleGroupPrimitive";

interface LinuxDiagnostics {
  platform: string;
  isLinux: boolean;
  isPackaged: boolean;
  execPath: string;
  appImagePath: string | null;
  appImageSha256: string | null;
  appImageError: string | null;
  desktopFilePath: string | null;
  desktopFileExists: boolean;
  desktopFileExec: string | null;
  userDataPath: string | null;
  nuxHomePath: string | null;
}

interface VersionRecord {
  buildTime?: unknown;
  git?: unknown;
  git_describe?: unknown;
}

function formatExtendedTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function parseVersionInfo(version: unknown): { gitDescribe: string; buildTime: string } {
  if (typeof version !== "object" || version === null) {
    return {
      gitDescribe: "dev",
      buildTime: "Unknown build time",
    };
  }

  const versionRecord = version as VersionRecord;
  const gitDescribe =
    typeof versionRecord.git_describe === "string"
      ? versionRecord.git_describe
      : typeof versionRecord.git === "string"
        ? versionRecord.git
        : "dev";

  return {
    gitDescribe,
    buildTime:
      typeof versionRecord.buildTime === "string"
        ? formatExtendedTimestamp(versionRecord.buildTime)
        : "Unknown build time",
  };
}

export function AboutDialog() {
  const { isOpen, close } = useAboutDialog();
  const { api } = useAPI();
  const { theme } = useTheme();
  const NuxLogo = theme === "dark" || theme.endsWith("-dark") ? NuxLogoDark : NuxLogoLight;
  const { gitDescribe, buildTime } = parseVersionInfo(VERSION satisfies unknown);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ type: "idle" });
  const [channel, setChannel] = useState<UpdateChannel | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"check" | "download" | "install" | null>(null);
  const [linuxDiagnostics, setLinuxDiagnostics] = useState<LinuxDiagnostics | null>(null);
  const [linuxActionMessage, setLinuxActionMessage] = useState<string | null>(null);
  const [linuxActionPending, setLinuxActionPending] = useState<"repair" | "restart" | null>(null);
  const channelRequestTokenRef = useRef(0);

  const isDesktop = typeof window !== "undefined" && Boolean(window.api);

  useEffect(() => {
    if (!isOpen || !isDesktop || !api) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      try {
        const iterator = await api.update.onStatus(undefined, { signal });
        for await (const status of iterator) {
          if (signal.aborted) {
            break;
          }
          setUpdateStatus(status);
          setPendingAction(null);
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("Update status stream error:", error);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [api, isDesktop, isOpen]);

  useEffect(() => {
    if (!isOpen || !isDesktop || !api) {
      return;
    }

    let active = true;
    // Ignore stale getChannel() responses when a newer request or manual selection has already happened.
    const requestToken = ++channelRequestTokenRef.current;

    api.update
      .getChannel()
      .then((nextChannel) => {
        if (active && requestToken === channelRequestTokenRef.current) {
          setChannel(nextChannel);
        }
      })
      .catch(console.error);

    return () => {
      active = false;
    };
  }, [api, isDesktop, isOpen]);

  useEffect(() => {
    if (!isOpen || !isDesktop || !api) {
      setLinuxDiagnostics(null);
      return;
    }

    let active = true;
    api.general
      .getLinuxDiagnostics()
      .then((diagnostics) => {
        if (active) {
          setLinuxDiagnostics(diagnostics);
        }
      })
      .catch((error) => {
        console.error("Linux diagnostics failed:", error);
      });

    return () => {
      active = false;
    };
  }, [api, isDesktop, isOpen]);

  const handleCopyDiagnostics = () => {
    if (!linuxDiagnostics) {
      return;
    }

    const text = JSON.stringify(linuxDiagnostics, null, 2);
    void navigator.clipboard.writeText(text).then(() => setLinuxActionMessage("Diagnostics copied."));
  };

  const handleRepairLinuxLauncher = () => {
    if (!api) {
      return;
    }

    setLinuxActionPending("repair");
    api.general
      .repairLinuxLauncher()
      .then((result) => {
        setLinuxActionMessage(result.message);
        return api.general.getLinuxDiagnostics();
      })
      .then(setLinuxDiagnostics)
      .catch((error) => {
        console.error("Linux launcher repair failed:", error);
        setLinuxActionMessage("Linux launcher repair failed.");
      })
      .finally(() => setLinuxActionPending(null));
  };

  const handleRestartApp = () => {
    if (!api) {
      return;
    }

    setLinuxActionPending("restart");
    api.general
      .restartApp()
      .then((result) => {
        if (!result.supported) {
          setLinuxActionMessage(result.message);
          setLinuxActionPending(null);
        }
      })
      .catch((error) => {
        console.error("Restart failed:", error);
        setLinuxActionMessage("Restart failed.");
        setLinuxActionPending(null);
      });
  };

  const canUseUpdateApi = isDesktop && Boolean(api);
  const isChecking =
    canUseUpdateApi &&
    (updateStatus.type === "checking" ||
      updateStatus.type === "downloading" ||
      pendingAction === "check");

  const handleChannelChange = (next: UpdateChannel) => {
    if (!api || next === channel || channelLoading) {
      return;
    }

    // Invalidate any in-flight getChannel() request so late responses cannot overwrite user intent.
    channelRequestTokenRef.current += 1;
    setChannelLoading(true);
    api.update
      .setChannel({ channel: next })
      .then(() => setChannel(next))
      .catch(console.error)
      .finally(() => setChannelLoading(false));
  };

  const handleCheckForUpdates = () => {
    if (!api) {
      return;
    }

    setPendingAction("check");
    api.update
      .check({ source: "manual" })
      .catch(console.error)
      // Clear pending if the backend no-ops (e.g. already downloaded) and emits no status event.
      .finally(() => setPendingAction((prev) => (prev === "check" ? null : prev)));
  };

  const handleDownload = () => {
    if (!api) {
      return;
    }

    setPendingAction("download");
    api.update
      .download(undefined)
      .catch(console.error)
      .finally(() => setPendingAction((prev) => (prev === "download" ? null : prev)));
  };

  const handleInstall = () => {
    if (!api) {
      return;
    }

    setPendingAction("install");
    api.update
      .install(undefined)
      .catch(console.error)
      .finally(() => setPendingAction((prev) => (prev === "install" ? null : prev)));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent
        maxWidth="520px"
        aria-describedby={undefined}
        className="titlebar-no-drag space-y-4"
      >
        <DialogTitle>About</DialogTitle>

        <div className="border-border-medium bg-modal-bg flex justify-center rounded-md border py-6">
          <NuxLogo className="h-14 w-auto" aria-hidden="true" />
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Version</span>
            <span className="text-foreground font-mono">{gitDescribe}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted">Built</span>
            <span className="text-foreground text-right text-xs">{buildTime}</span>
          </div>
        </div>

        {linuxDiagnostics?.isLinux && (
          <div className="border-border-medium space-y-3 border-t pt-3">
            <div className="text-foreground text-sm font-medium">Linux diagnostics</div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">AppImage</span>
                <span className="text-foreground max-w-[320px] truncate font-mono">
                  {linuxDiagnostics.appImagePath ?? "Not detected"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">SHA-256</span>
                <span className="text-foreground max-w-[320px] truncate font-mono">
                  {linuxDiagnostics.appImageSha256 ?? linuxDiagnostics.appImageError ?? "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted">Launcher</span>
                <span className="text-foreground max-w-[320px] truncate font-mono">
                  {linuxDiagnostics.desktopFileExec ?? "Missing"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyDiagnostics}>
                <Copy className="h-3.5 w-3.5" />
                Copy diagnostics
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRepairLinuxLauncher}
                disabled={linuxActionPending === "repair"}
              >
                {linuxActionPending === "repair" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wrench className="h-3.5 w-3.5" />
                )}
                Repair launcher
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestartApp}
                disabled={linuxActionPending === "restart"}
              >
                {linuxActionPending === "restart" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                Restart Nux
              </Button>
            </div>
            {linuxActionMessage && <div className="text-muted text-xs">{linuxActionMessage}</div>}
          </div>
        )}

        <div className="border-border-medium space-y-3 border-t pt-3">
          <div className="text-foreground text-sm font-medium">Updates</div>

          {!isDesktop ? (
            <div className="text-muted text-xs">
              Desktop updates are available in the Electron app only.
            </div>
          ) : !canUseUpdateApi ? (
            <div className="text-muted text-xs">Connecting to desktop update service…</div>
          ) : (
            <>
              {channel !== null && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-xs">Channel</span>
                    <ToggleGroup
                      type="single"
                      value={channel}
                      onValueChange={(next) => {
                        if (next === "stable" || next === "nightly") {
                          handleChannelChange(next);
                        }
                      }}
                      disabled={channelLoading}
                      aria-label="Update channel"
                      size="sm"
                    >
                      <ToggleGroupItem value="stable" size="sm">
                        Stable
                      </ToggleGroupItem>
                      <ToggleGroupItem value="nightly" size="sm">
                        Nightly
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="text-muted text-xs">
                    {channel === "stable"
                      ? "Official releases only."
                      : "Nightly pre-release builds from main."}
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                disabled={isChecking}
                onClick={handleCheckForUpdates}
              >
                {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Check for Updates
              </Button>

              {updateStatus.type === "checking" && (
                <div className="text-muted text-xs">Checking for updates…</div>
              )}

              {updateStatus.type === "available" && (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-foreground text-xs">
                    Update available: <span className="font-mono">{updateStatus.info.version}</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleDownload}
                    disabled={pendingAction === "download"}
                  >
                    {pendingAction === "download" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </Button>
                </div>
              )}

              {updateStatus.type === "downloading" && (
                <div className="text-muted text-xs">
                  Downloading update: {updateStatus.percent}%
                </div>
              )}

              {updateStatus.type === "downloaded" && (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-foreground text-xs">
                    Ready to install: <span className="font-mono">{updateStatus.info.version}</span>
                  </div>
                  <Button size="sm" onClick={handleInstall} disabled={pendingAction === "install"}>
                    {pendingAction === "install" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {pendingAction === "install" ? "Installing…" : "Install & restart"}
                  </Button>
                </div>
              )}

              {updateStatus.type === "up-to-date" && (
                <div className="text-muted text-xs">NUX is up to date.</div>
              )}

              {updateStatus.type === "idle" && (
                <div className="text-muted text-xs">Run a manual check to look for updates.</div>
              )}

              {updateStatus.type === "error" && (
                <div className="space-y-2">
                  <div className="text-destructive text-xs">
                    {updateStatus.phase === "download"
                      ? `Download failed: ${updateStatus.message}`
                      : updateStatus.phase === "install"
                        ? `Install failed: ${updateStatus.message}`
                        : `Update check failed: ${updateStatus.message}`}
                  </div>
                  <div className="flex items-center gap-2">
                    {updateStatus.phase === "download" && (
                      <Button
                        size="sm"
                        onClick={handleDownload}
                        disabled={pendingAction === "download"}
                      >
                        {pendingAction === "download" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Retry download
                      </Button>
                    )}
                    {updateStatus.phase === "install" && (
                      <Button
                        size="sm"
                        onClick={handleInstall}
                        disabled={pendingAction === "install"}
                      >
                        {pendingAction === "install" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Try install again
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckForUpdates}
                      disabled={isChecking}
                    >
                      {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {updateStatus.phase === "check" ? "Try again" : "Check again"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          <a
            href="https://github.com/mazensabbagh7-pixel/tux/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="titlebar-no-drag text-accent inline-block text-xs hover:underline"
          >
            View all releases
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
