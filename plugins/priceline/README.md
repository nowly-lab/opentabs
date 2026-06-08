# Priceline

OpenTabs plugin for Priceline — gives AI agents access to Priceline through your authenticated browser session.

## Install

```bash
opentabs plugin install priceline
```

Or install globally via npm:

```bash
npm install -g @opentabs-dev/opentabs-plugin-priceline
```

## Setup

1. Open [priceline.com](https://www.priceline.com) in Chrome and log in
2. Open the OpenTabs side panel — the Priceline plugin should appear as **ready**

## Tools (18)

### Search (3)

| Tool | Description | Type |
|---|---|---|
| `search_locations` | Search destinations by keyword | Read |
| `search_points_of_interest` | Find top attractions in a city | Read |
| `navigate_to_search` | Open hotel search results page | Write |

### Hotels (6)

| Tool | Description | Type |
|---|---|---|
| `search_hotels` | Search hotels by city and dates | Read |
| `get_hotel_descriptions` | Get short descriptions for hotels | Read |
| `get_hotel_filters` | Get available hotel search filters | Read |
| `get_merchandising_badges` | Get top-rated/top-booked badges for hotels | Read |
| `get_price_guidance` | Get hotel price trends for a city | Read |
| `navigate_to_hotel` | Open a hotel detail page | Write |

### Flights (5)

| Tool | Description | Type |
|---|---|---|
| `search_airports` | Find airport and city codes by keyword | Read |
| `get_flight_price_calendar` | Flight fare forecast for a date range | Read |
| `find_cheapest_flight_date` | Find the cheapest flight date in a window | Read |
| `list_flight_price_watches` | List user's flight price alerts | Read |
| `navigate_to_flight_search` | Open Priceline flight search for a route | Write |

### Account (4)

| Tool | Description | Type |
|---|---|---|
| `get_customer_profile` | Get your Priceline profile | Read |
| `get_customer_coupons` | Get your available coupons | Read |
| `get_favorite_hotels` | Get your saved hotels in a city | Read |
| `get_abandoned_items` | Get your abandoned cart items | Read |

## How It Works

This plugin runs inside your Priceline tab through the [OpenTabs](https://opentabs.dev) Chrome extension. It uses your existing browser session — no API tokens or OAuth apps required. All operations happen as you, with your permissions.

## License

MIT
