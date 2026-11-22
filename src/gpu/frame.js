// rAF loop that stops off screen and skips frames while the GPU is more than a frame behind
// return false from render if it didn't submit anything
export function frameLoop(device, element, render) {
  let visible = true;
  let running = false;
  let inflight = 0;
  let last = performance.now();

  const tick = now => {
    if (!visible) {
      running = false;
      return;
    }
    requestAnimationFrame(tick);
    if (inflight > 1) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (render(now, dt) === false) return;
    inflight++;
    device.queue.onSubmittedWorkDone().then(() => inflight--);
  };
  const start = () => {
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    }
  };

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }).observe(element);
  start();
}
