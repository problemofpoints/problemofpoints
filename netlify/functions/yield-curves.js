const TREASURY_BASE = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";
const FRED_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";

const MATURITY_MAP = [
  { column: "1 Mo", key: "1m", label: "1 Month" },
  { column: "2 Mo", key: "2m", label: "2 Month" },
  { column: "3 Mo", key: "3m", label: "3 Month" },
  { column: "6 Mo", key: "6m", label: "6 Month" },
  { column: "1 Yr", key: "1y", label: "1 Year" },
  { column: "2 Yr", key: "2y", label: "2 Year" },
  { column: "3 Yr", key: "3y", label: "3 Year" },
  { column: "5 Yr", key: "5y", label: "5 Year" },
  { column: "7 Yr", key: "7y", label: "7 Year" },
  { column: "10 Yr", key: "10y", label: "10 Year" },
  { column: "20 Yr", key: "20y", label: "20 Year" },
  { column: "30 Yr", key: "30y", label: "30 Year" }
];

const FRED_SERIES = [
  {
    id: "BAMLC0A0CM",
    label: "ICE BofA US Corporate Index OAS",
    category: "investmentGradeOas"
  },
  {
    id: "BAMLH0A0HYM2",
    label: "ICE BofA US High Yield Index OAS",
    category: "highYieldOas"
  },
  {
    id: "T10Y2Y",
    label: "10Y minus 2Y Treasury Spread",
    category: "tenTwoSpread"
  }
];

const DEFAULT_RANGE_DAYS = 540;

function parseNumber(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  if (!cleaned || cleaned === "N/A") return null;
  const number = Number.parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function toBasisPoints(value) {
  if (value === null || value === undefined) return null;
  return Number((value * 100).toFixed(1));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { header: [], rows: [] };

  const header = lines[0]
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => line.split(","));

  return { header, rows };
}

function parseTreasuryData(csvTexts, rangeDays) {
  if (!csvTexts.length) {
    throw new Error("Treasury response was empty");
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - rangeDays);

  const seriesByDate = new Map();
  const maturitiesFound = new Map();

  csvTexts.forEach((csvText) => {
    const { header, rows } = parseCsv(csvText);
    if (!header.length) {
      return;
    }

    const dateIndex = header.findIndex((column) => /date/i.test(column));
    if (dateIndex === -1) {
      return;
    }

    const availableMaturities = MATURITY_MAP.filter((entry) => header.includes(entry.column));
    if (!availableMaturities.length) {
      return;
    }

    const columnIndices = new Map();
    availableMaturities.forEach((entry) => {
      maturitiesFound.set(entry.key, entry);
      columnIndices.set(entry.key, header.indexOf(entry.column));
    });

    rows.forEach((columns) => {
      const rawDate = columns[dateIndex];
      const date = rawDate ? new Date(rawDate) : null;
      if (!date || Number.isNaN(date.getTime())) {
        return;
      }

      if (date < cutoff) {
        return;
      }

      const isoDate = date.toISOString().slice(0, 10);
      const existing = seriesByDate.get(isoDate) || { date: isoDate, values: {} };

      availableMaturities.forEach(({ key }) => {
        const columnIndex = columnIndices.get(key);
        const value = columnIndex === -1 ? null : parseNumber(columns[columnIndex]);
        existing.values[key] = value;
      });

      seriesByDate.set(isoDate, existing);
    });
  });

  if (!seriesByDate.size) {
    throw new Error("Treasury response was empty");
  }

  const maturities = MATURITY_MAP.filter((entry) => maturitiesFound.has(entry.key));
  const series = Array.from(seriesByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    maturities,
    series
  };
}

function buildTreasuryUrl(year) {
  const base = `${TREASURY_BASE}/${year}/all`;
  const params = new URLSearchParams({
    type: "daily_treasury_yield_curve",
    field_tdr_date_value: String(year),
    _format: "csv"
  });
  return `${base}?${params.toString()}`;
}

async function fetchTreasuryCsv(year) {
  const url = buildTreasuryUrl(year);
  const response = await fetch(url, {
    headers: {
      "Accept": "text/csv, text/plain"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Treasury request failed (${year}): ${response.status} ${text}`);
  }

  return response.text();
}

function resolveTreasuryYears(rangeDays) {
  const today = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - rangeDays - 14);

  const years = [];
  for (let year = start.getUTCFullYear(); year <= today.getUTCFullYear(); year += 1) {
    years.push(year);
  }
  return years;
}

async function fetchFredSeries(seriesId, rangeDays) {
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - rangeDays - 14);
  const cosd = startDate.toISOString().slice(0, 10);

  const url = `${FRED_BASE}?id=${encodeURIComponent(seriesId)}&cosd=${cosd}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "text/csv, text/plain"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FRED request failed (${seriesId}): ${response.status} ${text}`);
  }

  const csvText = await response.text();
  const { rows } = parseCsv(csvText);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - rangeDays);

  const data = rows
    .map(([date, value]) => {
      const parsedDate = date ? new Date(date) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;
      if (parsedDate < cutoff) return null;
      const parsedValue = parseNumber(value);
      return {
        date: parsedDate.toISOString().slice(0, 10),
        value: parsedValue
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return data;
}

async function buildResponse(rangeDays) {
  const treasuryYears = resolveTreasuryYears(rangeDays);
  const [treasuryCsvs, ...fredSeries] = await Promise.all([
    Promise.all(treasuryYears.map((year) => fetchTreasuryCsv(year))),
    ...FRED_SERIES.map((series) => fetchFredSeries(series.id, rangeDays))
  ]);

  const treasury = parseTreasuryData(treasuryCsvs, rangeDays);

  const fred = FRED_SERIES.map((seriesMeta, index) => {
    const rawSeries = fredSeries[index];
    const data = rawSeries.map((entry) => {
      let value = entry.value;
      if (seriesMeta.category !== "tenTwoSpread" && value !== null) {
        value = toBasisPoints(value);
      } else if (seriesMeta.category === "tenTwoSpread" && value !== null) {
        value = Number((value * 100).toFixed(0));
      }
      return {
        date: entry.date,
        value
      };
    });

    return {
      id: seriesMeta.id,
      label: seriesMeta.label,
      category: seriesMeta.category,
      data
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    rangeDays,
    treasury,
    fred
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: {
        Allow: "GET, OPTIONS",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const rangeParam = Number.parseInt(event?.queryStringParameters?.range, 10);
  const rangeDays = Number.isFinite(rangeParam) && rangeParam > 0 ? Math.min(rangeParam, 1095) : DEFAULT_RANGE_DAYS;

  try {
    const payload = await buildResponse(rangeDays);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(payload)
    };
  } catch (error) {
    console.error("yield-curves function error", error);
    return {
      statusCode: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: error.message || "Failed to fetch yield data" })
    };
  }
};
