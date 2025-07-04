// src/webhook.js

import express from 'express';
import { pool } from './form.js';
import dotenv from 'dotenv';
import cors from 'cors';

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
      agentExtn    // AGENT_EXTENSION
    } = data;

    // Log the incoming request
    console.log('Webhook received:', {
      cidname, cidnum, agent, qid, qname, agentExtn
    });

    // Create a temporary record in the database with the call parameters
    const sql = `INSERT INTO forms 
      (company, name, contact_number, email, disposition, query, 
       queue_id, queue_name, agent_id, agent_ext, caller_id__name, caller_id__number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    // Use caller name as company name initially if available
    const company = "";
    const name = "";
    const contact_number = "";
    const email = ""; 
    const disposition ="";
    const query = "";

    await pool.execute(sql, [
      company,
      name,
      contact_number,
      email,
      disposition,
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

    // Redirect to the frontend form page with the record ID
    // Use the frontend port from environment variables
    const clientURL = 'http://localhost:7775';
    res.redirect(`${clientURL}/forms?id=${recordId}`);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Handle GET requests for webhook
app.get('/webhook', async (req, res) => {
  await processWebhookData(req.query, res);
});

// Add the webhook route to the main API server
export function setupWebhookRoutes(mainApp) {
  // Register the route directly on the main app
  mainApp.get('/webhook', async (req, res) => {
    await processWebhookData(req.query, res);
  });
  
  console.log('Webhook routes registered successfully');
}

// Start the server only if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
  });
}

export default app;