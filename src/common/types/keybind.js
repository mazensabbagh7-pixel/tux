import assert from "@/common/utils/assert";
export function hasModifierKeybind(keybind) {
    return [keybind.ctrl, keybind.shift, keybind.alt, keybind.meta].some((v) => v === true);
}
export function normalizeKeybind(raw) {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const record = raw;
    const rawKey = typeof record.key === "string" ? record.key : "";
    const key = rawKey === " " ? rawKey : rawKey.trim();
    if (!key) {
        return undefined;
    }
    const allowShift = typeof record.allowShift === "boolean" ? record.allowShift : undefined;
    const ctrl = typeof record.ctrl === "boolean" ? record.ctrl : undefined;
    const shift = typeof record.shift === "boolean" ? record.shift : undefined;
    const alt = typeof record.alt === "boolean" ? record.alt : undefined;
    const meta = typeof record.meta === "boolean" ? record.meta : undefined;
    const macCtrlBehavior = record.macCtrlBehavior === "either" ||
        record.macCtrlBehavior === "command" ||
        record.macCtrlBehavior === "control"
        ? record.macCtrlBehavior
        : undefined;
    const result = {
        key,
        allowShift,
        ctrl,
        shift,
        alt,
        meta,
        macCtrlBehavior,
    };
    assert(typeof result.key === "string" && result.key.length > 0, "Keybind.key must be non-empty");
    return result;
}
//# sourceMappingURL=keybind.js.map