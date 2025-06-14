-- src/schema.sql

CREATE DATABASE IF NOT EXISTS multyform;

USE multyform;

-- Table to store form submissions
CREATE TABLE IF NOT EXISTS forms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company VARCHAR(200) NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact_number VARCHAR(20),
  email VARCHAR(100) NOT NULL,
  disposition VARCHAR(100) DEFAULT NULL,
  query TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Table to store selectable field values (e.g. disposition)
CREATE TABLE IF NOT EXISTS customer_field_values (
  id INT AUTO_INCREMENT PRIMARY KEY,
  field_name   VARCHAR(100) NOT NULL,
  field_value  VARCHAR(150) NOT NULL
);

-- Default disposition values
INSERT INTO customer_field_values (field_name, field_value) VALUES
  ('disposition', 'Application Support'),
  ('disposition', 'B2B Lead'),
  ('disposition', 'Concierge Services'),
  ('disposition', 'Consultant support'),
  ('disposition', 'Customer Support'),
  ('disposition', 'General Enquiry'),
  ('disposition', 'New Lead'),
  ('disposition', 'Renewals');