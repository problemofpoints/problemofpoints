const TORNADO_BASE_URL = "https://www.spc.noaa.gov/wcm/data/";
const REPORTS_BASE_URL = "https://www.spc.noaa.gov/climo/reports/";
const DEFAULT_START_YEAR = 2000;
const MAX_REQUEST_SPAN = 40;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CURRENT_YEAR_CACHE = globalThis.__swtTornadoCurrentYearCache || new Map();
globalThis.__swtTornadoCurrentYearCache = CURRENT_YEAR_CACHE;

const STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  PR: "Puerto Rico",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming"
};

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
  if (!csvText) return { total: 0, byState: {} };
  const lines = csvText.split(/\r?\n/);
  let inTornadoSection = false;
  let total = 0;
  const byState = new Map();
  let tornadoHeader = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (SECTION_HEADERS.tornado.test(line)) {
      inTornadoSection = true;
      tornadoHeader = splitCsvLine(line).map((col) => col.toLowerCase());
      continue;
    }
    if (SECTION_HEADERS.wind.test(line) || SECTION_HEADERS.hail.test(line)) {
      if (inTornadoSection) break;
      continue;
    }

    if (inTornadoSection) {
      const parts = splitCsvLine(line);
      if (!tornadoHeader.length) {
        total += 1;
        continue;
      }
      const stateIndex = tornadoHeader.indexOf("state");
      const state = stateIndex >= 0 ? (parts[stateIndex] || "").trim().toUpperCase() : null;
      total += 1;
      if (state) {
        byState.set(state, (byState.get(state) || 0) + 1);
      }
    }
  }

  return {
    total,
    byState: Object.fromEntries(byState)
  };
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
  return { total: 0, byState: {} };
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
  const seriesByState = new Map();
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
        return { total: 0, byState: {} };
      }
      throw error;
    }
  });

  datesToFetch.forEach((date, idx) => {
    const { total, byState } = counts[idx] || { total: 0, byState: {} };
    const dayOfYear = dayOfYearFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    cumulative += total;
    series.push({
      dayOfYear,
      date: formatIsoDate(date),
      cumulative,
      daily: total,
      injuries: null,
      fatalities: null
    });

    Object.entries(byState || {}).forEach(([state, dailyCount]) => {
      if (!seriesByState.has(state)) {
        seriesByState.set(state, { cumulative: 0, series: [] });
      }
      const bucket = seriesByState.get(state);
      bucket.cumulative += dailyCount;
      bucket.series.push({
        dayOfYear,
        date: formatIsoDate(date),
        cumulative: bucket.cumulative,
        daily: dailyCount,
        injuries: null,
        fatalities: null
      });
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
    source: `${REPORTS_BASE_URL}YYMMDD_rpts.csv`,
    byState: Object.fromEntries(
      Array.from(seriesByState.entries()).map(([state, { series: stateSeries, cumulative: totalReports }]) => [
        state,
        {
          state,
          series: stateSeries,
          totalReports,
          injuries: null,
          fatalities: null,
          firstReportDate: stateSeries.length ? stateSeries[0].date : null,
          lastReportDate: stateSeries.length ? stateSeries[stateSeries.length - 1].date : null,
          source: `${REPORTS_BASE_URL}YYMMDD_rpts.csv`
        }
      ])
    )
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

function buildSeriesFromDailyMap(dailyMap, year) {
  const sortedDays = Array.from(dailyMap.keys()).sort((a, b) => a - b);
  let cumulative = 0;
  let totalInjuries = 0;
  let totalFatalities = 0;

  const series = sortedDays.map((dayKey) => {
    const { count, injuries, fatalities } = dailyMap.get(dayKey);
    cumulative += count;
    totalInjuries += injuries;
    totalFatalities += fatalities;
    return {
      dayOfYear: dayKey,
      date: isoFromDayOfYear(year, dayKey),
      cumulative,
      daily: count,
      injuries,
      fatalities
    };
  });

  return {
    series,
    totalReports: cumulative,
    injuries: totalInjuries,
    fatalities: totalFatalities,
    firstReportDate: sortedDays.length ? isoFromDayOfYear(year, sortedDays[0]) : null,
    lastReportDate: sortedDays.length ? isoFromDayOfYear(year, sortedDays[sortedDays.length - 1]) : null
  };
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
  const stateIndex = indexByName.get("st");

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
    const state = stateIndex != null ? (parts[stateIndex] || "").trim().toUpperCase() : null;

    entries.push({
      year,
      month,
      day,
      dayOfYear: dayKey,
      isoDate,
      injuries: injuryIndex != null ? parseInteger(parts[injuryIndex]) : 0,
      fatalities: fatalityIndex != null ? parseInteger(parts[fatalityIndex]) : 0,
      state
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
  const dailyByState = new Map();
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

    if (entry.state) {
      if (!dailyByState.has(entry.state)) {
        dailyByState.set(entry.state, new Map());
      }
      const stateMap = dailyByState.get(entry.state);
      if (!stateMap.has(entry.dayOfYear)) {
        stateMap.set(entry.dayOfYear, { count: 0, injuries: 0, fatalities: 0 });
      }
      const stateBucket = stateMap.get(entry.dayOfYear);
      stateBucket.count += 1;
      stateBucket.injuries += entry.injuries;
      stateBucket.fatalities += entry.fatalities;
    }
  }

  const seriesYear = expectedYear || entries[0].year;
  const globalSeries = buildSeriesFromDailyMap(daily, seriesYear);
  const byState = Object.fromEntries(
    Array.from(dailyByState.entries()).map(([state, stateDaily]) => [
      state,
      {
        state,
        ...buildSeriesFromDailyMap(stateDaily, seriesYear),
        source: `${TORNADO_BASE_URL}${seriesYear}_torn.csv`
      }
    ])
  );

  return {
    year: seriesYear,
    ...globalSeries,
    byState,
    source: `${TORNADO_BASE_URL}${seriesYear}_torn.csv`
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

function extendSeriesToDate(series, targetDate) {
  if (!Array.isArray(series) || !series.length) return series;
  const targetYear = targetDate.getUTCFullYear();
  const targetDay = dayOfYearFromParts(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate()
  );
  const lastPoint = series[series.length - 1];
  if (lastPoint.dayOfYear >= targetDay || !lastPoint.date.startsWith(String(targetYear))) {
    return series;
  }
  const extended = [...series];
  extended.push({
    dayOfYear: targetDay,
    date: formatIsoDate(targetDate),
    cumulative: lastPoint.cumulative,
    daily: 0,
    injuries: lastPoint.injuries ?? null,
    fatalities: lastPoint.fatalities ?? null
  });
  return extended;
}

function normalizeStateCode(code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  if (normalized === "ALL") return null;
  return normalized;
}

function computeAvailableStates(seriesByYear) {
  const stateSet = new Set();
  seriesByYear.forEach((entry) => {
    Object.keys(entry.byState || {}).forEach((code) => stateSet.add(code));
  });
  return Array.from(stateSet).sort();
}

function selectSeriesForState(seriesByYear, stateCode) {
  const normalized = normalizeStateCode(stateCode);
  if (!normalized) {
    return {
      selectedSeries: seriesByYear.map(({ byState, ...rest }) => rest),
      stateLabel: "All States",
      stateCode: null
    };
  }

  const selectedSeries = seriesByYear
    .map((entry) => {
      const stateEntry = entry.byState?.[normalized];
      if (!stateEntry || !stateEntry.series?.length) {
        return null;
      }
      return {
        ...stateEntry,
        year: entry.year
      };
    })
    .filter(Boolean);

  return {
    selectedSeries,
    stateLabel: STATE_NAMES[normalized] || normalized,
    stateCode: normalized
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
    const requestedState = params.state ? params.state.trim().toUpperCase() : null;

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
    const availableStates = computeAvailableStates(seriesByYear);
    if (requestedState && requestedState !== "ALL") {
      if (STATE_NAMES[requestedState] == null && !availableStates.includes(requestedState)) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          body: JSON.stringify({ error: `Unsupported state code: ${requestedState}` })
        };
      }
    }

    const { selectedSeries, stateLabel, stateCode } = selectSeriesForState(seriesByYear, requestedState);
    if (!selectedSeries.length) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "No tornado history datasets were available for the requested state and range.",
          range: { startYear, endYear },
          state: requestedState || "ALL"
        })
      };
    }

    const todayUtc = new Date();
    const normalizedSeries = selectedSeries.map((entry) => {
      if (entry.year === calendarCurrentYear) {
        return {
          ...entry,
          series: extendSeriesToDate(entry.series, todayUtc)
        };
      }
      return entry;
    });

    const availableYears = normalizedSeries.map((item) => item.year);
    const currentYear = calendarCurrentYear;
    const comparisonYearCandidate = currentYear - 1;
    const comparisonYear = availableYears.includes(comparisonYearCandidate)
      ? comparisonYearCandidate
      : null;

    const currentSeries = normalizedSeries.find((item) => item.year === currentYear)
      || normalizedSeries.find((item) => item.year === availableYears[availableYears.length - 1]);
    const comparisonSeries = comparisonYear
      ? normalizedSeries.find((item) => item.year === comparisonYear)
      : null;
    const ensembleStats = computeEnsembleStats(normalizedSeries, currentYear, comparisonYear);
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
        years: normalizedSeries,
        missingYears: errors,
        notes: "Data represents preliminary tornado reports as published by SPC. Counts are cumulative by day of year.",
        stateCode,
        stateLabel,
        availableStates: availableStates.map((code) => ({
          code,
          name: STATE_NAMES[code] || code
        }))
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
