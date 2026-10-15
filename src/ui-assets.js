export function uiAssetsFor(base) {
  const image = (file, width, height = width) => ({
    width, height, mime: 'image/png', url: new URL(`./ui/${file}.png`, base).href,
  });
  const rings = Object.fromEntries([
    ['#f12c55', 'red'], ['#d8c79a', 'gold'], ['#22b9e9', 'blue'],
    ['#16ce86', 'green'], ['#f6ba00', 'yellow'],
  ].map(([color, file]) => [color, image(`ring-${file}`, 256, 176)]));
  return {
    sectors: Array.from({ length: 8 }, (_, index) => ({
      idle: image(`sector-${index}-idle`, 688),
      selected: image(`sector-${index}-selected`, 688),
    })),
    rings,
    esc: image('esc-key', 128, 64),
  };
}
