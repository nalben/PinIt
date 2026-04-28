const { AUTH_TOKEN_TTL_DAYS } = require('./authSession');

const AUTH_COOKIE_MAX_AGE_MS = AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const getAuthCookieBaseOptions = (req) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const isSecure = req.secure || forwardedProto === 'https';
  const host = String(req.headers.host || '')
    .split(':')[0]
    .trim()
    .toLowerCase();
  const shouldShareAcrossPinItHosts = host === 'pin-it.ru' || host === 'www.pin-it.ru';

  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: Boolean(isSecure),
    path: '/',
    ...(shouldShareAcrossPinItHosts ? { domain: 'pin-it.ru' } : {}),
  };
};

const getAuthCookieOptions = (req) => ({
  ...getAuthCookieBaseOptions(req),
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
});

module.exports = {
  AUTH_COOKIE_MAX_AGE_MS,
  getAuthCookieBaseOptions,
  getAuthCookieOptions,
};
