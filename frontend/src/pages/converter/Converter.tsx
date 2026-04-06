import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import axiosInstance, { API_URL } from '@/api/axiosInstance';
import { connectSocket } from '@/services/socketManager';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

import classes from './Converter.module.scss';

type ConverterItemKind = 'image' | 'video' | 'file';

interface ConverterItem {
  id: string;
  original_name: string;
  download_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  kind: ConverterItemKind;
  was_converted: boolean;
}

interface UploadError {
  file_name: string;
  message: string;
}

interface UploadResponse {
  items: ConverterItem[];
  errors?: UploadError[];
}

interface ConverterSocketPayload {
  action?: 'files_added' | 'file_deleted';
  items?: ConverterItem[];
  file_id?: string;
  client_id?: string | null;
}

interface ConverterToast {
  id: number;
  message: string;
}

const formatWordByCount = (count: number, forms: [string, string, string]) => {
  const absCount = Math.abs(count) % 100;
  const lastDigit = absCount % 10;

  if (absCount > 10 && absCount < 20) return forms[2];
  if (lastDigit > 1 && lastDigit < 5) return forms[1];
  if (lastDigit === 1) return forms[0];
  return forms[2];
};

const formatFilesCountLabel = (count: number) =>
  `${count} ${formatWordByCount(count, ['файл', 'файла', 'файлов'])}`;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const formatDate = (value: string) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Недавно';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value)).replace(/,\s+/u, ' ');
};

const getKindLabel = (kind: ConverterItemKind) => {
  if (kind === 'image') return 'Фото';
  if (kind === 'video') return 'Видео';
  return 'Файл';
};

const createConverterClientId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const isPreviewableKind = (kind: ConverterItemKind) => kind === 'image' || kind === 'video';
const getPreviewUrl = (fileId: string) => `${API_URL}/api/converter/files/${encodeURIComponent(fileId)}/preview`;
const getDownloadedStorageKey = (userId: number) => `pinit_converter_downloaded:${userId}`;

const readDownloadedIds = (storageKey: string | null) => {
  if (!storageKey) return new Set<string>();

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];

    if (!Array.isArray(parsed)) return new Set<string>();

    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0));
  } catch {
    return new Set<string>();
  }
};

const ConverterPreview = ({ item }: { item: ConverterItem }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const previewUrl = getPreviewUrl(item.id);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldLoad) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: '180px 0px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className={classes.filePreview}>
      {shouldLoad && !hasPreviewError ? (
        <img
          src={previewUrl}
          alt={item.kind === 'video' ? `Миниатюра видео ${item.original_name}` : item.original_name}
          className={classes.filePreviewMedia}
          loading="lazy"
          onError={() => setHasPreviewError(true)}
        />
      ) : (
        <div className={classes.filePreviewPlaceholder}>
          <span className={classes.filePreviewIcon}>{item.kind === 'video' ? 'VID' : 'IMG'}</span>
          <strong>{item.kind === 'video' ? 'Миниатюра видео' : 'Миниатюра изображения'}</strong>
          <span>
            {hasPreviewError
              ? 'Не удалось загрузить'
              : shouldLoad
                ? 'Загружаем...'
                : 'Подготавливаем...'}
          </span>
        </div>
      )}
    </div>
  );
};

const Converter = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const clientIdRef = useRef<string>(createConverterClientId());
  const isAuth = useAuthStore((state) => state.isAuth);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const userId = useAuthStore((state) => state.user?.id);
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const [items, setItems] = useState<ConverterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [isDragActive, setIsDragActive] = useState(false);
  const [toast, setToast] = useState<ConverterToast | null>(null);
  const downloadedStorageKey = useMemo(
    () => (typeof userId === 'number' && userId > 0 ? getDownloadedStorageKey(userId) : null),
    [userId]
  );

  const openPickerOrAuth = useCallback(() => {
    if (!isAuth) {
      openAuthModal();
      return;
    }

    inputRef.current?.click();
  }, [isAuth, openAuthModal]);

  const updateDownloadedIds = useCallback((updater: (current: Set<string>) => Set<string>) => {
    setDownloadedIds((currentIds) => {
      const nextIds = updater(currentIds);

      if (!downloadedStorageKey) return nextIds;

      try {
        window.localStorage.setItem(downloadedStorageKey, JSON.stringify(Array.from(nextIds)));
      } catch {
        // ignore storage write errors
      }

      return nextIds;
    });
  }, [downloadedStorageKey]);

  const showToast = useCallback((message: string) => {
    setToast({
      id: Date.now(),
      message,
    });
  }, []);

  useEffect(() => {
    setDownloadedIds(readDownloadedIds(downloadedStorageKey));
  }, [downloadedStorageKey]);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast((currentToast) => (currentToast?.id === toast.id ? null : currentToast));
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const loadItems = useCallback(async () => {
    if (!isAuth) {
      setItems([]);
      setStatusTone('neutral');
      setStatusText('');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data } = await axiosInstance.get<ConverterItem[]>('/api/converter/files');
      setItems(Array.isArray(data) ? data : []);
      setStatusTone('neutral');
      setStatusText('');
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Не удалось загрузить хранилище.');
    } finally {
      setIsLoading(false);
    }
  }, [isAuth]);

  useEffect(() => {
    if (!isInitialized) return;
    void loadItems();
  }, [isInitialized, loadItems]);

  const handleConverterSocketUpdate = useCallback((payload: ConverterSocketPayload) => {
    if (!payload || payload.client_id === clientIdRef.current) return;

    if (payload.action === 'files_added') {
      const newItems = Array.isArray(payload.items) ? payload.items : [];
      if (!newItems.length) return;

      setItems((prev) => {
        const seenIds = new Set(newItems.map((item) => item.id));
        return [...newItems, ...prev.filter((item) => !seenIds.has(item.id))];
      });
      return;
    }

    if (payload.action === 'file_deleted' && payload.file_id) {
      setItems((prev) => prev.filter((item) => item.id !== payload.file_id));
    }
  }, []);

  useEffect(() => {
    if (!isAuth) return () => {};
    const unsubscribe = connectSocket({
      onConverterUpdate: handleConverterSocketUpdate,
    });

    return () => {
      unsubscribe?.();
    };
  }, [handleConverterSocketUpdate, isAuth]);

  const stats = useMemo(() => {
    const totalSize = items.reduce((sum, item) => sum + item.size_bytes, 0);
    const convertedVideos = items.filter((item) => item.was_converted).length;
    const videoCount = items.filter((item) => item.kind === 'video').length;

    return {
      totalFiles: items.length,
      totalSize: formatBytes(totalSize),
      convertedVideos,
      videoCount,
    };
  }, [items]);

  const isLibraryActionBusy = isUploading || downloadingId !== null || deletingId !== null;

  const handleFilesSelected = useCallback(async (fileList: FileList | File[] | null) => {
    if (!isAuth) {
      openAuthModal();
      return;
    }

    const files = fileList ? Array.from(fileList) : [];
    if (!files.length || isUploading) return;

    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setStatusTone('neutral');
      setStatusText(files.length > 1 ? `Загружаем ${formatFilesCountLabel(files.length)}...` : 'Загружаем файл...');

      const { data, status } = await axiosInstance.post<UploadResponse>(
        '/api/converter/files',
        form,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-Converter-Client-Id': clientIdRef.current,
          },
          onUploadProgress: (event: ProgressEvent) => {
            const total = event.total || 0;
            if (!total) return;
            setUploadProgress(Math.round((event.loaded / total) * 100));
          },
        }
      );

      const uploadedItems = Array.isArray(data?.items) ? data.items : [];
      const errors = Array.isArray(data?.errors) ? data.errors : [];

      if (uploadedItems.length) {
        setItems((prev) => [...uploadedItems, ...prev]);
      }

      if (errors.length) {
        setStatusTone('error');
        setStatusText(
          uploadedItems.length
            ? `Сохранено ${formatFilesCountLabel(uploadedItems.length)}. Ещё ${formatFilesCountLabel(errors.length)} не удалось обработать.`
            : 'Не удалось сохранить выбранные файлы.'
        );
      } else if (status === 201 || uploadedItems.length) {
        setStatusTone('neutral');
        setStatusText('');
        showToast(uploadedItems.length > 1 ? `Сохранено ${formatFilesCountLabel(uploadedItems.length)}.` : 'Файл сохранён.');
      }
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Загрузка не удалась.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }, [isAuth, isUploading, openAuthModal, showToast]);

  const handleDownload = useCallback(async (item: ConverterItem) => {
    if (isLibraryActionBusy) return;

    try {
      setDownloadingId(item.id);
      setDownloadProgress(null);
      const { data: blob } = await axiosInstance.get<Blob>(
        `/api/converter/files/${encodeURIComponent(item.id)}/download`,
        {
          responseType: 'blob',
          onDownloadProgress: (event: ProgressEvent) => {
            const total = typeof event.total === 'number' ? event.total : 0;
            if (!total) {
              setDownloadProgress(null);
              return;
            }

            const nextProgress = Math.round((event.loaded / total) * 100);
            setDownloadProgress(Math.max(0, Math.min(100, nextProgress)));
          },
        }
      );

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = item.download_name || item.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      updateDownloadedIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(item.id);
        return nextIds;
      });
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Не удалось скачать файл.');
    } finally {
      setDownloadingId(null);
      setDownloadProgress(null);
    }
  }, [isLibraryActionBusy, updateDownloadedIds]);

  const handleDelete = useCallback(async (item: ConverterItem) => {
    if (isLibraryActionBusy) return;

    const confirmed = window.confirm(`Удалить "${item.original_name}" из хранилища?`);
    if (!confirmed) return;

    try {
      setDeletingId(item.id);
      await axiosInstance.delete(`/api/converter/files/${item.id}`, {
        headers: {
          'X-Converter-Client-Id': clientIdRef.current,
        },
      });
      setItems((prev) => prev.filter((current) => current.id !== item.id));
      updateDownloadedIds((currentIds) => {
        if (!currentIds.has(item.id)) return currentIds;
        const nextIds = new Set(currentIds);
        nextIds.delete(item.id);
        return nextIds;
      });
      setStatusTone('neutral');
      setStatusText('');
      showToast('Файл удалён.');
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Не удалось удалить файл.');
    } finally {
      setDeletingId(null);
    }
  }, [isLibraryActionBusy, showToast, updateDownloadedIds]);

  return (
    <div className={classes.page}>
      <main className={classes.converter}>
      <div className={classes.hero}>
        <div className={classes.heroCopy}>
          <span className={classes.eyebrow}>Private Transfer</span>
          <h1>Converter</h1>
          <p>
            Загружайте файлы здесь и скачивайте их на другом устройстве без лишних шагов.
          </p>
        </div>
      </div>

      <article className={classes.uploadCard}>
        <div className={classes.cardHead}>
          <div>
            <span className={classes.cardEyebrow}>Upload</span>
            <h2>Загрузить файлы</h2>
          </div>
          <button
            type="button"
            className={classes.secondaryButton}
            onClick={openPickerOrAuth}
            disabled={isUploading}
          >
            Выбрать файлы
          </button>
        </div>

        <button
          type="button"
          className={`${classes.dropzone} ${isDragActive ? classes.dropzoneActive : ''}`}
          onClick={openPickerOrAuth}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setIsDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            void handleFilesSelected(event.dataTransfer.files);
          }}
          disabled={isUploading}
        >
          <span className={classes.dropzoneIcon}>↑</span>
          <strong>Перетащите сюда фото, видео или любые файлы</strong>
          <span>Можно выбрать сразу несколько. Поддерживаются и большие файлы.</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={__PLATFORM__ === 'mobile' ? 'image/*,video/*' : undefined}
          className={classes.hiddenInput}
          onChange={(event) => {
            void handleFilesSelected(event.target.files);
          }}
        />

        <div className={classes.uploadHints}>
          <span>PNG / JPG / HEIC / MOV / MP4 / ZIP и другое</span>
          <span>Видео не в MP4 будут сохранены в MP4</span>
        </div>

        {(isUploading || statusText) && (
          <div
            className={`${classes.statusBox} ${
              statusTone === 'success'
                ? classes.statusSuccess
                : statusTone === 'error'
                  ? classes.statusError
                  : ''
            }`}
          >
            <div className={classes.statusLine}>
              <span>{statusText || 'Готово к загрузке'}</span>
              {isUploading && <strong>{uploadProgress}%</strong>}
            </div>
            {isUploading && (
              <div className={classes.progressTrack} aria-hidden="true">
                <div className={classes.progressBar} style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        )}
      </article>

      <div className={classes.stats}>
        <article className={classes.statCard}>
          <span>Файлов</span>
          <strong>{stats.totalFiles}</strong>
        </article>
        <article className={classes.statCard}>
          <span>Вес хранилища</span>
          <strong>{stats.totalSize}</strong>
        </article>
        <article className={classes.statCard}>
          <span>Видео</span>
          <strong>{stats.videoCount}</strong>
        </article>
        <article className={classes.statCard}>
          <span>Конвертировано</span>
          <strong>{stats.convertedVideos}</strong>
        </article>
      </div>

      <article className={classes.libraryCard}>
        <div className={classes.cardHead}>
          <div>
            <span className={classes.cardEyebrow}>Library</span>
            <h2>Ваше хранилище</h2>
          </div>
          <button
            type="button"
            className={classes.ghostButton}
            onClick={() => void loadItems()}
            disabled={isLoading}
          >
            Обновить
          </button>
        </div>

        {isLoading ? (
          <div className={classes.emptyState}>
            <strong>Загружаем список файлов...</strong>
          </div>
        ) : items.length === 0 ? (
          <div className={classes.emptyState}>
            <strong>Пока пусто</strong>
            <span>Загрузите файл здесь, а потом скачайте его на другом устройстве под тем же аккаунтом.</span>
          </div>
        ) : (
          <div className={classes.fileGrid}>
            {items.map((item) => (
              <article key={item.id} className={classes.fileCard}>
                <div className={classes.fileTop}>
                  <span className={classes.fileBadge}>{getKindLabel(item.kind)}</span>
                  {item.was_converted && <span className={classes.fileBadgeAccent}>MP4</span>}
                  {downloadedIds.has(item.id) && <span className={classes.fileBadgeSuccess}>Скачано</span>}
                </div>

                {isPreviewableKind(item.kind) && <ConverterPreview item={item} />}

                <div className={classes.fileMain}>
                  <strong title={item.original_name}>{item.original_name}</strong>
                  <span>{formatBytes(item.size_bytes)}</span>
                </div>

                <div className={classes.fileMeta}>
                  <span>{formatDate(item.created_at)}</span>
                  <span>{item.mime_type || 'application/octet-stream'}</span>
                </div>

                <div className={classes.fileActions}>
                  <button
                    type="button"
                    className={classes.primaryButton}
                    onClick={() => void handleDownload(item)}
                    disabled={isLibraryActionBusy}
                  >
                    {downloadingId === item.id ? 'Скачиваем...' : 'Скачать'}
                  </button>
                  <button
                    type="button"
                    className={classes.dangerButton}
                    onClick={() => void handleDelete(item)}
                    disabled={isLibraryActionBusy}
                  >
                    {deletingId === item.id ? 'Удаляем...' : 'Удалить'}
                  </button>
                </div>

                {downloadingId === item.id && (
                  downloadProgress !== null ? (
                    <div className={classes.downloadStatus}>
                      <div className={classes.downloadStatusLine}>
                        <span>Загрузка файла</span>
                        <strong>{downloadProgress}%</strong>
                      </div>
                      <div className={classes.downloadProgressTrack} aria-hidden="true">
                        <div className={classes.downloadProgressBar} style={{ width: `${downloadProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className={classes.downloadSpinnerRow}>
                      <span className={classes.downloadSpinner} aria-hidden="true" />
                      <span>Загружаем файл...</span>
                    </div>
                  )
                )}
              </article>
            ))}
          </div>
        )}
      </article>

        {toast && (
          <div key={toast.id} className={classes.toast} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}
      </main>
    </div>
  );
};

export default Converter;
