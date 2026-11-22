// GPU sorts for u32 keys: radix (optionally key-value) and bitonic
// the result always ends up back in the keys/values buffers you pass in

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
import { loadScan } from '../scan/index.js';

const TILE = 1024; // keys per radix tile, same as wgsl/tile.wgsl
const BINS = 16; // 4-bit digits
const BITONIC_TILE = 512;

const loaded = new WeakMap();

// compiled once per device
export const loadSort = device => cached(loaded, device, () => build(device));

async function build(device) {
  const file = name => new URL(`./wgsl/${name}.wgsl`, import.meta.url);
  const pipe = async (name, defines) =>
    computePipeline(device, await loadWGSL(file(name), { defines }));
  const scan = await loadScan(device);
  const [hist, scatter, scatterKV, bitonicGlobal, bitonicLocal] = await Promise.all([
    pipe('hist'),
    pipe('scatter'),
    pipe('scatter', { KV: true }),
    pipe('bitonic_global'),
    pipe('bitonic_local'),
  ]);
  const P = { hist, scan, scatter, scatterKV, bitonicGlobal, bitonicLocal };
  return {
    radix: opts => makeRadix(device, P, opts),
    bitonic: opts => makeBitonic(device, P, opts),
  };
}

// keyBits = 16 sorts the low 16 bits in 4 passes. pass values + tmpValues for key-value
function makeRadix(
  device,
  P,
  { count: n, keys, tmpKeys, values = null, tmpValues = null, keyBits = 32 },
) {
  const numPasses = keyBits / 4;
  if (!Number.isInteger(numPasses) || numPasses % 2)
    throw new Error('keyBits must be a multiple of 8');
  const kv = Boolean(values);
  const { own, destroy } = owner();
  const STORAGE = GPUBufferUsage.STORAGE;

  const numTiles = Math.ceil(n / TILE);
  if (numTiles > 65535) throw new Error('Radix sort takes up to 67 million keys'); // 1D dispatch
  const hist = own(buf(device, BINS * numTiles * 4, STORAGE));

  // one scan over the digit-major histogram turns counts into output offsets
  const scanner = own(P.scan.exclusive({ count: BINS * numTiles, data: hist }));

  const passes = [];
  for (let p = 0; p < numPasses; p++) {
    const u = own(uniform(device, [n, p * 4, numTiles]));
    const [ki, ko] = p % 2 === 0 ? [keys, tmpKeys] : [tmpKeys, keys];
    const [vi, vo] = p % 2 === 0 ? [values, tmpValues] : [tmpValues, values];
    passes.push({
      histBG: bind(device, P.hist, [ki, hist, u]),
      scatterBG: kv
        ? bind(device, P.scatterKV, [ki, ko, vi, vo, hist, u])
        : bind(device, P.scatter, [ki, ko, hist, u]),
    });
  }
  const scatter = kv ? P.scatterKV : P.scatter;

  const encodeStep = (cp, p) => {
    cp.setPipeline(P.hist);
    cp.setBindGroup(0, passes[p].histBG);
    cp.dispatchWorkgroups(numTiles);
    scanner.encode(cp);
    cp.setPipeline(scatter);
    cp.setBindGroup(0, passes[p].scatterBG);
    cp.dispatchWorkgroups(numTiles);
  };
  return {
    steps: numPasses,
    encodeStep,
    encode: cp => {
      for (let p = 0; p < numPasses; p++) encodeStep(cp, p);
    },
    outputAfterStep: s => (s % 2 === 0 ? { keys: tmpKeys, values: tmpValues } : { keys, values }),
    destroy,
  };
}

// power-of-two counts >= 512 only. stage 0 sorts each tile, stage s merges with k = 512 << s
function makeBitonic(device, P, { count: n, keys }) {
  if (n < BITONIC_TILE || n & (n - 1))
    throw new Error('Bitonic sort needs a power-of-two count of at least 512');
  const { own, destroy } = owner();

  const params = [{ k: 0, j: 0, local: true }]; // one dispatch each
  const stages = [[0]]; // dispatch indices per stage
  for (let k = 2 * BITONIC_TILE; k <= n; k *= 2) {
    const st = [];
    for (let j = k / 2; j >= BITONIC_TILE; j /= 2) {
      st.push(params.length);
      params.push({ k, j, local: false });
    }
    st.push(params.length);
    params.push({ k, j: 256, local: true });
    stages.push(st);
  }
  // one 256-byte uniform slot per dispatch
  const data = new Uint32Array(params.length * 64);
  params.forEach((p, i) => data.set([p.k, p.j, n], i * 64));
  const ubuf = own(uniform(device, data));
  const bgs = params.map((p, i) =>
    bind(device, p.local ? P.bitonicLocal : P.bitonicGlobal, [
      keys,
      { buffer: ubuf, offset: i * 256, size: 12 },
    ]),
  );
  const gGlobal = dispatchSize(n / 2 / 256);
  const gLocal = dispatchSize(n / BITONIC_TILE);

  const encodeStep = (cp, s) => {
    for (const i of stages[s]) {
      const p = params[i];
      cp.setPipeline(p.local ? P.bitonicLocal : P.bitonicGlobal);
      cp.setBindGroup(0, bgs[i]);
      const g = p.local ? gLocal : gGlobal;
      cp.dispatchWorkgroups(g[0], g[1]);
    }
  };
  return {
    steps: stages.length,
    encodeStep,
    encode: cp => {
      for (let s = 0; s < stages.length; s++) encodeStep(cp, s);
    },
    outputAfterStep: () => ({ keys, values: null }),
    destroy,
  };
}
