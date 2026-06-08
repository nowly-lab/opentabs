# Temporal Cloud

OpenTabs plugin for Temporal Cloud — gives AI agents access to Temporal Cloud through your authenticated browser session.

## Install

```bash
opentabs plugin install temporal-cloud
```

Or install globally via npm:

```bash
npm install -g @opentabs-dev/opentabs-plugin-temporal-cloud
```

## Setup

1. Open [cloud.temporal.io](https://cloud.temporal.io) in Chrome and log in
2. Open the OpenTabs side panel — the Temporal Cloud plugin should appear as **ready**

## Tools (8)

### Workflows (4)

| Tool | Description | Type |
|---|---|---|
| `list_workflows` | List workflow executions with optional filtering | Read |
| `get_workflow` | Get workflow execution details | Read |
| `get_workflow_history` | Get workflow event history for debugging | Read |
| `count_workflows` | Count workflows matching a query | Write |

### Schedules (2)

| Tool | Description | Type |
|---|---|---|
| `list_schedules` | List all schedules in the namespace | Read |
| `get_schedule` | Get schedule details and recent actions | Read |

### Infrastructure (2)

| Tool | Description | Type |
|---|---|---|
| `get_task_queue` | Get task queue pollers and worker info | Read |
| `get_settings` | Get namespace UI settings and capabilities | Read |

## How It Works

This plugin runs inside your Temporal Cloud tab through the [OpenTabs](https://opentabs.dev) Chrome extension. It uses your existing browser session — no API tokens or OAuth apps required. All operations happen as you, with your permissions.

## License

MIT
