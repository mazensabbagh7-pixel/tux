import React from "react";
import { FileText, Send, SquarePen, Trash2 } from "lucide-react";
import type { FlowPromptAutoSendMode } from "@/common/constants/flowPrompting";
import type { FlowPromptState } from "@/common/orpc/types";
import { Button } from "@/browser/components/Button/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/browser/components/SelectPrimitive/SelectPrimitive";
import { UserMessageContent } from "@/browser/features/Messages/UserMessageContent";

interface FlowPromptComposerCardProps {
  state: FlowPromptState;
  error?: string | null;
  isUpdatingAutoSendMode?: boolean;
  isSendingNow?: boolean;
  onOpen: () => void;
  onDisable: () => void;
  onSendNow: () => void;
  onAutoSendModeChange: (mode: FlowPromptAutoSendMode) => void;
}

export const FlowPromptComposerCard: React.FC<FlowPromptComposerCardProps> = (props) => {
  const previewText = props.state.updatePreviewText;
  const hasPreview = previewText != null;
  const isAutoSendChanging = props.isUpdatingAutoSendMode === true;
  const isSendingNow = props.isSendingNow === true;
  const statusText = props.state.hasPendingUpdate
    ? "Latest save is queued for the end of this turn."
    : hasPreview
      ? props.state.autoSendMode === "end-of-turn"
        ? "Latest save is ready now. Future saves auto-send at turn end."
        : "Latest save is ready here until you send it."
      : props.state.autoSendMode === "end-of-turn"
        ? "Saving auto-sends the latest prompt update at turn end."
        : "Saving keeps the latest prompt update here until you send it.";
  const previewLabel = props.state.hasPendingUpdate
    ? "Queued flow prompt update"
    : "Live flow prompt update";
  const previewModeText = props.state.hasPendingUpdate
    ? "End of turn"
    : props.state.autoSendMode === "end-of-turn"
      ? "Auto-send on"
      : "Manual";
  const handleAutoSendModeChange = (value: string) => {
    if (value === "off" || value === "end-of-turn") {
      props.onAutoSendModeChange(value);
    }
  };

  return (
    <div className="border-border-light bg-dark/95 -mb-1 flex w-full flex-col gap-2 rounded-t border border-b-0 px-3 pt-2.5 pb-2">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <div className="text-foreground flex shrink-0 items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 shrink-0" />
              Flow Prompting
            </div>
            <div className="border-border-medium bg-background text-muted flex min-w-0 flex-1 items-center rounded-sm border px-1.5 py-0.5 text-[10px]">
              <code className="block min-w-0 truncate">{props.state.path}</code>
            </div>
          </div>
          <p className="text-muted mt-1 text-[11px] leading-4">{statusText}</p>
          {props.error ? <p className="mt-1 text-xs text-red-400">{props.error}</p> : null}
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-1.5 lg:w-auto lg:shrink-0 lg:justify-start">
          <div className="flex items-center gap-1.5">
            <span className="text-muted shrink-0 text-[11px] font-medium tracking-wide uppercase">
              Auto-send
            </span>
            <Select
              value={props.state.autoSendMode}
              onValueChange={handleAutoSendModeChange}
              disabled={isAutoSendChanging}
            >
              <SelectTrigger className="border-border-medium bg-background w-32 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="end-of-turn">End-of-turn</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            size="xs"
            className="gap-1.5 px-2.5"
            onClick={props.onSendNow}
            disabled={!hasPreview || isSendingNow}
          >
            <Send className="h-3.5 w-3.5" />
            {isSendingNow ? "Sending…" : "Send now"}
          </Button>
          <Button variant="secondary" size="xs" className="gap-1.5 px-2.5" onClick={props.onOpen}>
            <SquarePen className="h-3.5 w-3.5" />
            Open prompt
          </Button>
          <Button variant="ghost" size="xs" className="gap-1.5 px-2.5" onClick={props.onDisable}>
            <Trash2 className="h-3.5 w-3.5" />
            Disable
          </Button>
        </div>
      </div>
      {hasPreview ? (
        <div className="border-border-medium bg-background-secondary/60 rounded-lg border">
          <div className="border-border-medium flex items-center justify-between gap-2 border-b px-2.5 py-1">
            <div className="text-foreground text-[11px] leading-none font-medium">
              {previewLabel}
            </div>
            <div className="text-muted text-[10px] font-medium tracking-wide uppercase">
              {previewModeText}
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto px-2.5 py-1.5">
            <UserMessageContent content={previewText ?? ""} variant="queued" />
          </div>
        </div>
      ) : null}
    </div>
  );
};
