// every sort checked against the CPU
import { buf, readBack, loadSort } from '../src/index.js';

function randomKeys(n, seed) {
  const a = new Uint32Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    a[i] = x;
  }
  return a;
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export async function sortTests(device) {
  const sort = await loadSort(device);
  const U = GPUBufferUsage;
  const results = [];

  const runSorter = async sorter => {
    const e = device.createCommandEncoder();
    const cp = e.beginComputePass();
    sorter.encode(cp);
    cp.end();
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
  };

  // keys only: odd sizes and a few distributions
  const inputs = [
    ['random 1,000', randomKeys(1000, 1)],
    ['random 65,536', randomKeys(65536, 12345)],
    ['random 100,003', randomKeys(100003, 7)],
    ['random 1,048,576', randomKeys(1048576, 987654321)],
    ['all equal 4,096', new Uint32Array(4096).fill(42)],
    ['already sorted 8,192', Uint32Array.from({ length: 8192 }, (_, i) => i * 3)],
    ['reversed 8,192', Uint32Array.from({ length: 8192 }, (_, i) => 0xffffffff - i * 5)],
    ['few distinct 20,000', randomKeys(20000, 3).map(v => v & 7)],
  ];
  for (const [name, input] of inputs) {
    const n = input.length;
    const expected = input.slice().sort();
    const pow2 = n >= 512 && (n & (n - 1)) === 0;
    for (const algo of ['radix', 'bitonic']) {
      if (algo === 'bitonic' && !pow2) continue;
      const keys = buf(device, n * 4, U.STORAGE | U.COPY_SRC | U.COPY_DST);
      const tmpKeys = buf(device, n * 4, U.STORAGE);
      device.queue.writeBuffer(keys, 0, input);
      const sorter = sort[algo]({ count: n, keys, tmpKeys });
      await runSorter(sorter);
      const ok = same(await readBack(device, keys, n * 4), expected);
      results.push({ name: `${algo}: ${name}`, ok });
      sorter.destroy();
      keys.destroy();
      tmpKeys.destroy();
    }
  }

  // key-value: values follow their keys, equal keys keep their order
  for (const n of [5000, 150000]) {
    const input = randomKeys(n, 99).map(v => v & 0xffff);
    const order = Uint32Array.from({ length: n }, (_, i) => i);
    const expected = Array.from(order).sort((a, b) => input[a] - input[b] || a - b);
    const mk = (usage, data) => {
      const b = buf(device, n * 4, usage);
      if (data) device.queue.writeBuffer(b, 0, data);
      return b;
    };
    const keys = mk(U.STORAGE | U.COPY_SRC | U.COPY_DST, input);
    const tmpKeys = mk(U.STORAGE);
    const values = mk(U.STORAGE | U.COPY_SRC | U.COPY_DST, order);
    const tmpValues = mk(U.STORAGE);
    const sorter = sort.radix({ count: n, keys, tmpKeys, values, tmpValues, keyBits: 16 });
    await runSorter(sorter);
    const got = await readBack(device, values, n * 4);
    results.push({
      name: `radix key-value, stable: ${n.toLocaleString()}`,
      ok: same(got, Uint32Array.from(expected)),
    });
    sorter.destroy();
    [keys, tmpKeys, values, tmpValues].forEach(b => b.destroy());
  }

  // stepping: after each radix step the keys are sorted on the bits done so far
  {
    const n = 4096;
    const input = randomKeys(n, 5);
    const keys = buf(device, n * 4, U.STORAGE | U.COPY_SRC | U.COPY_DST);
    const tmpKeys = buf(device, n * 4, U.STORAGE | U.COPY_SRC);
    device.queue.writeBuffer(keys, 0, input);
    const sorter = sort.radix({ count: n, keys, tmpKeys });
    let ok = true;
    for (let s = 0; s < sorter.steps; s++) {
      const e = device.createCommandEncoder();
      const cp = e.beginComputePass();
      sorter.encodeStep(cp, s);
      cp.end();
      device.queue.submit([e.finish()]);
      const a = await readBack(device, sorter.outputAfterStep(s).keys, n * 4);
      const bits = 4 * (s + 1);
      const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
      for (let i = 1; i < n; i++) if ((a[i - 1] & mask) >>> 0 > (a[i] & mask) >>> 0) ok = false;
    }
    results.push({ name: 'radix: stepping through passes', ok });
    sorter.destroy();
    keys.destroy();
    tmpKeys.destroy();
  }

  return results;
}
