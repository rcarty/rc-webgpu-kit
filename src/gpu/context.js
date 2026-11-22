// features the adapter doesn't have are dropped, so check device.features before using one
export async function initGPU({ canvas = null, alphaMode = 'premultiplied', features = [] } = {}) {
  if (!navigator.gpu) throw new Error('WebGPU is not available');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No GPU adapter');

  const requiredFeatures = features.filter(f => adapter.features.has(f));
  const device = await adapter.requestDevice({ requiredFeatures });

  const format = navigator.gpu.getPreferredCanvasFormat();
  let context = null;
  if (canvas) {
    context = canvas.getContext('webgpu');
    context.configure({ device, format, alphaMode });
  }
  return { device, context, format };
}
