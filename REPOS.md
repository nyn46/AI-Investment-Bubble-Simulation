# AI Bubble Simulator — Repo & Data Source Plan
Verified via GitHub API on 2026-10-31 (stars / last push / license). ★ = stars.

## Tier 1 — Data pipeline (where the real numbers come from)

### Company financials (capex, revenue, debt, commitments)
| Repo | ★ | Last push | License | Role |
|---|---|---|---|---|
| dgunning/edgartools | 2.8k | 2026-10-25 | MIT | 10-K/10-Q/8-K XBRL: capex, RPO/backlog, debt, lease commitments for MSFT, GOOGL, AMZN, META, ORCL, NVDA, AMD, CRWV. 13F holdings too. |
| ranaroussi/yfinance | 25.8k | 2026-10-29 | Apache-2.0 | Prices, market caps, history for US + India (.NS tickers) |
| OpenBB (openbq-org/OpenBB) | 74.9k | 2026-10-24 | AGPL-style | Aggregator: equities, macro, news in one API |
| JerBouma/FinanceToolkit | 5.5k | 2026-10-31 | MIT | Ratios (capex/OCF, FCF, leverage) computed transparently |
| JerBouma/FinanceDatabase | 9.6k | 2026-10-31 | MIT | Sector/industry classification for exposure mapping |
| jman4162/capex-atlas | new | 2026-08-10 | Apache-2.0 | Source-linked hyperscaler capex vs depreciation models from SEC filings. Small repo: use its method, check its numbers. |

### Macro (US + global)
| mortada/fredapi | 1.7k | 2026-01-28 | Apache-2.0 | FRED: GDP, private fixed investment in info-processing equipment, credit spreads, unemployment, NASDAQ |
| pydata/pandas-datareader | 3.3k | 2026-07-21 | BSD | FRED / World Bank / Fama-French fallback |
| tgherzog/wbgapi | 178 | 2026-02-27 | MIT | World Bank: India GDP, services exports |
| datasets/s-and-p-500 | 315 | 2026-10-01 | ODC | Shiller S&P 500 + CAPE series (dot-com comparison) |
| datasets/finance-vix | 103 | 2026-09-23 | ODC | VIX history for stress calibration |

### India
| jugaad-py/jugaad-data | 590 | 2026-10-22 | — | NSE live/historic: Nifty IT, TCS, Infosys, HCL, Wipro |
| RuchiTanmay/nselib | 181 | 2026-07-18 | Apache-2.0 | NSE indices, FII/DII flows |
| aeron7/nsepython | 371 | 2026-10-07 | GPL-3.0 | NSE API wrapper (backup) |
| RuchiTanmay/bseindia | 9 | 2026-04-23 | Apache-2.0 | BSE data |

### AI-industry specific
| epoch-research/ai-chip-counts | 5 | 2026-10-29 | MIT | Epoch AI's chip sales/owner estimates (NVIDIA, TPU, AMD) → GPU demand layer |
| epoch-research/ai-compute-users | 1 | 2026-09-09 | — | Compute held by major AI players |
| epoch-research/epochai-python | 14 | 2026-05-19 | MIT | Client for Epoch datasets (plus epoch.ai/data/*.csv direct) |
| epoch-research/training-cost-trends | 28 | 2026-04-01 | — | Training cost trajectory |
| getcomputable/gpu-index | 23 | 2026-09-24 | Apache-2.0 | Open H100/B200 $/GPU-hour index → GPU price collapse signal |
| ek33450505/compute-atlas | 12 | 2026-10-31 | MIT | Source-cited US grid-scale data center buildout |

### News & live signals
| alex9smith/gdelt-doc-api | 232 | 2025-04-22 | MIT | GDELT news volume + tone for "AI bubble", "data center", etc. Free, no key |
| adbar/trafilatura | 7.0k | 2026-10-30 | Apache-2.0 | Clean article text extraction for source quotes |
| AndyTheFactory/newspaper4k | 1.2k | 2026-08-24 | MIT | Article metadata (date, author) |
| kurtmckee/feedparser | 2.5k | 2026-10-06 | BSD | RSS: SEC press, company IR, RBI, Reuters tech |

## Tier 2 — Simulation engine
| networkx/networkx | 17.4k | 2026-10-27 | BSD | Dependency graph, centrality, cycle detection (finds circular deals automatically) |
| marcobardoscia/neva | 39 | 2021-02-05 | LGPL-3.0 | Network valuation / DebtRank contagion (Bardoscia et al., used in central-bank stress tests). Port the math to JS. |
| michignolo/DebtRank | 4 | 2022 | — | Minimal DebtRank reference |
| SDXorg/pysd | 466 | 2026-10-05 | MIT | System dynamics for timeline (30d → 3y stock/flow model) |
| mesa/mesa | 3.9k | 2026-10-29 | Apache-2.0 | Optional agent-based layer (startups/investors as agents) |

## Tier 3 — Dashboard front end
| vitejs/vite | 83.6k | React + TS build |
| shadcn-ui/ui + tailwindlabs/tailwindcss | 127k / 98k | UI components, dark "war-room" theme |
| vasturiano/react-force-graph | 3.3k | Animated domino map, particles flowing along edges (2D/3D) |
| xyflow/xyflow (React Flow) | 38.8k | Alternative: structured layered layout with custom node cards |
| cytoscape/cytoscape.js | 11.3k | Alternative: best for graph algorithms in-browser |
| d3/d3 + d3/d3-sankey | 114k | Money-flow Sankey (who pays whom) |
| apache/echarts (+ echarts-for-react) | 67.6k | Scenario charts, heat maps, gauges |
| tradingview/lightweight-charts | 17.7k | Stock-price panels (NVDA vs CSCO 2000 overlay) |
| motiondivision/motion | 34.7k | Shockwave / cascade animations |
| greensock/GSAP | 30k | Timeline scrubbing (now free incl. plugins) |
| visjs/vis-timeline | 2.6k | 30d / 6m / 1y / 3y event timeline |
| pmndrs/zustand | 58.9k | Shared simulation state (slider → every panel) |

## Tier 4 — Reference / benchmark only (read, don't copy)
| timothy22000/ai-loop | ai-loop.app — sourced circular-deal map (confirmed / reported / LOI / stalled tags). Good taxonomy to match. |
| tedthizzy/ai-bubble | Evidence-gated forensics on AI data-center financing: FERC PPAs, GPU quotes, queue records, SEC debt schedules. Solo + agent project; cross-check claims. |
| pq-cybarg/bubble-map | Toy AI capital loop analysis |
| wilsonfreitas/awesome-quant | 30k — index of further finance libs |
| briatte/awesome-network-analysis | 4.1k — index of network methods |

## Non-GitHub primary sources we will cite directly
- SEC EDGAR filings (10-K/10-Q/8-K) — capex, RPO, leases, debt
- Earnings call transcripts (capex guidance)
- Epoch AI data hub (epoch.ai/data) — models, chips, compute, data centers
- Stanford HAI AI Index 2026 — private AI investment totals
- FRED / BEA — investment contribution to GDP
- Shiller data (shillerdata.com) — CAPE
- NASSCOM, RBI, MeitY — India IT exports, GCCs, IndiaAI Mission
- layoffs.fyi, killedbyai.net — layoffs / product shutdowns
- IEA / LBNL — data center electricity
- PitchBook / Crunchbase public reports — VC share going to AI
