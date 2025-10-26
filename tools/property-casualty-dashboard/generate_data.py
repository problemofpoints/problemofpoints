import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import yfinance as yf

OUTPUT_DIR = Path(__file__).parent

# Curated universe of US-listed Property & Casualty (Re)Insurers
TICKERS: Dict[str, str] = {
    "AIG": "American International Group",
    "ALL": "The Allstate Corporation",
    "ACGL": "Arch Capital Group",
    "AXS": "AXIS Capital Holdings",
    "BRK-B": "Berkshire Hathaway Class B",
    "CB": "Chubb Limited",
    "CINF": "Cincinnati Financial Corporation",
    "EG": "Everest Group",
    "EIG": "Employers Holdings",
    "HCI": "HCI Group",
    "HIG": "The Hartford Financial Services Group",
    "JRVR": "James River Group Holdings",
    "KMPR": "Kemper Corporation",
    "KNSL": "Kinsale Capital Group",
    "MCY": "Mercury General Corporation",
    "MKL": "Markel Group",
    "ORI": "Old Republic International Corporation",
    "PGR": "The Progressive Corporation",
    "PLMR": "Palomar Holdings",
    "RLI": "RLI Corp.",
    "RNR": "RenaissanceRe Holdings",
    "SAFT": "Safety Insurance Group",
    "SIGI": "Selective Insurance Group",
    "THG": "The Hanover Insurance Group",
    "TRV": "The Travelers Companies",
    "UFCS": "United Fire Group",
    "UVE": "Universal Insurance Holdings",
    "WRB": "W. R. Berkley Corporation",
    "WTM": "White Mountains Insurance Group",
}

END_DATE = datetime.now(timezone.utc)
START_DATE = END_DATE - timedelta(days=2 * 365 + 10)

RETURNS_WINDOWS = {
    "1d": 1,
    "1w": 5,
    "1m": 21,
    "3m": 63,
    "6m": 126,
    "ytd": None,
    "12m": 252,
    "24m": 504,
}


def compute_period_return(series: pd.Series, periods: int) -> Optional[float]:
    series = series.dropna()
    if len(series) <= periods:
        return None
    return float(series.iloc[-1] / series.iloc[-(periods + 1)] - 1)


def compute_ytd_return(series: pd.Series) -> Optional[float]:
    series = series.dropna()
    if series.empty:
        return None
    current_year = series.index[-1].year
    start_idx = series[series.index.year == current_year]
    if start_idx.empty:
        return None
    first_value = float(start_idx.iloc[0])
    if first_value == 0:
        return None
    return float(series.iloc[-1] / first_value - 1)


def max_drawdown(series: pd.Series) -> Optional[float]:
    series = series.dropna()
    if series.empty:
        return None
    cumulative_max = series.cummax()
    drawdowns = series / cumulative_max - 1
    return float(drawdowns.min())


def annualized_volatility(series: pd.Series) -> Optional[float]:
    returns = series.dropna().pct_change().dropna()
    if returns.empty:
        return None
    return float(returns.std() * np.sqrt(252))


def fi_get(fast_info: dict, *keys: str) -> Optional[float]:
    for key in keys:
        if key in fast_info and fast_info[key] is not None:
            return fast_info[key]
    return None


def normalize_dividend_yield(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if value > 1:
        return value / 100
    return value


def main() -> None:
    print("Fetching historical prices...")
    price_history = yf.download(
        list(TICKERS.keys()),
        start=START_DATE.strftime("%Y-%m-%d"),
        end=(END_DATE + timedelta(days=2)).strftime("%Y-%m-%d"),
        progress=False,
        auto_adjust=False,
    )

    adj_close = price_history["Adj Close"].ffill()
    volume = price_history["Volume"].ffill()
    last_trade_date = adj_close.dropna(how="all").index[-1]

    summary_rows: List[Dict[str, Optional[float]]] = []
    price_records: Dict[str, List[Dict[str, float]]] = {}

    for ticker in TICKERS:
        series = adj_close[ticker].dropna()
        vol_series = volume[ticker].reindex(adj_close.index).fillna(0)
        if series.empty:
            continue

        ticker_obj = yf.Ticker(ticker)
        fast_info = ticker_obj.fast_info
        info = ticker_obj.info or {}

        last_price = float(series.iloc[-1])
        previous_close = float(series.iloc[-2]) if len(series) > 1 else None

        returns: Dict[str, Optional[float]] = {}
        for label, window in RETURNS_WINDOWS.items():
            if label == "ytd":
                returns[label] = compute_ytd_return(series)
            else:
                returns[label] = None if window is None else compute_period_return(series, window)

        volatility = annualized_volatility(series)
        drawdown = max_drawdown(series)
        avg_vol_30d = float(vol_series.tail(30).mean()) if not vol_series.empty else None

        dividend_yield = normalize_dividend_yield(
            info.get("dividendYield") or info.get("trailingAnnualDividendYield")
        )

        market_cap = (
            fi_get(fast_info, "marketCap", "market_cap")
            or info.get("marketCap")
        )

        year_high = fi_get(fast_info, "yearHigh", "fiftyTwoWeekHigh")
        year_low = fi_get(fast_info, "yearLow", "fiftyTwoWeekLow")

        summary_rows.append(
            {
                "ticker": ticker,
                "name": info.get("longName") or TICKERS[ticker],
                "industry": info.get("industry"),
                "last_price": last_price,
                "previous_close": previous_close,
                "market_cap": market_cap,
                "pe_ratio": fi_get(fast_info, "peRatio", "pe_ratio") or info.get("trailingPE"),
                "pb_ratio": fi_get(fast_info, "pbRatio", "pb_ratio") or info.get("priceToBook"),
                "beta": info.get("beta") or info.get("beta3Year"),
                "dividend_yield": dividend_yield,
                "avg_volume_3m": fi_get(fast_info, "threeMonthAverageVolume")
                or info.get("averageDailyVolume3Month"),
                "avg_volume_30d": avg_vol_30d,
                "ten_day_avg_volume": fi_get(fast_info, "tenDayAverageVolume"),
                "shares_outstanding": fi_get(fast_info, "shares", "sharesOutstanding")
                or info.get("sharesOutstanding"),
                "year_high": year_high,
                "year_low": year_low,
                "year_high_pct": None
                if not year_high
                else float(last_price / year_high - 1),
                "year_low_pct": None
                if not year_low
                else float(last_price / year_low - 1),
                "volatility": volatility,
                "max_drawdown": drawdown,
                "returns": returns,
            }
        )

        price_records[ticker] = [
            {"date": idx.strftime("%Y-%m-%d"), "adj_close": float(value)}
            for idx, value in series.tail(504).items()
        ]

    summary = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "last_trade_date": last_trade_date.strftime("%Y-%m-%d"),
        "tickers": list(price_records.keys()),
        "companies": summary_rows,
    }

    (OUTPUT_DIR / "metrics.json").write_text(
        json.dumps(summary, indent=2, sort_keys=False)
    )
    (OUTPUT_DIR / "prices.json").write_text(
        json.dumps(price_records, indent=2, sort_keys=False)
    )
    print("Data refresh complete.")


if __name__ == "__main__":
    main()
