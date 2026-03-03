import { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  WarningBox,
  WarningText,
  WarningTitle,
} from "@/browser/components/Dialog/Dialog";
import { Button } from "@/browser/components/Button/Button";

export interface ProjectDeleteConfirmationModalProps {
  isOpen: boolean;
  projectName: string;
  archivedCount: number;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ProjectDeleteConfirmationModal(props: ProjectDeleteConfirmationModalProps) {
  const [typedProjectName, setTypedProjectName] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmationInputId = useId();

  useEffect(() => {
    if (props.isOpen) {
      // Type-to-confirm must always start from a blank input when this dialog opens.
      setTypedProjectName("");
      setIsConfirming(false);
    }
  }, [props.isOpen]);

  const confirmationMatches = typedProjectName === props.projectName;

  const handleConfirm = async () => {
    if (!confirmationMatches || isConfirming) {
      return;
    }

    setIsConfirming(true);
    try {
      await props.onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      open={props.isOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCancel();
        }
      }}
    >
      <DialogContent
        maxWidth="500px"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          props.onCancel();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete "{props.projectName}"?</DialogTitle>
        </DialogHeader>

        <WarningBox>
          <WarningTitle>Warning</WarningTitle>
          <WarningText>
            This will permanently delete {props.archivedCount} archived workspace(s).
          </WarningText>
        </WarningBox>

        <div className="space-y-2">
          <label htmlFor={confirmationInputId} className="text-muted block text-xs font-medium">
            Project name confirmation
          </label>
          <input
            autoFocus
            type="text"
            id={confirmationInputId}
            value={typedProjectName}
            onChange={(event) => {
              setTypedProjectName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (!confirmationMatches || isConfirming) {
                  return;
                }

                event.preventDefault();
                handleConfirm();
              }
            }}
            placeholder={`Type "${props.projectName}" to confirm`}
            className="border-border-medium bg-modal-bg text-foreground placeholder:text-muted focus:border-accent w-full rounded border px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
            disabled={isConfirming}
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={props.onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!confirmationMatches || isConfirming}
          >
            {isConfirming ? "Deleting..." : "Delete Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
