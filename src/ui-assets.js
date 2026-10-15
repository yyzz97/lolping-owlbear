export function uiAssetsFor(base) {
  const image = (file, width, height = width) => ({
    width, height, mime: 'image/png', url: new URL(`./ui/${file}.png?v=3`, base).href,
  });
  const ids = ['retreat', 'bait', 'omw', 'allin', 'assist', 'hold', 'missing', 'push', 'caution'];
  return {
    wheels: Object.fromEntries(ids.map(id => [id, image(`wheel-${id}`, 688)])),
    pings: Object.fromEntries(ids.map(id => [id, image(`ping-${id}`, 400, 256)])),
  };
}

export function preloadImages(uiAssets) {
  return Promise.allSettled([...Object.values(uiAssets.wheels), ...Object.values(uiAssets.pings)].map(async content => {
    const image = new Image();
    image.src = content.url;
    await image.decode();
  }));
}
