# Hex

OpenTabs plugin for Hex — gives AI agents access to Hex through your authenticated browser session.

## Install

```bash
opentabs plugin install hex
```

Or install globally via npm:

```bash
npm install -g @opentabs-dev/opentabs-plugin-hex
```

## Setup

1. Open [hex.tech](https://hex.tech) in Chrome and log in
2. Open the OpenTabs side panel — the Hex plugin should appear as **ready**

## Tools (27)

### Account (3)

| Tool | Description | Type |
|---|---|---|
| `get_current_context` | Read the current Hex route context | Read |
| `get_current_user` | Get the authenticated Hex user | Read |
| `get_product_versions` | Get Hex product version metadata | Read |

### Dashboards (2)

| Tool | Description | Type |
|---|---|---|
| `create_dashboard` | Create a Hex dashboard scaffold with SQL cells | Write |
| `upsert_dashboard_layout` | Place Hex cells into the draft dashboard app layout | Write |

### Projects (8)

| Tool | Description | Type |
|---|---|---|
| `create_project` | Create a Hex project for authoring | Write |
| `list_projects` | List visible Hex projects | Read |
| `search_projects` | Search visible Hex projects | Read |
| `get_project` | Get one Hex project by ID | Read |
| `get_project_cells` | Inspect Hex project cells and source | Read |
| `list_published_apps` | List published Hex apps | Read |
| `list_starred_projects` | List starred Hex projects | Read |
| `navigate_to_project` | Open a Hex project in the current tab | Write |

### Cells (4)

| Tool | Description | Type |
|---|---|---|
| `create_text_cell` | Add a text cell to a Hex project | Write |
| `create_input_cell` | Create a Hex input or filter cell | Write |
| `create_sql_cell` | Add a SQL query cell to a Hex project | Write |
| `update_sql_cell` | Update an existing Hex SQL cell | Write |

### Runs (3)

| Tool | Description | Type |
|---|---|---|
| `run_project` | Trigger a Hex project run | Write |
| `run_cell_and_get_result` | Run one Hex cell and return parsed results | Write |
| `get_cell_result` | Read latest Hex cell execution results | Read |

### Organization (5)

| Tool | Description | Type |
|---|---|---|
| `list_project_labels` | List Hex statuses and categories | Read |
| `list_statuses` | List Hex project statuses | Read |
| `list_categories` | List Hex project categories | Read |
| `list_collections` | List Hex collections | Read |
| `list_data_connections` | List Hex data connections | Read |

### Threads (1)

| Tool | Description | Type |
|---|---|---|
| `list_recent_threads` | List recent Hex Ask threads | Read |

### Explores (1)

| Tool | Description | Type |
|---|---|---|
| `list_explores` | List Hex explores | Read |

## How It Works

This plugin runs inside your Hex tab through the [OpenTabs](https://opentabs.dev) Chrome extension. It uses your existing browser session — no API tokens or OAuth apps required. All operations happen as you, with your permissions.

## License

MIT
