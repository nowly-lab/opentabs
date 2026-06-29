import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getRawMedia, getRawTweet, normalizeTweetMedia, resolveTweetId } from './download-tweet-media.js';

const tweetMediaSchema = z.object({
  media_number: z.int().describe('1-based position in the tweet media list'),
  media_type: z.enum(['image', 'video', 'animated_gif']).describe('Tweet media type'),
  source_url: z.string().describe('Resolved media URL'),
  preview_image_url: z.string().optional().describe('Preview image URL for videos'),
  width: z.number().optional().describe('Original media width when available'),
  height: z.number().optional().describe('Original media height when available'),
  mime_type_hint: z.string().describe('Best-effort MIME type inferred from X metadata'),
});

export const listTweetMedia = defineTool({
  name: 'list_tweet_media',
  displayName: 'List Tweet Media',
  description:
    'List image and video media URLs for a specific X tweet without starting a browser download. Provide tweet_id, tweet_url, or open the tweet status page in the active X tab.',
  summary: 'List tweet media URLs',
  icon: 'image',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().optional().describe('Numeric tweet ID. Overrides tweet_url when provided.'),
    tweet_url: z
      .string()
      .optional()
      .describe('X/Twitter tweet URL, for example https://x.com/user/status/123. Defaults to the active page URL.'),
  }),
  output: z.object({
    tweet_id: z.string().describe('Tweet ID used for media lookup'),
    media_count: z.number().describe('Number of downloadable media items found on the tweet'),
    media: z.array(tweetMediaSchema).describe('Media URLs available on the tweet'),
  }),
  handle: async params => {
    const tweetId = resolveTweetId(params);
    const tweet = await getRawTweet(tweetId);
    const media = normalizeTweetMedia(getRawMedia(tweet)).map(item => ({
      media_number: item.mediaNumber,
      media_type: item.mediaType,
      source_url: item.sourceUrl,
      preview_image_url: item.previewImageUrl,
      width: item.width,
      height: item.height,
      mime_type_hint: item.mimeTypeHint,
    }));

    return {
      tweet_id: tweetId,
      media_count: media.length,
      media,
    };
  },
});
