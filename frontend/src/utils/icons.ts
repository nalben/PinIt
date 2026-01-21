import React from 'react';

const reqIcons = (require as any).context('../assets/icons/monochrome/', false, /\.svg$/);
export type SvgIcon = React.FC<React.SVGProps<SVGSVGElement>>;

export const icons: Record<string, SvgIcon> = {};
reqIcons.keys().forEach((key: string) => {
  const name = key.replace('./', '').replace('.svg', '');
  icons[name] = reqIcons(key).default as SvgIcon;
});

export function getIcon(name: string): SvgIcon | null {
  return icons[name] ?? null;
}

const reqImages = (require as any).context('../assets/img', false, /\.(png|jpe?g|gif|webp)$/);

export const images: Record<string, string> = {};
const imageHashes: Record<string, string> = {};

reqImages.keys().forEach((key: string) => {
  const name = key.replace('./', '').replace(/\.(png|jpe?g|gif|webp)$/, '');
  images[name] = key;

  if (key.endsWith('.webp')) {
    imageHashes[name] = key;
  }
});

export function getImage(name: string): string | null {
  if (!images[name]) return null;

  const webpKey = imageHashes[name];
  if (webpKey) {
    return reqImages(webpKey);
  }

  return reqImages(images[name]);
}

export const iconNames = Object.keys(icons);
export const imageNames = Object.keys(images);
