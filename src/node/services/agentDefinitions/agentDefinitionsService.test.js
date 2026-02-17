var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { AgentIdSchema } from "@/common/orpc/schemas";
import { LocalRuntime } from "@/node/runtime/LocalRuntime";
import { DisposableTempDir } from "@/node/services/tempDir";
import { discoverAgentDefinitions, readAgentDefinition, resolveAgentBody, resolveAgentFrontmatter, } from "./agentDefinitionsService";
async function writeAgent(root, id, name) {
    await fs.mkdir(root, { recursive: true });
    const content = `---
name: ${name}
policy:
  base: exec
---
Body
`;
    await fs.writeFile(path.join(root, `${id}.md`), content, "utf-8");
}
describe("agentDefinitionsService", () => {
    test("project agents override global agents", async () => {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const project = __addDisposableResource(env_1, new DisposableTempDir("agent-defs-project"), false);
            const global = __addDisposableResource(env_1, new DisposableTempDir("agent-defs-global"), false);
            const projectAgentsRoot = path.join(project.path, ".mux", "agents");
            const globalAgentsRoot = global.path;
            await writeAgent(globalAgentsRoot, "foo", "Foo (global)");
            await writeAgent(projectAgentsRoot, "foo", "Foo (project)");
            await writeAgent(globalAgentsRoot, "bar", "Bar (global)");
            const roots = { projectRoot: projectAgentsRoot, globalRoot: globalAgentsRoot };
            const runtime = new LocalRuntime(project.path);
            const agents = await discoverAgentDefinitions(runtime, project.path, { roots });
            const foo = agents.find((a) => a.id === "foo");
            expect(foo).toBeDefined();
            expect(foo.scope).toBe("project");
            expect(foo.name).toBe("Foo (project)");
            const bar = agents.find((a) => a.id === "bar");
            expect(bar).toBeDefined();
            expect(bar.scope).toBe("global");
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    });
    test("readAgentDefinition resolves project before global", async () => {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const project = __addDisposableResource(env_2, new DisposableTempDir("agent-defs-project"), false);
            const global = __addDisposableResource(env_2, new DisposableTempDir("agent-defs-global"), false);
            const projectAgentsRoot = path.join(project.path, ".mux", "agents");
            const globalAgentsRoot = global.path;
            await writeAgent(globalAgentsRoot, "foo", "Foo (global)");
            await writeAgent(projectAgentsRoot, "foo", "Foo (project)");
            const roots = { projectRoot: projectAgentsRoot, globalRoot: globalAgentsRoot };
            const runtime = new LocalRuntime(project.path);
            const agentId = AgentIdSchema.parse("foo");
            const pkg = await readAgentDefinition(runtime, project.path, agentId, { roots });
            expect(pkg.scope).toBe("project");
            expect(pkg.frontmatter.name).toBe("Foo (project)");
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    });
    test("resolveAgentBody appends by default (new default), replaces when prompt.append is false", async () => {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_3, new DisposableTempDir("agent-body-test"), false);
            const agentsRoot = path.join(tempDir.path, ".mux", "agents");
            await fs.mkdir(agentsRoot, { recursive: true });
            // Create base agent
            await fs.writeFile(path.join(agentsRoot, "base.md"), `---
name: Base
tools:
  add:
    - .*
---
Base instructions.
`, "utf-8");
            // Create child agent that appends (default behavior)
            await fs.writeFile(path.join(agentsRoot, "child.md"), `---
name: Child
base: base
---
Child additions.
`, "utf-8");
            // Create another child that explicitly replaces
            await fs.writeFile(path.join(agentsRoot, "replacer.md"), `---
name: Replacer
base: base
prompt:
  append: false
---
Replaced body.
`, "utf-8");
            const roots = { projectRoot: agentsRoot, globalRoot: agentsRoot };
            const runtime = new LocalRuntime(tempDir.path);
            // Child without explicit prompt settings should append (new default)
            const childBody = await resolveAgentBody(runtime, tempDir.path, "child", { roots });
            expect(childBody).toContain("Base instructions.");
            expect(childBody).toContain("Child additions.");
            // Child with prompt.append: false should replace (explicit opt-out)
            const replacerBody = await resolveAgentBody(runtime, tempDir.path, "replacer", { roots });
            expect(replacerBody).toBe("Replaced body.\n");
            expect(replacerBody).not.toContain("Base instructions");
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    });
    test("same-name override: project agent with base: self extends built-in/global, not itself", async () => {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const project = __addDisposableResource(env_4, new DisposableTempDir("agent-same-name"), false);
            const global = __addDisposableResource(env_4, new DisposableTempDir("agent-same-name-global"), false);
            const projectAgentsRoot = path.join(project.path, ".mux", "agents");
            const globalAgentsRoot = global.path;
            await fs.mkdir(projectAgentsRoot, { recursive: true });
            await fs.mkdir(globalAgentsRoot, { recursive: true });
            // Global "foo" agent (simulates built-in or global config)
            await fs.writeFile(path.join(globalAgentsRoot, "foo.md"), `---
name: Foo
tools:
  add:
    - .*
---
Global foo instructions.
`, "utf-8");
            // Project-local "foo" agent that extends the global one via base: foo
            // This should NOT cause a circular dependency (would previously infinite loop)
            await fs.writeFile(path.join(projectAgentsRoot, "foo.md"), `---
name: Foo
base: foo
---
Project-specific additions.
`, "utf-8");
            const roots = { projectRoot: projectAgentsRoot, globalRoot: globalAgentsRoot };
            const runtime = new LocalRuntime(project.path);
            // Verify project agent is discovered
            const agents = await discoverAgentDefinitions(runtime, project.path, { roots });
            const foo = agents.find((a) => a.id === "foo");
            expect(foo).toBeDefined();
            expect(foo.scope).toBe("project");
            expect(foo.base).toBe("foo"); // Points to itself by name
            // Verify body resolution correctly inherits from global (not self)
            const body = await resolveAgentBody(runtime, project.path, "foo", { roots });
            expect(body).toContain("Global foo instructions.");
            expect(body).toContain("Project-specific additions.");
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    });
    test("readAgentDefinition with skipScopesAbove skips higher-priority scopes", async () => {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const project = __addDisposableResource(env_5, new DisposableTempDir("agent-skip-scope"), false);
            const global = __addDisposableResource(env_5, new DisposableTempDir("agent-skip-scope-global"), false);
            const projectAgentsRoot = path.join(project.path, ".mux", "agents");
            const globalAgentsRoot = global.path;
            await fs.mkdir(projectAgentsRoot, { recursive: true });
            await fs.mkdir(globalAgentsRoot, { recursive: true });
            await fs.writeFile(path.join(globalAgentsRoot, "test.md"), `---
name: Test Global
---
Global body.
`, "utf-8");
            await fs.writeFile(path.join(projectAgentsRoot, "test.md"), `---
name: Test Project
---
Project body.
`, "utf-8");
            const roots = { projectRoot: projectAgentsRoot, globalRoot: globalAgentsRoot };
            const runtime = new LocalRuntime(project.path);
            // Without skip: project takes precedence
            const normalPkg = await readAgentDefinition(runtime, project.path, "test", { roots });
            expect(normalPkg.scope).toBe("project");
            expect(normalPkg.frontmatter.name).toBe("Test Project");
            // With skipScopesAbove: "project" → skip project, return global
            const skippedPkg = await readAgentDefinition(runtime, project.path, "test", {
                roots,
                skipScopesAbove: "project",
            });
            expect(skippedPkg.scope).toBe("global");
            expect(skippedPkg.frontmatter.name).toBe("Test Global");
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    });
    test("resolveAgentFrontmatter inherits omitted fields from base chain (same-name override)", async () => {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const project = __addDisposableResource(env_6, new DisposableTempDir("agent-frontmatter-project"), false);
            const global = __addDisposableResource(env_6, new DisposableTempDir("agent-frontmatter-global"), false);
            const projectAgentsRoot = path.join(project.path, ".mux", "agents");
            const globalAgentsRoot = global.path;
            await fs.mkdir(projectAgentsRoot, { recursive: true });
            await fs.mkdir(globalAgentsRoot, { recursive: true });
            await fs.writeFile(path.join(globalAgentsRoot, "foo.md"), `---
name: Foo Base
description: Base description
ui:
  hidden: true
  color: red
  requires:
    - plan
subagent:
  runnable: true
  append_prompt: Base subagent prompt
  skip_init_hook: true
ai:
  model: base-model
  thinkingLevel: high
tools:
  add:
    - baseAdd
  remove:
    - baseRemove
---
Base body.
`, "utf-8");
            await fs.writeFile(path.join(projectAgentsRoot, "foo.md"), `---
name: Foo Project
base: foo
ui:
  color: blue
---
Project body.
`, "utf-8");
            const roots = { projectRoot: projectAgentsRoot, globalRoot: globalAgentsRoot };
            const runtime = new LocalRuntime(project.path);
            const frontmatter = await resolveAgentFrontmatter(runtime, project.path, "foo", { roots });
            expect(frontmatter.description).toBe("Base description");
            expect(frontmatter.ui?.hidden).toBe(true);
            expect(frontmatter.ui?.color).toBe("blue");
            expect(frontmatter.ui?.requires).toEqual(["plan"]);
            expect(frontmatter.subagent?.runnable).toBe(true);
            expect(frontmatter.subagent?.append_prompt).toBe("Base subagent prompt");
            expect(frontmatter.subagent?.skip_init_hook).toBe(true);
            expect(frontmatter.ai?.model).toBe("base-model");
            expect(frontmatter.ai?.thinkingLevel).toBe("high");
            expect(frontmatter.tools?.add).toEqual(["baseAdd"]);
            expect(frontmatter.tools?.remove).toEqual(["baseRemove"]);
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    });
    test("resolveAgentFrontmatter preserves explicit falsy overrides", async () => {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_7, new DisposableTempDir("agent-frontmatter-falsy"), false);
            const agentsRoot = path.join(tempDir.path, ".mux", "agents");
            await fs.mkdir(agentsRoot, { recursive: true });
            await fs.writeFile(path.join(agentsRoot, "base.md"), `---
name: Base
ui:
  hidden: true
subagent:
  runnable: true
  skip_init_hook: true
---
`, "utf-8");
            await fs.writeFile(path.join(agentsRoot, "child.md"), `---
name: Child
base: base
ui:
  hidden: false
subagent:
  runnable: false
  skip_init_hook: false
---
`, "utf-8");
            const roots = { projectRoot: agentsRoot, globalRoot: agentsRoot };
            const runtime = new LocalRuntime(tempDir.path);
            const frontmatter = await resolveAgentFrontmatter(runtime, tempDir.path, "child", { roots });
            expect(frontmatter.ui?.hidden).toBe(false);
            expect(frontmatter.subagent?.runnable).toBe(false);
            expect(frontmatter.subagent?.skip_init_hook).toBe(false);
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    });
    test("resolveAgentFrontmatter concatenates tools.add/tools.remove (base first)", async () => {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_8, new DisposableTempDir("agent-frontmatter-tools"), false);
            const agentsRoot = path.join(tempDir.path, ".mux", "agents");
            await fs.mkdir(agentsRoot, { recursive: true });
            await fs.writeFile(path.join(agentsRoot, "base.md"), `---
name: Base
tools:
  add:
    - a
  remove:
    - b
---
`, "utf-8");
            await fs.writeFile(path.join(agentsRoot, "child.md"), `---
name: Child
base: base
tools:
  add:
    - c
  remove:
    - d
---
`, "utf-8");
            const roots = { projectRoot: agentsRoot, globalRoot: agentsRoot };
            const runtime = new LocalRuntime(tempDir.path);
            const frontmatter = await resolveAgentFrontmatter(runtime, tempDir.path, "child", { roots });
            expect(frontmatter.tools?.add).toEqual(["a", "c"]);
            expect(frontmatter.tools?.remove).toEqual(["b", "d"]);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    });
    test("resolveAgentFrontmatter detects cycles", async () => {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const tempDir = __addDisposableResource(env_9, new DisposableTempDir("agent-frontmatter-cycle"), false);
            const agentsRoot = path.join(tempDir.path, ".mux", "agents");
            await fs.mkdir(agentsRoot, { recursive: true });
            await fs.writeFile(path.join(agentsRoot, "a.md"), `---
name: A
base: b
---
`, "utf-8");
            await fs.writeFile(path.join(agentsRoot, "b.md"), `---
name: B
base: a
---
`, "utf-8");
            const roots = { projectRoot: agentsRoot, globalRoot: agentsRoot };
            const runtime = new LocalRuntime(tempDir.path);
            expect(resolveAgentFrontmatter(runtime, tempDir.path, "a", { roots })).rejects.toThrow("Circular agent inheritance detected");
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    });
});
//# sourceMappingURL=agentDefinitionsService.test.js.map