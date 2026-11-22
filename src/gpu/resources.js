export const buf = (device, size, usage) =>
  device.createBuffer({ size: Math.max(16, size), usage });

// data is a typed array or an array of u32
export function uniform(device, data) {
  const src = ArrayBuffer.isView(data) ? data : new Uint32Array(data);
  const b = buf(device, src.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(b, 0, src);
  return b;
}

// resources in binding order: buffers, { buffer, offset, size } or texture views
export function bind(device, pipeline, resources) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: resources.map((r, binding) => ({
      binding,
      resource: r instanceof GPUBuffer ? { buffer: r } : r,
    })),
  });
}

export function computePipeline(device, code) {
  return device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code }), entryPoint: 'main' },
  });
}

// 1D job split over x/y to stay under the dispatch limit, with as few spare groups as it can
// shaders rebuild i = x + y * num_workgroups.x
export function dispatchSize(n) {
  const rows = Math.max(1, Math.ceil(n / 65535));
  return [Math.ceil(n / rows), rows];
}

// tracks buffers so destroy() can free them
export function owner() {
  const owned = [];
  return {
    own: b => {
      owned.push(b);
      return b;
    },
    destroy: () => owned.forEach(b => b.destroy()),
  };
}

// keeps make()'s promise under key. a failed one is dropped, so the next call tries again
export function cached(map, key, make) {
  if (!map.has(key)) {
    const made = make();
    made.catch(() => map.delete(key));
    map.set(key, made);
  }
  return map.get(key);
}

export async function readBack(device, src, bytes) {
  const rb = buf(device, bytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
  const e = device.createCommandEncoder();
  e.copyBufferToBuffer(src, 0, rb, 0, bytes);
  device.queue.submit([e.finish()]);
  await rb.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(rb.getMappedRange(0, bytes).slice(0));
  rb.unmap();
  rb.destroy();
  return out;
}

// returns true if the size changed
export function fitCanvas(canvas, maxDpr = 1.5) {
  const dpr = Math.min(devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (w === canvas.width && h === canvas.height) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}
