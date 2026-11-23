/* Meta Pixel for RuffMission — base code + helper. Change PIXEL_ID to use a different pixel. */
(() => {
  const PIXEL_ID = '337201782247002';
  if (window.fbq) return;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

  window.ttPixel = {
    track(name, data, eventId) {
      try { eventId ? fbq('track', name, data || {}, { eventID: eventId }) : fbq('track', name, data || {}); } catch {}
    },
  };

  /* Purchase: checkout.js stores the order just before redirecting here. Fires once, then clears it. */
  if (/thank-you/.test(location.pathname)) {
    try {
      const raw = sessionStorage.getItem('tt_purchase');
      if (raw) {
        sessionStorage.removeItem('tt_purchase');
        const d = JSON.parse(raw);
        window.ttPixel.track('Purchase', { value: d.value, currency: 'USD', content_ids: d.ids, content_type: 'product', num_items: d.num }, d.order ? 'order-' + d.order : undefined);
      }
    } catch {}
  }
})();
