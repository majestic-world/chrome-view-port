// Viewport sizes are CSS pixels (physical resolution ÷ DPR), portrait/natural orientation.
// overlayScrollbars: the real device draws scrollbars over content, so they must not eat layout width.
// touch: the pointer becomes a finger (circle cursor, drag to scroll).
export const DEVICES = [
  { id: 'iphone-17', type: 'phone', label: 'iPhone 17', name: 'iPhone 17', width: 402, height: 874, dpr: 3, overlayScrollbars: true, touch: true },
  { id: 'iphone-17-pro', type: 'phone', label: '17 Pro', name: 'iPhone 17 Pro', width: 402, height: 874, dpr: 3, overlayScrollbars: true, touch: true },
  { id: 'iphone-17-pro-max', type: 'phone', label: '17 Pro Max', name: 'iPhone 17 Pro Max', width: 440, height: 956, dpr: 3, overlayScrollbars: true, touch: true },
  { id: 'ipad-air-11', type: 'tablet', label: 'iPad Air', name: 'iPad Air 11″', width: 820, height: 1180, dpr: 2, overlayScrollbars: true, touch: true },
  { id: 'galaxy-tab-s9', type: 'tablet', label: 'Galaxy Tab S9', name: 'Samsung Galaxy Tab S9', width: 800, height: 1280, dpr: 2, overlayScrollbars: true, touch: true },
  { id: 'nitro-v16', type: 'laptop', label: 'Nitro V16', name: 'Acer Nitro V16 (1920×1200 @125%)', width: 1536, height: 960, dpr: 1.25, overlayScrollbars: false, touch: false },
  { id: 'macbook-air-2022', type: 'laptop', label: 'MacBook Air', name: 'MacBook Air 2022 (M2)', width: 1470, height: 956, dpr: 2, overlayScrollbars: true, touch: false },
];

export const RESPONSIVE_ID = 'responsive';

// Device frame in CSS px: bezel thickness, outer and screen corner radius (outer = inner + pad).
export const BEZELS = {
  phone: { pad: 12, outer: 58, inner: 46 },
  tablet: { pad: 18, outer: 38, inner: 20 },
  laptop: { pad: 12, outer: 18, inner: 6 },
};
