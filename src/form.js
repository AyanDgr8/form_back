// src/form.js

import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { setupWebhookRoutes } from './webhook.js';

dotenv.config();

// 1. Database -------------------------------------------------------
export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DB || 'multyform',
  port: process.env.MYSQL_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// 2. Mail transport -------------------------------------------------
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'no-reply@shams.ae',
    pass: process.env.EMAIL_PASSWORD || 'rcjsbkpkrwgvvqsx', // app password
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log("SMTP Error:", error);
  } else {
    console.log("SMTP is working.");
  }
});

// Use the authenticated email as the from address
const from = process.env.EMAIL_USER || 'no-reply@shams.ae';

const DISPOSITION_TO_EMAIL = {
  'Customer Support': 'customersupport@shams.ae',
  // 'Customer Support': 'ayan@multycomm.com',
  'Consultant support': 'consultantsupport@shams.ae',
  'Application Support': 'applicantsupport@shams.ae',
  'B2B Lead': 'sales@shams.ae',
  'New Lead': 'info@shams.ae',
  'Renewals': 'renewals@shams.ae',
  'Concierge Services': 'concierge@shams.ae',
  'General Enquiry': null, // No email needed for General Enquiry
};

/**
 * Inserts a new form submission & triggers notification email.
 * @param {Object} data { company, name, contact_number, email, disposition, query, queue_id, queue_name, agent_id, agent_ext, caller_id__name, caller_id__number }
 */
export async function handleFormSubmission(data) {
  const {
    company,
    name,
    contact_number,
    email,
    disposition,
    query,
    queue_id,
    queue_name,
    agent_id,
    agent_ext,
    caller_id__name,
    caller_id__number,
  } = data;

  // ---- store in DB ----
  const sql = `INSERT INTO forms (
    company, name, contact_number, email, disposition, query,
    queue_id, queue_name, agent_id, agent_ext, caller_id__name, caller_id__number
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  await pool.execute(sql, [
    company, name, contact_number, email, disposition, query,
    queue_id || null, queue_name || null, agent_id || null, 
    agent_ext || null, caller_id__name || null, caller_id__number || null
  ]);

  // ---- send email ----
  // Skip email sending for General Enquiry
  if (disposition === 'General Enquiry') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Form submission stored for General Enquiry (no email sent)`);
    return;
  }

  const to = DISPOSITION_TO_EMAIL[disposition] || 'info@shams.ae';

  const mailOptions = {
    from: from,
    to,
    subject: 'Inbound Call – For your action!',
    html: `
      <p>Greetings!</p>
      <p>We received enquiry for the below client, kindly please assist them for the below mentioned.</p>
      <br/>
      <b>Company:</b> ${company || '—'}<br/>
      <b>Client/Caller Name:</b> ${name || '—'}<br/>
      <b>Email:</b> ${email || '—'}<br/>
      <b>Contact:</b> ${contact_number || '—'}<br/>
      <b>Query:</b> ${query || '—'}<br/>
      <br/>
      Thank you!<br/>
      Regards,
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Email sent successfully to ${to} for disposition: ${disposition}`);
  } catch (err) {
    console.error('Email sending failed:', err);
  }
}

/**
 * Updates an existing form submission & triggers notification email.
 * @param {number} id The ID of the form to update
 * @param {Object} data Updated form data
 */
export async function updateFormSubmission(id, data) {
  const {
    company,
    name,
    contact_number,
    email,
    disposition,
    query,
    queue_id,
    queue_name,
    agent_id,
    agent_ext,
    caller_id__name,
    caller_id__number,
  } = data;

  // ---- update in DB ----
  const sql = `UPDATE forms SET 
    company = ?, name = ?, contact_number = ?, email = ?, 
    disposition = ?, query = ?, queue_id = ?, queue_name = ?,
    agent_id = ?, agent_ext = ?, caller_id__name = ?, caller_id__number = ?
    WHERE id = ?`;
  
  await pool.execute(sql, [
    company, name, contact_number, email, disposition, query,
    queue_id || null, queue_name || null, agent_id || null, 
    agent_ext || null, caller_id__name || null, caller_id__number || null,
    id
  ]);

  // ---- send email notification about update ----
  if (disposition === 'General Enquiry') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Form update stored for General Enquiry (no email sent)`);
    return;
  }

  const to = DISPOSITION_TO_EMAIL[disposition] || 'info@shams.ae';

  const mailOptions = {
    from,
    to,
    subject: 'Updated Inbound Call – For your action!',
    html: `
      <p>Greetings!</p>
      <p>We received enquiry for the below client, kindly please assist them for the below mentioned.</p>
      <br/>
      <b>Company:</b> ${company || '—'}<br/>
      <b>Client/Caller Name:</b> ${name || '—'}<br/>
      <b>Email:</b> ${email || '—'}<br/>
      <b>Contact:</b> ${contact_number || '—'}<br/>
      <b>Query:</b> ${query || '—'}<br/>
      <br/>
      Thank you!<br/>
      Regards,
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Update notification email sent successfully to ${to} for disposition: ${disposition}`);
  } catch (err) {
    console.error('Email sending failed:', err);
  }
}

/**
 * Retrieves a specific form submission by ID
 * @param {number} id The ID of the form to retrieve
 */
export async function getFormById(id) {
  const [rows] = await pool.execute('SELECT * FROM forms WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Retrieves all form submissions ordered by newest first
 */
export async function listForms() {
  const [rows] = await pool.execute('SELECT * FROM forms ORDER BY created_at DESC');
  return rows;
}

// --- Stand-alone express server (used when this module is run directly) ----
import express from 'express';
import cors from 'cors';

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = express();
  const PORT = process.env.PORT || 8989;

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

  setupWebhookRoutes(app);

  app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}