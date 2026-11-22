// one compare-exchange per thread for a global (k, j) step
struct B {
  k: u32,
  j: u32,
  n: u32,
}

@group(0) @binding(0) var<storage, read_write> keys: array<u32>;
@group(0) @binding(1) var<uniform> b: B;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) nwg: vec3u) {
  let i = gid.x + gid.y * nwg.x * 256u;
  if (i >= b.n / 2u) {
    return;
  }
  let l = 2u * b.j * (i / b.j) + (i % b.j);
  let r = l + b.j;
  let up = (l & b.k) == 0u;
  let x = keys[l];
  let y = keys[r];
  if ((x > y) == up) {
    keys[l] = y;
    keys[r] = x;
  }
}
