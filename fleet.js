(function () {
  "use strict";

  function resolveApiBase(defaultBase = "/api") {
    const rawBase = typeof window !== "undefined" ? window.__ROUTEFLOW_API_BASE__ : undefined;
    if (typeof rawBase !== "string") {
      return defaultBase;
    }
    const trimmed = rawBase.trim();
    if (!trimmed || trimmed === "/") {
      return defaultBase;
    }
    const normalised = trimmed.replace(/\/+$/, "");
    return normalised || defaultBase;
  }

  const API_BASE_URL = resolveApiBase("/api");

  const FALLBACK_ADMIN_OVERRIDES = new Map([
    [
      "emKTnjbKIKfBjQzQEvpUOWOpFKc2",
      {
        email: "nmorris210509@gmail.com",
      },
    ],
  ]);

  const normaliseEmail = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");
  const normaliseTextValue = (value) => (typeof value === "string" ? value.trim() : "");

  const fallbackHasOverride = (userOrUid) => {
    if (!userOrUid) return false;
    const uid = typeof userOrUid === "string" ? userOrUid : userOrUid?.uid;
    if (!uid) return false;
    const override = FALLBACK_ADMIN_OVERRIDES.get(uid);
    if (!override) return false;
    if (override.email && typeof userOrUid !== "string") {
      const currentEmail = normaliseEmail(userOrUid?.email);
      const expectedEmail = normaliseEmail(override.email);
      if (currentEmail && expectedEmail && currentEmail !== expectedEmail) {
        return false;
      }
    }
    return true;
  };

  const resolveAdminStatus = (user, tokenResult) => {
    const helpers = window.RouteflowAdmin;
    if (helpers?.isAdminUser) {
      try {
        return Boolean(helpers.isAdminUser(user, tokenResult));
      } catch (error) {
        console.warn(
          "Fleet admin: helper-based admin check failed, falling back to bundled overrides.",
          error,
        );
      }
    }
    if (tokenResult?.claims?.admin) {
      return true;
    }
    if (helpers?.hasOverride) {
      try {
        return Boolean(helpers.hasOverride(user));
      } catch (error) {
        console.warn(
          "Fleet admin: override lookup failed, falling back to bundled overrides.",
          error,
        );
      }
    }
    return fallbackHasOverride(user);
  };

  function getFirebaseConfig() {
    const config = window.__ROUTEFLOW_CONFIG__?.firebase;
    if (!config?.apiKey) {
      console.error("Firebase configuration is missing. Admin features are unavailable.");
      return null;
    }
    return config;
  }

  function ensureAuthInstance() {
    const routeflowAuth = window.RouteflowAuth;
    if (routeflowAuth?.ensure) {
      try {
        return Promise.resolve(routeflowAuth.ensure());
      } catch (error) {
        return Promise.reject(error);
      }
    }
    if (typeof window.ensureFirebaseAuth === "function") {
      try {
        return Promise.resolve(window.ensureFirebaseAuth());
      } catch (error) {
        return Promise.reject(error);
      }
    }
    const fb = window.firebase;
    if (fb && typeof fb.auth === "function") {
      try {
        if (!fb.apps.length) {
          const config = getFirebaseConfig();
          if (!config) {
            return Promise.reject(new Error("Firebase configuration not available."));
          }
          fb.initializeApp(config);
        }
        return Promise.resolve(fb.auth());
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return Promise.resolve(null);
  }

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
        gallery: [],
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
        gallery: [],
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
        gallery: [],
      },
      YX23LME: {
        regKey: "YX23LME",
        registration: "YX23 LME",
        fleetNumber: "EV27",
        operator: "Abellio London",
        status: "Active",
        wrap: "Special event",
        vehicleType: "Single Decker",
        doors: "2",
        engineType: "Electric",
        engine: "Alexander Dennis Enviro400EV",
        chassis: "Alexander Dennis",
        bodyType: "Caetano e.City Gold",
        registrationDate: "2023-07-15",
        garage: "WJ (Waterloo)",
        extras: ["New Bus", "Route Branding"],
        length: "12.4m",
        isNewBus: true,
        isRareWorking: false,
        createdAt: "2023-07-15T00:00:00.000Z",
        lastUpdated: "2024-04-27T13:12:00.000Z",
        gallery: [],
      },
      BX71CUD: {
        regKey: "BX71CUD",
        registration: "BX71 CUD",
        fleetNumber: "HV411",
        operator: "Arriva London",
        status: "Active",
        wrap: "Standard",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Hybrid",
        engine: "Volvo B5LH",
        chassis: "Volvo B5LH",
        bodyType: "Wright Gemini 3",
        registrationDate: "2021-09-05",
        garage: "NX (New Cross)",
        extras: ["Night Bus Allocation"],
        length: "11.2m",
        isNewBus: false,
        isRareWorking: true,
        createdAt: "2021-09-05T00:00:00.000Z",
        lastUpdated: "2024-05-08T08:42:00.000Z",
        gallery: [],
      },
      SK21BGO: {
        regKey: "SK21BGO",
        registration: "SK21 BGO",
        fleetNumber: "15360",
        operator: "Stagecoach London",
        status: "Active",
        wrap: "Standard",
        vehicleType: "Single Decker",
        doors: "2",
        engineType: "Hydrogen",
        engine: "Wrightbus Hydrogen",
        chassis: "Wrightbus StreetDeck",
        bodyType: "Wright StreetDeck",
        registrationDate: "2021-05-18",
        garage: "LI (Leyton)",
        extras: ["Training Vehicle"],
        length: "10.2m",
        isNewBus: false,
        isRareWorking: false,
        createdAt: "2021-05-18T00:00:00.000Z",
        lastUpdated: "2024-02-19T11:05:00.000Z",
        gallery: [],
      },
      YX68FFT: {
        regKey: "YX68FFT",
        registration: "YX68 FFT",
        fleetNumber: "TEH1235",
        operator: "Metroline",
        status: "Active",
        wrap: "Advertising wrap",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Hybrid",
        engine: "Scania N250UD",
        chassis: "Scania N-series",
        bodyType: "Alexander Dennis Enviro400 MMC",
        registrationDate: "2019-01-04",
        garage: "HT (Holloway)",
        extras: ["Route Branding"],
        length: "11.2m",
        isNewBus: false,
        isRareWorking: false,
        createdAt: "2019-01-04T00:00:00.000Z",
        lastUpdated: "2024-03-02T17:28:00.000Z",
        gallery: [],
      },
      LF67XYZ: {
        regKey: "LF67XYZ",
        registration: "LF67 XYZ",
        fleetNumber: "EH201",
        operator: "Go-Ahead London",
        status: "Stored",
        wrap: "Heritage",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Electric",
        engine: "Alexander Dennis Enviro400EV",
        chassis: "Alexander Dennis",
        bodyType: "Alexander Dennis Enviro400 MMC",
        registrationDate: "2017-11-30",
        garage: "QB (Battersea)",
        extras: ["Heritage Fleet"],
        length: "10.6m",
        isNewBus: false,
        isRareWorking: false,
        createdAt: "2017-11-30T00:00:00.000Z",
        lastUpdated: "2024-01-14T12:01:00.000Z",
        gallery: [],
      },
      BV70DFP: {
        regKey: "BV70DFP",
        registration: "BV70 DFP",
        fleetNumber: "4085",
        operator: "Abellio London",
        status: "Active",
        wrap: "Standard",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Electric",
        engine: "Alexander Dennis Enviro400EV",
        chassis: "Alexander Dennis",
        bodyType: "Alexander Dennis Enviro400 MMC",
        registrationDate: "2020-10-22",
        garage: "QB (Battersea)",
        extras: ["Route Branding"],
        length: "11.2m",
        isNewBus: false,
        isRareWorking: false,
        createdAt: "2020-10-22T00:00:00.000Z",
        lastUpdated: "2024-04-11T06:58:00.000Z",
        gallery: [],
      },
      YX70KCU: {
        regKey: "YX70KCU",
        registration: "YX70 KCU",
        fleetNumber: "VMH2645",
        operator: "Metroline",
        status: "Active",
        wrap: "Special event",
        vehicleType: "Double Decker",
        doors: "2",
        engineType: "Hybrid",
        engine: "Volvo B5LH",
        chassis: "Volvo B5LH",
        bodyType: "Wright Gemini 3",
        registrationDate: "2020-09-18",
        garage: "HT (Holloway)",
        extras: ["Rare Working"],
        length: "11.2m",
        isNewBus: false,
        isRareWorking: true,
        createdAt: "2020-09-18T00:00:00.000Z",
        lastUpdated: "2024-05-19T19:22:00.000Z",
        gallery: [],
      },
    },
    pendingChanges: [],
  };

  const state = clone(DEFAULT_STATE);
  const STORAGE_NAMESPACE = "routeflow";
  const FLEET_STORAGE_KEY = `${STORAGE_NAMESPACE}.fleetState.v1`;
  const FLEET_STORAGE_VERSION = 1;

  const fleetStorage = resolveFleetStorage();
  let offlineMode = false;
  let offlineNoticeShown = false;

  let isAdmin = false;
  let currentAdminUser = null;
  let adminAuthToken = null;
  let cachedElements = null;
  let toastTimeout = null;
  let isInitialised = false;
  const registrationLookupPromises = new Map();
  let lastPrefillRequestId = 0;

  let authSubscriptionStarted = false;

  const MAX_IMAGE_UPLOADS = 3;
  const MAX_IMAGE_BYTES = 2_097_152;

  function resolveFleetStorage() {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const storage = window.localStorage;
      if (!storage) {
        return null;
      }
      const testKey = `${FLEET_STORAGE_KEY}.test`;
      storage.setItem(testKey, "1");
      storage.removeItem(testKey);
      return storage;
    } catch (error) {
      console.warn("Fleet storage unavailable:", error);
      return null;
    }
  }

  function cloneForStorage(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return Array.isArray(value) ? [] : {};
    }
  }

  function createFleetStateSnapshot(source) {
    if (!source || typeof source !== "object") {
      return null;
    }

    const optionsSource =
      source.options && typeof source.options === "object"
        ? source.options
        : {};
    const busesSource =
      source.buses && typeof source.buses === "object" ? source.buses : {};
    const pendingSource = Array.isArray(source.pendingChanges)
      ? source.pendingChanges
      : [];

    const busesSnapshot = {};
    Object.keys(busesSource).forEach((key) => {
      const bus = busesSource[key];
      if (!bus || typeof bus !== "object") {
        return;
      }
      const { images, ...rest } = bus;
      busesSnapshot[key] = cloneForStorage(rest);
    });

    const pendingSnapshot = pendingSource
      .map((change) => {
        if (!change || typeof change !== "object") {
          return null;
        }
        const { images, ...rest } = change;
        return cloneForStorage(rest);
      })
      .filter(Boolean);

    return {
      options: cloneForStorage(optionsSource),
      buses: busesSnapshot,
      pendingChanges: pendingSnapshot,
    };
  }

  function persistFleetStateSnapshot(source = state) {
    if (!fleetStorage) {
      return;
    }
    const snapshot = createFleetStateSnapshot(source);
    if (!snapshot) {
      return;
    }
    try {
      fleetStorage.setItem(
        FLEET_STORAGE_KEY,
        JSON.stringify({
          version: FLEET_STORAGE_VERSION,
          savedAt: new Date().toISOString(),
          state: snapshot,
        }),
      );
    } catch (error) {
      console.warn("Fleet storage: failed to persist state", error);
    }
  }

  function persistCurrentFleetState() {
    persistFleetStateSnapshot(state);
  }

  function loadLocalFleetStateSnapshot() {
    if (!fleetStorage) {
      return null;
    }
    try {
      const raw = fleetStorage.getItem(FLEET_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const data =
        parsed && typeof parsed === "object" ? parsed.state || parsed : null;
      if (!data) {
        return null;
      }
      return createFleetStateSnapshot(data);
    } catch (error) {
      console.warn("Fleet storage: failed to read saved state", error);
      return null;
    }
  }

  function initialiseLocalFleetState() {
    const snapshot = loadLocalFleetStateSnapshot();
    if (!snapshot) {
      return false;
    }
    applyFleetState(snapshot);
    sortOptionLists();
    return true;
  }

  function shouldUseOfflineFallback(error) {
    if (!error) {
      return false;
    }
    const status = Number(error.status);
    if (Number.isFinite(status) && [0, 404, 500, 502, 503].includes(status)) {
      return true;
    }
    if (error.name === "TypeError") {
      return true;
    }
    const message = typeof error.message === "string" ? error.message : "";
    return /NetworkError|Failed to fetch|offline/i.test(message);
  }


  function applyAdminUi(elements) {
    if (!elements?.adminToggle) {
      return;
    }

    const { adminToggle, adminPanel } = elements;

    if (!isAdmin) {
      adminToggle.setAttribute("aria-disabled", "true");
      adminToggle.setAttribute("aria-expanded", "false");
      adminToggle.textContent = "Admin tools (staff access required)";
      if (adminPanel && !adminPanel.hidden) {
        adminPanel.hidden = true;
      }
      return;
    }

    adminToggle.removeAttribute("aria-disabled");
    const expanded = adminPanel ? !adminPanel.hidden : false;
    adminToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    adminToggle.textContent = expanded ? "Hide admin tools" : "Access admin tools";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const elements = getElements();
    if (!elements) {
      return;
    }

    cachedElements = elements;
    updateImagePreview(elements);
    applyAdminUi(elements);

    initialiseLocalFleetState();

    populateAllSelects(elements);
    if (elements.optionCategory) {
      renderOptionList(elements, elements.optionCategory.value);
    } else {
      renderOptionList(elements, null);
    }
    renderTable(elements);
    renderHighlights(elements);
    updateStats(elements);
    updatePendingBadge(elements);
    renderPendingList(elements);

    attachEvents(elements);
    refreshFleetState(elements, { silent: true });
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
    const imageInput = document.getElementById("busImages");
    const imagePreview = document.getElementById("imagePreviewList");
    const optionForm = document.getElementById("optionForm");
    const optionCategory = document.getElementById("optionCategory");
    const optionList = document.getElementById("optionList");
    const adminToggle = document.getElementById("adminToggle");
    const adminPanel = document.getElementById("adminPanel");
    const pendingContainer = document.getElementById("pendingContainer");
    const pendingCount = document.getElementById("pendingCount");
    const toast = document.getElementById("fleetToast");

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
      imageInput,
      imagePreview,
      optionForm,
      optionCategory,
      optionList,
      adminToggle,
      adminPanel,
      pendingContainer,
      pendingCount,
      toast,
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
      imageInput,
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

    if (imageInput) {
      imageInput.addEventListener("change", () => updateImagePreview(elements));
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
  }

  function buildApiUrl(path = "") {
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE_URL}${suffix}`;
  }

  async function requestJson(path, options = {}) {
    const url = buildApiUrl(path);
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body && !(body instanceof FormData)) {
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      if (headers["Content-Type"].includes("application/json") && typeof body !== "string") {
        body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body,
    });

    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
    }

    if (!response.ok) {
      const message = payload?.error || `Request failed with status ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  }

  async function getAdminHeaders() {
    if (!isAdmin || !currentAdminUser?.getIdToken) {
      throw new Error("Administrator access is required.");
    }
    try {
      adminAuthToken = await currentAdminUser.getIdToken();
    } catch (error) {
      adminAuthToken = null;
      throw error;
    }
    return { Authorization: `Bearer ${adminAuthToken}` };
  }

  async function fetchFleetStateFromApi() {
    try {
      const payload = await requestJson("/fleet");
      offlineMode = false;
      offlineNoticeShown = false;
      persistFleetStateSnapshot(payload);
      return payload;
    } catch (error) {
      if (shouldUseOfflineFallback(error)) {
        offlineMode = true;
        offlineNoticeShown = false;
        const stored = loadLocalFleetStateSnapshot();
        if (stored) {
          console.warn(
            "Fleet API unavailable. Loaded fleet data from local storage instead.",
            error,
          );
          return stored;
        }
        console.warn(
          "Fleet API unavailable. Falling back to bundled dataset.",
          error,
        );
        return clone(DEFAULT_STATE);
      }
      throw error;
    }
  }

  async function submitFleetUpdateToApi(bus) {
    return requestJson("/fleet/submit", {
      method: "POST",
      body: { bus },
    });
  }

  async function addOptionToApi(field, value) {
    const headers = await getAdminHeaders();
    return requestJson("/fleet/options", {
      method: "POST",
      headers,
      body: { field, value },
    });
  }

  async function approvePendingChangeOnApi(changeId) {
    const headers = await getAdminHeaders();
    return requestJson(`/fleet/pending/${encodeURIComponent(changeId)}/approve`, {
      method: "POST",
      headers,
    });
  }

  async function rejectPendingChangeOnApi(changeId) {
    const headers = await getAdminHeaders();
    return requestJson(`/fleet/pending/${encodeURIComponent(changeId)}/reject`, {
      method: "POST",
      headers,
    });
  }

  async function refreshFleetState(elements, options = {}) {
    const { silent } = options;
    try {
      const remoteState = await fetchFleetStateFromApi();
      applyFleetState(remoteState);
      sortOptionLists();
      populateAllSelects(elements);
      if (elements.optionCategory) {
        renderOptionList(elements, elements.optionCategory.value);
      } else {
        renderOptionList(elements, null);
      }
      renderTable(elements);
      renderHighlights(elements);
      updateStats(elements);
      updatePendingBadge(elements);
      renderPendingList(elements);
      persistCurrentFleetState();

      if (offlineMode) {
        if (!offlineNoticeShown) {
          const offlineMessage =
            "Fleet tools are offline. Showing saved data from this device.";
          showToast(elements.toast, offlineMessage, "info");
          offlineNoticeShown = true;
        }
      } else if (!silent && isInitialised) {
        showToast(elements.toast, "Fleet database refreshed.", "success");
      }
    } catch (error) {
      console.error("Failed to load fleet state:", error);
      const message = error?.message || "Unable to load fleet data.";
      if (!silent) {
        showToast(elements.toast, message, "error");
      }
      if (!isInitialised && elements.formFeedback) {
        setFormFeedback(elements.formFeedback, message, "error");
      }
    } finally {
      isInitialised = true;
    }
  }

  function applyFleetState(remoteState) {
    if (!remoteState || typeof remoteState !== "object") {
      return;
    }

    if (remoteState.options && typeof remoteState.options === "object") {
      state.options = clone(remoteState.options);
    }

    if (remoteState.buses && typeof remoteState.buses === "object") {
      state.buses = {};
      Object.keys(remoteState.buses).forEach((key) => {
        const bus = remoteState.buses[key];
        if (!bus) return;
        const regKey = normaliseRegKey(bus.regKey || key);
        if (!regKey) return;
        state.buses[regKey] = { ...bus, regKey };
      });
    }

    if (Array.isArray(remoteState.pendingChanges)) {
      state.pendingChanges = remoteState.pendingChanges.map((change) => ({
        ...change,
      }));
    } else {
      state.pendingChanges = [];
    }
  }

  function normalizeRegistrationInput(input) {
    if (!input) return;
    input.value = input.value.toUpperCase();
  }

  function clone(value) {
    if (typeof window.structuredClone === "function") {
      return window.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normaliseRegKey(value) {
    return (value || "")
      .toString()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
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

  function ensureOptionsFromBus(bus) {
    if (!bus || typeof bus !== "object") {
      return;
    }

    DROPDOWN_FIELDS.forEach((field) => {
      if (field === "extras") {
        if (Array.isArray(bus.extras)) {
          bus.extras.forEach((tag) => addOptionValue(field, tag));
        }
        return;
      }
      addOptionValue(field, bus[field]);
    });
  }

  function addOptionValue(field, value) {
    const text = normaliseTextValue(value);
    if (!text) {
      return;
    }
    if (!Array.isArray(state.options[field])) {
      state.options[field] = [];
    }
    const exists = state.options[field].some(
      (option) => option.toLowerCase() === text.toLowerCase(),
    );
    if (!exists) {
      state.options[field].push(text);
    }
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
    const withdrawnList = document.getElementById("withdrawnHighlightList");
    if (!newList || !rareList || !withdrawnList) return;

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
      .sort(
        (a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0),
      );
    const withdrawn = buses
      .filter((bus) => String(bus.status).toLowerCase() !== "active")
      .sort((a, b) => new Date(b.lastUpdated || b.registrationDate || 0) - new Date(a.lastUpdated || a.registrationDate || 0));

    newList.innerHTML = newest.length
      ? newest
          .slice(0, 6)
          .map((bus) => highlightItem(bus))
          .join("")
      : '<li class="pending-empty">No vehicles currently flagged as new.</li>';

    rareList.innerHTML = rare.length
      ? rare
          .slice(0, 6)
          .map((bus) => highlightItem(bus))
          .join("")
      : '<li class="pending-empty">No rare workings logged yet.</li>';

    withdrawnList.innerHTML = withdrawn.length
      ? withdrawn
          .slice(0, 6)
          .map((bus) => highlightItem(bus))
          .join("")
      : '<li class="pending-empty">Withdrawn history unlocks once contributions are approved.</li>';
  }

  function highlightItem(bus) {
    const status = bus.status && String(bus.status).toLowerCase() !== "active" ? bus.status : null;
    const subtitle = [bus.operator, bus.garage, status]
      .filter(Boolean)
      .join(" • ");
    return `<li><span>${escapeHtml(bus.registration)}</span><small>${escapeHtml(subtitle || "Awaiting details")}</small></li>`;
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

  function formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) {
      return "0 KB";
    }
    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderImageSelection(elements, files, overflow = 0) {
    const { imagePreview } = elements;
    if (!imagePreview) return;

    if (!Array.isArray(files) || files.length === 0) {
      imagePreview.innerHTML =
        '<li class="fleet-form__uploads-empty">No images selected.</li>';
      return;
    }

    const items = files
      .map(
        (file) =>
          `<li><span>${escapeHtml(file.name || "Untitled image")}</span><small>${formatFileSize(file.size)}</small></li>`,
      )
      .join("");

    const warning =
      overflow > 0
        ? `<li class="fleet-form__uploads-warning">${overflow} additional file${
            overflow === 1 ? "" : "s"
          } ignored.</li>`
        : "";

    imagePreview.innerHTML = `${items}${warning}`;
  }

  function updateImagePreview(elements) {
    const { imageInput } = elements;
    if (!imageInput || !imageInput.files) {
      renderImageSelection(elements, []);
      return;
    }

    const files = Array.from(imageInput.files || []);
    const limited = files.slice(0, MAX_IMAGE_UPLOADS);
    const overflow = Math.max(files.length - limited.length, 0);
    renderImageSelection(elements, limited, overflow);
  }

  function clearImageSelection(elements) {
    if (elements.imageInput) {
      elements.imageInput.value = "";
    }
    renderImageSelection(elements, []);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });
  }

  async function gatherImagePayloads(elements) {
    const input = elements.imageInput;
    if (!input || !input.files || input.files.length === 0) {
      return [];
    }

    const files = Array.from(input.files).slice(0, MAX_IMAGE_UPLOADS);
    const payloads = [];
    for (const file of files) {
      if (!file.type || !file.type.startsWith("image/")) {
        throw new Error("Only image files can be uploaded.");
      }
      if (file.size > MAX_IMAGE_BYTES) {
        const maxMb = (MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(1);
        throw new Error(`Each image must be ${maxMb} MB or smaller.`);
      }
      const dataUrl = await readFileAsDataUrl(file);
      payloads.push({
        id: `img-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        name: file.name,
        contentType: file.type,
        size: file.size,
        dataUrl,
      });
    }
    return payloads;
  }

  async function submitForm(elements) {
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

    let imagePayloads = [];
    try {
      imagePayloads = await gatherImagePayloads(elements);
    } catch (error) {
      const message = error?.message || "Selected images could not be processed.";
      setFormFeedback(formFeedback, message, "error");
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
    if (imagePayloads.length) {
      payload.images = imagePayloads;
    }

    setFormFeedback(
      formFeedback,
      existing
        ? `Submitting update for ${registration}...`
        : `Creating profile for ${registration}...`,
      "pending",
    );

    try {
      const result = await submitFleetUpdateToApi(payload);
      await refreshFleetState(elements, { silent: true });
      const updated = state.buses[regKey];

      if (result?.status === "created") {
        const pendingCount = Number(result?.pendingImages || 0);
        const imageNote =
          pendingCount > 0
            ? ` ${pendingCount === 1 ? "One image" : `${pendingCount} images`} awaiting admin review.`
            : imagePayloads.length > 0
              ? " Images awaiting admin review."
              : "";
        const successMessage = `Created new profile for ${registration}.${imageNote}`;
        showToast(elements.toast, successMessage, "success");
        setFormFeedback(formFeedback, successMessage, "success");
        prefillForm(elements, updated || payload);
        clearImageSelection(elements);
      } else {
        const pendingImages = Array.isArray(result?.change?.images)
          ? result.change.images.length
          : imagePayloads.length;
        const infoMessage =
          pendingImages > 0
            ? `Update for ${registration} submitted for approval with ${pendingImages === 1 ? "one image" : `${pendingImages} images`} awaiting review.`
            : `Update for ${registration} submitted for approval.`;
        showToast(
          elements.toast,
          infoMessage,
          "info",
        );
        setFormFeedback(
          formFeedback,
          infoMessage,
          "pending",
        );
        clearImageSelection(elements);
      }
    } catch (error) {
      if (
        handleOfflineSubmitFallback(
          elements,
          payload,
          existing,
          imagePayloads,
          error,
        )
      ) {
        return;
      }
      console.error("Failed to submit fleet update:", error);
      const message = error?.message || "Unable to submit update.";
      showToast(elements.toast, message, "error");
      setFormFeedback(formFeedback, message, "error");
    }
  }

  function handleOfflineSubmitFallback(
    elements,
    payload,
    existing,
    imagePayloads,
    error,
  ) {
    if (!shouldUseOfflineFallback(error)) {
      return false;
    }
    console.warn(
      "Fleet API unavailable. Saving fleet update locally instead.",
      error,
    );
    offlineMode = true;
    offlineNoticeShown = true;
    const offlinePayload = { ...payload };
    if (offlinePayload.images) {
      delete offlinePayload.images;
    }
    if (!Array.isArray(offlinePayload.gallery)) {
      offlinePayload.gallery = Array.isArray(existing?.gallery)
        ? existing.gallery.slice()
        : [];
    }
    const hadImages = Array.isArray(imagePayloads)
      ? imagePayloads.length > 0
      : false;
    return applyOfflineBusUpdate(elements, offlinePayload, {
      existing,
      hadImages,
    });
  }

  function applyOfflineBusUpdate(elements, payload, options = {}) {
    if (!elements || !payload) {
      return false;
    }
    const { existing, hadImages } = options;
    const regKey = normaliseRegKey(payload.regKey || payload.registration);
    if (!regKey) {
      return false;
    }

    const registration = payload.registration || regKey;
    const nowIso = new Date().toISOString();
    const base = existing || state.buses[regKey] || {};
    const merged = {
      ...base,
      ...payload,
      regKey,
      registration,
    };

    if (!merged.lastUpdated) {
      merged.lastUpdated = nowIso;
    }
    if (!merged.createdAt) {
      merged.createdAt = merged.lastUpdated;
    }

    delete merged.images;

    state.buses[regKey] = merged;
    ensureOptionsFromBus(merged);
    sortOptionLists();
    populateAllSelects(elements);
    if (elements.optionCategory) {
      renderOptionList(elements, elements.optionCategory.value);
    } else {
      renderOptionList(elements, null);
    }
    renderTable(elements);
    renderHighlights(elements);
    updateStats(elements);
    updatePendingBadge(elements);
    renderPendingList(elements);
    persistCurrentFleetState();

    const message = formatOfflineSaveMessage(
      registration,
      Boolean(hadImages),
      Boolean(existing),
    );
    showToast(elements.toast, message, "info");
    setFormFeedback(elements.formFeedback, message, "success");
    prefillForm(elements, merged);
    clearImageSelection(elements);
    return true;
  }

  function formatOfflineSaveMessage(registration, hadImages, isUpdate) {
    const safeRegistration = registration || "this vehicle";
    const base = isUpdate
      ? `Saved updates for ${safeRegistration} on this device.`
      : `Created a local profile for ${safeRegistration}.`;
    const suffix = hadImages
      ? " Image uploads can't be stored offline, so please reattach them once the fleet tools can reach the server."
      : " We'll keep these details on this device until the fleet API is available again.";
    return `${base}${suffix}`;
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

  function renderPendingList(elements) {
    const { pendingContainer, adminPanel } = elements;
    if (!pendingContainer) return;

    if (!isAdmin) {
      pendingContainer.innerHTML =
        '<p class="pending-empty">Sign in as an administrator to review pending changes.</p>';
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
    const imagesMarkup = renderPendingImages(change);

    return `
      <article class="pending-card">
        <div class="pending-card__header">
          <h4>${escapeHtml(change.registration)}</h4>
          <span class="pending-card__meta">Submitted ${escapeHtml(submitted || "recently")}</span>
        </div>
        <ul class="pending-card__changes">
          ${diffRows.join("")}
        </ul>
        ${imagesMarkup}
        <div class="pending-card__actions">
          <button class="button-primary" data-action="approve" data-id="${escapeHtml(change.id)}">Approve</button>
          <button class="button-tertiary" data-action="reject" data-id="${escapeHtml(change.id)}">Reject</button>
        </div>
      </article>
    `;
  }

  function renderPendingImages(change) {
    if (!change || !Array.isArray(change.images) || change.images.length === 0) {
      return "";
    }
    const registration = change.registration || change.regKey || "registration";
    const items = change.images
      .map((image, index) => {
        const rawName = image?.name || `Image ${index + 1}`;
        const size = image?.size ? formatFileSize(image.size) : "";
        const caption = [rawName, size]
          .filter(Boolean)
          .map((part) => escapeHtml(part))
          .join(" • ");
        const dataUrl = escapeHtml(image?.dataUrl || "");
        return `
          <figure class="pending-card__image">
            <img src="${dataUrl}" alt="Submitted image ${index + 1} for ${escapeHtml(registration)}" loading="lazy" />
            <figcaption>${caption}</figcaption>
          </figure>
        `;
      })
      .join("");
    return `<div class="pending-card__images" aria-label="Submitted images">${items}</div>`;
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

  async function approvePending(elements, id) {
    if (!isAdmin) {
      showToast(elements.toast, "Admin access required to approve.", "error");
      return;
    }
    try {
      const change = state.pendingChanges.find((item) => item.id === id);
      const response = await approvePendingChangeOnApi(id);
      const registration =
        response?.bus?.registration || change?.registration || "registration";
      await refreshFleetState(elements, { silent: true });
      showToast(
        elements.toast,
        `Update for ${registration} approved.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to approve fleet update:", error);
      const message = error?.message || "Unable to approve update.";
      showToast(elements.toast, message, "error");
    }
  }

  async function rejectPending(elements, id) {
    if (!isAdmin) {
      showToast(elements.toast, "Admin access required to reject.", "error");
      return;
    }
    try {
      await rejectPendingChangeOnApi(id);
      await refreshFleetState(elements, { silent: true });
      showToast(
        elements.toast,
        "Pending update rejected.",
        "info",
      );
    } catch (error) {
      console.error("Failed to reject fleet update:", error);
      const message = error?.message || "Unable to reject update.";
      showToast(elements.toast, message, "error");
    }
  }

  function toggleAdmin(elements) {
    const { adminToggle, adminPanel } = elements;
    if (!adminToggle || !adminPanel) return;

    if (!isAdmin) {
      showToast(
        elements.toast,
        "Administrator access is required to open these tools.",
        "error",
      );
      return;
    }

    const expanded = adminToggle.getAttribute("aria-expanded") === "true";
    const nextExpanded = !expanded;
    adminToggle.setAttribute("aria-expanded", String(nextExpanded));
    adminPanel.hidden = !nextExpanded;
    applyAdminUi(elements);
    if (nextExpanded) {
      renderPendingList(elements);
    }
  }

  function updateAdminState(user, tokenResult) {
    const previousAdmin = isAdmin;
    currentAdminUser = user || null;
    adminAuthToken = null;

    let resolvedAdmin = false;
    if (user && tokenResult) {
      try {
        resolvedAdmin = Boolean(resolveAdminStatus(user, tokenResult));
      } catch (error) {
        console.warn(
          "Fleet admin: unable to resolve administrator claims, assuming regular member.",
          error,
        );
        resolvedAdmin = false;
      }
    }

    isAdmin = resolvedAdmin;

    if (!cachedElements) {
      return;
    }

    applyAdminUi(cachedElements);
    renderPendingList(cachedElements);

    if (isAdmin && !previousAdmin) {
      refreshFleetState(cachedElements, { silent: true });
    }
  }

  async function evaluateAdminUser(user) {
    if (!user) {
      updateAdminState(null, null);
      return;
    }

    try {
      const tokenResult = await user.getIdTokenResult();
      updateAdminState(user, tokenResult);
    } catch (error) {
      console.error(
        "Fleet admin: failed to verify administrator permissions.",
        error,
      );
      updateAdminState(user, null);
    }
  }

  function subscribeToAuthChanges() {
    if (authSubscriptionStarted) {
      return;
    }
    authSubscriptionStarted = true;

    const routeflowAuth = window.RouteflowAuth;
    const emitState = (authUser) => {
      evaluateAdminUser(authUser || null);
    };

    if (routeflowAuth?.subscribe) {
      if (typeof routeflowAuth.getCurrentUser === "function") {
        try {
          emitState(routeflowAuth.getCurrentUser());
        } catch (error) {
          console.error(
            "Fleet admin: failed to read initial authentication state.",
            error,
          );
        }
      }
      routeflowAuth.subscribe(emitState);
      return;
    }

    ensureAuthInstance()
      .then((auth) => {
        if (!auth || typeof auth.onAuthStateChanged !== "function") {
          emitState(null);
          return;
        }
        emitState(auth.currentUser || null);
        auth.onAuthStateChanged((authUser) => emitState(authUser || null));
      })
      .catch((error) => {
        console.error(
          "Fleet admin: failed to initialise authentication observer.",
          error,
        );
        emitState(null);
      });
  }

  subscribeToAuthChanges();

  function renderOptionList(elements, field) {
    const { optionList } = elements;
    if (!optionList) return;
    if (!field) {
      optionList.innerHTML =
        '<li class="option-empty">Select a field to view options.</li>';
      return;
    }
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

  async function addNewOption(elements) {
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
    if (!isAdmin) {
      showToast(
        elements.toast,
        "Admin access required to add options.",
        "error",
      );
      return;
    }
    value = capitalise(value);
    try {
      const response = await addOptionToApi(field, value);
      const updatedOptions = Array.isArray(response?.options)
        ? response.options
        : [...(state.options[field] || []), value];
      state.options[field] = updatedOptions;
      sortOptionLists();
      populateAllSelects(elements);
      renderOptionList(elements, field);
      optionForm.reset();
      optionCategory.value = field;
      showToast(
        elements.toast,
        `Added "${value}" to ${FIELD_LABELS[field] || field}.`,
        "success",
      );
    } catch (error) {
      console.error("Failed to add fleet option:", error);
      const message = error?.message || "Unable to add option.";
      showToast(elements.toast, message, "error");
    }
  }

  function clearForm(elements) {
    const { fleetForm } = elements;
    if (!fleetForm) return;
    fleetForm.reset();
    clearImageSelection(elements);
  }

  function sanitiseExtrasList(primary, fallback = []) {
    const values = Array.isArray(primary) && primary.length ? primary : fallback;
    const seen = new Set();
    const tags = [];
    values.forEach((value) => {
      const text = normaliseTextValue(value);
      if (!text) {
        return;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      tags.push(text);
    });
    return tags;
  }

  function toIsoDateString(value) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      if (typeof value === "string" && /\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
      }
      return "";
    }
    try {
      return date.toISOString().slice(0, 10);
    } catch (error) {
      return "";
    }
  }

  function resolveOperatorName(operator) {
    if (!operator) return "";
    if (typeof operator === "string") {
      return normaliseTextValue(operator);
    }
    if (typeof operator === "object") {
      return (
        normaliseTextValue(operator.name) ||
        normaliseTextValue(operator.shortName) ||
        normaliseTextValue(operator.slug)
      );
    }
    return "";
  }

  function sanitiseApiBus(bus) {
    if (!bus || typeof bus !== "object") {
      return null;
    }

    const regKey = normaliseRegKey(
      bus.regKey || bus.reg || normaliseTextValue(bus.registration),
    );
    if (!regKey) {
      return null;
    }

    const registration =
      normaliseTextValue(bus.registration) || normaliseTextValue(bus.reg) || regKey;

    const extras = sanitiseExtrasList(bus.extras, bus.badges);
    const extrasLower = new Set(extras.map((tag) => tag.toLowerCase()));

    const registrationDate =
      toIsoDateString(bus.registrationDate) ||
      toIsoDateString(bus.firstSeen) ||
      toIsoDateString(bus.createdAt);

    const newUntil =
      normaliseTextValue(bus.newUntil) ||
      normaliseTextValue(bus.newState?.expiresAt);

    const resolved = {
      regKey,
      registration,
      fleetNumber: normaliseTextValue(bus.fleetNumber || bus.vehicleId),
      operator: resolveOperatorName(bus.operator),
      status: normaliseTextValue(bus.status),
      wrap: normaliseTextValue(bus.wrap),
      vehicleType: normaliseTextValue(bus.vehicleType),
      doors: normaliseTextValue(bus.doors),
      engineType: normaliseTextValue(bus.engineType),
      engine: normaliseTextValue(bus.engine),
      chassis: normaliseTextValue(bus.chassis),
      bodyType: normaliseTextValue(bus.bodyType),
      registrationDate,
      garage: normaliseTextValue(bus.garage),
      extras,
      length: normaliseTextValue(bus.length),
      isNewBus:
        bus.isNewBus !== undefined
          ? Boolean(bus.isNewBus)
          : extrasLower.has("new bus") || Boolean(bus.newState?.isNew),
      isRareWorking:
        bus.isRareWorking !== undefined
          ? Boolean(bus.isRareWorking)
          : extrasLower.has("rare working") || Boolean(bus.rareState?.active),
      lastUpdated:
        normaliseTextValue(bus.lastUpdated) ||
        normaliseTextValue(bus.updatedAt),
      createdAt: normaliseTextValue(bus.createdAt),
    };

    if (newUntil) {
      resolved.newUntil = newUntil;
    }

    if (!resolved.createdAt) {
      resolved.createdAt = registrationDate;
    }
    if (!resolved.lastUpdated) {
      resolved.lastUpdated = resolved.createdAt || registrationDate;
    }

    if (Array.isArray(bus.gallery) && bus.gallery.length) {
      resolved.gallery = bus.gallery.slice();
    }

    return resolved;
  }

  async function fetchBusFromApi(regKey) {
    const normalised = normaliseRegKey(regKey);
    if (!normalised) {
      return null;
    }

    if (state.buses[normalised]) {
      return state.buses[normalised];
    }

    if (registrationLookupPromises.has(normalised)) {
      return registrationLookupPromises.get(normalised);
    }

    const promise = (async () => {
      try {
        const payload = await requestJson(`/fleet/${encodeURIComponent(normalised)}`);
        const bus = payload?.bus || payload;
        const sanitised = sanitiseApiBus(bus);
        if (!sanitised) {
          return null;
        }
        state.buses[sanitised.regKey] = {
          ...(state.buses[sanitised.regKey] || {}),
          ...sanitised,
        };
        return state.buses[sanitised.regKey];
      } catch (error) {
        if (error?.status === 404) {
          return null;
        }
        throw error;
      } finally {
        registrationLookupPromises.delete(normalised);
      }
    })();

    registrationLookupPromises.set(normalised, promise);
    return promise;
  }

  function prefillForm(elements, bus) {
    const { registrationInput, selects } = elements;
    const registration = registrationInput?.value || bus?.registration;
    const regKey = normaliseRegKey(registration || "");
    const record = bus || state.buses[regKey];
    if (!record) {
      clearFormKeepRegistration(elements);
      if (!regKey) {
        return;
      }
      const requestId = ++lastPrefillRequestId;
      fetchBusFromApi(regKey)
        .then((remoteBus) => {
          if (!remoteBus) {
            return;
          }
          if (requestId !== lastPrefillRequestId) {
            return;
          }
          prefillForm(elements, remoteBus);
          renderTable(elements);
          renderHighlights(elements);
          updateStats(elements);
          updatePendingBadge(elements);
          renderPendingList(elements);
        })
        .catch((error) => {
          if (error?.status === 404) {
            return;
          }
          console.error("Failed to fetch registration from API:", error);
        });
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
    clearImageSelection(elements);
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
