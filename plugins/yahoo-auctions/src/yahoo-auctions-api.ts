import { ToolError, httpStatusToToolError } from '@opentabs-dev/plugin-sdk';

const YAHOO_AUCTIONS_ORIGIN = 'https://auctions.yahoo.co.jp';

export interface RawYahooAuctionSearchItem {
  auctionId: string;
  title: string;
  url: string;
  image: string;
  currentPriceJpy: number;
  buyoutPriceJpy: number | null;
  startPriceJpy: number | null;
  bids: number;
  timeLeft: string;
  endTimeUnix: number | null;
  freeShipping: boolean;
  sellerId: string;
  categoryId: string;
  isFleaMarket: boolean;
  isShoppingItem: boolean;
}

export interface RawYahooAuctionSearchResult {
  query: string;
  sourceUrl: string;
  items: RawYahooAuctionSearchItem[];
  minCurrentPriceJpy: number | null;
  minBuyoutPriceJpy: number | null;
}

export interface RawYahooAuctionDetail {
  auctionId: string;
  title: string;
  url: string;
  description: string;
  descriptionHtml: string;
  currentPriceJpy: number | null;
  buyoutPriceJpy: number | null;
  startPriceJpy: number | null;
  bids: number | null;
  watchers: number | null;
  quantity: number | null;
  condition: string;
  status: string;
  images: string[];
  sellerId: string;
  sellerDisplayName: string;
  sellerRating: string;
  sellerGoodRating: string;
  sellerLocation: string;
  shippingPayer: string;
  shippingMethods: string[];
  shipSchedule: string;
  endTime: string;
  categoryPath: string[];
  rawSourceUrl: string;
}

const cleanText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const decodeText = (text: string): string => {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent ?? text;
};

const parseInteger = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/[^\d-]/g, '');
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const absoluteYahooAuctionsUrl = (href: string): string => {
  if (!href) return '';
  try {
    return new URL(decodeText(href), YAHOO_AUCTIONS_ORIGIN).toString();
  } catch {
    return '';
  }
};

export const buildSearchUrl = (query: string, page = 1, perPage = 50): string => {
  const url = new URL('/search/search', YAHOO_AUCTIONS_ORIGIN);
  url.searchParams.set('p', query);
  url.searchParams.set('va', query);
  url.searchParams.set('is_postage_mode', '1');
  url.searchParams.set('dest_pref_code', '13');
  url.searchParams.set('user_type', 'c');
  url.searchParams.set('auccat', '');
  url.searchParams.set('tab_ex', 'commerce');
  url.searchParams.set('ei', 'utf-8');
  url.searchParams.set('aq', '-1');
  url.searchParams.set('oq', '');
  url.searchParams.set('sc_i', '');
  url.searchParams.set('x', '0');
  url.searchParams.set('y', '0');
  url.searchParams.set('b', String((Math.max(1, page) - 1) * perPage + 1));
  url.searchParams.set('n', String(perPage));
  return url.toString();
};

export const buildItemUrl = (auctionId: string): string => {
  if (/^https?:\/\//i.test(auctionId)) return auctionId;
  return `${YAHOO_AUCTIONS_ORIGIN}/jp/auction/${encodeURIComponent(auctionId)}`;
};

export const extractAuctionIdFromUrl = (url: string): string => {
  const match = url.match(/\/auction\/([A-Za-z0-9]+)/);
  return match?.[1] ?? '';
};

const fetchHtml = async (url: string): Promise<{ html: string; response: Response }> => {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`Yahoo! Auctions request timed out: ${url}`);
    throw ToolError.internal(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const html = await response.text();
  return { html, response };
};

export const fetchPage = async (url: string): Promise<string> => {
  const { html, response } = await fetchHtml(url);
  if (!response.ok) throw httpStatusToToolError(response, `Failed to fetch ${url}`);
  return html;
};

export const fetchSearchPage = async (url: string): Promise<string> => {
  const { html, response } = await fetchHtml(url);
  // Yahoo! Auctions can return HTTP 404 for keyword searches while still serving a valid result page.
  if (!response.ok && !html.includes('li class="Product"') && !html.includes('Products__items')) {
    throw httpStatusToToolError(response, `Failed to fetch ${url}`);
  }
  return html;
};

const parseSearchItem = (itemEl: Element): RawYahooAuctionSearchItem | null => {
  const linkEl = itemEl.querySelector<HTMLAnchorElement>('a.Product__titleLink, a.Product__imageLink');
  const bonusEl = itemEl.querySelector<HTMLElement>('.Product__bonus');
  const auctionId =
    linkEl?.dataset.auctionId ?? bonusEl?.dataset.auctionId ?? extractAuctionIdFromUrl(linkEl?.href ?? '');
  if (!auctionId) return null;

  const currentPriceJpy =
    parseInteger(linkEl?.dataset.auctionPrice) ??
    parseInteger(bonusEl?.dataset.auctionPrice) ??
    parseInteger(itemEl.querySelector('.Product__priceValue')?.textContent);
  if (currentPriceJpy === null) return null;

  return {
    auctionId,
    title: cleanText(linkEl?.dataset.auctionTitle ?? linkEl?.textContent ?? ''),
    url: absoluteYahooAuctionsUrl(linkEl?.href ?? buildItemUrl(auctionId)),
    image:
      linkEl?.dataset.auctionImg ??
      itemEl.querySelector<HTMLImageElement>('img.Product__imageData')?.src ??
      itemEl.querySelector<HTMLImageElement>('img')?.src ??
      '',
    currentPriceJpy,
    buyoutPriceJpy: parseInteger(bonusEl?.dataset.auctionBuynowprice),
    startPriceJpy: parseInteger(bonusEl?.dataset.auctionStartprice),
    bids: parseInteger(itemEl.querySelector('.Product__bid')?.textContent) ?? 0,
    timeLeft: cleanText(itemEl.querySelector('.Product__time')?.textContent ?? ''),
    endTimeUnix: parseInteger(bonusEl?.dataset.auctionEndtime),
    freeShipping: linkEl?.dataset.auctionIsfreeshipping === '1',
    sellerId: bonusEl?.dataset.auctionAucSellerId ?? '',
    categoryId: linkEl?.dataset.auctionCategory ?? '',
    isFleaMarket: linkEl?.dataset.auctionIsflea === '1',
    isShoppingItem: bonusEl?.dataset.auctionIsshoppingitem === '1',
  };
};

export const parseSearchResults = (html: string, query: string, sourceUrl: string): RawYahooAuctionSearchResult => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items: RawYahooAuctionSearchItem[] = [];
  const seen = new Set<string>();

  for (const itemEl of doc.querySelectorAll('li.Product')) {
    const item = parseSearchItem(itemEl);
    if (!item || seen.has(item.auctionId)) continue;
    seen.add(item.auctionId);
    items.push(item);
  }

  const currentPrices = items.map(item => item.currentPriceJpy).filter(price => Number.isFinite(price));
  const buyoutPrices = items
    .map(item => item.buyoutPriceJpy)
    .filter((price): price is number => typeof price === 'number' && price > 0);

  return {
    query,
    sourceUrl,
    items,
    minCurrentPriceJpy: currentPrices.length > 0 ? Math.min(...currentPrices) : null,
    minBuyoutPriceJpy: buyoutPrices.length > 0 ? Math.min(...buyoutPrices) : null,
  };
};

const firstJsonLdProduct = (doc: Document): Record<string, unknown> | null => {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent ?? '') as Record<string, unknown>;
      if (parsed['@type'] === 'Product') return parsed;
    } catch {
      // Skip non-product or malformed JSON-LD blocks.
    }
  }
  return null;
};

const parseNextData = (doc: Document): Record<string, unknown> | null => {
  const raw = doc.querySelector('#__NEXT_DATA__')?.textContent;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getNestedRecord = (value: unknown, path: string[]): Record<string, unknown> | null => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
};

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');
const getNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const getDetailItem = (nextData: Record<string, unknown> | null): Record<string, unknown> | null =>
  getNestedRecord(nextData, ['props', 'pageProps', 'initialState', 'item', 'detail', 'item']) ??
  getNestedRecord(nextData, ['props', 'initialState', 'item', 'detail', 'item']);

export const parseItemDetail = (html: string, sourceUrl: string): RawYahooAuctionDetail => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const jsonLd = firstJsonLdProduct(doc);
  const nextData = parseNextData(doc);
  const detail = getDetailItem(nextData);

  const auctionId = getString(detail?.auctionId) || extractAuctionIdFromUrl(sourceUrl);
  const offers = jsonLd?.offers && typeof jsonLd.offers === 'object' ? (jsonLd.offers as Record<string, unknown>) : {};
  const seller = detail?.seller && typeof detail.seller === 'object' ? (detail.seller as Record<string, unknown>) : {};
  const rating = seller.rating && typeof seller.rating === 'object' ? (seller.rating as Record<string, unknown>) : {};
  const location =
    seller.location && typeof seller.location === 'object' ? (seller.location as Record<string, unknown>) : {};
  const shipping =
    detail?.shipping && typeof detail.shipping === 'object' ? (detail.shipping as Record<string, unknown>) : {};
  const category =
    detail?.category && typeof detail.category === 'object' ? (detail.category as Record<string, unknown>) : {};
  const categoryPath = Array.isArray(category.path)
    ? category.path
        .map(node => (node && typeof node === 'object' ? getString((node as Record<string, unknown>).name) : ''))
        .filter(Boolean)
    : [];
  const images = Array.isArray(detail?.img)
    ? detail.img
        .map(image => (image && typeof image === 'object' ? getString((image as Record<string, unknown>).image) : ''))
        .filter(Boolean)
    : Array.isArray(jsonLd?.image)
      ? jsonLd.image.map(image => String(image)).filter(Boolean)
      : [];
  const descriptions = Array.isArray(detail?.description) ? detail.description.map(line => String(line)) : [];
  const shippingMethods = Array.isArray(shipping.methods)
    ? shipping.methods
        .map(method =>
          method && typeof method === 'object' ? getString((method as Record<string, unknown>).name) : '',
        )
        .filter(Boolean)
    : [];

  return {
    auctionId,
    title:
      getString(detail?.title) || getString(jsonLd?.name) || cleanText(doc.title.replace(/Yahoo!オークション -/, '')),
    url: getString(detail?.auctionItemUrl) || sourceUrl,
    description: descriptions.length > 0 ? cleanText(descriptions.join(' ')) : getString(jsonLd?.description),
    descriptionHtml: getString(detail?.descriptionHtml),
    currentPriceJpy: getNumber(detail?.price) ?? parseInteger(String(offers.price ?? '')),
    buyoutPriceJpy: getNumber(detail?.bidorbuy),
    startPriceJpy: getNumber(detail?.initPrice),
    bids: getNumber(detail?.bids),
    watchers: getNumber(detail?.watchListNum),
    quantity: getNumber(detail?.quantity),
    condition: getString(detail?.conditionName),
    status: getString(detail?.status),
    images,
    sellerId: getString(detail?.aucUserId) || getString(seller.aucUserId),
    sellerDisplayName: getString(seller.displayName),
    sellerRating: rating.summary === undefined ? '' : String(rating.summary),
    sellerGoodRating: getString(rating.goodRating),
    sellerLocation: getString(location.prefecture),
    shippingPayer: getString(detail?.chargeForShipping),
    shippingMethods,
    shipSchedule: getString(detail?.shipScheduleName),
    endTime: getString(detail?.endTime),
    categoryPath,
    rawSourceUrl: sourceUrl,
  };
};
