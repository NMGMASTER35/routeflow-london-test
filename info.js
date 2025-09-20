import { getStoredBlogPosts, refreshBlogPosts } from './data-store.js';

const formatPublishedDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const createTagPill = (tag) => {
  const pill = document.createElement('span');
  pill.className = 'blog-tag';
  pill.textContent = tag;
  return pill;
};

const renderTags = (tags = []) => {
  const unique = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!unique.length) return null;
  const fragment = document.createDocumentFragment();
  unique.forEach((tag) => {
    fragment.appendChild(createTagPill(tag));
  });
  return fragment;
};

const buildModalContent = (post) => {
  const fragment = document.createDocumentFragment();
  const blocks = [];
  if (post.summary) {
    blocks.push(post.summary);
  }
  if (post.content) {
    blocks.push(
      ...String(post.content)
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
    );
  }
  blocks.forEach((text) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    fragment.appendChild(paragraph);
  });
  return fragment;
};

const modalElements = {
  container: document.getElementById('blogModal'),
  dialog: document.querySelector('#blogModal .blog-modal__dialog'),
  close: document.getElementById('blogModalClose'),
  media: document.getElementById('blogModalMedia'),
  title: document.getElementById('blogModalTitle'),
  meta: document.getElementById('blogModalMeta'),
  tags: document.getElementById('blogModalTags'),
  content: document.getElementById('blogModalContent')
};

let lastFocusedElement = null;

const closeBlogModal = () => {
  if (!modalElements.container) return;
  modalElements.container.hidden = true;
  document.body?.removeAttribute('data-overlay-open');
  if (modalElements.media) {
    modalElements.media.innerHTML = '';
    modalElements.media.hidden = true;
  }
  if (modalElements.tags) {
    modalElements.tags.innerHTML = '';
  }
  if (modalElements.content) {
    modalElements.content.innerHTML = '';
  }
  if (lastFocusedElement?.focus) {
    lastFocusedElement.focus({ preventScroll: true });
  }
  lastFocusedElement = null;
};

const openBlogModal = (post, trigger) => {
  if (!modalElements.container || !modalElements.dialog) return;
  lastFocusedElement = trigger || document.activeElement;

  if (modalElements.title) {
    modalElements.title.textContent = post.title || 'Info brief';
  }

  if (modalElements.meta) {
    const parts = [];
    if (post.publishedAt) {
      const time = document.createElement('time');
      time.dateTime = post.publishedAt;
      time.textContent = formatPublishedDate(post.publishedAt);
      parts.push(time);
    }
    if (post.author) {
      const author = document.createElement('span');
      author.textContent = parts.length ? ` • ${post.author}` : post.author;
      parts.push(author);
    }
    modalElements.meta.innerHTML = '';
    parts.forEach((node) => modalElements.meta.appendChild(node));
  }

  if (modalElements.tags) {
    const tags = renderTags(post.tags);
    modalElements.tags.innerHTML = '';
    if (tags) {
      modalElements.tags.appendChild(tags);
    }
  }

  if (modalElements.content) {
    modalElements.content.innerHTML = '';
    const body = buildModalContent(post);
    if (body.childNodes.length) {
      modalElements.content.appendChild(body);
    }
  }

  if (modalElements.media) {
    modalElements.media.innerHTML = '';
    if (post.heroImage) {
      const image = document.createElement('img');
      image.src = post.heroImage;
      image.alt = post.title ? `${post.title} cover image` : 'Info hub cover image';
      modalElements.media.appendChild(image);
      modalElements.media.hidden = false;
    } else {
      modalElements.media.hidden = true;
    }
  }

  modalElements.container.hidden = false;
  document.body?.setAttribute('data-overlay-open', 'true');
  modalElements.close?.focus({ preventScroll: true });
};

const handleModalKeydown = (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeBlogModal();
  }
};

if (modalElements.container) {
  modalElements.container.addEventListener('click', (event) => {
    if (event.target === modalElements.container) {
      closeBlogModal();
    }
  });
}

modalElements.close?.addEventListener('click', (event) => {
  event.preventDefault();
  closeBlogModal();
});

document.addEventListener('keydown', handleModalKeydown);

const createBlogElement = (post, variant = 'card', index = 0) => {
  const article = document.createElement('article');
  article.className = ['blog-post', `blog-post--${variant}`]
    .concat(post.featured ? 'blog-post--featured' : [])
    .join(' ');
  if (post.id) {
    article.id = `info-${post.id}`;
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'blog-post__trigger';
  trigger.setAttribute('aria-label', `Open ${post.title || 'info brief'}`);

  const cover = document.createElement('div');
  cover.className = 'blog-post__cover';
  if (post.heroImage) {
    const image = document.createElement('img');
    image.src = post.heroImage;
    image.alt = post.title ? `${post.title} cover` : 'Info hub cover';
    cover.appendChild(image);
  } else {
    cover.style.background = 'linear-gradient(135deg, rgba(0, 54, 136, 0.18), rgba(255, 71, 87, 0.16))';
  }
  trigger.appendChild(cover);

  const overlay = document.createElement('div');
  overlay.className = 'blog-post__overlay';

  const titleLevel = variant === 'full' ? 'h2' : 'h3';
  const heading = document.createElement(titleLevel);
  heading.className = 'blog-post__title';
  heading.textContent = post.title || 'Untitled brief';
  overlay.appendChild(heading);

  trigger.appendChild(overlay);
  trigger.addEventListener('click', () => openBlogModal(post, trigger));

  article.appendChild(trigger);
  article.dataset.index = String(index);
  return article;
};

const normaliseTag = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const parseTagList = (source) => {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source.map(normaliseTag).filter(Boolean);
  }
  return String(source)
    .split(',')
    .map(normaliseTag)
    .filter(Boolean);
};

const matchesAnyTag = (postTags, filterTags) => {
  if (!filterTags.length) return true;
  const tags = Array.isArray(postTags) ? postTags.map(normaliseTag) : [];
  return filterTags.some((tag) => tags.includes(tag));
};

const collectSearchText = (post) => {
  const parts = [];
  if (post.title) parts.push(post.title);
  if (post.summary) parts.push(post.summary);
  if (post.author) parts.push(post.author);
  if (Array.isArray(post.tags)) parts.push(post.tags.join(' '));
  if (post.content) parts.push(post.content);
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const matchesSearchTerm = (post, term) => {
  if (!term) return true;
  return collectSearchText(post).includes(term);
};

let searchTerm = '';

const renderBlogLists = async () => {
  try {
    await refreshBlogPosts();
  } catch (error) {
    console.warn('Unable to refresh blog posts before rendering.', error);
  }
  const containers = Array.from(document.querySelectorAll('[data-blog-list]'));
  if (!containers.length) return;

  const posts = getStoredBlogPosts()
    .slice()
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const filterGroups = new Map();

  const renderContainer = (config) => {
    if (!config.element) return;
    const limit = config.limit;
    const variant = config.variant;
    const emptyMessage = config.emptyMessage;

    let subset = posts.slice();
    if (config.tags.length) {
      subset = subset.filter((post) => matchesAnyTag(post.tags, config.tags));
    }

    if (config.activeFilter && config.activeFilter !== 'all') {
      subset = subset.filter((post) => matchesAnyTag(post.tags, [config.activeFilter]));
    }

    if (searchTerm) {
      subset = subset.filter((post) => matchesSearchTerm(post, searchTerm));
    }

    if (Number.isFinite(limit) && limit > 0) {
      subset = subset.slice(0, limit);
    }

    if (!subset.length) {
      const empty = document.createElement('p');
      empty.className = 'blog-empty';
      empty.textContent = searchTerm ? 'No briefs match your search just yet.' : emptyMessage;
      config.element.replaceChildren(empty);
      return;
    }

    const elements = subset.map((post, index) => createBlogElement(post, variant, index));
    config.element.replaceChildren(...elements);
  };

  const resolveFilterGroup = (id) => {
    if (!id) return null;
    if (filterGroups.has(id)) {
      return filterGroups.get(id);
    }

    const element = document.getElementById(id);
    if (!element) {
      return null;
    }

    const buttons = Array.from(element.querySelectorAll('[data-blog-filter]'));
    const fallback = buttons[0]?.dataset.blogFilter || 'all';
    const initial = buttons.find((button) => button.dataset.active === 'true')?.dataset.blogFilter || fallback || 'all';

    const group = {
      id,
      element,
      buttons,
      containers: [],
      activeFilter: initial,
      setActive(filter) {
        const value = filter && filter !== '' ? filter : 'all';
        this.activeFilter = value;
        this.buttons.forEach((button) => {
          const isActive = button.dataset.blogFilter === value || (!button.dataset.blogFilter && value === 'all');
          button.dataset.active = isActive ? 'true' : 'false';
          if (button.getAttribute('role') === 'tab') {
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
          }
        });
        this.containers.forEach((config) => {
          config.activeFilter = value;
          renderContainer(config);
        });
      }
    };

    element.addEventListener('click', (event) => {
      const button = event.target.closest('[data-blog-filter]');
      if (!button) return;
      event.preventDefault();
      group.setActive(button.dataset.blogFilter || 'all');
    });

    filterGroups.set(id, group);
    group.setActive(initial);
    return group;
  };

  const configs = containers.map((element) => {
    const limit = Number(element.dataset.blogLimit);
    const config = {
      element,
      limit: Number.isFinite(limit) && limit > 0 ? limit : null,
      variant: element.dataset.blogVariant || 'card',
      emptyMessage: element.dataset.blogEmpty || 'No briefs available yet.',
      tags: parseTagList(element.dataset.blogTags),
      filterGroup: element.dataset.blogFilterGroup || null,
      activeFilter: 'all'
    };
    return config;
  });

  configs.forEach((config) => {
    if (config.filterGroup) {
      const group = resolveFilterGroup(config.filterGroup);
      if (group) {
        group.containers.push(config);
        config.activeFilter = group.activeFilter;
      }
    }
    renderContainer(config);
  });

  document.querySelectorAll('[data-blog-category-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetFilter = link.dataset.blogCategoryLink;
      const groupId = link.dataset.blogCategoryGroup;
      if (!targetFilter || !groupId) return;
      const group = filterGroups.get(groupId) || resolveFilterGroup(groupId);
      if (!group) return;
      event.preventDefault();
      group.setActive(targetFilter);
      group.element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const searchInput = document.getElementById('blogSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      const value = typeof event.target.value === 'string' ? event.target.value.trim().toLowerCase() : '';
      searchTerm = value;
      configs.forEach((config) => renderContainer(config));
    });
  }
};

const initialiseBlogLists = () => {
  renderBlogLists().catch((error) => {
    console.error('Failed to render blog lists.', error);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialiseBlogLists, { once: true });
} else {
  initialiseBlogLists();
}

