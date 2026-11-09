import { flushSync } from "react-dom";

const INTERACTIVE =
  ".glass-interactive, a.metric, .feature-card, .recent-item, .primary, .secondary, .sidebar nav a, .tabs button";

/** Brilho especular que acompanha o ponteiro nos elementos de vidro interativos. */
export function trackGlassPointer() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let frame = 0;
  document.addEventListener(
    "pointermove",
    (e) => {
      const el = e.target instanceof Element && e.target.closest(INTERACTIVE);
      if (!el || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    },
    { passive: true },
  );
}

/** Troca de estado com "morphing" (View Transitions); sem suporte, troca direto. */
export function morph(update) {
  if (!document.startViewTransition) return update();
  document.startViewTransition(() => flushSync(update));
}
