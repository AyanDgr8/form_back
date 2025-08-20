// src/webhook.js

import express from 'express';
import { pool } from './form.js';
import dotenv from 'dotenv';
import cors from 'cors';
import { updateCallDisposition } from './voicemeetme.js';

dotenv.config();

const app = express();
// Use the same port as the main API to avoid CORS issues
const PORT = process.env.PORT || 8989;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Process webhook data from query parameters (GET)
 * @param {Object} data - Data from query params
 * @param {Object} res - Express response object
 */
async function processWebhookData(data, res) {
  try {
    // Ensure data is not undefined
    if (!data) {
      console.error('Webhook error: No data provided');
      return res.status(400).json({ error: 'No data provided' });
    }

    // Extract parameters
    const {
      cidname,     // CALLER_ID_NAME
      cidnum,      // CALLER_ID_NUMBER
      agent,       // AGENT_ID
      qid,         // QUEUE_ID
      qname,       // QUEUE_NAME
      agentExtn,    // AGENT_EXTENSION
      disposition, // DISPOSITION (may be empty at call start)
      tenant, // VOICEMEETME tenant (optional)
      callId // VOICEMEETME campaign call ID (optional)
    } = data;

    // Log the incoming request
    console.log('Webhook received:', {
      cidname, cidnum, agent, qid, qname, agentExtn, disposition, tenant, callId
    });

    // Create a temporary record in the database with the call parameters
    // Updated to use new disposition form structure
    const sql = `INSERT INTO forms_new 
      (company, name, contact_number, email, call_type, disposition_1, disposition_2, 
       query, queue_id, queue_name, agent_id, agent_ext, 
       caller_id_name, caller_id_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    // Initialize empty values for form fields - will be filled by user
    const company = "";
    const name = "";
    const contact_number = cidnum || ""; // Pre-fill with caller number if available
    const email = ""; 
    const call_type = ""; // Will be selected by user
    const disposition_1 = ""; // Will be selected by user
    const disposition_2 = ""; // Will be selected by user
    const query = "";

    await pool.execute(sql, [
      company,
      name,
      contact_number,
      email,
      call_type,
      disposition_1,
      disposition_2,
      query,
      qid || '',
      qname || '',
      agent || '',
      agentExtn || '',
      cidname || '',
      cidnum || ''
    ]);

    // Get the ID of the inserted record to pass to the form page
    const [result] = await pool.execute('SELECT LAST_INSERT_ID() as id');
    const recordId = result[0].id;

    // Note: Disposition forwarding to VoiceMeetMe will happen after form submission
    // since we now use the new disposition structure instead of the old single disposition field

    // Redirect to the frontend form page with the record ID
    // Use the frontend port from environment variables
    const clientURL = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${clientURL}/?id=${recordId}`);
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * Process webhook data from POST body
 * @param {Object} data - Data from POST body
 * @param {Object} res - Express response object
 */
async function processWebhookPostData(data, res) {
  try {
    // For POST requests, we might receive form data after submission
    // This can be used to update the VoiceMeetMe system with the final disposition
    const {
      recordId,
      call_type,
      disposition_1,
      disposition_2,
      disposition_2_custom,
      tenant,
      callId
    } = data;

    if (recordId && call_type && disposition_1 && disposition_2) {
      // Update the record with the final disposition data
      const updateSql = `UPDATE forms_new 
        SET call_type = ?, disposition_1 = ?, disposition_2 = ?, disposition_2_custom = ?
        WHERE id = ?`;
      
      await pool.execute(updateSql, [
        call_type,
        disposition_1,
        disposition_2,
        disposition_2_custom || null,
        recordId
      ]);

      // Forward disposition to VoiceMeetMe if details provided
      if (tenant && callId) {
        try {
          // Create a combined disposition string for VoiceMeetMe
          const combinedDisposition = disposition_2_custom 
            ? `${call_type} - ${disposition_1} - ${disposition_2_custom}`
            : `${call_type} - ${disposition_1} - ${disposition_2}`;
            
          await updateCallDisposition(tenant, callId, combinedDisposition);
          console.log(`Call disposition forwarded to VoiceMeetMe for callId ${callId}: ${combinedDisposition}`);
        } catch (e) {
          console.error('Failed to push disposition to VoiceMeetMe:', e.message);
        }
      }

      res.json({ success: true, message: 'Disposition updated successfully' });
    } else {
      res.status(400).json({ error: 'Missing required disposition data' });
    }
    
  } catch (error) {
    console.error('Webhook POST error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// GET webhook endpoint (for call initiation)
app.get('/webhook', (req, res) => {
  processWebhookData(req.query, res);
});

// POST webhook endpoint (for disposition updates)
app.post('/webhook', (req, res) => {
  processWebhookPostData(req.body, res);
});

// Health check endpoint
app.get('/webhook/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Export the setup function for integration with main server
export function setupWebhookRoutes(mainApp) {
  // Mount webhook routes on the main app
  mainApp.get('/webhook', (req, res) => {
    processWebhookData(req.query, res);
  });

  mainApp.post('/webhook', (req, res) => {
    processWebhookPostData(req.body, res);
  });

  mainApp.get('/webhook/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  console.log('Webhook routes configured');
}

// Start standalone server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
  });
}