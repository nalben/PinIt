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

const sanitizeFileName = (value) => {
  const baseName = path.basename(String(value || '').trim() || 'file');
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

const convertVideoToMp4 = (inputPath, outputPath) => new Promise((resolve, reject) => {
  if (!ffmpegPath) {
    reject(new Error('ffmpeg-static is not available'));
    return;
  }

  const args = [
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath,
  ];

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

    return {
      id: entryId,
      stored_name: storedName,
      original_name: safeOriginalName,
      download_name: downloadName,
      mime_type: mimeType,
      size_bytes: stats.size,
      created_at: new Date().toISOString(),
      kind,
      was_converted: wasConverted,
    };
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
    try {
      await fs.promises.access(getUserFilePath(userId, entry.stored_name));
      validEntries.push(entry);
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

    const absolutePath = getUserFilePath(userId, entry.stored_name);

    res.setHeader('Content-Type', entry.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(entry.size_bytes || 0));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeDownloadName(entry.download_name || entry.original_name || 'file')}`
    );

    return res.sendFile(absolutePath);
  } catch (err) {
    console.error('converter:downloadFile', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const fileId = String(req.params.file_id || '').trim();
    const entries = await loadEntries(userId);
    const entry = entries.find((item) => item.id === fileId);

    if (!entry) {
      return res.status(404).json({ message: 'File not found' });
    }

    await removeFileIfExists(getUserFilePath(userId, entry.stored_name));
    await writeManifest(userId, entries.filter((item) => item.id !== fileId));

    return res.json({ success: true });
  } catch (err) {
    console.error('converter:deleteFile', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
