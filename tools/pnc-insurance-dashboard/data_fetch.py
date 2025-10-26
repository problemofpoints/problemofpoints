import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import yfinance as yf

TICKERS = {
    "ACGL": "Arch Capital Group Ltd.",
    "AFG": "American Financial Group, Inc.",
    "AIG": "American International Group, Inc.",
    "ALL": "The Allstate Corporation",
    "AXS": "AXIS Capital Holdings Limited",
    "CB": "Chubb Limited",
    "CINF": "Cincinnati Financial Corporation",
    "CNA": "CNA Financial Corporation",
    "EG": "Everest Group, Ltd.",
    "HIG": "The Hartford Financial Services Group, Inc.",
    "JRVR": "James River Group Holdings, Ltd.",
    "KMPR": "Kemper Corporation",
    "MCY": "Mercury General Corporation",
    "MKL": "Markel Group Inc.",
    "PGR": "The Progressive Corporation",
    "RNR": "RenaissanceRe Holdings Ltd.",
    "SAFT": "Safety Insurance Group, Inc.",
    "SIGI": "Selective Insurance Group, Inc.",
    "SPNT": "SiriusPoint Ltd.",
    "THG": "The Hanover Insurance Group, Inc.",
    "TRV": "The Travelers Companies, Inc.",
    "UFCS": "United Fire Group, Inc.",
    "WRB": "W. R. Berkley Corporation",
}

PERIODS = {
    "1D": 1,
    "1W": 5,
    "1M": 21,
    "3M": 63,
    "6M": 126,
    "YTD": None,
    "12M": 252,
}

DATA_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = DATA_DIR / "data.json"


def calculate_returns(series: pd.Series, idx: int, current: float) -> float:
    if idx is None or idx < 0:
        return None
    prior = series.iloc[idx]
    if pd.isna(prior) or prior == 0:
        return None
    return (current / prior) - 1


def main():
    end = datetime.now(UTC)
    start = (pd.Timestamp(end).tz_convert(None) - pd.DateOffset(years=2)).to_pydatetime()
    price_data = yf.download(
        list(TICKERS.keys()),
        start=start.strftime("%Y-%m-%d"),
        end=(end + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        auto_adjust=True,
        group_by="ticker",
        progress=False,
    )

    result = {
        "generated": end.strftime("%Y-%m-%d"),
        "companies": [],
    }

    for ticker, display_name in TICKERS.items():
        ticker_obj = yf.Ticker(ticker)
        hist = price_data[ticker]
        hist = hist.dropna(subset=["Close"])
        hist = hist.reset_index()
        hist["Date"] = hist["Date"].dt.strftime("%Y-%m-%d")
        last_close = hist["Close"].iloc[-1]

        returns = {}
        close_series = hist["Close"]
        for period, lookback in PERIODS.items():
            if period == "YTD":
                start_of_year = pd.Timestamp(end.year, 1, 1)
                mask = pd.to_datetime(hist["Date"]) >= start_of_year
                if mask.any():
                    first_idx = mask.idxmax()
                    returns[period] = calculate_returns(close_series, first_idx, last_close)
                else:
                    returns[period] = None
            else:
                idx = len(close_series) - 1 - lookback if lookback is not None else None
                returns[period] = calculate_returns(close_series, idx, last_close)

        info = ticker_obj.info or {}
        market_cap = info.get("marketCap")
        beta = info.get("beta")
        pe_ratio = info.get("trailingPE")
        pb_ratio = info.get("priceToBook")
        dividend_yield = info.get("dividendYield")

        company_entry = {
            "ticker": ticker,
            "name": info.get("shortName") or display_name,
            "marketCap": market_cap,
            "beta": beta,
            "pe": pe_ratio,
            "pb": pb_ratio,
            "dividendYield": dividend_yield,
            "currency": info.get("currency"),
            "industry": info.get("industry"),
            "sector": info.get("sector"),
            "price": last_close,
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "returns": returns,
            "volume": int(hist["Volume"].iloc[-1]),
            "avgVolume": info.get("averageVolume") or info.get("averageDailyVolume10Day"),
            "timeSeries": hist[["Date", "Close"]].values.tolist(),
        }
        result["companies"].append(company_entry)

    OUTPUT_FILE.write_text(json.dumps(result, indent=2))
    print(f"Data saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
