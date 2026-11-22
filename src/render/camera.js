import { perspective } from '../math/mat4.js';
import { sub, dot, cross, normalize } from '../math/vec3.js';

// view matrix + basis, y up
export function lookAt(eye, target) {
  const f = normalize(sub(target, eye));
  const r = normalize(cross(f, [0, 1, 0]));
  const up = cross(r, f);
  const view = new Float32Array([
    r[0],
    up[0],
    -f[0],
    0,
    r[1],
    up[1],
    -f[1],
    0,
    r[2],
    up[2],
    -f[2],
    0,
    -dot(r, eye),
    -dot(up, eye),
    dot(f, eye),
    1,
  ]);
  return { eye, f, r, up, view };
}

// ray direction through a screen point, sx/sy in -1..1
export function pickDir(cam, sx, sy, fovy, aspect) {
  const th = Math.tan(fovy / 2);
  return normalize(
    [0, 1, 2].map(i => cam.r[i] * sx * th * aspect + cam.up[i] * sy * th + cam.f[i]),
  );
}

// drag to orbit, wheel to zoom, tap calls onTap(sx, sy)
export class OrbitCamera {
  constructor(
    canvas,
    {
      yaw = 0.5,
      pitch = 0.32,
      target = [0, 1, 0],
      fovy = (40 * Math.PI) / 180,
      radius = 2,
      depthPad = 4.5,
      minDist = 2.5,
      maxDist = 14,
      autoRotate = 0.12,
      onTap = null,
    } = {},
  ) {
    Object.assign(this, {
      yaw,
      pitch,
      target,
      fovy,
      radius,
      depthPad,
      minDist,
      maxDist,
      autoRotate,
    });
    this.dist = 0; // set from the aspect on first use
    this.idle = 0;
    this.dragging = false;

    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
      this.dragging = true;
      this.idle = 0;
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.006;
      this.pitch = Math.min(1.3, Math.max(-0.1, this.pitch + (e.clientY - drag.y) * 0.004));
      drag.x = e.clientX;
      drag.y = e.clientY;
      this.idle = 0;
    });
    const release = () => {
      drag = null;
      this.dragging = false;
    };
    canvas.addEventListener('pointerup', e => {
      if (drag && onTap && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) {
        const rc = canvas.getBoundingClientRect();
        onTap(
          ((e.clientX - rc.left) / rc.width) * 2 - 1,
          1 - ((e.clientY - rc.top) / rc.height) * 2,
        );
      }
      release();
    });
    canvas.addEventListener('pointercancel', release); // or the auto-rotate never comes back
    canvas.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        this.dist = Math.min(
          this.maxDist,
          Math.max(this.minDist, this.dist * Math.exp(e.deltaY * 0.001)),
        );
        this.idle = 0;
      },
      { passive: false },
    );
  }

  // slow spin after 2s idle
  update(dt, still = false) {
    this.idle += dt;
    if (!this.dragging && this.idle > 2 && !still) this.yaw += dt * this.autoRotate;
  }

  matrices(aspect) {
    if (!this.dist) this.dist = this.radius / Math.tan(this.fovy / 2) / Math.min(1, aspect);
    const { target: t, dist: d, pitch, yaw } = this;
    const eye = [
      t[0] + d * Math.cos(pitch) * Math.sin(yaw),
      t[1] + d * Math.sin(pitch),
      t[2] + d * Math.cos(pitch) * Math.cos(yaw),
    ];
    const near = Math.max(0.05, d - this.depthPad);
    const far = d + this.depthPad;
    return {
      ...lookAt(eye, t),
      proj: perspective(this.fovy, aspect, near, far),
      near,
      far,
      fovy: this.fovy,
      aspect,
    };
  }
}
