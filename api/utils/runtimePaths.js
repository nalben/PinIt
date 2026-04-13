const path = require('path');

const API_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = process.env.PINIT_DATA_DIR
  ? path.resolve(process.env.PINIT_DATA_DIR)
  : API_ROOT;

const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
const CONVERTER_ROOT = path.join(DATA_ROOT, 'converter_uploads');

const resolveUploadsPath = (...segments) => path.join(UPLOADS_DIR, ...segments);

module.exports = {
  API_ROOT,
  DATA_ROOT,
  UPLOADS_DIR,
  CONVERTER_ROOT,
  resolveUploadsPath,
};
