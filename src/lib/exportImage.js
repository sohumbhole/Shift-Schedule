import html2canvas from "html2canvas";

// html2canvas 1.4.1 figures out where a font's baseline sits by dropping a 1x1
// <img> next to a sample <span> and reading img.offsetTop. That measurement only
// works while the img is inline. Tailwind's preflight sets
// `img, svg, video, ... { display: block; vertical-align: middle }`, which knocks
// the probe onto its own line and inflates the measured baseline by roughly a
// line height, so every glyph gets painted about 6px lower than the browser puts
// it. Plain text hides the shift, but a bordered box (the tentative shift
// outline) ends up with its border slicing through the time text.
//
// Forcing the probe back to inline for the duration of the render restores the
// correct baseline. The selector only matches html2canvas's own 1x1 measuring
// img, and the rule is removed as soon as the render finishes.
const BASELINE_PROBE_FIX =
  'img[width="1"][height="1"]{display:inline !important;vertical-align:baseline !important}';

export async function renderNodeToCanvas(node, options) {
  const style = document.createElement("style");
  style.textContent = BASELINE_PROBE_FIX;
  document.head.appendChild(style);
  try {
    return await html2canvas(node, options);
  } finally {
    style.remove();
  }
}
