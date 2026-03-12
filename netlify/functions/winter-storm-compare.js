const OPEN_METEO_BASE = "https://archive-api.open-meteo.com/v1/archive";

function buildUrl({ lat, lon, start, end }) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    start_date: start,
    end_date: end,
    hourly: "temperature_2m,snowfall",
    timezone: "UTC"
  });
  return `${OPEN_METEO_BASE}?${params.toString()}`;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function fetchLocationData({ location, start, end }) {
  const url = buildUrl({
    lat: location.lat,
    lon: location.lon,
    start,
    end
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed for ${location.name}.`);
  }

  const data = await response.json();
  if (!data.hourly || !data.hourly.time) {
    throw new Error(`No hourly data returned for ${location.name}.`);
  }

  return {
    location,
    time: data.hourly.time,
    temp: data.hourly.temperature_2m,
    snow: data.hourly.snowfall
  };
}

function aggregateLocationData({ time, temp, snow }, intervalHours) {
  const steps = [];
  let cumulativeSnow = 0;
  let stepTemp = [];
  let stepSnow = [];
  let stepTime = null;

  const results = {
    steps: [],
    totalSnowfallMm: 0,
    belowFreezingHours: 0,
    avgTempC: 0
  };

  let tempSum = 0;
  let tempCount = 0;

  for (let i = 0; i < time.length; i += 1) {
    const tempValue = temp[i];
    const snowValue = snow[i] ?? 0;
    stepTemp.push(tempValue);
    stepSnow.push(snowValue);
    if (!stepTime) stepTime = time[i];

    if (tempValue != null) {
      tempSum += tempValue;
      tempCount += 1;
      if (tempValue < 0) results.belowFreezingHours += 1;
    }

    if ((i + 1) % intervalHours === 0 || i === time.length - 1) {
      const tempAccumulator = stepTemp.reduce(
        (acc, value) => {
          if (value == null || Number.isNaN(value)) return acc;
          acc.sum += value;
          acc.count += 1;
          return acc;
        },
        { sum: 0, count: 0 }
      );
      const avgTemp = tempAccumulator.count ? tempAccumulator.sum / tempAccumulator.count : null;
      const sumSnow = stepSnow.reduce((sum, value) => sum + (value ?? 0), 0);
      cumulativeSnow += sumSnow;
      results.steps.push({
        time: stepTime,
        avgTempC: avgTemp,
        snowfallStep: sumSnow,
        snowfallCumulative: cumulativeSnow
      });
      stepTemp = [];
      stepSnow = [];
      stepTime = null;
    }
  }

  results.totalSnowfallMm = cumulativeSnow;
  results.avgTempC = tempCount ? tempSum / tempCount : null;

  return results;
}

function buildEventSteps(locationsData) {
  if (!locationsData.length) return [];
  const stepsCount = locationsData[0].steps.length;
  const steps = [];

  for (let i = 0; i < stepsCount; i += 1) {
    const time = locationsData[0].steps[i]?.time;
    const tempC = [];
    const snowfallCumulative = [];
    let avgTempSum = 0;
    let avgSnowSum = 0;

    locationsData.forEach((location) => {
      const step = location.steps[i];
      if (step) {
        tempC.push(step.avgTempC);
        snowfallCumulative.push(step.snowfallCumulative);
        avgTempSum += step.avgTempC ?? 0;
        avgSnowSum += step.snowfallCumulative ?? 0;
      } else {
        tempC.push(null);
        snowfallCumulative.push(null);
      }
    });

    steps.push({
      time,
      tempC,
      snowfallCumulative,
      avgTempC: avgTempSum / locationsData.length,
      avgSnowfallCumulative: avgSnowSum / locationsData.length
    });
  }

  return steps;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return {
      statusCode: 400,
      body: "Invalid JSON payload."
    };
  }

  const { start, end, intervalHours = 6, locations = [] } = payload;

  if (!start || !end || !Array.isArray(locations) || !locations.length) {
    return {
      statusCode: 400,
      body: "Missing start/end dates or location list."
    };
  }

  const interval = Math.max(1, Number(intervalHours));

  try {
    const batches = chunkArray(locations, 5);
    const results = [];

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((location) => fetchLocationData({ location, start, end }))
      );
      results.push(...batchResults);
    }

    const locationSummaries = results.map((entry) => {
      const aggregates = aggregateLocationData(entry, interval);
      return {
        id: entry.location.id,
        name: entry.location.name,
        lat: entry.location.lat,
        lon: entry.location.lon,
        totalSnowfallMm: aggregates.totalSnowfallMm,
        belowFreezingHours: aggregates.belowFreezingHours,
        avgTempC: aggregates.avgTempC,
        steps: aggregates.steps
      };
    });

    const steps = buildEventSteps(locationSummaries);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        start,
        end,
        steps,
        locationSummaries
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: error.message || "Failed to fetch weather data."
    };
  }
};
