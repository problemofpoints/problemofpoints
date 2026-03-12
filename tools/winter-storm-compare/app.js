const PRESET_EVENTS = [
    {
      label: "Custom range",
      start: "2024-01-10",
      end: "2024-01-18"
    },
    {
      label: "Uri (Feb 2021)",
      start: "2021-02-10",
      end: "2021-02-19"
    },
    {
      label: "Feb 2010", 
      start: "2010-02-04",
      end: "2010-02-14"
    },
    {
      label: "Groundhog (Feb 2011)",
      start: "2011-01-28",
      end: "2011-02-06"
    },
    {
      label: "Jan 2024",
      start: "2024-01-11",
      end: "2024-01-21"
    },
    {
      label: "Fern (Jan 2026)",
      start: "2026-01-08",
      end: "2026-01-18",
      dataStart: "2024-01-11",
      dataEnd: "2024-01-21",
      note: "Fern 2026 uses a Jan 2024 analog until real data is available."
    }
  ];

  const LOCATIONS = [
    { id: "sea", name: "Seattle, WA", lat: 47.6062, lon: -122.3321 },
    { id: "por", name: "Portland, OR", lat: 45.5152, lon: -122.6784 },
    { id: "boi", name: "Boise, ID", lat: 43.6150, lon: -116.2023 },
    { id: "den", name: "Denver, CO", lat: 39.7392, lon: -104.9903 },
    { id: "slc", name: "Salt Lake City, UT", lat: 40.7608, lon: -111.8910 },
    { id: "phi", name: "Philadelphia, PA", lat: 39.9526, lon: -75.1652 },
    { id: "chi", name: "Chicago, IL", lat: 41.8781, lon: -87.6298 },
    { id: "min", name: "Minneapolis, MN", lat: 44.9778, lon: -93.2650 },
    { id: "det", name: "Detroit, MI", lat: 42.3314, lon: -83.0458 },
    { id: "cle", name: "Cleveland, OH", lat: 41.4993, lon: -81.6944 },
    { id: "atl", name: "Atlanta, GA", lat: 33.7490, lon: -84.3880 },
    { id: "dal", name: "Dallas, TX", lat: 32.7767, lon: -96.7970 },
    { id: "hou", name: "Houston, TX", lat: 29.7604, lon: -95.3698 },
    { id: "aus", name: "Austin, TX", lat: 30.2672, lon: -97.7431 },
    { id: "kc", name: "Kansas City, MO", lat: 39.0997, lon: -94.5786 },
    { id: "stl", name: "St. Louis, MO", lat: 38.6270, lon: -90.1994 },
    { id: "nash", name: "Nashville, TN", lat: 36.1627, lon: -86.7816 },
    { id: "dc", name: "Washington, DC", lat: 38.9072, lon: -77.0369 },
    { id: "bos", name: "Boston, MA", lat: 42.3601, lon: -71.0589 },
    { id: "nyc", name: "New York, NY", lat: 40.7128, lon: -74.0060 },
    { id: "buf", name: "Buffalo, NY", lat: 42.8864, lon: -78.8784 },
    { id: "oma", name: "Omaha, NE", lat: 41.2565, lon: -95.9345 },
    { id: "phx", name: "Phoenix, AZ", lat: 33.4484, lon: -112.0740 },
    { id: "la", name: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 }
  ];

  const eventState = {
    A: null,
    B: null
  };

  const charts = {
    temp: null,
    snow: null
  };

  const mapState = {
    temp: { A: null, B: null },
    snow: { A: null, B: null }
  };

  const timelines = {
    temp: { progress: 0, timer: null },
    snow: { progress: 0, timer: null }
  };

  const statusEl = document.getElementById("data-status");
  const loadButton = document.getElementById("load-data");

  function formatNumber(value, digits = 1) {
    if (value == null || Number.isNaN(value)) return "--";
    return value.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function formatDateLabel(value) {
    if (!value) return "--";
    const date = new Date(value);
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
  }

  function buildPresetSelect(selectEl, startInput, endInput, noteEl) {
    PRESET_EVENTS.forEach((preset, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = preset.label;
      selectEl.appendChild(option);
    });

    const applyPreset = () => {
      const preset = PRESET_EVENTS[Number(selectEl.value)];
      startInput.value = preset.start;
      endInput.value = preset.end;
      noteEl.textContent = preset.note || "";
    };

    selectEl.addEventListener("change", applyPreset);
    applyPreset();
  }

  function initMaps() {
    mapState.temp.A = createMap("temp-map-a");
    mapState.temp.B = createMap("temp-map-b");
    mapState.snow.A = createMap("snow-map-a");
    mapState.snow.B = createMap("snow-map-b");
  }

  function createMap(containerId) {
    const map = L.map(containerId, { scrollWheelZoom: false }).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO"
    }).addTo(map);

    const markers = new Map();
    LOCATIONS.forEach((location) => {
      const marker = L.circleMarker([location.lat, location.lon], {
        radius: 8,
        color: "rgba(15, 23, 42, 0.4)",
        weight: 2,
        fillColor: "rgba(59, 130, 246, 0.6)",
        fillOpacity: 0.8
      }).addTo(map);
      marker.bindTooltip(`${location.name}`);
      markers.set(location.id, marker);
    });

    return { map, markers };
  }

  function tempColor(value) {
    if (value == null) return "rgba(148, 163, 184, 0.5)";
    const clamped = Math.max(-20, Math.min(20, value));
    const ratio = (clamped + 20) / 40;
    const r = Math.round(59 + ratio * 196);
    const g = Math.round(130 + ratio * 40);
    const b = Math.round(246 - ratio * 180);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function snowColor(value) {
    if (value == null) return "rgba(148, 163, 184, 0.5)";
    const clamped = Math.max(0, Math.min(200, value));
    const ratio = clamped / 200;
    const r = Math.round(227 - ratio * 120);
    const g = Math.round(243 - ratio * 90);
    const b = Math.round(252 - ratio * 40);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function updateMapMarkers(metric, eventKey, index, progress) {
    const eventData = eventState[eventKey];
    if (!eventData) return;
    const mapEntry = mapState[metric][eventKey];
    if (!mapEntry) return;

    const stepIndex = Math.min(index, eventData.steps.length - 1);
    const step = eventData.steps[stepIndex];
    const values = metric === "temp" ? step.tempC : step.snowfallCumulative;

    LOCATIONS.forEach((location, idx) => {
      const marker = mapEntry.markers.get(location.id);
      if (!marker) return;
      const value = values[idx];
      const color = metric === "temp" ? tempColor(value) : snowColor(value);
      const freezingHours = eventData.locationSummaries[idx]?.belowFreezingHours ?? 0;
      const radius = 5 + Math.min(6, (freezingHours / 12) * 2);
      marker.setStyle({
        fillColor: color,
        color: "rgba(15, 23, 42, 0.35)",
        weight: 2,
        radius
      });
      const detail = metric === "temp"
        ? `${formatNumber(value, 1)}°C`
        : `${formatNumber(value, 1)} mm`;
      marker.setTooltipContent(`
        <strong>${location.name}</strong><br>
        ${detail}<br>
        Freezing hours: ${formatNumber(freezingHours, 0)}
      `);
    });

    if (metric === "temp") {
      document.getElementById(`temp-time-${eventKey.toLowerCase()}`).textContent =
        formatDateLabel(step.time);
    } else {
      document.getElementById(`snow-time-${eventKey.toLowerCase()}`).textContent =
        formatDateLabel(step.time);
    }
  }

  function computeEventSummary(eventData) {
    const totals = eventData.locationSummaries.map((item) => item.totalSnowfallMm);
    const freezing = eventData.locationSummaries.map((item) => item.belowFreezingHours);
    const avgTemp = eventData.locationSummaries.map((item) => item.avgTempC);

    const totalSnow = totals.reduce((sum, value) => sum + value, 0);
    const avgSnow = totalSnow / totals.length;
    const maxSnow = Math.max(...totals);
    const avgFreezing = freezing.reduce((sum, value) => sum + value, 0) / freezing.length;
    const maxFreezing = Math.max(...freezing);
    const avgTempOverall = avgTemp.reduce((sum, value) => sum + value, 0) / avgTemp.length;

    return {
      totalSnow,
      avgSnow,
      maxSnow,
      avgFreezing,
      maxFreezing,
      avgTempOverall
    };
  }

  function renderSummary(eventKey, targetId) {
    const container = document.getElementById(targetId);
    container.innerHTML = "";
    const eventData = eventState[eventKey];
    if (!eventData) return;
    const summary = computeEventSummary(eventData);

    const rows = [
      ["Avg temp (°C)", formatNumber(summary.avgTempOverall, 1)],
      ["Avg snowfall (mm)", formatNumber(summary.avgSnow, 1)],
      ["Max snowfall (mm)", formatNumber(summary.maxSnow, 1)],
      ["Avg freezing hours", formatNumber(summary.avgFreezing, 0)],
      ["Max freezing hours", formatNumber(summary.maxFreezing, 0)]
    ];

    rows.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "wsc-summary-item";
      item.innerHTML = `<span>${label}</span><span>${value}</span>`;
      container.appendChild(item);
    });
  }

  function renderComparison() {
    const container = document.getElementById("event-compare-summary");
    container.innerHTML = "";
    if (!eventState.A || !eventState.B) return;
    const summaryA = computeEventSummary(eventState.A);
    const summaryB = computeEventSummary(eventState.B);

    const rows = [
      ["Avg temp delta (A - B)", formatNumber(summaryA.avgTempOverall - summaryB.avgTempOverall, 1)],
      ["Avg snowfall delta (mm)", formatNumber(summaryA.avgSnow - summaryB.avgSnow, 1)],
      ["Max snowfall delta (mm)", formatNumber(summaryA.maxSnow - summaryB.maxSnow, 1)],
      ["Avg freezing hours delta", formatNumber(summaryA.avgFreezing - summaryB.avgFreezing, 0)]
    ];

    rows.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "wsc-summary-item";
      item.innerHTML = `<span>${label}</span><span>${value}</span>`;
      container.appendChild(item);
    });
  }

  function buildCharts() {
    const tempCtx = document.getElementById("temp-chart");
    const snowCtx = document.getElementById("snow-chart");

    charts.temp = new Chart(tempCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "Event A", data: [], borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.2)" },
          { label: "Event B", data: [], borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.2)" }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" }
        },
        scales: {
          y: { title: { display: true, text: "Temp (°C)" } }
        }
      }
    });

    charts.snow = new Chart(snowCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: "Event A", data: [], borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.2)" },
          { label: "Event B", data: [], borderColor: "#f97316", backgroundColor: "rgba(249,115,22,0.2)" }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { title: { display: true, text: "Cumulative snowfall (mm)" } }
        }
      }
    });
  }

  function updateCharts() {
    if (!eventState.A || !eventState.B) return;
    const eventA = eventState.A;
    const eventB = eventState.B;
    const maxSteps = Math.max(eventA.steps.length, eventB.steps.length);

    const labels = Array.from({ length: maxSteps }, (_, index) => {
      const step = eventA.steps[index] || eventB.steps[index];
      return step ? formatDateLabel(step.time) : \"--\";
    });

    const series = (eventData, accessor) =>
      Array.from({ length: maxSteps }, (_, index) => {
        const step = eventData.steps[index];
        return step ? step[accessor] : null;
      });

    charts.temp.data.labels = labels;
    charts.temp.data.datasets[0].data = series(eventA, \"avgTempC\");
    charts.temp.data.datasets[1].data = series(eventB, \"avgTempC\");
    charts.temp.update();

    charts.snow.data.labels = labels;
    charts.snow.data.datasets[0].data = series(eventA, \"avgSnowfallCumulative\");
    charts.snow.data.datasets[1].data = series(eventB, \"avgSnowfallCumulative\");
    charts.snow.update();
  }

  function renderLocationTable() {
    const tbody = document.querySelector("#location-table tbody");
    tbody.innerHTML = "";
    if (!eventState.A || !eventState.B) return;

    LOCATIONS.forEach((location, idx) => {
      const row = document.createElement("tr");
      const a = eventState.A.locationSummaries[idx];
      const b = eventState.B.locationSummaries[idx];
      const diff = a.totalSnowfallMm - b.totalSnowfallMm;
      row.innerHTML = `
        <td>${location.name}</td>
        <td>${formatNumber(a.totalSnowfallMm, 1)}</td>
        <td>${formatNumber(b.totalSnowfallMm, 1)}</td>
        <td>${formatNumber(a.belowFreezingHours, 0)}</td>
        <td>${formatNumber(b.belowFreezingHours, 0)}</td>
        <td>${formatNumber(diff, 1)}</td>
      `;
      tbody.appendChild(row);
    });
  }

  function attachTableSorting() {
    const table = document.getElementById("location-table");
    const headers = table.querySelectorAll("th");
    headers.forEach((header, index) => {
      header.addEventListener("click", () => {
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const isNumeric = index !== 0;
        const sorted = rows.sort((a, b) => {
          const aText = a.children[index].textContent;
          const bText = b.children[index].textContent;
          if (isNumeric) {
            return parseFloat(bText) - parseFloat(aText);
          }
          return aText.localeCompare(bText);
        });
        const tbody = table.querySelector("tbody");
        tbody.innerHTML = "";
        sorted.forEach((row) => tbody.appendChild(row));
      });
    });
  }

  function updateTimeline(metric) {
    const eventA = eventState.A;
    const eventB = eventState.B;
    if (!eventA || !eventB) return;

    const progress = timelines[metric].progress;
    const indexA = Math.round(progress * (eventA.steps.length - 1));
    const indexB = Math.round(progress * (eventB.steps.length - 1));

    updateMapMarkers(metric, "A", indexA, progress);
    updateMapMarkers(metric, "B", indexB, progress);
  }

  function setTimelineProgress(metric, progress) {
    timelines[metric].progress = Math.max(0, Math.min(1, progress));
    updateTimeline(metric);
  }

  function startTimeline(metric) {
    stopTimeline(metric);
    timelines[metric].timer = setInterval(() => {
      const next = timelines[metric].progress + 0.02;
      if (next >= 1) {
        setTimelineProgress(metric, 0);
      } else {
        setTimelineProgress(metric, next);
      }
      const slider = document.querySelector(`.wsc-timeline-controls[data-metric="${metric}"] .wsc-slider`);
      slider.value = Math.round(timelines[metric].progress * 100);
    }, 600);
  }

  function stopTimeline(metric) {
    if (timelines[metric].timer) {
      clearInterval(timelines[metric].timer);
      timelines[metric].timer = null;
    }
  }

  function attachTimelineControls() {
    document.querySelectorAll(".wsc-timeline-controls").forEach((control) => {
      const metric = control.dataset.metric;
      const slider = control.querySelector(".wsc-slider");
      slider.addEventListener("input", (event) => {
        setTimelineProgress(metric, event.target.value / 100);
      });
      control.querySelector('[data-action="play"]').addEventListener("click", () => startTimeline(metric));
      control.querySelector('[data-action="pause"]').addEventListener("click", () => stopTimeline(metric));
    });
  }

  async function fetchEventData(config) {
    const response = await fetch("/.netlify/functions/winter-storm-compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: config.dataStart || config.start,
        end: config.dataEnd || config.end,
        intervalHours: Number(document.getElementById("interval-hours").value),
        locations: LOCATIONS
      })
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Unable to load weather data.");
    }

    return response.json();
  }

  async function loadEvents() {
    const eventAIndex = Number(document.getElementById("event-a-select").value);
    const eventBIndex = Number(document.getElementById("event-b-select").value);
    const eventAConfig = {
      ...PRESET_EVENTS[eventAIndex],
      start: document.getElementById("event-a-start").value,
      end: document.getElementById("event-a-end").value
    };
    const eventBConfig = {
      ...PRESET_EVENTS[eventBIndex],
      start: document.getElementById("event-b-start").value,
      end: document.getElementById("event-b-end").value
    };

    loadButton.disabled = true;
    statusEl.textContent = "Loading hourly data from Open-Meteo...";

    try {
      const [dataA, dataB] = await Promise.all([
        fetchEventData(eventAConfig),
        fetchEventData(eventBConfig)
      ]);

      eventState.A = { ...dataA, display: eventAConfig };
      eventState.B = { ...dataB, display: eventBConfig };

      renderSummary("A", "event-a-summary");
      renderSummary("B", "event-b-summary");
      renderComparison();
      updateCharts();
      renderLocationTable();
      setTimelineProgress("temp", 0);
      setTimelineProgress("snow", 0);
      statusEl.textContent = "Data loaded. Drag the sliders or press play to animate maps.";
    } catch (error) {
      statusEl.textContent = error.message;
    } finally {
      loadButton.disabled = false;
    }
  }

  function init() {
    buildPresetSelect(
      document.getElementById("event-a-select"),
      document.getElementById("event-a-start"),
      document.getElementById("event-a-end"),
      document.getElementById("event-a-note")
    );
    buildPresetSelect(
      document.getElementById("event-b-select"),
      document.getElementById("event-b-start"),
      document.getElementById("event-b-end"),
      document.getElementById("event-b-note")
    );

    initMaps();
    buildCharts();
    attachTimelineControls();
    attachTableSorting();

    document.getElementById("load-data").addEventListener("click", loadEvents);
  }

  init();
