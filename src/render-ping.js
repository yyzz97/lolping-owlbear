const loadedImages = new Map();

export async function renderPingImage(image, label) {
  let loaded = loadedImages.get(image.url);
  if (!loaded) {
    loaded = new Promise((resolve, reject) => {
      const source = new Image();
      source.onload = () => resolve(source);
      source.onerror = () => { loadedImages.delete(image.url); reject(new Error('Ping artwork failed to load')); };
      source.src = image.url;
    });
    loadedImages.set(image.url, loaded);
  }
  const source = await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context.drawImage(source, 0, 0);
  context.font = '700 26px "Noto Sans", "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff7e8';
  context.shadowColor = '#111b20';
  context.shadowBlur = 3;
  context.fillText(label, image.width / 2, 204, image.width - 24);
  return { ...image, url: canvas.toDataURL('image/png') };
}
