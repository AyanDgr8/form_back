import axios from 'axios';
import ms from 'ms';
import https from 'https';

const cache = new Map(); // In production prefer Redis or similar shared cache
const MAX_RETRIES = 3;

// Accept self-signed certificates in lower environments – override in prod
const httpsAgent = new https.Agent({ rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '1' });

// Cache structure: Map<key, {access, refresh, expiresAt}>

/**
 * Modern portal login used by new /api/v2/... routes. Similar retry + caching.
 *
 * @param {string} tenant domain, e.g. mc_int
 * @returns {Promise<string>} access token (JWT)
 */
export async function getPortalToken(tenant) {
  const now = Date.now();
  const cacheKey = `portal:${tenant}`;
  const cached = cache.get(cacheKey);
  if (cached && now < cached.expiresAt - ms('2m')) return cached.access;

  const base = process.env.BASE_URL;
  const candidates = [
    { url: `${base}/api/v2/config/login/oauth`, body: { domain: tenant, username: process.env.API_USERNAME, password: process.env.API_PASSWORD } },
    { url: `${base}/api/v2/login`, body: { domain: tenant, username: process.env.API_USERNAME, password: process.env.API_PASSWORD } },
    { url: `${base}/api/login`, body: { domain: tenant, username: process.env.API_USERNAME, password: process.env.API_PASSWORD } },
  ];

  for (const { url, body } of candidates) {
    for (let attempt = 0, delay = 1000; attempt < MAX_RETRIES; attempt++, delay *= 2) {
      try {
        const { data } = await axios.post(url, body, { timeout: 5000, httpsAgent, headers: { Accept: 'application/json' } });

        const access = data.accessToken || data.access_token;
        if (!access) throw new Error('No access token in response');

        const refresh = data.refreshToken || data.refresh_token;
        const expiresAt = data.expiresIn ? Date.now() + data.expiresIn * 1000 : Date.now() + ms('1h');

        cache.set(cacheKey, { access, refresh, expiresAt });
        if (process.env.DEBUG) console.log(`✅ Portal login succeeded at ${url}`);
        return access;
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) {
          if (process.env.DEBUG) console.warn(`Login failed at ${url}: ${err.response?.status || err.message}`);
        } else {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }
  throw new Error('All portal login attempts failed – check credentials/endpoints');
}

export { httpsAgent };
