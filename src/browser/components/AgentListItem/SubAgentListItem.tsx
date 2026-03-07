import React from "react";
import { cn } from "@/common/lib/utils";

interface SubAgentListItemProps {
  connectorPosition: "single" | "middle" | "last";
  indentLeft: number;
  children: React.ReactNode;
}

export function SubAgentListItem(props: SubAgentListItemProps) {
  const connectorLeft = props.indentLeft - 10;
  const showTrunk = props.connectorPosition !== "single";

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0"
        style={{ left: connectorLeft, width: 14 }}
      >
        {showTrunk && (
          <span
            className={cn(
              "border-border-subtle absolute top-0 left-[6px] border-l",
              props.connectorPosition === "last" ? "h-1/2" : "bottom-0"
            )}
          />
        )}
        <span className="border-border-subtle absolute top-1/2 left-[6px] w-2.5 border-t" />
      </div>
      {props.children}
    </div>
  );
}
