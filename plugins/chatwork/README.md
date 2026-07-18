# ChatWork

OpenTabs plugin for reading unread ChatWork messages and sending replies through the same-origin ChatWork web gateway.

## Install

```bash
opentabs plugin install chatwork
```

Or install globally via npm:

```bash
npm install -g opentabs-plugin-chatwork
```

## Setup

Open [www.chatwork.com](https://www.chatwork.com) in Chrome and log in. The plugin appears as ready when the web app exposes its gateway auth globals.

## Tools

| Tool | Description | Type |
|---|---|---|
| `inspect_context` | Inspect gateway readiness and visible unread counts | Read |
| `list_unread_rooms` | List rooms with unread messages | Read |
| `read_messages` | Read room messages | Read |
| `send_message` | Send a message or reply | Write |

## How It Works

This plugin runs inside a ChatWork tab through the [OpenTabs](https://opentabs.dev) Chrome extension and calls `/gateway.php` on the same origin with the web app session.

## License

MIT
