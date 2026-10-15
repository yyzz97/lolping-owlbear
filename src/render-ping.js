export function renderPingLabel(image, label) {
  // Owlbear limits image URLs to 2048 characters. Keep the artwork hosted and
  // use a small text-only SVG with exactly the same frame and anchor as the PNG.
  const text = Array.from(label).slice(0, 64).join('').replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
  const fit = Array.from(label).length > 24 ? ' textLength="376" lengthAdjust="spacingAndGlyphs"' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="256"><text x="200" y="204" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff7e8" stroke="#111b20" stroke-width="1" paint-order="stroke"${fit}>${text}</text></svg>`;
  return { ...image, mime: 'image/svg+xml', url: `data:image/svg+xml,${encodeURIComponent(svg)}` };
}
