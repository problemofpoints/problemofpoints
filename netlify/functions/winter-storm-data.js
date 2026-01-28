const ARCHIVE_API = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_API = "https://api.open-meteo.com/v1/forecast";

const HOURLY_VARS = "temperature_2m,snowfall";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 120;
const REQUEST_TIMEOUT_MS = 8000;

const GRID_LOCATIONS = [
  { name: "Dallas", state: "TX", lat: 32.78, lon: -96.80 },
  { name: "Houston", state: "TX", lat: 29.76, lon: -95.37 },
  { name: "San Antonio", state: "TX", lat: 29.42, lon: -98.49 },
  { name: "Austin", state: "TX", lat: 30.27, lon: -97.74 },
  { name: "Lubbock", state: "TX", lat: 33.58, lon: -101.85 },
  { name: "Amarillo", state: "TX", lat: 35.22, lon: -101.83 },
  { name: "Midland", state: "TX", lat: 31.99, lon: -102.08 },
  { name: "Oklahoma City", state: "OK", lat: 35.47, lon: -97.52 },
  { name: "Tulsa", state: "OK", lat: 36.15, lon: -95.99 },
  { name: "Wichita", state: "KS", lat: 37.69, lon: -97.34 },
  { name: "Little Rock", state: "AR", lat: 34.75, lon: -92.29 },
  { name: "New Orleans", state: "LA", lat: 29.95, lon: -90.07 },
  { name: "Jackson", state: "MS", lat: 32.30, lon: -90.18 },
  { name: "Birmingham", state: "AL", lat: 33.52, lon: -86.81 },
  { name: "Mobile", state: "AL", lat: 30.69, lon: -88.04 },
  { name: "Memphis", state: "TN", lat: 35.15, lon: -90.05 },
  { name: "Nashville", state: "TN", lat: 36.16, lon: -86.78 },
  { name: "Atlanta", state: "GA", lat: 33.75, lon: -84.39 },
  { name: "Charlotte", state: "NC", lat: 35.23, lon: -80.84 },
  { name: "Raleigh", state: "NC", lat: 35.78, lon: -78.64 },
  { name: "Columbia", state: "SC", lat: 34.00, lon: -81.03 },
  { name: "Jacksonville", state: "FL", lat: 30.33, lon: -81.66 },
  { name: "Washington", state: "DC", lat: 38.91, lon: -77.04 },
  { name: "Richmond", state: "VA", lat: 37.54, lon: -77.44 },
  { name: "Philadelphia", state: "PA", lat: 39.95, lon: -75.17 },
  { name: "New York City", state: "NY", lat: 40.71, lon: -74.01 },
  { name: "Baltimore", state: "MD", lat: 39.29, lon: -76.61 },
  { name: "Pittsburgh", state: "PA", lat: 40.44, lon: -80.00 },
  { name: "Boston", state: "MA", lat: 42.36, lon: -71.06 },
  { name: "Hartford", state: "CT", lat: 41.76, lon: -72.68 },
  { name: "Portland", state: "ME", lat: 43.66, lon: -70.26 },
  { name: "Burlington", state: "VT", lat: 44.48, lon: -73.21 },
  { name: "Albany", state: "NY", lat: 42.65, lon: -73.76 },
  { name: "Buffalo", state: "NY", lat: 42.89, lon: -78.88 },
  { name: "Chicago", state: "IL", lat: 41.88, lon: -87.63 },
  { name: "Springfield", state: "IL", lat: 39.78, lon: -89.65 },
  { name: "Indianapolis", state: "IN", lat: 39.77, lon: -86.16 },
  { name: "Columbus", state: "OH", lat: 39.96, lon: -83.00 },
  { name: "Detroit", state: "MI", lat: 42.33, lon: -83.05 },
  { name: "Cleveland", state: "OH", lat: 41.50, lon: -81.69 },
  { name: "Milwaukee", state: "WI", lat: 43.04, lon: -87.91 },
  { name: "Minneapolis", state: "MN", lat: 44.98, lon: -93.27 },
  { name: "Des Moines", state: "IA", lat: 41.59, lon: -93.62 },
  { name: "Omaha", state: "NE", lat: 41.26, lon: -95.94 },
  { name: "Kansas City", state: "MO", lat: 39.10, lon: -94.58 },
  { name: "St. Louis", state: "MO", lat: 38.63, lon: -90.20 },
  { name: "Denver", state: "CO", lat: 39.74, lon: -104.99 },
  { name: "Albuquerque", state: "NM", lat: 35.08, lon: -106.65 },
  { name: "Salt Lake City", state: "UT", lat: 40.76, lon: -111.89 },
  { name: "Boise", state: "ID", lat: 43.62, lon: -116.21 },
  { name: "Cheyenne", state: "WY", lat: 41.14, lon: -104.82 },
  { name: "Fargo", state: "ND", lat: 46.88, lon: -96.79 },
  { name: "Rapid City", state: "SD", lat: 44.08, lon: -103.23 },
  { name: "Billings", state: "MT", lat: 45.78, lon: -108.50 },
  { name: "Seattle", state: "WA", lat: 47.61, lon: -122.33 },
  { name: "Portland", state: "OR", lat: 45.52, lon: -122.68 },
  { name: "San Francisco", state: "CA", lat: 37.77, lon: -122.42 },
  { name: "Los Angeles", state: "CA", lat: 34.05, lon: -118.24 },
  { name: "Phoenix", state: "AZ", lat: 33.45, lon: -112.07 },
  { name: "Las Vegas", state: "NV", lat: 36.17, lon: -115.14 }
];

function isDateRecent(dateStr) {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = now.getTime() - target.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < 7;
}

function validateDateParam(value) {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchLocationData(loc, startDate, endDate, apiUrl) {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    start_date: startDate,
    end_date: endDate,
    hourly: HOURLY_VARS,
    temperature_unit: "fahrenheit",
    timezone: "America/Chicago"
  });

  const url = `${apiUrl}?${params.toString()}`;
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Open-Meteo ${response.status} for ${loc.name}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    name: loc.name,
    state: loc.state,
    lat: data.latitude,
    lon: data.longitude,
    hourly: {
      time: data.hourly.time,
      temperature: data.hourly.temperature_2m,
      snowfall: (data.hourly.snowfall || []).map((v) => (v != null ? +(v * 0.3937).toFixed(3) : 0))
    }
  };
}

async function fetchAllLocations(startDate, endDate) {
  const useRecent = isDateRecent(endDate);
  const apiUrl = useRecent ? FORECAST_API : ARCHIVE_API;
  const results = [];
  const errors = [];

  for (let i = 0; i < GRID_LOCATIONS.length; i += BATCH_SIZE) {
    const batch = GRID_LOCATIONS.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((loc) => fetchLocationData(loc, startDate, endDate, apiUrl))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        errors.push(result.reason.message);
      }
    }

    if (i + BATCH_SIZE < GRID_LOCATIONS.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { results, errors, apiUsed: useRecent ? "forecast" : "archive" };
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
      headers: { Allow: "GET, OPTIONS" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const params = event.queryStringParameters || {};
  const startDate = validateDateParam(params.start_date);
  const endDate = validateDateParam(params.end_date);

  if (!startDate || !endDate) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: "start_date and end_date query parameters are required (YYYY-MM-DD format)."
      })
    };
  }

  if (startDate > endDate) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "start_date must be before end_date." })
    };
  }

  try {
    const { results, errors, apiUsed } = await fetchAllLocations(startDate, endDate);

    if (results.length === 0) {
      return {
        statusCode: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          error: "Failed to retrieve weather data for any location.",
          details: errors.slice(0, 5)
        })
      };
    }

    const cacheMaxAge = isDateRecent(endDate) ? 3600 : 86400;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${cacheMaxAge}`,
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        startDate,
        endDate,
        apiUsed,
        locationCount: results.length,
        failedCount: errors.length,
        locations: results
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error: error.message || "Unexpected error fetching winter storm data."
      })
    };
  }
};
