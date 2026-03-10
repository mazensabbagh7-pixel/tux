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
    ? "Latest saved changes are queued for the end of the current turn."
    : hasPreview
      ? props.state.autoSendMode === "end-of-turn"
        ? "Latest saved changes are ready now. New saves will auto-send at the end of the current turn."
        : "Latest saved changes stay here until you send them."
      : props.state.autoSendMode === "end-of-turn"
        ? "Saving will auto-send the latest flow prompt diff at the end of the current turn."
        : "Saving keeps the latest flow prompt diff here while chat below stays available for quick follow-ups.";
  const handleAutoSendModeChange = (value: string) => {
    if (value === "off" || value === "end-of-turn") {
      props.onAutoSendModeChange(value);
    }
  };

  return (
    <div className="border-border-light bg-dark/95 flex w-full flex-col gap-3 rounded-xl border px-3 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-foreground flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 shrink-0" />
            Flow Prompting
          </div>
          <p className="text-muted mt-1 text-xs">{statusText}</p>
          <div className="border-border-medium bg-background mt-2 flex items-center gap-2 overflow-hidden rounded-md border px-2 py-1 text-[11px]">
            <code className="block min-w-0 truncate">{props.state.path}</code>
          </div>
          {props.error ? <p className="mt-2 text-xs text-red-400">{props.error}</p> : null}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-60">
          <label className="text-muted flex items-center justify-between gap-3 text-[11px] font-medium tracking-wide uppercase">
            <span>Auto-send</span>
            <Select
              value={props.state.autoSendMode}
              onValueChange={handleAutoSendModeChange}
              disabled={isAutoSendChanging}
            >
              <SelectTrigger className="border-border-medium bg-background h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="end-of-turn">End-of-turn</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={props.onSendNow}
              disabled={!hasPreview || isSendingNow}
            >
              <Send className="h-3.5 w-3.5" />
              {isSendingNow ? "Sending…" : "Send diff now"}
            </Button>
            <Button variant="secondary" size="xs" onClick={props.onOpen}>
              <SquarePen className="h-3.5 w-3.5" />
              Open flow prompt
            </Button>
            <Button variant="ghost" size="xs" onClick={props.onDisable}>
              <Trash2 className="h-3.5 w-3.5" />
              Disable
            </Button>
          </div>
        </div>
      </div>
      {hasPreview ? (
        <div className="border-border-medium bg-background-secondary/75 rounded-lg border">
          <div className="border-border-medium flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <div className="text-foreground text-xs font-medium">
              {props.state.hasPendingUpdate ? "Queued flow prompt update" : "Live flow prompt diff"}
            </div>
            <div className="text-muted text-[11px]">
              {props.state.hasPendingUpdate
                ? "Sending at end of turn"
                : props.state.autoSendMode === "end-of-turn"
                  ? "Auto-send armed"
                  : "Manual send"}
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto px-3 py-2">
            <UserMessageContent content={previewText ?? ""} variant="queued" />
          </div>
        </div>
      ) : null}
    </div>
  );
};
