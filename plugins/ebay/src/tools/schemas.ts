import { z } from 'zod';
import type {
  RawItemDetail,
  RawItemStore,
  RawSearchItem,
  RawStoreInfo,
  RawStoreItem,
  RawWatchlistItem,
} from '../ebay-api.js';

// --- Search result ---

export const searchItemSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  title: z.string().describe('Item title'),
  price: z.string().describe('Current price with currency symbol'),
  url: z.string().describe('URL to the item listing on eBay'),
  image: z.string().describe('Thumbnail image URL'),
  condition: z.string().describe('Item condition (New, Used, Refurbished, etc.)'),
  shipping: z.string().describe('Shipping cost or "Free shipping"'),
  bids: z.string().describe('Number of bids (empty for Buy It Now listings)'),
});

export const mapSearchItem = (item: RawSearchItem) => ({
  item_id: item.itemId,
  title: item.title,
  price: item.price,
  url: item.url,
  image: item.image,
  condition: item.condition,
  shipping: item.shipping,
  bids: item.bids,
});

// --- Item detail ---

export const itemDetailSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  title: z.string().describe('Item title'),
  price: z.string().describe('Current price'),
  currency: z.string().describe('Currency code (e.g., USD)'),
  list_price: z.string().describe('Original list price if discounted, empty otherwise'),
  condition: z.string().describe('Item condition (New, Used, Refurbished, etc.)'),
  availability: z.string().describe('Stock status (InStock, OutOfStock, etc.)'),
  images: z.array(z.string()).describe('Product image URLs'),
  seller: z.string().describe('Seller username'),
  seller_url: z.string().describe('Seller profile URL'),
  url: z.string().describe('Item listing URL'),
  brand: z.string().describe('Brand name'),
  description: z.string().describe('Item description (truncated to 500 chars)'),
  seller_description: z.string().describe('Seller-provided item description text, truncated to 6000 chars'),
  seller_description_url: z.string().describe('Seller description iframe URL, empty if unavailable'),
  seller_description_sections: z
    .record(z.string(), z.string())
    .describe('Seller description sections keyed by normalized heading'),
  item_specifics: z.record(z.string(), z.string()).describe('Item specifics label/value pairs from the listing page'),
  shipping_details: z.string().describe('Shipping, returns, import fees, and payment summary text from the item page'),
  customs_duties: z.string().describe('Customs duties / DDP policy text from the seller description when available'),
  payment_methods: z.array(z.string()).describe('Payment method brands visible on the item page or seller description'),
  shipping: z.string().describe('Shipping cost or "Free"'),
  return_policy: z.string().describe('Return policy text'),
  watchers: z.string().describe('Watcher count text when visible on the listing page, empty if unavailable'),
});

export const mapItemDetail = (item: RawItemDetail) => ({
  item_id: item.itemId,
  title: item.title,
  price: item.price,
  currency: item.currency,
  list_price: item.listPrice,
  condition: item.condition,
  availability: item.availability,
  images: item.images,
  seller: item.seller,
  seller_url: item.sellerUrl,
  url: item.url,
  brand: item.brand,
  description: item.description,
  seller_description: item.sellerDescription,
  seller_description_url: item.sellerDescriptionUrl,
  seller_description_sections: item.sellerDescriptionSections,
  item_specifics: item.itemSpecifics,
  shipping_details: item.shippingDetails,
  customs_duties: item.customsDuties,
  payment_methods: item.paymentMethods,
  shipping: item.shipping,
  return_policy: item.returnPolicy,
  watchers: item.watchers,
});

// --- Item store ---

export const itemStoreSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  item_url: z.string().describe('Item listing URL'),
  seller: z.string().describe('Seller username'),
  seller_url: z.string().describe('Seller profile URL'),
  store_name: z.string().describe('Store display name or slug if available'),
  store_url: z.string().describe('Store URL, empty if the item page does not expose one'),
  store_slug: z.string().describe('Store slug from /str/{slug}, empty if unavailable'),
  item_location: z.string().describe('Detected item location or shipping origin text'),
  item_ships_from_japan: z.boolean().describe('Whether the item page indicates Japan as the shipping origin'),
  item: itemDetailSchema.describe('Full item details from the listing page'),
});

export const mapItemStore = (itemStore: RawItemStore) => ({
  item_id: itemStore.itemId,
  item_url: itemStore.itemUrl,
  seller: itemStore.seller,
  seller_url: itemStore.sellerUrl,
  store_name: itemStore.storeName,
  store_url: itemStore.storeUrl,
  store_slug: itemStore.storeSlug,
  item_location: itemStore.itemLocation,
  item_ships_from_japan: itemStore.itemShipsFromJapan,
  item: mapItemDetail(itemStore.item),
});

// --- Store ---

export const storeInfoSchema = z.object({
  name: z.string().describe('Store display name'),
  store_url: z.string().describe('Canonical eBay store URL'),
  store_slug: z.string().describe('Store slug from /str/{slug}'),
  description: z.string().describe('Store description text, truncated to 1000 chars'),
  logo: z.string().describe('Store logo image URL'),
  seller_id: z.string().describe('Seller username if detected'),
  items_sold: z.string().describe('Items sold count text if detected'),
  followers: z.string().describe('Follower count text if detected'),
  location: z.string().describe('Detected store location or shipping origin text'),
  ships_from_japan: z.boolean().describe('Whether the store page indicates Japan as the shipping origin'),
  japan_signals: z.array(z.string()).describe('Matched signals used to identify Japan shipping'),
});

export const mapStoreInfo = (store: RawStoreInfo) => ({
  name: store.name,
  store_url: store.storeUrl,
  store_slug: store.storeSlug,
  description: store.description,
  logo: store.logo,
  seller_id: store.sellerId,
  items_sold: store.itemsSold,
  followers: store.followers,
  location: store.location,
  ships_from_japan: store.shipsFromJapan,
  japan_signals: store.japanSignals,
});

export const storeItemSchema = searchItemSchema.extend({
  location: z.string().describe('Detected item location or shipping origin text'),
  ships_from_japan: z.boolean().describe('Whether this listing card indicates Japan as the shipping origin'),
});

export const mapStoreItem = (item: RawStoreItem) => ({
  ...mapSearchItem(item),
  location: item.location,
  ships_from_japan: item.shipsFromJapan,
});

// --- Watchlist item ---

export const watchlistItemSchema = z.object({
  item_id: z.string().describe('eBay item ID'),
  title: z.string().describe('Item title'),
  price: z.string().describe('Current price'),
  url: z.string().describe('Item listing URL'),
  image: z.string().describe('Thumbnail image URL'),
  time_left: z.string().describe('Time remaining for auction or listing'),
});

export const mapWatchlistItem = (item: RawWatchlistItem) => ({
  item_id: item.itemId,
  title: item.title,
  price: item.price,
  url: item.url,
  image: item.image,
  time_left: item.timeLeft,
});

// --- User profile ---

export const userProfileSchema = z.object({
  user_id: z.string().describe('eBay user ID'),
  first_name: z.string().describe('User first name'),
});
