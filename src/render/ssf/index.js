// screen-space fluid: impostors into depth + thickness, blur both, then composite
// particleStruct is WGSL for struct Particle with a position: vec3f
// view should take particle positions straight to view space

import { buf, bind } from '../../gpu/resources.js';
import { loadWGSL } from '../../gpu/wgsl.js';

const FAR = { r: 1e4, g: 0, b: 0, a: 0 }; // depth clear, means no fluid. above NO_FLUID in common.wgsl
const ZERO = { r: 0, g: 0, b: 0, a: 0 };

export class FluidRenderer {
  static async create(device, { format, particles, particleStruct }) {
    const file = name => new URL(`./${name}.wgsl`, import.meta.url);
    const [sprite, narrow, gauss, composite] = await Promise.all([
      loadWGSL(file('sprite'), { includes: { particle: particleStruct } }),
      loadWGSL(file('narrow_range')),
      loadWGSL(file('gauss')),
      loadWGSL(file('composite')),
    ]);
    return new FluidRenderer(device, format, particles, { sprite, narrow, gauss, composite });
  }

  constructor(device, format, particles, src) {
    this.device = device;
    this.uniforms = buf(device, 192, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.data = new Float32Array(48);
    this.width = 0;
    this.height = 0;
    this.tex = null;
    this.bgs = null;

    const spriteMod = device.createShaderModule({ code: src.sprite });
    const additive = {
      color: { srcFactor: 'one', dstFactor: 'one' },
      alpha: { srcFactor: 'one', dstFactor: 'one' },
    };
    this.pDepth = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: spriteMod, entryPoint: 'vs' },
      fragment: { module: spriteMod, entryPoint: 'fsDepth', targets: [{ format: 'r32float' }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.pThick = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: spriteMod, entryPoint: 'vs' },
      fragment: {
        module: spriteMod,
        entryPoint: 'fsThick',
        targets: [{ format: 'r16float', blend: additive }],
      },
    });
    const fullscreen = (code, fmt, constants) => {
      const module = device.createShaderModule({ code });
      return device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: fmt }], constants },
      });
    };
    this.pNarrowX = fullscreen(src.narrow, 'r32float', { DX: 1, DY: 0 });
    this.pNarrowY = fullscreen(src.narrow, 'r32float', { DX: 0, DY: 1 });
    this.pGaX = fullscreen(src.gauss, 'r16float', { DX: 1, DY: 0 });
    this.pGaY = fullscreen(src.gauss, 'r16float', { DX: 0, DY: 1 });
    this.pComp = fullscreen(src.composite, format);

    this.bgDepth = bind(device, this.pDepth, [this.uniforms, particles]);
    this.bgThick = bind(device, this.pThick, [this.uniforms, particles]);
  }

  // cheap to call every frame
  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const d = this.device;
    if (this.tex) Object.values(this.tex).forEach(t => t.destroy());
    const RT = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const make = (fmt, usage = RT) =>
      d.createTexture({ size: [width, height], format: fmt, usage });
    this.tex = {
      z: make('depth32float', GPUTextureUsage.RENDER_ATTACHMENT),
      d0: make('r32float'),
      d1: make('r32float'),
      t0: make('r16float'),
      t1: make('r16float'),
    };
    const view = k => this.tex[k].createView();
    this.bgs = {
      narrowX: bind(d, this.pNarrowX, [this.uniforms, view('d0')]),
      narrowY: bind(d, this.pNarrowY, [this.uniforms, view('d1')]),
      gaX: bind(d, this.pGaX, [view('t0')]),
      gaY: bind(d, this.pGaY, [view('t1')]),
      comp: bind(d, this.pComp, [this.uniforms, view('d0'), view('t0')]),
    };
  }

  // radius in view-space units, light is a view-space direction
  // show: 0 final, 1 depth, 2 normals, 3 thickness. depthRange is only used by the depth view
  setParams({ proj, view, radius, thickness, light, accent, show = 0, depthRange = [0, 1] }) {
    const f = this.data;
    f.set(proj, 0);
    f.set(view, 16);
    f[32] = this.width;
    f[33] = this.height;
    f[34] = radius;
    f[35] = thickness;
    f.set([light[0], light[1], light[2], 0], 36);
    f.set([accent[0], accent[1], accent[2], 1], 40);
    f.set([show, depthRange[0], depthRange[1], 0], 44);
    this.device.queue.writeBuffer(this.uniforms, 0, f);
  }

  // smooth = false skips the blurs, to show what the raw impostors look like
  encode(enc, targetView, count, smooth = true) {
    const { tex, bgs } = this;
    const pass = (view, clear, depth) =>
      enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: clear }],
        depthStencilAttachment: depth
          ? { view: depth, depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 }
          : undefined,
      });
    const quad = (view, clear, pipeline, bg) => {
      const p = pass(view, clear);
      p.setPipeline(pipeline);
      p.setBindGroup(0, bg);
      p.draw(3);
      p.end();
    };

    let p = pass(tex.d0.createView(), FAR, tex.z.createView());
    p.setPipeline(this.pDepth);
    p.setBindGroup(0, this.bgDepth);
    p.draw(6, count);
    p.end();
    p = pass(tex.t0.createView(), ZERO);
    p.setPipeline(this.pThick);
    p.setBindGroup(0, this.bgThick);
    p.draw(6, count);
    p.end();
    if (smooth) {
      for (let i = 0; i < 2; i++) {
        quad(tex.d1.createView(), FAR, this.pNarrowX, bgs.narrowX);
        quad(tex.d0.createView(), FAR, this.pNarrowY, bgs.narrowY);
      }
      quad(tex.t1.createView(), ZERO, this.pGaX, bgs.gaX);
      quad(tex.t0.createView(), ZERO, this.pGaY, bgs.gaY);
    }
    quad(targetView, ZERO, this.pComp, bgs.comp);
  }

  destroy() {
    this.uniforms.destroy();
    if (this.tex) Object.values(this.tex).forEach(t => t.destroy());
  }
}
