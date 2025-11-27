const SELECTORS = {
  canvas: '#landingMap',
  carousel: '[data-carousel]',
  slides: '[data-carousel-slide]',
  track: '[data-carousel-track]',
  dots: '[data-carousel-dots]',
  prev: '[data-carousel-prev]',
  next: '[data-carousel-next]'
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SEARCH_SUGGESTIONS = [
  {
    label: 'Track live network',
    description: 'View arrivals, rare workings, and the map console.',
    href: 'tracking.html',
    shortcut: 'L'
  },
  {
    label: 'Check disruptions',
    description: 'See closures, diversions, and planned works.',
    href: 'disruptions.html',
    shortcut: '!'
  },
  {
    label: 'Open fleet cards',
    description: 'Browse vehicles, garages, and withdrawn units.',
    href: 'fleet.html',
    shortcut: 'F'
  },
  {
    label: 'Plan a journey',
    description: 'Start a trip across TfL modes with our planner.',
    href: 'planning.html',
    shortcut: 'P'
  },
  {
    label: 'Dashboard & XP',
    description: 'Jump back into your personal command room.',
    href: 'dashboard.html',
    shortcut: 'D'
  }
];

function initialiseCanvas() {
  const canvas = document.querySelector(SELECTORS.canvas);
  if (!canvas || prefersReducedMotion || !canvas.getContext) {
    return () => {};
  }

  const context = canvas.getContext('2d');
  const buses = Array.from({ length: 32 }, () => ({
    x: Math.random(),
    y: Math.random(),
    speed: 0.0006 + Math.random() * 0.0008,
    angle: Math.random() * Math.PI * 2
  }));

  const redraw = () => {
    const { width, height } = canvas;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);

    const gradient = context.createRadialGradient(
      width * 0.3,
      height * 0.4,
      Math.min(width, height) * 0.1,
      width * 0.5,
      height * 0.6,
      Math.max(width, height) * 0.8
    );
    gradient.addColorStop(0, 'rgba(12, 26, 43, 0.9)');
    gradient.addColorStop(1, 'rgba(9, 12, 20, 0.2)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i < 18; i += 1) {
      context.beginPath();
      context.moveTo(Math.random() * width, Math.random() * height);
      context.lineTo(Math.random() * width, Math.random() * height);
      context.stroke();
    }

    buses.forEach((bus) => {
      bus.x += Math.cos(bus.angle) * bus.speed;
      bus.y += Math.sin(bus.angle) * bus.speed;
      if (bus.x < 0 || bus.x > 1 || bus.y < 0 || bus.y > 1) {
        bus.angle = Math.random() * Math.PI * 2;
        bus.x = Math.random();
        bus.y = Math.random();
      }
      const x = bus.x * width;
      const y = bus.y * height;
      const glow = context.createRadialGradient(x, y, 0, x, y, 12);
      glow.addColorStop(0, 'rgba(255, 70, 66, 0.9)');
      glow.addColorStop(1, 'rgba(255, 70, 66, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ff4642';
      context.beginPath();
      context.arc(x, y, 2.2, 0, Math.PI * 2);
      context.fill();
    });
  };

  const setCanvasSize = () => {
    const { clientWidth, clientHeight } = canvas.parentElement || canvas;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(clientWidth * ratio);
    canvas.height = Math.floor(clientHeight * ratio);
    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  };

  let frameId;
  let paused = false;
  const tick = () => {
    redraw();
    frameId = requestAnimationFrame(tick);
  };

  const handleResize = () => {
    setCanvasSize();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      paused = true;
    } else if (paused && !prefersReducedMotion) {
      paused = false;
      frameId = requestAnimationFrame(tick);
    }
  };

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibility);
  setCanvasSize();
  if (!prefersReducedMotion) {
    frameId = requestAnimationFrame(tick);
  }

  return () => {
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (frameId) {
      cancelAnimationFrame(frameId);
    }
  };
}

function initialiseCarousel() {
  const root = document.querySelector(SELECTORS.carousel);
  if (!root) {
    return () => {};
  }

  const slides = Array.from(root.querySelectorAll(SELECTORS.slides));
  const dotsHost = root.querySelector(SELECTORS.dots);
  const prevButton = root.querySelector(SELECTORS.prev);
  const nextButton = root.querySelector(SELECTORS.next);
  if (!slides.length || !dotsHost) {
    return () => {};
  }

  let index = slides.findIndex((slide) => slide.classList.contains('is-active'));
  if (index < 0) {
    index = 0;
  }

  const dots = slides.map((_, slideIndex) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel__dot';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Go to slide ${slideIndex + 1}`);
    dot.dataset.index = String(slideIndex);
    dotsHost.appendChild(dot);
    return dot;
  });

  const setActive = (nextIndex) => {
    const bounded = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === bounded;
      slide.classList.toggle('is-active', isActive);
      slide.setAttribute('aria-hidden', String(!isActive));
    });
    dots.forEach((dot, dotIndex) => {
      const isActive = dotIndex === bounded;
      dot.classList.toggle('is-active', isActive);
      if (isActive) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
    index = bounded;
  };

  setActive(index);

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const targetIndex = Number(dot.dataset.index) || 0;
      setActive(targetIndex);
    });
  });

  prevButton?.addEventListener('click', () => setActive(index - 1));
  nextButton?.addEventListener('click', () => setActive(index + 1));

  let intervalId;
  const shouldAutoplay = () => !prefersReducedMotion && document.visibilityState === 'visible';
  const autoplay = () => {
    if (!shouldAutoplay()) {
      return;
    }
    intervalId = window.setInterval(() => {
      setActive(index + 1);
    }, 6000);
  };

  const stop = () => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  root.addEventListener('mouseenter', stop);
  root.addEventListener('mouseleave', () => {
    stop();
    autoplay();
  });

  autoplay();

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      stop();
    } else {
      autoplay();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    stop();
    document.removeEventListener('visibilitychange', handleVisibility);
    root.removeEventListener('mouseenter', stop);
    root.removeEventListener('mouseleave', autoplay);
  };
}

function initialiseSearch() {
  const form = document.querySelector('.landing-search');
  if (!form) {
    return;
  }

  const field = form.querySelector('input[type="search"]');
  const assist = form.querySelector('.landing-search__assist');
  const suggestionsHost = form.querySelector('[data-suggestions]');
  let activeIndex = -1;
  let currentSuggestions = SEARCH_SUGGESTIONS.slice(0, 4);

  const updateAssist = (message) => {
    if (!assist) return;
    assist.textContent = message;
  };

  const closeSuggestions = () => {
    if (!suggestionsHost) return;
    suggestionsHost.hidden = true;
    suggestionsHost.innerHTML = '';
    activeIndex = -1;
  };

  const openSuggestions = () => {
    if (!suggestionsHost || !currentSuggestions.length) return;
    suggestionsHost.hidden = false;
  };

  const renderSuggestions = (query = '') => {
    if (!suggestionsHost) return;
    const term = query.trim().toLowerCase();
    currentSuggestions = SEARCH_SUGGESTIONS
      .filter((item) => !term
        || item.label.toLowerCase().includes(term)
        || item.description.toLowerCase().includes(term))
      .slice(0, 5);
    suggestionsHost.innerHTML = '';

    currentSuggestions.forEach((item, idx) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'landing-search__suggestion';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
      button.dataset.index = String(idx);
      button.innerHTML = `
        <span class="landing-search__pill">${item.shortcut}</span>
        <div>
          <h4>${item.label}</h4>
          <span>${item.description}</span>
        </div>
        <i class="fa-solid fa-arrow-turn-down-right" aria-hidden="true"></i>
      `;
      button.addEventListener('click', () => {
        window.location.href = item.href;
      });
      button.addEventListener('mouseenter', () => {
        activeIndex = idx;
        applyActive();
      });
      suggestionsHost.appendChild(button);
    });

    suggestionsHost.hidden = currentSuggestions.length === 0;
  };

  const applyActive = () => {
    if (!suggestionsHost) return;
    suggestionsHost.querySelectorAll('.landing-search__suggestion').forEach((node, idx) => {
      const isActive = idx === activeIndex;
      node.classList.toggle('is-active', isActive);
      node.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    const activeItem = currentSuggestions[activeIndex];
    if (activeItem) {
      updateAssist(`Press Enter to jump to ${activeItem.label}.`);
    }
  };

  renderSuggestions();
  updateAssist('Try "63" for a bus or "Elizabeth line" for a mode.');
  openSuggestions();

  const handleNavigation = (delta) => {
    if (!currentSuggestions.length) return;
    const nextIndex = (activeIndex + delta + currentSuggestions.length) % currentSuggestions.length;
    activeIndex = nextIndex;
    openSuggestions();
    applyActive();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = field?.value.trim();
    const selected = currentSuggestions[activeIndex];
    if (selected) {
      window.location.href = selected.href;
      return;
    }
    if (!value) {
      field?.focus();
      updateAssist('Type a route, stop, or choose a shortcut below.');
      return;
    }
    const url = new URL('tracking.html', window.location.href);
    url.searchParams.set('query', value);
    window.location.href = url.toString();
  });

  field?.addEventListener('input', (event) => {
    const value = event.target.value || '';
    activeIndex = -1;
    renderSuggestions(value);
    openSuggestions();
    if (!value) {
      updateAssist('Try "63" for a bus or "Elizabeth line" for a mode.');
    }
  });

  field?.addEventListener('focus', () => {
    renderSuggestions(field.value || '');
    openSuggestions();
  });

  field?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      handleNavigation(1);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      handleNavigation(-1);
    }
    if (event.key === 'Escape') {
      closeSuggestions();
    }
  });

  form.addEventListener('focusout', (event) => {
    if (form.contains(event.relatedTarget)) return;
    closeSuggestions();
  });
}

function init() {
  const destroyCanvas = initialiseCanvas();
  const destroyCarousel = initialiseCarousel();
  initialiseSearch();

  window.addEventListener('beforeunload', () => {
    destroyCanvas?.();
    destroyCarousel?.();
  }, { once: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
