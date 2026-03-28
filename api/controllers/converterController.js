const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ffmpegPath = require('ffmpeg-static');

const {
  ensureUserDir,
  getUserFilePath,
  readManifest,
  removeFileIfExists,
  writeManifest,
} = require('../utils/converterStorage');

const VIDEO_EXTENSIONS = new Set([
  '.3gp',
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mpeg',
  '.mpg',
  '.mts',
  '.m2ts',
  '.webm',
  '.wmv',
]);

const PREVIEW_EXTENSION = '.jpg';
const PREVIEW_MIME_TYPE = 'image/jpeg';
const PREVIEW_MAX_SIZE = 320;
const PREVIEW_QUALITY = 20;
const CONVERTER_VIDEO_VERSION = 3;
const CONVERTER_VIDEO_MAXRATE = '20M';
const CONVERTER_VIDEO_BUFSIZE = '40M';

const MOJIBAKE_PATTERN = /[\u00C3\u00D0\u00D1]/;
const MOJIBAKE_PATTERN_GLOBAL = /[\u00C3\u00D0\u00D1]/g;

const decodePossiblyMojibakeName = (value) => {
  const raw = String(value || '');
  if (!raw) return '';
  if (!MOJIBAKE_PATTERN.test(raw)) return raw;

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (!decoded || decoded.includes('\uFFFD')) return raw;

    const rawScore = (raw.match(MOJIBAKE_PATTERN_GLOBAL) || []).length;
    const decodedScore = (decoded.match(MOJIBAKE_PATTERN_GLOBAL) || []).length;
    if (decodedScore > rawScore) return raw;

    return decoded;
  } catch {
    return raw;
  }
};

const sanitizeFileName = (value) => {
  const decodedName = decodePossiblyMojibakeName(value);
  const baseName = path.basename(String(decodedName || '').trim() || 'file');
  const sanitized = baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return sanitized || 'file';
};

const makeId = () => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;

const isConvertibleVideo = (file) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();
  if (mimeType === 'video/mp4' || ext === '.mp4') return false;
  if (mimeType.startsWith('video/')) return true;
  return VIDEO_EXTENSIONS.has(ext);
};

const getKind = (mimeType, ext) => {
  const safeMimeType = String(mimeType || '').toLowerCase();
  if (safeMimeType.startsWith('image/')) return 'image';
  if (safeMimeType.startsWith('video/')) return 'video';
  if (VIDEO_EXTENSIONS.has(ext) || ext === '.mp4') return 'video';
  return 'file';
};

const toPublicEntry = (entry) => ({
  id: entry.id,
  original_name: entry.original_name,
  download_name: entry.download_name,
  mime_type: entry.mime_type,
  size_bytes: entry.size_bytes,
  created_at: entry.created_at,
  kind: entry.kind,
  was_converted: Boolean(entry.was_converted),
});

const encodeDownloadName = (value) => encodeURIComponent(value).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
const isPreviewableEntry = (entry) => entry?.kind === 'image' || entry?.kind === 'video';
const buildPreviewName = (entryId) => `${entryId}-preview${PREVIEW_EXTENSION}`;

const emitConverterUpdatedToUser = (req, userId, payload) => {
  try {
    const io = req.app.get('io');
    if (!io) return;

    const safeUserId = Number(userId);
    if (!Number.isFinite(safeUserId) || safeUserId <= 0) return;

    io.to(`user:${safeUserId}`).emit('converter:updated', payload);
  } catch {
    // ignore
  }
};

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  if (!ffmpegPath) {
    reject(new Error('ffmpeg-static is not available'));
    return;
  }

  const child = spawn(ffmpegPath, args, { windowsHide: true });
  let errorOutput = '';

  child.stderr.on('data', (chunk) => {
    if (errorOutput.length < 8000) {
      errorOutput += chunk.toString();
    }
  });

  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(errorOutput.trim() || `ffmpeg exited with code ${code}`));
  });
});

const convertVideoToMp4 = (inputPath, outputPath) => runFfmpeg([
  '-y',
  '-i', inputPath,
  '-map', '0:v:0',
  '-map', '0:a?',
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '18',
  '-profile:v', 'high',
  '-tag:v', 'avc1',
  '-pix_fmt', 'yuv420p',
  '-vf', buildCompatibleVideoFilter(),
  '-maxrate:v', CONVERTER_VIDEO_MAXRATE,
  '-bufsize:v', CONVERTER_VIDEO_BUFSIZE,
  '-c:a', 'aac',
  '-b:a', '160k',
  '-ar', '48000',
  '-ac', '2',
  '-movflags', '+faststart',
  outputPath,
]);

const generatePreviewImage = (inputPath, outputPath) => runFfmpeg([
  '-y',
  '-i', inputPath,
  '-frames:v', '1',
  '-vf', `scale=${PREVIEW_MAX_SIZE}:${PREVIEW_MAX_SIZE}:force_original_aspect_ratio=decrease`,
  '-q:v', String(PREVIEW_QUALITY),
  outputPath,
]);

const ensureFileMissing = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
};

const replaceFile = async (fromPath, toPath) => {
  await ensureFileMissing(toPath);
  await fs.promises.rename(fromPath, toPath);
};

const buildCompatibleVideoFilter = () => 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

const writeUpdatedEntry = async (userId, entries, updatedEntry) => {
  await writeManifest(
    userId,
    entries.map((item) => (item.id === updatedEntry.id ? updatedEntry : item))
  );
};

const createPreviewForEntry = async (userId, entry) => {
  if (!isPreviewableEntry(entry)) return entry;

  const previewName = buildPreviewName(entry.id);
  const sourcePath = getUserFilePath(userId, entry.stored_name);
  const previewPath = getUserFilePath(userId, previewName);

  try {
    await removeFileIfExists(previewPath);
    await generatePreviewImage(sourcePath, previewPath);
    const previewStats = await fs.promises.stat(previewPath);

    return {
      ...entry,
      preview_name: previewName,
      preview_mime_type: PREVIEW_MIME_TYPE,
      preview_size_bytes: previewStats.size,
    };
  } catch (err) {
    await removeFileIfExists(previewPath);
    throw err;
  }
};

const ensureConvertedEntryCompatibility = async (userId, entries, entry) => {
  if (!entry?.was_converted || Number(entry.conversion_version) >= CONVERTER_VIDEO_VERSION) {
    return entry;
  }

  const sourcePath = getUserFilePath(userId, entry.stored_name);
  const tempPath = getUserFilePath(userId, `${entry.id}-reencode.tmp.mp4`);

  try {
    await removeFileIfExists(tempPath);
    await convertVideoToMp4(sourcePath, tempPath);
    await replaceFile(tempPath, sourcePath);

    const stats = await fs.promises.stat(sourcePath);
    let updatedEntry = {
      ...entry,
      mime_type: 'video/mp4',
      kind: 'video',
      was_converted: true,
      size_bytes: stats.size,
      conversion_version: CONVERTER_VIDEO_VERSION,
    };

    if (entry.preview_name) {
      await removeFileIfExists(getUserFilePath(userId, entry.preview_name));
      updatedEntry = {
        ...updatedEntry,
        preview_name: undefined,
        preview_mime_type: undefined,
        preview_size_bytes: undefined,
      };
    }

    try {
      updatedEntry = await createPreviewForEntry(userId, updatedEntry);
    } catch (previewErr) {
      console.error('converter:upgradePreview', previewErr);
    }

    await writeUpdatedEntry(userId, entries, updatedEntry);
    return updatedEntry;
  } catch (err) {
    await removeFileIfExists(tempPath);
    throw err;
  }
};

const persistUploadedFile = async (userId, file) => {
  const entryId = makeId();
  const safeOriginalName = sanitizeFileName(file.originalname);
  const originalExt = path.extname(safeOriginalName).toLowerCase();
  const shouldConvertToMp4 = isConvertibleVideo(file);

  await ensureUserDir(userId);

  let storedName = `${entryId}${originalExt}`;
  let downloadName = safeOriginalName;
  let mimeType = String(file.mimetype || '').trim() || 'application/octet-stream';
  let kind = getKind(mimeType, originalExt);
  let wasConverted = false;

  if (shouldConvertToMp4) {
    storedName = `${entryId}.mp4`;
    downloadName = `${path.parse(safeOriginalName).name || 'video'}.mp4`;
    mimeType = 'video/mp4';
    kind = 'video';
    wasConverted = true;
  }

  const targetPath = getUserFilePath(userId, storedName);

  try {
    if (shouldConvertToMp4) {
      await convertVideoToMp4(file.path, targetPath);
      await removeFileIfExists(file.path);
    } else {
      await fs.promises.rename(file.path, targetPath);
    }

    const stats = await fs.promises.stat(targetPath);

    const savedEntry = {
      id: entryId,
      stored_name: storedName,
      original_name: safeOriginalName,
      download_name: downloadName,
      mime_type: mimeType,
      size_bytes: stats.size,
      created_at: new Date().toISOString(),
      kind,
      was_converted: wasConverted,
      conversion_version: wasConverted ? CONVERTER_VIDEO_VERSION : null,
    };

    if (!isPreviewableEntry(savedEntry)) {
      return savedEntry;
    }

    try {
      return await createPreviewForEntry(userId, savedEntry);
    } catch (previewErr) {
      console.error('converter:generatePreview', previewErr);
      return savedEntry;
    }
  } catch (err) {
    await removeFileIfExists(targetPath);
    await removeFileIfExists(file.path);
    throw err;
  }
};

const loadEntries = async (userId) => {
  const manifest = await readManifest(userId);
  const validEntries = [];
  let hasChanges = false;

  for (const entry of manifest) {
    const normalizedOriginalName = sanitizeFileName(entry?.original_name || 'file');
    const normalizedDownloadName = sanitizeFileName(entry?.download_name || normalizedOriginalName);
    const normalizedEntry =
      normalizedOriginalName !== entry?.original_name || normalizedDownloadName !== entry?.download_name
        ? {
            ...entry,
            original_name: normalizedOriginalName,
            download_name: normalizedDownloadName,
          }
        : entry;

    try {
      await fs.promises.access(getUserFilePath(userId, normalizedEntry.stored_name));
      validEntries.push(normalizedEntry);
      if (normalizedEntry !== entry) hasChanges = true;
    } catch {
      hasChanges = true;
    }
  }

  if (hasChanges) {
    await writeManifest(userId, validEntries);
  }

  return validEntries;
};

exports.listFiles = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const entries = await loadEntries(userId);
    res.json(entries.map(toPublicEntry));
  } catch (err) {
    console.error('converter:listFiles', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.uploadFiles = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const clientId = String(req.headers['x-converter-client-id'] || '').trim() || null;

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const existingEntries = await loadEntries(userId);
    const uploadedEntries = [];
    const errors = [];

    for (const file of files) {
      try {
        const entry = await persistUploadedFile(userId, file);
        uploadedEntries.push(entry);
      } catch (err) {
        console.error('converter:uploadFile', err);
        errors.push({
          file_name: sanitizeFileName(file.originalname),
          message: 'Failed to save file',
        });
      }
    }

    if (uploadedEntries.length) {
      await writeManifest(userId, [...uploadedEntries, ...existingEntries]);
      emitConverterUpdatedToUser(req, userId, {
        action: 'files_added',
        items: uploadedEntries.map(toPublicEntry),
        client_id: clientId,
      });
    }

    if (!uploadedEntries.length) {
      return res.status(500).json({
        message: 'Failed to save files',
        errors,
      });
    }

    return res.status(errors.length ? 207 : 201).json({
      items: uploadedEntries.map(toPublicEntry),
      errors,
    });
  } catch (err) {
    console.error('converter:uploadFiles', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const fileId = String(req.params.file_id || '').trim();
    const entries = await loadEntries(userId);
    const entry = entries.find((item) => item.id === fileId);

    if (!entry) {
      return res.status(404).json({ message: 'File not found' });
    }

    const downloadEntry = await ensureConvertedEntryCompatibility(userId, entries, entry);
    const absolutePath = getUserFilePath(userId, downloadEntry.stored_name);

    res.setHeader('Content-Type', downloadEntry.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(downloadEntry.size_bytes || 0));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeDownloadName(downloadEntry.download_name || downloadEntry.original_name || 'file')}`
    );

    return res.sendFile(absolutePath);
  } catch (err) {
    console.error('converter:downloadFile', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.previewFile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const fileId = String(req.params.file_id || '').trim();
    const entries = await loadEntries(userId);
    const entry = entries.find((item) => item.id === fileId);

    if (!entry) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (!isPreviewableEntry(entry)) {
      return res.status(404).json({ message: 'Preview unavailable' });
    }

    let previewEntry = entry;
    let previewPath = null;

    if (entry.preview_name) {
      try {
        const storedPreviewPath = getUserFilePath(userId, entry.preview_name);
        const previewStats = await fs.promises.stat(storedPreviewPath);
        previewPath = storedPreviewPath;

        if (entry.preview_mime_type !== PREVIEW_MIME_TYPE || entry.preview_size_bytes !== previewStats.size) {
          previewEntry = {
            ...entry,
            preview_mime_type: PREVIEW_MIME_TYPE,
            preview_size_bytes: previewStats.size,
          };
          await writeUpdatedEntry(userId, entries, previewEntry);
        }
      } catch {
        previewPath = null;
      }
    }

    if (!previewPath) {
      try {
        previewEntry = await createPreviewForEntry(userId, entry);
        previewPath = getUserFilePath(userId, previewEntry.preview_name);
        await writeUpdatedEntry(userId, entries, previewEntry);
      } catch (previewErr) {
        console.error('converter:previewGenerate', previewErr);
        return res.status(404).json({ message: 'Preview unavailable' });
      }
    }

    res.setHeader('Content-Type', previewEntry.preview_mime_type || PREVIEW_MIME_TYPE);
    res.setHeader('Content-Length', String(previewEntry.preview_size_bytes || 0));
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeDownloadName(previewEntry.preview_name || buildPreviewName(entry.id))}`
    );

    return res.sendFile(previewPath);
  } catch (err) {
    console.error('converter:previewFile', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const clientId = String(req.headers['x-converter-client-id'] || '').trim() || null;

    const fileId = String(req.params.file_id || '').trim();
    const entries = await loadEntries(userId);
    const entry = entries.find((item) => item.id === fileId);

    if (!entry) {
      return res.status(404).json({ message: 'File not found' });
    }

    await removeFileIfExists(getUserFilePath(userId, entry.stored_name));
    if (entry.preview_name) {
      await removeFileIfExists(getUserFilePath(userId, entry.preview_name));
    } else if (isPreviewableEntry(entry)) {
      await removeFileIfExists(getUserFilePath(userId, buildPreviewName(entry.id)));
    }
    await writeManifest(userId, entries.filter((item) => item.id !== fileId));
    emitConverterUpdatedToUser(req, userId, {
      action: 'file_deleted',
      file_id: fileId,
      client_id: clientId,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('converter:deleteFile', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
