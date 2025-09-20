import { getStoredBlogPosts } from './data-store.js';

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

const resolvePostUrl = (post) => {
  const slug = (post?.id && String(post.id)) || '';
  return slug ? `info.html#info-${slug}` : 'info.html';
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
  const list = document.createElement('div');
  list.className = 'blog-post__tags';
  unique.forEach((tag) => {
    list.appendChild(createTagPill(tag));
  });
  return list;
};

const renderContent = (post, variant) => {
  const body = document.createElement('div');
  body.className = 'blog-post__body';

  if (post.summary) {
    const summary = document.createElement('p');
    summary.className = 'blog-post__summary';
    summary.textContent = post.summary;
    body.appendChild(summary);
  }

  if (variant === 'full' && post.content) {
    const paragraphs = String(post.content)
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (paragraphs.length) {
      const detail = document.createElement('details');
      detail.className = 'blog-post__details';
      detail.open = true;

      const summaryToggle = document.createElement('summary');
      summaryToggle.textContent = 'Full story';
      detail.appendChild(summaryToggle);

      paragraphs.forEach((text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        detail.appendChild(paragraph);
      });

      body.appendChild(detail);
    }
  }

  return body;
};

const createMetaLine = (post) => {
  const meta = document.createElement('p');
  meta.className = 'blog-post__meta';

  const time = document.createElement('time');
  time.dateTime = post.publishedAt;
  time.textContent = formatPublishedDate(post.publishedAt);
  meta.appendChild(time);

  if (post.author) {
    const author = document.createElement('span');
    author.textContent = ` • ${post.author}`;
    meta.appendChild(author);
  }

  if (post.readTime) {
    const read = document.createElement('span');
    read.textContent = ` • ${post.readTime} min read`;
    meta.appendChild(read);
  }

  return meta;
};

const createHeroImage = (post) => {
  if (!post.heroImage) return null;
  const figure = document.createElement('figure');
  figure.className = 'blog-post__media';
  const image = document.createElement('img');
  image.src = post.heroImage;
  image.alt = post.title ? `${post.title} illustration` : 'Info illustration';
  figure.appendChild(image);
  return figure;
};

const createBlogElement = (post, variant = 'card', index = 0) => {
  const article = document.createElement('article');
  article.className = ['blog-post', `blog-post--${variant}`]
    .concat(post.featured ? 'blog-post--featured' : [])
    .join(' ');
  if (post.id) {
    article.id = `info-${post.id}`;
  }

  const titleLevel = variant === 'full' ? 'h2' : 'h3';
  const title = document.createElement(titleLevel);
  title.className = 'blog-post__title';

  const link = document.createElement('a');
  link.href = resolvePostUrl(post);
  link.textContent = post.title;
  link.className = 'blog-post__link';
  title.appendChild(link);

  const header = document.createElement('header');
  header.className = 'blog-post__header';
  header.appendChild(title);
  header.appendChild(createMetaLine(post));

  const tags = renderTags(post.tags);
  if (tags) {
    header.appendChild(tags);
  }

  const heroImage = createHeroImage(post);
  if (heroImage && variant !== 'compact') {
    article.appendChild(heroImage);
  }

  article.appendChild(header);
  article.appendChild(renderContent(post, variant));

  if (variant !== 'full') {
    const cta = document.createElement('a');
    cta.href = resolvePostUrl(post);
    cta.className = 'blog-post__cta';
    cta.textContent = 'Read the full brief';
    article.appendChild(cta);
  }

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

const renderBlogLists = () => {
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
      emptyMessage: element.dataset.blogEmpty || 'No blog posts available yet.',
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBlogLists, { once: true });
} else {
  renderBlogLists();
}
