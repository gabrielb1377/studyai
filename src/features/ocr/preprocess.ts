export type PreprocessOptions = {
  grayscale?: boolean;
  contrast?: number;
  binarize?: boolean;
};

function clampByte(value: number) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function otsuThreshold(histogram: readonly number[], total: number) {
  let sum = 0;
  for (let index = 0; index < histogram.length; index += 1) sum += index * histogram[index];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 127;
  let bestVariance = -1;

  for (let index = 0; index < histogram.length; index += 1) {
    weightBackground += histogram[index];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = index;
    }
  }
  return best;
}

/**
 * Prepara uma cópia de trabalho para o OCR. A imagem original nunca é alterada:
 * o canvas recebido é apenas a renderização temporária da página.
 */
export function preprocessCanvas(source: HTMLCanvasElement, options: PreprocessOptions = {}): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const targetContext = target.getContext("2d");
  if (!sourceContext || !targetContext) return source;

  const image = sourceContext.getImageData(0, 0, source.width, source.height);
  const data = image.data;
  const pixels = source.width * source.height;
  const histogram = new Array<number>(256).fill(0);
  let sum = 0;
  let sumSquares = 0;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]);
    histogram[gray] += 1;
    sum += gray;
    sumSquares += gray * gray;
  }

  const mean = sum / Math.max(1, pixels);
  const deviation = Math.sqrt(Math.max(0, sumSquares / Math.max(1, pixels) - mean * mean));
  const contrast = options.contrast ?? (deviation < 42 ? 1.35 : 1.1);
  const binarize = options.binarize ?? false;
  const threshold = binarize ? otsuThreshold(histogram, pixels) : -1;
  const grayscale = options.grayscale ?? true;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const gray = binarize
      ? (0.299 * red + 0.587 * green + 0.114 * blue >= threshold ? 255 : 0)
      : clampByte((0.299 * red + 0.587 * green + 0.114 * blue - 128) * contrast + 128);
    if (grayscale || binarize) {
      data[index] = gray;
      data[index + 1] = gray;
      data[index + 2] = gray;
    } else {
      data[index] = clampByte((red - 128) * contrast + 128);
      data[index + 1] = clampByte((green - 128) * contrast + 128);
      data[index + 2] = clampByte((blue - 128) * contrast + 128);
    }
  }

  targetContext.putImageData(image, 0, 0);
  return target;
}

export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}
