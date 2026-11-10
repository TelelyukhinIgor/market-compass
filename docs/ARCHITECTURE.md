# Architecture

## Source map

| File | Responsibility |
|---|---|
| app/desk.tsx | Instrument overview, OHLC charts, settings, result archive, and viewer Telegram UI |
| lib/market.ts | Candle checks, ATR, pivots, ranking, persistent-level composition, and visible annotations |
| lib/time-grid.ts | Time labels and London/New York session markers |
| lib/server.ts | D1 access, credential encryption, provider requests, report progress, and Telegram delivery |
| lib/telegram-chart.tsx | Server-rendered PNG chart layout |
| lib/desk-access.ts | Owner authorization from a configured identity and trusted headers |
| app/api/desk/route.ts | Dashboard read operations and owner-only mutations |
| app/mcp/route.ts | Agent-facing research and reporting operations |
| drizzle/ | Database schema and migration |

## Analytical behavior

The retained engine is levels-2026-11-02-v10. It prioritizes W1, D1, H4, H1 and M15. The visible annotation budget is six. Up to four slots are reserved for confirmed levels and two for tentative extremes when those candidates exist; remaining slots may use available candidates. The algorithm does not invent candidates to guarantee a minimum count.

Strong levels remain in storage even when outside the visible scale. Tentative extremes use distinct visual markings. Their presence does not turn them into confirmed support or resistance.

Grouping and retracement thresholds are implementation heuristics. Their predictive usefulness has not been independently established.

## Reporting

An intraday report uses H1 charts and refreshes contributing H1/H4/D1/W1 context. A position report uses D1 charts and refreshes D1/W1. Progress and request IDs persist between bounded calls so delivery can resume without intentionally duplicating an already completed report.

This repository is a public showcase copy with portable configuration and synthetic demo data. It is not a hosted service. Credentials, live databases, recipient lists, and schedules are not included, and publishing the source does not create a running deployment.
