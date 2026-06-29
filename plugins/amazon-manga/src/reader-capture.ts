import { ToolError } from '@opentabs-dev/plugin-sdk';

const MIN_CAPTURE_AREA = 90_000;
const MAX_CAPTURE_SURFACE = 32_000_000;

export interface CaptureCandidate {
  element: HTMLCanvasElement | HTMLImageElement;
  kind: 'canvas' | 'image';
  rect: DOMRect;
  width: number;
  height: number;
  area: number;
  visibleArea: number;
  index: number;
}

export interface ReaderSummary {
  url: string;
  title: string;
  canvas_count: number;
  image_count: number;
  visible_candidates: Array<{
    index: number;
    kind: 'canvas' | 'image';
    width: number;
    height: number;
    rect: { x: number; y: number; width: number; height: number };
    visible_area: number;
  }>;
}

export interface TurnPageResult {
  clicked: boolean;
  x: number;
  y: number;
  target_tag: string;
  surface_kind: 'canvas' | 'image';
  surface_index: number;
  surface_rect: { x: number; y: number; width: number; height: number };
}

export interface SliderPageResult {
  requested_page: number;
  current_page: number;
  total_pages: number;
  slider_value_before: number;
  slider_value_after: number;
}

const isHtmlCanvas = (element: Element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement;

const isHtmlImage = (element: Element): element is HTMLImageElement => element instanceof HTMLImageElement;

const visibleArea = (rect: DOMRect): number => {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
};

const isVisible = (element: Element, rect: DOMRect): boolean => {
  const style = window.getComputedStyle(element);
  return (
    rect.width > 40 &&
    rect.height > 40 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || '1') > 0.01 &&
    visibleArea(rect) > 0
  );
};

const elementDimensions = (element: HTMLCanvasElement | HTMLImageElement): { width: number; height: number } => {
  if (isHtmlCanvas(element)) return { width: element.width, height: element.height };
  return { width: element.naturalWidth, height: element.naturalHeight };
};

export const getCaptureCandidates = (): CaptureCandidate[] => {
  const elements = Array.from(document.querySelectorAll('canvas, img')).filter(
    (element): element is HTMLCanvasElement | HTMLImageElement => isHtmlCanvas(element) || isHtmlImage(element),
  );

  return elements
    .map((element, index): CaptureCandidate | null => {
      const rect = element.getBoundingClientRect();
      const { width, height } = elementDimensions(element);
      const area = width * height;
      const candidateVisibleArea = visibleArea(rect);

      if (!isVisible(element, rect)) return null;
      if (area < MIN_CAPTURE_AREA) return null;

      return {
        element,
        kind: isHtmlCanvas(element) ? 'canvas' : 'image',
        rect,
        width,
        height,
        area,
        visibleArea: candidateVisibleArea,
        index,
      };
    })
    .filter((candidate): candidate is CaptureCandidate => candidate !== null)
    .sort((a, b) => b.visibleArea - a.visibleArea);
};

export const summarizeReader = (): ReaderSummary => {
  const candidates = getCaptureCandidates();
  return {
    url: location.href,
    title: document.title,
    canvas_count: document.querySelectorAll('canvas').length,
    image_count: document.querySelectorAll('img').length,
    visible_candidates: candidates.map(candidate => ({
      index: candidate.index,
      kind: candidate.kind,
      width: candidate.width,
      height: candidate.height,
      rect: {
        x: Math.round(candidate.rect.x),
        y: Math.round(candidate.rect.y),
        width: Math.round(candidate.rect.width),
        height: Math.round(candidate.rect.height),
      },
      visible_area: Math.round(candidate.visibleArea),
    })),
  };
};

const dispatchMouseEvent = (target: Element, type: string, x: number, y: number): void => {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      button: 0,
      buttons: type === 'mouseup' || type === 'click' ? 0 : 1,
      view: window,
    }),
  );
};

const dispatchPointerEvent = (target: Element, type: string, x: number, y: number): void => {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      view: window,
    }),
  );
};

export const clickVisiblePageLeftHalf = (params: { xRatio: number; yRatio: number }): TurnPageResult => {
  const candidate = getCaptureCandidates()[0];
  if (!candidate) {
    throw ToolError.notFound(
      'No visible manga canvas or image was found. Open a manga page in the Amazon reader and try again.',
    );
  }

  const x = Math.round(candidate.rect.left + candidate.rect.width * params.xRatio);
  const y = Math.round(candidate.rect.top + candidate.rect.height * params.yRatio);
  const target = document.elementFromPoint(x, y) ?? candidate.element;

  // Amazon's reader responds to normal pointer/mouse sequences on the visible page surface.
  dispatchPointerEvent(target, 'pointerdown', x, y);
  dispatchMouseEvent(target, 'mousedown', x, y);
  dispatchPointerEvent(target, 'pointerup', x, y);
  dispatchMouseEvent(target, 'mouseup', x, y);
  dispatchMouseEvent(target, 'click', x, y);

  return {
    clicked: true,
    x,
    y,
    target_tag: target.tagName.toLowerCase(),
    surface_kind: candidate.kind,
    surface_index: candidate.index,
    surface_rect: {
      x: Math.round(candidate.rect.x),
      y: Math.round(candidate.rect.y),
      width: Math.round(candidate.rect.width),
      height: Math.round(candidate.rect.height),
    },
  };
};

const readIntegerText = (selector: string): number | undefined => {
  const text = document.querySelector(selector)?.textContent?.trim();
  if (!text) return undefined;
  const value = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(value) ? value : undefined;
};

export const setReaderSliderPage = async (requestedPage: number, waitMs: number): Promise<SliderPageResult> => {
  const slider = document.querySelector<HTMLInputElement>('#sliderBar');
  if (!slider) {
    throw ToolError.notFound('Could not find the Amazon manga page slider. Tap the reader center to show it first.');
  }

  const minPage = Number.parseInt(slider.min || '1', 10);
  const maxPage = Number.parseInt(slider.max || String(requestedPage), 10);
  if (!Number.isFinite(minPage) || !Number.isFinite(maxPage)) {
    throw ToolError.notFound('Could not read the Amazon manga page slider range.');
  }

  const page = Math.min(Math.max(requestedPage, minPage), maxPage);
  const before = Number.parseInt(slider.value, 10);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) throw ToolError.internal('Could not access the native input value setter.');

  valueSetter.call(slider, String(page));
  slider.setAttribute('aria-valuenow', String(page));
  slider.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

  if (waitMs > 0) await new Promise(resolve => window.setTimeout(resolve, waitMs));

  return {
    requested_page: page,
    current_page: readIntegerText('#pageInfoCurrentPage') ?? page,
    total_pages: readIntegerText('#pageInfoTotalPage') ?? maxPage,
    slider_value_before: Number.isFinite(before) ? before : page,
    slider_value_after: Number.parseInt(slider.value, 10),
  };
};

const drawCandidate = (context: CanvasRenderingContext2D, candidate: CaptureCandidate, x: number, y: number): void => {
  try {
    context.drawImage(candidate.element, x, y, candidate.width, candidate.height);
  } catch (error) {
    throw ToolError.internal(
      `Could not draw the visible manga surface. The reader may be protected or cross-origin restricted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const canvasToBase64 = (canvas: HTMLCanvasElement): string => {
  try {
    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  } catch (error) {
    throw ToolError.internal(
      `Could not export the captured manga surface. The reader may be DRM-protected or tainted: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

export const captureVisibleCandidates = (
  limit: number,
): { base64: string; width: number; height: number; count: number } => {
  const candidates = getCaptureCandidates().slice(0, limit);
  if (candidates.length === 0) {
    throw ToolError.notFound(
      'No visible manga canvas or image was found. Open a manga page in the Amazon reader and try again.',
    );
  }

  const outputWidth = Math.max(...candidates.map(candidate => candidate.width));
  const outputHeight = candidates.reduce((sum, candidate) => sum + candidate.height, 0);
  if (outputWidth * outputHeight > MAX_CAPTURE_SURFACE) {
    throw ToolError.validation(
      'The visible manga surfaces are too large to combine safely. Retry with limit=1 or zoom out in the reader.',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw ToolError.internal('Could not create a 2D canvas context.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);

  let offsetY = 0;
  for (const candidate of candidates) {
    const offsetX = Math.floor((outputWidth - candidate.width) / 2);
    drawCandidate(context, candidate, offsetX, offsetY);
    offsetY += candidate.height;
  }

  return {
    base64: canvasToBase64(canvas),
    width: outputWidth,
    height: outputHeight,
    count: candidates.length,
  };
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const triggerPngDownload = (base64: string, filename: string): void => {
  const bytes = base64ToBytes(base64);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'image/png' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
};

export const defaultFilename = (prefix: string): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}.png`;
};
