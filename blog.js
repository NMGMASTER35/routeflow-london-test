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
  return slug ? `blog.html#blog-${slug}` : 'blog.html';
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
  image.alt = post.title ? `${post.title} illustration` : 'Blog illustration';
  figure.appendChild(image);
  return figure;
};

const createBlogElement = (post, variant = 'card', index = 0) => {
  const article = document.createElement('article');
  article.className = ['blog-post', `blog-post--${variant}`]
    .concat(post.featured ? 'blog-post--featured' : [])
    .join(' ');
  if (post.id) {
    article.id = `blog-${post.id}`;
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
    cta.textContent = 'Read the full update';
    article.appendChild(cta);
  }

  article.dataset.index = String(index);
  return article;
};

const renderBlogLists = () => {
  const containers = document.querySelectorAll('[data-blog-list]');
  if (!containers.length) return;

  const posts = getStoredBlogPosts()
    .slice()
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  containers.forEach((container) => {
    const limit = Number(container.dataset.blogLimit);
    const variant = container.dataset.blogVariant || 'card';
    const emptyMessage = container.dataset.blogEmpty || 'No blog posts available yet.';

    const subset = Number.isFinite(limit) && limit > 0 ? posts.slice(0, limit) : posts;

    if (!subset.length) {
      const empty = document.createElement('p');
      empty.className = 'blog-empty';
      empty.textContent = emptyMessage;
      container.replaceChildren(empty);
      return;
    }

    const elements = subset.map((post, index) => createBlogElement(post, variant, index));
    container.replaceChildren(...elements);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBlogLists, { once: true });
} else {
  renderBlogLists();
}
