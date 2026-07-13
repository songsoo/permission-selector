import { useTooltip } from "../lib/useTooltip.js";
import { useTooltipPosition } from "../lib/tooltipPosition.js";
import Portal from "../lib/Portal.jsx";

export default function HelpTooltip({ text }) {
  const { open, ref, bubbleRef, handlers, bubbleHandlers } = useTooltip();
  const pos = useTooltipPosition(open, ref, bubbleRef);

  return (
    <span class="help-tooltip" ref={ref} {...handlers}>
      ?
      {open && (
        <Portal>
          <span
            ref={bubbleRef}
            {...bubbleHandlers}
            class={`help-tooltip-bubble${pos?.below ? " is-below" : ""}`}
            style={
              pos
                ? { top: pos.top + "px", left: pos.left + "px" }
                : { top: "-9999px", left: "-9999px", visibility: "hidden" }
            }
          >
            {text}
          </span>
        </Portal>
      )}
    </span>
  );
}
