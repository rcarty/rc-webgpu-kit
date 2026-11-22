// column-major, 0..1 clip depth

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (near * far) / (near - far);
  return m;
}

export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

export function inverse(a) {
  const o = new Float32Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4];
  const b01 = a[0] * a[6] - a[2] * a[4];
  const b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5];
  const b04 = a[1] * a[7] - a[3] * a[5];
  const b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12];
  const b07 = a[8] * a[14] - a[10] * a[12];
  const b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13];
  const b10 = a[9] * a[15] - a[11] * a[13];
  const b11 = a[10] * a[15] - a[11] * a[14];
  const invDet = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * invDet;
  o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * invDet;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * invDet;
  o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * invDet;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * invDet;
  o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * invDet;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * invDet;
  o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * invDet;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * invDet;
  o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * invDet;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * invDet;
  o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * invDet;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * invDet;
  o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * invDet;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * invDet;
  o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * invDet;
  return o;
}
