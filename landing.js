const QUICKNAV_SELECTOR = '[data-quicknav]';
const ANIMATE_SELECTOR = '[data-animate]';
const NEWSLETTER_SELECTOR = '[data-newsletter-form]';
const NEWSLETTER_STORAGE_KEY = 'routeflow:newsletter-signups';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const html = document.documentElement;
if (html) {
  html.classList.add('landing-js');
}

const prefersReducedMotion = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

const initialiseAnimations = () => {
  const animateTargets = Array.from(document.querySelectorAll(ANIMATE_SELECTOR));
  if (!animateTargets.length) {
    return () => {};
  }

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    animateTargets.forEach((target) => target.classList.add('is-visible'));
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: '0px 0px -5% 0px',
    threshold: 0.2
  });

  animateTargets.forEach((target) => observer.observe(target));
  return () => observer.disconnect();
};

const normaliseHash = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    return decodeURIComponent(value.trim());
  } catch (error) {
    return value.trim();
  }
};

const scrollToSection = (section) => {
  if (!section) {
    return;
  }
  section.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
};

const initialiseQuickNav = () => {
  const nav = document.querySelector(QUICKNAV_SELECTOR);
  if (!nav) {
    return () => {};
  }

  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  if (!links.length) {
    return () => {};
  }

  const sections = links.map((link) => {
    const id = normaliseHash(link.getAttribute('href') || '').replace('#', '');
    const section = id ? document.getElementById(id) : null;
    return { link, section, id };
  }).filter((entry) => entry.section);

  if (!sections.length) {
    return () => {};
  }

  const setActive = (id) => {
    sections.forEach(({ link, id: entryId }) => {
      const isActive = entryId === id;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  if (sections[0]) {
    setActive(sections[0].id);
  }

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = normaliseHash(link.getAttribute('href') || '').replace('#', '');
      const targetSection = sections.find((entry) => entry.id === targetId)?.section;
      if (!targetSection) {
        return;
      }
      event.preventDefault();
      scrollToSection(targetSection);
      setActive(targetId);
    });
  });

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    const current = sections[0];
    if (current) {
      setActive(current.id);
    }
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (!visible.length) {
      return;
    }
    const topEntry = visible[0];
    const matched = sections.find((entry) => entry.section === topEntry.target);
    if (matched) {
      setActive(matched.id);
    }
  }, {
    threshold: [0.2, 0.4, 0.6, 0.8],
    rootMargin: '-10% 0px -35% 0px'
  });

  sections.forEach(({ section }) => observer.observe(section));
  return () => observer.disconnect();
};

const readStoredEmails = () => {
  try {
    const raw = window.localStorage?.getItem(NEWSLETTER_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.map((value) => String(value || '').toLowerCase()));
  } catch (error) {
    console.warn('RouteFlow newsletter: unable to read stored signups', error);
    return new Set();
  }
};

const persistEmails = (emails) => {
  try {
    window.localStorage?.setItem(NEWSLETTER_STORAGE_KEY, JSON.stringify(Array.from(emails)));
  } catch (error) {
    console.warn('RouteFlow newsletter: unable to persist signups', error);
  }
};

const initialiseNewsletter = () => {
  const form = document.querySelector(NEWSLETTER_SELECTOR);
  if (!form) {
    return () => {};
  }

  const emailField = form.querySelector('input[type="email"]');
  const responseField = form.querySelector('[data-newsletter-message]');
  const submitButton = form.querySelector('button[type="submit"]');
  const storedEmails = readStoredEmails();

  const setMessage = (message, tone = 'info') => {
    if (!responseField) {
      return;
    }
    responseField.textContent = message;
    responseField.dataset.tone = tone;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = emailField?.value.trim() || '';
    if (!value) {
      setMessage('Please enter your email address to subscribe.', 'warning');
      emailField?.focus();
      return;
    }
    if (!EMAIL_PATTERN.test(value)) {
      setMessage('That email address looks incorrect. Try again?', 'warning');
      emailField?.focus();
      return;
    }

    const email = value.toLowerCase();
    if (storedEmails.has(email)) {
      setMessage('You are already on the mission briefing list. Great to have you back!', 'success');
      form.reset();
      submitButton?.focus({ preventScroll: true });
      return;
    }

    storedEmails.add(email);
    persistEmails(storedEmails);
    setMessage('Thanks for joining the mission briefing — check your inbox for the welcome pack.', 'success');
    form.reset();
    submitButton?.focus({ preventScroll: true });
  });

  return () => {
    form.reset();
  };
};

const cleanups = [initialiseAnimations(), initialiseQuickNav(), initialiseNewsletter()]
  .filter((cleanup) => typeof cleanup === 'function');

window.addEventListener('beforeunload', () => {
  cleanups.forEach((cleanup) => cleanup());
});
