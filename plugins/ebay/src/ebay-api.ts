import { ToolError, fetchFromPage, getPageGlobal, httpStatusToToolError, waitUntil } from '@opentabs-dev/plugin-sdk';

// --- Auth detection ---
// eBay uses HttpOnly session cookies (not accessible via document.cookie).
// Auth is detected via the `window.GHpre` page global which contains user
// identity data on every page for logged-in users. The actual API auth uses
// session cookies sent automatically via credentials: 'include'.

interface EbayAuth {
  userId: string;
  firstName: string;
}

const getAuth = (): EbayAuth | null => {
  const userId = getPageGlobal('GHpre.userId') as string | undefined;
  if (!userId) return null;
  const firstName = (getPageGlobal('GHpre.fn') as string | undefined) ?? '';
  return { userId, firstName };
};

export const isAuthenticated = (): boolean => getAuth() !== null;

export const waitForAuth = (): Promise<boolean> =>
  waitUntil(() => isAuthenticated(), { interval: 500, timeout: 5000 }).then(
    () => true,
    () => false,
  );

export const getCurrentUser = (): EbayAuth => {
  const auth = getAuth();
  if (!auth) throw ToolError.auth('Not authenticated — please log in to eBay.');
  return auth;
};

// --- HTML fetcher ---
// eBay is primarily server-rendered. HTML pages can be 1-2MB, so we use raw
// fetch with a generous timeout to avoid dispatch chain timeouts.

const requireAuth = (): void => {
  if (!getAuth()) throw ToolError.auth('Not authenticated — please log in to eBay.');
};

export const fetchPage = async (url: string): Promise<string> => {
  requireAuth();

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw ToolError.timeout(`Page request timed out: ${url}`);
    throw ToolError.internal(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) throw httpStatusToToolError(response, `Failed to fetch ${url}`);
  return response.text();
};

// --- JSON fetcher ---
// A few eBay endpoints return JSON (autocomplete, watch/unwatch).

export const fetchJson = async <T>(url: string): Promise<T> => {
  requireAuth();

  const response = await fetchFromPage(url, {
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
};

// --- Search HTML parser ---
// Parses search result items from eBay's server-rendered HTML.

export interface RawSearchItem {
  title: string;
  price: string;
  itemId: string;
  url: string;
  image: string;
  condition: string;
  shipping: string;
  bids: string;
}

const EBAY_ORIGIN = 'https://www.ebay.com';

const cleanText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const decodeText = (text: string): string => {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent ?? text;
};

const parseJsonString = (value: string): string => {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
};

const absoluteEbayUrl = (href: string): string => {
  if (!href) return '';
  try {
    return new URL(decodeText(href), EBAY_ORIGIN).toString();
  } catch {
    return '';
  }
};

const stripEbayTracking = (url: string): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url, EBAY_ORIGIN);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
};

export const extractItemIdFromUrl = (url: string): string => {
  const match = decodeText(url).match(/\/itm\/(?:[^/?#]+\/)?(\d{8,})/);
  return match?.[1] ?? '';
};

export const extractStoreSlugFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url, EBAY_ORIGIN);
    const [, firstSegment, secondSegment] = parsed.pathname.split('/');
    if (firstSegment !== 'str' || !secondSegment) return '';
    return decodeURIComponent(secondSegment);
  } catch {
    return '';
  }
};

export const buildStoreUrl = (input: { storeUrl?: string; storeSlug?: string }): string => {
  if (input.storeUrl) {
    const absoluteUrl = absoluteEbayUrl(input.storeUrl);
    return stripEbayTracking(absoluteUrl);
  }

  if (input.storeSlug) {
    return `${EBAY_ORIGIN}/str/${encodeURIComponent(input.storeSlug)}`;
  }

  throw ToolError.validation('Provide either store_url or store_slug');
};

export const buildStoreItemsUrl = (storeUrl: string, page: number, query?: string): string => {
  const url = new URL(buildStoreUrl({ storeUrl }));
  url.searchParams.set('_pgn', String(page));
  if (query) url.searchParams.set('_nkw', query);
  return url.toString();
};

const firstMetaContent = (doc: Document, selectors: string): string => {
  for (const selector of selectors.split(',')) {
    const content = doc.querySelector(selector.trim())?.getAttribute('content')?.trim();
    if (content) return content;
  }
  return '';
};

const firstJsonStringValue = (html: string, key: string): string => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'));
  return match?.[1] ? parseJsonString(match[1]) : '';
};

const firstUrlAfterKey = (html: string, key: string): string => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`"${escapedKey}"[\\s\\S]{0,500}?"URL"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'));
  return match?.[1] ? parseJsonString(match[1]) : '';
};

const extractLocationText = (text: string): string => {
  const normalized = cleanText(text);
  if (/\b(?:item location\s*:?\s*|located in\s+|ships? from\s+|from\s+)Japan(?=\b|Opens|新しい)/i.test(normalized))
    return 'Japan';

  const patterns = [
    /\bItem location\s*:?\s*(Japan)\b/i,
    /\bLocated in\s+(Japan)\b/i,
    /\bShips? from\s+(Japan)\b/i,
    /\bFrom\s+(Japan)\b/i,
    /\bItem location\s*:?\s*([^|•]{2,90})/i,
    /\bLocated in\s+([^|•]{2,90})/i,
    /\bShips? from\s+([^|•]{2,90})/i,
    /\bFrom\s+([A-Za-z][A-Za-z\s,.-]{2,90})/i,
    /発送元[:：]?\s*([^|•]{2,90})/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1])
        .replace(/\s+(?:JPY|USD|EUR|GBP|CAD|AUD)\b.*$/i, '')
        .replace(/[.。].*$/, '');
    }
  }

  return '';
};

const collectJapanShippingSignals = (text: string, location = ''): string[] => {
  const signals = new Set<string>();
  const checks: Array<[RegExp, string]> = [
    [/\b(?:ships?|shipping|shipped)\s+from\s+Japan(?=\b|Opens|新しい)/i, 'ships from Japan'],
    [/\bitem location\s*:?\s*Japan(?=\b|Opens|新しい)/i, 'item location Japan'],
    [/\blocated in\s+Japan(?=\b|Opens|新しい)/i, 'located in Japan'],
    [/\bfrom\s+Japan(?=\b|Opens|新しい)/i, 'from Japan'],
    [/日本から発送|日本発送|発送元[:：]?\s*日本/, 'ships from Japan (Japanese text)'],
  ];

  for (const [pattern, label] of checks) {
    if (pattern.test(text)) signals.add(label);
  }

  if (/\bJapan\b|日本/.test(location)) signals.add(`location: ${location}`);

  return [...signals];
};

const cleanItemTitle = (title: string): string =>
  cleanText(title)
    .replace(/Opens in a new window or tab/gi, '')
    .replace(/新しいウィンドウまたはタブに表示されます/g, '')
    .trim();

const firstElementText = (root: Element, selectors: string[]): string => {
  for (const selector of selectors) {
    const text = root.querySelector(selector)?.textContent ?? '';
    const cleaned = cleanText(text);
    if (cleaned) return cleaned;
  }
  return '';
};

const parseCardItem = (card: Element): RawSearchItem | null => {
  const linkEl = card.querySelector('a[href*="/itm/"]');
  const href = linkEl?.getAttribute('href') ?? '';
  const itemId = extractItemIdFromUrl(href);
  if (!itemId || itemId === '123456') return null;

  const title =
    cleanItemTitle(
      firstElementText(card, [
        '.str-card-title',
        '.str-item-card__property-title',
        '[role="heading"]',
        '.s-card__title',
        'a.str-item-card__link',
        'a[href*="/itm/"]',
      ]),
    ) ||
    cleanItemTitle(linkEl?.getAttribute('aria-label') ?? '') ||
    cleanItemTitle(linkEl?.getAttribute('title') ?? '');

  const price = firstElementText(card, [
    '.str-item-card__property-displayPrice',
    '[class*="displayPrice"]',
    '[class*="DisplayPrice"]',
    '[class*="Price"]',
    '[class*="price"]',
    '.notranslate',
  ]);

  const imgEl = card.querySelector('img');
  const image = imgEl?.getAttribute('src') ?? '';

  const allText = card.textContent ?? '';

  const conditionMatch = allText.match(/(Brand New|New|Pre-Owned|Used|Refurbished|Open Box|For parts)/i);
  const condition = conditionMatch?.[1] ?? '';

  const shippingMatch = allText.match(/(Free shipping|\+\$[\d.]+\s*shipping)/i);
  const shipping = shippingMatch?.[1] ?? '';

  const bidsMatch = allText.match(/(\d+)\s*bid/i);
  const bids = bidsMatch?.[1] ?? '';

  const absoluteUrl = absoluteEbayUrl(href);
  const cleanUrl = absoluteUrl ? stripEbayTracking(absoluteUrl) : `https://www.ebay.com/itm/${itemId}`;

  return {
    title,
    price,
    itemId,
    url: cleanUrl,
    image,
    condition,
    shipping,
    bids,
  };
};

export const parseSearchResults = (html: string): RawSearchItem[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const cards = doc.querySelectorAll('li.s-card, li.s-item, [data-testid="item-card"], article[data-testid^="ig-"]');
  const items: RawSearchItem[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    const item = parseCardItem(card);
    if (item && !seen.has(item.itemId)) {
      seen.add(item.itemId);
      items.push(item);
    }
  }

  return items;
};

// --- Item detail parser ---
// Parses JSON-LD Product schema from eBay item pages.

export interface RawItemDetail {
  itemId: string;
  title: string;
  price: string;
  currency: string;
  listPrice: string;
  condition: string;
  availability: string;
  images: string[];
  seller: string;
  sellerUrl: string;
  url: string;
  brand: string;
  description: string;
  sellerDescription: string;
  sellerDescriptionUrl: string;
  sellerDescriptionSections: Record<string, string>;
  itemSpecifics: Record<string, string>;
  shippingDetails: string;
  customsDuties: string;
  paymentMethods: string[];
  shipping: string;
  returnPolicy: string;
  watchers: string;
}

export interface ItemDetailExtras {
  sellerDescriptionHtml?: string;
}

const cleanSectionKey = (text: string): string =>
  cleanText(text)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const extractLabelValuePairs = (root: ParentNode): Record<string, string> => {
  const pairs: Record<string, string> = {};
  const containers = root.querySelectorAll(
    '.ux-layout-section__item, .ux-labels-values, [data-testid="ux-labels-values"]',
  );
  const excludedLabels = new Set([
    'Shipping',
    'Import fees',
    'Delivery',
    'Returns',
    'Payments',
    'Seller assumes all responsibility for this listing.',
    'Last updated on Jun 25, 2026 14:00:23 PDTView all revisions View all revisions',
  ]);

  for (const container of containers) {
    const lines = (container.textContent ?? '')
      .split(/\n+/)
      .map(line => cleanText(line).replace(/:$/, ''))
      .filter(Boolean);
    const explicitLabel = cleanText(container.querySelector('.ux-labels-values__labels')?.textContent ?? '').replace(
      /:$/,
      '',
    );
    const label = explicitLabel || lines[0] || '';
    const value =
      cleanText(container.querySelector('.ux-labels-values__values')?.textContent ?? '') ||
      cleanText(lines.slice(1).join(' '));
    if (excludedLabels.has(label) || /^eBay item number/i.test(label)) continue;
    if (label && value && label !== value) pairs[label] = value;
  }

  return pairs;
};

export const extractSellerDescriptionUrl = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const iframeSrc =
    doc
      .querySelector(
        'iframe[src*="ViewItemDesc"], iframe[src*="ebaydesc"], iframe[id*="desc"], iframe[title*="description" i]',
      )
      ?.getAttribute('src') ?? '';
  if (iframeSrc) return absoluteEbayUrl(iframeSrc);

  const match =
    html.match(/https?:\\?\/\\?\/[^"'<>\\\s]+(?:ViewItemDesc|ebaydesc)[^"'<>\\\s]*/i) ??
    html.match(/(?:src|URL)"?\s*[:=]\s*"((?:\\.|[^"\\])*(?:ViewItemDesc|ebaydesc)(?:\\.|[^"\\])*)"/i);
  if (!match?.[1] && !match?.[0]) return '';

  return absoluteEbayUrl(parseJsonString((match[1] ?? match[0]).replace(/\\\//g, '/')));
};

const parseSellerDescription = (html: string): { text: string; sections: Record<string, string> } => {
  if (!html) return { text: '', sections: {} };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  for (const el of doc.querySelectorAll('script, style, noscript')) el.remove();

  const sections: Record<string, string> = {};
  const headings = doc.querySelectorAll('h1, h2, h3, h4, [class*="title" i], [class*="header" i]');
  for (const heading of headings) {
    const key = cleanSectionKey(heading.textContent ?? '');
    if (!key || sections[key]) continue;

    const chunks: string[] = [];
    let current = heading.nextElementSibling;
    while (current && chunks.length < 8) {
      if (/^H[1-4]$/i.test(current.tagName)) break;
      const text = cleanText(current.textContent ?? '');
      if (text) chunks.push(text);
      current = current.nextElementSibling;
    }

    if (chunks.length > 0) sections[key] = chunks.join(' ').substring(0, 2000);
  }

  return {
    text: cleanText(doc.body.textContent ?? '').substring(0, 6000),
    sections,
  };
};

const extractDelimitedText = (text: string, start: RegExp, end: RegExp): string => {
  const startMatch = start.exec(text);
  if (!startMatch?.index && startMatch?.index !== 0) return '';
  const afterStart = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = end.exec(afterStart);
  return cleanText((endMatch ? afterStart.slice(0, endMatch.index) : afterStart).substring(0, 2500));
};

const extractPaymentMethods = (text: string): string[] => {
  const methods: Array<[string, RegExp]> = [
    ['Klarna', /\bKlarna\b/i],
    ['PayPal', /\bPayPal\b/i],
    ['Venmo', /\bVenmo\b/i],
    ['Google Pay', /\bGoogle\s+Pay\b/i],
    ['Visa', /\bVisa\b/i],
    ['JCB', /\bJCB\b/i],
    ['Mastercard', /\bMaster\s*card\b/i],
    ['Discover', /\bDiscover\b/i],
  ];
  return methods.filter(([, pattern]) => pattern.test(text)).map(([method]) => method);
};

const extractWatcherCount = (text: string): string => {
  const patterns = [
    /\b([0-9][0-9,]*)\s+(?:watchers?|people\s+are\s+watching|watching)\b/i,
    /\bwatchers?\s*[:：]?\s*([0-9][0-9,]*)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/,/g, '');
  }

  return '';
};

export const parseItemDetail = (html: string, itemId: string, extras: ItemDetailExtras = {}): RawItemDetail => {
  // Parse JSON-LD Product schema (eBay uses unquoted type attribute)
  const ldJsonRegex = /<script type=application\/ld\+json>([\s\S]*?)<\/script>/g;
  let productData: Record<string, unknown> | null = null;

  let ldMatch: RegExpExecArray | null = ldJsonRegex.exec(html);
  while (ldMatch !== null) {
    try {
      const jsonStr = ldMatch[1] ?? '';
      const data = JSON.parse(jsonStr.trim()) as Record<string, unknown>;
      if (data['@type'] === 'Product') {
        productData = data;
        break;
      }
    } catch {
      // skip invalid JSON
    }
    ldMatch = ldJsonRegex.exec(html);
  }

  if (!productData) {
    throw ToolError.notFound(`Item ${itemId} not found or has no product data`);
  }

  const offers = (productData.offers ?? {}) as Record<string, unknown>;
  const priceSpec = (offers.priceSpecification ?? {}) as Record<string, unknown>;

  const shippingDetails = offers.shippingDetails;
  let shippingCost = '';
  if (Array.isArray(shippingDetails) && shippingDetails.length > 0) {
    const detail = shippingDetails[0] as Record<string, unknown>;
    const rate = detail.shippingRate as Record<string, unknown> | undefined;
    if (rate) {
      const val = String(rate.value ?? '');
      const cur = String(rate.currency ?? '');
      shippingCost = val === '0' || val === '0.0' ? 'Free' : `${cur} ${val}`;
    }
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sellerEl = doc.querySelector('[data-testid="str-title"] a, .x-sellercard-atf__info__about-seller a');
  const sellerName = sellerEl?.textContent?.trim() ?? '';
  const sellerHref = sellerEl?.getAttribute('href') ?? '';

  const descriptionEl = doc.querySelector('.x-item-description, [data-testid="item-description"]');
  const sellerDescriptionUrl = extractSellerDescriptionUrl(html);
  const sellerDescription = parseSellerDescription(extras.sellerDescriptionHtml ?? '');
  const description =
    cleanText(descriptionEl?.textContent ?? '') ||
    sellerDescription.sections.product_information ||
    sellerDescription.text.substring(0, 500);
  const pageText = cleanText(doc.body.textContent ?? '');
  const watchers = extractWatcherCount(pageText);
  const itemSpecifics = extractLabelValuePairs(doc);
  const shippingSummary = extractDelimitedText(
    pageText,
    /Shipping,\s*returns,\s*and\s*payments/i,
    /Shop\s+with\s+confidence|About\s+this\s+item|Item\s+specifics/i,
  );
  const customsDuties =
    sellerDescription.sections.customs_duties ??
    extractDelimitedText(sellerDescription.text, /Customs\s+Duties/i, /CHECK\s+MY\s+OTHER\s+ITEMS|Copyright/i);
  const paymentMetadata = [...doc.querySelectorAll('img, [aria-label], [title]')]
    .map(
      el => `${el.getAttribute('alt') ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`,
    )
    .join(' ');
  const paymentMethods = extractPaymentMethods(`${pageText} ${paymentMetadata} ${sellerDescription.text}`);

  const returnEl = doc.querySelector('.x-returns-minview, [data-testid="x-returns-minview"]');
  const returnPolicy = returnEl?.textContent?.trim() ?? '';

  const name = String(productData.name ?? '');
  const conditionUrl = String(offers.itemCondition ?? '');
  const conditionMap: Record<string, string> = {
    'https://schema.org/NewCondition': 'New',
    'https://schema.org/UsedCondition': 'Used',
    'https://schema.org/RefurbishedCondition': 'Refurbished',
    'https://schema.org/DamagedCondition': 'For Parts',
  };

  const brandObj = productData.brand as Record<string, unknown> | undefined;

  return {
    itemId,
    title: name.replace(/&#034;/g, '"').replace(/&amp;/g, '&'),
    price: String(offers.price ?? ''),
    currency: String(offers.priceCurrency ?? 'USD'),
    listPrice: String(priceSpec.price ?? ''),
    condition: conditionMap[conditionUrl] ?? '',
    availability: String(offers.availability ?? '').replace('https://schema.org/', ''),
    images: Array.isArray(productData.image) ? (productData.image as string[]) : [],
    seller: sellerName,
    sellerUrl: sellerHref,
    url: String(offers.url ?? ''),
    brand: String(brandObj?.name ?? ''),
    description,
    sellerDescription: sellerDescription.text,
    sellerDescriptionUrl,
    sellerDescriptionSections: sellerDescription.sections,
    itemSpecifics,
    shippingDetails: shippingSummary,
    customsDuties,
    paymentMethods,
    shipping: shippingCost,
    returnPolicy,
    watchers,
  };
};

// --- Store parsers ---
// Store pages mix server-rendered cards with serialized page state. The parser
// keeps DOM selectors first and falls back to embedded state/link extraction so
// tool output remains useful across eBay markup revisions.

export interface RawItemStore {
  itemId: string;
  itemUrl: string;
  seller: string;
  sellerUrl: string;
  storeName: string;
  storeUrl: string;
  storeSlug: string;
  itemLocation: string;
  itemShipsFromJapan: boolean;
  item: RawItemDetail;
}

export interface RawStoreInfo {
  name: string;
  storeUrl: string;
  storeSlug: string;
  description: string;
  logo: string;
  sellerId: string;
  itemsSold: string;
  followers: string;
  location: string;
  shipsFromJapan: boolean;
  japanSignals: string[];
}

export interface RawStoreItem extends RawSearchItem {
  location: string;
  shipsFromJapan: boolean;
}

const findStoreLink = (doc: Document, html: string): string => {
  const selectors = [
    'a[href*="/str/"]',
    '[data-testid="str-title"] a[href*="/str/"]',
    '.x-sellercard-atf__info__about-seller a[href*="/str/"]',
  ];

  for (const selector of selectors) {
    const href = doc.querySelector(selector)?.getAttribute('href') ?? '';
    if (href) return stripEbayTracking(absoluteEbayUrl(href));
  }

  const match =
    html.match(/https?:\\?\/\\?\/www\.ebay\.com\\?\/str\\?\/[^"'<>\\\s]+/i) ?? html.match(/\/str\/[^"'<>\\\s]+/i);
  if (!match?.[0]) return '';

  return stripEbayTracking(absoluteEbayUrl(match[0].replace(/\\\//g, '/')));
};

export const parseItemStore = (html: string, itemId: string, itemUrl: string): RawItemStore => {
  const item = parseItemDetail(html, itemId);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const storeUrl = findStoreLink(doc, html);
  const storeSlug = extractStoreSlugFromUrl(storeUrl);
  const itemPageText = cleanText(doc.body.textContent ?? '');
  const itemLocation = extractLocationText(itemPageText);
  const itemJapanSignals = collectJapanShippingSignals(`${item.shipping} ${itemPageText}`, itemLocation);

  return {
    itemId,
    itemUrl: itemUrl || item.url || `${EBAY_ORIGIN}/itm/${itemId}`,
    seller: item.seller,
    sellerUrl: item.sellerUrl,
    storeName: storeSlug,
    storeUrl,
    storeSlug,
    itemLocation,
    itemShipsFromJapan: itemJapanSignals.length > 0,
    item,
  };
};

export const parseStoreInfo = (html: string, storeUrl: string): RawStoreInfo => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const canonicalUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  const storeCandidateUrl = extractStoreSlugFromUrl(canonicalUrl) ? canonicalUrl : storeUrl;
  const normalizedStoreUrl = buildStoreUrl({ storeUrl: storeCandidateUrl });
  const storeSlug = extractStoreSlugFromUrl(normalizedStoreUrl);

  const metaTitle = firstMetaContent(doc, 'meta[property="og:title"], meta[name="twitter:title"]');
  const pageTitle = doc.querySelector('title')?.textContent?.trim() ?? '';
  const stateDisplayName = firstJsonStringValue(html, 'displayName');
  const name = cleanText(stateDisplayName || metaTitle || pageTitle).replace(/\s*\|\s*eBay Stores?$/i, '');

  const description =
    cleanText(firstJsonStringValue(html, 'description')) ||
    cleanText(firstMetaContent(doc, 'meta[name="description"], meta[property="og:description"]'));
  const logo =
    firstUrlAfterKey(html, 'logo') || firstMetaContent(doc, 'meta[property="og:image"], meta[name="twitter:image"]');

  const pageText = cleanText(doc.body.textContent ?? '');
  const combinedText = `${description} ${pageText}`;
  const location = extractLocationText(combinedText);
  const japanSignals = collectJapanShippingSignals(combinedText, location);

  const soldMatch =
    combinedText.match(/([\d,.]+[KMB]?)\s*(?:items?\s+sold|sold|点を販売済み)/i) ??
    html.match(/"soldDescription"[\s\S]{0,500}?"text"\s*:\s*"([^"]+)"/i);
  const followersMatch = combinedText.match(/([\d,.]+[KMB]?)\s*(?:followers?|フォロワー)/i);
  const sellerIdMatch =
    html.match(/entity_id=%7E([^"&]+)/i) ?? html.match(/"seller"[\s\S]{0,500}?"username"\s*:\s*"((?:\\.|[^"\\])*)"/i);

  return {
    name,
    storeUrl: normalizedStoreUrl,
    storeSlug,
    description: description.substring(0, 1000),
    logo,
    sellerId: sellerIdMatch?.[1] ? decodeURIComponent(parseJsonString(sellerIdMatch[1])) : '',
    itemsSold: soldMatch?.[1] ? cleanText(decodeText(soldMatch[1])) : '',
    followers: followersMatch?.[1] ?? '',
    location,
    shipsFromJapan: japanSignals.length > 0,
    japanSignals,
  };
};

const parseStoreItemFromElement = (element: Element): RawStoreItem | null => {
  const item = parseCardItem(element);
  if (!item) return null;

  const allText = cleanText(element.textContent ?? '');
  const location = extractLocationText(allText);
  const signals = collectJapanShippingSignals(`${item.shipping} ${allText}`, location);

  return {
    ...item,
    location,
    shipsFromJapan: signals.length > 0,
  };
};

const parseStoreItemFromLink = (link: Element): RawStoreItem | null => {
  const href = link.getAttribute('href') ?? '';
  const itemId = extractItemIdFromUrl(href);
  if (!itemId || itemId === '123456') return null;

  const card = link.closest('li, article, [data-testid="item-card"], [class*="s-card"], [class*="item-card"]') ?? link;
  const image = card.querySelector('img')?.getAttribute('src') ?? '';
  const text = cleanText(card.textContent ?? '');
  const location = extractLocationText(text);
  const signals = collectJapanShippingSignals(text, location);

  return {
    title:
      cleanItemTitle(link.textContent ?? '') ||
      cleanItemTitle(link.getAttribute('aria-label') ?? '') ||
      cleanItemTitle(link.getAttribute('title') ?? ''),
    price: firstElementText(card, [
      '.str-item-card__property-displayPrice',
      '[class*="displayPrice"]',
      '[class*="DisplayPrice"]',
      '[class*="Price"]',
      '[class*="price"]',
      '.notranslate',
    ]),
    itemId,
    url: stripEbayTracking(absoluteEbayUrl(href)) || `${EBAY_ORIGIN}/itm/${itemId}`,
    image,
    condition: '',
    shipping: '',
    bids: '',
    location,
    shipsFromJapan: signals.length > 0,
  };
};

export const parseStoreItems = (html: string): RawStoreItem[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items: RawStoreItem[] = [];
  const seen = new Set<string>();

  const cards = doc.querySelectorAll(
    'article[data-testid^="ig-"], li.s-card, li.s-item, [data-testid="item-card"], [class*="s-card"], [class*="item-card"]',
  );
  for (const card of cards) {
    const item = parseStoreItemFromElement(card);
    if (item && !seen.has(item.itemId)) {
      seen.add(item.itemId);
      items.push(item);
    }
  }

  for (const link of doc.querySelectorAll('a[href*="/itm/"]')) {
    const item = parseStoreItemFromLink(link);
    if (item && !seen.has(item.itemId)) {
      seen.add(item.itemId);
      items.push(item);
    }
  }

  const linkRegex = /(?:https?:\\?\/\\?\/www\.ebay\.com)?\\?\/itm\\?\/(?:[^"'<>\\\s]+\\?\/)?(\d{8,})/gi;
  let match: RegExpExecArray | null = linkRegex.exec(html);
  while (match !== null) {
    const itemId = match[1] ?? '';
    if (itemId && itemId !== '123456' && !seen.has(itemId)) {
      seen.add(itemId);
      items.push({
        title: '',
        price: '',
        itemId,
        url: `${EBAY_ORIGIN}/itm/${itemId}`,
        image: '',
        condition: '',
        shipping: '',
        bids: '',
        location: '',
        shipsFromJapan: false,
      });
    }
    match = linkRegex.exec(html);
  }

  return items;
};

export const parseStoreResultCount = (html: string): number => {
  const totalCountMatch = html.match(/"totalCount"\s*:\s*(\d+)/i);
  if (totalCountMatch?.[1]) return Number.parseInt(totalCountMatch[1], 10);

  const resultTextMatch = html.match(/(\d[\d,]*)\+?\s*(?:items?|results?|件)/i);
  if (!resultTextMatch?.[1]) return 0;

  return Number.parseInt(resultTextMatch[1].replace(/,/g, ''), 10);
};

// --- Watch/Unwatch ---
// eBay provides JSON endpoints for watching/unwatching items.
// SRT tokens are page-scoped CSRF tokens. Any SRT from the page works for any
// item on that page. We extract a generic SRT rather than item-specific ones.

export const extractSrt = (html: string): string => {
  const srtMatch = html.match(/srt=([a-f0-9]{80,})/);
  if (!srtMatch) {
    throw ToolError.validation('Could not extract SRT (CSRF) token from the page');
  }
  return srtMatch[1] ?? '';
};

export interface WatchResponse {
  action?: number;
  item?: string;
  status?: boolean;
  statusId?: number;
  result?: number;
  signin?: number;
  listDetails?: Array<{
    listId?: number;
    listName?: string;
    itemAdded?: boolean;
    maxLimitReached?: boolean;
  }>;
}

// --- Watchlist parser ---
// Parses watchlist items from the My eBay watchlist HTML page.

export interface RawWatchlistItem {
  title: string;
  itemId: string;
  price: string;
  url: string;
  image: string;
  timeLeft: string;
}

export const parseWatchlist = (html: string): RawWatchlistItem[] => {
  // Extract unique item IDs from all /itm/ links on the watchlist page.
  // The watchlist HTML is complex — we only reliably extract item IDs, then
  // return them as minimal entries. Use get_item for full details.
  const itemIds = new Set<string>();
  const regex = /\/itm\/(\d{8,})/g;
  let m: RegExpExecArray | null = regex.exec(html);
  while (m !== null) {
    itemIds.add(m[1] ?? '');
    m = regex.exec(html);
  }

  return [...itemIds]
    .filter(id => id.length > 0)
    .map(id => ({
      title: '',
      itemId: id,
      price: '',
      url: `https://www.ebay.com/itm/${id}`,
      image: '',
      timeLeft: '',
    }));
};

// --- Total results count parser ---
export const parseResultCount = (html: string): number => {
  // eBay shows "X,XXX+ results" or "X results for ..."
  const countMatch = html.match(/(\d[\d,]*)\+?\s*results/i);
  if (!countMatch) return 0;
  return Number.parseInt((countMatch[1] ?? '0').replace(/,/g, ''), 10);
};
