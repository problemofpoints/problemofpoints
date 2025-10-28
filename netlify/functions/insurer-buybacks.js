const YahooFinance = require("yahoo-finance2").default;

let yahooFinance;

const TICKERS = {
  AIG: "American International Group",
  ALL: "The Allstate Corporation",
  ACGL: "Arch Capital Group",
  AXS: "AXIS Capital Holdings",
  CB: "Chubb Limited",
  "CS.PA": "AXA SA",
  CINF: "Cincinnati Financial Corporation",
  EG: "Everest Group",
  EIG: "Employers Holdings",
  "HNR1.DE": "Hannover Rück SE",
  HCI: "HCI Group",
  HRTG: "Heritage Insurance Holdings",
  HIG: "The Hartford Financial Services Group",
  "HSX.L": "Hiscox Ltd",
  "IFC.TO": "Intact Financial Corporation",
  JRVR: "James River Group Holdings",
  KMPR: "Kemper Corporation",
  KNSL: "Kinsale Capital Group",
  "LRE.L": "Lancashire Holdings",
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
  "SCR.PA": "SCOR SE",
  SAFT: "Safety Insurance Group",
  SKWD: "Skyward Specialty Insurance Group",
  SIGI: "Selective Insurance Group",
  THG: "The Hanover Insurance Group",
  TRV: "The Travelers Companies",
  "SREN.SW": "Swiss Re AG",
  UFCS: "United Fire Group",
  UVE: "Universal Insurance Holdings",
  WRB: "W. R. Berkley Corporation",
  WTM: "White Mountains Insurance Group",
  "ZURN.SW": "Zurich Insurance Group",
  BOW: "Bowhead Specialty Holdings Inc.",
  AFG: "American Financial Group",
  AMSF: "AMERISAFE, Inc.",
  AIZ: "Assurant, Inc.",
  CNA: "CNA Financial Corporation",
  HMN: "Horace Mann Educators Corporation",
  LMND: "Lemonade, Inc.",
  FIHL: "Fidelis Insurance Holdings",
  GLRE: "Greenlight Capital Re",
  IGIC: "International General Insurance Holdings",
  GBLI: "Global Indemnity Group",
  HG: "Hamilton Insurance Group",
  "BRK-B": "Berkshire Hathaway Inc."
};

const REQUIRED_RETURN_BUCKETS = {
  ALL: { label: "7-10%", requiredReturn: 0.085 },
  AFG: { label: "7-10%", requiredReturn: 0.085 },
  AMSF: { label: "7-10%", requiredReturn: 0.085 },
  AIZ: { label: "7-10%", requiredReturn: 0.085 },
  BRK_B: { label: "7-10%", requiredReturn: 0.085 },
  CB: { label: "7-10%", requiredReturn: 0.085 },
  HIG: { label: "7-10%", requiredReturn: 0.085 },
  PGR: { label: "7-10%", requiredReturn: 0.085 },
  SAFT: { label: "7-10%", requiredReturn: 0.085 },
  TRV: { label: "7-10%", requiredReturn: 0.085 },
  AIG: { label: "10-12%", requiredReturn: 0.11 },
  ACGL: { label: "10-12%", requiredReturn: 0.11 },
  AXS: { label: "10-12%", requiredReturn: 0.11 },
  BOW: { label: "10-12%", requiredReturn: 0.11 },
  CINF: { label: "10-12%", requiredReturn: 0.11 },
  CNA: { label: "10-12%", requiredReturn: 0.11 },
  EIG: { label: "10-12%", requiredReturn: 0.11 },
  FFH_T: { label: "10-12%", requiredReturn: 0.11 },
  THG: { label: "10-12%", requiredReturn: 0.11 },
  HMN: { label: "10-12%", requiredReturn: 0.11 },
  KMPR: { label: "10-12%", requiredReturn: 0.11 },
  KNSL: { label: "10-12%", requiredReturn: 0.11 },
  LMND: { label: "10-12%", requiredReturn: 0.11 },
  PLMR: { label: "10-12%", requiredReturn: 0.11 },
  SPNT: { label: "10-12%", requiredReturn: 0.11 },
  MKL: { label: "12-14%", requiredReturn: 0.13 },
  EG: { label: "12-14%", requiredReturn: 0.13 },
  JRVR: { label: "12-14%", requiredReturn: 0.13 },
  MCY: { label: "12-14%", requiredReturn: 0.13 },
  ORI: { label: "12-14%", requiredReturn: 0.13 },
  RLI: { label: "12-14%", requiredReturn: 0.13 },
  SIGI: { label: "12-14%", requiredReturn: 0.13 },
  UFCS: { label: "12-14%", requiredReturn: 0.13 },
  WRB: { label: "12-14%", requiredReturn: 0.13 },
  RNR: { label: "14%+", requiredReturn: 0.15 },
  FIHL: { label: "14%+", requiredReturn: 0.15 },
  GLRE: { label: "14%+", requiredReturn: 0.15 },
  HG: { label: "14%+", requiredReturn: 0.15 },
  HCI: { label: "14%+", requiredReturn: 0.15 },
  IGIC: { label: "14%+", requiredReturn: 0.15 },
  UVE: { label: "14%+", requiredReturn: 0.15 },
  GBLI: { label: "14%+", requiredReturn: 0.15 }
};

function normalizeTickerKey(ticker) {
  if (!ticker) return ticker;
  return ticker.replace(/[^A-Z0-9]/gi, "_");
}

function safeNumber(value) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeROE(summary, derived) {
  const financialData = summary.financialData || {};
  const keyStats = summary.defaultKeyStatistics || {};
  const roeFields = [
    financialData.returnOnEquity,
    keyStats.returnOnEquity,
    keyStats.roe
  ];

  for (const candidate of roeFields) {
    const numeric = safeNumber(candidate);
    if (numeric != null) {
      return numeric;
    }
  }

  const incomeStatements = summary.incomeStatementHistory?.incomeStatementHistory;
  const balanceSheet = summary.balanceSheetHistory?.balanceSheetStatements;
  const netIncome = safeNumber(incomeStatements?.[0]?.netIncome);
  const equity = safeNumber(balanceSheet?.[0]?.totalStockholderEquity);
  if (netIncome != null && equity && equity !== 0) {
    return netIncome / equity;
  }

  if (derived?.earnings && derived?.equityAverage) {
    return derived.earnings / derived.equityAverage;
  }

  return null;
}

function computeFromFundamentals(series) {
  if (!Array.isArray(series) || !series.length) return {};

  const sorted = series
    .filter(
      (entry) =>
        entry &&
        entry.date &&
        (entry.TYPE === "BALANCE_SHEET" || entry.TYPE === "ALL" || entry.TYPE === undefined)
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const latest = sorted[sorted.length - 1];
  if (!latest) return {};

  const shares =
    safeNumber(latest.ordinarySharesNumber) ??
    safeNumber(latest.shareIssued) ??
    safeNumber(latest.treasurySharesNumber);

  const stockholdersEquity =
    safeNumber(latest.stockholdersEquity) ??
    safeNumber(latest.commonStockEquity);

  const tangibleBookTotal =
    safeNumber(latest.tangibleBookValue) ??
    safeNumber(latest.netTangibleAssets);

  const goodwill = safeNumber(latest.goodwill);
  const otherIntangibles = safeNumber(latest.otherIntangibleAssets);
  const hasIntangible = goodwill != null || otherIntangibles != null;
  const totalIntangibles = hasIntangible
    ? (goodwill != null ? goodwill : 0) + (otherIntangibles != null ? otherIntangibles : 0)
    : null;

  const bookValuePerShare =
    stockholdersEquity != null && shares
      ? stockholdersEquity / shares
      : null;

  const tangibleBookPerShare =
    tangibleBookTotal != null && shares ? tangibleBookTotal / shares : null;

  const goodwillRatio =
    stockholdersEquity != null && totalIntangibles != null && stockholdersEquity !== 0
      ? totalIntangibles / stockholdersEquity
      : null;

  return {
    bookValuePerShare,
    tangibleBookPerShare,
    goodwillRatio,
    sharesFromFundamentals: shares,
    stockholdersEquity,
    totalIntangibles,
    goodwillValue: goodwill,
    otherIntangiblesValue: otherIntangibles
  };
}

function computeRequiredReturn(ticker, fallback) {
  const key = normalizeTickerKey(ticker);
  if (REQUIRED_RETURN_BUCKETS[key]) {
    return REQUIRED_RETURN_BUCKETS[key];
  }
  if (fallback != null) {
    return { label: "Custom", requiredReturn: fallback };
  }
  return { label: "Base", requiredReturn: 0.12 };
}

async function fetchTickerData(ticker) {
  const period1Date = new Date();
  period1Date.setFullYear(period1Date.getFullYear() - 6);
  const period1 = period1Date.toISOString().slice(0, 10);

  const fundamentalsPromise = yahooFinance
    .fundamentalsTimeSeries(ticker, {
      period1,
      type: "annual",
      module: "balance-sheet"
    })
    .catch((error) => {
      if (Array.isArray(error?.result)) {
        return error.result;
      }
      return [];
    });

  const summaryPromise = yahooFinance.quoteSummary(ticker, {
    modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData"]
  });

  const [summary, fundamentalsSeries] = await Promise.all([summaryPromise, fundamentalsPromise]);

  const price = summary.price || {};
  const summaryDetail = summary.summaryDetail || {};
  const keyStats = summary.defaultKeyStatistics || {};
  const incomeStatements = summary.incomeStatementHistory?.incomeStatementHistory;

  const lastPrice = safeNumber(price.regularMarketPrice ?? price.postMarketPrice ?? price.preMarketPrice);
  const currency = price.currency || summaryDetail.currency || "USD";
  const sharesOutstanding =
    safeNumber(price.sharesOutstanding) ??
    safeNumber(keyStats.sharesOutstanding) ??
    safeNumber(summaryDetail.sharesOutstanding);

  const balanceSheetStatements = summary.balanceSheetHistory?.balanceSheetStatements;
  const balanceSheet = balanceSheetStatements?.[0];

  const equityFromStatements = safeNumber(balanceSheet?.totalStockholderEquity);

  const fundamentalsComputed = computeFromFundamentals(fundamentalsSeries);

  const bookValuePerShare =
    fundamentalsComputed.bookValuePerShare ??
    safeNumber(keyStats.bookValue) ??
    safeNumber(price.bookValue) ??
    (sharesOutstanding && equityFromStatements != null ? equityFromStatements / sharesOutstanding : null);

  const tangibleBookPerShare =
    fundamentalsComputed.tangibleBookPerShare ??
    safeNumber(keyStats.tangibleBookValuePerShare) ??
    bookValuePerShare;

  const roe = computeROE(summary);
  const ptbv = lastPrice != null && tangibleBookPerShare
    ? lastPrice / tangibleBookPerShare
    : null;
  const pb = lastPrice != null && bookValuePerShare
    ? lastPrice / bookValuePerShare
    : null;

  const impliedReturn = ptbv && ptbv > 0 && roe != null ? roe / ptbv : (roe ?? null);
  const impliedReturnPct = impliedReturn != null ? impliedReturn * 100 : null;
  const rule72PaybackYears = impliedReturnPct && impliedReturnPct > 0 ? 72 / impliedReturnPct : null;
  const premiumPaybackYears =
    ptbv != null && roe != null && ptbv > 1 && roe > 0 ? (ptbv - 1) / roe : ptbv != null && ptbv <= 1 ? 0 : null;

  const requiredReturnInfo = computeRequiredReturn(ticker);
  const redZoneThreshold =
    roe != null && requiredReturnInfo.requiredReturn > 0
      ? roe / requiredReturnInfo.requiredReturn
      : null;
  const redZoneDelta =
    redZoneThreshold != null && ptbv != null && redZoneThreshold !== 0
      ? ptbv / redZoneThreshold - 1
      : null;

  return {
    ticker,
    name: price.shortName || price.longName || TICKERS[ticker] || ticker,
    currency,
    price: lastPrice,
    marketCap: safeNumber(price.marketCap ?? summaryDetail.marketCap ?? keyStats.marketCap),
    sharesOutstanding,
    bookValuePerShare,
    tangibleBookValuePerShare: tangibleBookPerShare,
    priceToBook: pb,
    priceToTangibleBook: ptbv,
    returnOnEquity: roe,
    impliedBuybackReturn: impliedReturn,
    rule72PaybackYears,
    premiumPaybackYears,
    goodwillRatio:
      fundamentalsComputed.goodwillRatio != null
        ? fundamentalsComputed.goodwillRatio
        : null,
    requiredReturnLabel: requiredReturnInfo.label,
    requiredReturn: requiredReturnInfo.requiredReturn,
    redZoneThresholdPTBV: redZoneThreshold,
    redZoneDelta,
    totalEquity:
      fundamentalsComputed.stockholdersEquity != null
        ? fundamentalsComputed.stockholdersEquity
        : safeNumber(balanceSheet?.totalStockholderEquity),
    goodwill:
      fundamentalsComputed.goodwillValue != null
        ? fundamentalsComputed.goodwillValue
        : safeNumber(balanceSheet?.goodWill || balanceSheet?.goodwill),
    intangibleAssets:
      fundamentalsComputed.otherIntangiblesValue != null
        ? fundamentalsComputed.otherIntangiblesValue
        : safeNumber(balanceSheet?.intangibleAssets),
    netIncome: safeNumber(incomeStatements?.[0]?.netIncome),
    payoutRatio: safeNumber(summaryDetail.payoutRatio),
    beta: safeNumber(keyStats.beta)
  };
}

exports.handler = async (event) => {
  try {
    const params = event?.queryStringParameters || {};
    const requested = params.tickers
      ? params.tickers.split(",").map((value) => value.trim()).filter(Boolean)
      : Object.keys(TICKERS);

    const uniqueTickers = Array.from(new Set(requested));

    yahooFinance =
      yahooFinance ??
      new YahooFinance({
        suppressNotices: ["yahooSurvey"],
        validation: {
          logErrors: false,
          logWarnings: false,
          strict: false
        }
      });

    const results = [];
    const errors = [];

    for (let i = 0; i < uniqueTickers.length; i += 3) {
      const batch = uniqueTickers.slice(i, i + 3);
      // eslint-disable-next-line no-await-in-loop
      const batchResults = await Promise.all(
        batch.map(async (ticker) => {
          try {
            const data = await fetchTickerData(ticker);
            return { status: "fulfilled", ticker, data };
          } catch (error) {
            return { status: "rejected", ticker, reason: error };
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === "fulfilled") {
          results.push(result.data);
        } else {
          errors.push({
            ticker: result.ticker,
            message: result.reason?.message || "Unknown error fetching data"
          });
        }
      });
    }

    return {
      statusCode: errors.length && !results.length ? 502 : 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=0, s-maxage=900",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        tickers: results,
        errors
      })
    };
  } catch (error) {
    console.error("insurer-buybacks error", error);
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
