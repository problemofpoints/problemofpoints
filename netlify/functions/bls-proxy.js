const API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

function parseSeriesIds(event) {
  const multi = event.multiValueQueryStringParameters;
  const single = event.queryStringParameters || {};
  const ids = new Set();

  if (multi && Array.isArray(multi.seriesId)) {
    multi.seriesId.forEach((value) => {
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => ids.add(part));
    });
  } else if (single.seriesId) {
    single.seriesId
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => ids.add(part));
  }

  return Array.from(ids);
}

async function fetchFromBls(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`Unexpected response from BLS API: ${text || error.message}`);
  }

  if (json.status !== "REQUEST_SUCCEEDED") {
    const message = json.message && json.message.length ? json.message.join(" ") : "BLS API error";
    const err = new Error(message);
    err.statusCode = 502;
    throw err;
  }

  return json;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS"
      },
      body: ""
    };
  }

  if (!["GET", "POST"].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: { "Allow": "GET, POST, OPTIONS" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    let seriesIds = [];
    let startYear;
    let endYear;

    let latest;

    if (event.httpMethod === "POST" && event.body) {
      const payload = JSON.parse(event.body);
      seriesIds = Array.isArray(payload.seriesId) ? payload.seriesId : [];
      startYear = payload.startYear;
      endYear = payload.endYear;
      latest = payload.latest;
    } else {
      seriesIds = parseSeriesIds(event);
      const params = event.queryStringParameters || {};
      startYear = params.startYear;
      endYear = params.endYear;
      latest = params.latest;
    }

    if (!seriesIds.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "At least one seriesId is required" })
      };
    }

    const currentYear = new Date().getFullYear();
    const payload = {
      seriesid: seriesIds
    };

    if (latest) {
      payload.latest = Math.max(1, Number(latest));
    } else {
      payload.startyear = String(startYear || 2000);
      payload.endyear = String(endYear || currentYear);
    }

    const apiKey = process.env.BLS_API_KEY;
    if (apiKey) {
      payload.registrationKey = apiKey;
    }

    let mergedSeries = [];
    const maxSpan = Number(process.env.BLS_YEAR_SPAN || 10);

    if (payload.latest && !payload.startyear && !payload.endyear) {
      const blsResponse = await fetchFromBls(payload);
      mergedSeries = blsResponse?.Results?.series || [];

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          fetchedAt: new Date().toISOString(),
          source: API_URL,
          series: mergedSeries,
          responseTime: blsResponse?.responseTime,
          message: blsResponse?.message || []
        })
      };
    }

    const startYearNum = Number(payload.startyear);
    const endYearNum = Number(payload.endyear);

    const combined = new Map();
    for (let chunkStart = startYearNum; chunkStart <= endYearNum; chunkStart += maxSpan) {
      const chunkEnd = Math.min(chunkStart + maxSpan - 1, endYearNum);
      const chunkPayload = {
        seriesid: seriesIds,
        startyear: String(chunkStart),
        endyear: String(chunkEnd)
      };
      if (payload.registrationKey) {
        chunkPayload.registrationKey = payload.registrationKey;
      }

      const chunkResponse = await fetchFromBls(chunkPayload);
      const chunkSeries = chunkResponse?.Results?.series || [];

      chunkSeries.forEach((series) => {
        if (!combined.has(series.seriesID)) {
          combined.set(series.seriesID, {
            ...series,
            data: []
          });
        }

        const target = combined.get(series.seriesID);
        const existingKeys = new Set(target.data.map((item) => `${item.year}-${item.period}`));

        (series.data || []).forEach((item) => {
          const key = `${item.year}-${item.period}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            target.data.push(item);
          }
        });
      });
    }

    mergedSeries = Array.from(combined.values()).map((series) => {
      series.data.sort((a, b) => {
        if (a.year !== b.year) {
          return Number(b.year) - Number(a.year);
        }
        return (b.period || "").localeCompare(a.period || "");
      });
      return series;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        source: API_URL,
        series: mergedSeries,
        responseTime: null,
        message: []
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
      body: JSON.stringify({ error: error.message || "Unexpected error contacting BLS API" })
    };
  }
};
