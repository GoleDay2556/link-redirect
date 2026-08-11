(function () {
  'use strict';

  var CONFIG_URL = 'data/invites.json';
  var REDIRECT_DELAY = 3;
  var CARD_WIDTH = 27; // rem
  var CARD_GAP = 1; // rem

  var params = {};
  var config = null;
  var currentIndex = 0;
  var redirectTimer = null;
  var redirectSecondsLeft = 0;
  var rootFontSize = 16;

  function parseParams() {
    var raw = window.location.search.substring(1);
    if (!raw) return;
    var pairs = raw.replace(/\+/g, ' ').split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      params[decodeURIComponent(kv[0].trim())] = kv.length > 1 ? decodeURIComponent(kv[1].trim()) : '';
    }
  }

  function pxPerRem() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return '';

    var namedColors = {
      red: '#ef4444', blue: '#3A6FFF', green: '#22c55e', gold: '#FFC837',
      purple: '#a855f7', pink: '#ec4899', cyan: '#06b6d4', orange: '#f97316',
      yellow: '#eab308', teal: '#14b8a6', lime: '#84cc16', gray: '#9ca3af',
      white: '#ffffff'
    };

    function resolveColor(name) {
      name = name.toLowerCase().replace(/^colou?r=/, '');
      if (name in namedColors) return namedColors[name];
      if (/^#[0-9a-fA-F]{3,8}$/.test(name)) return name;
      return null;
    }

    function parseGradient(token) {
      var match = token.match(/^gradient:(.+)$/i);
      if (!match) return null;
      var colors = match[1].split(':').filter(Boolean);
      if (colors.length < 2) return null;
      var stops = colors.map(function (c, idx) {
        var color = resolveColor(c) || c;
        return color + ' ' + (idx / (colors.length - 1) * 100) + '%';
      });
      return 'linear-gradient(90deg, ' + stops.join(', ') + ')';
    }

    function tagName(tag) {
      tag = tag.toLowerCase().replace(/^\/?/, '');
      if (tag === 'color' || tag === 'colour') return 'color';
      if (tag === 'gradient') return 'gradient';
      return tag.replace(/^colou?r=/, 'color=');
    }

    var codes = [];
    var s = text;

    s = s.replace(/`([^`]+)`/g, function (_, code) {
      codes.push(code);
      return '\x00CODE' + (codes.length - 1) + '\x00';
    });

    var tmp = '';
    var i = 0;
    var stack = [];
    while (i < s.length) {
      var tagMatch = s.slice(i).match(/^<(?:(\/?(?:colou?r=(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]\w*)|#[0-9a-fA-F]{3,8}|[a-zA-Z]\w*|gradient:[^>]+)|\/?reset))>/i);
      if (tagMatch) {
        var tag = tagMatch[1];
        i += tagMatch[0].length;
        if (tag === 'reset' || tag === '/reset') {
          while (stack.length) tmp += stack.pop().close;
        } else if (tag.charAt(0) === '/') {
          var closing = tagName(tag.slice(1));
          for (var j = stack.length - 1; j >= 0; j--) {
            var sj = stack[j].name;
            if (sj === closing || (closing === 'color' && /^color=/.test(sj)) || (closing === 'gradient' && /^gradient:/.test(sj))) {
              tmp += '</span>';
              stack.splice(j, 1);
              break;
            }
          }
        } else {
          var color = resolveColor(tag);
          if (color) {
            tmp += '<span style="color:' + color + '">';
            stack.push({ name: tagName(tag), close: '</span>' });
          } else {
            var gradient = parseGradient(tag);
            if (gradient) {
              tmp += '<span class="ct-gradient" style="--ct-grad:' + gradient + '">';
              stack.push({ name: tagName(tag), close: '</span>' });
            } else {
              tmp += esc(tagMatch[0]);
            }
          }
        }
      } else {
        tmp += esc(s.charAt(i));
        i++;
      }
    }
    while (stack.length) tmp += stack.pop().close;
    s = tmp;

    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, text, url) {
      var safe = /^(https?:|mailto:|[\/#])/i.test(url);
      if (!safe) return _;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });

    s = s.replace(/\x00CODE(\d+)\x00/g, function (_, idx) {
      return '<code>' + esc(codes[parseInt(idx)] || '') + '</code>';
    });

    return s;
  }

  function buildCard(card, domain) {
    var wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';
    wrapper.setAttribute('data-id', card.id);

    var el = document.createElement('div');
    el.className = 'invite-card';
    el.setAttribute('data-id', card.id);

    if (card.logo) {
      var logo = document.createElement('img');
      logo.className = 'card-logo';
      logo.src = card.logo;
      logo.alt = '';
      logo.onerror = function () { logo.style.display = 'none'; };
      el.appendChild(logo);
    }

    var name = document.createElement('div');
    name.className = 'card-name';
    name.innerHTML = renderMarkdown(card.name);
    el.appendChild(name);

    if (card.description) {
      var desc = document.createElement('div');
      desc.className = 'card-desc';
      desc.textContent = card.description;
      el.appendChild(desc);
    }

    var btn = document.createElement('button');
    btn.className = 'redirect-btn';
    btn.setAttribute('data-url', card.link);
    btn.setAttribute('data-name', card.name);

    var span = document.createElement('span');
    span.textContent = card.link;
    btn.appendChild(span);

    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('width', '18');
    arrow.setAttribute('height', '18');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    arrow.appendChild(polyline);
    btn.appendChild(arrow);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = card.link;
    });

    el.appendChild(btn);

    var pill = document.createElement('div');
    pill.className = 'countdown-pill';

    var spinner = document.createElement('div');
    spinner.className = 'countdown-pill-spinner';
    pill.appendChild(spinner);

    var pillText = document.createElement('span');
    pillText.className = 'countdown-pill-text';
    pill.appendChild(pillText);

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'countdown-pill-cancel';
    cancelBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    cancelBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      cancelRedirect();
    });
    pill.appendChild(cancelBtn);

    el.appendChild(pill);
    wrapper.appendChild(el);
    return wrapper;
  }

  function getWrappers() {
    return document.querySelectorAll('.carousel-track .card-wrapper');
  }

  function getCardCount() {
    return getWrappers().length;
  }

  function getStepPx() {
    rootFontSize = pxPerRem();
    return (CARD_WIDTH + CARD_GAP) * rootFontSize;
  }

  function updateFade() {
    var wrappers = getWrappers();
    for (var i = 0; i < wrappers.length; i++) {
      var dist = Math.abs(i - currentIndex);
      wrappers[i].classList.remove('active', 'nearby');
      if (dist === 0) {
        wrappers[i].classList.add('active');
      } else if (dist === 1) {
        wrappers[i].classList.add('nearby');
      }
    }
  }

  function updateArrows() {
    var prev = document.getElementById('carouselPrev');
    var next = document.getElementById('carouselNext');
    if (!prev || !next) return;
    var count = getCardCount();
    if (count <= 1) {
      prev.disabled = true;
      next.disabled = true;
    } else {
      prev.disabled = currentIndex === 0;
      next.disabled = currentIndex >= count - 1;
    }
  }

  function updateDots() {
    var dots = document.getElementById('carouselDots');
    if (!dots) return;
    dots.innerHTML = '';
    var count = getCardCount();
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('button');
      dot.className = 'carousel-dot';
      if (i === currentIndex) dot.classList.add('active');
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.addEventListener('click', (function (idx) {
        return function () { goToSlide(idx); };
      })(i));
      dots.appendChild(dot);
    }
  }

  function goToSlide(index) {
    var count = getCardCount();
    if (count === 0) return;
    if (index < 0) index = 0;
    if (index >= count) index = count - 1;

    currentIndex = index;

    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.style.transform = 'translateX(-' + (currentIndex * getStepPx()) + 'px)';

    updateFade();
    updateArrows();
    updateDots();
  }

  function setupDrag() {
    var viewport = document.getElementById('carouselViewport');
    var track = document.getElementById('carouselTrack');
    if (!viewport || !track) return;
    var startX = 0;
    var currentX = 0;
    var dragging = false;
    var dragOffset = 0;

    function onStart(e) {
      var count = getCardCount();
      if (count <= 1) return;
      dragging = true;
      viewport.classList.add('dragging');
      track.classList.add('no-transition');
      startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      currentX = startX;
      dragOffset = 0;
    }

    function onMove(e) {
      if (!dragging) return;
      currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      dragOffset = currentX - startX;
      var offset = -(currentIndex * getStepPx()) + dragOffset;
      track.style.transform = 'translateX(' + offset + 'px)';
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('dragging');
      track.classList.remove('no-transition');

      var threshold = viewport.offsetWidth * 0.15;
      if (Math.abs(dragOffset) > threshold) {
        if (dragOffset < 0) {
          goToSlide(currentIndex + 1);
        } else {
          goToSlide(currentIndex - 1);
        }
      } else {
        goToSlide(currentIndex);
      }

      dragOffset = 0;
    }

    viewport.addEventListener('mousedown', onStart);
    viewport.addEventListener('touchstart', onStart, { passive: true });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });

    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
  }

  function startRedirect(card) {
    if (!card || !card.link) return;
    redirectSecondsLeft = REDIRECT_DELAY;

    var wrappers = getWrappers();
    var wrapper = wrappers[currentIndex] || wrappers[0];
    if (!wrapper) { window.location.href = card.link; return; }
    var pill = wrapper.querySelector('.countdown-pill');
    if (!pill) { window.location.href = card.link; return; }
    var text = pill.querySelector('.countdown-pill-text');

    if (text) text.textContent = redirectSecondsLeft + 's';
    pill.classList.add('visible');

    updatePillCountdown();
    redirectTimer = setInterval(function () {
      redirectSecondsLeft--;
      if (redirectSecondsLeft <= 0) {
        clearInterval(redirectTimer);
        redirectTimer = null;
        window.location.href = card.link;
        return;
      }
      updatePillCountdown();
    }, 1000);
  }

  function updatePillCountdown() {
    var wrappers = getWrappers();
    var wrapper = wrappers[currentIndex] || wrappers[0];
    if (!wrapper) return;
    var text = wrapper.querySelector('.countdown-pill-text');
    if (text) text.textContent = redirectSecondsLeft + 's';
  }

  function cancelRedirect() {
    if (redirectTimer) {
      clearInterval(redirectTimer);
      redirectTimer = null;
    }
    redirectSecondsLeft = 0;
    var wrappers = getWrappers();
    for (var i = 0; i < wrappers.length; i++) {
      var pill = wrappers[i].querySelector('.countdown-pill');
      if (pill) pill.classList.remove('visible');
    }
  }

  function showEmptyState() {
    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML =
      '<div class="empty-state" style="flex:1">' +
      '<div class="empty-state-icon">—</div>' +
      '<p class="empty-state-text">No links configured</p>' +
      '</div>';
    var prev = document.getElementById('carouselPrev');
    var next = document.getElementById('carouselNext');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    document.getElementById('carouselDots').innerHTML = '';
  }

  function showLoading() {
    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML =
      '<div class="loading-state">' +
      '<div class="loading-spinner"></div>' +
      '</div>';
  }

  function renderFooter(footer) {
    var el = document.getElementById('pageFooter');
    if (!el) return;
    if (!footer) { el.style.display = 'none'; return; }

    var link = document.createElement('a');
    link.className = 'footer-link';
    link.href = footer.link || 'https://www.lancsmp.ru';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    if (footer.logo) {
      var logo = document.createElement('img');
      logo.className = 'footer-logo';
      logo.src = footer.logo;
      logo.alt = '';
      logo.onerror = function () { logo.style.display = 'none'; };
      link.appendChild(logo);
    }

    var span = document.createElement('span');
    span.innerHTML = renderMarkdown(footer.text || 'Powered by Lancasters Studios');
    link.appendChild(span);

    el.appendChild(link);
  }

  function applyMeta(meta) {
    if (!meta) return;

    if (meta.title) {
      document.title = meta.title;
      setMetaContent('ogTitle', meta.title);
      setMetaContent('twTitle', meta.title);
      var headTitle = document.getElementById('pageHeadTitle');
      if (headTitle) headTitle.textContent = meta.title;
    }

    if (meta.description) {
      setMetaContent('metaDesc', meta.description);
      setMetaContent('ogDesc', meta.description);
      setMetaContent('twDesc', meta.description);
    }

    if (meta.image) {
      setMetaContent('ogImage', meta.image);
      setMetaContent('twImage', meta.image);
    }

    if (meta.color) {
      setMetaContent('metaColor', meta.color);
    }

    if (meta.siteName) {
      setMetaContent('ogSite', meta.siteName);
    }

    setMetaContent('ogUrl', window.location.href);
  }

  function setMetaContent(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.hasAttribute('content')) {
      el.setAttribute('content', value);
    }
  }

  function render() {
    if (!config) {
      showEmptyState();
      return;
    }

    applyMeta(config.meta);

    var logoEl = document.getElementById('pageLogo');
    if (logoEl) {
      if (config.logo) {
        logoEl.src = config.logo;
        logoEl.alt = config.title || '';
        logoEl.style.display = '';
        logoEl.onerror = function () { logoEl.style.display = 'none'; };
      } else {
        logoEl.style.display = 'none';
      }
    }

    var titleEl = document.getElementById('pageTitle');
    if (titleEl && config.title) {
      titleEl.innerHTML = config.title.replace(/\*\*(.+?)\*\*/g, '<span class="accent">$1</span>');
      document.title = config.title.replace(/\*\*(.+?)\*\*/g, '$1');
    }

    var allInvites = (config.invites || []).slice().sort(function (a, b) {
      return (b.priority || 0) - (a.priority || 0);
    });
    var singleMode = !!params.p;
    var invites;

    if (singleMode) {
      invites = allInvites.filter(function (c) { return c.id === params.p; });
      if (!invites.length) {
        singleMode = false;
        invites = allInvites;
      }
    } else {
      invites = allInvites;
    }

    if (singleMode && invites[0]) {
      var c = invites[0];
      var globalMeta = config.meta || {};
      var cardMeta = c.meta || {};
      var merged = {
        title: cardMeta.title || globalMeta.title || '',
        description: cardMeta.description || globalMeta.description || '',
        color: cardMeta.color || globalMeta.color || '',
        image: cardMeta.image || globalMeta.image || '',
        siteName: cardMeta.siteName || globalMeta.siteName || ''
      };
      applyMeta(merged);
    }

    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML = '';

    if (!invites || !invites.length) {
      showEmptyState();
      return;
    }

    rootFontSize = pxPerRem();

    for (var i = 0; i < invites.length; i++) {
      var card = invites[i];
      if (!card.id || !card.link) continue;
      var wrapper = buildCard(card);
      if (singleMode) wrapper.classList.add('single');
      track.appendChild(wrapper);
    }

    renderFooter(config.footer);

    var wrapper = document.getElementById('carouselWrapper');
    var dots = document.getElementById('carouselDots');

    if (singleMode) {
      if (wrapper) wrapper.classList.add('single');
      if (dots) dots.classList.add('hidden');
      if (track) track.style.padding = '0';
      updateFade();
    } else {
      if (wrapper) wrapper.classList.remove('single');
      if (dots) dots.classList.remove('hidden');
      setupDrag();
      goToSlide(0);

      var prevBtn = document.getElementById('carouselPrev');
      var nextBtn = document.getElementById('carouselNext');
      if (prevBtn) prevBtn.addEventListener('click', function () { goToSlide(currentIndex - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { goToSlide(currentIndex + 1); });
    }

    if (params.r === 'true') {
      var target = invites[0];
      if (target) {
        startRedirect(target);
      }
    }
  }

  function init() {
    parseParams();
    showLoading();

    fetch(CONFIG_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load config');
        return res.json();
      })
      .then(function (data) {
        config = data;
        render();
      })
      .catch(function (err) {
        console.error('Failed to load invites config:', err);
        showEmptyState();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
