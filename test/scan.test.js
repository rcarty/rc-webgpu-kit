// prefix sum checked against a CPU loop, at sizes either side of each level boundary
import { buf, readBack, loadScan } from '../src/index.js';

export async function scanTests(device) {
  const scan = await loadScan(device);
  const U = GPUBufferUsage;
  const results = [];

  // 17M needs a 2D dispatch, the rest cover 1, 2 and 3 levels
  for (const n of [1, 255, 256, 257, 1000, 65536, 65537, 1000003, 17000000]) {
    const input = new Uint32Array(n);
    for (let i = 0; i < n; i++) input[i] = (i * 2654435761) >>> 20;
    const expected = new Uint32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      expected[i] = sum;
      sum = (sum + input[i]) >>> 0;
    }

    const data = buf(device, n * 4, U.STORAGE | U.COPY_SRC | U.COPY_DST);
    device.queue.writeBuffer(data, 0, input);
    const scanner = scan.exclusive({ count: n, data });
    const e = device.createCommandEncoder();
    const cp = e.beginComputePass();
    scanner.encode(cp);
    cp.end();
    device.queue.submit([e.finish()]);

    const got = await readBack(device, data, n * 4);
    const total = (await readBack(device, scanner.total, 4))[0];
    let ok = total === sum;
    for (let i = 0; i < n && ok; i++) ok = got[i] === expected[i];
    results.push({ name: `scan: ${n.toLocaleString()} values, ${scanner.levels} level(s)`, ok });
    scanner.destroy();
    data.destroy();
  }
  return results;
}
