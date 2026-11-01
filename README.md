# AI Investment Bubble Simulation

**Live demo:** https://nyn46.github.io/AI-Investment-Bubble-Simulation/

What happens if AI investment dries up? This is an interactive stress test of the AI economy. Pick how much new AI money disappears over 12 months (0–90%), press **Run cascade**, and watch the shock travel from investors to AI labs, clouds, chipmakers, stock markets, jobs and India.

**This is a scenario model, not a forecast.** Every number on the page is tagged by how much to trust it: Reported, Media-reported, Estimate, Assumption or Model output. Each one links to its source (about 140 in total).

## What's inside

| Section | What it shows |
|---|---|
| Domino map | 30 companies and groups, 120 dependency arrows. Click a node to see its profile; hover an arrow to see why two players are linked. |
| Scenario cards | Capex not spent, VC lost, NVIDIA revenue at risk, cloud backlog, private credit, market value, GDP, jobs, India exports |
| Cascade log and charts | Who breaks first, second, third. 25% vs 50% vs 90% compared. How stress unfolds over time. |
| Timeline | 30 days, 6 months, 1 year, 3 years, with evidence kept separate from hypothesis |
| Exposure | Who breaks, who bends, who gains |
| Circular money | Loops where investment comes back as revenue (e.g. NVIDIA ↔ OpenAI) |
| Dot-com comparison | NVIDIA vs Cisco's 2000 peak, plus a 12-point then-vs-now table |
| India | IT services, jobs, FPI flows, the rupee, and the channels that hurt or help |
| Findings | Five surprises, what could prevent a collapse, what to watch |

## Run it

It's static HTML with no build step and no API keys.

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Refresh the market data

`refresh.py` re-pulls prices and market caps (Yahoo Finance via yfinance), plus the US GDP, high-yield spread, VIX and 10-year yield series from FRED. FRED's public CSV endpoint is used, so no key is needed. The script rewrites `market.js` and `live.js`.

```bash
uv run refresh.py
```

Company filings, analyst estimates and news facts live in `data.js` and are edited by hand.

## How the model works

`engine.js` is a DebtRank-style contagion model, the same family of method central banks use for interbank stress tests.

- Each round, a node passes on only its *new* stress, so circular money can't spiral forever.
- Pass-through = source stress × dependency weight × leverage amplifier × (1 − cushion) × 0.92 damping per hop.
- Amplifiers jump 1.35× once a node passes its fragility point (refinancing and fire-sale dynamics).
- Lag classes control how much stress shows at 30 days, 6 months, 1 year and 3 years. Three-year recovery depends on underlying AI demand.
- Three assumption sliders (real demand, policy response, contracts holding) let you test what nobody knows for sure.

The model can't predict *when* or *whether* a downturn happens. It also leaves out regulation, China and other shocks from outside the system.

## Files

- `index.html`: page layout and styles
- `app.js`: rendering, charts and controls (force-graph, ECharts)
- `engine.js`: contagion engine
- `data.js`: nodes, edges, facts and sources
- `market.js`, `live.js`: generated market and macro data
- `refresh.py`: data refresh script
- `REPOS.md`: the open-source data and visualization repos surveyed for this project

Data as of 31 October 2026. Not investment advice.
