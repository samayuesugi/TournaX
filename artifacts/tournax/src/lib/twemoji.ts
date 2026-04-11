import twemoji from "twemoji";

export function parseTwemoji(el: HTMLElement | null) {
  if (!el) return;
  twemoji.parse(el, {
    folder: "svg",
    ext: ".svg",
    base: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/",
    className: "twemoji",
  });
}
