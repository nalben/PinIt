import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import axiosInstance from '@/api/axiosInstance';

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
  }).format(new Date(value));
};

const getKindLabel = (kind: ConverterItemKind) => {
  if (kind === 'image') return 'Фото';
  if (kind === 'video') return 'Видео';
  return 'Файл';
};

const Converter = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ConverterItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'error'>('neutral');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await axiosInstance.get<ConverterItem[]>('/api/converter/files');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Не удалось загрузить хранилище.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

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

  const handleFilesSelected = useCallback(async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length || isUploading) return;

    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setStatusTone('neutral');
      setStatusText(files.length > 1 ? `Загружаем ${files.length} файлов...` : 'Загружаем файл...');

      const { data, status } = await axiosInstance.post<UploadResponse>(
        '/api/converter/files',
        form,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
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
        setStatusTone(uploadedItems.length ? 'success' : 'error');
        setStatusText(
          uploadedItems.length
            ? `Сохранено ${uploadedItems.length}. Ещё ${errors.length} не удалось обработать.`
            : 'Не удалось сохранить выбранные файлы.'
        );
      } else if (status === 201 || uploadedItems.length) {
        setStatusTone('success');
        setStatusText(uploadedItems.length > 1 ? `Сохранено ${uploadedItems.length} файлов.` : 'Файл сохранён.');
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
  }, [isUploading]);

  const handleDownload = useCallback(async (item: ConverterItem) => {
    try {
      setDownloadingId(item.id);
      const response = await axiosInstance.get<Blob>(`/api/converter/files/${item.id}/download`, {
        responseType: 'blob',
      });

      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = item.download_name || item.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Не удалось скачать файл.');
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (item: ConverterItem) => {
    const confirmed = window.confirm(`Удалить "${item.original_name}" из хранилища?`);
    if (!confirmed) return;

    try {
      setDeletingId(item.id);
      await axiosInstance.delete(`/api/converter/files/${item.id}`);
      setItems((prev) => prev.filter((current) => current.id !== item.id));
      setStatusTone('success');
      setStatusText('Файл удалён.');
    } catch (err) {
      console.error(err);
      setStatusTone('error');
      setStatusText('Не удалось удалить файл.');
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <section className={classes.converter}>
      <div className={classes.hero}>
        <div className={classes.heroCopy}>
          <span className={classes.eyebrow}>Private Transfer</span>
          <h1>Converter</h1>
          <p>
            Загружайте файлы здесь и скачивайте их на другом устройстве без лишних шагов.
          </p>
        </div>

        <div className={classes.heroNotes}>
          <div className={classes.noteCard}>
            <span>Оригиналы</span>
            <strong>Изображения сохраняются как есть</strong>
          </div>
          <div className={classes.noteCard}>
            <span>Видео</span>
            <strong>Все форматы кроме MP4 автоматически конвертируются в MP4</strong>
          </div>
          <div className={classes.noteCard}>
            <span>Доступ</span>
            <strong>Только для залогиненного пользователя</strong>
          </div>
        </div>
      </div>

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

      <div className={classes.workspace}>
        <article className={classes.uploadCard}>
          <div className={classes.cardHead}>
            <div>
              <span className={classes.cardEyebrow}>Upload</span>
              <h2>Загрузить файлы</h2>
            </div>
            <button
              type="button"
              className={classes.secondaryButton}
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              Выбрать файлы
            </button>
          </div>

          <button
            type="button"
            className={`${classes.dropzone} ${isDragActive ? classes.dropzoneActive : ''}`}
            onClick={() => inputRef.current?.click()}
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
            <span>Можно выбрать сразу несколько. Ограничение по размеру намеренно не задаём в интерфейсе.</span>
          </button>

          <input
            ref={inputRef}
            type="file"
            multiple
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
                  </div>

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
                      disabled={downloadingId === item.id}
                    >
                      {downloadingId === item.id ? 'Скачиваем...' : 'Скачать'}
                    </button>
                    <button
                      type="button"
                      className={classes.dangerButton}
                      onClick={() => void handleDelete(item)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? 'Удаляем...' : 'Удалить'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
};

export default Converter;
