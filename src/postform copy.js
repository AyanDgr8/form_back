// src/postform.js
// PostgreSQL-powered version of form handling
// ------------------------------------------------------------

import pkg from 'pg';
const { Pool } = pkg;
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

dotenv.config();

// 1. Database -------------------------------------------------------
export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'multyform',
  port: process.env.PGPORT || 5432,
  max: 10,                 // max clients in the pool
  idleTimeoutMillis: 30000 // close idle clients after 30 s
});

// 2. Mail transport -------------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail', // or any SMTP provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD, // app password
  },
});

const DISPOSITION_TO_EMAIL = {
  'Customer Support': 'customersupport@shams.ae',
  'Consultant support': 'consultantsupport@shams.ae',
  'Application Support': 'applicantsupport@shams.ae',
  'B2B Lead': 'sales@shams.ae',
  'New Lead': 'info@shams.ae',
  'Renewals': 'renewals@shams.ae',
  'Concierge Services': 'concierge@shams.ae',
};

/**
 * Inserts a new form submission & triggers notification email.
 * @param {Object} data { company, name, contact_number, email, disposition, query }
 */
export async function handleFormSubmission(data) {
  const {
    company,
    name,
    contact_number,
    email,
    disposition,
    query,
  } = data;

  // ---- store in DB ----
  const sql = `INSERT INTO forms (company, name, contact_number, email, disposition, query)
               VALUES ($1, $2, $3, $4, $5, $6)`;
  await pool.query(sql, [company, name, contact_number, email, disposition, query]);

  // ---- send email ----
  const to = DISPOSITION_TO_EMAIL[disposition] || 'info@shams.ae';

  const mailOptions = {
    from: process.env.EMAIL_USER,
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
  } catch (err) {
    console.error('Email sending failed:', err);
  }
}

/**
 * Retrieves all form submissions ordered by newest first
 */
export async function listForms() {
  const { rows } = await pool.query('SELECT * FROM forms ORDER BY created_at DESC');
  return rows;
}

// --- Stand-alone express server (when run directly) -----------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = express();
  const PORT = process.env.PORT || 5000;

  app.use(cors());
  app.use(express.json());

  app.post('/forms', async (req, res) => {
    try {
      await handleFormSubmission(req.body);
      res.sendStatus(201);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/forms', async (_req, res) => {
    try {
      const rows = await listForms();
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.listen(PORT, () => console.log(`PostgreSQL API listening on port ${PORT}`));
}