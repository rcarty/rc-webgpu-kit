// sphere impostors into depth and additive thickness
// caller supplies struct Particle with a position: vec3f
//#include <particle>
//#include "common.wgsl"
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) vp: vec3f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners =
    array<vec2f, 6>(
      vec2f(-1.0, -1.0),
      vec2f(1.0, -1.0),
      vec2f(-1.0, 1.0),
      vec2f(-1.0, 1.0),
      vec2f(1.0, -1.0),
      vec2f(1.0, 1.0),
    );
  let c = corners[vi];
  let vp = (r.view * vec4f(particles[ii].position, 1.0)).xyz;
  var o: VOut;
  o.clip = r.proj * vec4f(vp + vec3f(c * r.radius, 0.0), 1.0);
  o.uv = c;
  o.vp = vp;
  return o;
}

struct DOut {
  @location(0) d: f32,
  @builtin(frag_depth) fd: f32,
}

@fragment
fn fsDepth(i: VOut) -> DOut {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) {
    discard;
  }
  let p = i.vp + vec3f(i.uv * r.radius, sqrt(1.0 - r2) * r.radius);
  let clip = r.proj * vec4f(p, 1.0);
  var o: DOut;
  o.d = -p.z;
  o.fd = clip.z / clip.w;
  return o;
}

@fragment
fn fsThick(i: VOut) -> @location(0) vec4f {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) {
    discard;
  }
  return vec4f(sqrt(1.0 - r2) * r.thick, 0.0, 0.0, 1.0);
}
