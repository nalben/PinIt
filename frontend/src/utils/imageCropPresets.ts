export type CropPreset = {
  aspect: number;
  outputWidth: number;
  fileName: string;
  title: string;
  shape?: 'rect' | 'round' | 'diamond';
};

export const PROFILE_AVATAR_CROP_PRESET: CropPreset = {
  aspect: 1,
  outputWidth: 1024,
  fileName: 'avatar.jpg',
  title: '\u041e\u0431\u0440\u0435\u0437\u0430\u0442\u044c \u0430\u0432\u0430\u0442\u0430\u0440',
  shape: 'round',
};

export const BOARD_IMAGE_CROP_PRESET: CropPreset = {
  aspect: 3.8,
  outputWidth: 1520,
  fileName: 'board-cover.jpg',
  title: '\u041e\u0431\u0440\u0435\u0437\u0430\u0442\u044c \u043e\u0431\u043b\u043e\u0436\u043a\u0443 \u0434\u043e\u0441\u043a\u0438',
};

export const getCardImageCropPreset = (shape: 'rectangle' | 'rhombus' | 'circle'): CropPreset => {
  if (shape === 'rectangle') {
    return {
      aspect: 3,
      outputWidth: 1440,
      fileName: 'card-rectangle.jpg',
      title: '\u041e\u0431\u0440\u0435\u0437\u0430\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438',
    };
  }

  return {
    aspect: 1,
    outputWidth: 1200,
    fileName: `card-${shape}.jpg`,
    title: '\u041e\u0431\u0440\u0435\u0437\u0430\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438',
    shape: shape === 'circle' ? 'round' : 'rect',
  };
};

export const getDetailsImageCropPreset = (): CropPreset => {
  const viewportWidth = typeof window === 'undefined' ? 390 : window.innerWidth;
  const menuWidth = Math.min(450, viewportWidth * 0.8);
  const contentWidth = Math.max(260, menuWidth - 48);
  const aspect = Math.max(2.2, Math.min(3.6, contentWidth / 120));

  return {
    aspect,
    outputWidth: 1440,
    fileName: 'details-image.jpg',
    title: '\u041e\u0431\u0440\u0435\u0437\u0430\u0442\u044c \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0431\u043b\u043e\u043a\u0430',
  };
};
