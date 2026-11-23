(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (c) => '$' + (c / 100).toFixed(2);
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3200); };

  let CAT, PROD, selTier;

  /* ---------- cart ---------- */
  const CART_KEY = 'wr_cart_v1';
  const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };
  const writeCart = (c) => { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch {} renderCart(); };
  const cartLines = () => readCart().filter((l) => l && PROD && l.handle === PROD.handle && Array.isArray(l.units));
  const tierOf = (id) => PROD.bundles.tiers.find((t) => t.id === id);
  function linePrice(l) { const t = tierOf(l.tier); let c = t ? t.price_cents : PROD.price_cents; for (const a of l.addons || []) c += (PROD.bundles.addons.find((x) => x.id === a)?.price_cents || 0); return c; }

  function addLine() {
    const addons = warrantyOn() ? ['warranty'] : [];
    const key = selTier.id + '|' + addons.slice().sort().join(',');
    const c = cartLines();
    const ex = c.find((l) => (l.tier + '|' + (l.addons || []).slice().sort().join(',')) === key);
    if (ex) ex.qty = Math.min(10, ex.qty + 1);
    else c.push({ handle: PROD.handle, tier: selTier.id, qty: 1, units: Array.from({ length: selTier.qty }, () => ({})), addons });
    writeCart(c);
    openDrawer();
  }

  function buildDrawer() {
    const d = document.createElement('div');
    d.innerHTML = `<div class="overlay"></div><aside class="drawer" aria-label="Cart"><div class="drawer-h"><h2>Your cart</h2><button class="drawer-close" aria-label="Close">&times;</button></div><div class="lines"></div><div class="drawer-f"><div class="sum"><span>Subtotal</span><span class="tot"></span></div><p class="muted-sm">Shipping &amp; taxes calculated at checkout.</p><button class="co-go">Checkout</button></div></aside>`;
    document.body.append(...d.children);
    $('.overlay').onclick = closeDrawer;
    $('.drawer-close').onclick = closeDrawer;
    $('.co-go').onclick = () => { if (cartLines().length) window.location.href = 'checkout.html'; };
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
  }
  function openDrawer() { $('.overlay')?.classList.add('show'); $('.drawer')?.classList.add('show'); }
  function closeDrawer() { $('.overlay')?.classList.remove('show'); $('.drawer')?.classList.remove('show'); }

  function renderCart() {
    if (!$('.drawer')) return;
    const lines = cartLines();
    const n = lines.reduce((s, l) => s + l.qty, 0), total = lines.reduce((s, l) => s + linePrice(l) * l.qty, 0);
    const bub = $('#cartBubble'); if (bub) { bub.textContent = n; bub.hidden = !n; }
    $('.lines').innerHTML = lines.length ? lines.map((l, i) => {
      const t = tierOf(l.tier);
      const extras = (l.addons || []).map((a) => PROD.bundles.addons.find((x) => x.id === a)?.title).filter(Boolean);
      return `<div class="line" data-i="${i}"><img src="${PROD.images[0]}" alt=""><div class="line-b"><b>${PROD.title}</b>${t ? `<small>${t.title}</small>` : ''}${extras.map((x) => `<small>${x.replace(/^\+\s*/, '+ ')}</small>`).join('')}<div class="qty"><button data-d="-1" aria-label="Decrease">−</button><input value="${l.qty}" inputmode="numeric" aria-label="Quantity"><button data-d="1" aria-label="Increase">+</button></div><button class="rm">Remove</button></div><b class="line-p">${money(linePrice(l) * l.qty)}</b></div>`;
    }).join('') : `<div class="cart-empty"><p>Your cart is empty</p><button class="co-cont">Continue shopping</button></div>`;
    $('.tot').textContent = money(total);
    $('.co-go').disabled = !lines.length;
    const cont = $('.co-cont'); if (cont) cont.onclick = closeDrawer;
    $$('.line').forEach((row) => {
      const i = +row.dataset.i;
      const set = (q) => { const c = cartLines(); if (q < 1) c.splice(i, 1); else c[i].qty = Math.min(10, q); writeCart(c); };
      row.querySelectorAll('[data-d]').forEach((btn) => (btn.onclick = () => set((cartLines()[i]?.qty || 0) + +btn.dataset.d)));
      row.querySelector('input').onchange = (e) => set(parseInt(e.target.value, 10) || 0);
      row.querySelector('.rm').onclick = () => set(0);
    });
  }

  async function boot() {
    try { CAT = await (await fetch('data/catalog.json', { cache: 'no-cache' })).json(); }
    catch { return; }
    PROD = CAT.products[0];
    renderTiers();
    renderReviews();
    renderRating();
    renderFeatured();
    initGallery();
    sticky();
    buildDrawer();
    renderCart();
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
    // Headline shows the single-seat (base) price, like the reference; bundles show their own prices.
    $('#leadPrice').textContent = money(PROD.price_cents);
    $('#leadCompare').textContent = money(PROD.compare_at_cents);
    $('#sbPrice').innerHTML = `${money(PROD.price_cents)} <s>${money(PROD.compare_at_cents)}</s>`;
  }

  function renderRating() {
    const box = $('#rating'); if (!box) return;
    const rv = Array.isArray(CAT.reviews) ? CAT.reviews : [];
    if (!rv.length) { box.remove(); return; }
    const avg = rv.reduce((a, r) => a + (r.rating || 5), 0) / rv.length;
    const full = Math.round(avg);
    box.innerHTML = `<span class="r-stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span> <b>${avg.toFixed(1)}</b> <a href="#reviews" class="r-count">(${rv.length} review${rv.length > 1 ? 's' : ''})</a>`;
  }

  function renderFeatured() {
    const box = $('#featReview'); if (!box) return;
    const rv = Array.isArray(CAT.reviews) ? CAT.reviews : [];
    if (!rv.length) { box.remove(); return; }
    const r = rv[0], n = Math.max(1, Math.min(5, r.rating || 5));
    box.innerHTML = `<div class="fr-stars">${'★'.repeat(n)}</div>`
      + `<p class="fr-text">“${r.text}”</p>`
      + `<div class="fr-by"><span class="fr-check">✓</span> Verified Customer</div>`;
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
      const imgBox = hasImg
        ? `<div class="rv-img"><img src="${r.img}" alt="${(r.name || 'Customer')} photo" loading="lazy"></div>`
        : (real.length ? '' : '<div class="rv-img empty"></div>');
      return `<article class="rv-card${hasImg ? '' : ' noimg'}">
        ${imgBox}
        <div class="rv-body">
          <div class="rv-stars ${hasText ? '' : 'empty'}">${stars}</div>
          ${r.title ? `<h3 class="rv-title">${r.title}</h3>` : ''}
          <p class="rv-text ${hasText ? '' : 'empty'}">${hasText ? r.text : 'Your review here'}</p>
          <div class="rv-name">${r.name ? `${r.name} <span class="rv-verified" title="Verified">✓</span>` : '<span class="rv-verified sm">✓</span> Verified Customer'}</div>
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

  function checkout() {
    // Save the selected bundle and go to the on-site checkout page (Square card form).
    const item = { handle: PROD.handle, qty: 1, tier: selTier.id, units: Array.from({ length: selTier.qty }, () => ({})), addons: warrantyOn() ? ['warranty'] : [] };
    try { localStorage.setItem('wr_cart_v1', JSON.stringify([item])); } catch {}
    window.location.href = 'checkout.html';
  }

  function initGallery() {
    const track = $('#gTrack'); if (!track) return;
    const slides = [...track.children];
    const thumbs = $$('#gThumbs .thumb');
    const dotsBox = $('#gDots');
    dotsBox.innerHTML = slides.map((_, i) => `<button class="g-dot${i === 0 ? ' on' : ''}" data-i="${i}" aria-label="Image ${i + 1}"></button>`).join('');
    const step = () => track.clientWidth || 1;
    const cur = () => Math.round(track.scrollLeft / step());
    const go = (i) => { i = Math.max(0, Math.min(slides.length - 1, i)); track.scrollTo({ left: i * step(), behavior: 'smooth' }); };
    $('#gPrev').onclick = () => go(cur() - 1);
    $('#gNext').onclick = () => go(cur() + 1);
    thumbs.forEach((t) => (t.onclick = () => go(+t.dataset.i)));
    dotsBox.querySelectorAll('.g-dot').forEach((d) => (d.onclick = () => go(+d.dataset.i)));
    track.addEventListener('scroll', () => {
      const c = cur();
      thumbs.forEach((t, i) => t.classList.toggle('active', i === c));
      dotsBox.querySelectorAll('.g-dot').forEach((d, i) => d.classList.toggle('on', i === c));
    }, { passive: true });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#buyBtn') || e.target.closest('#sbBtn')) addLine();
    if (e.target.closest('#cartBtn')) openDrawer();
  });

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
