// down-sweep: add block totals back
struct S {
  n: u32,
}

@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@group(0) @binding(1) var<storage, read> sums: array<u32>;
@group(0) @binding(2) var<uniform> s: S;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_index) t: u32,
  @builtin(workgroup_id) wg: vec3u,
  @builtin(num_workgroups) nw: vec3u,
) {
  let block = wg.x + wg.y * nw.x;
  let gi = block * 256u + t;
  if (gi < s.n) {
    data[gi] = data[gi] + sums[block];
  }
}
