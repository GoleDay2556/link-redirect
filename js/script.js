(function () {
  'use strict';

  var CONFIG_URL = 'data/invites.json';
  var REDIRECT_DELAY = 3;
  var CARD_WIDTH = 32; // rem
  var CARD_GAP = 1; // rem

  var params = {};
  var config = null;
  var currentIndex = 0;
  var redirectTimer = null;
  var redirectSecondsLeft = 0;
  var rootFontSize = 16;
  var dragSetup = false;
  var keyboardSetup = false;
  var resizeBound = false;

  function debounce(fn, delay) {
    var timer;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

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

  function isSafeUrl(url) {
    if (!url) return false;
    return /^(https?:|mailto:|[\/#])/i.test(url);
  }

  function redirectTo(url) {
    if (isSafeUrl(url)) {
      window.location.href = url;
    }
  }

  function normalizeUrlForDisplay(url) {
    if (!url) return '';
    var cleaned = url.replace(/^https?:\/\//i, '');
    if (cleaned.length > 40) {
      cleaned = cleaned.substring(0, 38) + '\u2026';
    }
    return cleaned;
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
      if (/^colou?r=/.test(tag)) return 'color';
      if (/^gradient:/.test(tag)) return 'gradient';
      return tag;
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
            var sjT = tagName(sj);
            if (sjT === closing) {
              tmp += '</span>';
              stack.splice(j, 1);
              break;
            }
          }
        } else {
          var color = resolveColor(tag);
          if (color) {
            tmp += '<span style="color:' + color + '">';
            stack.push({ name: tag, close: '</span>' });
          } else {
            var gradient = parseGradient(tag);
            if (gradient) {
              tmp += '<span class="ct-gradient" style="--ct-grad:' + gradient + '">';
              stack.push({ name: tag, close: '</span>' });
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

  function getCardMode(card) {
    var cardMode = card.mode;
    var globalMode = config && config.mode;
    return cardMode || globalMode || 'public';
  }

  function buildCard(card) {
    var mode = getCardMode(card);
    var isCompact = mode === 'link-only' || mode === 'redirect';

    var wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';
    if (isCompact) wrapper.classList.add('compact-card');
    wrapper.setAttribute('data-id', card.id);
    if (mode === 'redirect') wrapper.setAttribute('data-redirect', 'true');

    var el = document.createElement('div');
    el.className = 'invite-card';
    if (isCompact) el.classList.add('compact');
    el.setAttribute('data-id', card.id);

    if (!isCompact && card.preview) {
      var preview = document.createElement('img');
      preview.className = 'card-preview';
      preview.src = card.preview;
      preview.alt = '';
      preview.loading = 'lazy';
      preview.onerror = function () { preview.style.display = 'none'; };
      el.appendChild(preview);
    }

    if (card.logo) {
      var logo = document.createElement('img');
      logo.className = 'card-logo';
      logo.src = card.logo;
      logo.alt = '';
      logo.loading = 'lazy';
      logo.onerror = function () { logo.style.display = 'none'; };
      el.appendChild(logo);
    }

    var contentWrap = document.createElement('div');
    contentWrap.className = 'card-content';

    var name = document.createElement('div');
    name.className = 'card-name';
    name.innerHTML = renderMarkdown(card.name);
    contentWrap.appendChild(name);

    if (!isCompact && card.description) {
      var desc = document.createElement('div');
      desc.className = 'card-desc';
      desc.textContent = card.description;
      contentWrap.appendChild(desc);
    }

    el.appendChild(contentWrap);

    var btn = document.createElement('button');
    btn.className = 'redirect-btn';
    btn.setAttribute('data-url', card.link);
    btn.setAttribute('data-name', card.name);

    var label = document.createElement('span');
    label.className = 'redirect-btn-label';
    label.textContent = card.label || 'Join';
    btn.appendChild(label);

    var urlText = document.createElement('span');
    urlText.className = 'redirect-btn-url';
    urlText.textContent = normalizeUrlForDisplay(card.link);
    btn.appendChild(urlText);

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
      cancelRedirect();
      redirectTo(card.link);
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
    cancelBtn.setAttribute('aria-label', 'Cancel redirect');
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

  function calculateTrackPadding() {
    var viewport = document.getElementById('carouselViewport');
    var track = document.getElementById('carouselTrack');
    if (!viewport || !track) return;
    var cardWidthPx = CARD_WIDTH * pxPerRem();
    var viewportWidth = viewport.offsetWidth;
    var padding = Math.max(0, (viewportWidth - cardWidthPx) / 2);
    track.style.paddingLeft = padding + 'px';
    track.style.paddingRight = padding + 'px';
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
    var step = getStepPx();
    track.style.transform = 'translateX(-' + (currentIndex * step) + 'px)';

    updateFade();
    updateArrows();
    updateDots();
  }

  function setupDrag() {
    if (dragSetup) return;
    dragSetup = true;

    var viewport = document.getElementById('carouselViewport');
    var track = document.getElementById('carouselTrack');
    if (!viewport || !track) return;
    var startX = 0;
    var startY = 0;
    var currentX = 0;
    var currentY = 0;
    var dragging = false;
    var dragOffset = 0;
    var isHorizontalDrag = null;

    function onStart(e) {
      var count = getCardCount();
      if (count <= 1) return;
      dragging = true;
      viewport.classList.add('dragging');
      track.classList.add('no-transition');
      startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      currentX = startX;
      currentY = startY;
      dragOffset = 0;
      isHorizontalDrag = null;
    }

    function onMove(e) {
      if (!dragging) return;
      currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      currentY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      var dx = currentX - startX;
      var dy = currentY - startY;

      if (isHorizontalDrag === null) {
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          isHorizontalDrag = Math.abs(dx) > Math.abs(dy);
        }
        if (isHorizontalDrag === null) return;
      }

      if (!isHorizontalDrag) {
        dragging = false;
        viewport.classList.remove('dragging');
        track.classList.remove('no-transition');
        return;
      }

      dragOffset = dx;
      var step = getStepPx();
      var offset = -(currentIndex * step) + dragOffset;
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
    if (!wrapper) { redirectTo(card.link); return; }
    var pill = wrapper.querySelector('.countdown-pill');
    if (!pill) { redirectTo(card.link); return; }
    var text = pill.querySelector('.countdown-pill-text');

    if (text) text.textContent = redirectSecondsLeft + 's';
    pill.classList.add('visible');

    redirectTimer = setInterval(function () {
      redirectSecondsLeft--;
      if (redirectSecondsLeft <= 0) {
        clearInterval(redirectTimer);
        redirectTimer = null;
        redirectTo(card.link);
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
      '<div class="empty-state">' +
      '<div class="empty-state-icon">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
      '</div>' +
      '<p class="empty-state-text">No links configured</p>' +
      '<p class="empty-state-hint">Add invite links to data/invites.json</p>' +
      '</div>';
    disableNav();
  }

  function showErrorState(message) {
    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML =
      '<div class="error-state">' +
      '<div class="error-state-icon">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '</div>' +
      '<p class="error-state-text">Failed to load invites</p>' +
      '<p class="empty-state-hint">' + esc(message) + '</p>' +
      '</div>';
    disableNav();
  }

  function disableNav() {
    var prev = document.getElementById('carouselPrev');
    var next = document.getElementById('carouselNext');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    var dots = document.getElementById('carouselDots');
    if (dots) dots.innerHTML = '';
  }

  function showLoading() {
    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML =
      '<div class="loading-state">' +
      '<div class="loading-spinner"></div>' +
      '<span class="loading-text">Loading invites\u2026</span>' +
      '</div>';
  }

  function animateCardsEntrance() {
    var wrappers = getWrappers();
    if (!wrappers.length) return;

    var viewport = document.getElementById('carouselViewport');
    if (viewport) viewport.classList.add('entering');

    var totalDelay = 100 + (wrappers.length - 1) * 80 + 550;

    for (var i = 0; i < wrappers.length; i++) {
      wrappers[i].classList.add('card-entering');
      var delay = 100 + i * 80;
      setTimeout((function (w) {
        return function () {
          w.classList.remove('card-entering');
          w.classList.add('card-visible');
          setTimeout(function () {
            w.classList.remove('card-visible');
          }, 550);
        };
      })(wrappers[i]), delay);
    }

    setTimeout(function () {
      if (viewport) viewport.classList.remove('entering');
    }, totalDelay + 100);
  }

  function renderFooter(footer) {
    var el = document.getElementById('pageFooter');
    if (!el) return;
    el.innerHTML = '';
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

  function setupKeyboard() {
    if (keyboardSetup) return;
    keyboardSetup = true;

    var wrapper = document.getElementById('carouselWrapper');
    if (!wrapper) return;

    wrapper.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToSlide(currentIndex + 1);
      }
    });
  }

  function cleanUrl() {
    var cleanPath = params.p ? '/' + encodeURIComponent(params.p) : '/';
    var cleanSearch = params.r === 'true' ? '?r=true' : '';
    window.history.replaceState(null, '', cleanPath + cleanSearch);
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
    var singleMode = false;
    var invites;
    var matchedSingle = false;

    if (params.p) {
      var matching = allInvites.filter(function (c) { return c.id === params.p; });
      if (matching.length) {
        singleMode = true;
        matchedSingle = true;
        invites = matching;
      } else {
        invites = allInvites;
      }
    } else {
      invites = allInvites;
    }

    if (matchedSingle && invites[0]) {
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
      track.style.padding = '0';
      updateFade();
      var wrs = getWrappers();
      if (wrs.length === 1 && wrs[0]) {
        wrs[0].classList.add('active');
      }
    } else {
      if (wrapper) {
        wrapper.classList.remove('single');
        wrapper.setAttribute('tabindex', '0');
      }
      if (dots) dots.classList.remove('hidden');
      calculateTrackPadding();
      setupDrag();
      setupKeyboard();
      goToSlide(0);

      var prevBtn = document.getElementById('carouselPrev');
      var nextBtn = document.getElementById('carouselNext');
      if (prevBtn) prevBtn.addEventListener('click', function () { goToSlide(currentIndex - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { goToSlide(currentIndex + 1); });

      var allWrappers = getWrappers();
      for (var j = 0; j < allWrappers.length; j++) {
        (function (idx) {
          allWrappers[idx].addEventListener('click', function () {
            if (idx !== currentIndex) goToSlide(idx);
          });
        })(j);
      }
    }

    if (!singleMode && getCardCount() > 1) {
      animateCardsEntrance();
    } else if (!singleMode) {
      updateFade();
    }

    if (params.r === 'true' || (matchedSingle && invites[0] && getCardMode(invites[0]) === 'redirect')) {
      var target = invites[0];
      if (target) {
        startRedirect(target);
      }
    }

    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener('resize', debounce(function () {
        rootFontSize = pxPerRem();
        var ws = document.getElementById('carouselWrapper');
        if (ws && !ws.classList.contains('single')) {
          calculateTrackPadding();
          goToSlide(currentIndex);
        }
      }, 150));
    }

    if (params.p || params.r) {
      cleanUrl();
    }
  }

  function validateConfig(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.invites && !Array.isArray(data.invites)) return false;
    if (data.invites) {
      for (var i = 0; i < data.invites.length; i++) {
        var inv = data.invites[i];
        if (!inv.id || !inv.link) return false;
        if (!isSafeUrl(inv.link)) return false;
      }
    }
    return true;
  }

  function init() {
    parseParams();
    showLoading();

    fetch(CONFIG_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        return res.json();
      })
      .then(function (data) {
        if (!validateConfig(data)) throw new Error('Invalid config structure');
        config = data;
        render();
      })
      .catch(function (err) {
        console.error('Failed to load invites config:', err);
        showErrorState(err.message || 'Could not load configuration');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
