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
    frame = requestAnimationFrame(loop);
    if (!running) return;
    time += (dest - time) * 0.1;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < h; i += STEP) {
      for (let j = STEP; j < half; j += STEP) {
        const index = i * w + j;
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = FILL[c];
          ctx.globalAlpha = Math.tan(index * index - time);
          ctx.fillRect(
            Math.tan(i * j - Math.sin(index + c / 100) + time) * j + half - STEP / 2,
            i,
            Math.tan(index + i / j + time + c / 100) / 2 * STEP / 2,
            Math.tan(index * index - time) * STEP / 2
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
      running = entries.some((e) => e.isIntersecting);
    }, { rootMargin: "80px" }).observe(canvas);
    resize();
    loop();
    return true;
  };

  const wait = () => { if (!mount()) requestAnimationFrame(wait); };
  wait();
})();
