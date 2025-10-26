const YahooFinance = require("yahoo-finance2").default;

let yahooFinance;

const TICKERS = {
  AIG: "American International Group",
  ALL: "The Allstate Corporation",
  ACGL: "Arch Capital Group",
  AXS: "AXIS Capital Holdings",
  CB: "Chubb Limited",
  CINF: "Cincinnati Financial Corporation",
  EG: "Everest Group",
  EIG: "Employers Holdings",
  HCI: "HCI Group",
  HIG: "The Hartford Financial Services Group",
  JRVR: "James River Group Holdings",
  KMPR: "Kemper Corporation",
  KNSL: "Kinsale Capital Group",
  MCY: "Mercury General Corporation",
  MKL: "Markel Group",
  ORI: "Old Republic International Corporation",
  PGR: "The Progressive Corporation",
  PLMR: "Palomar Holdings",
  RLI: "RLI Corp.",
  RNR: "RenaissanceRe Holdings",
  SAFT: "Safety Insurance Group",
  SIGI: "Selective Insurance Group",
  THG: "The Hanover Insurance Group",
  TRV: "The Travelers Companies",
  UFCS: "United Fire Group",
  UVE: "Universal Insurance Holdings",
  WRB: "W. R. Berkley Corporation",
  WTM: "White Mountains Insurance Group"
};

const BENCHMARK_SYMBOLS = ["BRK-B"];

const RETURN_WINDOWS = {
  "1d": 1,
  "1w": 5,
  "1m": 21,
  "3m": 63,
  "6m": 126,
  ytd: null,
  "12m": 252,
  "24m": 504
};

const TRADING_DAYS_PER_YEAR = 252;
const HISTORY_LOOKBACK_DAYS = 365 * 2 + 30;

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function computePeriodReturn(series, periods) {
  if (!Array.isArray(series) || series.length <= periods || periods == null) {
    return null;
  }
  const latest = series[series.length - 1];
  const prior = series[series.length - (periods + 1)];
  if (latest == null || prior == null || prior === 0) return null;
  return latest / prior - 1;
}

function computeYtdReturn(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const last = history[history.length - 1];
  const currentYear = new Date(last.date).getFullYear();
  const idx = history.findIndex((point) => new Date(point.date).getFullYear() === currentYear);
  if (idx === -1) return null;
  const first = history[idx];
  if (!first || first.adjClose == null || first.adjClose === 0) return null;
  return last.adjClose / first.adjClose - 1;
}

function computeMaxDrawdown(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let peak = values[0];
  let maxDD = 0;
  for (const value of values) {
    if (value == null) continue;
    peak = Math.max(peak, value);
    const drawdown = value / peak - 1;
    if (drawdown < maxDD) {
      maxDD = drawdown;
    }
  }
  return maxDD;
}

function computeAnnualizedVolatility(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const returns = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const current = values[i];
    if (prev == null || current == null || prev === 0) continue;
    returns.push(current / prev - 1);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance =
    returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

async function fetchTickerData(ticker) {
  const period1 = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [summary, chart] = await Promise.all([
    yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "summaryProfile"]
    }),
    yahooFinance.chart(ticker, { period1, interval: "1d" })
  ]);

  const quotes = chart?.quotes || [];
  if (!quotes.length) {
    throw new Error(`No price history for ${ticker}`);
  }

  quotes.sort((a, b) => new Date(a.date) - new Date(b.date));

  const series = quotes
    .filter((entry) => entry && entry.adjclose != null)
    .map((entry) => ({
      date: toISODate(new Date(entry.date)),
      adjClose: entry.adjclose,
      close: entry.close ?? entry.adjclose,
      volume: entry.volume ?? null
    }));

  if (!series.length) {
    throw new Error(`No adjusted closes for ${ticker}`);
  }

  const closes = series.map((entry) => entry.adjClose);
  const lastPrice = closes[closes.length - 1];
  const previousClose = closes.length > 1 ? closes[closes.length - 2] : lastPrice;
  const lastDate = series[series.length - 1].date;

  const lastYearSeries = series.slice(-RETURN_WINDOWS["12m"]);
  const yearHigh = Math.max(...lastYearSeries.map((entry) => entry.adjClose).filter((v) => v != null));
  const yearLow = Math.min(...lastYearSeries.map((entry) => entry.adjClose).filter((v) => v != null));

  const returns = {};
  for (const [window, periods] of Object.entries(RETURN_WINDOWS)) {
    returns[window] =
      window === "ytd" ? computeYtdReturn(series) : computePeriodReturn(closes, periods);
  }

  const priceInfo = summary.price || {};
  const summaryDetail = summary.summaryDetail || {};
  const keyStats = summary.defaultKeyStatistics || {};
  const financialData = summary.financialData || {};
  const profile = summary.summaryProfile || {};

  const tenDayVolumes = series.slice(-10).map((entry) => entry.volume).filter((v) => v != null);
  const thirtyDayVolumes = series.slice(-30).map((entry) => entry.volume).filter((v) => v != null);
  const sixtyThreeDayVolumes = series.slice(-63).map((entry) => entry.volume).filter((v) => v != null);

  const metadata = {
    ticker,
    name: priceInfo.longName || priceInfo.shortName || TICKERS[ticker] || ticker,
    industry: profile.industry || profile.sector || "Insurance",
    last_price: lastPrice ?? null,
    previous_close: previousClose ?? null,
    market_cap:
      priceInfo.marketCap ??
      financialData.marketCap ??
      summaryDetail.marketCap ??
      keyStats.marketCap ??
      null,
    pe_ratio:
      summaryDetail.trailingPE ??
      financialData.trailingPE ??
      priceInfo.trailingPE ??
      null,
    pb_ratio:
      keyStats.priceToBook ??
      financialData.priceToBook ??
      summaryDetail.priceToBook ??
      null,
    beta:
      summaryDetail.beta ??
      keyStats.beta ??
      financialData.beta ??
      priceInfo.beta ??
      null,
    dividend_yield:
      summaryDetail.dividendYield ??
      financialData.dividendYield ??
      priceInfo.trailingAnnualDividendYield ??
      null,
    avg_volume_3m:
      priceInfo.averageDailyVolume3Month ??
      (sixtyThreeDayVolumes.length ? average(sixtyThreeDayVolumes) : null),
    avg_volume_30d:
      priceInfo.averageDailyVolume10Day ??
      (thirtyDayVolumes.length ? average(thirtyDayVolumes) : null),
    ten_day_avg_volume:
      priceInfo.averageDailyVolume10Day ??
      (tenDayVolumes.length ? average(tenDayVolumes) : null),
    shares_outstanding:
      priceInfo.sharesOutstanding ??
      keyStats.sharesOutstanding ??
      financialData.sharesOutstanding ??
      null,
    year_high: Number.isFinite(yearHigh) ? yearHigh : priceInfo.fiftyTwoWeekHigh ?? null,
    year_low: Number.isFinite(yearLow) ? yearLow : priceInfo.fiftyTwoWeekLow ?? null,
    volatility: computeAnnualizedVolatility(closes),
    max_drawdown: computeMaxDrawdown(closes),
    returns
  };

  if (metadata.year_high != null && lastPrice != null && metadata.year_high !== 0) {
    metadata.year_high_pct = lastPrice / metadata.year_high - 1;
  } else {
    metadata.year_high_pct = null;
  }

  if (metadata.year_low != null && metadata.year_low !== 0 && lastPrice != null) {
    metadata.year_low_pct = lastPrice / metadata.year_low - 1;
  } else {
    metadata.year_low_pct = null;
  }

  return {
    metadata,
    priceSeries: series.map((entry) => ({
      date: entry.date,
      adj_close: entry.adjClose
    })),
    lastDate
  };
}

function computeAggregates(companies) {
  const coverage = companies.length;
  const marketCaps = companies.map((company) => company.market_cap).filter((value) => Number.isFinite(value));
  const betas = companies.map((company) => company.beta).filter((value) => Number.isFinite(value));
  const advancers = companies.filter((company) => (company.returns?.["1d"] || 0) > 0).length;
  const decliners = companies.filter((company) => (company.returns?.["1d"] || 0) < 0).length;

  return {
    coverage,
    totalMarketCap: marketCaps.reduce((acc, value) => acc + value, 0),
    avgBeta: betas.length ? betas.reduce((acc, value) => acc + value, 0) / betas.length : null,
    advancers,
    decliners,
    breadth1d: coverage ? advancers / coverage : null
  };
}

exports.handler = async () => {
  try {
    yahooFinance = new YahooFinance({
      suppressNotices: ["yahooSurvey"]
    });

    const symbols = [...Object.keys(TICKERS), ...BENCHMARK_SYMBOLS];
    const results = [];
    const prices = {};
    const errors = [];
    const benchmarks = [];

    for (let i = 0; i < symbols.length; i += 4) {
      const chunk = symbols.slice(i, i + 4);
      // eslint-disable-next-line no-await-in-loop
      const chunkResults = await Promise.all(
        chunk.map(async (ticker) => {
          try {
            const data = await fetchTickerData(ticker);
            return { status: "fulfilled", ticker, data };
          } catch (error) {
            return { status: "rejected", ticker, reason: error };
          }
        })
      );

      chunkResults.forEach((result) => {
        if (result.status === "fulfilled") {
          const { metadata, priceSeries, lastDate } = result.data;
          if (BENCHMARK_SYMBOLS.includes(result.ticker)) {
            benchmarks.push({ ticker: metadata.ticker, name: metadata.name });
          } else {
            results.push(metadata);
          }
          prices[result.ticker] = priceSeries;
          if (!prices._lastDate || lastDate > prices._lastDate) {
            prices._lastDate = lastDate;
          }
        } else {
          errors.push({
            ticker: result.ticker,
            message: result.reason?.message || "Unknown error"
          });
        }
      });
    }

    const companies = results.sort((a, b) => a.ticker.localeCompare(b.ticker));
    const lastTradeDate = prices._lastDate || null;
    delete prices._lastDate;

    const responseBody = {
      generated_at: new Date().toISOString(),
      last_trade_date: lastTradeDate,
      companies,
      prices,
      benchmarks,
      aggregates: computeAggregates(companies),
      errors
    };

    return {
      statusCode: errors.length && !companies.length ? 502 : 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=0, s-maxage=900",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(responseBody)
    };
  } catch (error) {
    console.error("pcd-dashboard error", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: error.message || "Unexpected server error" })
    };
  }
};
