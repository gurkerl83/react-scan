export interface WebGPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  format: GPUTextureFormat;
}

export async function initWebGPU(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<WebGPUContext | null> {
  if (!('gpu' in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const context = (canvas as HTMLCanvasElement).getContext('webgpu') as GPUCanvasContext;
  if (!context) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const shaderCode = `
struct VertexOutput {
  @builtin(position) position : vec4<f32>;
};

@vertex
fn vs(@location(0) pos: vec2<f32>) -> VertexOutput {
  var out: VertexOutput;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  return out;
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.45, 0.38, 0.90, 0.3);
}
`;

  const module = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return { device, context, pipeline, format };
}

export function drawRectangles(
  webgpu: WebGPUContext,
  outlines: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const { device, context, pipeline, format } = webgpu;
  const vertices: number[] = [];
  const canvasWidth = (context as any).canvas.width as number;
  const canvasHeight = (context as any).canvas.height as number;

  for (const o of outlines) {
    const x1 = (o.x / canvasWidth) * 2 - 1;
    const y1 = -((o.y / canvasHeight) * 2 - 1);
    const x2 = ((o.x + o.width) / canvasWidth) * 2 - 1;
    const y2 = -(((o.y + o.height) / canvasHeight) * 2 - 1);
    vertices.push(
      x1, y1,
      x2, y1,
      x1, y2,
      x2, y1,
      x2, y2,
      x1, y2,
    );
  }

  const vertexData = new Float32Array(vertices);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
  });

  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertexData.length / 2);
  pass.end();
  device.queue.submit([encoder.finish()]);
  vertexBuffer.destroy();
}

export function resize(webgpu: WebGPUContext, width: number, height: number) {
  const { context, device, format } = webgpu;
  context.configure({ device, format, alphaMode: 'premultiplied' });
  (context as any).canvas.width = width;
  (context as any).canvas.height = height;
}
