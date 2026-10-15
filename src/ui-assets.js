export function uiAssetsFor(base) {
  const image = (file, width, height = width) => ({
    width, height, mime: 'image/png', url: new URL(`./ui/${file}.png?v=5`, base).href,
  });
  const ids = ['retreat', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'enemyvision', 'caution'];
  return {
    wheels: Object.fromEntries(ids.map(id => [id, image(`wheel-${id}`, 1000)])),
    wheelBase: image('wheel-base', 1000),
    wheelSelectionNone: image('wheel-selection-none', 1000),
    wheelSelections: Object.fromEntries(ids.map(id => [id, image(`wheel-selection-${id}`, 1000)])),
    wheelCenters: Object.fromEntries(ids.map(id => [id, image(`wheel-center-${id}`, 1000)])),
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
