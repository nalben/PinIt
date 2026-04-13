const fs = require('fs');
const path = require('path');
const { CONVERTER_ROOT } = require('./runtimePaths');

const CONVERTER_TMP_DIR = path.join(CONVERTER_ROOT, '_tmp');

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const ensureBaseDirs = async () => {
  await ensureDir(CONVERTER_ROOT);
  await ensureDir(CONVERTER_TMP_DIR);
};

const getUserDir = (userId) => path.join(CONVERTER_ROOT, String(userId));

const ensureUserDir = async (userId) => {
  await ensureBaseDirs();
  await ensureDir(getUserDir(userId));
};

const getManifestPath = (userId) => path.join(getUserDir(userId), 'manifest.json');

const readManifest = async (userId) => {
  await ensureUserDir(userId);

  try {
    const raw = await fs.promises.readFile(getManifestPath(userId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
};

const writeManifest = async (userId, entries) => {
  await ensureUserDir(userId);
  await fs.promises.writeFile(
    getManifestPath(userId),
    JSON.stringify(entries, null, 2),
    'utf8'
  );
};

const getUserFilePath = (userId, storedName) => {
  const userDir = path.resolve(getUserDir(userId));
  const targetPath = path.resolve(userDir, storedName);
  const safePrefix = `${userDir.toLowerCase()}${path.sep}`;
  const targetLower = targetPath.toLowerCase();

  if (targetLower !== userDir.toLowerCase() && !targetLower.startsWith(safePrefix)) {
    throw new Error('Unsafe converter path');
  }

  return targetPath;
};

const removeFileIfExists = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
};

module.exports = {
  CONVERTER_ROOT,
  CONVERTER_TMP_DIR,
  ensureBaseDirs,
  ensureUserDir,
  getUserDir,
  getUserFilePath,
  readManifest,
  removeFileIfExists,
  writeManifest,
};
