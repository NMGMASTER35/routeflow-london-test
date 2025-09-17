(function () {
  "use strict";

  const STORAGE_KEY = "routeflow:fleet-state:v1";
  const ADMIN_CODE = "fleet-admin";
  const RARE_WORKING_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

  const DROPDOWN_FIELDS = [
    "operator",
    "status",
    "wrap",
    "vehicleType",
    "doors",
    "engineType",
    "engine",
    "chassis",
    "bodyType",
    "garage",
    "extras",
    "length",
  ];

  const FIELD_LABELS = {
    registration: "Registration",
    fleetNumber: "Fleet number",
    operator: "Operator",
    status: "Status",
    wrap: "Wrap",
    vehicleType: "Vehicle type",
    doors: "Doors",
    engineType: "Engine type",
    engine: "Engine",
    chassis: "Chassis",
    bodyType: "Body type",
    registrationDate: "Registration date",
    garage: "Garage",
    extras: "Extras",
    length: "Length",
    isNewBus: "New bus",
    isRareWorking: "Rare working",
    lastUpdated: "Last updated",
  };

  const DEFAULT_STATE = {
    options: {
      operator: [
        "Abellio London",
        "Arriva London",
        "Go-Ahead London",
        "Metroline",
        "Stagecoach London",
      ],
      status: ["Active", "Inactive", "Stored"],
      wrap: ["Standard", "Heritage", "Advertising wrap", "Special event"],
      vehicleType: ["Double Decker", "Single Decker"],
      doors: ["1", "2", "3"],
      engineType: ["Diesel", "Hybrid", "Electric", "Hydrogen"],
      engine: [
        "Alexander Dennis Enviro400EV",
        "Volvo B5LH",
        "Scania N250UD",
        "Wrightbus Hydrogen",
      ],
      chassis: [
        "Alexander Dennis",
        "Scania N-series",
        "Volvo B5LH",
        "Wrightbus StreetDeck",
      ],
      bodyType: [
        "Alexander Dennis Enviro400 MMC",
        "Wright Gemini 3",
        "Wright StreetDeck",
        "Caetano e.City Gold",
      ],
      garage: [
        "QB (Battersea)",
        "HT (Holloway)",
        "LI (Leyton)",
        "NX (New Cross)",
        "WJ (Waterloo)",
      ],
      extras: [
        "New Bus",
        "Rare Working",
        "Heritage Fleet",
        "Route Branding",
        "Night Bus Allocation",
        "Training Vehicle",
      ],
      length: ["8.9m", "10.2m", "10.6m", "11.2m", "12.4m"],
    },
    buses: {
      BV72YKD: {
        regKey: "BV72YKD",
        registration: "BV72 YKD",
        fleetNumber: "4032",
        operator: "Abellio London",
        status: "Active",
        wrap: "Standard",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Electric",
        engine: "Alexander Dennis Enviro400EV",
        chassis: "Alexander Dennis",
        bodyType: "Alexander Dennis Enviro400 MMC",
        registrationDate: "2023-01-12",
        garage: "QB (Battersea)",
        extras: ["New Bus", "Route Branding"],
        length: "10.6m",
        isNewBus: true,
        isRareWorking: false,
        createdAt: "2023-01-12T00:00:00.000Z",
        lastUpdated: "2024-05-12T10:32:00.000Z",
        lastSeenAt: "2024-05-10T08:12:00.000Z",
        lastSeenRoute: "Route 344",
        routeHistory: {
          344: "2024-05-10T08:12:00.000Z",
        },
        rareWorkings: [],
      },
      LTZ1000: {
        regKey: "LTZ1000",
        registration: "LTZ 1000",
        fleetNumber: "LT1",
        operator: "Go-Ahead London",
        status: "Active",
        wrap: "Heritage",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Hybrid",
        engine: "Volvo B5LH",
        chassis: "Volvo B5LH",
        bodyType: "Wright Gemini 3",
        registrationDate: "2015-02-28",
        garage: "QB (Battersea)",
        extras: ["Heritage Fleet", "Rare Working"],
        length: "11.2m",
        isNewBus: false,
        isRareWorking: true,
        createdAt: "2015-02-28T00:00:00.000Z",
        lastUpdated: "2024-03-18T09:15:00.000Z",
        lastSeenAt: "2024-05-01T06:40:00.000Z",
        lastSeenRoute: "Route 11",
        routeHistory: {
          11: "2024-05-01T06:40:00.000Z",
          211: "2024-02-19T07:20:00.000Z",
        },
        rareWorkings: [
          {
            routeKey: "211",
            route: "211",
            lastSeen: "2024-02-19T07:20:00.000Z",
          },
        ],
      },
      SN68AEO: {
        regKey: "SN68AEO",
        registration: "SN68 AEO",
        fleetNumber: "11056",
        operator: "Stagecoach London",
        status: "Active",
        wrap: "Advertising wrap",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Hybrid",
        engine: "Scania N250UD",
        chassis: "Scania N-series",
        bodyType: "Alexander Dennis Enviro400 MMC",
        registrationDate: "2018-11-02",
        garage: "LI (Leyton)",
        extras: ["Night Bus Allocation"],
        length: "10.6m",
        isNewBus: false,
        isRareWorking: false,
        createdAt: "2018-11-02T00:00:00.000Z",
        lastUpdated: "2024-04-06T15:45:00.000Z",
        lastSeenAt: "2024-04-06T05:45:00.000Z",
        lastSeenRoute: "Route 97",
        routeHistory: {
          97: "2024-04-06T05:45:00.000Z",
        },
        rareWorkings: [],
      },
    },
    pendingChanges: [],
  };

  const state = loadState();
  let isAdmin = false;
  let toastTimeout = null;

  document.addEventListener("DOMContentLoaded", () => {
    const elements = getElements();
    if (!elements) {
      return;
    }

    synchronizeOptionsWithBuses();
    sortOptionLists();
    populateAllSelects(elements);
    renderOptionList(elements, elements.optionCategory.value);
    renderTable(elements);
    renderHighlights(elements);
    updateStats(elements);
    updatePendingBadge(elements);
    renderPendingList(elements);

    attachEvents(elements);
  });

  function getElements() {
    const searchInput = document.getElementById("searchReg");
    const filterNew = document.getElementById("filterNew");
    const filterRare = document.getElementById("filterRare");
    const resetFilters = document.getElementById("resetFilters");
    const tableBody = document.getElementById("fleetTableBody");
    const emptyState = document.getElementById("fleetEmpty");
    const fleetForm = document.getElementById("fleetForm");
    const formFeedback = document.getElementById("formFeedback");
    const registrationInput = document.getElementById("busRegistration");
    const clearFormButton = document.getElementById("clearForm");
    const optionForm = document.getElementById("optionForm");
    const optionCategory = document.getElementById("optionCategory");
    const optionList = document.getElementById("optionList");
    const adminToggle = document.getElementById("adminToggle");
    const adminPanel = document.getElementById("adminPanel");
    const pendingContainer = document.getElementById("pendingContainer");
    const pendingCount = document.getElementById("pendingCount");
    const toast = document.getElementById("fleetToast");
    const ingestForm = document.getElementById("ingestForm");
    const ingestInput = document.getElementById("ingestInput");
    const ingestFeedback = document.getElementById("ingestFeedback");
    const clearIngestButton = document.getElementById("clearIngest");
    const fetchArrivalsButton = document.getElementById("fetchArrivals");
    const ingestIds = document.getElementById("ingestIds");
    const ingestAppId = document.getElementById("ingestAppId");
    const ingestAppKey = document.getElementById("ingestAppKey");

    if (!tableBody || !fleetForm) {
      return null;
    }

    return {
      searchInput,
      filterNew,
      filterRare,
      resetFilters,
      tableBody,
      emptyState,
      fleetForm,
      formFeedback,
      registrationInput,
      clearFormButton,
      optionForm,
      optionCategory,
      optionList,
      adminToggle,
      adminPanel,
      pendingContainer,
      pendingCount,
      toast,
      ingestForm,
      ingestInput,
      ingestFeedback,
      clearIngestButton,
      fetchArrivalsButton,
      ingestIds,
      ingestAppId,
      ingestAppKey,
      selects: {
        fleetNumber: document.getElementById("fleetNumber"),
        operator: document.getElementById("operatorSelect"),
        status: document.getElementById("statusSelect"),
        wrap: document.getElementById("wrapSelect"),
        vehicleType: document.getElementById("vehicleTypeSelect"),
        doors: document.getElementById("doorsSelect"),
        engineType: document.getElementById("engineTypeSelect"),
        engine: document.getElementById("engineSelect"),
        chassis: document.getElementById("chassisSelect"),
        bodyType: document.getElementById("bodyTypeSelect"),
        registrationDate: document.getElementById("registrationDate"),
        garage: document.getElementById("garageSelect"),
        extras: document.getElementById("extrasSelect"),
        length: document.getElementById("lengthSelect"),
        isNewBus: document.getElementById("isNewBus"),
        isRareWorking: document.getElementById("isRareWorking"),
      },
    };
  }

  function attachEvents(elements) {
    const {
      searchInput,
      filterNew,
      filterRare,
      resetFilters,
      fleetForm,
      formFeedback,
      registrationInput,
      clearFormButton,
      optionForm,
      optionCategory,
      adminToggle,
      adminPanel,
      pendingContainer,
      ingestForm,
      clearIngestButton,
      fetchArrivalsButton,
      ingestIds,
    } = elements;

    if (searchInput) {
      searchInput.addEventListener("input", () => renderTable(elements));
    }
    if (filterNew) {
      filterNew.addEventListener("change", () => renderTable(elements));
    }
    if (filterRare) {
      filterRare.addEventListener("change", () => renderTable(elements));
    }
    if (resetFilters) {
      resetFilters.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (filterNew) filterNew.checked = false;
        if (filterRare) filterRare.checked = false;
        renderTable(elements);
      });
    }

    if (registrationInput) {
      registrationInput.addEventListener("blur", () => prefillForm(elements));
      registrationInput.addEventListener("input", () =>
        normalizeRegistrationInput(registrationInput),
      );
    }

    fleetForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitForm(elements);
    });

    if (clearFormButton) {
      clearFormButton.addEventListener("click", () => {
        clearForm(elements);
        if (formFeedback) {
          setFormFeedback(formFeedback, "", "");
        }
      });
    }

    if (optionForm) {
      optionForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addNewOption(elements);
      });
    }

    if (optionCategory) {
      optionCategory.addEventListener("change", () =>
        renderOptionList(elements, optionCategory.value),
      );
    }

    if (adminToggle && adminPanel) {
      adminToggle.addEventListener("click", () => {
        toggleAdmin(elements);
      });
    }

    if (pendingContainer) {
      pendingContainer.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const id = button.getAttribute("data-id");
        if (!id) return;
        if (button.dataset.action === "approve") {
          approvePending(elements, id);
        } else if (button.dataset.action === "reject") {
          rejectPending(elements, id);
        }
      });
    }

    if (ingestForm) {
      ingestForm.addEventListener("submit", (event) => {
        event.preventDefault();
        processIngestTextarea(elements);
      });
    }

    if (clearIngestButton) {
      clearIngestButton.addEventListener("click", () => {
        clearIngest(elements);
      });
    }

    if (fetchArrivalsButton) {
      fetchArrivalsButton.addEventListener("click", () => {
        fetchArrivalsFromTfL(elements);
      });
    }

    if (ingestIds) {
      ingestIds.addEventListener("blur", () => {
        ingestIds.value = formatIdsForInput(ingestIds.value);
      });
    }
  }

  function normalizeRegistrationInput(input) {
    if (!input) return;
    input.value = input.value.toUpperCase();
  }

  function loadState() {
    const base = clone(DEFAULT_STATE);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return base;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.options) {
          base.options = mergeOptions(DEFAULT_STATE.options, parsed.options);
        }
        if (parsed.buses && typeof parsed.buses === "object") {
          base.buses = {};
          Object.keys(parsed.buses).forEach((key) => {
            const bus = parsed.buses[key];
            if (!bus) return;
            const regKey =
              bus.regKey || normaliseRegKey(bus.registration || key);
            if (!regKey) return;
            base.buses[regKey] = {
              regKey,
              ...bus,
              registration: bus.registration || key,
            };
          });
        }
        if (Array.isArray(parsed.pendingChanges)) {
          base.pendingChanges = parsed.pendingChanges
            .map((change) => ({
              ...change,
              regKey:
                change.regKey || normaliseRegKey(change.registration || ""),
            }))
            .filter((change) => Boolean(change.regKey));
        }
      }
    } catch (error) {
      console.warn("Failed to load fleet state:", error);
    }
    return base;
  }

  function saveState() {
    try {
      const serialised = JSON.stringify(state);
      window.localStorage.setItem(STORAGE_KEY, serialised);
    } catch (error) {
      console.warn("Unable to save fleet state:", error);
    }
  }

  function clone(value) {
    if (typeof window.structuredClone === "function") {
      return window.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function mergeOptions(defaults, saved) {
    const merged = {};
    const keys = new Set([
      ...Object.keys(defaults || {}),
      ...Object.keys(saved || {}),
    ]);
    keys.forEach((key) => {
      const defaultList = Array.isArray(defaults?.[key]) ? defaults[key] : [];
      const savedList = Array.isArray(saved?.[key]) ? saved[key] : [];
      merged[key] = Array.from(new Set([...defaultList, ...savedList]));
    });
    return merged;
  }

  function normaliseRegKey(value) {
    return (value || "")
      .toString()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function synchronizeOptionsWithBuses() {
    let updated = false;
    Object.values(state.buses).forEach((bus) => {
      DROPDOWN_FIELDS.forEach((field) => {
        if (field === "extras") {
          if (Array.isArray(bus.extras)) {
            bus.extras.forEach((tag) => {
              updated = ensureOption(field, tag) || updated;
            });
          }
        } else {
          const value = bus[field];
          if (value) {
            updated = ensureOption(field, value) || updated;
          }
        }
      });
    });
    if (updated) {
      sortOptionLists();
      saveState();
    }
  }

  function ensureOption(field, value) {
    if (!value) return false;
    if (!Array.isArray(state.options[field])) {
      state.options[field] = [];
    }
    if (!state.options[field].includes(value)) {
      state.options[field].push(value);
      return true;
    }
    return false;
  }

  function sortOptionLists() {
    Object.keys(state.options).forEach((key) => {
      const list = state.options[key];
      if (Array.isArray(list)) {
        list.sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      }
    });
  }

  function populateAllSelects(elements) {
    const { selects } = elements;
    populateSelect(selects.operator, state.options.operator, {
      placeholder: "Select operator",
    });
    populateSelect(selects.status, state.options.status, {
      placeholder: "Select status",
    });
    populateSelect(selects.wrap, state.options.wrap, {
      placeholder: "Select wrap",
    });
    populateSelect(selects.vehicleType, state.options.vehicleType, {
      placeholder: "Select type",
    });
    populateSelect(selects.doors, state.options.doors, {
      placeholder: "Select doors",
    });
    populateSelect(selects.engineType, state.options.engineType, {
      placeholder: "Select engine type",
    });
    populateSelect(selects.engine, state.options.engine, {
      placeholder: "Select engine",
    });
    populateSelect(selects.chassis, state.options.chassis, {
      placeholder: "Select chassis",
    });
    populateSelect(selects.bodyType, state.options.bodyType, {
      placeholder: "Select body type",
    });
    populateSelect(selects.garage, state.options.garage, {
      placeholder: "Select garage",
    });
    populateSelect(selects.length, state.options.length, {
      placeholder: "Select length",
    });
    populateSelect(selects.extras, state.options.extras, { multiple: true });
  }

  function populateSelect(select, values, options = {}) {
    if (!select) return;
    const { placeholder, multiple } = options;
    const previousSelection = multiple
      ? Array.from(select.selectedOptions).map((option) => option.value)
      : [select.value];
    select.innerHTML = "";
    if (!multiple && placeholder) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.appendChild(option);
    }
    (values || []).forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (multiple) {
        option.selected = previousSelection.includes(value);
      } else if (previousSelection[0] === value) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  function renderTable(elements) {
    const { tableBody, emptyState, searchInput, filterNew, filterRare } =
      elements;
    if (!tableBody) return;

    const query = (searchInput?.value || "").trim().toUpperCase();
    const normalisedQuery = normaliseRegKey(query);
    const onlyNew = Boolean(filterNew?.checked);
    const onlyRare = Boolean(filterRare?.checked);

    const rows = [];
    const entries = Object.values(state.buses)
      .map((bus) => ({ ...bus }))
      .sort((a, b) => a.regKey.localeCompare(b.regKey));

    const hasPendingByReg = new Map();
    state.pendingChanges.forEach((change) => {
      hasPendingByReg.set(change.regKey, true);
    });

    entries.forEach((bus) => {
      if (
        query &&
        !bus.registration.toUpperCase().includes(query) &&
        !bus.regKey.includes(normalisedQuery)
      ) {
        return;
      }
      if (onlyNew && !bus.isNewBus) {
        return;
      }
      if (onlyRare && !bus.isRareWorking) {
        return;
      }
      const pending = Boolean(hasPendingByReg.get(bus.regKey));
      rows.push(createTableRow(bus, pending));
    });

    tableBody.innerHTML = rows.join("");
    if (emptyState) {
      emptyState.hidden = rows.length > 0;
    }
  }

  function createTableRow(bus, hasPending) {
    const badges = [];
    if (bus.isNewBus) {
      badges.push('<span class="badge badge--new">New bus</span>');
    }
    if (bus.isRareWorking) {
      badges.push('<span class="badge badge--rare">Rare working</span>');
    }
    if (hasPending) {
      badges.push(
        '<span class="badge badge--pending" title="Awaiting admin approval">Pending</span>',
      );
    }

    return `
      <tr>
        <th scope="row">
          <span class="fleet-row__reg">${escapeHtml(bus.registration)}</span>
          ${badges.join("")}
        </th>
        <td>${escapeHtml(bus.fleetNumber || "—")}</td>
        <td>${escapeHtml(bus.operator || "—")}</td>
        <td>${renderStatus(bus.status)}</td>
        <td>${escapeHtml(bus.vehicleType || "—")}</td>
        <td>${escapeHtml(bus.garage || "—")}</td>
        <td>${escapeHtml(bus.wrap || "—")}</td>
        <td>${escapeHtml(bus.doors || "—")}</td>
        <td>${escapeHtml(bus.engineType || "—")}</td>
        <td>${escapeHtml(bus.engine || "—")}</td>
        <td>${escapeHtml(bus.chassis || "—")}</td>
        <td>${escapeHtml(bus.bodyType || "—")}</td>
        <td>${formatDate(bus.registrationDate)}</td>
        <td>${renderExtras(bus.extras)}</td>
        <td>${escapeHtml(bus.length || "—")}</td>
        <td>${formatDateTime(bus.lastUpdated)}</td>
      </tr>
    `;
  }

  function renderStatus(status) {
    if (!status) return "—";
    const normalised = status.toLowerCase();
    if (normalised === "active") {
      return `<span class="status-badge status-badge--active">${escapeHtml(status)}</span>`;
    }
    if (normalised === "inactive" || normalised === "stored") {
      return `<span class="status-badge status-badge--inactive">${escapeHtml(status)}</span>`;
    }
    return `<span class="status-badge">${escapeHtml(status)}</span>`;
  }

  function renderExtras(extras) {
    if (!Array.isArray(extras) || extras.length === 0) {
      return "—";
    }
    return `<div class="chip-group">${extras
      .map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`)
      .join("")}</div>`;
  }

  function renderHighlights(elements) {
    const newList = document.getElementById("newBusList");
    const rareList = document.getElementById("rareWorkingList");
    if (!newList || !rareList) return;

    const buses = Object.values(state.buses);
    const newest = buses
      .filter((bus) => bus.isNewBus)
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.registrationDate || 0) -
          new Date(a.createdAt || a.registrationDate || 0),
      );
    const rare = buses
      .filter((bus) => bus.isRareWorking)
      .sort((a, b) => getRareSortTime(b) - getRareSortTime(a));

    newList.innerHTML = newest.length
      ? newest
          .slice(0, 6)
          .map((bus) => highlightItem(bus, "new"))
          .join("")
      : '<li class="pending-empty">No vehicles currently flagged as new.</li>';

    rareList.innerHTML = rare.length
      ? rare
          .slice(0, 6)
          .map((bus) => highlightItem(bus, "rare"))
          .join("")
      : '<li class="pending-empty">No rare workings logged yet.</li>';
  }

  function highlightItem(bus, type) {
    const subtitle =
      type === "rare" ? formatRareHighlight(bus) : formatNewHighlight(bus);
    return `<li><span>${escapeHtml(bus.registration)}</span><small>${escapeHtml(subtitle)}</small></li>`;
  }

  function formatNewHighlight(bus) {
    const parts = [];
    if (bus.operator) {
      parts.push(bus.operator);
    }
    const registrationDate = formatDate(bus.registrationDate);
    if (registrationDate && registrationDate !== "—") {
      parts.push(`Reg. ${registrationDate}`);
    }
    if (!parts.length && bus.garage) {
      parts.push(bus.garage);
    }
    return parts.length ? parts.join(" • ") : "Awaiting details";
  }

  function formatRareHighlight(bus) {
    const latest = getLatestRareWorking(bus);
    if (latest) {
      const dateLabel = formatDate(latest.lastSeen);
      const routeLabel = latest.route || latest.routeKey || "Rare working";
      const parts = [routeLabel];
      if (dateLabel && dateLabel !== "—") {
        parts.push(dateLabel);
      }
      return parts.join(" • ");
    }
    if (bus.lastSeenRoute) {
      const dateLabel = formatDate(bus.lastSeenAt);
      const parts = [bus.lastSeenRoute];
      if (dateLabel && dateLabel !== "—") {
        parts.push(dateLabel);
      }
      return parts.join(" • ");
    }
    return "Awaiting live sightings";
  }

  function getRareSortTime(bus) {
    const latest = getLatestRareWorking(bus);
    if (latest) {
      const date = new Date(latest.lastSeen || 0);
      if (!Number.isNaN(date.getTime())) {
        return date.getTime();
      }
    }
    const fallback = new Date(bus.lastUpdated || 0);
    return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
  }

  function getLatestRareWorking(bus) {
    if (!bus || !Array.isArray(bus.rareWorkings) || !bus.rareWorkings.length) {
      return null;
    }
    return bus.rareWorkings
      .slice()
      .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))[0];
  }

  function updateStats(elements) {
    const total = Object.keys(state.buses).length;
    const newCount = Object.values(state.buses).filter(
      (bus) => bus.isNewBus,
    ).length;
    const rareCount = Object.values(state.buses).filter(
      (bus) => bus.isRareWorking,
    ).length;
    const pending = state.pendingChanges.length;

    setText("fleetTotal", total);
    setText("fleetNew", newCount);
    setText("fleetRare", rareCount);
    setText("fleetPending", pending);
  }

  function updatePendingBadge(elements) {
    if (!elements.pendingCount) return;
    const count = state.pendingChanges.length;
    elements.pendingCount.textContent =
      count === 1 ? "1 pending" : `${count} pending`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = String(value);
    }
  }

  function submitForm(elements) {
    const { fleetForm, formFeedback, selects, registrationInput } = elements;
    if (!fleetForm) return;

    const formData = new FormData(fleetForm);
    const registrationRaw = (formData.get("registration") || "")
      .toString()
      .trim();
    const registration = registrationRaw.toUpperCase();
    const regKey = normaliseRegKey(registration);

    if (!registration || !regKey) {
      setFormFeedback(
        formFeedback,
        "Please enter a valid registration.",
        "error",
      );
      return;
    }

    const existing = state.buses[regKey];
    const payload = buildPayload(
      formData,
      registration,
      regKey,
      existing,
      selects,
    );

    if (!existing) {
      state.buses[regKey] = payload;
      synchronizeOptionsWithBus(payload);
      sortOptionLists();
      saveState();
      populateAllSelects(elements);
      renderTable(elements);
      renderHighlights(elements);
      updateStats(elements);
      showToast(
        elements.toast,
        `Created new profile for ${registration}.`,
        "success",
      );
      setFormFeedback(
        formFeedback,
        `Created new profile for ${registration}.`,
        "success",
      );
      prefillForm(elements, payload);
      return;
    }

    const pendingChange = {
      id: `pending-${Date.now()}`,
      regKey,
      registration,
      submittedAt: new Date().toISOString(),
      data: payload,
    };

    const existingIndex = state.pendingChanges.findIndex(
      (change) => change.regKey === regKey,
    );
    if (existingIndex >= 0) {
      state.pendingChanges[existingIndex] = pendingChange;
    } else {
      state.pendingChanges.push(pendingChange);
    }

    saveState();
    renderTable(elements);
    updateStats(elements);
    updatePendingBadge(elements);
    if (isAdmin) {
      renderPendingList(elements);
    }
    showToast(
      elements.toast,
      `Update for ${registration} submitted for approval.`,
      "info",
    );
    setFormFeedback(
      formFeedback,
      `Update for ${registration} submitted for approval.`,
      "pending",
    );
  }

  function buildPayload(formData, registration, regKey, existing, selects) {
    const extrasSelected = Array.from(
      selects.extras?.selectedOptions || [],
    ).map((option) => option.value);
    const isNewBus = Boolean(formData.get("isNewBus"));
    const isRareWorking = Boolean(formData.get("isRareWorking"));
    const extrasSet = new Set(extrasSelected);
    if (isNewBus) extrasSet.add("New Bus");
    if (isRareWorking) extrasSet.add("Rare Working");

    const registrationDateInput = formData.get("registrationDate");
    const todayISO = new Date().toISOString().slice(0, 10);
    let registrationDate = (registrationDateInput || "").toString();
    if (!existing && !registrationDate) {
      registrationDate = todayISO;
    }
    if (!registrationDate && existing) {
      registrationDate = existing.registrationDate || "";
    }

    const nowIso = new Date().toISOString();

    return {
      regKey,
      registration,
      fleetNumber: (formData.get("fleetNumber") || "").toString().trim(),
      operator: formData.get("operator") || "",
      status: formData.get("status") || "",
      wrap: formData.get("wrap") || "",
      vehicleType: formData.get("vehicleType") || "",
      doors: formData.get("doors") || "",
      engineType: formData.get("engineType") || "",
      engine: formData.get("engine") || "",
      chassis: formData.get("chassis") || "",
      bodyType: formData.get("bodyType") || "",
      registrationDate,
      garage: formData.get("garage") || "",
      extras: Array.from(extrasSet),
      length: formData.get("length") || "",
      isNewBus,
      isRareWorking,
      createdAt: existing?.createdAt || nowIso,
      lastUpdated: nowIso,
    };
  }

  function synchronizeOptionsWithBus(bus) {
    DROPDOWN_FIELDS.forEach((field) => {
      if (field === "extras") {
        (bus.extras || []).forEach((tag) => ensureOption(field, tag));
      } else {
        ensureOption(field, bus[field]);
      }
    });
  }

  function renderPendingList(elements) {
    const { pendingContainer, adminPanel } = elements;
    if (!pendingContainer) return;

    if (!isAdmin) {
      pendingContainer.innerHTML =
        '<p class="pending-empty">Enter the access code to review pending changes.</p>';
      return;
    }

    if (!state.pendingChanges.length) {
      pendingContainer.innerHTML =
        '<p class="pending-empty">No updates waiting for approval.</p>';
      return;
    }

    const cards = state.pendingChanges
      .slice()
      .sort(
        (a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0),
      )
      .map((change) => pendingCard(change))
      .join("");

    pendingContainer.innerHTML = cards;
  }

  function pendingCard(change) {
    const current = state.buses[change.regKey];
    const diffRows = buildDiffRows(current, change.data || {});
    const submitted = formatDateTime(change.submittedAt);

    return `
      <article class="pending-card">
        <div class="pending-card__header">
          <h4>${escapeHtml(change.registration)}</h4>
          <span class="pending-card__meta">Submitted ${escapeHtml(submitted || "recently")}</span>
        </div>
        <ul class="pending-card__changes">
          ${diffRows.join("")}
        </ul>
        <div class="pending-card__actions">
          <button class="button-primary" data-action="approve" data-id="${escapeHtml(change.id)}">Approve</button>
          <button class="button-tertiary" data-action="reject" data-id="${escapeHtml(change.id)}">Reject</button>
        </div>
      </article>
    `;
  }

  function buildDiffRows(current, proposed) {
    const rows = [];
    const fields = [
      "fleetNumber",
      "operator",
      "status",
      "wrap",
      "vehicleType",
      "doors",
      "engineType",
      "engine",
      "chassis",
      "bodyType",
      "registrationDate",
      "garage",
      "extras",
      "length",
      "isNewBus",
      "isRareWorking",
    ];

    fields.forEach((field) => {
      const proposedValue = proposed[field];
      const currentValue = current ? current[field] : undefined;
      if (valuesEqual(currentValue, proposedValue)) {
        return;
      }
      rows.push(`
        <li>
          <span class="pending-card__label">${escapeHtml(FIELD_LABELS[field] || field)}</span>
          <span class="pending-card__value">
            <span>
              <strong>${escapeHtml(formatFieldValue(proposedValue, field))}</strong>
              <span class="arrow" aria-hidden="true">&larr; from</span>
              <span>${escapeHtml(formatFieldValue(currentValue, field))}</span>
            </span>
          </span>
        </li>
      `);
    });

    if (!rows.length) {
      rows.push(
        '<li><span class="pending-card__label">No changes detected</span></li>',
      );
    }

    return rows;
  }

  function formatFieldValue(value, field) {
    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : "—";
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (
      field === "registrationDate" ||
      field === "lastUpdated" ||
      field === "createdAt"
    ) {
      return formatDate(value);
    }
    return value ? value.toString() : "—";
  }

  function valuesEqual(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      const arrA = Array.isArray(a) ? [...a].sort() : [];
      const arrB = Array.isArray(b) ? [...b].sort() : [];
      return arrA.join("|") === arrB.join("|");
    }
    return (a ?? "") === (b ?? "");
  }

  function approvePending(elements, id) {
    const index = state.pendingChanges.findIndex((change) => change.id === id);
    if (index === -1) return;
    const change = state.pendingChanges[index];
    const regKey = change.regKey;
    state.buses[regKey] = {
      ...state.buses[regKey],
      ...change.data,
      regKey,
      registration: change.registration,
      lastUpdated: new Date().toISOString(),
    };
    synchronizeOptionsWithBus(state.buses[regKey]);
    state.pendingChanges.splice(index, 1);
    sortOptionLists();
    saveState();
    populateAllSelects(elements);
    renderTable(elements);
    renderHighlights(elements);
    updateStats(elements);
    updatePendingBadge(elements);
    renderPendingList(elements);
    showToast(
      elements.toast,
      `Update for ${change.registration} approved.`,
      "success",
    );
  }

  function rejectPending(elements, id) {
    const index = state.pendingChanges.findIndex((change) => change.id === id);
    if (index === -1) return;
    const change = state.pendingChanges[index];
    state.pendingChanges.splice(index, 1);
    saveState();
    updatePendingBadge(elements);
    renderPendingList(elements);
    showToast(
      elements.toast,
      `Update for ${change.registration} rejected.`,
      "info",
    );
  }

  function toggleAdmin(elements) {
    const { adminToggle, adminPanel } = elements;
    if (!adminToggle || !adminPanel) return;

    if (!isAdmin) {
      const code = window.prompt("Enter the admin access code to continue");
      if (code !== ADMIN_CODE) {
        showToast(elements.toast, "Incorrect admin code.", "error");
        return;
      }
      isAdmin = true;
      adminToggle.textContent = "Hide admin tools";
      adminToggle.setAttribute("aria-expanded", "true");
      adminPanel.hidden = false;
      renderPendingList(elements);
      return;
    }

    const expanded = adminToggle.getAttribute("aria-expanded") === "true";
    adminToggle.setAttribute("aria-expanded", String(!expanded));
    adminPanel.hidden = expanded;
    adminToggle.textContent = expanded
      ? "Access admin tools"
      : "Hide admin tools";
    if (!expanded) {
      renderPendingList(elements);
    }
  }

  function renderOptionList(elements, field) {
    const { optionList } = elements;
    if (!optionList) return;
    const options = state.options[field] || [];
    if (!options.length) {
      optionList.innerHTML =
        '<li class="option-empty">No options yet for this field.</li>';
      return;
    }
    optionList.innerHTML = options
      .map((value) => `<li>${escapeHtml(value)}</li>`)
      .join("");
  }

  function addNewOption(elements) {
    const { optionForm, optionCategory } = elements;
    if (!optionForm || !optionCategory) return;
    const formData = new FormData(optionForm);
    const field = formData.get("category");
    let value = (formData.get("value") || "").toString().trim();
    if (!field || !value) {
      showToast(
        elements.toast,
        "Choose a field and enter a value first.",
        "error",
      );
      return;
    }
    value = capitalise(value);
    if (!Array.isArray(state.options[field])) {
      state.options[field] = [];
    }
    if (state.options[field].includes(value)) {
      showToast(elements.toast, "That option already exists.", "info");
      return;
    }
    state.options[field].push(value);
    sortOptionLists();
    saveState();
    populateAllSelects(elements);
    renderOptionList(elements, field);
    optionForm.reset();
    optionCategory.value = field;
    showToast(
      elements.toast,
      `Added "${value}" to ${FIELD_LABELS[field] || field}.`,
      "success",
    );
  }

  function processIngestTextarea(elements) {
    const { ingestInput } = elements;
    if (!ingestInput) return;
    const raw = ingestInput.value || "";
    if (!raw.trim()) {
      setIngestFeedback(
        elements.ingestFeedback,
        "Paste a TfL arrivals response first.",
        "error",
      );
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      setIngestFeedback(
        elements.ingestFeedback,
        "The TfL arrivals payload is not valid JSON.",
        "error",
      );
      return;
    }
    handleArrivalRecords(elements, parsed, "manual");
  }

  function clearIngest(elements) {
    const { ingestInput, ingestFeedback } = elements;
    if (ingestInput) {
      ingestInput.value = "";
    }
    setIngestFeedback(ingestFeedback, "", "");
  }

  function fetchArrivalsFromTfL(elements) {
    const {
      ingestIds,
      ingestAppId,
      ingestAppKey,
      ingestFeedback,
      ingestInput,
    } = elements;
    const idsNormalised = formatIdsForInput(ingestIds?.value || "");
    if (!idsNormalised) {
      setIngestFeedback(
        ingestFeedback,
        "Enter at least one registration to query the TfL API.",
        "error",
      );
      return;
    }

    if (ingestIds) {
      ingestIds.value = idsNormalised;
    }

    const appId = (ingestAppId?.value || "").trim();
    const appKey = (ingestAppKey?.value || "").trim();
    const url = new URL(
      `https://api.tfl.gov.uk/Vehicle/${encodeURIComponent(idsNormalised)}/Arrivals`,
    );
    if (appId) {
      url.searchParams.set("app_id", appId);
    }
    if (appKey) {
      url.searchParams.set("app_key", appKey);
    }

    setIngestFeedback(ingestFeedback, "Contacting TfL…", "pending");

    fetch(url.toString())
      .then((response) => {
        if (!response.ok) {
          throw new Error(`TfL responded with status ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (ingestInput) {
          ingestInput.value = JSON.stringify(data, null, 2);
        }
        handleArrivalRecords(elements, data, "api");
      })
      .catch((error) => {
        console.warn("Failed to fetch TfL arrivals", error);
        setIngestFeedback(
          ingestFeedback,
          "Unable to fetch from TfL. Paste a JSON response instead.",
          "error",
        );
      });
  }

  function handleArrivalRecords(elements, payload, source) {
    const { ingestFeedback, optionCategory } = elements;
    const records = extractArrivalRecords(payload);
    if (!records.length) {
      setIngestFeedback(
        ingestFeedback,
        "No vehicle records were found in the supplied data.",
        "error",
      );
      return;
    }

    const summary = applyArrivals(records);
    if (!summary.total) {
      setIngestFeedback(
        ingestFeedback,
        "No registrations could be processed from the payload.",
        "error",
      );
      return;
    }

    sortOptionLists();
    saveState();
    populateAllSelects(elements);
    renderTable(elements);
    renderHighlights(elements);
    updateStats(elements);
    updatePendingBadge(elements);
    renderOptionList(elements, optionCategory?.value || "operator");

    const parts = [
      `Processed ${summary.total} arrival${summary.total === 1 ? "" : "s"}.`,
    ];
    if (summary.created) {
      parts.push(
        `${summary.created} new profile${summary.created === 1 ? "" : "s"} created automatically.`,
      );
    }
    if (summary.rare) {
      parts.push(
        `${summary.rare} rare working${summary.rare === 1 ? "" : "s"} detected.`,
      );
    }

    setIngestFeedback(ingestFeedback, parts.join(" "), "success");
    showToast(
      elements.toast,
      source === "api"
        ? "TfL arrivals processed successfully."
        : "Vehicle arrivals imported successfully.",
      "success",
    );
  }

  function applyArrivals(records) {
    const summary = { total: 0, created: 0, rare: 0 };
    records.forEach((record) => {
      const result = applyArrivalRecord(record);
      if (!result) return;
      summary.total += 1;
      if (result.created) summary.created += 1;
      if (result.rare) summary.rare += 1;
    });
    return summary;
  }

  function applyArrivalRecord(arrival) {
    if (!arrival || typeof arrival !== "object") {
      return null;
    }
    const vehicleId = (arrival.vehicleId || arrival.vrm || arrival.id || "")
      .toString()
      .trim();
    const regKey = normaliseRegKey(vehicleId);
    if (!regKey) {
      return null;
    }

    const registration = formatRegistrationForDisplay(vehicleId, regKey);
    const seenIso = parseArrivalTimestamp(arrival);
    const routeKey = getRouteKey(arrival.lineId, arrival.lineName);
    const routeLabel = formatRouteLabel(arrival.lineName, arrival.lineId);

    const bus = state.buses[regKey];
    if (!bus) {
      const createdBus = createBusFromArrival({
        regKey,
        registration,
        seenIso,
        routeKey,
        routeLabel,
      });
      state.buses[regKey] = createdBus;
      synchronizeOptionsWithBus(createdBus);
      return { created: true, rare: false };
    }

    const rare = updateBusFromArrival(bus, {
      registration,
      seenIso,
      routeKey,
      routeLabel,
    });
    synchronizeOptionsWithBus(bus);
    return { created: false, rare };
  }

  function createBusFromArrival({
    regKey,
    registration,
    seenIso,
    routeKey,
    routeLabel,
  }) {
    const observed = seenIso || new Date().toISOString();
    const now = new Date().toISOString();
    const registrationDate = observed.slice(0, 10);
    const routeHistory = {};
    if (routeKey) {
      routeHistory[routeKey] = observed;
    }
    return {
      regKey,
      registration,
      fleetNumber: "",
      operator: "",
      status: "Active",
      wrap: "",
      vehicleType: "",
      doors: "",
      engineType: "",
      engine: "",
      chassis: "",
      bodyType: "",
      registrationDate,
      garage: "",
      extras: ["New Bus"],
      length: "",
      isNewBus: true,
      isRareWorking: false,
      createdAt: observed,
      lastUpdated: now,
      lastSeenAt: observed,
      lastSeenRoute: routeLabel || "",
      routeHistory,
      rareWorkings: [],
    };
  }

  function updateBusFromArrival(
    bus,
    { registration, seenIso, routeKey, routeLabel },
  ) {
    const now = new Date().toISOString();
    if (
      registration &&
      (!bus.registration || bus.registration === bus.regKey)
    ) {
      bus.registration = registration;
    }
    if (!bus.registrationDate && seenIso) {
      bus.registrationDate = seenIso.slice(0, 10);
    }
    bus.lastUpdated = now;
    if (seenIso) {
      bus.lastSeenAt = seenIso;
    }
    if (routeLabel) {
      bus.lastSeenRoute = routeLabel;
    }
    if (!bus.routeHistory) {
      bus.routeHistory = {};
    }

    let recordedRare = false;
    if (routeKey) {
      const seenDate = normaliseDate(seenIso) || new Date();
      const seenTimestamp = seenDate.toISOString();
      const previous = bus.routeHistory[routeKey];
      bus.routeHistory[routeKey] = seenTimestamp;
      if (!previous) {
        // First appearance on this route counts as a rare working.
        recordedRare = recordRareWorking(
          bus,
          routeKey,
          routeLabel,
          seenTimestamp,
        );
      } else {
        const previousDate = new Date(previous);
        if (
          Number.isFinite(previousDate.getTime()) &&
          seenDate.getTime() - previousDate.getTime() >
            RARE_WORKING_THRESHOLD_MS
        ) {
          recordedRare = recordRareWorking(
            bus,
            routeKey,
            routeLabel,
            seenTimestamp,
          );
        }
      }
    }

    if (Array.isArray(bus.rareWorkings) && bus.rareWorkings.length) {
      bus.isRareWorking = true;
      if (!Array.isArray(bus.extras)) {
        bus.extras = [];
      }
      if (!bus.extras.includes("Rare Working")) {
        bus.extras.push("Rare Working");
      }
    }

    return recordedRare;
  }

  function recordRareWorking(bus, routeKey, routeLabel, seenIso) {
    if (!routeKey) return false;
    if (!Array.isArray(bus.rareWorkings)) {
      bus.rareWorkings = [];
    }
    const label = routeLabel || routeKey;
    const existing = bus.rareWorkings.find(
      (entry) => entry.routeKey === routeKey,
    );
    if (existing) {
      existing.route = label;
      existing.lastSeen = seenIso;
    } else {
      bus.rareWorkings.push({ routeKey, route: label, lastSeen: seenIso });
    }
    bus.isRareWorking = true;
    if (!Array.isArray(bus.extras)) {
      bus.extras = [];
    }
    if (!bus.extras.includes("Rare Working")) {
      bus.extras.push("Rare Working");
    }
    return true;
  }

  function extractArrivalRecords(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.arrivals)) return payload.arrivals;
    if (Array.isArray(payload.result)) return payload.result;
    if (Array.isArray(payload.records)) return payload.records;
    if (typeof payload === "object") {
      const arrayEntry = Object.values(payload).find((value) =>
        Array.isArray(value),
      );
      if (Array.isArray(arrayEntry)) {
        return arrayEntry;
      }
    }
    return [];
  }

  function parseArrivalTimestamp(arrival) {
    if (!arrival || typeof arrival !== "object") {
      return new Date().toISOString();
    }
    const candidates = [
      arrival.timestamp,
      arrival.expectedArrival,
      arrival.timeToLive,
    ];
    for (const value of candidates) {
      const date = normaliseDate(value);
      if (date) {
        return date.toISOString();
      }
    }
    return new Date().toISOString();
  }

  function normaliseDate(value) {
    if (!value && value !== 0) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  function formatRegistrationForDisplay(raw, regKey) {
    const text = (raw || "").toString().trim();
    if (!text) {
      return formatRegistrationSpacing(regKey);
    }
    if (text.includes(" ")) {
      return text.toUpperCase();
    }
    return formatRegistrationSpacing(text.toUpperCase());
  }

  function formatRegistrationSpacing(value) {
    const text = (value || "").toString().trim().toUpperCase();
    if (!text) return "";
    if (text.length === 7) {
      return `${text.slice(0, 4)} ${text.slice(4)}`;
    }
    if (text.length > 4) {
      return `${text.slice(0, text.length - 3)} ${text.slice(-3)}`;
    }
    return text;
  }

  function getRouteKey(lineId, lineName) {
    const id = (lineId || "").toString().trim();
    if (id) {
      return id.toUpperCase();
    }
    const name = (lineName || "").toString().trim();
    return name ? name.toUpperCase() : "";
  }

  function formatRouteLabel(lineName, lineId) {
    const raw = (lineName || lineId || "").toString().trim();
    if (!raw) {
      return "";
    }
    if (/^route\s+/i.test(raw)) {
      const clean = raw.replace(/^route\s+/i, "").trim();
      return `Route ${clean}`.trim();
    }
    return `Route ${raw}`.trim();
  }

  function formatIdsForInput(value) {
    return (value || "")
      .split(/[\s,]+/)
      .map((part) => normaliseRegKey(part))
      .filter(Boolean)
      .join(",");
  }

  function setIngestFeedback(element, message, stateValue) {
    if (!element) return;
    element.textContent = message;
    if (stateValue) {
      element.dataset.state = stateValue;
    } else {
      delete element.dataset.state;
    }
  }

  function clearForm(elements) {
    const { fleetForm } = elements;
    if (!fleetForm) return;
    fleetForm.reset();
  }

  function prefillForm(elements, bus) {
    const { registrationInput, selects } = elements;
    const registration = registrationInput?.value || bus?.registration;
    const regKey = normaliseRegKey(registration || "");
    const record = bus || state.buses[regKey];
    if (!record) {
      clearFormKeepRegistration(elements);
      return;
    }

    if (registrationInput) {
      registrationInput.value = record.registration || registrationInput.value;
    }

    setValue(selects.fleetNumber, record.fleetNumber || "");
    setSelectValue(selects.operator, record.operator);
    setSelectValue(selects.status, record.status);
    setSelectValue(selects.wrap, record.wrap);
    setSelectValue(selects.vehicleType, record.vehicleType);
    setSelectValue(selects.doors, record.doors);
    setSelectValue(selects.engineType, record.engineType);
    setSelectValue(selects.engine, record.engine);
    setSelectValue(selects.chassis, record.chassis);
    setSelectValue(selects.bodyType, record.bodyType);
    setDateValue(selects.registrationDate, record.registrationDate);
    setSelectValue(selects.garage, record.garage);
    setMultiSelect(selects.extras, record.extras || []);
    setSelectValue(selects.length, record.length);
    if (selects.isNewBus) {
      selects.isNewBus.checked = Boolean(record.isNewBus);
    }
    if (selects.isRareWorking) {
      selects.isRareWorking.checked = Boolean(record.isRareWorking);
    }
  }

  function clearFormKeepRegistration(elements) {
    const { fleetForm, registrationInput } = elements;
    if (!fleetForm) return;
    const registration = registrationInput ? registrationInput.value : "";
    fleetForm.reset();
    if (registrationInput) {
      registrationInput.value = registration.toUpperCase();
    }
  }

  function setValue(input, value) {
    if (!input) return;
    input.value = value || "";
  }

  function setSelectValue(select, value) {
    if (!select) return;
    if (
      value &&
      !Array.from(select.options).some((option) => option.value === value)
    ) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = value || "";
  }

  function setMultiSelect(select, values) {
    if (!select) return;
    const set = new Set(values);
    Array.from(select.options).forEach((option) => {
      option.selected = set.has(option.value);
    });
  }

  function setDateValue(input, value) {
    if (!input) return;
    if (!value) {
      input.value = "";
      return;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      input.value = date.toISOString().slice(0, 10);
    } else {
      input.value = value;
    }
  }

  function setFormFeedback(element, message, stateValue) {
    if (!element) return;
    element.textContent = message;
    if (stateValue) {
      element.dataset.state = stateValue;
    } else {
      delete element.dataset.state;
    }
  }

  function showToast(element, message, variant = "info") {
    if (!element) return;
    element.textContent = message;
    element.dataset.visible = "true";
    element.dataset.variant = variant;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      element.dataset.visible = "false";
    }, 3500);
  }

  function capitalise(value) {
    return value
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) {
      return "";
    }
    return value
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return escapeHtml(value.toString());
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value.toString();
    }
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
})();
