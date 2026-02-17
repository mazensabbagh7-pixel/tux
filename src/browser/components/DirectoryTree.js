import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { Folder, FolderUp } from "lucide-react";
export const DirectoryTree = (props) => {
    const { currentPath, entries, isLoading = false, onNavigateTo, onNavigateParent, onConfirm, selectedIndex, onSelectedIndexChange, } = props;
    const hasEntries = entries.length > 0;
    const containerRef = useRef(null);
    const selectedItemRef = useRef(null);
    const [typeAheadBuffer, setTypeAheadBuffer] = useState("");
    const typeAheadTimeoutRef = useRef(null);
    // Total navigable items: parent (..) + entries
    const totalItems = (currentPath ? 1 : 0) + entries.length;
    // Scroll container to top when path changes
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, [currentPath]);
    // Scroll selected item into view
    useEffect(() => {
        if (selectedItemRef.current) {
            selectedItemRef.current.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIndex]);
    // Clear type-ahead buffer after 500ms of inactivity
    const resetTypeAhead = useCallback(() => {
        if (typeAheadTimeoutRef.current) {
            clearTimeout(typeAheadTimeoutRef.current);
        }
        typeAheadTimeoutRef.current = setTimeout(() => {
            setTypeAheadBuffer("");
        }, 500);
    }, []);
    // Handle keyboard navigation
    const handleKeyDown = useCallback((e) => {
        // Type-ahead search for printable characters
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const newBuffer = typeAheadBuffer + e.key.toLowerCase();
            setTypeAheadBuffer(newBuffer);
            resetTypeAhead();
            // Find first entry matching the buffer
            const matchIndex = entries.findIndex((entry) => entry.name.toLowerCase().startsWith(newBuffer));
            if (matchIndex !== -1) {
                // Offset by 1 if parent exists (index 0 is parent)
                const actualIndex = currentPath ? matchIndex + 1 : matchIndex;
                onSelectedIndexChange(actualIndex);
            }
            e.preventDefault();
            return;
        }
        switch (e.key) {
            case "ArrowUp":
                e.preventDefault();
                if (totalItems > 0) {
                    onSelectedIndexChange(selectedIndex <= 0 ? totalItems - 1 : selectedIndex - 1);
                }
                break;
            case "ArrowDown":
                e.preventDefault();
                if (totalItems > 0) {
                    onSelectedIndexChange(selectedIndex >= totalItems - 1 ? 0 : selectedIndex + 1);
                }
                break;
            case "Enter":
                e.preventDefault();
                if (selectedIndex === 0 && currentPath) {
                    // Parent directory selected
                    onNavigateParent();
                }
                else if (entries.length > 0) {
                    // Navigate into selected directory
                    const entryIndex = currentPath ? selectedIndex - 1 : selectedIndex;
                    if (entryIndex >= 0 && entryIndex < entries.length) {
                        onNavigateTo(entries[entryIndex].path);
                    }
                }
                break;
            case "Backspace":
                e.preventDefault();
                if (currentPath) {
                    onNavigateParent();
                }
                break;
            case "o":
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onConfirm();
                }
                break;
        }
    }, [
        selectedIndex,
        totalItems,
        currentPath,
        entries,
        onSelectedIndexChange,
        onNavigateTo,
        onNavigateParent,
        onConfirm,
        typeAheadBuffer,
        resetTypeAhead,
    ]);
    const isSelected = (index) => selectedIndex === index;
    return (_jsx("div", { ref: containerRef, className: "h-full overflow-y-auto p-2 text-sm outline-none", tabIndex: 0, onKeyDown: handleKeyDown, children: isLoading && !currentPath ? (_jsx("div", { className: "text-muted py-4 text-center", children: "Loading directories..." })) : (_jsxs("ul", { className: "m-0 list-none p-0", children: [currentPath && (_jsxs("li", { ref: isSelected(0) ? selectedItemRef : null, className: `text-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${isSelected(0) ? "bg-white/10" : "hover:bg-white/5"}`, onClick: onNavigateParent, children: [_jsx(FolderUp, { size: 16, className: "text-muted shrink-0" }), _jsx("span", { children: ".." })] })), !isLoading && !hasEntries ? (_jsx("li", { className: "text-muted px-2 py-1.5", children: "No subdirectories found" })) : null, entries.map((entry, idx) => {
                    const actualIndex = currentPath ? idx + 1 : idx;
                    return (_jsxs("li", { ref: isSelected(actualIndex) ? selectedItemRef : null, className: `flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${isSelected(actualIndex) ? "bg-white/10" : "hover:bg-white/5"}`, onClick: () => onNavigateTo(entry.path), children: [_jsx(Folder, { size: 16, className: "shrink-0 text-yellow-500/80" }), _jsx("span", { className: "truncate", children: entry.name })] }, entry.path));
                }), isLoading && currentPath && !hasEntries ? (_jsx("li", { className: "text-muted px-2 py-1.5", children: "Loading directories..." })) : null] })) }));
};
//# sourceMappingURL=DirectoryTree.js.map