const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false
}).setView([54.5, -3], 6);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & CARTO',
  updateWhenZooming: false,
  updateWhenIdle: true
}).addTo(map);

let allData = null;
let geojsonLayer = null;
let activeFeatureId = null;
let activeLayers = [];
//
// ✅ FIX 1 — SAFE CSV VALUE HELPER (WAS MISSING)
//
const getValue = (row, keys) => {
  for (let k of keys) {
    const val = row[k];
    if (val !== undefined && val !== null && val.toString().trim() !== "") {
      return val.toString().trim();
    }
  }
  return null;
};
//
function resetActiveState() {
  activeLayers.forEach(l => {
    if (l && l.setStyle) {
      l.setStyle({
        opacity: 1,
        fillOpacity: 1
      });
    }
  });

  activeLayers = [];
  activeFeatureId = null;
}
function highlightLayer(layer) {
  if (!layer || !layer.setStyle) return;

  layer.setStyle({
    fillOpacity: 0.9,
    opacity: 1
  });
}
//
// ----------------------
// PANEL CONTROLS (HARDENED)
// ----------------------
//
function openDetails(feature) {

  const p = feature?.properties || {};

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value || "—";
  };

  set("detailTitle", p.name);
  set("detailDescription", p.description);

  set("detailType", p.type);
set(
  "detailCapacity",
  p.capacity ? `${p.capacity} MW` : "—"
);
  set("detailStatus", p.status);

  set("detailRefrigerant", p.refrigerant);
  set("detailManufacturer", p.manufacturer);

set(
  "detailFlowTemperature",
  p.flowTemperature ? `${p.flowTemperature} °C` : "—"
);
  set("detailApplication", p.application);
  set("detailOperator", p.operator);
  set("detailYearCommissioned", p.yearCommissioned);

  // Label changes based on status
  const yearLabel = document.getElementById("detailYearLabel");
  if (yearLabel) {
    const notCommissioned = ["Planned", "Under Construction", "Feasibility"];
    yearLabel.textContent = notCommissioned.includes(p.status)
      ? "Year Planned"
      : "Year Commissioned";
  }

  const img = document.getElementById("detailImage");

  if (img) {
    if (p.image && p.image.trim() !== "") {
      img.src = p.image;
      img.alt = p.name || "Project image";
      img.style.display = "block";
    } else {
      img.style.display = "none";
      img.alt = "";
    }
  }

  const panel = document.getElementById("detailPanel");
  if (panel) panel.classList.remove("hidden");

  // Set status accent bar colour
  const accentColours = {
    "Operational":        "#f59e0b",
    "Under Construction": "#8b7cf6",
    "Planned":            "#4cc9f0",
    "Feasibility":        "#64748b"
  };
  const accent = document.getElementById("detailAccent");
  if (accent) {
    accent.style.background = accentColours[p.status] || "rgba(255,255,255,0.12)";
  }

  // On mobile: full-screen detail panel, hide legend
  if (isMobile()) {
    panel.classList.add("detail-fullscreen");
    const legend = document.getElementById("legend");
    if (legend) legend.style.display = "none";
  }
}

function closeDetails() {
  const panel = document.getElementById("detailPanel");
  if (panel) {
    panel.classList.add("hidden");
    panel.classList.remove("detail-fullscreen");
  }
  // Restore legend on mobile
  if (isMobile()) {
    const legend = document.getElementById("legend");
    if (legend) legend.style.display = "";
    // Re-tell Leaflet its container size hasn't changed
    setTimeout(() => map.invalidateSize({ animate: false }), 50);
  }
}

window.closeDetails = closeDetails;

//
// ----------------------
// DATA LOADING
// ----------------------
//
fetch('UK Heat pump Map Database.csv')
  .then(res => res.text())
  .then(csvText => {

    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    const features = result.data
      .map(row => {

        const lat = parseFloat(row.lat);
        const lng = parseFloat(row.lng);

        if (isNaN(lat) || isNaN(lng)) return null;

        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng, lat]
          },
          properties: {
            name: row.name,
            type: row.type,
            capacity: row.capacity,
            status: row.status,

            refrigerant: getValue(row, [
              "refrigerant class",
              "Refrigerant Class",
              "refrigerant_class"
            ]),

            manufacturer: getValue(row, [
              "manufacturer",
              "Manufacturer",
              "Manufacturer Name",
              "OEM"
            ]),

            flowTemperature: getValue(row, [
              "flow temperature",
              "Flow Temperature",
              "flow_temp"
            ]),

            application: getValue(row, [
              "application",
              "Application"
            ]),

            operator: getValue(row, [
              "operator",
              "Operator"
            ]),

            yearCommissioned: getValue(row, [
              "year commissioned",
              "Year Commissioned",
              "commissioned year"
            ]),

            image: getValue(row, [
              "image",
              "image url",
              "Image URL",
              "photo",
              "Photo URL"
            ]),

            description: row.description
          }
        };
      })
      .filter(Boolean);

    allData = {
      type: "FeatureCollection",
      features
    };

    drawMap(allData);

    if (typeof buildFilters === "function") {
      buildFilters();
    }
  });

function updateLegendCounts(data) {
  const counts = {
    "Operational": 0,
    "Under Construction": 0,
    "Planned": 0
  };

  data.features.forEach(f => {
    const s = f.properties.status;
    if (counts[s] !== undefined) counts[s]++;
  });

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set("count-total",        data.features.length);
  set("count-operational",  counts["Operational"]);
  set("count-construction", counts["Under Construction"]);
  set("count-planned",      counts["Planned"]);
}

//
// ----------------------
// MAP RENDERING
// ----------------------
//
function drawMap(data) {

  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
    geojsonLayer = null;
  }

  updateLegendCounts(data);

  const statusColours = {
    "Operational":        "#f59e0b",
    "Under Construction": "#8b7cf6",
    "Planned":            "#4cc9f0",
    "Feasibility":        "#64748b"
  };

  const statusClass = {
    "Operational":        "operational",
    "Under Construction": "under-construction",
    "Planned":            "planned",
    "Feasibility":        "feasibility"
  };

  const clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 40,
    disableClusteringAtZoom: 10,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function(cluster) {
      return L.divIcon({
        html: `<div class="marker-cluster-glass">${cluster.getChildCount()}</div>`,
        className: '',
        iconSize:   [28, 28],
        iconAnchor: [14, 14]
      });
    }
  });

  data.features.forEach(feature => {
    const coords  = feature.geometry.coordinates;
    const latlng  = L.latLng(coords[1], coords[0]);
    const status  = feature.properties.status || "";
    const colour  = statusColours[status] || "#94a3b8";
    const cls     = statusClass[status]   || "planned";

    const icon = L.divIcon({
      className: '',
      html: `<div class="marker-glass-outer ${cls}">
               <div class="marker-glass-dot" style="background:${colour}"></div>
             </div>`,
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
      popupAnchor:[0, -16]
    });

    const marker = L.marker(latlng, { icon });

    const popupHtml = `
      <div class="popupCard">
        <div class="popupAccent status-${status.toLowerCase().replace(/\s+/g, "-")}"></div>
        <div class="popupContent">
          <div class="popupHeader">${feature.properties.name}</div>
          <div class="popupMeta">
            <div><span>Type</span><span>${feature.properties.type || ""}</span></div>
            <div>
              <span>Capacity</span>
              <span>${feature.properties.capacity ? feature.properties.capacity + " MW" : ""}</span>
            </div>
            <div><span>Status</span><span>${status}</span></div>
          </div>
          <button class="popupButton" onclick="window.openDetailsByName('${(feature.properties.name || "").replace(/'/g, "\\'")}')">
            More info →
          </button>
        </div>
      </div>`;

    marker.bindPopup(popupHtml);

    marker.on("click", () => {
      const detailPanel = document.getElementById("detailPanel");
      const panelOpen = detailPanel && !detailPanel.classList.contains("hidden");
      if (panelOpen) {
        openDetails(feature);
        setTimeout(() => {
          map.closePopup();
          document.querySelectorAll('.leaflet-popup').forEach(el => el.remove());
        }, 0);
      }
    });

    clusterGroup.addLayer(marker);
  });

  map.addLayer(clusterGroup);
  geojsonLayer = clusterGroup;
}


//
// ----------------------
// FILTER LOGIC
// ----------------------
//
function updateFilters() {

  if (!allData) return;

  const checked = {};
  document.querySelectorAll("#filterContainer input")
    .forEach(input => {
      const key = input.dataset.key;
      if (!checked[key]) checked[key] = { values: new Set(), anyChecked: false };
      if (input.checked) {
        checked[key].values.add(input.value);
        checked[key].anyChecked = true;
      }
    });

  const filtered = {
    type: "FeatureCollection",
    features: allData.features.filter(f => {
      const p = f.properties;
      for (let key in checked) {
        const { values, anyChecked } = checked[key];
        // Nothing checked in category → show all
        if (!anyChecked) continue;
        const featureVal = p[key];
        // Feature has no value for this key → always show
        if (!featureVal) continue;
        // Feature value must match one of the checked options
        if (!values.has(featureVal)) return false;
      }
      return true;
    })
  };

  drawMap(filtered);
}

//
// ----------------------
// HELPERS
// ----------------------
//
function getUniqueValues(data, key) {
  return [...new Set(
    data.features
      .map(f => f.properties[key])
      .filter(Boolean)
  )].sort();
}

//
// ----------------------
// FILTER UI
// ----------------------
//
function buildFilters() {

  const container = document.getElementById("filterContainer");
  if (!allData || !container) return;

  const filters = {
    type: getUniqueValues(allData, "type"),
    status: getUniqueValues(allData, "status"),
    refrigerant: getUniqueValues(allData, "refrigerant"),
    manufacturer: getUniqueValues(allData, "manufacturer")
  };

  container.innerHTML = "";

  Object.entries(filters).forEach(([key, values]) => {

    const group = document.createElement("div");
    group.className = "filter-group";

    group.innerHTML = `
      <div class="filter-header">
        <span>${key.toUpperCase()}</span>
        <span>▾</span>
      </div>

      <div class="filter-options">
        ${values.map(v => `
          <label>
            <input type="checkbox" data-key="${key}" value="${v}" checked>
            ${v}
          </label>
        `).join("")}
      </div>
    `;

    group.querySelector(".filter-header")
      .addEventListener("click", () => {
        group.classList.toggle("open");
      });

    container.appendChild(group);
  });

  container.querySelectorAll("input")
    .forEach(input => input.addEventListener("change", updateFilters));
}

//
// ----------------------
// POPUP → PANEL
// ----------------------
//
window.openDetailsByName = function(name) {

  if (!allData) return;

  const feature = allData.features.find(
    f => f.properties.name === name
  );

  if (!feature) return;

  // Defer popup close so it runs after Leaflet finishes handling the click
  setTimeout(() => {
    map.closePopup();
    document.querySelectorAll('.leaflet-popup').forEach(el => el.remove());
  }, 0);

  openDetails(feature);

  const panel = document.getElementById("detailPanel");
  if (panel && panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
  }
};

// ----------------------
// MOBILE PANEL TOGGLE
// ----------------------

// Inject backdrop element into #app so it stacks correctly with the panel
const backdrop = document.createElement('div');
backdrop.id = 'panelBackdrop';
backdrop.classList.add('backdrop-hidden');
document.getElementById('app').appendChild(backdrop);

const panel       = document.getElementById('panel');
const panelToggle = document.getElementById('panelToggle');

function openPanel() {
  panel.classList.remove('panel-collapsed');
  backdrop.classList.remove('backdrop-hidden');
  panelToggle.classList.add('hidden');
  panelToggle.setAttribute('aria-expanded', 'true');
  // Disable map pointer events so touch on panel doesn't scroll the map
  document.getElementById('map').style.pointerEvents = 'none';
}

function collapsePanel() {
  panel.classList.add('panel-collapsed');
  backdrop.classList.add('backdrop-hidden');
  panelToggle.classList.remove('hidden');
  panelToggle.setAttribute('aria-expanded', 'false');
  document.getElementById('map').style.pointerEvents = '';
}

function isMobile() {
  return window.innerWidth <= 768;
}

// Start collapsed on mobile
if (isMobile()) {
  panel.classList.add('panel-collapsed');
}

panelToggle.addEventListener('click', openPanel);
backdrop.addEventListener('click', collapsePanel);

// Legend toggle (mobile only)
const legendToggle = document.getElementById('legendToggle');
const legendBody   = document.getElementById('legendBody');
const legendEl     = document.getElementById('legend');

legendToggle.addEventListener('click', () => {
  const isOpen = legendBody.classList.toggle('open');
  legendToggle.setAttribute('aria-expanded', isOpen);
  legendToggle.textContent = isOpen ? '×' : '＋';
  legendEl.classList.toggle('legend-open', isOpen);
});

// Reset filters button
document.getElementById('resetFilters').addEventListener('click', () => {
  document.querySelectorAll('#filterContainer input[type="checkbox"]')
    .forEach(input => { input.checked = true; });
  updateFilters();
});

// Re-check on resize / orientation change
// Debounced so it fires once the browser has finished reflowing
let resizeTimer;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {

    if (!isMobile()) {
      // ── Desktop / landscape-tablet: restore full panel ──
      panel.classList.remove('panel-collapsed');
      backdrop.classList.add('backdrop-hidden');
      panelToggle.classList.add('hidden');
      document.getElementById('map').style.pointerEvents = '';
    } else {
      // ── Mobile / portrait: ensure panel is collapsed ──
      collapsePanel();
    }

    // Always tell Leaflet the container changed size
    map.invalidateSize({ animate: false });

  }, 200); // wait for browser reflow after rotation
}

window.addEventListener('resize', handleResize);
// orientationchange fires on mobile before resize completes — handle both
window.addEventListener('orientationchange', handleResize);

const contactBtn = document.getElementById('contactBtn');
const modal = document.getElementById('contactModal');

contactBtn.addEventListener('click', (e) => {
  e.preventDefault();
  modal.classList.remove('hidden');
  if (!isMobile()) {
    document.getElementById('app').classList.add('blurred');
  }
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.add('hidden');
    document.getElementById('app').classList.remove('blurred');
  }
});

// ----------------------
// MAP SEARCH
// ----------------------

const searchInput   = document.getElementById('mapSearchInput');
const searchResults = document.getElementById('mapSearchResults');
const searchClear   = document.getElementById('mapSearchClear');

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const idx = escaped.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escaped;
  return escaped.slice(0, idx)
    + `<em>${escaped.slice(idx, idx + query.length)}</em>`
    + escaped.slice(idx + query.length);
}

function closeSearch() {
  searchResults.style.display = 'none';
  searchResults.innerHTML = '';
}

function selectResult(feature) {
  searchInput.value = '';
  searchClear.style.display = 'none';
  closeSearch();
  searchInput.blur(); // dismiss keyboard before flying

  const coords = feature.geometry.coordinates;
  const latlng = L.latLng(coords[1], coords[0]);

  // Wait for keyboard to retract before flying
  setTimeout(() => {
    map.invalidateSize({ animate: false });
    map.flyTo(latlng, 13, { duration: 1.2 });

    map.once('moveend', () => {
      if (!geojsonLayer) return;
      geojsonLayer.eachLayer(layer => {
        const checkLayer = l => {
          if (!l.getLatLng) return;
          const ll = l.getLatLng();
          if (Math.abs(ll.lat - latlng.lat) < 0.0001 &&
              Math.abs(ll.lng - latlng.lng) < 0.0001) {
            geojsonLayer.zoomToShowLayer(l, () => l.openPopup());
          }
        };
        layer.eachLayer ? layer.eachLayer(checkLayer) : checkLayer(layer);
      });
    });
  }, 350);
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();

  searchClear.style.display = query.length ? 'block' : 'none';

  if (!query || !allData) {
    closeSearch();
    return;
  }

  const matches = allData.features
    .filter(f => (f.properties.name || '').toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  if (matches.length === 0) {
    searchResults.innerHTML = `<div class="search-no-results">No projects found</div>`;
    searchResults.style.display = 'block';
    return;
  }

  searchResults.innerHTML = matches.map((f, i) => {
    const p = f.properties;
    const name = highlightMatch(p.name, query);
    const cap  = p.capacity ? `${p.capacity} MW` : '—';
    const statusColours = {
      "Operational": "#f59e0b",
      "Under Construction": "#8b7cf6",
      "Planned": "#4cc9f0",
      "Feasibility": "#64748b"
    };
    const dot = `<span style="
      display:inline-block;width:7px;height:7px;border-radius:50%;
      background:${statusColours[p.status] || '#94a3b8'};
      margin-right:5px;flex-shrink:0;vertical-align:middle;
    "></span>`;
    return `<div class="search-result-item" data-idx="${i}">
      <span class="search-result-name">${dot}${name}</span>
      <span class="search-result-meta">${cap}</span>
    </div>`;
  }).join('');

  searchResults.style.display = 'block';

  // Attach click handlers
  searchResults.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.addEventListener('click', () => selectResult(matches[i]));
  });
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  closeSearch();
  searchInput.focus();
});

// Close results when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#mapSearch')) closeSearch();
});

// Keyboard navigation
searchInput.addEventListener('keydown', (e) => {
  const items = searchResults.querySelectorAll('.search-result-item');
  const active = searchResults.querySelector('.search-result-item.active');
  let idx = active ? [...items].indexOf(active) : -1;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (active) active.classList.remove('active');
    idx = Math.min(idx + 1, items.length - 1);
    items[idx]?.classList.add('active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (active) active.classList.remove('active');
    idx = Math.max(idx - 1, 0);
    items[idx]?.classList.add('active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && active) {
    active.click();
  } else if (e.key === 'Escape') {
    searchInput.blur();
    closeSearch();
  }
});

