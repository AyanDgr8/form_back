// src/form.js

import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { setupWebhookRoutes } from './webhook.js';
import express from 'express';
import cors from 'cors';

dotenv.config();

// 1. Database -------------------------------------------------------
export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DB || 'shams_new_form',
  port: process.env.MYSQL_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});


// 2. Mail transport -------------------------------------------------
// Primary configuration for Office365
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'no-reply@shams.ae',
    pass: process.env.EMAIL_PASSWORD || 'rcjsbkpkrwgvvqsx',
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false
  },
  debug: true, // Enable debug output
  logger: true // Log to console
});

// Alternative Gmail configuration (uncomment if Office365 fails)
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: 'your-gmail@gmail.com',
//     pass: 'your-app-password', // Gmail app password
//   },
// });

// Test SMTP connection
transporter.verify((error, success) => {
  if (error) {
    console.log("❌ SMTP Error:", error.message);
    console.log("\n📧 SMTP Configuration:");
    console.log("- Host: smtp.office365.com");
    console.log("- Port: 587");
    console.log("- User:", process.env.EMAIL_USER || 'noreply-multycomm@spcfz.ae');
    console.log("- Password length:", (process.env.EMAIL_PASSWORD || 'wwsbfysyndyqqgmt').length);
    console.log("\n🔧 Troubleshooting suggestions:");
    console.log("1. Verify the email account exists and is active");
    console.log("2. Check if 2FA is enabled - you may need an app password");
    console.log("3. Ensure SMTP is enabled for this account");
    console.log("4. Try using the account's full credentials");
    console.log("5. Contact IT admin to verify account permissions");
  } else {
    console.log("✅ SMTP connection successful!");
  }
});

/**
 * Get disposition hierarchy for cascading dropdowns
 */
export async function getDispositionHierarchy() {
  const sql = `
    SELECT DISTINCT 
      call_type,
      disposition_1,
      disposition_2,
      email_address,
      is_custom_input
    FROM disposition_config
    ORDER BY call_type, disposition_1, disposition_2
  `;
  
  const [rows] = await pool.execute(sql);
  
  // Structure data for frontend cascading dropdowns
  const hierarchy = {};
  
  rows.forEach(row => {
    const { call_type, disposition_1, disposition_2, email_address, is_custom_input } = row;
    
    if (!hierarchy[call_type]) {
      hierarchy[call_type] = {};
    }
    
    if (!hierarchy[call_type][disposition_1]) {
      hierarchy[call_type][disposition_1] = [];
    }
    
    hierarchy[call_type][disposition_1].push({
      value: disposition_2,
      email: email_address,
      isCustomInput: is_custom_input
    });
  });
  
  return hierarchy;
}

/**
 * Get email address for a specific disposition combination
 */
export async function getDispositionEmail(callType, disposition1, disposition2) {
  const sql = `
    SELECT email_address, is_custom_input 
    FROM disposition_config 
    WHERE call_type = ? AND disposition_1 = ? AND disposition_2 = ?
  `;
  
  const [rows] = await pool.execute(sql, [callType, disposition1, disposition2]);
  
  if (rows.length === 0) {
    return { email: 'info@spcfz.ae', isCustomInput: false }; // fallback email
  }
  
  return {
    email: rows[0].email_address,
    isCustomInput: rows[0].is_custom_input
  };
}

/**
 * Get department name based on email address
 */
export async function getDepartmentByEmail(emailAddress) {
  const departmentMap = {
    'businesscenetersupport@shamsfz.ae': 'Business Center Support Team',
    // 'cx@spcfz.ae': 'Customer Experience Team',
    // 'cp.support@spcfz.ae': 'Customer Support Team', 
    // 'services@spcfz.ae': 'Services Team',
    // 'accounts@spcfz.ae': 'Accounts Team',
    // 'info@spcfz.ae': 'General Support Team'
  };
  
  return departmentMap[emailAddress] || 'Support Team';
}

/**
 * Inserts a new form submission & triggers notification email.
 * @param {Object} data Form submission data
 */
export async function handleFormSubmission(data) {
  const {
    company,
    name,
    contact_number,
    email,
    call_type,
    disposition_1,
    disposition_2,
    query,
    queue_id,
    queue_name,
    agent_id,
    agent_ext,
    caller_id_name,
    caller_id_number,
  } = data;

  // Validate required fields
  if (!company || !name || !contact_number || !email || !call_type || !disposition_1 || !disposition_2) {
    throw new Error('Missing required fields: company, name, contact_number, email, call_type, disposition_1, disposition_2');
  }

  // Get email configuration for this disposition
  const { email: targetEmail, isCustomInput } = await getDispositionEmail(call_type, disposition_1, disposition_2);
  const departmentName = await getDepartmentByEmail(targetEmail);

  // ---- Store in DB ----
  const sql = `INSERT INTO forms_new (
    company, name, contact_number, email, call_type, disposition_1, disposition_2, 
    query, queue_id, queue_name, agent_id, agent_ext, 
    caller_id_name, caller_id_number
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  await pool.execute(sql, [
    company, name, contact_number, email, call_type, disposition_1, disposition_2,
    query || null, queue_id || null, queue_name || null, 
    agent_id || null, agent_ext || null, caller_id_name || null, caller_id_number || null
  ]);

  // Send final submission data to external database/API
  await sendFinalSubmissionData(data, caller_id_number);

  // ---- Send email ----
  // Skip email if it's a custom input without email or empty email
  if (!targetEmail || targetEmail === '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Form submission stored (no email sent for custom input)`);
    return;
  }

  // Prepare email content
  const disposition2Display = disposition_2;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: targetEmail,
    subject: 'Call Notification',
    html: `
      <p>Hi, Good Day!</p>
      <p>We received a call with the following details. Kindly take the necessary action:</p>
      <br/>
      <p><strong>Ticket raised for: </strong>${departmentName}</p>
      <p><strong>Company:</strong> ${company}</p>
      <p><strong>Client/Caller Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Contact:</strong> ${contact_number}</p>
      <p><strong>Call Type:</strong> ${call_type}</p>
      <p><strong>Disposition 1:</strong> ${disposition_1}</p>
      <p><strong>Disposition 2:</strong> ${disposition2Display}</p>
      ${query ? `<p><strong>Query/Details:</strong> ${query}</p>` : ''}
      <br/>
      <p>Thank you, and have a great day!</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Email sent to ${targetEmail} for ${call_type} - ${disposition_1} - ${disposition_2}`);
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw error - form submission should still succeed even if email fails
  }
}

/**
 * Send final submission data to external database/API
 * This function is triggered automatically when a form is submitted
 * @param {Object} submissionData - Complete form submission data
 * @param {string} cidnum - Caller ID number parameter
 */
async function sendFinalSubmissionData(submissionData, cidnum) {
  try {
    // Prepare the final submission payload
    const finalSubmissionPayload = {
      // Basic form data
      company: submissionData.company,
      name: submissionData.name,
      contact_number: submissionData.contact_number,
      email: submissionData.email,
      
      // Disposition data
      call_type: submissionData.call_type,
      disposition_1: submissionData.disposition_1,
      disposition_2: submissionData.disposition_2,
      query: submissionData.query,
      
      // Call center data
      queue_id: submissionData.queue_id,
      queue_name: submissionData.queue_name,
      agent_id: submissionData.agent_id,
      agent_ext: submissionData.agent_ext,
      caller_id_name: submissionData.caller_id_name,
      caller_id_number: cidnum, // The cidnum parameter
      
      // Additional metadata
      submission_timestamp: new Date().toISOString(),
      
      // Get the email routing information
      target_email: await getDispositionEmail(submissionData.call_type, submissionData.disposition_1, submissionData.disposition_2),
      department: await getDepartmentByEmail((await getDispositionEmail(submissionData.call_type, submissionData.disposition_1, submissionData.disposition_2)).email)
    };

    // Log the final submission data
    console.log('Final Submission Data:', JSON.stringify(finalSubmissionPayload, null, 2));

    // TODO: Replace this with your actual external API endpoint
    // Example: Send to external database/API
    /*
    const response = await fetch('YOUR_EXTERNAL_API_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_TOKEN' // if needed
      },
      body: JSON.stringify(finalSubmissionPayload)
    });

    if (!response.ok) {
      throw new Error(`External API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Successfully sent to external API:', result);
    */

    // For now, just log success
    console.log(`[${new Date().toISOString()}] Final submission data prepared for cidnum: ${cidnum}`);
    
    return finalSubmissionPayload;
    
  } catch (error) {
    console.error('Error sending final submission data:', error);
    // Don't throw error - form submission should still succeed even if external API fails
    return null;
  }
}

/**
 * Updates an existing form submission & triggers notification email.
 * @param {number} id The ID of the form to update
 * @param {Object} data Updated form data
 */
export async function updateFormSubmission(id, data) {
  // fetch existing row to keep not-null columns intact
  const current = await getFormById(id);
  if (!current) throw new Error(`Form with id ${id} not found`);

  const {
    company = current.company,
    name = current.name,
    contact_number = current.contact_number,
    email = current.email,
    call_type = current.call_type,
    disposition_1 = current.disposition_1,
    disposition_2 = current.disposition_2,
    query = current.query,
    queue_id = current.queue_id,
    queue_name = current.queue_name,
    agent_id = current.agent_id,
    agent_ext = current.agent_ext,
    caller_id_name = current.caller_id_name,
    caller_id_number = current.caller_id_number,
  } = data;

  // ---- update in DB ----
  const sql = `UPDATE forms_new SET 
    company = ?, name = ?, contact_number = ?, email = ?, 
    call_type = ?, disposition_1 = ?, disposition_2 = ?, 
    query = ?, queue_id = ?, queue_name = ?,
    agent_id = ?, agent_ext = ?, caller_id_name = ?, caller_id_number = ?
    WHERE id = ?`;
  
  await pool.execute(sql, [
    company, name, contact_number, email, call_type, disposition_1, disposition_2,
    query, queue_id, queue_name, agent_id, agent_ext, 
    caller_id_name, caller_id_number, id
  ]);

  // ---- decide whether an email is required ----
  const payloadKeys = Object.keys(data).filter(k => data[k] !== undefined);

  // If the update touches ONLY after-call fields, suppress the email –
  // we only want one notification (sent on initial creation).
  const touchesOnlyAfterFields =
    payloadKeys.length > 0 && payloadKeys.every(k => k.startsWith('after_'));

  if (touchesOnlyAfterFields) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] After-call fields updated (id=${id}) – email suppressed`);
    return;
  }

  // Get email configuration for this disposition
  const { email: targetEmail, isCustomInput } = await getDispositionEmail(call_type, disposition_1, disposition_2);
  const departmentName = await getDepartmentByEmail(targetEmail);

  // Skip email if it's a custom input without email or empty email
  if (!targetEmail || targetEmail === '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Form update stored (no email sent for custom input)`);
    return;
  }

  // Prepare email content
  const disposition2Display = disposition_2;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: targetEmail,
    subject: 'Call Notification',
    html: `
      <p>Hi, Good Day!</p>
      <p>We received a call with the following details. Kindly take the necessary action:</p>
      <br/>
      <p><strong>Ticket raised for: </strong>${departmentName}</p>
      <p><strong>Company:</strong> ${company}</p>
      <p><strong>Client/Caller Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Contact:</strong> ${contact_number}</p>
      <p><strong>Call Type:</strong> ${call_type}</p>
      <p><strong>Disposition 1:</strong> ${disposition_1}</p>
      <p><strong>Disposition 2:</strong> ${disposition2Display}</p>
      ${query ? `<p><strong>Query/Details:</strong> ${query}</p>` : ''}
      <br/>
      <p>Thank you, and have a great day!</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Update notification email sent to ${targetEmail} for ${call_type} - ${disposition_1} - ${disposition_2}`);
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw error - form submission should still succeed even if email fails
  }
}

/**
 * Retrieves a specific form submission by ID
 * @param {number} id The ID of the form to retrieve
 */
export async function getFormById(id) {
  const [rows] = await pool.execute('SELECT * FROM forms_new WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Retrieves all form submissions ordered by newest first
 */
export async function listForms() {
  const [rows] = await pool.execute('SELECT * FROM forms_new ORDER BY created_at DESC');
  return rows;
}

/**
 * Finds the most recent form submission that matches a queue + caller-number pair.
 * @param {string} queueId  The queue_id received from the Web-Socket invite event
 * @param {string} callerNumber  Raw caller number as provided by the call-center
 * @returns {Promise<Object|null>}  The matching form row or null if none found
 */
export async function findFormByQueueAndCaller(queueId, callerNumber) {
  const [rows] = await pool.execute(
    `SELECT *
       FROM forms_new
      WHERE queue_id = ?
        AND caller_id_number = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    [queueId, callerNumber]
  );

  return rows.length > 0 ? rows[0] : null;
}

// --- Stand-alone express server (used when this module is run directly) ----

const PORT = process.env.PORT || 8989;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || `http://${HOST}:${PORT}`;

console.log(`🚀 Server will start on: ${PUBLIC_URL}`);

const app = express();
app.use(cors());
app.use(express.json());

// Create a new form
app.post('/forms', async (req, res) => {
  try {
    await handleFormSubmission(req.body);
    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get a specific form by ID
app.get('/forms/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const form = await getFormById(id);
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    res.json(form);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update an existing form
app.put('/forms/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const form = await getFormById(id);
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    await updateFormSubmission(id, req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get all forms
app.get('/forms', async (_req, res) => {
  try {
    const rows = await listForms();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get disposition hierarchy for cascading dropdowns
app.get('/disposition-hierarchy', async (_req, res) => {
  try {
    const hierarchy = await getDispositionHierarchy();
    res.json(hierarchy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Search for an existing form by queueId & caller number
app.get('/forms/search', async (req, res) => {
  const { queueId, callerNumber } = req.query;

  if (!queueId || !callerNumber) {
    return res.status(400).json({ error: 'queueId and callerNumber are required' });
  }

  try {
    const form = await findFormByQueueAndCaller(queueId, callerNumber);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    res.json(form);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

setupWebhookRoutes(app);

const server = app.listen(PORT, HOST, () => {
  console.log(`🌐 HTTP server running at ${PUBLIC_URL}`);
  console.log(`📡 Server accessible on all network interfaces (${HOST}:${PORT})`);
});

server.on('error', (err) => {
  console.error('❌ HTTP Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`  Port ${PORT} is already in use. Try a different port.`);
  } else if (err.code === 'EACCES') {
    console.error(`  Permission denied. Port ${PORT} might require sudo privileges.`);
  }
  process.exit(1);
});