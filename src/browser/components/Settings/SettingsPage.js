import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Settings, Key, Cpu, X, FlaskConical, Bot, Keyboard, Layout, BrainCircuit, ShieldCheck, Server, Lock, } from "lucide-react";
import { useSettings } from "@/browser/contexts/SettingsContext";
import { useExperimentValue } from "@/browser/hooks/useExperiments";
import { EXPERIMENT_IDS } from "@/common/constants/experiments";
import { GeneralSection } from "./sections/GeneralSection";
import { TasksSection } from "./sections/TasksSection";
import { ProvidersSection } from "./sections/ProvidersSection";
import { ModelsSection } from "./sections/ModelsSection";
import { System1Section } from "./sections/System1Section";
import { GovernorSection } from "./sections/GovernorSection";
import { Button } from "@/browser/components/ui/button";
import { MCPSettingsSection } from "./sections/MCPSettingsSection";
import { SecretsSection } from "./sections/SecretsSection";
import { LayoutsSection } from "./sections/LayoutsSection";
import { ExperimentsSection } from "./sections/ExperimentsSection";
import { KeybindsSection } from "./sections/KeybindsSection";
const BASE_SECTIONS = [
    {
        id: "general",
        label: "General",
        icon: _jsx(Settings, { className: "h-4 w-4" }),
        component: GeneralSection,
    },
    {
        id: "tasks",
        label: "Agents",
        icon: _jsx(Bot, { className: "h-4 w-4" }),
        component: TasksSection,
    },
    {
        id: "providers",
        label: "Providers",
        icon: _jsx(Key, { className: "h-4 w-4" }),
        component: ProvidersSection,
    },
    {
        id: "models",
        label: "Models",
        icon: _jsx(Cpu, { className: "h-4 w-4" }),
        component: ModelsSection,
    },
    {
        id: "mcp",
        label: "MCP",
        icon: _jsx(Server, { className: "h-4 w-4" }),
        component: MCPSettingsSection,
    },
    {
        id: "secrets",
        label: "Secrets",
        icon: _jsx(Lock, { className: "h-4 w-4" }),
        component: SecretsSection,
    },
    {
        id: "layouts",
        label: "Layouts",
        icon: _jsx(Layout, { className: "h-4 w-4" }),
        component: LayoutsSection,
    },
    {
        id: "experiments",
        label: "Experiments",
        icon: _jsx(FlaskConical, { className: "h-4 w-4" }),
        component: ExperimentsSection,
    },
    {
        id: "keybinds",
        label: "Keybinds",
        icon: _jsx(Keyboard, { className: "h-4 w-4" }),
        component: KeybindsSection,
    },
];
export function SettingsPage(_props) {
    const { close, activeSection, setActiveSection } = useSettings();
    const system1Enabled = useExperimentValue(EXPERIMENT_IDS.SYSTEM_1);
    const governorEnabled = useExperimentValue(EXPERIMENT_IDS.MUX_GOVERNOR);
    // Keep routing on a valid section when an experiment-gated section is disabled.
    React.useEffect(() => {
        if (!system1Enabled && activeSection === "system1") {
            setActiveSection(BASE_SECTIONS[0]?.id ?? "general");
        }
        if (!governorEnabled && activeSection === "governor") {
            setActiveSection(BASE_SECTIONS[0]?.id ?? "general");
        }
    }, [activeSection, setActiveSection, system1Enabled, governorEnabled]);
    let sections = BASE_SECTIONS;
    if (system1Enabled) {
        sections = [
            ...sections,
            {
                id: "system1",
                label: "System 1",
                icon: _jsx(BrainCircuit, { className: "h-4 w-4" }),
                component: System1Section,
            },
        ];
    }
    if (governorEnabled) {
        sections = [
            ...sections,
            {
                id: "governor",
                label: "Governor",
                icon: _jsx(ShieldCheck, { className: "h-4 w-4" }),
                component: GovernorSection,
            },
        ];
    }
    const currentSection = sections.find((section) => section.id === activeSection) ?? sections[0];
    const SectionComponent = currentSection.component;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex min-h-0 flex-1 flex-col overflow-hidden bg-dark", children: _jsxs("div", { className: "flex min-h-0 flex-1 overflow-hidden", children: [_jsxs("aside", { className: "border-border-medium flex w-48 shrink-0 flex-col border-r", children: [_jsx("div", { className: "border-border-medium flex h-12 items-center border-b px-4", children: _jsx("span", { className: "text-foreground text-sm font-semibold", children: "Settings" }) }), _jsx("nav", { className: "flex flex-1 flex-col gap-1 overflow-y-auto p-2", children: sections.map((section) => (_jsxs(Button, { variant: "ghost", onClick: () => setActiveSection(section.id), className: `flex h-auto w-full items-center justify-start gap-2 rounded-md px-3 py-2 text-left text-sm ${activeSection === section.id
                                    ? "bg-accent/20 text-accent hover:bg-accent/20 hover:text-accent"
                                    : "text-muted hover:bg-hover hover:text-foreground"}`, children: [section.icon, section.label] }, section.id))) })] }), _jsxs("div", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: [_jsxs("div", { className: "border-border-medium flex h-12 items-center justify-between border-b px-6", children: [_jsx("span", { className: "text-foreground text-sm font-medium", children: currentSection.label }), _jsx(Button, { variant: "ghost", size: "icon", onClick: close, className: "h-6 w-6", "aria-label": "Close settings", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto p-4 md:p-6", children: _jsx(SectionComponent, {}) })] })] }) }));
}
//# sourceMappingURL=SettingsPage.js.map