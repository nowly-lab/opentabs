import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphqlQuery } from '../x-api.js';
import type { RawTweetMedia, RawTweetMediaVariant, RawTweetResult } from './schemas.js';

const downloadedMediaSchema = z.object({
  media_number: z.int().describe('1-based position in the tweet media list'),
  media_type: z.enum(['image', 'video', 'animated_gif']).describe('Type of downloaded media'),
  filename: z.string().describe('Downloaded filename'),
  mime_type: z.string().describe('MIME type returned by the media server'),
  size_bytes: z.number().describe('Downloaded byte size'),
  source_url: z.string().describe('Resolved media URL that was downloaded'),
  preview_image_url: z.string().optional().describe('Preview image URL for videos'),
  width: z.number().optional().describe('Original media width when available'),
  height: z.number().optional().describe('Original media height when available'),
  downloaded: z.boolean().describe('Whether the browser download was triggered'),
});

type DownloadedMedia = z.infer<typeof downloadedMediaSchema>;

export interface NormalizedTweetMedia {
  mediaNumber: number;
  mediaType: 'image' | 'video' | 'animated_gif';
  sourceUrl: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
  mimeTypeHint: string;
}

export const resolveTweetId = (params: { tweet_id?: string; tweet_url?: string }): string => {
  if (params.tweet_id?.trim()) return params.tweet_id.trim();

  const source = params.tweet_url?.trim() || globalThis.location?.href || '';
  const match = source.match(/\/status(?:es)?\/(\d+)/) ?? source.match(/(?:^|[^\d])(\d{10,25})(?:[^\d]|$)/);
  const id = match?.[1];
  if (!id) {
    throw ToolError.validation('Provide tweet_id, tweet_url, or open a tweet status page in the active X tab.');
  }
  return id;
};

const unwrapTweetResult = (result: RawTweetResult): RawTweetResult => {
  if (result.__typename === 'TweetWithVisibilityResults') {
    const tweet = (result as unknown as { tweet?: RawTweetResult }).tweet;
    if (tweet) return tweet;
  }
  return result;
};

export const getRawTweet = async (tweetId: string): Promise<RawTweetResult> => {
  const data = await graphqlQuery<{ data?: { tweetResult?: { result?: RawTweetResult } } }>('TweetResultByRestId', {
    tweetId,
    withCommunity: true,
    includePromotedContent: false,
    withVoice: true,
  });

  const result = data.data?.tweetResult?.result;
  if (!result) throw ToolError.notFound(`Tweet ${tweetId} was not found.`);

  const tweet = unwrapTweetResult(result);
  if (!tweet.legacy) throw ToolError.notFound(`Tweet ${tweetId} has no downloadable media metadata.`);
  return tweet;
};

export const getRawMedia = (tweet: RawTweetResult): RawTweetMedia[] =>
  tweet.legacy?.extended_entities?.media ?? tweet.legacy?.entities?.media ?? [];

const selectBestVideoVariant = (variants: RawTweetMediaVariant[] | undefined): RawTweetMediaVariant | null => {
  const mp4Variants = variants?.filter(variant => variant.content_type === 'video/mp4' && variant.url) ?? [];
  if (mp4Variants.length === 0) return null;

  return mp4Variants.reduce((best, variant) => {
    return (variant.bitrate ?? 0) > (best.bitrate ?? 0) ? variant : best;
  }, mp4Variants[0] as RawTweetMediaVariant);
};

const extensionFromImageUrl = (url: URL): string => {
  const format = url.searchParams.get('format');
  if (format) return format;

  const extension = url.pathname.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  return extension?.toLowerCase() || 'jpg';
};

const normalizeImageUrl = (source: string): { url: string; extension: string } => {
  const url = new URL(source);
  const extension = extensionFromImageUrl(url);

  // X often serves preview-sized images; name=orig requests the original asset when available.
  url.searchParams.set('format', extension === 'jpeg' ? 'jpg' : extension);
  url.searchParams.set('name', 'orig');
  return { url: url.toString(), extension };
};

export const normalizeTweetMedia = (rawMedia: RawTweetMedia[]): NormalizedTweetMedia[] => {
  const normalized: NormalizedTweetMedia[] = [];

  rawMedia.forEach((media, index) => {
    const mediaNumber = index + 1;
    const width = media.original_info?.width;
    const height = media.original_info?.height;

    if (media.type === 'photo' && media.media_url_https) {
      const image = normalizeImageUrl(media.media_url_https);
      normalized.push({
        mediaNumber,
        mediaType: 'image',
        sourceUrl: image.url,
        width,
        height,
        mimeTypeHint: `image/${image.extension === 'jpg' ? 'jpeg' : image.extension}`,
      });
      return;
    }

    if ((media.type === 'video' || media.type === 'animated_gif') && media.video_info?.variants) {
      const variant = selectBestVideoVariant(media.video_info.variants);
      if (!variant?.url) return;

      normalized.push({
        mediaNumber,
        mediaType: media.type === 'animated_gif' ? 'animated_gif' : 'video',
        sourceUrl: variant.url,
        previewImageUrl: media.media_url_https ? normalizeImageUrl(media.media_url_https).url : undefined,
        width,
        height,
        mimeTypeHint: 'video/mp4',
      });
    }
  });

  return normalized;
};

const filterMedia = (
  media: NormalizedTweetMedia[],
  params: { media_type?: 'all' | 'image' | 'video'; media_number?: number },
): NormalizedTweetMedia[] => {
  const filtered = media.filter(item => {
    if (params.media_type === 'image') return item.mediaType === 'image';
    if (params.media_type === 'video') return item.mediaType === 'video' || item.mediaType === 'animated_gif';
    return true;
  });

  if (params.media_number === undefined) return filtered;
  return filtered.filter(item => item.mediaNumber === params.media_number);
};

const sanitizeFilenamePart = (value: string): string => {
  const withoutUnsafePathChars = Array.from(value, char => {
    const code = char.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char;
  }).join('');

  return (
    withoutUnsafePathChars.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'x-media'
  );
};

const extensionFromMimeType = (mimeType: string, fallback: string): string => {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'video/mp4') return 'mp4';
  return fallback;
};

const extensionFromSourceUrl = (sourceUrl: string, mimeTypeHint: string): string => {
  const url = new URL(sourceUrl);
  const format = url.searchParams.get('format');
  if (format) return format === 'jpeg' ? 'jpg' : format;

  const extension = url.pathname.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (extension) return extension === 'jpeg' ? 'jpg' : extension;

  return extensionFromMimeType(mimeTypeHint, 'bin');
};

const addExtensionIfMissing = (filename: string, extension: string): string => {
  if (/\.[a-zA-Z0-9]{2,5}$/.test(filename)) return filename;
  return `${filename}.${extension}`;
};

const filenameForMedia = (params: {
  customFilename?: string;
  tweetId: string;
  media: NormalizedTweetMedia;
  selectedPosition: number;
  selectedCount: number;
  mimeType: string;
}): string => {
  const extension = extensionFromMimeType(
    params.mimeType,
    extensionFromSourceUrl(params.media.sourceUrl, params.media.mimeTypeHint),
  );

  if (!params.customFilename) {
    return `x-${params.tweetId}-${String(params.media.mediaNumber).padStart(2, '0')}.${extension}`;
  }

  const sanitized = sanitizeFilenamePart(params.customFilename);
  if (params.selectedCount === 1) return addExtensionIfMissing(sanitized, extension);

  const filenameMatch = sanitized.match(/^(.*?)(\.[a-zA-Z0-9]{2,5})?$/);
  const stem = filenameMatch?.[1] || sanitized;
  const suffix = filenameMatch?.[2] || `.${extension}`;
  return `${stem}-${String(params.selectedPosition + 1).padStart(2, '0')}${suffix}`;
};

const triggerBrowserDownload = (buffer: ArrayBuffer, filename: string, mimeType: string): void => {
  const blob = new Blob([buffer], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Keep large video Blob URLs alive long enough for Chrome's download pipeline to start reading them.
  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

const downloadOneMedia = async (params: {
  tweetId: string;
  media: NormalizedTweetMedia;
  customFilename?: string;
  selectedPosition: number;
  selectedCount: number;
}): Promise<DownloadedMedia> => {
  let response: Response;
  try {
    response = await fetch(params.media.sourceUrl, {
      // X CDN media URLs are self-contained; omitting cookies avoids credentialed CORS failures.
      credentials: 'omit',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw ToolError.timeout(`Timed out downloading media ${params.media.mediaNumber} from tweet ${params.tweetId}.`);
    }
    throw new ToolError(
      `Network error downloading X media: ${err instanceof Error ? err.message : String(err)}`,
      'network_error',
      {
        category: 'internal',
        retryable: true,
      },
    );
  }

  if (!response.ok) {
    throw ToolError.internal(`Media download failed (${response.status}) for tweet ${params.tweetId}.`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || params.media.mimeTypeHint;
  const buffer = await response.arrayBuffer();
  const filename = filenameForMedia({
    customFilename: params.customFilename,
    tweetId: params.tweetId,
    media: params.media,
    selectedPosition: params.selectedPosition,
    selectedCount: params.selectedCount,
    mimeType,
  });

  triggerBrowserDownload(buffer, filename, mimeType);

  return {
    media_number: params.media.mediaNumber,
    media_type: params.media.mediaType,
    filename,
    mime_type: mimeType,
    size_bytes: buffer.byteLength,
    source_url: params.media.sourceUrl,
    preview_image_url: params.media.previewImageUrl,
    width: params.media.width,
    height: params.media.height,
    downloaded: true,
  };
};

export const downloadTweetMedia = defineTool({
  name: 'download_tweet_media',
  displayName: 'Download Tweet Media',
  description:
    'Download image or video media from a specific X tweet into the browser Downloads folder. Provide tweet_id, tweet_url, or open the tweet status page in the active X tab.',
  summary: 'Save tweet images or videos',
  icon: 'download',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().optional().describe('Numeric tweet ID. Overrides tweet_url when provided.'),
    tweet_url: z
      .string()
      .optional()
      .describe('X/Twitter tweet URL, for example https://x.com/user/status/123. Defaults to the active page URL.'),
    media_type: z
      .enum(['all', 'image', 'video'])
      .optional()
      .describe('Which media types to download. Default is all. animated_gif is treated as video.'),
    media_number: z
      .int()
      .min(1)
      .optional()
      .describe('1-based media position in the tweet. Omit to download every matching media item.'),
    filename: z
      .string()
      .optional()
      .describe('Optional filename. When downloading multiple files, -01, -02, ... is appended before the extension.'),
  }),
  output: z.object({
    tweet_id: z.string().describe('Tweet ID used for the download'),
    requested_media_type: z.enum(['all', 'image', 'video']).describe('Media filter applied by the tool'),
    available_media_count: z.number().describe('Number of downloadable media items found on the tweet'),
    downloaded_count: z.number().describe('Number of files saved to Downloads'),
    media: z.array(downloadedMediaSchema).describe('Downloaded media files'),
  }),
  handle: async params => {
    const tweetId = resolveTweetId(params);
    const tweet = await getRawTweet(tweetId);
    const availableMedia = normalizeTweetMedia(getRawMedia(tweet));
    if (availableMedia.length === 0) {
      throw ToolError.notFound(`Tweet ${tweetId} does not contain downloadable image or video media.`);
    }

    const requestedMediaType = params.media_type ?? 'all';
    const selectedMedia = filterMedia(availableMedia, {
      media_type: requestedMediaType,
      media_number: params.media_number,
    });

    if (selectedMedia.length === 0) {
      const availableNumbers = availableMedia.map(item => item.mediaNumber).join(', ');
      throw ToolError.validation(
        `No media matched the request. Available media numbers for tweet ${tweetId}: ${availableNumbers}.`,
      );
    }

    const media: DownloadedMedia[] = [];
    for (const [selectedPosition, item] of selectedMedia.entries()) {
      media.push(
        await downloadOneMedia({
          tweetId,
          media: item,
          customFilename: params.filename,
          selectedPosition,
          selectedCount: selectedMedia.length,
        }),
      );
    }

    return {
      tweet_id: tweetId,
      requested_media_type: requestedMediaType,
      available_media_count: availableMedia.length,
      downloaded_count: media.length,
      media,
    };
  },
});
