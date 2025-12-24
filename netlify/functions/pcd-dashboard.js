const YahooFinance = require("yahoo-finance2").default;

let yahooFinance;

const TICKERS = {
  AIG: "American International Group",
  AIZ: "Assurant, Inc.",
  ALL: "The Allstate Corporation",
  ACGL: "Arch Capital Group",
  AMSF: "AMERISAFE, Inc.",
  AXS: "AXIS Capital Holdings",
  CB: "Chubb Limited",
  "CS.PA": "AXA SA",
  CINF: "Cincinnati Financial Corporation",
  EG: "Everest Group",
  EIG: "Employers Holdings",
  "FFH.TO": "Fairfax Financial Holdings Limited",
  FIHL: "Fidelis Insurance Holdings Limited",
  "HNR1.DE": "Hannover Rück SE",
  HCI: "HCI Group",
  HG: "Hamilton Insurance Group",
  HIPO: "Hippo Holdings Inc.",
  HRTG: "Heritage Insurance Holdings",
  HIG: "The Hartford Financial Services Group",
  "HSX.L": "Hiscox Ltd",
  "IFC.TO": "Intact Financial Corporation",
  JRVR: "James River Group Holdings",
  KMPR: "Kemper Corporation",
  KNSL: "Kinsale Capital Group",
  "LRE.L": "Lancashire Holdings",
  LMND: "Lemonade, Inc.",
  MCY: "Mercury General Corporation",
  MKL: "Markel Group",
  "MUV2.DE": "Munich Re",
  "ALV.DE": "Allianz SE",
  "MAP.MC": "Mapfre, S.A.",
  ORI: "Old Republic International Corporation",
  PGR: "The Progressive Corporation",
  PLMR: "Palomar Holdings",
  "QBE.AX": "QBE Insurance Group",
  RLI: "RLI Corp.",
  RNR: "RenaissanceRe Holdings",
  ROOT: "Root, Inc.",
  "SCR.PA": "SCOR SE",
  SAFT: "Safety Insurance Group",
  SKWD: "Skyward Specialty Insurance Group",
  SIGI: "Selective Insurance Group",
  THG: "The Hanover Insurance Group",
  TRV: "The Travelers Companies",
  "SREN.SW": "Swiss Re AG",
  UFCS: "United Fire Group",
  UVE: "Universal Insurance Holdings",
  UIHC: "United Insurance Holdings",
  WRB: "W. R. Berkley Corporation",
  WTM: "White Mountains Insurance Group",
  "ZURN.SW": "Zurich Insurance Group",
  "BEZ.L": "Beazley plc",
  BOW: "Bowhead Specialty Holdings"
};

const BENCHMARK_SYMBOLS = ["BRK-B", "^GSPC"];

const RETURN_DEFINITIONS = {
  "1d": { days: 1 },
  "1w": { days: 7 },
  "1m": { months: 1 },
  "3m": { months: 3 },
  "6m": { months: 6 },
  ytd: { yearStart: true },
  "12m": { months: 12 },
  "24m": { months: 24 }
};

const TRADING_DAYS_PER_YEAR = 252;
const HISTORY_LOOKBACK_DAYS = 365 * 2 + 30;

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDateByMonthsUTC(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, month - months, 1));
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, daysInMonth));
  return target;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function shiftDateByDaysUTC(date, days) {
  return new Date(date.getTime() - days * MS_PER_DAY);
}

function startOfUTCYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function normalizePriceToBook(value) {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 40 && numeric < 1000) {
    return numeric / 100;
  }
  return numeric;
}

function findPointOnOrBefore(series, targetDate) {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i].dateObj <= targetDate) {
      return series[i];
    }
  }
  return null;
}

function getTargetDate(latestDate, definition) {
  if (!definition) return null;
  if (definition.yearStart) return startOfUTCYear(latestDate);
  if (definition.months) return shiftDateByMonthsUTC(latestDate, definition.months);
  if (definition.days) return shiftDateByDaysUTC(latestDate, definition.days);
  return null;
}

function computeCalendarReturn(series, definition) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const latest = series[series.length - 1];
  if (!latest || latest.adjClose == null) return null;
  const targetDate = getTargetDate(latest.dateObj, definition);
  if (!targetDate) return null;
  const startPoint = findPointOnOrBefore(series, targetDate);
  if (!startPoint || startPoint === latest || startPoint.adjClose == null || startPoint.adjClose === 0) {
    return null;
  }
  return latest.adjClose / startPoint.adjClose - 1;
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
    .map((entry) => {
      const dateObj = entry.date instanceof Date ? new Date(entry.date.getTime()) : new Date(entry.date);
      return {
        date: toISODate(dateObj),
        dateObj,
        adjClose: entry.adjclose,
        close: entry.close ?? entry.adjclose,
        volume: entry.volume ?? null
      };
    });

  if (!series.length) {
    throw new Error(`No adjusted closes for ${ticker}`);
  }

  const closes = series.map((entry) => entry.adjClose);
  const latestPoint = series[series.length - 1];
  const lastPrice = latestPoint.adjClose;
  const previousClose = series.length > 1 ? series[series.length - 2].adjClose : lastPrice;
  const lastDate = latestPoint.date;
  const latestDateObj = latestPoint.dateObj;

  const twelveMonthsAgo = shiftDateByMonthsUTC(latestDateObj, 12);
  const lastYearSeries = series.filter((entry) => entry.dateObj >= twelveMonthsAgo);
  const windowSeries = lastYearSeries.length ? lastYearSeries : series;
  const windowPrices = windowSeries.map((entry) => entry.adjClose).filter((value) => value != null);
  const yearHigh = windowPrices.length ? Math.max(...windowPrices) : null;
  const yearLow = windowPrices.length ? Math.min(...windowPrices) : null;
  const maWindow = series.slice(-200).map((entry) => entry.adjClose).filter((value) => value != null);
  const ma200 = maWindow.length ? average(maWindow) : null;
  const aboveMa200 = ma200 != null && lastPrice != null ? lastPrice >= ma200 : null;

  const returns = {};
  for (const [window, definition] of Object.entries(RETURN_DEFINITIONS)) {
    returns[window] = computeCalendarReturn(series, definition);
  }

  const rawSeries = series.map((entry) => ({ dateObj: entry.dateObj, adjClose: entry.close ?? entry.adjClose }));
  const rawReturns = {};
  for (const [window, definition] of Object.entries(RETURN_DEFINITIONS)) {
    rawReturns[window] = computeCalendarReturn(rawSeries, definition);
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
    last_price_unadjusted: latestPoint.close ?? null,
    previous_close: previousClose ?? null,
    previous_close_unadjusted: series.length > 1 ? series[series.length - 2].close ?? series[series.length - 2].adjClose : latestPoint.close ?? lastPrice,
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
      summaryDetail.priceToBook ??
      financialData.priceToBook ??
      priceInfo.priceToBook ??
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
    ma200,
    above_ma200: aboveMa200,
    returns,
    raw_returns: rawReturns
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

  metadata.pb_ratio = normalizePriceToBook(metadata.pb_ratio);

  return {
    metadata,
    priceSeries: series.map((entry) => ({
      date: entry.date,
      adj_close: entry.adjClose,
      close: entry.close ?? entry.adjClose
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
  const above200Count = companies.filter((company) => company.above_ma200 === true).length;

  return {
    coverage,
    totalMarketCap: marketCaps.reduce((acc, value) => acc + value, 0),
    avgBeta: betas.length ? betas.reduce((acc, value) => acc + value, 0) / betas.length : null,
    advancers,
    decliners,
    breadth1d: coverage ? advancers / coverage : null,
    above200Count,
    above200Ratio: coverage ? above200Count / coverage : null
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
            benchmarks.push({
              ticker: metadata.ticker,
              name: metadata.name,
              returns: metadata.returns || null
            });
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
