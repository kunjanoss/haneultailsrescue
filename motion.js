(() => {
  const app = document.getElementById('app');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!app || reduced.matches || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries, currentObserver) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        currentObserver.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

  let frameQueued = false;
  const reveal = () => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(() => {
      frameQueued = false;
      if (reduced.matches) {
        document.documentElement.classList.remove('motion-ready');
        return;
      }
      document.documentElement.classList.add('motion-ready');
      const items = [...app.querySelectorAll('.hero-grid > *, .section-head, .story-copy, .story-art, .dog-card, .profile-layout > *, .form-card, .review-card')].filter(item => !item.closest('#results'));
      const bounds = [];
      items.forEach(item => {
        if (item.classList.contains('reveal')) return;
        bounds.push([item, item.getBoundingClientRect()]);
      });
      items.forEach((item, i) => {
        if (item.classList.contains('reveal')) return;
        item.classList.add('reveal');
        const [_, rect] = bounds[i] || [item, { bottom: 0, top: 0 }];
        if (rect.bottom < 0 || rect.top < window.innerHeight) item.classList.add('is-visible');
        else observer.observe(item);
      });
    });
  };

  const revealPassedSections = () => {
    const items = [...app.querySelectorAll('.reveal:not(.is-visible)')];
    const bounds = [];
    items.forEach(item => {
      bounds.push([item, item.getBoundingClientRect()]);
    });
    items.forEach((item, i) => {
      const [_, rect] = bounds[i] || [item, { bottom: 0, top: 0 }];
      if (rect.bottom < 0 || rect.top < window.innerHeight) {
        item.classList.add('is-visible');
        observer.unobserve(item);
      }
    });
  };
  let scrollQueued = false;
  const onScroll = () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; revealPassedSections(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  const forgetRemoved = node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches('.reveal')) observer.unobserve(node);
    node.querySelectorAll('.reveal').forEach(item => observer.unobserve(item));
  };
  const mutations = new MutationObserver(records => {
    records.forEach(record => record.removedNodes.forEach(forgetRemoved));
    reveal();
  });
  mutations.observe(app, { childList: true, subtree: true });
  reveal();
  reduced.addEventListener?.('change', reveal);
})();
