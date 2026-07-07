import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const resolveTweetId = (params: { tweet_id?: string; tweet_url?: string }): string => {
  if (params.tweet_id?.trim()) return params.tweet_id.trim();

  const source = params.tweet_url?.trim() || globalThis.location?.href || '';
  const match = source.match(/\/status(?:es)?\/(\d+)/) ?? source.match(/(?:^|[^\d])(\d{10,25})(?:[^\d]|$)/);
  const id = match?.[1];
  if (!id) {
    throw ToolError.validation('Provide tweet_id, tweet_url, or open a tweet status page in the active X tab.');
  }
  return id;
};

const tweetUrl = (tweetId: string): string => `https://x.com/i/status/${encodeURIComponent(tweetId)}`;

const sleep = (ms: number): Promise<void> => new Promise(resolve => globalThis.setTimeout(resolve, ms));

const findTweetArticle = (tweetId: string): HTMLElement | null => {
  const articles = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
  return (
    articles.find(article => {
      const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'));
      return links.some(link => link.href.includes(`/status/${tweetId}`));
    }) ??
    articles[0] ??
    null
  );
};

const waitForTweetArticle = async (tweetId: string, timeoutMs: number): Promise<HTMLElement> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const article = findTweetArticle(tweetId);
    if (article) return article;
    await sleep(250);
  }

  throw ToolError.timeout(`Timed out waiting for tweet ${tweetId} to render.`);
};

const rectToObject = (rect: DOMRect): { x: number; y: number; width: number; height: number } => ({
  x: Math.round(rect.x),
  y: Math.round(rect.y),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
});

const removeExistingOverlay = (): void => {
  document.getElementById('opentabs-x-tweet-screenshot-overlay')?.remove();
  document.getElementById('opentabs-x-tweet-screenshot-style')?.remove();
};

interface ScreenshotTheme {
  background: string;
  border: string;
  shadow: string;
}

const rgbNumbers = (value: string): [number, number, number] | null => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const luminance = ([r, g, b]: [number, number, number]): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const getScreenshotTheme = (article: HTMLElement): ScreenshotTheme => {
  const articleColor = rgbNumbers(getComputedStyle(article).color);
  const isDarkTheme = articleColor
    ? luminance(articleColor) > 0.65
    : matchMedia('(prefers-color-scheme: dark)').matches;

  if (isDarkTheme) {
    return {
      background: 'rgb(0, 0, 0)',
      border: 'rgb(47, 51, 54)',
      shadow: '0 16px 48px rgba(0, 0, 0, 0.42)',
    };
  }

  return {
    background: 'rgb(255, 255, 255)',
    border: 'rgb(207, 217, 222)',
    shadow: '0 16px 48px rgba(15, 23, 42, 0.16)',
  };
};

const injectScreenshotStyle = (theme: ScreenshotTheme): void => {
  const style = document.createElement('style');
  style.id = 'opentabs-x-tweet-screenshot-style';
  style.textContent = `
    html, body {
      background: ${theme.background} !important;
      overflow: hidden !important;
    }

    #opentabs-x-tweet-screenshot-overlay {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: flex-start !important;
      justify-content: center !important;
      padding: 24px !important;
      background: ${theme.background} !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
    }

    #opentabs-x-tweet-screenshot-card {
      width: min(640px, calc(100vw - 48px)) !important;
      max-height: calc(100vh - 48px) !important;
      overflow: hidden !important;
      border: 1px solid ${theme.border} !important;
      border-radius: 16px !important;
      background: ${theme.background} !important;
      box-shadow: ${theme.shadow} !important;
    }

    #opentabs-x-tweet-screenshot-card article[data-testid="tweet"] {
      border: 0 !important;
    }

    #opentabs-x-tweet-screenshot-card [data-testid="reply"],
    #opentabs-x-tweet-screenshot-card [data-testid="retweet"],
    #opentabs-x-tweet-screenshot-card [data-testid="like"],
    #opentabs-x-tweet-screenshot-card [data-testid="bookmark"],
    #opentabs-x-tweet-screenshot-card [aria-label="Share post"],
    #opentabs-x-tweet-screenshot-card [aria-label="Share"] {
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
};

const makeScreenshotOverlay = (article: HTMLElement): HTMLElement => {
  const theme = getScreenshotTheme(article);
  removeExistingOverlay();
  injectScreenshotStyle(theme);

  const overlay = document.createElement('div');
  overlay.id = 'opentabs-x-tweet-screenshot-overlay';

  const card = document.createElement('div');
  card.id = 'opentabs-x-tweet-screenshot-card';
  card.appendChild(article.cloneNode(true));
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return card;
};

export const prepareTweetScreenshot = defineTool({
  name: 'prepare_tweet_screenshot',
  displayName: 'Prepare Tweet Screenshot',
  description:
    'Prepare the active X tab for a clean screenshot of a specific tweet. Opens the tweet URL when needed, then centers an isolated tweet card and hides surrounding UI so browser_screenshot_tab can save the PNG.',
  summary: 'Prepare tweet for screenshot',
  icon: 'camera',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().optional().describe('Numeric tweet ID. Overrides tweet_url when provided.'),
    tweet_url: z
      .string()
      .optional()
      .describe('X/Twitter tweet URL, for example https://x.com/user/status/123. Defaults to the active page URL.'),
    wait_ms: z
      .int()
      .min(500)
      .max(15_000)
      .optional()
      .describe('How long to wait for the tweet article to render after navigation. Default 10000.'),
  }),
  output: z.object({
    tweet_id: z.string().describe('Tweet ID prepared for screenshot'),
    tweet_url: z.string().describe('Canonical tweet URL'),
    navigated: z.boolean().describe('Whether the tool changed location to the tweet URL'),
    ready: z.boolean().describe('Whether the screenshot overlay is ready'),
    card_rect: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  }),
  handle: async params => {
    const tweetId = resolveTweetId(params);
    const canonicalUrl = tweetUrl(tweetId);
    const currentUrl = globalThis.location.href;
    const waitMs = params.wait_ms ?? 10_000;

    if (!currentUrl.includes(`/status/${tweetId}`)) {
      globalThis.location.href = canonicalUrl;
      await sleep(1_000);
    }

    const article = await waitForTweetArticle(tweetId, waitMs);
    const card = makeScreenshotOverlay(article);
    await sleep(250);

    return {
      tweet_id: tweetId,
      tweet_url: canonicalUrl,
      navigated: !currentUrl.includes(`/status/${tweetId}`),
      ready: true,
      card_rect: rectToObject(card.getBoundingClientRect()),
    };
  },
});
