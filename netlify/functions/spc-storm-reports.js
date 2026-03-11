const REPORTS_BASE_URL = "https://www.spc.noaa.gov/climo/reports/";

const SECTION_HEADERS = {
  tornado: /^Time\s*,\s*F_Scale/i,
  wind: /^Time\s*,\s*Speed/i,
  hail: /^Time\s*,\s*Size/i
};

function pad(number, length = 2) {
  return String(number).padStart(length, "0");
}

function extractNumeric(value) {
  if (!value) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  return Number.parseFloat(match[0]);
}

function safeParseFloat(value) {
  if (value == null || value === "") return null;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

function toStormReportsId(date, index, type) {
  return `${date}-${type}-${index}`;
}

function toSpcFilename(date) {
  const yy = pad(date.getUTCFullYear() % 100);
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const base = `${yy}${mm}${dd}`;
  return {
    base,
    candidates: [`${base}_rpts_filtered.csv`, `${base}_rpts.csv`]
  };
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
  return result.map((value) => value.trim());
}

function parseTimeToDisplay(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  const padded = digits.padStart(4, "0");
  const hours = padded.slice(0, 2);
  const minutes = padded.slice(2, 4);
  return `${hours}:${minutes}`;
}

function parseStormReports(csvText, isoDate) {
  const lines = csvText.split(/\r?\n/);
  const reports = {
    tornado: [],
    wind: [],
    hail: []
  };

  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (SECTION_HEADERS.tornado.test(line)) {
      currentSection = "tornado";
      continue;
    }
    if (SECTION_HEADERS.wind.test(line)) {
      currentSection = "wind";
      continue;
    }
    if (SECTION_HEADERS.hail.test(line)) {
      currentSection = "hail";
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const columns = splitCsvLine(line);
    if (columns.length < 7) {
      continue;
    }

    if (currentSection === "tornado") {
      const [timeRaw, scaleRaw, locationRaw, countyRaw, stateRaw, latRaw, lonRaw, ...commentParts] = columns;
      const lat = safeParseFloat(latRaw);
      const lon = safeParseFloat(lonRaw);
      const fScaleNumeric = extractNumeric(scaleRaw);

      reports.tornado.push({
        id: toStormReportsId(isoDate, reports.tornado.length, "tor"),
        type: "tornado",
        time: parseTimeToDisplay(timeRaw),
        rawTime: timeRaw || null,
        scale: scaleRaw || null,
        efRating: fScaleNumeric != null ? fScaleNumeric : null,
        location: locationRaw || null,
        county: countyRaw || null,
        state: stateRaw || null,
        latitude: lat,
        longitude: lon,
        comments: commentParts.length ? commentParts.join(", ").trim() || null : null
      });
    } else if (currentSection === "wind") {
      const [timeRaw, speedRaw, locationRaw, countyRaw, stateRaw, latRaw, lonRaw, ...commentParts] = columns;
      const lat = safeParseFloat(latRaw);
      const lon = safeParseFloat(lonRaw);
      const speed = extractNumeric(speedRaw);

      reports.wind.push({
        id: toStormReportsId(isoDate, reports.wind.length, "wind"),
        type: "wind",
        time: parseTimeToDisplay(timeRaw),
        rawTime: timeRaw || null,
        speedMph: speed != null ? speed : null,
        location: locationRaw || null,
        county: countyRaw || null,
        state: stateRaw || null,
        latitude: lat,
        longitude: lon,
        comments: commentParts.length ? commentParts.join(", ").trim() || null : null
      });
    } else if (currentSection === "hail") {
      const [timeRaw, sizeRaw, locationRaw, countyRaw, stateRaw, latRaw, lonRaw, ...commentParts] = columns;
      const lat = safeParseFloat(latRaw);
      const lon = safeParseFloat(lonRaw);
      const sizeRawNumeric = extractNumeric(sizeRaw);
      const sizeInches = sizeRawNumeric != null ? sizeRawNumeric / 100 : null;

      reports.hail.push({
        id: toStormReportsId(isoDate, reports.hail.length, "hail"),
        type: "hail",
        time: parseTimeToDisplay(timeRaw),
        rawTime: timeRaw || null,
        sizeInches,
        location: locationRaw || null,
        county: countyRaw || null,
        state: stateRaw || null,
        latitude: lat,
        longitude: lon,
        comments: commentParts.length ? commentParts.join(", ").trim() || null : null
      });
    }
  }

  return reports;
}

async function fetchReportCsvForDate(date) {
  const { candidates } = toSpcFilename(date);

  for (const candidate of candidates) {
    const url = `${REPORTS_BASE_URL}${candidate}`;
    const response = await fetch(url, {
      headers: {
        "Accept": "text/csv, text/plain"
      }
    });

    if (response.ok) {
      const text = await response.text();
      const trimmed = text.trim();
      if (trimmed) {
        return { csvText: text, sourceUrl: url };
      }
    } else if (response.status !== 404) {
      const errorText = await response.text();
      const err = new Error(`SPC request failed for ${candidate}: ${response.status}`);
      err.statusCode = response.status;
      err.details = errorText;
      throw err;
    }
  }

  return null;
}

function buildSummary(reports) {
  return {
    tornadoes: reports.tornado.length,
    wind: reports.wind.length,
    hail: reports.hail.length
  };
}

function resolveDateParameter(event) {
  const params = event.queryStringParameters || {};
  const { date } = params;

  if (date) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      const error = new Error("Invalid date parameter. Use ISO format (YYYY-MM-DD).");
      error.statusCode = 400;
      throw error;
    }
    return parsed;
  }

  return new Date();
}

function sanitizeReports(reports) {
  const sanitized = {};
  Object.entries(reports).forEach(([key, values]) => {
    sanitized[key] = values.filter((entry) => {
      return (
        entry &&
        entry.latitude != null &&
        entry.longitude != null &&
        Number.isFinite(entry.latitude) &&
        Number.isFinite(entry.longitude)
      );
    });
  });
  return sanitized;
}

function subtractDays(date, days) {
  const clone = new Date(date.getTime());
  clone.setUTCDate(clone.getUTCDate() - days);
  return clone;
}

function toUtcDate(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
    const requestedDate = resolveDateParameter(event);
    const targetDate = toUtcDate(requestedDate);
    const todayUtc = toUtcDate(new Date());
    const shouldAttemptFallback = targetDate.getTime() === todayUtc.getTime();

    const fallbackDate = subtractDays(targetDate, 1);
    const tries = shouldAttemptFallback ? [targetDate, fallbackDate] : [targetDate];
    let result = null;
    let usedDate = null;

    for (const dateAttempt of tries) {
      const fetched = await fetchReportCsvForDate(dateAttempt);
      if (fetched) {
        result = fetched;
        usedDate = dateAttempt;
        break;
      }
    }

    if (!result) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "No SPC storm reports were found for the requested date or the previous day.",
          requestedDate: formatIsoDate(targetDate)
        })
      };
    }

    const isoDate = formatIsoDate(usedDate);
    const parsedReports = parseStormReports(result.csvText, isoDate);
    const totals = buildSummary(parsedReports);
    const reportsWithCoords = sanitizeReports(parsedReports);
    const mappedCounts = buildSummary(reportsWithCoords);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        date: isoDate,
        summary: totals,
        mappedCounts,
        reports: reportsWithCoords,
        source: result.sourceUrl,
        requestedDate: formatIsoDate(targetDate)
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
        error: error.message || "Unexpected error fetching SPC storm reports."
      })
    };
  }
};
