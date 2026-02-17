import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { FolderOpen, Github } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/browser/components/ui/dialog";
import { DirectoryPickerModal } from "./DirectoryPickerModal";
import { Button } from "@/browser/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/browser/components/ui/toggle-group";
import { useAPI } from "@/browser/contexts/API";
function useDirectoryPicker(params) {
    const { api, initialPath, onSelectPath, errorLabel } = params;
    const isDesktop = !!window.api;
    const hasWebFsPicker = !isDesktop;
    const [isDirPickerOpen, setIsDirPickerOpen] = useState(false);
    const handleWebPickerPathSelected = useCallback((selected) => {
        onSelectPath(selected);
    }, [onSelectPath]);
    const browse = useCallback(async () => {
        if (isDesktop) {
            try {
                const selectedPath = await api?.projects.pickDirectory();
                if (selectedPath) {
                    onSelectPath(selectedPath);
                }
            }
            catch (err) {
                console.error(errorLabel, err);
            }
            return;
        }
        if (hasWebFsPicker) {
            setIsDirPickerOpen(true);
        }
    }, [api, errorLabel, hasWebFsPicker, isDesktop, onSelectPath]);
    const directoryPickerModal = hasWebFsPicker ? (_jsx(DirectoryPickerModal, { isOpen: isDirPickerOpen, initialPath: initialPath || "~", onClose: () => setIsDirPickerOpen(false), onSelectPath: handleWebPickerPathSelected })) : null;
    return { canBrowse: isDesktop || hasWebFsPicker, browse, directoryPickerModal };
}
export const ProjectCreateForm = React.forwardRef(function ProjectCreateForm({ onSuccess, onClose, showCancelButton = false, autoFocus = false, onIsCreatingChange, submitLabel = "Add Project", placeholder = window.api?.platform === "win32"
    ? "C:\\Users\\user\\projects\\my-project"
    : "/home/user/projects/my-project", hideFooter = false, }, ref) {
    const { api } = useAPI();
    const [path, setPath] = useState("");
    const [error, setError] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const setCreating = useCallback((next) => {
        setIsCreating(next);
        onIsCreatingChange?.(next);
    }, [onIsCreatingChange]);
    const reset = useCallback(() => {
        setPath("");
        setError("");
    }, []);
    const handleCancel = useCallback(() => {
        reset();
        onClose?.();
    }, [onClose, reset]);
    const { canBrowse, browse, directoryPickerModal } = useDirectoryPicker({
        api,
        initialPath: path || "~",
        onSelectPath: (selectedPath) => {
            setPath(selectedPath);
            setError("");
        },
        errorLabel: "Failed to pick directory:",
    });
    const handleSelect = useCallback(async () => {
        const trimmedPath = path.trim();
        if (!trimmedPath) {
            setError("Please enter a project name or path");
            return false;
        }
        if (isCreating) {
            return false;
        }
        setError("");
        if (!api) {
            setError("Not connected to server");
            return false;
        }
        setCreating(true);
        try {
            // First check if project already exists
            const existingProjects = await api.projects.list();
            const existingPaths = new Map(existingProjects);
            // Backend handles path resolution (bare names → ~/.mux/projects/name)
            const result = await api.projects.create({ projectPath: trimmedPath });
            if (result.success) {
                // Check if duplicate (backend may normalize the path)
                const { normalizedPath, projectConfig } = result.data;
                if (existingPaths.has(normalizedPath)) {
                    setError("This project has already been added.");
                    return false;
                }
                onSuccess(normalizedPath, projectConfig);
                reset();
                onClose?.();
                return true;
            }
            // Backend validation error - show inline
            const errorMessage = typeof result.error === "string" ? result.error : "Failed to add project";
            setError(errorMessage);
            return false;
        }
        catch (err) {
            // Unexpected error
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            setError(`Failed to add project: ${errorMessage}`);
            return false;
        }
        finally {
            setCreating(false);
        }
    }, [api, isCreating, onClose, onSuccess, path, reset, setCreating]);
    const handleKeyDown = useCallback((e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            void handleSelect();
        }
    }, [handleSelect]);
    useImperativeHandle(ref, () => ({
        submit: handleSelect,
        getTrimmedPath: () => path.trim(),
    }), [handleSelect, path]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-muted text-xs", children: "Path" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: path, onChange: (e) => {
                                    setPath(e.target.value);
                                    setError("");
                                }, onKeyDown: handleKeyDown, placeholder: placeholder, autoFocus: autoFocus, disabled: isCreating, className: "border-border-medium bg-modal-bg text-foreground placeholder:text-muted focus:border-accent min-w-0 flex-1 rounded border px-3 py-2 font-mono text-sm focus:outline-none disabled:opacity-50" }), canBrowse && (_jsx(Button, { variant: "outline", onClick: () => void browse(), disabled: isCreating, className: "shrink-0", children: "Browse\u2026" }))] })] }), error && _jsx("p", { className: "text-error text-xs", children: error }), !hideFooter && (_jsxs(DialogFooter, { children: [showCancelButton && (_jsx(Button, { variant: "secondary", onClick: handleCancel, disabled: isCreating, children: "Cancel" })), _jsx(Button, { onClick: () => void handleSelect(), disabled: isCreating, children: isCreating ? "Adding..." : submitLabel })] })), directoryPickerModal] }));
});
ProjectCreateForm.displayName = "ProjectCreateForm";
function getRepoNameFromUrl(repoUrl) {
    const normalizedRepoUrl = repoUrl
        .trim()
        .replace(/[?#].*$/, "")
        .replace(/\/+$/, "");
    if (!normalizedRepoUrl) {
        return "";
    }
    const withoutGitSuffix = normalizedRepoUrl.replace(/\.git$/, "");
    const segments = withoutGitSuffix.split(/[/:]/).filter(Boolean);
    return segments[segments.length - 1] ?? "";
}
function buildCloneDestinationPreview(cloneParentDir, repoName) {
    if (!repoName) {
        return "";
    }
    const trimmedCloneParentDir = cloneParentDir.trim();
    if (!trimmedCloneParentDir) {
        return "";
    }
    const normalizedCloneParentDir = trimmedCloneParentDir.replace(/[\\/]+$/, "");
    const separator = normalizedCloneParentDir.includes("\\") && !normalizedCloneParentDir.includes("/") ? "\\" : "/";
    return `${normalizedCloneParentDir}${separator}${repoName}`;
}
const ProjectCloneForm = React.forwardRef(function ProjectCloneForm(props, ref) {
    const { api } = useAPI();
    const [repoUrl, setRepoUrl] = useState("");
    const [cloneParentDir, setCloneParentDir] = useState(props.defaultProjectDir);
    const [hasEditedCloneParentDir, setHasEditedCloneParentDir] = useState(false);
    const [error, setError] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [progressLines, setProgressLines] = useState([]);
    const abortControllerRef = useRef(null);
    const progressEndRef = useRef(null);
    const setCreating = useCallback((next) => {
        setIsCreating(next);
        props.onIsCreatingChange?.(next);
    }, [props]);
    const reset = useCallback(() => {
        setRepoUrl("");
        setCloneParentDir(props.defaultProjectDir);
        setHasEditedCloneParentDir(false);
        setError("");
        setProgressLines([]);
    }, [props.defaultProjectDir]);
    const abortInFlightClone = useCallback(() => {
        if (!abortControllerRef.current) {
            return;
        }
        abortControllerRef.current.abort();
    }, []);
    useEffect(() => {
        if (!props.isOpen) {
            abortInFlightClone();
            reset();
        }
    }, [abortInFlightClone, props.isOpen, reset]);
    useEffect(() => abortInFlightClone, [abortInFlightClone]);
    useEffect(() => {
        if (!props.isOpen || hasEditedCloneParentDir) {
            return;
        }
        setCloneParentDir(props.defaultProjectDir);
    }, [props.defaultProjectDir, props.isOpen, hasEditedCloneParentDir]);
    useEffect(() => {
        progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [progressLines]);
    const trimmedCloneParentDir = cloneParentDir.trim();
    const handleCancel = useCallback(() => {
        abortInFlightClone();
        reset();
        props.onClose?.();
    }, [abortInFlightClone, props, reset]);
    const { canBrowse, browse, directoryPickerModal } = useDirectoryPicker({
        api,
        initialPath: cloneParentDir || props.defaultProjectDir || "~",
        onSelectPath: (selectedPath) => {
            setCloneParentDir(selectedPath);
            setHasEditedCloneParentDir(true);
            setError("");
        },
        errorLabel: "Failed to pick clone directory:",
    });
    const handleClone = useCallback(async () => {
        const trimmedRepoUrl = repoUrl.trim();
        if (!trimmedRepoUrl) {
            setError("Please enter a repository URL");
            return false;
        }
        if (isCreating) {
            return false;
        }
        if (!api) {
            setError("Not connected to server");
            return false;
        }
        setError("");
        setProgressLines([]);
        setCreating(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        try {
            const cloneEvents = await api.projects.clone({
                repoUrl: trimmedRepoUrl,
                cloneParentDir: trimmedCloneParentDir || undefined,
            }, { signal: controller.signal });
            for await (const event of cloneEvents) {
                if (event.type === "progress") {
                    if (!controller.signal.aborted) {
                        // Show the raw git stderr stream so users can confirm clone progress and diagnose hangs.
                        setProgressLines((previousLines) => [...previousLines, event.line]);
                    }
                    continue;
                }
                if (event.type === "success") {
                    const { normalizedPath, projectConfig } = event;
                    props.onSuccess(normalizedPath, projectConfig);
                    reset();
                    props.onClose?.();
                    return true;
                }
                setError(event.error || "Failed to clone project");
                return false;
            }
            if (controller.signal.aborted) {
                setError("Clone cancelled");
                return false;
            }
            setError("Clone did not return a completion event");
            return false;
        }
        catch (err) {
            if (controller.signal.aborted) {
                setError("Clone cancelled");
                return false;
            }
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            setError(`Failed to clone project: ${errorMessage}`);
            return false;
        }
        finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setCreating(false);
            }
        }
    }, [api, isCreating, props, repoUrl, reset, setCreating, trimmedCloneParentDir]);
    const handleRetry = useCallback(() => {
        setError("");
        setProgressLines([]);
    }, []);
    const handleKeyDown = useCallback((e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            void handleClone();
        }
    }, [handleClone]);
    useImperativeHandle(ref, () => ({
        submit: handleClone,
        getTrimmedRepoUrl: () => repoUrl.trim(),
    }), [handleClone, repoUrl]);
    const repoName = getRepoNameFromUrl(repoUrl);
    const destinationPreview = buildCloneDestinationPreview(cloneParentDir, repoName);
    // Keep the progress log visible after failed clones so users can diagnose the git error before retrying.
    const hasCloneFailure = !isCreating && progressLines.length > 0 && error.length > 0;
    const showCloneProgress = isCreating || (hasCloneFailure && !props.hideFooter);
    return (_jsxs(_Fragment, { children: [showCloneProgress ? (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-muted text-xs", children: hasCloneFailure ? "Clone failed" : "Cloning repository…" }), _jsxs("div", { className: "bg-modal-bg border-border-medium max-h-40 overflow-y-auto rounded border p-3", children: [_jsx("pre", { className: "text-muted font-mono text-xs break-all whitespace-pre-wrap", children: progressLines.length > 0 ? progressLines.join("") : "Starting clone…" }), _jsx("div", { ref: progressEndRef })] })] }), destinationPreview && (_jsxs("p", { className: "text-muted text-xs", children: ["Cloning to ", _jsx("span", { className: "text-foreground font-mono", children: destinationPreview })] }))] })) : (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-muted text-xs", children: "Repo URL" }), _jsx("input", { type: "text", value: repoUrl, onChange: (e) => {
                                    setRepoUrl(e.target.value);
                                    setError("");
                                }, onKeyDown: handleKeyDown, placeholder: "owner/repo or https://github.com/...", autoFocus: props.autoFocus ?? true, disabled: isCreating, className: "border-border-medium bg-modal-bg text-foreground placeholder:text-muted focus:border-accent w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none disabled:opacity-50" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-muted text-xs", children: "Location" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: cloneParentDir, onChange: (e) => {
                                            const nextCloneParentDir = e.target.value;
                                            setCloneParentDir(nextCloneParentDir);
                                            setHasEditedCloneParentDir(true);
                                            setError("");
                                        }, onKeyDown: handleKeyDown, placeholder: props.defaultProjectDir || "Select clone location", disabled: isCreating, className: "border-border-medium bg-modal-bg text-foreground placeholder:text-muted focus:border-accent min-w-0 flex-1 rounded border px-3 py-2 font-mono text-sm focus:outline-none disabled:opacity-50" }), canBrowse && (_jsx(Button, { variant: "outline", onClick: () => void browse(), disabled: isCreating, className: "shrink-0", children: "Browse\u2026" }))] })] }), repoName && destinationPreview && (_jsxs("p", { className: "text-muted text-xs", children: ["Will clone to", " ", _jsx("span", { className: "text-foreground font-mono", children: destinationPreview })] }))] })), error && _jsx("p", { className: "text-error text-xs", children: error }), !props.hideFooter && (_jsxs(DialogFooter, { children: [_jsx(Button, { variant: "secondary", onClick: handleCancel, children: "Cancel" }), !isCreating && (_jsx(Button, { onClick: hasCloneFailure ? handleRetry : () => void handleClone(), children: hasCloneFailure ? "Back to form" : "Clone Project" }))] })), directoryPickerModal] }));
});
ProjectCloneForm.displayName = "ProjectCloneForm";
const NOOP = () => undefined;
/** Shared footer for ProjectAddForm — rendered outside the space-y-3 wrapper
 *  so it sits as a direct DialogContent grid child, aligned with the header. */
function ProjectAddFormFooter(props) {
    const handleSubmit = () => {
        if (props.mode === "pick-folder") {
            void props.createFormRef.current?.submit();
        }
        else {
            void props.cloneFormRef.current?.submit();
        }
    };
    const actionLabel = props.mode === "pick-folder" ? "Add Project" : "Clone Project";
    return (_jsxs(DialogFooter, { className: props.showCancelButton ? "justify-between" : undefined, children: [props.showCancelButton && (_jsx(Button, { variant: "secondary", onClick: props.onClose, disabled: props.isCreating, children: "Cancel" })), _jsx(Button, { onClick: handleSubmit, disabled: props.isCreating, children: props.isCreating ? (props.mode === "pick-folder" ? "Adding…" : "Cloning…") : actionLabel })] }));
}
export const ProjectAddForm = React.forwardRef(function ProjectAddForm(props, ref) {
    const { api } = useAPI();
    const [mode, setMode] = useState("pick-folder");
    const [isCreating, setIsCreating] = useState(false);
    const [defaultProjectDir, setDefaultProjectDir] = useState("");
    const [isLoadingDefaultCloneDir, setIsLoadingDefaultCloneDir] = useState(false);
    const [hasLoadedDefaultCloneDir, setHasLoadedDefaultCloneDir] = useState(false);
    const cloneDirLoadNonceRef = useRef(0);
    const projectCreateFormRef = useRef(null);
    const projectCloneFormRef = useRef(null);
    const setCreating = useCallback((next) => {
        setIsCreating(next);
        props.onIsCreatingChange?.(next);
    }, [props]);
    const ensureDefaultCloneDir = useCallback(async () => {
        if (!api || isLoadingDefaultCloneDir || hasLoadedDefaultCloneDir) {
            return;
        }
        setIsLoadingDefaultCloneDir(true);
        const nonce = cloneDirLoadNonceRef.current;
        try {
            const projectDir = await api.projects.getDefaultProjectDir();
            if (nonce !== cloneDirLoadNonceRef.current) {
                return; // Parent was closed/reopened while loading — discard stale result
            }
            setDefaultProjectDir(projectDir);
        }
        catch (err) {
            console.error("Failed to fetch default project directory:", err);
        }
        finally {
            if (nonce === cloneDirLoadNonceRef.current) {
                // Mark as loaded even on failure to prevent infinite retry loops
                // when the backend is unavailable.
                setHasLoadedDefaultCloneDir(true);
                setIsLoadingDefaultCloneDir(false);
            }
        }
    }, [api, hasLoadedDefaultCloneDir, isLoadingDefaultCloneDir]);
    useEffect(() => {
        if (!props.isOpen) {
            cloneDirLoadNonceRef.current++;
            setMode("pick-folder");
            setCreating(false);
            setDefaultProjectDir("");
            setHasLoadedDefaultCloneDir(false);
            setIsLoadingDefaultCloneDir(false);
            return;
        }
        void ensureDefaultCloneDir();
    }, [ensureDefaultCloneDir, props.isOpen, setCreating]);
    useEffect(() => {
        if (!props.isOpen || mode !== "clone") {
            return;
        }
        void ensureDefaultCloneDir();
    }, [ensureDefaultCloneDir, mode, props.isOpen]);
    const handleModeChange = useCallback((nextMode) => {
        if (nextMode !== "pick-folder" && nextMode !== "clone") {
            return;
        }
        setMode(nextMode);
        if (nextMode === "clone") {
            void ensureDefaultCloneDir();
        }
    }, [ensureDefaultCloneDir]);
    useImperativeHandle(ref, () => ({
        submit: async () => {
            if (mode === "pick-folder") {
                return (await projectCreateFormRef.current?.submit()) ?? false;
            }
            return (await projectCloneFormRef.current?.submit()) ?? false;
        },
        getTrimmedInput: () => {
            if (mode === "pick-folder") {
                return projectCreateFormRef.current?.getTrimmedPath() ?? "";
            }
            return projectCloneFormRef.current?.getTrimmedRepoUrl() ?? "";
        },
        getMode: () => mode,
    }), [mode]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-3", children: [_jsxs(ToggleGroup, { type: "single", value: mode, onValueChange: handleModeChange, disabled: isCreating, className: "h-9 bg-transparent", children: [_jsxs(ToggleGroupItem, { value: "pick-folder", size: "sm", className: "h-7 gap-1.5 px-3 text-[13px]", children: [_jsx(FolderOpen, { className: "h-3.5 w-3.5" }), "Local folder"] }), _jsxs(ToggleGroupItem, { value: "clone", size: "sm", className: "h-7 gap-1.5 px-3 text-[13px]", children: [_jsx(Github, { className: "h-3.5 w-3.5" }), "Clone repo"] })] }), mode === "pick-folder" ? (_jsx(ProjectCreateForm, { ref: projectCreateFormRef, onSuccess: props.onSuccess, onClose: props.onClose, showCancelButton: props.showCancelButton ?? false, autoFocus: props.autoFocus, onIsCreatingChange: setCreating, hideFooter: true })) : (_jsx(ProjectCloneForm, { ref: projectCloneFormRef, onSuccess: props.onSuccess, onClose: props.onClose ?? NOOP, isOpen: props.isOpen, defaultProjectDir: defaultProjectDir, onIsCreatingChange: setCreating, hideFooter: true, autoFocus: props.autoFocus }))] }), !props.hideFooter && (_jsx(ProjectAddFormFooter, { mode: mode, isCreating: isCreating, showCancelButton: props.showCancelButton ?? false, createFormRef: projectCreateFormRef, cloneFormRef: projectCloneFormRef, onClose: props.onClose }))] }));
});
ProjectAddForm.displayName = "ProjectAddForm";
/**
 * Project creation modal that handles the full flow from path input to backend validation.
 *
 * Displays a modal for path input, calls the backend to create the project, and shows
 * validation errors inline. Modal stays open until project is successfully created or user cancels.
 */
export const ProjectCreateModal = ({ isOpen, onClose, onSuccess, }) => {
    const [isCreating, setIsCreating] = useState(false);
    const handleOpenChange = useCallback((open) => {
        if (!open && !isCreating) {
            onClose();
        }
    }, [isCreating, onClose]);
    return (_jsx(Dialog, { open: isOpen, onOpenChange: handleOpenChange, children: _jsxs(DialogContent, { showCloseButton: false, children: [_jsxs(DialogHeader, { children: [_jsx(DialogTitle, { children: "Add Project" }), _jsx(DialogDescription, { children: "Pick a folder or clone a project repository" })] }), _jsx(ProjectAddForm, { isOpen: isOpen, onSuccess: onSuccess, onClose: onClose, showCancelButton: true, autoFocus: true, onIsCreatingChange: setIsCreating })] }) }));
};
//# sourceMappingURL=ProjectCreateModal.js.map