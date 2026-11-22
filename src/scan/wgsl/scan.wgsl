// exclusive scan of 256-element blocks (Hillis-Steele), block totals go to sums
struct S {
  n: u32,
}

@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@group(0) @binding(1) var<storage, read_write> sums: array<u32>;
@group(0) @binding(2) var<uniform> s: S;
var<workgroup> sh: array<u32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_index) t: u32,
  @builtin(workgroup_id) wg: vec3u,
  @builtin(num_workgroups) nw: vec3u,
) {
  let block = wg.x + wg.y * nw.x;
  let gi = block * 256u + t;
  var v = 0u;
  if (gi < s.n) {
    v = data[gi];
  }
  sh[t] = v;
  workgroupBarrier();
  for (var off = 1u; off < 256u; off = off * 2u) {
    var add = 0u;
    if (t >= off) {
      add = sh[t - off];
    }
    workgroupBarrier();
    sh[t] = sh[t] + add;
    workgroupBarrier();
  }
  if (gi < s.n) {
    data[gi] = sh[t] - v;
  }
  // the 2D dispatch can overshoot, so only real blocks write a total
  if (t == 255u && block * 256u < s.n) {
    sums[block] = sh[255];
  }
}
