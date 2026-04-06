const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export const cropImageFileToAspect = async (file: File, options: { aspect: number; width: number; type?: string; quality?: number; fileName?: string }) => {
  const { aspect, width, type = 'image/jpeg', quality = 0.9, fileName = 'image.jpg' } = options;
  const srcUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageElement(srcUrl);
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(targetWidth / aspect));
    const srcWidth = img.naturalWidth || img.width;
    const srcHeight = img.naturalHeight || img.height;
    const srcAspect = srcWidth / srcHeight;

    let cropWidth = srcWidth;
    let cropHeight = srcHeight;
    let cropX = 0;
    let cropY = 0;

    if (srcAspect > aspect) {
      cropWidth = Math.round(srcHeight * aspect);
      cropX = Math.round((srcWidth - cropWidth) / 2);
    } else if (srcAspect < aspect) {
      cropHeight = Math.round(srcWidth / aspect);
      cropY = Math.round((srcHeight - cropHeight) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable');
    }

    ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) => {
          if (!nextBlob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          resolve(nextBlob);
        },
        type,
        quality
      );
    });

    return new File([blob], fileName, { type });
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
};
