import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from "react";
import setiIconTheme from "@/browser/assets/file-icons/seti-icon-theme.json";
const setiIconDefinitions = setiIconTheme.iconDefinitions;
const setiDefaultIconId = setiIconTheme.file;
const setiFileNames = setiIconTheme.fileNames;
const setiFileExtensions = setiIconTheme.fileExtensions;
const setiLanguageIds = setiIconTheme.languageIds;
const setiDefaultIconDefinition = setiIconDefinitions[setiDefaultIconId] ?? {
    fontCharacter: "\\E023",
};
const decodeFontCharacter = (encoded) => {
    if (!encoded)
        return "";
    if (!encoded.startsWith("\\"))
        return encoded;
    const hex = encoded.slice(1);
    const codePoint = Number.parseInt(hex, 16);
    if (Number.isNaN(codePoint))
        return "";
    return String.fromCodePoint(codePoint);
};
const collectExtensionCandidates = (fileName) => {
    const parts = fileName.split(".");
    if (parts.length <= 1)
        return [];
    const candidates = [];
    for (let i = 1; i < parts.length; i++) {
        const candidate = parts.slice(i).join(".");
        if (candidate) {
            candidates.push(candidate);
        }
    }
    return candidates;
};
const resolveSetiIconId = (fileName) => {
    const direct = setiFileNames[fileName];
    if (direct)
        return direct;
    const lowerName = fileName.toLowerCase();
    if (lowerName !== fileName) {
        const lowerDirect = setiFileNames[lowerName];
        if (lowerDirect)
            return lowerDirect;
    }
    if (fileName.startsWith(".") && fileName.length > 1) {
        const withoutDot = fileName.slice(1);
        const withoutDotMatch = setiFileNames[withoutDot];
        if (withoutDotMatch)
            return withoutDotMatch;
    }
    const extensionCandidates = collectExtensionCandidates(fileName);
    for (const candidate of extensionCandidates) {
        const extMatch = setiFileExtensions[candidate];
        if (extMatch)
            return extMatch;
        const lowerCandidate = candidate.toLowerCase();
        if (lowerCandidate !== candidate) {
            const lowerExtMatch = setiFileExtensions[lowerCandidate];
            if (lowerExtMatch)
                return lowerExtMatch;
        }
    }
    const languageMatch = setiLanguageIds[lowerName];
    if (languageMatch)
        return languageMatch;
    for (const candidate of extensionCandidates) {
        const languageIdMatch = setiLanguageIds[candidate];
        if (languageIdMatch)
            return languageIdMatch;
        const lowerCandidate = candidate.toLowerCase();
        if (lowerCandidate !== candidate) {
            const lowerLanguageIdMatch = setiLanguageIds[lowerCandidate];
            if (lowerLanguageIdMatch)
                return lowerLanguageIdMatch;
        }
    }
    if (fileName.startsWith(".") && fileName.length > 1) {
        const trimmedLower = fileName.slice(1).toLowerCase();
        const trimmedLanguageMatch = setiLanguageIds[trimmedLower];
        if (trimmedLanguageMatch)
            return trimmedLanguageMatch;
    }
    return undefined;
};
const getSetiIconForFile = (fileName) => {
    if (!fileName) {
        return {
            character: decodeFontCharacter(setiDefaultIconDefinition.fontCharacter) || " ",
            color: setiDefaultIconDefinition.fontColor,
        };
    }
    const iconId = resolveSetiIconId(fileName);
    const iconDefinition = iconId ? setiIconDefinitions[iconId] : undefined;
    return {
        character: decodeFontCharacter(iconDefinition?.fontCharacter) ||
            decodeFontCharacter(setiDefaultIconDefinition.fontCharacter) ||
            " ",
        color: iconDefinition?.fontColor ?? setiDefaultIconDefinition.fontColor,
    };
};
const BASE_ICON_STYLE = {
    fontFamily: '"Seti", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "1rem",
    height: "1rem",
    userSelect: "none",
    fontStyle: "normal",
    fontWeight: "normal",
    letterSpacing: "normal",
};
export const FileIcon = ({ fileName, filePath, className, style }) => {
    const targetName = fileName ?? (filePath ? (filePath.split("/").pop() ?? "") : "");
    const icon = useMemo(() => getSetiIconForFile(targetName ?? ""), [targetName]);
    if (!icon.character.trim()) {
        return null;
    }
    return (_jsx("span", { "aria-hidden": "true", className: className ?? undefined, style: { ...BASE_ICON_STYLE, color: icon.color, ...style }, children: icon.character }));
};
//# sourceMappingURL=FileIcon.js.map