// exclusive prefix sum over a u32 buffer, in place
// scanner.total is a buffer with the grand total in element 0

import {
  buf,
  bind,
  uniform,
  computePipeline,
  dispatchSize,
  owner,
  cached,
} from '../gpu/resources.js';
import { loadWGSL } from '../gpu/wgsl.js';

const BLOCK = 256;
const loaded = new WeakMap();

// compiled once per device
export const loadScan = device => cached(loaded, device, () => build(device));

async function build(device) {
  const pipe = async name =>
    computePipeline(device, await loadWGSL(new URL(`./wgsl/${name}.wgsl`, import.meta.url)));
  const [scan, add] = await Promise.all([pipe('scan'), pipe('add')]);
  return { exclusive: opts => makeExclusive(device, { scan, add }, opts) };
}

function makeExclusive(device, P, { count, data }) {
  const STORAGE = GPUBufferUsage.STORAGE;
  const { own, destroy } = owner();

  // each level scans the block totals of the one below
  const levels = [{ buf: data, n: count }];
  while (levels.at(-1).n > BLOCK) {
    const m = Math.ceil(levels.at(-1).n / BLOCK);
    levels.push({ buf: own(buf(device, m * 4, STORAGE)), n: m });
  }
  const total = own(buf(device, 16, STORAGE | GPUBufferUsage.COPY_SRC));

  const steps = levels.map((L, i) => {
    const u = own(uniform(device, [L.n]));
    const above = levels[i + 1];
    return {
      groups: dispatchSize(Math.ceil(L.n / BLOCK)),
      scanBG: bind(device, P.scan, [L.buf, above ? above.buf : total, u]),
      addBG: above ? bind(device, P.add, [L.buf, above.buf, u]) : null,
    };
  });

  return {
    total,
    levels: levels.length,
    encode(cp) {
      cp.setPipeline(P.scan);
      for (const s of steps) {
        cp.setBindGroup(0, s.scanBG);
        cp.dispatchWorkgroups(...s.groups);
      }
      cp.setPipeline(P.add);
      for (const s of steps.slice(0, -1).reverse()) {
        cp.setBindGroup(0, s.addBG);
        cp.dispatchWorkgroups(...s.groups);
      }
    },
    destroy,
  };
}
