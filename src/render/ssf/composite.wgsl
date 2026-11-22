// normals from the smoothed depth, then fresnel, absorption, spec and rim. premultiplied out
//#include "common.wgsl"
//#include "../fullscreen.wgsl"
@group(0) @binding(1) var depthTex: texture_2d<f32>;
@group(0) @binding(2) var thickTex: texture_2d<f32>;

fn viewPos(c: vec2i, d: f32) -> vec3f {
  let uv = (vec2f(c) + 0.5) / r.size;
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return vec3f(ndc.x * d / r.proj[0][0], ndc.y * d / r.proj[1][1], -d);
}

fn depthAt(c: vec2i) -> f32 {
  let dims = vec2i(textureDimensions(depthTex));
  return textureLoad(depthTex, clamp(c, vec2i(0), dims - 1), 0).r;
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let c = vec2i(fc.xy);
  let d = depthAt(c);
  if (d > NO_FLUID) {
    return vec4f(0.0);
  }
  let P = viewPos(c, d);
  // one-sided differences, pick the smaller depth step so edges don't smear
  let dxp = depthAt(c + vec2i(1, 0));
  let dxm = depthAt(c - vec2i(1, 0));
  let dyp = depthAt(c + vec2i(0, 1));
  let dym = depthAt(c - vec2i(0, 1));
  var ddx = viewPos(c + vec2i(1, 0), dxp) - P;
  let ddx2 = P - viewPos(c - vec2i(1, 0), dxm);
  if (dxp > NO_FLUID || (dxm < NO_FLUID && abs(ddx2.z) < abs(ddx.z))) {
    ddx = ddx2;
  }
  var ddy = viewPos(c + vec2i(0, 1), dyp) - P;
  let ddy2 = P - viewPos(c - vec2i(0, 1), dym);
  if (dyp > NO_FLUID || (dym < NO_FLUID && abs(ddy2.z) < abs(ddy.z))) {
    ddy = ddy2;
  }
  var n = normalize(cross(ddy, ddx));
  if (n.z < 0.0) {
    n = -n;
  }
  let t = textureLoad(thickTex, c, 0).r;
  // debug views: 1 depth, 2 normals, 3 thickness
  let show = u32(r.debug.x);
  if (show == 1u) {
    let g = 1.0 - clamp((d - r.debug.y) / (r.debug.z - r.debug.y), 0.0, 1.0);
    return vec4f(vec3f(g), 1.0);
  }
  if (show == 2u) {
    return vec4f(n * 0.5 + 0.5, 1.0);
  }
  if (show == 3u) {
    return vec4f(vec3f(1.0 - exp(-t * 1.2)), 1.0);
  }
  let V = normalize(-P);
  let L = normalize(r.light.xyz);
  let H = normalize(L + V);
  let ndv = max(dot(n, V), 0.0);
  let fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  let deep = vec3f(0.015, 0.045, 0.11);
  let body = mix(deep, r.accent.rgb * 0.95, exp(-t * 0.35));
  let R = reflect(-V, n);
  let env =
    mix(
      vec3f(0.02, 0.025, 0.035),
      vec3f(0.55, 0.65, 0.78),
      pow(clamp(R.y * 0.5 + 0.5, 0.0, 1.0), 3.0),
    );
  let spec = pow(max(dot(n, H), 0.0), 70.0) * 0.55;
  let rim = r.accent.rgb * pow(1.0 - ndv, 3.0) * 0.45;
  let col = mix(body, env, fres) + rim + vec3f(spec);
  let a = clamp(1.0 - exp(-t * 2.5), 0.0, 1.0);
  return vec4f(col * a, a);
}
