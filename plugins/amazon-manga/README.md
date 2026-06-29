# Amazon Manga

Save the currently visible Amazon manga reader page as a PNG download through your authenticated browser session.

## Install

```bash
opentabs plugin install amazon-manga
```

Or install globally via npm:

```bash
npm install -g @opentabs-dev/opentabs-plugin-amazon-manga
```

## Setup

1. Open [read.amazon.co.jp](https://read.amazon.co.jp) in Chrome and log in
2. Open a manga reader page, for example `https://read.amazon.co.jp/manga/...`
3. Open the OpenTabs side panel — the Amazon Manga plugin should appear as **ready**

## Tools (3)

### Reader (3)

| Tool | Description | Type |
|---|---|---|
| `inspect_reader` | Inspect visible manga canvas/image surfaces | Read |
| `save_visible_pages` | Save the currently visible page or spread as a PNG download | Write |
| `turn_page` | Click the left half of the visible manga page to turn one page | Write |

## How It Works

This plugin runs inside your Amazon Manga tab through the [OpenTabs](https://opentabs.dev) Chrome extension. It uses your existing browser session — no API tokens or OAuth apps required. All operations happen as you, with your permissions.

## License

MIT
