export function uiAssetsFor(base) {
  const image = (file, width, height = width) => ({
    width, height, mime: 'image/png', url: new URL(`./ui/${file}.png?v=3`, base).href,
  });
  const ids = ['retreat', 'bait', 'omw', 'allin', 'assist', 'hold', 'missing', 'push', 'caution'];
  return {
    wheels: Object.fromEntries(ids.map(id => [id, image(`wheel-${id}`, 728)])),
    wheelBase: image('wheel-base', 728),
    wheelSelectionNone: image('wheel-selection-none', 728),
    wheelSelections: Object.fromEntries(ids.map(id => [id, image(`wheel-selection-${id}`, 728)])),
    wheelCenters: Object.fromEntries(ids.map(id => [id, image(`wheel-center-${id}`, 728)])),
    pings: Object.fromEntries(ids.map(id => [id, image(`ping-${id}`, 400, 256)])),
  };
}

export function preloadImages(uiAssets) {
  return Promise.allSettled([
    uiAssets.wheelBase, uiAssets.wheelSelectionNone,
    ...Object.values(uiAssets.wheels), ...Object.values(uiAssets.wheelSelections),
    ...Object.values(uiAssets.wheelCenters), ...Object.values(uiAssets.pings),
  ].map(async content => {
    const image = new Image();
    image.src = content.url;
    await image.decode();
  }));
}
