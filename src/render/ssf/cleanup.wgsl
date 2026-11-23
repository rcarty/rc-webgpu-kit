// one more go of the depth filter, not split by axis, over 9x9. evens out rows and columns
//#include "common.wgsl"
//#include "../fullscreen.wgsl"
@group(0) @binding(1) var src: texture_2d<f32>;

const R = 4;
const SIGMA = 4.0 / 3.0;

fn depthAt(c: vec2i) -> f32 {
  let dims = vec2i(textureDimensions(src));
  return textureLoad(src, clamp(c, vec2i(0), dims - 1), 0).r;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) f32 {
  let c = vec2i(fc.xy);
  let d0 = depthAt(c);
  if (d0 > NO_FLUID) {
    return d0;
  }
  let delta = r.radius * 10.5;
  var lo = d0 - delta;
  var hi = d0 + delta;
  var sum = d0;
  var wsum = 1.0;
  // square rings out from the centre, each sample paired with the one opposite
  for (var k = 1; k <= R; k++) {
    for (var t = -k; t < k; t++) {
      for (var s = 0; s < 2; s++) {
        let o = select(vec2i(t, k), vec2i(k, -t), s == 1);
        let w = exp(-f32(o.x * o.x + o.y * o.y) / (2.0 * SIGMA * SIGMA));
        var a = depthAt(c + o);
        var b = depthAt(c - o);
        if (a < lo || b < lo) {
          continue;
        }
        // same as narrow_range.wgsl
        let farA = a > hi;
        if (!farA) {
          lo = min(lo, a - delta);
          hi = max(hi, a + delta);
        }
        let farB = b > hi;
        if (!farB) {
          lo = min(lo, b - delta);
          hi = max(hi, b + delta);
        }
        if (farA != farB) {
          a = d0;
          b = d0;
        } else if (farA) {
          a = d0 + r.radius;
          b = a;
        }
        sum += (a + b) * w;
        wsum += 2.0 * w;
      }
    }
  }
  return sum / wsum;
}
