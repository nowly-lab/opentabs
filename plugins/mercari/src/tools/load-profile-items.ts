import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const MERCARI_ORIGIN = 'https://jp.mercari.com';
const ITEM_HREF_PATTERN = /\/item\/([^/?#]+)/;
const PROFILE_ID_PATTERN = /\/user\/profile\/([0-9]+)/;

const profileItemSchema = z.object({
  item_id: z.string().describe('Mercari item ID'),
  url: z.string().describe('Mercari item URL'),
  profile_text: z.string().describe('Visible profile-list text for this item card'),
});

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const normalizeItemLink = (anchor: HTMLAnchorElement) => {
  const href = anchor.getAttribute('href') ?? '';
  const match = href.match(ITEM_HREF_PATTERN);
  if (!match?.[1]) return null;
  return {
    item_id: match[1],
    url: `${MERCARI_ORIGIN}/item/${match[1]}`,
    profile_text: anchor.textContent?.trim() ?? '',
  };
};

const collectItemLinks = () => {
  const byId = new Map<string, z.infer<typeof profileItemSchema>>();
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      '#item-grid > ul > li > div > a, a[data-testid="thumbnail-link"], a[href*="/item/"]',
    ),
  );
  for (const anchor of anchors) {
    const link = normalizeItemLink(anchor);
    if (link) byId.set(link.item_id, link);
  }
  return Array.from(byId.values());
};

const mergeItemLinks = (
  byId: Map<string, z.infer<typeof profileItemSchema>>,
  links: z.infer<typeof profileItemSchema>[],
): void => {
  for (const link of links) byId.set(link.item_id, link);
};

const isVisible = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
};

const isInViewport = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  return rect.bottom >= 0 && rect.top <= window.innerHeight;
};

const getLoadingElementCount = (): number => {
  const selectors = [
    '[aria-busy="true"]',
    '[aria-label*="読込"]',
    '[aria-label*="読み込"]',
    '[aria-label*="ロード"]',
    '[data-testid*="loading" i]',
    '[data-testid*="spinner" i]',
    '[class*="loading" i]',
    '[class*="spinner" i]',
    '[role="progressbar"]',
  ];
  return Array.from(document.querySelectorAll(selectors.join(','))).filter(isVisible).length;
};

const isMoreButtonLoading = (button: HTMLButtonElement): boolean => {
  const text = button.textContent?.trim() ?? '';
  return (
    button.disabled ||
    button.getAttribute('aria-busy') === 'true' ||
    button.getAttribute('aria-disabled') === 'true' ||
    Boolean(
      button.querySelector(
        [
          '[aria-busy="true"]',
          '[aria-label*="読込"]',
          '[aria-label*="読み込"]',
          '[aria-label*="ロード"]',
          '[data-testid*="loading" i]',
          '[data-testid*="spinner" i]',
          '[class*="loading" i]',
          '[class*="spinner" i]',
          '[role="progressbar"]',
        ].join(','),
      ),
    ) ||
    /読込|読み込|ロード|loading/i.test(text)
  );
};

const findMoreItemsButton = (): HTMLButtonElement | null => {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  // The seller bio has a separate "もっとみる"; use the exact product-list button text.
  return buttons.reverse().find((button) => button.textContent?.trim() === 'もっと見る' && isVisible(button)) ?? null;
};

const waitForDomSettledAfterMore = async (
  button: HTMLButtonElement,
  previousCount: number,
  timeoutMs: number,
  stableMs: number,
): Promise<{ itemCount: number; loadingElementCount: number; moreButtonLoadingSeen: boolean; timedOut: boolean }> => {
  const start = Date.now();
  let lastChangeAt = Date.now();
  let lastCount = collectItemLinks().length;
  let lastLoadingCount = getLoadingElementCount();
  let moreButtonLoadingSeen = isMoreButtonLoading(button);

  while (Date.now() - start < timeoutMs) {
    await sleep(150);
    const itemCount = collectItemLinks().length;
    const loadingElementCount = getLoadingElementCount();
    moreButtonLoadingSeen = moreButtonLoadingSeen || isMoreButtonLoading(button);
    if (itemCount !== lastCount || loadingElementCount !== lastLoadingCount) {
      lastCount = itemCount;
      lastLoadingCount = loadingElementCount;
      lastChangeAt = Date.now();
    }

    const grew = itemCount > previousCount;
    const idle = Date.now() - lastChangeAt >= stableMs;
    if (grew && loadingElementCount === 0 && idle) {
      return { itemCount, loadingElementCount, moreButtonLoadingSeen, timedOut: false };
    }

    const buttonReturned = findMoreItemsButton() !== null;
    if (!grew && loadingElementCount === 0 && buttonReturned && idle) {
      return { itemCount, loadingElementCount, moreButtonLoadingSeen, timedOut: false };
    }
  }

  return { itemCount: lastCount, loadingElementCount: lastLoadingCount, moreButtonLoadingSeen, timedOut: true };
};

const waitForPageReady = async (timeoutMs: number): Promise<void> => {
  const start = Date.now();
  while (document.readyState === 'loading' && Date.now() - start < timeoutMs) {
    await sleep(100);
  }
  while (collectItemLinks().length === 0 && Date.now() - start < timeoutMs) {
    await sleep(250);
  }
};

const scrollDownProfileList = async (): Promise<number> => {
  const before = window.scrollY;
  window.scrollBy({ top: Math.max(120, window.innerHeight * 0.2), behavior: 'instant' });
  await sleep(220);
  return window.scrollY - before;
};

const isNearPageBottom = (): boolean => {
  const scrollBottom = window.scrollY + window.innerHeight;
  return document.documentElement.scrollHeight - scrollBottom < 12;
};

const buildProfileUrl = (accountId: string, profileUrl: string): string => {
  if (profileUrl) return profileUrl;
  return `${MERCARI_ORIGIN}/user/profile/${accountId}`;
};

const getAccountId = (accountId: string, profileUrl: string): string => {
  if (accountId) return accountId;
  const match = profileUrl.match(PROFILE_ID_PATTERN);
  return match?.[1] ?? '';
};

export const loadProfileItems = defineTool({
  name: 'load_profile_items',
  displayName: 'Load Profile Items',
  description:
    'Load all currently reachable item cards from a Mercari Japan seller profile by repeatedly clicking the product-list "もっと見る" button and waiting at DOM level for loading indicators to disappear. Returns item IDs and URLs only; call get_item afterward for details.',
  summary: 'Load Mercari seller profile item list',
  icon: 'list',
  group: 'Sourcing',
  input: z
    .object({
      account_id: z.string().default('').describe('Mercari seller account ID, e.g. 335966660'),
      profile_url: z.string().default('').describe('Mercari profile URL. Overrides account_id when provided.'),
      max_rounds: z.number().int().min(1).max(1000).default(300).describe('Maximum "もっと見る" click rounds'),
      wait_timeout_ms: z.number().int().min(1000).max(60000).default(20000).describe('Per-click DOM wait timeout'),
      stable_ms: z.number().int().min(200).max(10000).default(900).describe('DOM idle duration after loading disappears'),
    })
    .refine((value) => value.account_id || value.profile_url, {
      message: 'account_id or profile_url is required',
    }),
  output: z.object({
    account_id: z.string().describe('Mercari seller account ID when known'),
    profile_url: z.string().describe('Mercari profile URL loaded'),
    item_count: z.number().describe('Number of unique item links collected'),
    items: z.array(profileItemSchema).describe('Unique profile item links'),
    rounds: z.number().describe('Number of product-list load rounds attempted'),
    reached_end: z.boolean().describe('Whether no visible product-list "もっと見る" button remained'),
    timed_out: z.boolean().describe('Whether any DOM wait timed out'),
    loading_element_count: z.number().describe('Visible loading/spinner-like elements after the final round'),
  }),
  handle: async (params) => {
    const profileUrl = buildProfileUrl(params.account_id, params.profile_url);
    if (location.href !== profileUrl) {
      location.assign(profileUrl);
      await waitForPageReady(params.wait_timeout_ms);
    } else {
      await waitForPageReady(params.wait_timeout_ms);
    }

    const byId = new Map<string, z.infer<typeof profileItemSchema>>();
    mergeItemLinks(byId, collectItemLinks());
    let items = Array.from(byId.values());
    let rounds = 0;
    let timedOut = false;
    let loadingElementCount = getLoadingElementCount();
    let unchangedRounds = 0;
    let reachedEnd = false;

    for (; rounds < params.max_rounds; rounds += 1) {
      const previousCount = byId.size;
      const button = findMoreItemsButton();
      items = Array.from(byId.values());

      if (button && isInViewport(button)) {
        const previousDomCount = collectItemLinks().length;
        button.scrollIntoView({ block: 'center' });
        button.click();
        const waitResult = await waitForDomSettledAfterMore(
          button,
          previousDomCount,
          params.wait_timeout_ms,
          params.stable_ms,
        );
        loadingElementCount = waitResult.loadingElementCount;
        timedOut = timedOut || waitResult.timedOut;
        reachedEnd = !waitResult.moreButtonLoadingSeen;
      } else {
        const deltaY = await scrollDownProfileList();
        loadingElementCount = getLoadingElementCount();
        if (loadingElementCount > 0) await sleep(params.stable_ms);
        if (deltaY === 0 && isNearPageBottom()) await sleep(params.stable_ms);
      }

      mergeItemLinks(byId, collectItemLinks());
      items = Array.from(byId.values());

      if (items.length === previousCount) {
        unchangedRounds += 1;
      } else {
        unchangedRounds = 0;
      }

      if (
        reachedEnd ||
        (unchangedRounds >= 12 && !findMoreItemsButton() && isNearPageBottom() && getLoadingElementCount() === 0)
      ) {
        break;
      }
    }

    return {
      account_id: getAccountId(params.account_id, profileUrl),
      profile_url: profileUrl,
      item_count: items.length,
      items,
      rounds,
      reached_end: reachedEnd || findMoreItemsButton() === null,
      timed_out: timedOut,
      loading_element_count: loadingElementCount,
    };
  },
});
