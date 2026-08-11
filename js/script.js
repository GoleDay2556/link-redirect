(function () {
  'use strict';

  var CONFIG_URL = 'data/invites.json';
  var REDIRECT_DELAY = 3;

  var params = {};
  var config = null;
  var currentIndex = 0;
  var redirectTimer = null;
  var redirectSecondsLeft = 0;

  function parseParams() {
    var raw = window.location.search.substring(1);
    if (!raw) return;
    var pairs = raw.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      params[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
    }
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
      if (name in namedColors) return namedColors[name];
      if (/^#[0-9a-fA-F]{3,8}$/.test(name)) return name;
      return null;
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
      var tagMatch = s.slice(i).match(/^<(?:(\/?(?:#[0-9a-fA-F]{3,8}|\w+)|\/?reset))>/);
      if (tagMatch) {
        var tag = tagMatch[1];
        i += tagMatch[0].length;
        if (tag === 'reset' || tag === '/reset') {
          while (stack.length) tmp += stack.pop().close;
        } else if (tag.charAt(0) === '/') {
          var closing = tag.slice(1);
          for (var j = stack.length - 1; j >= 0; j--) {
            if (stack[j].name === closing) {
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
            tmp += esc(tagMatch[0]);
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

  function buildCard(card) {
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
    arrow.setAttribute('width', '16');
    arrow.setAttribute('height', '16');
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
      window.open(card.link, '_blank', 'noopener,noreferrer');
    });

    el.appendChild(btn);
    return el;
  }

  function getCards() {
    return document.querySelectorAll('.carousel-track .invite-card');
  }

  function getCardCount() {
    return getCards().length;
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
    track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';

    var cards = getCards();
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('highlight', i === currentIndex && cards[i].getAttribute('data-id') === params.p);
    }

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
      var percentOffset = (dragOffset / viewport.offsetWidth) * 100;
      track.style.transform = 'translateX(' + (-(currentIndex * 100) + percentOffset) + '%)';
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('dragging');
      track.classList.remove('no-transition');

      var threshold = viewport.offsetWidth * 0.2;
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

  function highlightCard(cardId) {
    var cards = getCards();
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-id') === cardId) {
        goToSlide(i);
        cards[i].classList.add('highlight');
        return;
      }
    }
  }

  function startRedirect(card) {
    if (!card || !card.link) return;
    redirectSecondsLeft = REDIRECT_DELAY;

    var banner = document.getElementById('redirectBanner');
    if (!banner) return;
    var title = document.getElementById('redirectTitle');
    var countdown = document.getElementById('redirectCountdown');
    var bar = document.getElementById('redirectBar');

    if (title) title.innerHTML = 'Redirecting to ' + renderMarkdown(card.name);
    if (countdown) countdown.textContent = REDIRECT_DELAY + 's';
    if (bar) bar.style.width = '0%';
    banner.classList.add('visible');

    updateCountdown();
    redirectTimer = setInterval(function () {
      redirectSecondsLeft--;
      if (redirectSecondsLeft <= 0) {
        clearInterval(redirectTimer);
        redirectTimer = null;
        window.location.href = card.link;
        return;
      }
      updateCountdown();
    }, 1000);
  }

  function updateCountdown() {
    var countdown = document.getElementById('redirectCountdown');
    var bar = document.getElementById('redirectBar');
    if (countdown) countdown.textContent = redirectSecondsLeft + 's';
    if (bar) {
      var pct = ((REDIRECT_DELAY - redirectSecondsLeft) / REDIRECT_DELAY) * 100;
      bar.style.width = pct + '%';
    }
  }

  function cancelRedirect() {
    if (redirectTimer) {
      clearInterval(redirectTimer);
      redirectTimer = null;
    }
    redirectSecondsLeft = 0;
    var banner = document.getElementById('redirectBanner');
    if (banner) banner.classList.remove('visible');
  }

  function showEmptyState() {
    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-state-icon">—</div>' +
      '<p class="empty-state-text">No links configured</p>' +
      '</div>';
    var prev = document.getElementById('carouselPrev');
    var next = document.getElementById('carouselNext');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
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

  function render() {
    if (!config) {
      showEmptyState();
      return;
    }

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

    var allInvites = config.invites || [];
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

    var track = document.getElementById('carouselTrack');
    if (!track) return;
    track.innerHTML = '';

    if (!invites || !invites.length) {
      showEmptyState();
      return;
    }

    for (var i = 0; i < invites.length; i++) {
      var card = invites[i];
      if (!card.id || !card.link) continue;
      track.appendChild(buildCard(card));
    }

    renderFooter(config.footer);

    var wrapper = document.getElementById('carouselWrapper');
    var dots = document.getElementById('carouselDots');

    if (singleMode) {
      if (wrapper) wrapper.classList.add('single');
      if (dots) dots.classList.add('hidden');
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

    var cancelBtn = document.getElementById('redirectCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelRedirect);

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
