# X

OpenTabs plugin for X (Twitter) — gives AI agents access to X through your authenticated browser session.

## Install

```bash
opentabs plugin install x
```

Or install globally via npm:

```bash
npm install -g @opentabs-dev/opentabs-plugin-x
```

## Setup

1. Open [x.com](https://x.com) in Chrome and log in
2. Open the OpenTabs side panel — the X plugin should appear as **ready**

## Tools (31)

### Timelines (3)

| Tool | Description | Type |
|---|---|---|
| `get_home_timeline` | Get home timeline tweets | Read |
| `get_latest_timeline` | Get latest tweets from followed accounts | Read |
| `get_user_tweets` | Get tweets by a user | Read |

### Tweets (8)

| Tool | Description | Type |
|---|---|---|
| `get_tweet` | Get tweet details by ID | Read |
| `create_tweet` | Post a new tweet | Write |
| `delete_tweet` | Delete a tweet | Write |
| `download_tweet_media` | Save tweet images or videos | Read |
| `get_tweet_replies` | Get replies to a tweet | Read |
| `list_tweet_media` | List tweet media URLs | Read |
| `pin_tweet` | Pin a tweet to your profile | Write |
| `prepare_tweet_screenshot` | Prepare tweet for screenshot | Read |

### Users (4)

| Tool | Description | Type |
|---|---|---|
| `get_user_profile` | Get user profile by username | Read |
| `get_user_by_id` | Get user profile by numeric ID | Read |
| `get_following` | List accounts a user follows | Read |
| `get_user_likes` | Get tweets liked by a user | Read |

### Engagement (6)

| Tool | Description | Type |
|---|---|---|
| `like_tweet` | Like a tweet | Write |
| `unlike_tweet` | Unlike a tweet | Write |
| `retweet` | Retweet a tweet | Write |
| `unretweet` | Undo a retweet | Write |
| `bookmark_tweet` | Bookmark a tweet | Write |
| `remove_bookmark` | Remove a bookmark | Write |

### Bookmarks (1)

| Tool | Description | Type |
|---|---|---|
| `get_bookmarks` | Get bookmarked tweets | Read |

### Explore (2)

| Tool | Description | Type |
|---|---|---|
| `get_trending` | Get trending topics | Read |
| `search_tweets` | Search tweets by query | Read |

### Lists (7)

| Tool | Description | Type |
|---|---|---|
| `get_list` | Get list details | Read |
| `create_list` | Create a new list | Write |
| `update_list` | Update list details | Write |
| `delete_list` | Delete a list | Write |
| `get_list_tweets` | Get tweets from a list | Read |
| `add_list_member` | Add a user to a list | Write |
| `remove_list_member` | Remove a user from a list | Write |

## How It Works

This plugin runs inside your X tab through the [OpenTabs](https://opentabs.dev) Chrome extension. It uses your existing browser session — no API tokens or OAuth apps required. All operations happen as you, with your permissions.

## License

MIT
