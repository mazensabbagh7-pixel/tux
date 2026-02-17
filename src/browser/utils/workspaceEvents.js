import { CUSTOM_EVENTS } from "@/common/constants/events";
export function isWorkspaceForkSwitchEvent(event) {
    return event.type === CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH;
}
export function dispatchWorkspaceSwitch(workspaceInfo) {
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.WORKSPACE_FORK_SWITCH, {
        detail: workspaceInfo,
    }));
}
//# sourceMappingURL=workspaceEvents.js.map