// shared MPM bits. positions are in grid units

const FP: f32 = 1e6; // scatter as i32(value * FP)

fn cellIndex(c: vec3i, g: vec3i) -> i32 {
  return c.x + c.y * g.x + c.z * g.x * g.y;
}

// quadratic B-spline weights, d = offset from the cell centre
fn weights(d: vec3f) -> array<vec3f, 3> {
  return array<vec3f, 3>(0.5 * (0.5 - d) * (0.5 - d), 0.75 - d * d, 0.5 * (0.5 + d) * (0.5 + d));
}

// 1 on the ray, 0 at radius, 0 behind the origin. for cursor pushes
fn rayFalloff(pos: vec3f, origin: vec3f, dir: vec3f, radius: f32) -> f32 {
  let rel = pos - origin;
  let t = dot(rel, dir);
  let d = length(rel - t * dir);
  if (radius <= 0.0 || t <= 0.0 || d >= radius) {
    return 0.0;
  }
  return 1.0 - d / radius;
}
