import { buf } from '../gpu/resources.js';

const WORKGROUP = 64; // workgroup size of the MPM passes

// cells takes the scatter and is cleared every substep, velocity is the resolved grid
export function createGrid(device, dims) {
  const cellCount = dims[0] * dims[1] * dims[2];
  const cells = buf(device, cellCount * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const velocity = buf(device, cellCount * 16, GPUBufferUsage.STORAGE);
  return { cells, velocity, groups: Math.ceil(cellCount / WORKGROUP) };
}

export const particleGroups = count => Math.ceil(count / WORKGROUP);
