import { ToolError, httpStatusToToolError } from '@opentabs-dev/plugin-sdk';

const MERCARI_ORIGIN = 'https://jp.mercari.com';
const MERCARI_API_ORIGIN = 'https://api.mercari.jp';

export interface RawMercariSearchItem {
  itemId: string;
  title: string;
  url: string;
  image: string;
  priceJpy: number | null;
  status: string;
  itemType: string;
  sellerId: string;
  brandName: string;
  conditionId: string;
  categoryId: string;
  shippingPayerId: string;
  shippingMethodId: string;
  createdUnix: number | null;
  updatedUnix: number | null;
  isAuction: boolean;
  auctionHighestBidJpy: number | null;
  auctionTotalBids: number | null;
  auctionBidDeadline: string;
}

export interface RawMercariSearchResult {
  query: string;
  sourceUrl: string;
  totalResults: number | null;
  nextPageToken: string;
  minPriceJpy: number | null;
  items: RawMercariSearchItem[];
}

export interface RawMercariDetail {
  itemId: string;
  title: string;
  url: string;
  priceJpy: number | null;
  status: string;
  description: string;
  images: string[];
  condition: string;
  categoryPath: string[];
  sellerId: string;
  sellerName: string;
  sellerRatingGood: number | null;
  sellerRatingNormal: number | null;
  sellerRatingBad: number | null;
  sellerRatingTotal: number | null;
  sellerStarRating: number | null;
  sellerVerified: boolean;
  likes: number | null;
  comments: number | null;
  shippingPayer: string;
  shippingMethod: string;
  shippingFromArea: string;
  shippingDuration: string;
  anonymousShipping: boolean;
  createdUnix: number | null;
  updatedUnix: number | null;
  rawSourceUrl: string;
}

const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const jsonBase64Url = (value: unknown): string => base64Url(encoder.encode(JSON.stringify(value)));

const derToJoseSignature = (signature: ArrayBuffer): Uint8Array => {
  const bytes = new Uint8Array(signature);
  let offset = 2;
  if ((bytes[1] ?? 0) & 0x80) offset += (bytes[1] ?? 0) & 0x7f;
  if (bytes[offset++] !== 0x02) throw ToolError.internal('Invalid DPoP signature format');
  const rLength = bytes[offset++] ?? 0;
  const r = bytes.slice(offset, offset + rLength);
  offset += rLength;
  if (bytes[offset++] !== 0x02) throw ToolError.internal('Invalid DPoP signature format');
  const sLength = bytes[offset++] ?? 0;
  const s = bytes.slice(offset, offset + sLength);

  const normalize = (value: Uint8Array): Uint8Array => {
    let normalized = value;
    while (normalized.length > 32 && normalized[0] === 0) normalized = normalized.slice(1);
    const out = new Uint8Array(32);
    out.set(normalized, 32 - normalized.length);
    return out;
  };

  const jose = new Uint8Array(64);
  jose.set(normalize(r), 0);
  jose.set(normalize(s), 32);
  return jose;
};

const createDpopHeader = async (url: string, method: string): Promise<string> => {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const exportedJwk = await crypto.subtle.exportKey('jwk', key.publicKey);
  const jwk = { crv: exportedJwk.crv, kty: exportedJwk.kty, x: exportedJwk.x, y: exportedJwk.y };

  const parsedUrl = new URL(url);
  const header = { typ: 'dpop+jwt', alg: 'ES256', jwk };
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    jti: crypto.randomUUID(),
    htu: `${parsedUrl.origin}${parsedUrl.pathname}`,
    htm: method.toUpperCase(),
    uuid: crypto.randomUUID(),
  };
  const signingInput = `${jsonBase64Url(header)}.${jsonBase64Url(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.privateKey,
    encoder.encode(signingInput),
  );
  const joseSignature = signature.byteLength === 64 ? new Uint8Array(signature) : derToJoseSignature(signature);
  return `${signingInput}.${base64Url(joseSignature)}`;
};

const parseInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[^\d-]/g, '');
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getString = (value: unknown): string => (typeof value === 'string' ? value : '');
const getNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const getRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const mercariFetch = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const method = init.method ?? 'GET';
  const dpop = await createDpopHeader(url, method);
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'ja',
        dpop,
        'x-platform': 'web',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw ToolError.timeout(`Mercari request timed out: ${url}`);
    }
    throw ToolError.internal(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) throw httpStatusToToolError(response, `Failed to fetch ${url}`);
  return response.json() as Promise<T>;
};

export const buildSearchUrl = (query: string): string => {
  const url = new URL('/search', MERCARI_ORIGIN);
  url.searchParams.set('keyword', query);
  return url.toString();
};

export const buildItemUrl = (itemId: string): string => {
  if (/^https?:\/\//i.test(itemId)) return itemId;
  return `${MERCARI_ORIGIN}/item/${encodeURIComponent(itemId)}`;
};

export const extractItemId = (itemIdOrUrl: string): string => {
  const match = itemIdOrUrl.match(/\/item\/(m\d+)/);
  return match?.[1] ?? itemIdOrUrl;
};

export const searchMercariItems = async (
  query: string,
  pageToken: string,
  pageSize: number,
  sort: string,
  status: string[],
): Promise<RawMercariSearchResult> => {
  const url = `${MERCARI_API_ORIGIN}/v2/entities:search`;
  const body = {
    userId: '',
    config: { responseToggles: ['QUERY_SUGGESTION_WEB_1'] },
    pageSize,
    pageToken,
    searchSessionId: crypto.randomUUID().replace(/-/g, ''),
    source: 'BaseSerp',
    indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
    thumbnailTypes: [],
    searchCondition: {
      keyword: query,
      excludeKeyword: '',
      sort,
      order: 'ORDER_DESC',
      status,
      sizeId: [],
      categoryId: [],
      brandId: [],
      sellerId: [],
      priceMin: 0,
      priceMax: 0,
      itemConditionId: [],
      shippingPayerId: [],
      shippingFromArea: [],
      shippingMethod: [],
      colorId: [],
      hasCoupon: false,
      attributes: [],
      itemTypes: [],
      skuIds: [],
      shopIds: [],
      excludeShippingMethodIds: [],
    },
    serviceFrom: 'suruga',
    withItemBrand: true,
    withItemSize: false,
    withItemPromotions: true,
    withItemSizes: true,
    withShopname: false,
    useDynamicAttribute: true,
    withSuggestedItems: true,
    withOfferPricePromotion: true,
    withProductSuggest: true,
    withParentProducts: false,
    withProductArticles: true,
    withSearchConditionId: false,
    withAuction: true,
    laplaceDeviceUuid: crypto.randomUUID(),
  };
  const result = await mercariFetch<Record<string, unknown>>(url, { method: 'POST', body: JSON.stringify(body) });
  const meta = getRecord(result.meta);
  const items = Array.isArray(result.items)
    ? result.items.map(mapSearchItem).filter((item): item is RawMercariSearchItem => item !== null)
    : [];
  const prices = items.map((item) => item.priceJpy).filter((price): price is number => typeof price === 'number');

  return {
    query,
    sourceUrl: buildSearchUrl(query),
    totalResults: parseInteger(meta.numFound),
    nextPageToken: getString(meta.nextPageToken),
    minPriceJpy: prices.length > 0 ? Math.min(...prices) : null,
    items,
  };
};

const mapSearchItem = (raw: unknown): RawMercariSearchItem | null => {
  const item = getRecord(raw);
  const itemId = getString(item.id);
  if (!itemId) return null;
  const auction = getRecord(item.auction);
  const brand = getRecord(item.itemBrand);
  const priceJpy = parseInteger(item.price);

  return {
    itemId,
    title: getString(item.name),
    url: buildItemUrl(itemId),
    image: Array.isArray(item.thumbnails) ? getString(item.thumbnails[0]) : '',
    priceJpy,
    status: getString(item.status),
    itemType: getString(item.itemType),
    sellerId: getString(item.sellerId),
    brandName: getString(brand.name),
    conditionId: getString(item.itemConditionId),
    categoryId: getString(item.categoryId),
    shippingPayerId: getString(item.shippingPayerId),
    shippingMethodId: getString(item.shippingMethodId),
    createdUnix: parseInteger(item.created),
    updatedUnix: parseInteger(item.updated),
    isAuction: Object.keys(auction).length > 0,
    auctionHighestBidJpy: parseInteger(auction.highestBid),
    auctionTotalBids: parseInteger(auction.totalBid),
    auctionBidDeadline: getString(auction.bidDeadline),
  };
};

export const getMercariItem = async (itemIdOrUrl: string): Promise<RawMercariDetail> => {
  const itemId = extractItemId(itemIdOrUrl);
  const url = new URL('/items/get', MERCARI_API_ORIGIN);
  url.searchParams.set('id', itemId);
  url.searchParams.set('include_item_attributes', 'true');
  url.searchParams.set('include_product_page_component', 'true');
  url.searchParams.set('include_non_ui_item_attributes', 'true');
  url.searchParams.set('include_donation', 'true');
  url.searchParams.set('include_item_attributes_sections', 'true');
  url.searchParams.set('include_auction', 'true');

  const result = await mercariFetch<Record<string, unknown>>(url.toString());
  const data = getRecord(result.data);
  const seller = getRecord(data.seller);
  const ratings = getRecord(seller.ratings);
  const category = getRecord(data.item_category_ntiers);
  const condition = getRecord(data.item_condition);
  const shippingPayer = getRecord(data.shipping_payer);
  const shippingMethod = getRecord(data.shipping_method);
  const shippingFromArea = getRecord(data.shipping_from_area);
  const shippingDuration = getRecord(data.shipping_duration);
  const parentCategories = Array.isArray(data.parent_categories_ntiers) ? data.parent_categories_ntiers : [];
  const categoryPath = [
    ...parentCategories.map((node) => getString(getRecord(node).name)).filter(Boolean),
    getString(category.name),
  ].filter(Boolean);

  return {
    itemId,
    title: getString(data.name),
    url: buildItemUrl(itemId),
    priceJpy: getNumber(data.price),
    status: getString(data.status),
    description: getString(data.description),
    images: Array.isArray(data.photos) ? data.photos.map((photo) => String(photo)).filter(Boolean) : [],
    condition: getString(condition.name),
    categoryPath,
    sellerId: String(seller.id ?? ''),
    sellerName: getString(seller.name),
    sellerRatingGood: getNumber(ratings.good),
    sellerRatingNormal: getNumber(ratings.normal),
    sellerRatingBad: getNumber(ratings.bad),
    sellerRatingTotal: getNumber(seller.num_ratings),
    sellerStarRating: getNumber(seller.star_rating_score),
    sellerVerified: getString(seller.register_sms_confirmation) === 'yes',
    likes: getNumber(data.num_likes),
    comments: getNumber(data.num_comments),
    shippingPayer: getString(shippingPayer.name),
    shippingMethod: getString(shippingMethod.name),
    shippingFromArea: getString(shippingFromArea.name),
    shippingDuration: getString(shippingDuration.name),
    anonymousShipping: data.is_anonymous_shipping === true,
    createdUnix: getNumber(data.created),
    updatedUnix: getNumber(data.updated),
    rawSourceUrl: buildItemUrl(itemId),
  };
};
