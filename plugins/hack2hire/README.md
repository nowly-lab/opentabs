# Hack2Hire

OpenTabs plugin for Hack2Hire — gives AI agents access to Hack2Hire through your authenticated browser session.

## Install

```bash
opentabs plugin install hack2hire
```

Or install globally via npm:

```bash
npm install -g @opentabs-dev/opentabs-plugin-hack2hire
```

## Setup

1. Open [hack2hire.com](https://www.hack2hire.com) in Chrome and log in
2. Open the OpenTabs side panel — the Hack2Hire plugin should appear as **ready**

## Tools (14)

### Companies (2)

| Tool | Description | Type |
|---|---|---|
| `list_companies` | List all tracked companies | Read |
| `get_company_question_stats` | Question count breakdown for a company | Read |

### Questions (4)

| Tool | Description | Type |
|---|---|---|
| `list_questions` | Search and filter interview questions | Read |
| `get_question` | Get full detail of one question | Read |
| `get_question_neighbors` | Get prev/next questions in a list | Read |
| `list_question_coding_problems` | List coding problems for a post | Read |

### Comments (3)

| Tool | Description | Type |
|---|---|---|
| `list_question_comments` | List comments on a question | Read |
| `list_comment_replies` | List replies to a comment | Read |
| `get_comment` | Get the full content of a comment | Read |

### Account (5)

| Tool | Description | Type |
|---|---|---|
| `get_current_user` | Get the authenticated user profile | Read |
| `get_subscription` | Get the current subscription details | Read |
| `list_my_bookmarks` | List my bookmarked questions | Read |
| `list_my_visits` | List my recently visited questions | Read |
| `get_completed_question_count` | Count completed questions in a scope | Read |

## How It Works

This plugin runs inside your Hack2Hire tab through the [OpenTabs](https://opentabs.dev) Chrome extension. It uses your existing browser session — no API tokens or OAuth apps required. All operations happen as you, with your permissions.

## License

MIT
