// fixed-point momentum + mass for atomicAdd. read-only passes bind the same buffer as vec4i
struct Cell {
  vx: atomic<i32>,
  vy: atomic<i32>,
  vz: atomic<i32>,
  m: atomic<i32>,
}
