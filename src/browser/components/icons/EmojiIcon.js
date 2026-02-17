import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/common/lib/utils";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Beaker, Bell, BookOpen, Check, Circle, CircleHelp, CircleDot, Globe, Hourglass, Lightbulb, Link, Moon, Package, PenLine, RefreshCw, Rocket, Search, Sparkles, Square, Sun, Wrench, X, } from "lucide-react";
function normalizeEmoji(emoji) {
    // Normalize variation selectors so both "⚠" and "⚠️" map consistently.
    return emoji.replaceAll("\uFE0F", "");
}
const EMOJI_TO_ICON = {
    // Status / activity
    "🔍": Search,
    "📝": PenLine,
    "✏": PenLine,
    "✅": Check,
    "❌": X,
    "🚀": Rocket,
    "⏳": Hourglass,
    "⌛": Hourglass,
    "🔗": Link,
    "🔄": RefreshCw,
    "🧪": Beaker,
    // Directions
    "➡": ArrowRight,
    "⬅": ArrowLeft,
    "⬆": ArrowUp,
    "⬇": ArrowDown,
    // Weather / misc
    "☀": Sun,
    // Tool-ish / app-ish
    "🔧": Wrench,
    "🔔": Bell,
    "🌐": Globe,
    "📖": BookOpen,
    "⏹": Square,
    "📦": Package,
    "💤": Moon,
    "❓": CircleHelp,
    // Generic glyphs used as UI status icons
    "✓": Check,
    "○": Circle,
    "◎": CircleDot,
    "✗": X,
    "⚠": AlertTriangle,
    "💡": Lightbulb,
};
const SPINNING_EMOJI = new Set([
    // In tool output and agent status, these represent "refreshing".
    "🔄",
]);
export function getIconForEmoji(emoji) {
    const normalized = normalizeEmoji(emoji);
    return EMOJI_TO_ICON[normalized];
}
export function EmojiIcon(props) {
    if (!props.emoji)
        return null;
    const normalizedEmoji = normalizeEmoji(props.emoji);
    const Icon = EMOJI_TO_ICON[normalizedEmoji] ?? Sparkles;
    const shouldSpin = props.spin ?? SPINNING_EMOJI.has(normalizedEmoji);
    return _jsx(Icon, { "aria-hidden": "true", className: cn(props.className, shouldSpin && "animate-spin") });
}
//# sourceMappingURL=EmojiIcon.js.map