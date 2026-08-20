/* Shared glitch text effect. window.Glitch.{scramble, restore, wireHover, bootAll} */
(function () {
  const GLYPHS = "/\\<>[]{}()#$%&*+=_-|:;!?01234567xyz";

  function scramble(el, opts) {
    if (!el) return;
    const o = opts || {};
    const text = el.dataset.glitchSrc !== undefined ? el.dataset.glitchSrc : (el.dataset.glitchSrc = el.textContent);
    if (!text) return;
    if (el._glitchRaf) cancelAnimationFrame(el._glitchRaf);
    const hold = o.hold === undefined ? 150 : o.hold;
    const per = o.per === undefined ? 58 : o.per;
    const dur = hold + Math.min(1150, Math.max(420, text.length * per));
    const t0 = performance.now();
    const step = () => {
      const t = performance.now() - t0;
      const p = Math.max(0, (t - hold) / (dur - hold));
      const settled = Math.floor(p * text.length);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        out += (i < settled || ch === " ") ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (t < dur) el._glitchRaf = requestAnimationFrame(step);
      else { el._glitchRaf = null; el.textContent = text; }
    };
    el._glitchRaf = requestAnimationFrame(step);
  }

  function restore(el) {
    if (!el) return;
    if (el._glitchRaf) { cancelAnimationFrame(el._glitchRaf); el._glitchRaf = null; }
    if (el.dataset.glitchSrc !== undefined) el.textContent = el.dataset.glitchSrc;
  }

  function targetOf(el) {
    return el.querySelector("[data-glitch-text]") || el;
  }

  /* Any [data-glitch] element scrambles its [data-glitch-text] child (or itself) on hover/focus. */
  function wireHover(root) {
    (root || document).querySelectorAll("[data-glitch]").forEach((el) => {
      if (el._glitchWired) return;
      el._glitchWired = true;
      const t = targetOf(el);
      el.addEventListener("pointerenter", () => scramble(t));
      el.addEventListener("pointerleave", () => restore(t));
      el.addEventListener("focus", () => scramble(t));
      el.addEventListener("blur", () => restore(t));
    });
  }

  /* One-shot decrypt for anything marked [data-glitch-boot], staggered in DOM order. */
  function bootAll(root, opts) {
    const els = Array.from((root || document).querySelectorAll("[data-glitch-boot]"));
    els.forEach((el, i) => setTimeout(() => scramble(el, opts), i * 90));
  }

  window.Glitch = { scramble, restore, wireHover, bootAll, GLYPHS };
})();
