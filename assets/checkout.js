/* RuffMission on-site checkout — Square Web Payments SDK card form + our own address form. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PH = 'images/placeholder.svg';
  const CART_KEY = 'wr_cart_v1';
  const FORM_KEY = 'wr_checkout_contact';
  let CAT, CFG, payments, card, totalCents = 0, busy = false, shipId = 'standard';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
  const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } };
  const product = (h) => CAT.products.find((p) => p.handle === h);
  const optVal = (p, n, v) => (p.options || []).find((o) => o.name === n)?.values.find((x) => x.name === v);
  const lines = () => readCart().filter((l) => product(l.handle) && Array.isArray(l.units));
  function linePrice(l) {
    const p = product(l.handle), b = p.bundles, t = b?.tiers.find((x) => x.id === l.tier);
    let c = t ? t.price_cents : p.price_cents;
    for (const a of l.addons || []) c += b?.addons?.find((x) => x.id === a)?.price_cents || 0;
    return c;
  }

  const US_STATES = 'AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY,PR'.split(',');
  function renderState() {
    const c = $('#country').value, w = $('#state-wrap'), prev = $('#state')?.value || '';
    if (c === 'US') {
      w.innerHTML = `<select id="state" name="state" autocomplete="address-level1" required><option value="">State</option>${US_STATES.map((s) => `<option ${s === prev ? 'selected' : ''}>${s}</option>`).join('')}</select><label for="state">State</label>`;
    } else {
      w.innerHTML = `<input id="state" name="state" autocomplete="address-level1" placeholder=" " value="${esc(prev)}" ${c === 'CA' || c === 'AU' ? 'required' : ''}><label for="state">${c === 'GB' ? 'County (optional)' : 'State / Province'}</label>`;
    }
    $('label[for="zip"]').textContent = c === 'US' ? 'ZIP code' : 'Postal code';
  }

  function renderSummary() {
    const ls = lines();
    if (!ls.length) { $('.co-wrap').hidden = true; $('.co-sum-toggle').hidden = true; $('.co-empty').hidden = false; return false; }
    let sub = 0;
    $('.co-lines').innerHTML = ls.map((l) => {
      const p = product(l.handle), b = p.bundles, t = b?.tiers.find((x) => x.id === l.tier);
      const thumb = optVal(p, 'Variant', l.units[0]?.Variant)?.thumb || p.images?.[0] || PH;
      const extras = [...(l.addons || []).map((a) => b?.addons?.find((x) => x.id === a)?.title), ...(l.gifts || []).map((g) => b?.gifts?.[g]?.title)].filter(Boolean);
      const price = linePrice(l) * l.qty; sub += price;
      return `<div class="co-line"><div class="co-thumb"><img src="${esc(thumb)}" alt="" onerror="this.src='${PH}'"><span>${l.qty}</span></div>
        <div class="co-li"><b>${esc(p.title)}</b>${t ? `<small>${esc(t.title)}</small>` : ''}
        ${l.units.map((u, j) => { const v = Object.values(u).filter(Boolean).join(' / '); return v ? `<small>${l.units.length > 1 ? `#${j + 1} ` : ''}${esc(v)}</small>` : ''; }).join('')}
        ${extras.map((x) => `<small>${esc(x.replace(/^\+\s*/, '+ '))}</small>`).join('')}</div><b>${money(price)}</b></div>`;
    }).join('');
    const opts = CAT.store.shipping_options?.length ? CAT.store.shipping_options : [{ id: 'standard', label: 'Free Shipping', eta: '4–9 business days', price_cents: 0 }];
    if (!opts.some((o) => o.id === shipId)) shipId = opts[0].id;
    const opt = opts.find((o) => o.id === shipId);
    const fee = opt.price_cents || 0;
    totalCents = sub + fee;
    $('.co-ships').innerHTML = opts.map((o) => `<label class="co-ship ${o.id === shipId ? 'on' : ''}"><input type="radio" name="ship" value="${esc(o.id)}" ${o.id === shipId ? 'checked' : ''}><span class="rdo"></span>
      <span class="co-ship-name"><b>${esc(o.label)}</b><small>${esc(o.eta)}</small></span><b class="co-ship-price">${o.price_cents ? money(o.price_cents) : 'FREE'}</b></label>`).join('');
    $$('.co-ships input').forEach((r) => (r.onchange = () => { shipId = r.value; renderSummary(); }));
    $('.co-sub-v').textContent = money(sub);
    $('.co-ship-v').textContent = fee ? money(fee) : 'FREE';
    $('.co-ship-lbl').textContent = fee ? `Shipping · ${opt.label}` : 'Shipping';
    $('.co-total').textContent = money(totalCents);
    $('.co-total-sm').textContent = money(totalCents);
    $('#pay-btn').textContent = `Pay now · ${money(totalCents)}`;
    return true;
  }

  const showError = (msg) => { const e = $('.co-error'); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  function customer() {
    const v = (id) => $('#' + id)?.value.trim() || '';
    return { email: v('email'), phone: v('phone'), firstName: v('firstName'), lastName: v('lastName'),
      address: { line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), zip: v('zip'), country: v('country') } };
  }
  function validate() {
    const f = $('#co-form');
    for (const el of $$('input[required],select[required]', f)) {
      if (el.type === 'email') el.value = el.value.replace(/\s+/g, '');
      if (!el.value.trim() || (el.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim()))) {
        el.closest('.f')?.classList.add('bad'); el.focus();
        showError(el.type === 'email' ? 'Enter a valid email address.' : 'Please fill in all required delivery details.');
        return false;
      }
    }
    return true;
  }
  const saveForm = () => { try { const c = customer(); localStorage.setItem(FORM_KEY, JSON.stringify(c)); } catch {} };
  function restoreForm() {
    try {
      const c = JSON.parse(localStorage.getItem(FORM_KEY)); if (!c) return;
      for (const k of ['email', 'phone', 'firstName', 'lastName']) if (c[k]) $('#' + k).value = c[k];
      if (c.address) { $('#country').value = c.address.country || 'US'; renderState(); for (const k of ['line1', 'line2', 'city', 'state', 'zip']) if (c.address[k] && $('#' + k)) $('#' + k).value = c.address[k]; }
    } catch {}
  }

  async function charge(sourceId) {
    const res = await fetch('/.netlify/functions/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: lines(), customer: customer(), sourceId, shippingId: shipId, expectedTotal: totalCents }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || 'Payment failed. Please try again.');
    try { const ls = lines(); sessionStorage.setItem('wr_purchase', JSON.stringify({ value: totalCents / 100, ids: ls.map((l) => l.handle), num: ls.reduce((n, l) => n + l.qty, 0), order: j.orderNumber })); } catch {}
    try { localStorage.removeItem(CART_KEY); } catch {}
    location.href = `thank-you.html?order=${encodeURIComponent(j.orderNumber)}${j.receiptUrl ? `&receipt=${encodeURIComponent(j.receiptUrl)}` : ''}`;
  }

  async function run(tokenizer) {
    if (busy) return;
    showError('');
    if (!validate()) return;
    saveForm();
    busy = true; $('.co-overlay').hidden = false; $('#pay-btn').disabled = true;
    try {
      const c = customer();
      const result = await tokenizer({
        amount: (totalCents / 100).toFixed(2), currencyCode: 'USD', intent: 'CHARGE', customerInitiated: true, sellerKeyedIn: false,
        billingContact: { givenName: c.firstName, familyName: c.lastName, email: c.email, phone: c.phone || undefined,
          addressLines: [c.address.line1, c.address.line2].filter(Boolean), city: c.address.city, state: c.address.state, postalCode: c.address.zip, countryCode: c.address.country },
      });
      if (result?.status !== 'OK' || !result.token) {
        const msg = result?.errors?.[0]?.message;
        throw new Error(msg ? `Please check your card details: ${msg}` : 'Please check your card details.');
      }
      await charge(result.token);
    } catch (e) {
      busy = false; $('.co-overlay').hidden = true; $('#pay-btn').disabled = false;
      showError(e.message || 'Payment failed. Please try again.');
    }
  }

  function loadScript(src) {
    return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.append(s); });
  }

  async function initSquare() {
    try {
      const r = await fetch('/.netlify/functions/pay', { cache: 'no-store' });
      CFG = await r.json();
      if (!r.ok || !CFG.applicationId) throw new Error(CFG.error || 'config');
      await loadScript(CFG.env === 'production' ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js');
      payments = window.Square.payments(CFG.applicationId, CFG.locationId);
      card = await payments.card({ style: { '.input-container': { borderColor: '#d9d9d9', borderRadius: '8px' }, '.input-container.is-focus': { borderColor: '#F15A22' }, 'input': { fontSize: '16px' } } });
      $('#card-container').innerHTML = '';
      await card.attach('#card-container');
      $('#pay-btn').disabled = false;
    } catch (e) {
      console.error(e);
      $('#card-container').innerHTML = '<div class="co-card-ph"><span>Card number</span><span>MM / YY</span><span>CVV</span><span>ZIP</span></div><p class="co-loading">The secure card form loads here once Square is connected. If you are a customer seeing this, please refresh or contact us.</p>';
      return;
    }
    // Express wallets (only shown if available on this device/domain)
    const req = () => payments.paymentRequest({ countryCode: 'US', currencyCode: 'USD', total: { amount: (totalCents / 100).toFixed(2), label: 'WarmRally' } });
    let anyWallet = false;
    try {
      const gp = await payments.googlePay(req());
      await gp.attach('#google-pay', { buttonColor: 'black', buttonSizeMode: 'fill', buttonType: 'plain' });
      $('#google-pay').hidden = false; anyWallet = true;
      $('#google-pay').addEventListener('click', (e) => { e.preventDefault(); run(() => gp.tokenize()); });
    } catch {}
    try {
      const ap = await payments.applePay(req());
      const el = $('#apple-pay'); el.innerHTML = '<button type="button" class="apple-btn" aria-label="Pay with Apple Pay"></button>'; el.hidden = false; anyWallet = true;
      el.firstChild.addEventListener('click', () => run(() => ap.tokenize()));
    } catch {}
    if (anyWallet) $('.co-express').hidden = false;
  }

  function applyTheme() {
    const t = CAT.store.theme; if (!t) return;
    const r = document.documentElement.style;
    if (t.primary) r.setProperty('--olive', t.primary);
    if (t.primary_dark) r.setProperty('--olive-dark', t.primary_dark);
    if (t.accent) r.setProperty('--accent', t.accent);
    if (t.font) r.setProperty('--font', t.font);
  }
  async function boot() {
    try { CAT = await (await fetch('data/catalog.json', { cache: 'no-cache' })).json(); }
    catch { showError('Store data failed to load. Please refresh.'); return; }
    applyTheme();
    renderState();
    restoreForm();
    if (!renderSummary()) return;
    { const ls = lines(); window.ttPixel?.track('InitiateCheckout', { content_ids: ls.map((l) => l.handle), content_type: 'product', value: totalCents / 100, currency: 'USD', num_items: ls.reduce((n, l) => n + l.qty, 0) }); }
    $('#country').addEventListener('change', renderState);
    $('#co-form').addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('bad'));
    $('#co-form').addEventListener('submit', (e) => { e.preventDefault(); if (card) run((d) => card.tokenize(d)); });
    const t = $('.co-sum-toggle');
    t.addEventListener('click', () => { const open = document.body.classList.toggle('sum-open'); t.setAttribute('aria-expanded', open); t.querySelector('span').firstChild.textContent = open ? 'Hide order summary ' : 'Show order summary '; });
    initSquare();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
