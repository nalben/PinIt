import React, { useEffect, useRef, useState } from 'react';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import classes from './ImageCropModal.module.scss';

export type ImageCropShape = 'rect' | 'round' | 'diamond';

export type ImageCropConfig = {
  aspect: number;
  outputWidth: number;
  fileName: string;
  title?: string;
  shape?: ImageCropShape;
  type?: string;
  quality?: number;
};

type ImageCropModalProps = {
  isOpen: boolean;
  sourceFile: File | null;
  config: ImageCropConfig;
  onClose: () => void;
  onApply: (file: File) => void | Promise<void>;
};

type Size = {
  width: number;
  height: number;
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

type InteractionState =
  | {
      type: 'move';
      startX: number;
      startY: number;
      startRect: CropRect;
    }
  | {
      type: 'resize';
      handle: ResizeHandle;
      startX: number;
      startY: number;
      startRect: CropRect;
    };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hasSameSize = (a: Size | null, b: Size | null) =>
  Boolean(a && b && a.width === b.width && a.height === b.height);

const hasSameCropRect = (a: CropRect | null, b: CropRect | null) =>
  Boolean(
    a &&
      b &&
      Math.abs(a.x - b.x) < 0.5 &&
      Math.abs(a.y - b.y) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5 &&
      Math.abs(a.height - b.height) < 0.5
  );

const getMaxCropWidth = (imageSize: Size, aspect: number) =>
  Math.min(imageSize.width, imageSize.height * aspect);

const getMinCropWidth = (imageSize: Size, aspect: number) => {
  const shorterSide = Math.min(imageSize.width, imageSize.height);
  const minShortSide = clamp(shorterSide * 0.2, 88, 160);
  const minWidth = aspect >= 1 ? minShortSide * aspect : minShortSide;
  return Math.min(minWidth, getMaxCropWidth(imageSize, aspect));
};

const clampCropRect = (rect: CropRect, imageSize: Size, aspect: number): CropRect => {
  const maxWidth = getMaxCropWidth(imageSize, aspect);
  const minWidth = Math.min(getMinCropWidth(imageSize, aspect), maxWidth);

  let width = clamp(rect.width, minWidth, maxWidth);
  let height = width / aspect;

  if (height > imageSize.height) {
    height = imageSize.height;
    width = height * aspect;
  }

  const x = clamp(rect.x, 0, imageSize.width - width);
  const y = clamp(rect.y, 0, imageSize.height - height);

  return { x, y, width, height };
};

const createInitialCropRect = (imageSize: Size, aspect: number): CropRect => {
  const maxWidth = getMaxCropWidth(imageSize, aspect);
  const minWidth = Math.min(getMinCropWidth(imageSize, aspect), maxWidth);
  const targetWidth = clamp(maxWidth * 0.72, minWidth, maxWidth);
  const targetHeight = targetWidth / aspect;

  return {
    x: (imageSize.width - targetWidth) / 2,
    y: (imageSize.height - targetHeight) / 2,
    width: targetWidth,
    height: targetHeight,
  };
};

const scaleCropRect = (rect: CropRect, prevSize: Size, nextSize: Size, aspect: number) =>
  clampCropRect(
    {
      x: (rect.x / prevSize.width) * nextSize.width,
      y: (rect.y / prevSize.height) * nextSize.height,
      width: (rect.width / prevSize.width) * nextSize.width,
      height: (rect.height / prevSize.height) * nextSize.height,
    },
    nextSize,
    aspect
  );

const moveCropRect = (startRect: CropRect, deltaX: number, deltaY: number, imageSize: Size): CropRect => ({
  ...startRect,
  x: clamp(startRect.x + deltaX, 0, imageSize.width - startRect.width),
  y: clamp(startRect.y + deltaY, 0, imageSize.height - startRect.height),
});

const getResizeAnchor = (handle: ResizeHandle, startRect: CropRect) => {
  switch (handle) {
    case 'nw':
      return { x: startRect.x + startRect.width, y: startRect.y + startRect.height };
    case 'ne':
      return { x: startRect.x, y: startRect.y + startRect.height };
    case 'sw':
      return { x: startRect.x + startRect.width, y: startRect.y };
    case 'se':
    default:
      return { x: startRect.x, y: startRect.y };
  }
};

const isLeftHandle = (handle: ResizeHandle) => handle === 'nw' || handle === 'sw';

const isTopHandle = (handle: ResizeHandle) => handle === 'nw' || handle === 'ne';

const getResizeMaxWidth = (handle: ResizeHandle, anchorX: number, anchorY: number, imageSize: Size, aspect: number) => {
  const maxWidthByX = isLeftHandle(handle) ? anchorX : imageSize.width - anchorX;
  const maxHeightByY = isTopHandle(handle) ? anchorY : imageSize.height - anchorY;
  return Math.min(maxWidthByX, maxHeightByY * aspect);
};

const projectResizeWidth = (localWidth: number, localHeight: number, aspect: number) => {
  const baseX = aspect;
  const baseY = 1;
  const scalar = ((localWidth * baseX) + (localHeight * baseY)) / ((baseX * baseX) + (baseY * baseY));
  return scalar * baseX;
};

const resizeCropRect = (
  handle: ResizeHandle,
  startRect: CropRect,
  deltaX: number,
  deltaY: number,
  imageSize: Size,
  aspect: number
): CropRect => {
  const anchor = getResizeAnchor(handle, startRect);
  const pointerX = isLeftHandle(handle) ? startRect.x + deltaX : startRect.x + startRect.width + deltaX;
  const pointerY = isTopHandle(handle) ? startRect.y + deltaY : startRect.y + startRect.height + deltaY;
  const localWidth = isLeftHandle(handle) ? anchor.x - pointerX : pointerX - anchor.x;
  const localHeight = isTopHandle(handle) ? anchor.y - pointerY : pointerY - anchor.y;
  const maxWidth = getResizeMaxWidth(handle, anchor.x, anchor.y, imageSize, aspect);
  const minWidth = Math.min(getMinCropWidth(imageSize, aspect), maxWidth);
  const width = clamp(projectResizeWidth(localWidth, localHeight, aspect), minWidth, maxWidth);
  const height = width / aspect;

  switch (handle) {
    case 'nw':
      return {
        x: anchor.x - width,
        y: anchor.y - height,
        width,
        height,
      };
    case 'ne':
      return {
        x: anchor.x,
        y: anchor.y - height,
        width,
        height,
      };
    case 'sw':
      return {
        x: anchor.x - width,
        y: anchor.y,
        width,
        height,
      };
    case 'se':
    default:
      return {
        x: anchor.x,
        y: anchor.y,
        width,
        height,
      };
  }
};

const resizeCropRectFromCenter = (rect: CropRect, imageSize: Size, aspect: number, direction: 'in' | 'out') => {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const delta = direction === 'out' ? 1.06 : 0.94;
  const maxWidth = Math.min(
    Math.min(centerX, imageSize.width - centerX) * 2,
    Math.min(centerY, imageSize.height - centerY) * 2 * aspect
  );
  const minWidth = Math.min(getMinCropWidth(imageSize, aspect), maxWidth);
  const width = clamp(rect.width * delta, minWidth, maxWidth);
  const height = width / aspect;

  return clampCropRect(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    },
    imageSize,
    aspect
  );
};

const ImageCropModal: React.FC<ImageCropModalProps> = ({ isOpen, sourceFile, config, onClose, onApply }) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previousImageSizeRef = useRef<Size | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [imageDisplaySize, setImageDisplaySize] = useState<Size | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!sourceFile) {
      setImageUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(sourceFile);
    setImageUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [sourceFile]);

  useEffect(() => {
    if (!isOpen) return;
    previousImageSizeRef.current = null;
    setNaturalSize(null);
    setImageDisplaySize(null);
    setCropRect(null);
    setInteraction(null);
  }, [config.aspect, imageUrl, isOpen]);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    const node = imageRef.current;
    if (!node) return;

    let frameId = 0;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      if (nextSize.width <= 0 || nextSize.height <= 0) return;
      setImageDisplaySize((prev) => (hasSameSize(prev, nextSize) ? prev : nextSize));
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(update);
    };

    scheduleUpdate();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(node);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [imageUrl, isOpen]);

  useEffect(() => {
    if (!imageDisplaySize) return;

    setCropRect((prev) => {
      const previousSize = previousImageSizeRef.current;
      const nextRect =
        prev && previousSize
          ? scaleCropRect(prev, previousSize, imageDisplaySize, config.aspect)
          : createInitialCropRect(imageDisplaySize, config.aspect);

      previousImageSizeRef.current = imageDisplaySize;
      return hasSameCropRect(prev, nextRect) ? prev : nextRect;
    });
  }, [config.aspect, imageDisplaySize]);

  useEffect(() => {
    if (!interaction || !imageDisplaySize) return;

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = interaction.type === 'move' ? 'grabbing' : 'nwse-resize';

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      setCropRect(() => {
        if (interaction.type === 'move') {
          return moveCropRect(interaction.startRect, deltaX, deltaY, imageDisplaySize);
        }

        return resizeCropRect(interaction.handle, interaction.startRect, deltaX, deltaY, imageDisplaySize, config.aspect);
      });
    };

    const handlePointerEnd = () => {
      setInteraction(null);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [config.aspect, imageDisplaySize, interaction]);

  const handleMoveStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropRect) return;
    event.preventDefault();
    event.stopPropagation();
    setInteraction({
      type: 'move',
      startX: event.clientX,
      startY: event.clientY,
      startRect: cropRect,
    });
  };

  const handleResizeStart =
    (handle: ResizeHandle) =>
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!cropRect) return;
      event.preventDefault();
      event.stopPropagation();
      setInteraction({
        type: 'resize',
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startRect: cropRect,
      });
    };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!cropRect || !imageDisplaySize) return;
    event.preventDefault();
    setCropRect((current) => {
      if (!current) return current;
      return resizeCropRectFromCenter(current, imageDisplaySize, config.aspect, event.deltaY < 0 ? 'out' : 'in');
    });
  };

  const handleApply = async () => {
    if (!sourceFile || !imageRef.current || !naturalSize || !imageDisplaySize || !cropRect) return;

    setIsSaving(true);
    try {
      const type = config.type ?? 'image/jpeg';
      const quality = config.quality ?? 0.92;
      const outputWidth = config.outputWidth;
      const outputHeight = Math.round(outputWidth / config.aspect);
      const srcX = (cropRect.x / imageDisplaySize.width) * naturalSize.width;
      const srcY = (cropRect.y / imageDisplaySize.height) * naturalSize.height;
      const srcWidth = (cropRect.width / imageDisplaySize.width) * naturalSize.width;
      const srcHeight = (cropRect.height / imageDisplaySize.height) * naturalSize.height;

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context is unavailable');

      ctx.drawImage(
        imageRef.current,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        0,
        0,
        outputWidth,
        outputHeight
      );

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

      await onApply(new File([blob], config.fileName, { type }));
    } finally {
      setIsSaving(false);
    }
  };

  const isRound = config.shape === 'round';
  const isDiamond = config.shape === 'diamond';
  const isReady = Boolean(imageUrl && cropRect && naturalSize && imageDisplaySize);

  return (
    <AuthModal
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={false}
      showCloseButton={false}
      modalScope="image-crop"
      overlayClassName={classes.overlay}
      modalClassName={classes.modal}
    >
      <div className={classes.root} data-image-crop-modal-root="true">
        <div className={classes.stageWrap}>
          <div className={classes.stage}>
            <div className={classes.imageFrame} onWheel={handleWheel}>
              {imageUrl ? (
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="crop source"
                  className={classes.image}
                  draggable={false}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setNaturalSize({
                      width: img.naturalWidth || img.width,
                      height: img.naturalHeight || img.height,
                    });
                  }}
                />
              ) : null}

              {cropRect ? (
                <div
                  className={[
                    classes.cropBox,
                    isRound ? classes.cropBox_round : '',
                    isDiamond ? classes.cropBox_diamond : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    left: `${cropRect.x}px`,
                    top: `${cropRect.y}px`,
                    width: `${cropRect.width}px`,
                    height: `${cropRect.height}px`,
                  }}
                  onPointerDown={handleMoveStart}
                >
                  <div className={classes.cropGuides} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <button type="button" className={`${classes.handle} ${classes.handle_nw}`.trim()} onPointerDown={handleResizeStart('nw')} aria-label="resize north west" />
                  <button type="button" className={`${classes.handle} ${classes.handle_ne}`.trim()} onPointerDown={handleResizeStart('ne')} aria-label="resize north east" />
                  <button type="button" className={`${classes.handle} ${classes.handle_sw}`.trim()} onPointerDown={handleResizeStart('sw')} aria-label="resize south west" />
                  <button type="button" className={`${classes.handle} ${classes.handle_se}`.trim()} onPointerDown={handleResizeStart('se')} aria-label="resize south east" />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className={classes.actions}>
          <Mainbtn
            variant="mini"
            kind="button"
            type="button"
            text={'\u041e\u0442\u043c\u0435\u043d\u0430'}
            onClick={onClose}
            disabled={isSaving}
          />
          <Mainbtn
            variant="mini"
            kind="button"
            type="button"
            text={isSaving ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...' : '\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c'}
            onClick={() => {
              void handleApply();
            }}
            disabled={!isReady || isSaving}
          />
        </div>
      </div>
    </AuthModal>
  );
};

export default ImageCropModal;
