// one axis of the depth blur
//#include "common.wgsl"
//#include "../fullscreen.wgsl"
override DX: i32 = 1;
override DY: i32 = 0;

@group(0) @binding(1) var src: texture_2d<f32>;

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) f32 {
  let dims = vec2i(textureDimensions(src));
  let c = vec2i(fc.xy);
  let d0 = textureLoad(src, c, 0).r;
  if (d0 > NO_FLUID) {
    return d0;
  }
  // narrow-range filter (Truong & Yuksel). the kernel follows the particle's size on screen
  let px = r.radius * r.proj[1][1] * r.size.y * 0.5 / d0;
  let sig = clamp(px * 1.25, 0.5, 12.0);
  let rad = i32(ceil(2.0 * sig));
  let delta = r.radius * 2.0;
  var lo = d0 - delta;
  var hi = d0 + delta;
  var sum = d0;
  var wsum = 1.0;
  for (var i = 1; i <= rad; i++) {
    let w = exp(-f32(i * i) / (2.0 * sig * sig));
    var a = textureLoad(src, clamp(c + vec2i(DX * i, DY * i), vec2i(0), dims - 1), 0).r;
    var b = textureLoad(src, clamp(c - vec2i(DX * i, DY * i), vec2i(0), dims - 1), 0).r;
    // something in front on either side drops the pair, so nearer fluid doesn't bleed in
    if (a < lo || b < lo) {
      continue;
    }
    // anything too far behind, the background included, counts as just behind
    if (a > hi) {
      a = d0 + r.radius;
    } else {
      // the range follows the surface, so a slope seen edge-on still gets smoothed
      lo = min(lo, a - delta);
      hi = max(hi, a + delta);
    }
    if (b > hi) {
      b = d0 + r.radius;
    } else {
      lo = min(lo, b - delta);
      hi = max(hi, b + delta);
    }
    sum += (a + b) * w;
    wsum += 2.0 * w;
  }
  return sum / max(wsum, 1e-5);
}
