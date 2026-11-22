// per-tile digit histogram, stored digit-major so one scan gives offsets
//#include "tile.wgsl"
@group(0) @binding(0) var<storage, read> keys: array<u32>;
@group(0) @binding(1) var<storage, read_write> hist: array<u32>;
@group(0) @binding(2) var<uniform> p: P;
var<workgroup> cnt: array<atomic<u32>, 16>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32, @builtin(workgroup_id) wg: vec3u) {
  let base = wg.x * TILE;
  for (var i = 0u; i < ITEMS; i++) {
    let idx = base + i * 256u + t;
    if (idx < p.n) {
      atomicAdd(&cnt[(keys[idx] >> p.shift) & 15u], 1u);
    }
  }
  workgroupBarrier();
  if (t < 16u) {
    hist[t * p.numTiles + wg.x] = atomicLoad(&cnt[t]);
  }
}
