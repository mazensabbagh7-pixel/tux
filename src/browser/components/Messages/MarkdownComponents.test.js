import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { ThemeProvider } from "@/browser/contexts/ThemeContext";
import { MessageListProvider } from "./MessageListContext";
import { markdownComponents } from "./MarkdownComponents";
describe("MarkdownComponents command code blocks", () => {
    beforeEach(() => {
        globalThis.window = new GlobalWindow();
        globalThis.document = globalThis.window.document;
    });
    afterEach(() => {
        cleanup();
        globalThis.window = undefined;
        globalThis.document = undefined;
    });
    test("shows a Run button for bash blocks when terminal is available", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-bash",
            children: "$ npm install\n",
        });
        const { getByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        const runButton = getByRole("button", { name: "Run command" });
        fireEvent.click(runButton);
        expect(openTerminal).toHaveBeenCalledWith({ initialCommand: "npm install" });
    });
    test("strips PowerShell prompts", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-powershell",
            children: "PS C:\\Users\\mike> npm install mux\n",
        });
        const { getByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        const runButton = getByRole("button", { name: "Run command" });
        fireEvent.click(runButton);
        expect(openTerminal).toHaveBeenCalledWith({
            initialCommand: "npm install mux",
        });
    });
    test("strips cmd.exe prompts", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-cmd",
            children: "C:\\Users\\mike> dir\n",
        });
        const { getByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        const runButton = getByRole("button", { name: "Run command" });
        fireEvent.click(runButton);
        expect(openTerminal).toHaveBeenCalledWith({
            initialCommand: "dir",
        });
    });
    test("strips cmd.exe continuation prompts", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-cmd",
            children: "C:\\> echo foo ^\n>bar\n",
        });
        const { getByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        const runButton = getByRole("button", { name: "Run command" });
        fireEvent.click(runButton);
        expect(openTerminal).toHaveBeenCalledWith({
            initialCommand: "echo foo ^\nbar",
        });
    });
    test("strips multiline continuation prompts after a $ shell prompt", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-bash",
            children: "$ cat <<EOF\n> line 1\n> EOF\n",
        });
        const { getByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        const runButton = getByRole("button", { name: "Run command" });
        fireEvent.click(runButton);
        expect(openTerminal).toHaveBeenCalledWith({
            initialCommand: "cat <<EOF\nline 1\nEOF",
        });
    });
    test("does not show Run button for shell-session transcripts", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-shell-session",
            children: "$ echo hello\nhello\n",
        });
        const { queryByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        expect(queryByRole("button", { name: "Run command" })).toBeNull();
    });
    test("does not show Run button for non-shell languages", () => {
        const openTerminal = mock(() => undefined);
        const element = markdownComponents.code({
            inline: false,
            className: "language-typescript",
            children: "console.log('hello')\n",
        });
        const { queryByRole } = render(_jsx(ThemeProvider, { forcedTheme: "dark", children: _jsx(MessageListProvider, { value: {
                    workspaceId: "ws-1",
                    latestMessageId: null,
                    openTerminal,
                }, children: element }) }));
        expect(queryByRole("button", { name: "Run command" })).toBeNull();
    });
});
//# sourceMappingURL=MarkdownComponents.test.js.map