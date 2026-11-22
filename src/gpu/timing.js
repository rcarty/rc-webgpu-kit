import { buf } from './resources.js';

// median of `runs` after a warm-up. prepare(encoder) runs before the timed pass
// ms is from timestamp queries if we have them. wallMs is submit to done, always measured
export async function medianGpuTime(device, { runs = 5, prepare, encode }) {
  const timestamps = device.features.has('timestamp-query');
  const querySet = timestamps ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
  const resolve = timestamps
    ? buf(device, 16, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC)
    : null;
  const times = [];
  const walls = [];

  for (let r = 0; r <= runs; r++) {
    // the setup goes in its own submit so the wall clock only sees the pass
    if (prepare) {
      const e0 = device.createCommandEncoder();
      prepare(e0);
      device.queue.submit([e0.finish()]);
    }
    const e = device.createCommandEncoder();
    const pass = e.beginComputePass(
      timestamps
        ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
        : undefined,
    );
    encode(pass);
    pass.end();
    if (timestamps) e.resolveQuerySet(querySet, 0, 2, resolve, 0);

    await device.queue.onSubmittedWorkDone();
    const t0 = performance.now();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    const wall = performance.now() - t0;

    let ms = wall;
    if (timestamps) {
      const rb = buf(device, 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      const e2 = device.createCommandEncoder();
      e2.copyBufferToBuffer(resolve, 0, rb, 0, 16);
      device.queue.submit([e2.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      const ts = new BigUint64Array(rb.getMappedRange());
      ms = Number(ts[1] - ts[0]) / 1e6;
      rb.unmap();
      rb.destroy();
    }
    if (r > 0) {
      times.push(ms);
      walls.push(wall);
    }
  }

  if (querySet) {
    querySet.destroy();
    resolve.destroy();
  }
  const median = a => a.sort((x, y) => x - y)[a.length >> 1];
  return { ms: median(times), wallMs: median(walls), timestamps };
}
