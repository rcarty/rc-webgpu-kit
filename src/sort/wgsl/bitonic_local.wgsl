// all steps with j <= 256 for one k, in workgroup memory
// same uniform as bitonic_global. j isn't used here
struct B {
  k: u32,
  j: u32,
  n: u32,
}

@group(0) @binding(0) var<storage, read_write> keys: array<u32>;
@group(0) @binding(1) var<uniform> b: B;
var<workgroup> sh: array<u32, 512>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_index) t: u32,
  @builtin(workgroup_id) wg: vec3u,
  @builtin(num_workgroups) nwg: vec3u,
) {
  let tileId = wg.x + wg.y * nwg.x;
  let base = tileId * 512u;
  // the 2D dispatch can overshoot, so only real tiles touch keys
  let real = base < b.n;
  if (real) {
    sh[t] = keys[base + t];
    sh[t + 256u] = keys[base + t + 256u];
  }
  workgroupBarrier();
  var kStart = b.k;
  var kEnd = b.k;
  // k == 0: sort the whole tile
  if (b.k == 0u) {
    kStart = 2u;
    kEnd = 512u;
  }
  for (var k = kStart; k <= kEnd; k = k * 2u) {
    var j = min(k / 2u, 256u);
    loop {
      let l = 2u * j * (t / j) + (t % j);
      let r = l + j;
      let up = ((base + l) & k) == 0u;
      let x = sh[l];
      let y = sh[r];
      if ((x > y) == up) {
        sh[l] = y;
        sh[r] = x;
      }
      workgroupBarrier();
      if (j == 1u) {
        break;
      }
      j = j / 2u;
    }
  }
  if (real) {
    keys[base + t] = sh[t];
    keys[base + t + 256u] = sh[t + 256u];
  }
}
