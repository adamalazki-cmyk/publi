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

  const img = document.getElementById("detailImage");

  if (img) {
    if (p.image && p.image.trim() !== "") {
      img.src = p.image;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
  }

  const panel = document.getElementById("detailPanel");
  if (panel) panel.classList.remove("hidden");

  // Set status accent bar colour
  const accentColours = {
    "Operational":        "#4cc9f0",
    "Under Construction": "#8b7cf6",
    "Planned":            "#94a3b8",
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

  geojsonLayer = L.geoJSON(data, {

 pointToLayer: function(feature, latlng) {

  const status = feature.properties.status || "";

  const statusColours = {
    "Operational": "#4cc9f0",
    "Under Construction": "#8b7cf6",
    "Planned": "#94a3b8",
    "Feasibility": "#64748b"
  };

  let colour = statusColours[status] || "#4cc9f0";

  const outer = L.circleMarker(latlng, {
    radius: 14,
    fillColor: colour,
    fillOpacity: 0.15,
    stroke: false
  });

  const inner = L.circleMarker(latlng, {
    radius: 6,
    fillColor: colour,
    color: "#ffffff",
    weight: 2,
    opacity: 1,
    fillOpacity: 1
  });

  // Click: show popup if detail panel closed, update detail panel if already open
  const onClick = (e) => {
    const detailPanel = document.getElementById("detailPanel");
    const panelOpen = detailPanel && !detailPanel.classList.contains("hidden");

    if (panelOpen) {
      // Detail panel already open — update it with this marker's data
      openDetails(feature);
      setTimeout(() => {
        map.closePopup();
        document.querySelectorAll('.leaflet-popup').forEach(el => el.remove());
      }, 0);
    }
    // If panel is closed, do nothing here — let the popup open naturally via bindPopup
  };

  outer.on("click", onClick);
  inner.on("click", onClick);

  return L.layerGroup([outer, inner]);
},

   onEachFeature: function(feature, layer) {

  // OPEN DETAIL PANEL ON MARKER CLICK


  layer.eachLayer(l => {

    l.bindPopup(`
      <div class="popupCard">

        <div class="popupAccent status-${(feature.properties.status || "")
          .toLowerCase()
          .replace(/\s+/g, "-")}"></div>

        <div class="popupContent">

          <div class="popupHeader">
            ${feature.properties.name}
          </div>

          <div class="popupMeta">
            <div><span>Type</span><span>${feature.properties.type || ""}</span></div>

            <div>
              <span>Capacity</span>
              <span>
                ${feature.properties.capacity ? feature.properties.capacity + " MW" : ""}
              </span>
            </div>

            <div><span>Status</span><span>${feature.properties.status || ""}</span></div>
          </div>

          <button class="popupButton"
            onclick="window.openDetailsByName('${feature.properties.name}')">
            More info →
          </button>

        </div>

      </div>
    `);

  });
}

  }).addTo(map);
}

//
// ----------------------
// FILTER LOGIC
// ----------------------
//
function updateFilters() {

  if (!allData) return;

  const checked = {};

  document.querySelectorAll("#filterContainer input:checked")
    .forEach(input => {

      const key = input.dataset.key;
      const value = input.value;

      if (!checked[key]) checked[key] = new Set();
      checked[key].add(value);
    });

  const filtered = {
    type: "FeatureCollection",
    features: allData.features.filter(f => {

      const p = f.properties;

      for (let key in checked) {
        if (!checked[key].has(p[key])) return false;
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

// Inject backdrop element
const backdrop = document.createElement('div');
backdrop.id = 'panelBackdrop';
backdrop.classList.add('backdrop-hidden'); // start hidden
document.body.appendChild(backdrop);

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

