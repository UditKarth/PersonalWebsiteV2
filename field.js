(() => {
  "use strict";
  const STEP = 16;
  const FILL = ["#FF0000", "#00FF00", "#0000FF"];
  let canvas, ctx, w = 0, h = 0, half = 0, frame = 0, time = 0, dest = 1, running = false;

  const resize = () => {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    w = canvas.width = Math.max(1, Math.floor(r.width));
    h = canvas.height = Math.max(1, Math.floor(r.height));
    half = w / 2;
    ctx.globalCompositeOperation = "lighter";
  };

  const loop = () => {
    // Bail out of the rAF chain entirely when the section is off screen.
    // Rescheduling first and returning second kept the browser waking 60 times
    // a second to do nothing.
    if (!running) { frame = 0; return; }
    frame = requestAnimationFrame(loop);
    time += (dest - time) * 0.1;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < h; i += STEP) {
      for (let j = STEP; j < half; j += STEP) {
        const index = i * w + j;
        // Does not vary by channel, and was being recomputed six times a cell.
        const alpha = Math.tan(index * index - time);
        const height = alpha * STEP / 2;
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = FILL[c];
          ctx.globalAlpha = alpha;
          ctx.fillRect(
            Math.tan(i * j - Math.sin(index + c / 100) + time) * j + half - STEP / 2,
            i,
            Math.tan(index + i / j + time + c / 100) / 2 * STEP / 2,
            height
          );
        }
      }
    }
  };

  const mount = () => {
    canvas = document.querySelector("[data-field]");
    if (!canvas) return false;
    ctx = canvas.getContext("2d", { alpha: true });
    window.addEventListener("mousemove", (e) => { dest = e.clientX / window.innerWidth; }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (t) dest = t.clientX / window.innerWidth;
    }, { passive: true });
    window.addEventListener("resize", resize);
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible === running) return;
      running = visible;
      if (running && !frame) loop();
    }, { rootMargin: "80px" }).observe(canvas);
    resize();
    loop();
    return true;
  };

  const wait = () => { if (!mount()) requestAnimationFrame(wait); };
  wait();
})();
