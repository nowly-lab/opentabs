import { buildQueryString, defineTool, getCurrentUrl } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage } from '../ebay-api.js';

const RESEARCH_ORIGIN = 'https://www.ebay.com';

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const absoluteEbayUrl = (href: string): string => {
  try {
    return new URL(href, RESEARCH_ORIGIN).toString();
  } catch {
    return '';
  }
};

const extractItemIdFromUrl = (url: string): string => {
  const match = url.match(/\/itm\/(?:[^/?#]+\/)?(\d{8,})/);
  return match?.[1] ?? '';
};

const parsePriceParts = (text: string): { price: string; currency: string } => {
  const normalized = cleanText(text);
  const match =
    normalized.match(/\b(US\s*\$|USD|JPY|¥|\$|EUR|€|GBP|£)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ??
    normalized.match(/\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(USD|JPY|EUR|GBP)\b/i);

  if (!match) return { price: '', currency: '' };

  const first = (match[1] ?? '').toUpperCase().replace(/\s+/g, '');
  const second = (match[2] ?? '').toUpperCase();
  const currencyToken = /^[0-9]/.test(first) ? second : first;

  const currencyMap: Record<string, string> = {
    US$: 'USD',
    $: 'USD',
    USD: 'USD',
    JPY: 'JPY',
    '¥': 'JPY',
    EUR: 'EUR',
    '€': 'EUR',
    GBP: 'GBP',
    '£': 'GBP',
  };

  return {
    price: /^[0-9]/.test(first) ? (match[1] ?? '') : (match[2] ?? ''),
    currency: currencyMap[currencyToken] ?? currencyToken,
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const stringFromKeys = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return cleanText(value);
    if (typeof value === 'number') return String(value);
    const nested = asRecord(value);
    if (nested) {
      const nestedValue = stringFromKeys(nested, ['value', 'text', 'displayValue', 'convertedFromValue']);
      if (nestedValue) return nestedValue;
    }
  }
  return '';
};

const urlFromRecord = (record: Record<string, unknown>): string => {
  for (const key of ['itemWebUrl', 'webUrl', 'viewItemUrl', 'url', 'href']) {
    const value = record[key];
    if (typeof value === 'string' && value.includes('/itm/')) return absoluteEbayUrl(value);
  }
  return '';
};

const imageFromRecord = (record: Record<string, unknown>): string => {
  for (const key of ['image', 'thumbnail', 'galleryURL', 'pictureUrl']) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
    const nested = asRecord(value);
    const nestedUrl = nested ? stringFromKeys(nested, ['imageUrl', 'url']) : '';
    if (nestedUrl) return nestedUrl;
    if (Array.isArray(value)) {
      const firstString = value.find(item => typeof item === 'string' && /^https?:\/\//.test(item));
      if (typeof firstString === 'string') return firstString;
      const firstRecord = value.map(asRecord).find(Boolean);
      if (firstRecord) {
        const firstUrl = stringFromKeys(firstRecord, ['imageUrl', 'url']);
        if (firstUrl) return firstUrl;
      }
    }
  }
  return '';
};

const soldDateFromRecord = (record: Record<string, unknown>): string =>
  stringFromKeys(record, [
    'soldDate',
    'dateSold',
    'itemSoldDate',
    'transactionDate',
    'endTime',
    'itemEndDate',
    'lastSoldDate',
  ]);

const priceFromRecord = (record: Record<string, unknown>): { price: string; currency: string } => {
  const priceText = stringFromKeys(record, [
    'soldPrice',
    'price',
    'currentPrice',
    'convertedCurrentPrice',
    'salePrice',
    'totalPrice',
  ]);
  const currency =
    stringFromKeys(record, ['currency', 'currencyId', 'currencyCode']) ||
    stringFromKeys(asRecord(record.price) ?? {}, ['currency', 'currencyId', 'currencyCode']);

  const parsed = parsePriceParts(`${currency} ${priceText}`);
  return {
    price: priceText || parsed.price,
    currency: currency || parsed.currency,
  };
};

const isLikelySoldItem = (record: Record<string, unknown>): boolean => {
  const url = urlFromRecord(record);
  const id = stringFromKeys(record, ['itemId', 'legacyItemId', 'id']) || extractItemIdFromUrl(url);
  const title = stringFromKeys(record, ['title', 'itemTitle', 'name']);
  const soldDate = soldDateFromRecord(record);
  const price = priceFromRecord(record).price;
  const text = JSON.stringify(record).slice(0, 4000);

  return Boolean(
    (id || url) &&
      title &&
      price &&
      (soldDate || /sold|SOLD|ended|endTime|transactionDate|dateSold|itemSoldDate/.test(text)),
  );
};

interface SoldResearchItem {
  item_id: string;
  title: string;
  url: string;
  price: string;
  currency: string;
  sold_date: string;
  shipping: string;
  condition: string;
  seller: string;
  bids: string;
  format: string;
  image: string;
  raw_text: string;
}

const mapRecordToSoldItem = (record: Record<string, unknown>): SoldResearchItem => {
  const url = urlFromRecord(record);
  const { price, currency } = priceFromRecord(record);
  const rawText = cleanText(
    [
      stringFromKeys(record, ['title', 'itemTitle', 'name']),
      price,
      soldDateFromRecord(record),
      stringFromKeys(record, ['shipping', 'shippingCost', 'shippingPrice']),
      stringFromKeys(record, ['condition', 'conditionDisplayName']),
      stringFromKeys(record, ['seller', 'sellerUsername', 'sellerUserName', 'sellerName']),
    ].join(' '),
  );

  return {
    item_id: stringFromKeys(record, ['itemId', 'legacyItemId', 'id']) || extractItemIdFromUrl(url),
    title: stringFromKeys(record, ['title', 'itemTitle', 'name']),
    url,
    price,
    currency,
    sold_date: soldDateFromRecord(record),
    shipping: stringFromKeys(record, ['shipping', 'shippingCost', 'shippingPrice']),
    condition: stringFromKeys(record, ['condition', 'conditionDisplayName']),
    seller: stringFromKeys(record, ['seller', 'sellerUsername', 'sellerUserName', 'sellerName']),
    bids: stringFromKeys(record, ['bids', 'bidCount', 'bidsCount']),
    format: stringFromKeys(record, ['format', 'listingType', 'buyingOption']),
    image: imageFromRecord(record),
    raw_text: rawText,
  };
};

const walkJson = (value: unknown, items: SoldResearchItem[], seen: Set<string>, depth = 0): void => {
  if (depth > 18 || items.length >= 300) return;

  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, items, seen, depth + 1);
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  if (isLikelySoldItem(record)) {
    const item = mapRecordToSoldItem(record);
    const key = item.item_id || `${item.title}|${item.price}|${item.sold_date}`;
    if (key && !seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }

  for (const child of Object.values(record)) walkJson(child, items, seen, depth + 1);
};

const parseEmbeddedJsonItems = (html: string): SoldResearchItem[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items: SoldResearchItem[] = [];
  const seen = new Set<string>();

  for (const script of [...doc.querySelectorAll('script')]) {
    const text = script.textContent?.trim();
    if (!text || !text.includes('/itm/') || !/[{[]/.test(text)) continue;

    const candidates = [text];
    const assignmentMatch = text.match(
      /(?:__NEXT_DATA__|__APOLLO_STATE__|__PRELOADED_STATE__|pageData)\s*=\s*({[\s\S]*?});?\s*$/,
    );
    if (assignmentMatch?.[1]) candidates.unshift(assignmentMatch[1]);

    for (const candidate of candidates) {
      try {
        walkJson(JSON.parse(candidate), items, seen);
      } catch {
        // Seller Hub changes serialized state frequently; DOM fallback below keeps the tool useful.
      }
    }
  }

  return items;
};

const parseDomItems = (html: string): SoldResearchItem[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items: SoldResearchItem[] = [];
  const seen = new Set<string>();

  for (const anchor of [...doc.querySelectorAll<HTMLAnchorElement>('a[href*="/itm/"]')]) {
    const url = absoluteEbayUrl(anchor.getAttribute('href') ?? '');
    const itemId = extractItemIdFromUrl(url);
    if (!itemId || seen.has(itemId)) continue;

    const container =
      anchor.closest('tr') ??
      anchor.closest('li') ??
      anchor.closest('[class*="item" i]') ??
      anchor.closest('[class*="card" i]') ??
      anchor.parentElement;
    const text = cleanText(container?.textContent ?? anchor.textContent ?? '');
    const { price, currency } = parsePriceParts(text);

    seen.add(itemId);
    items.push({
      item_id: itemId,
      title: cleanText(anchor.textContent ?? '').replace(/^Opens in a new window or tab\s*/i, ''),
      url,
      price,
      currency,
      sold_date: cleanText(
        text.match(/\b(?:Sold|Ended)\s+(?:on\s+)?([^|•]{4,40})/i)?.[1] ??
          text.match(/\b([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/)?.[1] ??
          '',
      ),
      shipping: cleanText(text.match(/\b(?:Free shipping|[A-Z]{3}\s*[0-9,.]+\s+shipping)\b/i)?.[0] ?? ''),
      condition: cleanText(text.match(/\b(?:New|Used|Pre-owned|Brand New|Open box)\b/i)?.[0] ?? ''),
      seller: '',
      bids: cleanText(text.match(/\b\d+\s+bids?\b/i)?.[0] ?? ''),
      format: '',
      image: container?.querySelector('img')?.getAttribute('src') ?? '',
      raw_text: text.slice(0, 1000),
    });
  }

  return items;
};

const parseTotalResults = (html: string): number => {
  const text = cleanText(new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '');
  const match =
    text.match(/\b([0-9][0-9,]*)\s+(?:sold|results|items)\b/i) ??
    text.match(/\b(?:sold|results|items)\s*[:：]?\s*([0-9][0-9,]*)\b/i);
  return match?.[1] ? Number.parseInt(match[1].replace(/,/g, ''), 10) : 0;
};

const buildResearchUrl = (params: {
  keywords: string;
  marketplace: string;
  dayRange: number;
  endDate: number;
  startDate?: number;
  categoryId?: string;
  sellerCountry?: 'JP' | 'US' | 'WORLDWIDE' | '';
  offset?: number;
  limit?: number;
  timezone?: string;
}): string => {
  const endDate = params.endDate;
  const startDate = params.startDate ?? endDate - params.dayRange * 24 * 60 * 60 * 1000;
  const query = buildQueryString({
    marketplace: params.marketplace,
    keywords: params.keywords,
    dayRange: params.dayRange,
    endDate,
    startDate,
    categoryId: params.categoryId ?? '0',
    sellerCountry:
      params.sellerCountry && params.sellerCountry !== 'WORLDWIDE'
        ? `SellerLocation:::${params.sellerCountry}`
        : undefined,
    offset: params.offset ?? 0,
    limit: params.limit ?? 50,
    tabName: 'SOLD',
    tz: params.timezone ?? 'Asia/Tokyo',
  });

  return `${RESEARCH_ORIGIN}/sh/research?${query}`;
};

const soldResearchItemSchema = z.object({
  item_id: z.string().describe('eBay item ID when detected'),
  title: z.string().describe('Sold item title'),
  url: z.string().describe('eBay item URL'),
  price: z.string().describe('Sold price text or numeric value when detected'),
  currency: z.string().describe('Currency code when detected'),
  sold_date: z.string().describe('Sold/end date when detected'),
  shipping: z.string().describe('Shipping cost text when detected'),
  condition: z.string().describe('Condition text when detected'),
  seller: z.string().describe('Seller username when detected'),
  bids: z.string().describe('Bid count when detected'),
  format: z.string().describe('Listing format when detected'),
  image: z.string().describe('Image URL when detected'),
  raw_text: z.string().describe('Nearby raw text used as fallback evidence'),
});

const researchInputSchema = z.object({
  keywords: z.string().min(1).describe('Seller Hub Research keywords, e.g. "Dragon Quest 40th"'),
  day_range: z.number().int().min(1).max(365).optional().describe('Sold history range in days. Default 90.'),
  end_date: z.number().int().optional().describe('End timestamp in milliseconds since epoch. Default: current time.'),
  start_date: z
    .number()
    .int()
    .optional()
    .describe('Start timestamp in milliseconds since epoch. Default: end_date - day_range.'),
  category_id: z.string().optional().describe('eBay category ID. Default 0.'),
  seller_country: z.enum(['JP', 'US', 'WORLDWIDE', '']).optional().describe('Seller location filter. Default JP.'),
  offset: z.number().int().min(0).optional().describe('Result offset. Default 0.'),
  limit: z.number().int().min(1).max(200).optional().describe('Result limit. Default 50.'),
  marketplace: z.string().optional().describe('Marketplace ID. Default EBAY-US.'),
  timezone: z.string().optional().describe('Timezone parameter. Default Asia/Tokyo.'),
});

const researchOutputSchema = z.object({
  source_url: z.string().describe('Seller Hub Research URL that was read'),
  total_results: z.number().describe('Approximate total results detected from the page text, 0 if unknown'),
  item_count: z.number().describe('Number of parsed sold-result candidates returned'),
  items: z.array(soldResearchItemSchema).describe('Parsed sold-result candidates'),
  warnings: z.array(z.string()).describe('Extraction warnings'),
});

const parseResearchHtml = (html: string, limit: number, sourceUrl: string) => {
  const jsonItems = parseEmbeddedJsonItems(html);
  const domItems = jsonItems.length > 0 ? [] : parseDomItems(html);
  const items = (jsonItems.length > 0 ? jsonItems : domItems).slice(0, limit);
  const warnings: string[] = [];

  if (items.length === 0) {
    warnings.push(
      'No sold result items could be parsed. Open the returned source_url in the browser to confirm Seller Hub Research is logged in and loaded.',
    );
  }
  if (jsonItems.length === 0) {
    warnings.push('Embedded Seller Hub result data was not found; DOM fallback was used.');
  }

  return {
    source_url: sourceUrl,
    total_results: parseTotalResults(html),
    item_count: items.length,
    items,
    warnings,
  };
};

export const searchSoldResearch = defineTool({
  name: 'search_sold_research',
  displayName: 'Search Sold Research',
  description:
    'Read eBay Seller Hub Research / Terapeak sold-results page through the authenticated browser session. Returns sold-result candidates from embedded page data or visible item links.',
  summary: 'Search Seller Hub sold research',
  icon: 'bar-chart',
  group: 'Research',
  input: researchInputSchema,
  output: researchOutputSchema,
  handle: async params => {
    const sourceUrl = buildResearchUrl({
      keywords: params.keywords,
      marketplace: params.marketplace ?? 'EBAY-US',
      dayRange: params.day_range ?? 90,
      endDate: params.end_date ?? Date.now(),
      startDate: params.start_date,
      categoryId: params.category_id,
      sellerCountry: params.seller_country ?? 'JP',
      offset: params.offset,
      limit: params.limit,
      timezone: params.timezone,
    });

    const html = await fetchPage(sourceUrl);
    return parseResearchHtml(html, params.limit ?? 50, sourceUrl);
  },
});

export const openSoldResearch = defineTool({
  name: 'open_sold_research',
  displayName: 'Open Sold Research',
  description:
    'Open the eBay Seller Hub Research / Terapeak sold-results page in the browser. After the page loads, call read_current_sold_research to extract visible results.',
  summary: 'Open Seller Hub sold research page',
  icon: 'external-link',
  group: 'Research',
  input: researchInputSchema,
  output: z.object({
    opened: z.boolean().describe('Whether navigation was initiated'),
    url: z.string().describe('Seller Hub Research URL opened in the browser'),
  }),
  handle: async params => {
    const url = buildResearchUrl({
      keywords: params.keywords,
      marketplace: params.marketplace ?? 'EBAY-US',
      dayRange: params.day_range ?? 90,
      endDate: params.end_date ?? Date.now(),
      startDate: params.start_date,
      categoryId: params.category_id,
      sellerCountry: params.seller_country ?? 'JP',
      offset: params.offset,
      limit: params.limit,
      timezone: params.timezone,
    });

    window.location.href = url;
    return {
      opened: true,
      url,
    };
  },
});

export const readCurrentSoldResearch = defineTool({
  name: 'read_current_sold_research',
  displayName: 'Read Current Sold Research',
  description:
    'Extract sold-result candidates from the currently open eBay Seller Hub Research page after it has loaded in the browser.',
  summary: 'Read current Seller Hub sold research page',
  icon: 'scan-search',
  group: 'Research',
  input: z.object({
    limit: z.number().int().min(1).max(200).optional().describe('Maximum results to return. Default 50.'),
  }),
  output: researchOutputSchema,
  handle: async params => {
    const sourceUrl = getCurrentUrl();
    const html = document.documentElement.outerHTML;
    const result = parseResearchHtml(html, params.limit ?? 50, sourceUrl);

    if (!sourceUrl.includes('/sh/research')) {
      result.warnings.unshift('Current page is not an eBay Seller Hub Research page.');
    }

    return result;
  },
});
