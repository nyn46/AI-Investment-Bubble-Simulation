# /// script
# requires-python = ">=3.10"
# dependencies = ["yfinance>=0.2.40", "pandas>=2.0"]
# ///
"""Refresh the simulator's live data.

Run from this folder:   uv run refresh.py
Writes:
  market.js  prices, market caps (in USD), 52-week stats, weekly sparklines, Cisco/NVIDIA/Nasdaq history
  live.js    FRED series (US GDP, high-yield spread, VIX, 10-year yield) and the refresh date
Company filings, analyst estimates and news facts live in data.js and are edited by hand.
"""
import csv, io, json, sys, urllib.request, warnings
from datetime import date
from pathlib import Path

warnings.filterwarnings("ignore")
import pandas as pd
import yfinance as yf

warnings.simplefilter("ignore")  # yfinance trips pandas deprecation warnings on every call

HERE = Path(__file__).resolve().parent
TICKERS = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "MSFT", "GOOGL", "AMZN", "META", "ORCL", "CRWV", "NBIS",
           "SMCI", "VRT", "GEV", "CEG", "CSCO", "9984.T", "000660.KS", "005930.KS", "TCS.NS", "INFY.NS",
           "HCLTECH.NS", "WIPRO.NS", "TECHM.NS", "RELIANCE.NS", "^CNXIT", "^NSEI", "^GSPC", "^IXIC", "^VIX", "^SOX", "INR=X"]
FX = {"JPY": "JPY=X", "KRW": "KRW=X", "INR": "INR=X"}
FRED = {"gdp": "GDP", "hy": "BAMLH0A0HYM2", "vix": "VIXCLS", "ust10": "DGS10"}


def last_close(t):
    return float(yf.Ticker(t).history(period="5d")["Close"].dropna().iloc[-1])


def snapshot(fx):
    snap, failed = {}, []
    for t in TICKERS:
        try:
            tk = yf.Ticker(t)
            c = tk.history(period="1y", interval="1d")["Close"].dropna()
            ytd = c[c.index >= pd.Timestamp(f"{date.today().year}-01-01", tz=c.index.tz)]
            fi = tk.fast_info
            cur = fi.currency
            mcap = getattr(fi, "market_cap", None)
            snap[t] = {
                "last": round(float(c.iloc[-1]), 2), "date": str(c.index[-1].date()), "currency": cur,
                "mcap_usd_bn": round(float(mcap) / 1e9 / fx.get(cur, 1), 1) if mcap else None,
                "chg_1y_pct": round((c.iloc[-1] / c.iloc[0] - 1) * 100, 1),
                "chg_ytd_pct": round((ytd.iloc[-1] / ytd.iloc[0] - 1) * 100, 1) if len(ytd) else None,
                "high_52w": round(float(c.max()), 2),
                "drawdown_from_high_pct": round((c.iloc[-1] / c.max() - 1) * 100, 1),
                "spark": [round(float(x), 2) for x in c.resample("W").last().dropna().tolist()],
            }
        except Exception as e:  # keep going; one bad ticker should not block a refresh
            failed.append(f"{t}: {e}")
    return snap, failed


def monthly(t, start, end):
    h = yf.Ticker(t).history(start=start, end=end, interval="1mo")["Close"].dropna()
    return [[str(i.date())[:7], round(float(v), 2)] for i, v in h.items()]


def fred(series):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
    with urllib.request.urlopen(url, timeout=30) as r:
        rows = [row for row in csv.reader(io.StringIO(r.read().decode())) if len(row) == 2]
    vals = [(d, float(v)) for d, v in rows[1:] if v not in ("", ".")]
    return {"date": vals[-1][0], "value": vals[-1][1], "series": series}


def main():
    today = date.today().isoformat()
    old = {}
    p = HERE / "market.js"
    if p.exists():
        try:
            old = json.loads(p.read_text().split("=", 1)[1].rstrip(";\n"))["snapshot"]
        except Exception:
            pass

    fx = {"USD": 1.0, **{cur: last_close(t) for cur, t in FX.items()}}
    snap, failed = snapshot(fx)
    hist = {
        "CSCO_1996_2004": monthly("CSCO", "1996-01-01", "2004-12-31"),
        "IXIC_1995_2004": monthly("^IXIC", "1995-01-01", "2004-12-31"),
        "NVDA_2021_now": monthly("NVDA", "2021-01-01", today),
        "IXIC_2021_now": monthly("^IXIC", "2021-01-01", today),
    }
    market = {"fetched": today, "source": "Yahoo Finance via yfinance", "snapshot": snap, "history": hist,
              "fx": {"USDJPY": round(fx["JPY"], 2), "USDKRW": round(fx["KRW"], 2), "USDINR": round(fx["INR"], 2), "date": today}}
    p.write_text("window.MKT=" + json.dumps(market, separators=(",", ":")) + ";")

    live = {"fetched": today}
    for k, s in FRED.items():
        try:
            live[k] = fred(s)
        except Exception as e:
            failed.append(f"FRED {s}: {e}")
    (HERE / "live.js").write_text("window.LIVE=" + json.dumps(live, separators=(",", ":")) + ";")

    print(f"Refreshed {len(snap)}/{len(TICKERS)} tickers and {len(live) - 1}/{len(FRED)} FRED series on {today}\n")
    print(f"{'ticker':12}{'last':>12}{'mcap $bn':>11}{'vs high':>9}{'change since last refresh':>28}")
    for t in ["NVDA", "MSFT", "GOOGL", "AMZN", "META", "ORCL", "CRWV", "AMD", "AVGO", "9984.T", "^GSPC", "^CNXIT"]:
        q = snap.get(t)
        if not q:
            continue
        o = old.get(t, {}).get("last")
        chg = f"{(q['last'] / o - 1) * 100:+.1f}% (was {o})" if o else "new"
        print(f"{t:12}{q['last']:>12}{str(q['mcap_usd_bn'] or '-'):>11}{q['drawdown_from_high_pct']:>8}%{chg:>28}")
    for k in FRED:
        if k in live:
            print(f"FRED {FRED[k]:14} {live[k]['value']} ({live[k]['date']})")
    if failed:
        print("\nCould not refresh:", *failed, sep="\n  ")
    return 1 if len(snap) < len(TICKERS) // 2 else 0


if __name__ == "__main__":
    sys.exit(main())
