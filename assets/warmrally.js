(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const money = (c) => '$' + (c / 100).toFixed(2);
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3200); };

  let CAT, PROD, selTier;

  async function boot() {
    try { CAT = await (await fetch('data/catalog.json', { cache: 'no-cache' })).json(); }
    catch { return; }
    PROD = CAT.products[0];
    renderTiers();
    renderReviews();
    timeline();
    sticky();
    $('#yr').textContent = new Date().getFullYear();
  }

  function renderTiers() {
    const tiers = PROD.bundles.tiers;
    selTier = tiers.find((t) => t.badge === 'MOST POPULAR') || tiers[0];
    const form = $('#bundleForm');
    form.innerHTML = tiers.map((t) => `
      <label class="tier${t.id === selTier.id ? ' sel' : ''}${t.badge === 'MOST POPULAR' ? ' pop' : ''}" data-id="${t.id}">
        ${t.badge ? `<span class="badge${t.badge === 'MOST POPULAR' ? ' pop' : ''}">${t.badge}</span>` : ''}
        <div class="tier-main">
          <span class="radio" role="radio" aria-checked="${t.id === selTier.id}"></span>
          <div class="tier-body">
            <div class="tier-top"><span class="tier-qty">${t.title}</span><span class="ship-tag">FREE SHIPPING</span></div>
            <div class="tier-save">${t.save || ''}</div>
          </div>
          <div class="tier-price"><b>${money(t.price_cents)}</b><s>${money(t.compare_at_cents)}</s></div>
        </div>
        <div class="warranty">
          <span class="w-seal">30&#9733;</span>
          <input type="checkbox" class="w-chk" data-id="${t.id}" aria-label="Add 30-day warranty">
          <span>+ 30-Day Warranty</span>
          <span class="w-price">${money(PROD.bundles.addons[0].price_cents)}</span>
        </div>
      </label>`).join('');

    form.querySelectorAll('.tier').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('w-chk')) return; // don't toggle tier when ticking warranty
        selTier = tiers.find((t) => t.id === el.dataset.id);
        form.querySelectorAll('.tier').forEach((x) => {
          const on = x === el; x.classList.toggle('sel', on);
          x.querySelector('.radio').setAttribute('aria-checked', on);
        });
        updateLead();
      });
    });
    updateLead();
  }

  function warrantyOn() { const c = document.querySelector(`.w-chk[data-id="${selTier.id}"]`); return c && c.checked; }

  function updateLead() {
    $('#leadPrice').textContent = money(selTier.price_cents);
    $('#leadCompare').textContent = money(selTier.compare_at_cents);
    $('#sbPrice').innerHTML = `${money(selTier.price_cents)} <s>${money(selTier.compare_at_cents)}</s>`;
  }

  function timeline() {
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const add = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
    $('#tlOrdered').textContent = 'Today';
    $('#tlReady').textContent = `${fmt(add(1))} – ${fmt(add(2))}`;
    $('#tlDelivered').textContent = `${fmt(add(9))} – ${fmt(add(12))}`;
  }

  function sticky() {
    const bar = $('#stickyBuy'), hero = $('.hero');
    const io = new IntersectionObserver(([e]) => bar.classList.toggle('show', !e.isIntersecting), { rootMargin: '-200px 0px 0px 0px' });
    io.observe(hero);
  }

  function renderReviews() {
    const track = $('#rvTrack'), dotsBox = $('#rvDots');
    if (!track) return;
    const real = Array.isArray(CAT.reviews) ? CAT.reviews : [];
    const list = real.length ? real : [{}, {}, {}]; // placeholders until real reviews are added
    track.innerHTML = list.map((r) => {
      const hasImg = !!r.img, hasText = !!r.text;
      const n = Math.max(1, Math.min(5, r.rating || 5));
      const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
      return `<article class="rv-card">
        <div class="rv-img ${hasImg ? '' : 'empty'}">${hasImg ? `<img src="${r.img}" alt="${(r.name || 'Customer')} photo" loading="lazy">` : ''}</div>
        <div class="rv-body">
          <div class="rv-stars ${hasText ? '' : 'empty'}">${stars}</div>
          <p class="rv-text ${hasText ? '' : 'empty'}">${hasText ? r.text : 'Your review here'}</p>
          <div class="rv-name">${r.name ? `${r.name} <span class="rv-verified" title="Verified">✓</span>` : ''}</div>
        </div>
      </article>`;
    }).join('');

    const cards = [...track.children];
    dotsBox.innerHTML = cards.map((_, i) => `<button class="rv-dot${i === 0 ? ' on' : ''}" data-i="${i}" aria-label="Go to review ${i + 1}"></button>`).join('');
    const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth);
    const cur = () => Math.round(track.scrollLeft / step());
    const go = (i) => { i = Math.max(0, Math.min(cards.length - 1, i)); track.scrollTo({ left: cards[i].offsetLeft - track.offsetLeft, behavior: 'smooth' }); };
    $('.rv-arr.l').onclick = () => go(cur() - 1);
    $('.rv-arr.r').onclick = () => go(cur() + 1);
    dotsBox.querySelectorAll('.rv-dot').forEach((d) => d.onclick = () => go(+d.dataset.i));
    track.addEventListener('scroll', () => {
      const c = cur();
      dotsBox.querySelectorAll('.rv-dot').forEach((d, i) => d.classList.toggle('on', i === c));
    }, { passive: true });
  }

  async function checkout() {
    const btn = $('#buyBtn'); const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Starting checkout…';
    const item = { handle: PROD.handle, qty: 1, tier: selTier.id, units: Array.from({ length: selTier.qty }, () => ({})), addons: warrantyOn() ? ['warranty'] : [] };
    try {
      const r = await fetch('/.netlify/functions/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [item] }) });
      const data = await r.json();
      if (r.ok && data.url) { window.location.href = data.url; return; }
      toast(data.error || 'Checkout is temporarily unavailable.');
    } catch { toast('Checkout is temporarily unavailable.'); }
    btn.disabled = false; btn.textContent = label;
  }

  document.addEventListener('click', (e) => {
    if (e.target.id === 'buyBtn' || e.target.id === 'sbBtn') checkout();
    const th = e.target.closest('.thumb');
    if (th) { $('#gMain').src = th.dataset.src; document.querySelectorAll('.thumb').forEach((x) => x.classList.toggle('active', x === th)); }
  });

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
