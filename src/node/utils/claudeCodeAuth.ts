import { readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CLAUDE_CODE_OAUTH_BETA_HEADER = "oauth-2025-04-20";
export const CLAUDE_CODE_DEFAULT_CREDENTIALS_PATH = "~/.claude/.credentials.json";

interface ClaudeCodeCredentialsFile {
  claudeAiOauth?: {
    accessToken?: unknown;
    expiresAt?: unknown;
  };
}

export const CLAUDE_CODE_SYSTEM_PROMPT = "You are Claude Code, Anthropic's official CLI for Claude.";

export interface ClaudeCodeAuth {
  accessToken: string;
  expiresAt?: number;
  credentialsPath: string;
}

function expandHomePath(filePath: string): string {
  return filePath.startsWith("~") ? path.join(os.homedir(), filePath.slice(1)) : filePath;
}

function getCredentialsPath(): string {
  const configuredPath = process.env.CLAUDE_CODE_CREDENTIALS_PATH?.trim();
  return configuredPath === undefined || configuredPath.length === 0
    ? CLAUDE_CODE_DEFAULT_CREDENTIALS_PATH
    : configuredPath;
}

export function resolveClaudeCodeCredentialsPath(): string {
  return expandHomePath(getCredentialsPath());
}

export function readClaudeCodeAuth(nowMs = Date.now()): ClaudeCodeAuth | null {
  const credentialsPath = resolveClaudeCodeCredentialsPath();

  try {
    const stat = statSync(credentialsPath);
    if (!stat.isFile() || stat.size > 65536) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(credentialsPath, "utf-8")) as ClaudeCodeCredentialsFile;
    const oauth = parsed.claudeAiOauth;
    const accessToken = typeof oauth?.accessToken === "string" ? oauth.accessToken.trim() : "";
    if (!accessToken) {
      return null;
    }

    const expiresAt = typeof oauth?.expiresAt === "number" ? oauth.expiresAt : undefined;
    if (expiresAt !== undefined && expiresAt <= nowMs + 60_000) {
      return null;
    }

    return { accessToken, expiresAt, credentialsPath };
  } catch {
    return null;
  }
}

export function isClaudeCodeAuthenticated(): boolean {
  return readClaudeCodeAuth() !== null;
}
