// src/voicemeetme.js
import axios from 'axios';
import { getPortalToken, httpsAgent } from './tokenService.js';

/**
 * Send a PUT request to VoiceMeetMe to update disposition for a campaign call.
 *
 * @param {string} tenant   Domain / tenant (e.g. "mc_int")
 * @param {string} callId   Campaign call ID ("as752olfnafj55a8ve6c")
 * @param {string} value    Disposition text / ID
 */
export async function updateCallDisposition(tenant, callId, value) {
  if (!tenant || !callId) throw new Error('tenant and callId are required');
  const token = await getPortalToken(tenant);
  const base = process.env.BASE_URL;
  const url = `${base}/api/v2/config/campaigns/call/${callId}/disposition`;

  await axios.put(
    url,
    { value },
    {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-User-Agent': 'portal',
        'X-Account-ID': process.env.ACCOUNT_ID_HEADER ?? tenant,
        'Content-Type': 'application/json;charset=UTF-8',
      },
      timeout: 5000,
    },
  );
}
