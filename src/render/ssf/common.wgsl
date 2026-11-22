struct RU {
  proj: mat4x4f,
  view: mat4x4f,
  size: vec2f,
  radius: f32,
  thick: f32,
  light: vec4f,
  accent: vec4f,
  debug: vec4f,
}

@group(0) @binding(0) var<uniform> r: RU;

// the depth target is cleared to more than this where there is no fluid (FAR in index.js)
const NO_FLUID = 1000.0;
