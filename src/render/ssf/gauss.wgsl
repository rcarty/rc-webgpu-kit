// one axis of the thickness blur
//#include "../fullscreen.wgsl"
override DX: i32 = 1;
override DY: i32 = 0;

@group(0) @binding(0) var src: texture_2d<f32>;

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dims = vec2i(textureDimensions(src));
  let c = vec2i(fc.xy);
  var sum = 0.0;
  var wsum = 0.0;
  for (var i = -10; i <= 10; i++) {
    let q = clamp(c + vec2i(DX * i, DY * i), vec2i(0), dims - 1);
    let w = exp(-f32(i * i) / 50.0);
    sum += textureLoad(src, q, 0).r * w;
    wsum += w;
  }
  return vec4f(sum / wsum, 0.0, 0.0, 1.0);
}
