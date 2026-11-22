// stable scatter for one digit. keys are ranked in-tile with a workgroup scan over 16 one-hot
// counters (two 16-bit counters per lane), so no atomics on the output. KV carries a value too
//#include "tile.wgsl"
@group(0) @binding(0) var<storage, read> keysIn: array<u32>;
@group(0) @binding(1) var<storage, read_write> keysOut: array<u32>;
//#if KV
@group(0) @binding(2) var<storage, read> valsIn: array<u32>;
@group(0) @binding(3) var<storage, read_write> valsOut: array<u32>;
@group(0) @binding(4) var<storage, read> hist: array<u32>;
@group(0) @binding(5) var<uniform> p: P;
//#else
@group(0) @binding(2) var<storage, read> hist: array<u32>;
@group(0) @binding(3) var<uniform> p: P;
//#endif
var<workgroup> scanA: array<vec4u, 256>; // digits 0..7
var<workgroup> scanB: array<vec4u, 256>; // digits 8..15
var<workgroup> base: array<u32, 16>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_index) t: u32, @builtin(workgroup_id) wg: vec3u) {
  if (t < 16u) {
    base[t] = hist[t * p.numTiles + wg.x];
  }
  workgroupBarrier();
  for (var i = 0u; i < ITEMS; i++) {
    let idx = wg.x * TILE + i * 256u + t;
    let valid = idx < p.n;
    var key = 0u;
    var val = 0u;
    var d = 0u;
    var a = vec4u(0u);
    var b = vec4u(0u);
    if (valid) {
      key = keysIn[idx];
      //#if KV
      val = valsIn[idx];
      //#endif
      d = (key >> p.shift) & 15u;
      let bit = 1u << (16u * (d & 1u));
      let lane = d >> 1u;
      if (lane < 4u) {
        a[lane] = bit;
      } else {
        b[lane - 4u] = bit;
      }
    }
    scanA[t] = a;
    scanB[t] = b;
    workgroupBarrier();
    for (var off = 1u; off < 256u; off = off * 2u) {
      var pa = vec4u(0u);
      var pb = vec4u(0u);
      if (t >= off) {
        pa = scanA[t - off];
        pb = scanB[t - off];
      }
      workgroupBarrier();
      scanA[t] = scanA[t] + pa;
      scanB[t] = scanB[t] + pb;
      workgroupBarrier();
    }
    if (valid) {
      let lane = d >> 1u;
      var inc = 0u;
      if (lane < 4u) {
        inc = scanA[t][lane];
      } else {
        inc = scanB[t][lane - 4u];
      }
      let dst = base[d] + ((inc >> (16u * (d & 1u))) & 0xFFFFu) - 1u;
      keysOut[dst] = key;
      //#if KV
      valsOut[dst] = val;
      //#endif
    }
    workgroupBarrier();
    if (t < 16u) {
      let lane = t >> 1u;
      var tot = 0u;
      if (lane < 4u) {
        tot = scanA[255][lane];
      } else {
        tot = scanB[255][lane - 4u];
      }
      base[t] = base[t] + ((tot >> (16u * (t & 1u))) & 0xFFFFu);
    }
    workgroupBarrier();
  }
}
