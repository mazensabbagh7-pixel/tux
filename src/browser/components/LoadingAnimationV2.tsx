import { useTheme } from "@/browser/contexts/ThemeContext";
import { useReducedMotion } from "@/browser/hooks/useReducedMotion";

/**
 * POC: "mux kicks block" loader animation.
 *
 * Pure CSS/SVG — no Lottie, no new dependencies.
 * The "x" in "mux" swings like a leg kick, launching the block into a
 * decreasing-height bounce arc before it slides back for a seamless loop.
 *
 * Respects prefers-reduced-motion (renders static).
 * Handles dark/light theme via the same brightness-0 invert filter as V1.
 */

// CSS keyframes injected only when animation is active.
// Uses "mux-loader-" prefix to avoid collisions with other animations.
const KEYFRAME_CSS = `
@keyframes mux-loader-kick {
  0%, 12%   { transform: rotate(0deg); }
  20%       { transform: rotate(25deg); }
  28%       { transform: rotate(-10deg); }
  36%, 100% { transform: rotate(0deg); }
}
@keyframes mux-loader-bounce {
  0%, 18%    { transform: translate(0px, 0px); }
  28%        { transform: translate(8px, -16px); }
  38%        { transform: translate(14px, 0px); }
  46%        { transform: translate(17px, -8px); }
  54%        { transform: translate(20px, 0px); }
  60%        { transform: translate(21px, -3px); }
  66%        { transform: translate(22px, 0px); }
  82%, 100%  { transform: translate(0px, 0px); }
}`;

interface LoadingAnimationV2Props {
  className?: string;
}

export function LoadingAnimationV2(props: LoadingAnimationV2Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || theme.endsWith("-dark");
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={`inline-flex items-center ${props.className ?? ""}`}>
      {/* Only inject animation keyframes when motion is allowed */}
      {!prefersReducedMotion && <style>{KEYFRAME_CSS}</style>}
      <svg
        viewBox="0 0 170 50"
        className={`w-[150px] ${isDark ? "brightness-0 invert" : ""}`}
        aria-hidden="true"
      >
        {/* "mu" — static letters */}
        <text
          data-testid="mux-mu"
          x="0"
          y="38"
          fontFamily="system-ui, sans-serif"
          fontWeight="700"
          fontSize="42"
          fill="black"
        >
          mu
        </text>

        {/* "x" — kicks the block; pivots from bottom-left of the letterform */}
        <g
          className={!prefersReducedMotion ? "mux-loader-kick" : undefined}
          style={
            !prefersReducedMotion
              ? {
                  transformOrigin: "88px 42px",
                  animation: "mux-loader-kick 2.5s ease-in-out infinite",
                }
              : undefined
          }
        >
          <text
            data-testid="mux-x"
            x="82"
            y="38"
            fontFamily="system-ui, sans-serif"
            fontWeight="700"
            fontSize="42"
            fill="black"
          >
            x
          </text>
        </g>

        {/* Block — bounces after the kick */}
        <g
          className={!prefersReducedMotion ? "mux-loader-bounce" : undefined}
          style={
            !prefersReducedMotion
              ? {
                  animation: "mux-loader-bounce 2.5s ease-in-out infinite",
                }
              : undefined
          }
        >
          <rect data-testid="mux-block" x="118" y="12" width="22" height="28" rx="2" fill="black" />
        </g>
      </svg>
    </div>
  );
}
