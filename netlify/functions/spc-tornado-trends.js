const TORNADO_BASE_URL = "https://www.spc.noaa.gov/wcm/data/";
const REPORTS_BASE_URL = "https://www.spc.noaa.gov/climo/reports/";
const DEFAULT_START_YEAR = 2000;
const MAX_REQUEST_SPAN = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CURRENT_YEAR_CACHE = globalThis.__swtTornadoCurrentYearCache || new Map();
globalThis.__swtTornadoCurrentYearCache = CURRENT_YEAR_CACHE;

const SECTION_HEADERS = {
  tornado: /^Time\s*,\s*F_Scale/i,
  wind: /^Time\s*,\s*Speed/i,
  hail: /^Time\s*,\s*Size/i
};

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((part) => part.trim());
}

function dayOfYearFromParts(year, month, day) {
  const utcDate = Date.UTC(year, month - 1, day);
  const startOfYear = Date.UTC(year, 0, 0);
  return Math.floor((utcDate - startOfYear) / MS_PER_DAY);
}

function isoFromDayOfYear(year, dayOfYear) {
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(dayOfYear);
  return date.toISOString().slice(0, 10);
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function addDaysUTC(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toDailyFilename(date) {
  const yy = pad(date.getUTCFullYear() % 100);
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const base = `${yy}${mm}${dd}`;
  return {
    base,
    candidates: [`${base}_rpts_filtered.csv`, `${base}_rpts.csv`]
  };
}

function parseDailyTornadoCount(csvText) {
  if (!csvText) return 0;
  const lines = csvText.split(/\r?\n/);
  let inTornadoSection = false;
  let count = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (SECTION_HEADERS.tornado.test(line)) {
      inTornadoSection = true;
      continue;
    }
    if (SECTION_HEADERS.wind.test(line) || SECTION_HEADERS.hail.test(line)) {
      if (inTornadoSection) break;
      continue;
    }

    if (inTornadoSection) {
      count += 1;
    }
  }

  return count;
}

async function fetchDailyTornadoCount(date) {
  const { candidates } = toDailyFilename(date);
  for (const candidate of candidates) {
    const url = `${REPORTS_BASE_URL}${candidate}`;
    const response = await fetch(url, {
      headers: { "Accept": "text/csv, text/plain" }
    });

    if (response.ok) {
      const text = await response.text();
      return parseDailyTornadoCount(text);
    }

    if (response.status !== 404) {
      const errorText = await response.text();
      const error = new Error(`SPC daily report request failed for ${candidate}: ${response.status}`);
      error.statusCode = response.status;
      error.details = errorText;
      throw error;
    }
  }
  return 0;
}

async function mapWithConcurrency(items, handler, limit = 6) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      if (index >= items.length) break;
      cursor += 1;
      const value = await handler(items[index], index);
      results[index] = value;
    }
  }

  const concurrency = Math.min(limit, items.length);
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

async function buildCurrentYearSeriesFromDaily(year, todayUtc) {
  const cacheEntry = CURRENT_YEAR_CACHE.get(year);
  const startDate = new Date(Date.UTC(year, 0, 1));
  const targetEndDate =
    year === todayUtc.getUTCFullYear()
      ? new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()))
      : new Date(Date.UTC(year, 11, 31));

  let series = [];
  let cumulative = 0;
  let fetchStartDate = new Date(startDate.getTime());

  if (cacheEntry && cacheEntry.lastDate) {
    const cachedData = cacheEntry.data;
    if (cachedData?.series?.length) {
      series = [...cachedData.series];
      cumulative = series[series.length - 1].cumulative;
    }
    const cachedDate = new Date(`${cacheEntry.lastDate}T00:00:00Z`);
    if (cachedDate >= targetEndDate) {
      return cachedData;
    }
    fetchStartDate = addDaysUTC(cachedDate, 1);
  }

  const datesToFetch = [];
  for (
    let date = new Date(fetchStartDate.getTime());
    date <= targetEndDate;
    date = addDaysUTC(date, 1)
  ) {
    datesToFetch.push(new Date(date.getTime()));
  }

  const counts = await mapWithConcurrency(datesToFetch, async (date) => {
    try {
      return await fetchDailyTornadoCount(date);
    } catch (error) {
      if (error.statusCode === 404) {
        return 0;
      }
      throw error;
    }
  });

  datesToFetch.forEach((date, idx) => {
    const count = counts[idx] || 0;
    const dayOfYear = dayOfYearFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    cumulative += count;
    series.push({
      dayOfYear,
      date: formatIsoDate(date),
      cumulative,
      daily: count,
      injuries: null,
      fatalities: null
    });
  });

  const data = {
    year,
    series,
    totalReports: cumulative,
    injuries: null,
    fatalities: null,
    firstReportDate: series.length ? series[0].date : null,
    lastReportDate: series.length ? series[series.length - 1].date : null,
    source: `${REPORTS_BASE_URL}YYMMDD_rpts.csv`
  };

  CURRENT_YEAR_CACHE.set(year, {
    lastDate: formatIsoDate(targetEndDate),
    data
  });

  return data;
}

function parseInteger(value) {
  if (value == null || value === "") return 0;
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseTornadoYear(csvText, expectedYear) {
  const lines = csvText.split(/\r?\n/).filter((line) => line && line.trim());
  if (!lines.length) {
    return null;
  }

  const headerColumns = splitCsvLine(lines[0]);
  const indexByName = new Map();
  headerColumns.forEach((column, index) => indexByName.set(column.toLowerCase(), index));

  const requiredFields = ["yr", "mo", "dy"];
  const missing = requiredFields.filter((field) => !indexByName.has(field));
  if (missing.length) {
    throw new Error(`Tornado CSV is missing expected columns: ${missing.join(", ")}`);
  }

  const injuryIndex = indexByName.get("inj");
  const fatalityIndex = indexByName.get("fat");

  const entries = [];

  for (let i = 1; i < lines.length; i += 1) {
    const parts = splitCsvLine(lines[i]);
    if (parts.length < headerColumns.length) {
      continue;
    }

    const year = Number.parseInt(parts[indexByName.get("yr")], 10);
    const month = Number.parseInt(parts[indexByName.get("mo")], 10);
    const day = Number.parseInt(parts[indexByName.get("dy")], 10);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      continue;
    }

    if (expectedYear && year !== expectedYear) {
      continue;
    }

    const dayKey = dayOfYearFromParts(year, month, day);
    const isoDate = `${year}-${pad(month)}-${pad(day)}`;

    entries.push({
      year,
      month,
      day,
      dayOfYear: dayKey,
      isoDate,
      injuries: injuryIndex != null ? parseInteger(parts[injuryIndex]) : 0,
      fatalities: fatalityIndex != null ? parseInteger(parts[fatalityIndex]) : 0
    });
  }

  if (!entries.length) {
    return {
      year: expectedYear,
      series: [],
      totalReports: 0,
      injuries: 0,
      fatalities: 0,
      firstReportDate: null,
      lastReportDate: null
    };
  }

  entries.sort((a, b) => a.dayOfYear - b.dayOfYear);

  const daily = new Map();
  for (const entry of entries) {
    if (!daily.has(entry.dayOfYear)) {
      daily.set(entry.dayOfYear, {
        count: 0,
        injuries: 0,
        fatalities: 0
      });
    }
    const current = daily.get(entry.dayOfYear);
    current.count += 1;
    current.injuries += entry.injuries;
    current.fatalities += entry.fatalities;
  }

  const sortedDays = Array.from(daily.keys()).sort((a, b) => a - b);
  let cumulative = 0;
  let totalInjuries = 0;
  let totalFatalities = 0;
  const series = sortedDays.map((dayKey) => {
    const { count, injuries, fatalities } = daily.get(dayKey);
    cumulative += count;
    totalInjuries += injuries;
    totalFatalities += fatalities;
    return {
      dayOfYear: dayKey,
      date: isoFromDayOfYear(expectedYear || entries[0].year, dayKey),
      cumulative,
      daily: count,
      injuries,
      fatalities
    };
  });

  const firstDay = sortedDays[0];
  const lastDay = sortedDays[sortedDays.length - 1];
  const seriesYear = expectedYear || entries[0].year;

  return {
    year: seriesYear,
    series,
    totalReports: cumulative,
    injuries: totalInjuries,
    fatalities: totalFatalities,
    firstReportDate: firstDay ? isoFromDayOfYear(seriesYear, firstDay) : null,
    lastReportDate: lastDay ? isoFromDayOfYear(seriesYear, lastDay) : null
  };
}

async function fetchTornadoYear(year) {
  const url = `${TORNADO_BASE_URL}${year}_torn.csv`;
  const response = await fetch(url, {
    headers: {
      "Accept": "text/csv, text/plain"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`SPC tornado dataset request failed for ${year}: ${response.status}`);
    error.statusCode = response.status;
    error.details = errorText;
    error.year = year;
    throw error;
  }

  const csvText = await response.text();
  return parseTornadoYear(csvText, year);
}

function getYearRange(startYear, endYear) {
  const range = [];
  const direction = startYear <= endYear ? 1 : -1;
  for (let year = startYear; direction > 0 ? year <= endYear : year >= endYear; year += direction) {
    range.push(year);
  }
  return range;
}

function computeEnsembleStats(yearlySeries, currentYear, comparisonYear) {
  const historical = yearlySeries.filter(
    (item) => item.year !== currentYear && item.year !== comparisonYear
  );

  const totals = historical.map((item) => item.totalReports).filter((value) => Number.isFinite(value));

  const average = totals.length
    ? totals.reduce((sum, value) => sum + value, 0) / totals.length
    : null;

  const max = totals.length ? Math.max(...totals) : null;
  const min = totals.length ? Math.min(...totals) : null;

  return {
    averageTotal: average,
    maxTotal: max,
    minTotal: min,
    count: totals.length
  };
}

function computeLatestPoint(series) {
  if (!Array.isArray(series) || !series.length) return null;
  return series[series.length - 1];
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
      headers: { "Allow": "GET, OPTIONS" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const now = new Date();
    const requestedCurrentYear = Number.parseInt(params.currentYear, 10);
    const endYear = Number.isFinite(requestedCurrentYear) ? requestedCurrentYear : now.getUTCFullYear();
    const requestedStartYear = Number.parseInt(params.startYear, 10);

    const startYear = Number.isFinite(requestedStartYear)
      ? Math.max(DEFAULT_START_YEAR, requestedStartYear)
      : DEFAULT_START_YEAR;

    if (endYear - startYear > MAX_REQUEST_SPAN) {
      const error = new Error(`Requested range is too wide. Maximum span is ${MAX_REQUEST_SPAN} years.`);
      error.statusCode = 400;
      throw error;
    }

    const yearRange = getYearRange(startYear, endYear);
    const seriesByYear = [];
    const errors = [];

    for (const year of yearRange) {
      try {
        const series = await fetchTornadoYear(year);
        if (series && series.series.length) {
          seriesByYear.push(series);
        }
      } catch (error) {
        if (error.statusCode === 404) {
          errors.push({ year, status: 404, message: "Dataset not yet available" });
        } else {
          errors.push({ year, status: error.statusCode || 500, message: error.message });
        }
      }
    }

    const calendarCurrentYear = endYear;
    const todayUtc = new Date();

    const hasCalendarYearSeries = seriesByYear.some((item) => item.year === calendarCurrentYear);

    if (!hasCalendarYearSeries && calendarCurrentYear === todayUtc.getUTCFullYear()) {
      try {
        const currentYearSeries = await buildCurrentYearSeriesFromDaily(calendarCurrentYear, todayUtc);
        if (currentYearSeries?.series?.length) {
          seriesByYear.push(currentYearSeries);
        }
      } catch (error) {
        errors.push({
          year: calendarCurrentYear,
          status: error.statusCode || 500,
          message: error.message
        });
      }
    }

    if (!seriesByYear.length) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "No tornado history datasets were available for the requested range.",
          range: { startYear, endYear },
          errors
        })
      };
    }

    seriesByYear.sort((a, b) => a.year - b.year);

    const availableYears = seriesByYear.map((item) => item.year);
    const currentYear = calendarCurrentYear;
    const comparisonYearCandidate = currentYear - 1;
    const comparisonYear = availableYears.includes(comparisonYearCandidate)
      ? comparisonYearCandidate
      : null;

    const currentSeries = seriesByYear.find((item) => item.year === currentYear)
      || seriesByYear.find((item) => item.year === availableYears[availableYears.length - 1]);
    const comparisonSeries = comparisonYear
      ? seriesByYear.find((item) => item.year === comparisonYear)
      : null;
    const ensembleStats = computeEnsembleStats(seriesByYear, currentYear, comparisonYear);
    const currentLatestPoint = computeLatestPoint(currentSeries?.series || []);
    const primarySource =
      currentSeries?.source ||
      (currentSeries ? `${TORNADO_BASE_URL}${currentSeries.year}_torn.csv` : null);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=3600, stale-while-revalidate=600",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        source: primarySource,
        startYear,
        endYear: calendarCurrentYear,
        currentYear,
        comparisonYear,
        currentLatestPoint,
        ensembleStats,
        years: seriesByYear,
        missingYears: errors,
        notes: "Data represents preliminary tornado reports as published by SPC. Counts are cumulative by day of year."
      })
    };
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: error.message || "Unexpected error fetching SPC tornado history."
      })
    };
  }
};
