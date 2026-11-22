# rc-webgpu-kit

The shared WebGPU code behind my demos. It's plain JavaScript modules and `.wgsl` files with no dependencies and no build step. Each demo repository includes it as a git submodule at `kit/`.

Used by:

- [rc-gpu-sort](https://github.com/rcarty/rc-gpu-sort): sorting visualiser and benchmark
- [rc-gsplat-mpm](https://github.com/rcarty/rc-gsplat-mpm): Gaussian splats with MPM physics
- [rc-gpu-rl](https://github.com/rcarty/rc-gpu-rl): a drone pilot trained in the browser
- [rcarty.github.io](https://github.com/rcarty/rcarty.github.io): the fluid on my home page

## What's in it

| Module        | Contents                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/gpu/`    | Device setup, buffer and bind group helpers, a frame loop that pauses off screen and never queues more than the GPU can finish, GPU timing with timestamp queries, and a small WGSL loader |
| `src/scan/`   | Exclusive prefix sum over a `u32` buffer of any length, with the grand total left in a buffer for things like stream compaction                                                            |
| `src/sort/`   | LSD radix sort (keys, or keys with values) and bitonic sort for `u32` keys                                                                                                                 |
| `src/mpm/`    | The pieces every MLS-MPM solver here shares: B-spline weights, grid indexing, the fixed-point cell used for atomic scatter, and grid buffers                                               |
| `src/render/` | Screen-space fluid renderer, orbit camera, pick rays and a fullscreen pass                                                                                                                 |
| `src/math/`   | `mat4` and `vec3`                                                                                                                                                                          |
| `demo/`       | The CSS the demo pages share                                                                                                                                                               |

## Sorting

```js
import { initGPU, loadSort } from './kit/src/index.js';

const { device } = await initGPU();
const sort = await loadSort(device); // compiles the pipelines once per device

const sorter = sort.radix({ count, keys, tmpKeys }); // or sort.bitonic({ count, keys })
const encoder = device.createCommandEncoder();
const pass = encoder.beginComputePass();
sorter.encode(pass);
pass.end();
device.queue.submit([encoder.finish()]); // the result is in `keys`
```

Pass `values`, `tmpValues` and `keyBits: 16` to `sort.radix` for a key-value sort on 16-bit keys. rc-gsplat-mpm uses that to order splats by depth every frame. Each sorter also has `steps`, `encodeStep(pass, s)` and `outputAfterStep(s)`, which is how the visualiser reads the array back between passes.

## Prefix sum

```js
import { loadScan } from './kit/src/index.js';

const scan = await loadScan(device);
const scanner = scan.exclusive({ count, data });
scanner.encode(pass); // data[i] is now the sum of everything before i
scanner.total; // buffer, element 0 is the grand total
```

The radix sort uses this for its histogram. Each 256-element block is scanned in workgroup memory, block totals are scanned one level up, and a second sweep adds them back down.

## Shaders

`loadWGSL(url)` fetches a `.wgsl` file and resolves a few directives. They're written as comments, so every file is still valid WGSL and the formatter can parse it:

```wgsl
//#include "../mpm/common.wgsl"   another file, relative to this one, included once
//#include <particle>             source passed in by the caller
//#if KV                          kept when the caller defines KV
//#else
//#endif
```

That's what lets a demo's solver include `kit/src/mpm/common.wgsl`, and lets one scatter shader serve both the keys-only and key-value sorts.

## Formatting and lint

Prettier formats the JavaScript, WGSL (through `prettier-plugin-wgsl`), HTML, CSS, Markdown, JSON and YAML. ESLint checks the JavaScript. The configs live here (`prettier.config.js`, `eslint.config.js`) and each demo re-exports them from `kit/`, so all five repositories follow the same rules. CI runs the check on every push.

```sh
npm run lint      # eslint, then prettier --check
npm run format    # prettier --write
```

## Tests

`test/index.html` checks the prefix sum against a CPU loop at sizes either side of each level boundary, up to 17 million values, and every sort against the CPU: random, sorted, reversed, all-equal and few-distinct keys, counts that aren't a multiple of the tile size, stability of the key-value sort, and stepping through the radix passes. Open it in a browser over HTTP, or run it headless:

```sh
npm install
npm test
```

The headless run uses an installed Chrome with its software Vulkan driver, so it needs no GPU.

## Running the demos locally

Browsers don't load modules from `file://`, so serve the folder:

```sh
git clone --recurse-submodules https://github.com/rcarty/rc-gpu-sort
cd rc-gpu-sort
python3 -m http.server
```

## Versions

Demos pin a commit of this repository through the submodule. Tags mark versions (`v0.1.0` is the first). To move a demo to a newer version:

```sh
git -C kit fetch && git -C kit checkout v0.2.0
git add kit && git commit -m "Update rc-webgpu-kit to v0.2.0"
```
