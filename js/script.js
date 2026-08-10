(function () {
  'use strict';

  var CONFIG_URL = 'data/invites.json';
  var REDIRECT_DELAY = 3;

  var params = {};
  var config = null;
  var redirectTimer = null;
  var redirectSecondsLeft = 0;
  var redirectCard = null;

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
    var el = document.createElement('a');
    el.className = 'invite-card';
    el.href = card.link;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.id = 'card-' + card.id;

    if (card.logo) {
      var logo = document.createElement('img');
      logo.className = 'card-logo';
      logo.src = card.logo;
      logo.alt = '';
      logo.onerror = function () { logo.style.display = 'none'; };
      el.appendChild(logo);
    }

    var body = document.createElement('div');
    body.className = 'card-body';

    var name = document.createElement('div');
    name.className = 'card-name';
    name.innerHTML = renderMarkdown(card.name);
    body.appendChild(name);

    if (card.description) {
      var desc = document.createElement('div');
      desc.className = 'card-desc';
      desc.textContent = card.description;
      body.appendChild(desc);
    }

    el.appendChild(body);

    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'card-arrow');
    arrow.setAttribute('width', '20');
    arrow.setAttribute('height', '20');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '9 18 15 12 9 6');
    arrow.appendChild(polyline);
    el.appendChild(arrow);

    return el;
  }

  function highlightCard(cardId) {
    var card = document.getElementById('card-' + cardId);
    if (card) {
      card.classList.add('highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function startRedirect(card) {
    if (!card || !card.link) return;
    redirectCard = card;
    redirectSecondsLeft = REDIRECT_DELAY;

    var banner = document.getElementById('redirectBanner');
    var title = document.getElementById('redirectTitle');
    var countdown = document.getElementById('redirectCountdown');
    var bar = document.getElementById('redirectBar');

    title.innerHTML = 'Redirecting to ' + renderMarkdown(card.name);
    countdown.textContent = REDIRECT_DELAY + 's';
    bar.style.width = '0%';
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
    redirectCard = null;
    var banner = document.getElementById('redirectBanner');
    if (banner) banner.classList.remove('visible');
  }

  function showEmptyState() {
    var container = document.getElementById('cardsContainer');
    container.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-state-icon">—</div>' +
      '<p class="empty-state-text">No links configured</p>' +
      '</div>';
  }

  function showLoading() {
    var container = document.getElementById('cardsContainer');
    container.innerHTML =
      '<div class="loading-state">' +
      '<div class="loading-spinner"></div>' +
      '</div>';
  }

  function renderFooter(footer) {
    var el = document.getElementById('pageFooter');
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

    if (config.logo) {
      var logoEl = document.getElementById('pageLogo');
      logoEl.src = config.logo;
      logoEl.alt = config.title || '';
      logoEl.style.display = '';
      logoEl.onerror = function () { logoEl.style.display = 'none'; };
    } else {
      document.getElementById('pageLogo').style.display = 'none';
    }

    if (config.title) {
      var titleEl = document.getElementById('pageTitle');
      titleEl.innerHTML = config.title.replace(/\*\*(.+?)\*\*/g, '<span class="accent">$1</span>');
      document.title = config.title.replace(/\*\*(.+?)\*\*/g, '$1');
    }

    var invites = config.invites;
    var container = document.getElementById('cardsContainer');
    container.innerHTML = '';

    if (!invites || !invites.length) {
      showEmptyState();
      return;
    }

    for (var i = 0; i < invites.length; i++) {
      var card = invites[i];
      if (!card.id || !card.link) continue;
      container.appendChild(buildCard(card));
    }

    renderFooter(config.footer);

    if (params.p) {
      highlightCard(params.p);
    }

    if (params.r === 'true') {
      var target = config.invites.find(function (c) { return c.id === params.p; }) || config.invites[0];
      if (target) {
        if (params.p) highlightCard(params.p);
        startRedirect(target);
      }
    }
  }

  function init() {
    parseParams();
    showLoading();

    var cancelBtn = document.getElementById('redirectCancelBtn');
    cancelBtn.addEventListener('click', cancelRedirect);

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
