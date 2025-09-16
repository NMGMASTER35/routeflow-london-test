(function () {
  const formatPercent = (value) => `${Math.round(value * 100)}%`;

  const bindSwitch = (element, getter) => {
    if (!element) return () => {};
    return (prefsApi) => {
      element.addEventListener('change', () => {
        const next = getter(element.checked);
        prefsApi.setPreferences(next);
      });
    };
  };

  const renderAccentOptions = (container, prefsApi) => {
    if (!container) return [];

    const accents = prefsApi.getAccentOptions();
    container.innerHTML = '';

    return Object.entries(accents).map(([key, value]) => {
      const label = document.createElement('label');
      label.className = 'accent-choice';
      label.dataset.accentKey = key;
      label.style.setProperty('--accent-swatch', value.accent);
      label.style.setProperty('--accent-swatch-contrast', value.accentDark);

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'accent';
      input.value = key;
      input.setAttribute('aria-label', value.label);

      const swatch = document.createElement('span');
      swatch.className = 'accent-swatch';
      swatch.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.className = 'accent-name';
      text.textContent = value.label;

      label.append(input, swatch, text);
      container.append(label);
      return input;
    });
  };

  const updateAccentSelection = (container, selectedKey) => {
    if (!container) return;
    container.querySelectorAll('.accent-choice').forEach((choice) => {
      const isSelected = choice.dataset.accentKey === selectedKey;
      choice.dataset.selected = String(isSelected);
      const radio = choice.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = isSelected;
      }
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const prefsApi = window.RouteflowPreferences;
    if (!prefsApi) return;

    const form = document.getElementById('preferencesForm');
    if (!form) return;

    const darkModeToggle = document.getElementById('prefDarkMode');
    const highContrastToggle = document.getElementById('prefHighContrast');
    const readableFontToggle = document.getElementById('prefReadableFont');
    const reduceMotionToggle = document.getElementById('prefReduceMotion');
    const textScaleSlider = document.getElementById('prefTextScale');
    const textScaleLabel = document.getElementById('textScaleValue');
    const accentPalette = document.getElementById('accentPalette');
    const resetButton = document.getElementById('resetPreferences');

    const accentInputs = renderAccentOptions(accentPalette, prefsApi);

    accentInputs.forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) {
          prefsApi.setPreference('accent', input.value);
        }
      });
    });

    if (textScaleSlider) {
      textScaleSlider.addEventListener('input', () => {
        const scale = Number(textScaleSlider.value) / 100;
        prefsApi.setPreference('textScale', scale);
        if (textScaleLabel) {
          textScaleLabel.textContent = formatPercent(scale);
        }
      });
    }

    bindSwitch(darkModeToggle, (checked) => ({ theme: checked ? 'dark' : 'light' }))(prefsApi);
    bindSwitch(highContrastToggle, (checked) => ({ highContrast: checked }))(prefsApi);
    bindSwitch(readableFontToggle, (checked) => ({ readableFont: checked }))(prefsApi);
    bindSwitch(reduceMotionToggle, (checked) => ({ reduceMotion: checked }))(prefsApi);

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        prefsApi.resetPreferences();
      });
    }

    const syncUi = (preferences) => {
      if (darkModeToggle) {
        darkModeToggle.checked = preferences.theme === 'dark';
      }
      if (highContrastToggle) {
        highContrastToggle.checked = preferences.highContrast;
      }
      if (readableFontToggle) {
        readableFontToggle.checked = preferences.readableFont;
      }
      if (reduceMotionToggle) {
        reduceMotionToggle.checked = preferences.reduceMotion;
      }
      if (textScaleSlider) {
        const scaleValue = Math.round(clamp(preferences.textScale, 0.9, 1.3) * 100);
        textScaleSlider.value = String(scaleValue);
        if (textScaleLabel) {
          textScaleLabel.textContent = formatPercent(scaleValue / 100);
        }
      }
      updateAccentSelection(accentPalette, preferences.accent);
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    syncUi(prefsApi.getPreferences());
    prefsApi.onChange(syncUi);
  });
})();
