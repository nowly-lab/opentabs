import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const sleep = (ms: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, ms));

const sanitizeFilenamePart = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'amazon-manga';

const normalizeDigits = (value: string): string =>
  value.replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

const splitTitleAndVolume = (title: string): { seriesTitle: string; volumeNumber: string } => {
  const normalized = normalizeDigits(title.normalize('NFKC'));
  const match = normalized.match(/^(.*?)\s*[（(]\s*(\d+)\s*[）)]/);
  if (!match) {
    return {
      seriesTitle: sanitizeFilenamePart(normalized.replace(/\s*\([^)]*コミックス[^)]*\)\s*$/u, '')),
      volumeNumber: 'unknown-volume',
    };
  }

  const [, series = normalized, volume = 'unknown-volume'] = match;
  return {
    seriesTitle: sanitizeFilenamePart(series),
    volumeNumber: sanitizeFilenamePart(volume),
  };
};

const readIntegerText = (selector: string): number | undefined => {
  const text = document.querySelector(selector)?.textContent?.trim();
  if (!text) return undefined;
  const value = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(value) ? value : undefined;
};

const isVisible = (element: Element | null): boolean => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const visibleArea = (rect: DOMRect): number => {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
};

const hasVisibleSurface = (): boolean =>
  Array.from(document.querySelectorAll('img,canvas')).some(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40 && visibleArea(rect) > 0;
  });

const hasEndTray = (): boolean =>
  Array.from(document.querySelectorAll('.tray-container, [class*="tray-container"]')).some(element => {
    const rect = element.getBoundingClientRect();
    return isVisible(element) && visibleArea(rect) > 20_000 && rect.right > window.innerWidth * 0.75;
  });

interface ReaderPosition {
  currentPage?: number;
  percent?: number;
  sliderValue?: number;
}

const readReaderPosition = (): ReaderPosition => {
  const sliderValue = Number.parseInt(document.querySelector<HTMLInputElement>('#sliderBar')?.value ?? '', 10);
  return {
    currentPage: readIntegerText('#pageInfoCurrentPage'),
    percent: readIntegerText('#pageInfoPercent'),
    sliderValue: Number.isFinite(sliderValue) ? sliderValue : undefined,
  };
};

const hasComparablePosition = (position: ReaderPosition): boolean =>
  position.currentPage !== undefined || position.percent !== undefined || position.sliderValue !== undefined;

const didReaderPositionChange = (before: ReaderPosition, after: ReaderPosition): boolean => {
  const comparableKeys = (['currentPage', 'percent', 'sliderValue'] as const).filter(
    key => before[key] !== undefined && after[key] !== undefined,
  );
  if (comparableKeys.length === 0) return true;
  return comparableKeys.some(key => before[key] !== after[key]);
};

const dispatchMouseEvent = (target: Element, type: string, x: number, y: number): void => {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
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
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      view: window,
    }),
  );
};

const clickVisibleSurface = (params: { x: number; yRatio: number }): boolean => {
  const surface = Array.from(document.querySelectorAll('img,canvas'))
    .map(element => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 40 && rect.height > 40 && visibleArea(rect) > 0)
    .sort((a, b) => visibleArea(b.rect) - visibleArea(a.rect))[0];
  if (!surface) return false;

  const x = Math.max(4, Math.min(window.innerWidth - 4, Math.round(params.x)));
  const y = Math.round(surface.rect.top + surface.rect.height * params.yRatio);
  const target = document.elementFromPoint(x, y) ?? surface.element;
  dispatchPointerEvent(target, 'pointerdown', x, y);
  dispatchMouseEvent(target, 'mousedown', x, y);
  dispatchPointerEvent(target, 'pointerup', x, y);
  dispatchMouseEvent(target, 'mouseup', x, y);
  dispatchMouseEvent(target, 'click', x, y);
  return true;
};

const showReaderChrome = async (): Promise<void> => {
  if (
    isVisible(document.querySelector('#readerChromeOverlayBottom')) ||
    isVisible(document.querySelector('#readerChromeTop'))
  ) {
    return;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    clickVisibleSurface({ x: Math.round(window.innerWidth / 2), yRatio: 0.5 });
    await sleep(500);
    if (
      isVisible(document.querySelector('#readerChromeOverlayBottom')) ||
      isVisible(document.querySelector('#readerChromeTop'))
    ) {
      return;
    }
  }
};

const hideReaderChromeForScreenshot = (): void => {
  let style = document.querySelector<HTMLStyleElement>('#opentabs-hide-reader-chrome');
  if (!style) {
    style = document.createElement('style');
    style.id = 'opentabs-hide-reader-chrome';
    document.documentElement.appendChild(style);
  }
  style.textContent =
    [
      '#readerChromeTop',
      '#readerChromeOverlayBottom',
      '#readerChromeBottomSlider',
      '#overlayHoverTop',
      '#overlayHoverBottom',
      '.chevron-container',
      '.kr-chevron-container-left',
      '.kr-chevron-container-right',
      '.kw-binge-reading-marker-container',
      '.readerChromeBottomPageInfo',
      '.kw-modal',
      '.kw-rd-dot-menu',
      '.kw-rd-chrome-settings-popup',
    ].join(',') +
    '{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}';
};

const restoreReaderChrome = (): void => {
  document.querySelector('#opentabs-hide-reader-chrome')?.remove();
};

const closeGoToModalOutside = async (): Promise<void> => {
  if (!isVisible(document.querySelector('#readerGoToInput'))) return;
  (document.querySelector<HTMLElement>('#readerChromeHeaderBar') ?? document.body).click();
  await sleep(500);
};

const waitForReadySurface = async (timeoutMs: number): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!document.querySelector('.kg-loader-wrapper') && hasVisibleSurface()) return;
    await sleep(300);
  }
  throw ToolError.timeout('Timed out waiting for the manga page image to finish loading.');
};

const waitForReadySurfaceOrEndTray = async (timeoutMs: number): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (hasEndTray()) return;
    if (!document.querySelector('.kg-loader-wrapper') && hasVisibleSurface()) return;
    await sleep(300);
  }
  throw ToolError.timeout('Timed out waiting for the manga page image to finish loading.');
};

const openGoToModal = async (): Promise<void> => {
  await showReaderChrome();
  const menuButton = document.querySelector<HTMLElement>('.kw-rd-chrome-dot-menu-btn');
  if (!menuButton) throw ToolError.notFound('Could not find the Amazon manga reader menu button.');
  menuButton.click();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const goTo = document.querySelector<HTMLElement>('#readerDotMenuGoTo');
    if (isVisible(goTo)) {
      if (!goTo) throw ToolError.notFound('Could not find the go-to-position menu item.');
      goTo.click();
      break;
    }
    await sleep(250);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (isVisible(document.querySelector('#readerGoToInput'))) return;
    await sleep(250);
  }
  throw ToolError.notFound('Could not open the Amazon manga go-to-position dialog.');
};

const goToPosition = async (position: number, timeoutMs: number): Promise<void> => {
  restoreReaderChrome();
  await openGoToModal();

  const input = document.querySelector<HTMLInputElement>('#readerGoToInput');
  const submit = document.querySelector<HTMLElement>('#readerGoToSubmit');
  if (!input || !submit) throw ToolError.notFound('Could not find the go-to-position input or submit button.');

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw ToolError.internal('Could not access the native input value setter.');
  setter.call(input, String(position));
  input.dispatchEvent(
    new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(position) }),
  );
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  submit.click();

  await waitForReadySurface(timeoutMs);
  await closeGoToModalOutside();
};

const turnOnePage = async (params: {
  xOffset: number;
  yRatio: number;
  waitMs: number;
  timeoutMs: number;
}): Promise<void> => {
  restoreReaderChrome();
  await waitForReadySurface(params.timeoutMs);
  if (!clickVisibleSurface({ x: params.xOffset, yRatio: params.yRatio })) {
    throw ToolError.notFound('No visible manga page surface was found for page turn.');
  }
  await sleep(params.waitMs);
  await waitForReadySurfaceOrEndTray(params.timeoutMs);
};

const prepareAndCaptureScreenshot = async (
  context: Required<Pick<ScreenshotDownloadContext, 'captureVisibleTabScreenshot'>>,
  timeoutMs: number,
): Promise<string> => {
  await waitForReadySurface(timeoutMs);
  hideReaderChromeForScreenshot();
  await sleep(250);
  return context.captureVisibleTabScreenshot();
};

const getPngDimensions = (base64: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not decode captured PNG dimensions.'));
    image.src = `data:image/png;base64,${base64}`;
  });

interface ScreenshotDownloadContext {
  captureVisibleTabScreenshot?(): Promise<string>;
  downloadBase64File?(base64: string, filename: string, mimeType?: string): Promise<{ downloadId: number }>;
}

export const saveAllPagesFromFirst = defineTool({
  name: 'save_all_pages_from_first',
  displayName: 'Save All Pages From First',
  description:
    'Start the Amazon manga reader at position 1, hide reader chrome, screenshot every page, and advance by clicking near the left edge.',
  summary: 'Save manga from page 1 to end',
  icon: 'download',
  group: 'Reader',
  input: z.object({
    prefix: z.string().optional().describe('Optional filename prefix. Defaults to the reader title.'),
    run_id: z.string().optional().describe('Batch identifier. Defaults to a timestamp.'),
    total_pages: z.number().int().min(1).optional().describe('Total pages. Defaults to the reader page count.'),
    start_at_first: z.boolean().optional().describe('Move to position 1 before saving. Defaults to true.'),
    start_page: z.number().int().min(1).optional().describe('Filename page number to start from. Defaults to 1.'),
    seek_to_start_page: z
      .boolean()
      .optional()
      .describe('Move to start_page before saving when start_at_first is false. Defaults to false.'),
    max_pages: z.number().int().min(1).optional().describe('Optional cap for testing. Omit to save all pages.'),
    turn_retry_attempts: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Deprecated. Page turns now stop only when the end tray appears or the URL changes.'),
    turn_x_offset: z
      .number()
      .min(1)
      .max(300)
      .optional()
      .describe('Page-turn click X coordinate from viewport left. Defaults to 58.'),
    turn_y_ratio: z
      .number()
      .min(0.1)
      .max(0.9)
      .optional()
      .describe('Page-turn click Y ratio within the visible page. Defaults to 0.5.'),
    turn_wait_ms: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional()
      .describe('Wait after each page turn. Defaults to 1800.'),
    ready_timeout_ms: z
      .number()
      .int()
      .min(1000)
      .max(60000)
      .optional()
      .describe('Timeout while waiting for the page image loader to disappear. Defaults to 25000.'),
  }),
  output: z.object({
    title: z.string(),
    total_pages: z.number(),
    saved_count: z.number(),
    files: z.array(z.string()),
    width: z.number().optional(),
    height: z.number().optional(),
    stop_reason: z.enum(['max_pages', 'url_changed', 'end_tray', 'position_unchanged']).optional(),
    final_url: z.string().optional(),
  }),
  handle: async (params, context) => {
    const screenshotDownloadContext = context as typeof context & ScreenshotDownloadContext;
    if (!screenshotDownloadContext.captureVisibleTabScreenshot) {
      throw ToolError.internal('Screenshot capture is not available in this OpenTabs runtime.');
    }
    if (!screenshotDownloadContext.downloadBase64File) {
      throw ToolError.internal('Directory-preserving browser downloads are not available in this OpenTabs runtime.');
    }

    const startUrl = location.href;
    const title = document.querySelector('#readerChromeTitle')?.textContent?.trim() || document.title || 'amazon-manga';
    const totalPages = params.total_pages ?? readIntegerText('#pageInfoTotalPage');
    if (!totalPages || totalPages < 1) {
      throw ToolError.notFound('Could not read the total page count. Pass total_pages explicitly.');
    }

    const safePrefix = sanitizeFilenamePart(params.prefix ?? title);
    const { seriesTitle, volumeNumber } = splitTitleAndVolume(title);
    const runId = params.run_id ?? new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
    const startPage = params.start_page ?? 1;
    const limit = params.max_pages ?? Number.POSITIVE_INFINITY;
    const progressTotal = Number.isFinite(limit) ? limit : 0;
    const savedFiles: string[] = [];
    let lastDimensions: { width: number; height: number } | undefined;
    let stopReason: 'max_pages' | 'url_changed' | 'end_tray' | 'position_unchanged' | undefined;

    if (params.start_at_first !== false) {
      await goToPosition(1, params.ready_timeout_ms ?? 25000);
    } else if (params.seek_to_start_page === true) {
      await goToPosition(startPage, params.ready_timeout_ms ?? 25000);
    }

    for (let offset = 0; offset < limit; offset += 1) {
      const page = startPage + offset;

      if (location.href !== startUrl) {
        stopReason = 'url_changed';
        break;
      }
      if (hasEndTray()) {
        if (savedFiles.length === 0) {
          throw ToolError.validation(
            'End tray is visible before any manga page was saved; reader did not reset to start.',
          );
        }
        stopReason = 'end_tray';
        break;
      }

      const currentBase64 = await prepareAndCaptureScreenshot(
        { captureVisibleTabScreenshot: screenshotDownloadContext.captureVisibleTabScreenshot },
        params.ready_timeout_ms ?? 25000,
      );

      if (location.href !== startUrl) {
        stopReason = 'url_changed';
        break;
      }

      const pagePart = String(page).padStart(String(totalPages).length, '0');
      const filename = `${seriesTitle}/${volumeNumber}/files/${safePrefix}-${runId}-p${pagePart}-of-${totalPages}.png`;
      lastDimensions = await getPngDimensions(currentBase64);
      await screenshotDownloadContext.downloadBase64File(currentBase64, filename, 'image/png');
      savedFiles.push(filename);
      context?.reportProgress({ progress: offset + 1, total: progressTotal, message: filename });

      if (offset + 1 >= limit) {
        stopReason = 'max_pages';
        break;
      }

      const positionBeforeTurn = readReaderPosition();
      await turnOnePage({
        xOffset: params.turn_x_offset ?? 58,
        yRatio: params.turn_y_ratio ?? 0.5,
        waitMs: params.turn_wait_ms ?? 1800,
        timeoutMs: params.ready_timeout_ms ?? 25000,
      });

      if (location.href !== startUrl) {
        stopReason = 'url_changed';
        break;
      }
      if (hasEndTray()) {
        stopReason = 'end_tray';
        break;
      }
      const positionAfterTurn = readReaderPosition();
      if (
        hasComparablePosition(positionBeforeTurn) &&
        !didReaderPositionChange(positionBeforeTurn, positionAfterTurn)
      ) {
        stopReason = 'position_unchanged';
        break;
      }
    }

    return {
      title,
      total_pages: totalPages,
      saved_count: savedFiles.length,
      files: savedFiles,
      width: lastDimensions?.width,
      height: lastDimensions?.height,
      stop_reason: stopReason,
      final_url: location.href,
    };
  },
});
