/** Timer handles for one auto-scroll run: the initial dwell delay, then the repeat interval. */
export interface AutoScrollTimer {
  delay?: ReturnType<typeof setTimeout>;
  interval?: ReturnType<typeof setInterval>;
}

/**
 * Start auto-scrolling unless it is already running or waiting out its delay.
 * `tick` runs after `initialDelay` ms (at once when 0), then every `intervalLength` ms.
 */
export const startAutoScrollTimer = (
  timer: AutoScrollTimer,
  tick: () => void,
  intervalLength: number,
  initialDelay: number
) => {
  if (timer.delay !== undefined || timer.interval !== undefined) return;
  const run = () => {
    timer.delay = undefined;
    tick();
    timer.interval = setInterval(tick, intervalLength);
  };
  if (initialDelay > 0) {
    timer.delay = setTimeout(run, initialDelay);
  } else {
    run();
  }
};

/** Stop auto-scrolling. A pending initial delay is cancelled, so the next start waits the full delay again. */
export const stopAutoScrollTimer = (timer: AutoScrollTimer) => {
  clearTimeout(timer.delay);
  clearInterval(timer.interval);
  timer.delay = undefined;
  timer.interval = undefined;
};
