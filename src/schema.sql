
-- src/schema.sql


-- New Disposition Schema for Customer Service Form
-- This schema supports cascading dropdowns: Call Type → Disposition-1 → Disposition-2

CREATE DATABASE IF NOT EXISTS shams_new_form;
USE shams_new_form;

-- Updated forms table to support new disposition structure
CREATE TABLE IF NOT EXISTS forms_new (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company VARCHAR(200) NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  email VARCHAR(100) NOT NULL,
  call_type VARCHAR(50) NOT NULL,
  disposition_1 VARCHAR(100) NOT NULL,
  disposition_2 VARCHAR(100) NOT NULL,
  query TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Call center fields (optional)
  queue_id VARCHAR(100) NULL,
  queue_name VARCHAR(100) NULL,
  agent_id VARCHAR(100) NULL,
  agent_ext VARCHAR(100) NULL,
  caller_id_name VARCHAR(100) NULL,
  caller_id_number VARCHAR(100) NULL,
  
  INDEX idx_call_type (call_type),
  INDEX idx_disposition_1 (disposition_1),
  INDEX idx_disposition_2 (disposition_2),
  INDEX idx_created_at (created_at)
);

-- Table to store disposition hierarchy and email mappings
CREATE TABLE IF NOT EXISTS disposition_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  call_type VARCHAR(50) NOT NULL,
  disposition_1 VARCHAR(100) NOT NULL,
  disposition_2 VARCHAR(100) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  is_custom_input BOOLEAN DEFAULT FALSE, -- TRUE for "Others" options
  
  UNIQUE KEY unique_disposition (call_type, disposition_1, disposition_2),
  INDEX idx_call_type (call_type),
  INDEX idx_disposition_1 (disposition_1)
);

-- Insert all disposition configurations with email mappings
INSERT INTO disposition_config (call_type, disposition_1, disposition_2, email_address, is_custom_input) VALUES

--  → CallBack Not Rcvd
('Customer Support', 'Meeting Room', 'Meeting Room Enquiry', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Application Support', 'Returned Application', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Phone Answering Service', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Tax Enquiry', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Sponsor / Depenedent Visa', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'MOFA Attestaion', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Bank Account Opening Assistance', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Health Insurance', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'VIP Medical and Insurance', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Document Delivery Service', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Concierge', 'Other Enquiry', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Renewals', 'License Renewal', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'New Lead', 'New Company Formation', 'businesscenetersupport@shamsfz.ae', FALSE),
('Customer Support', 'Guide Team', 'New Application Submission', 'businesscenetersupport@shamsfz.ae', FALSE),

-- QUERY → Others
('Customer Support', 'Others', 'Others', '', TRUE);


-- View to get disposition hierarchy for frontend
CREATE VIEW disposition_hierarchy AS
SELECT DISTINCT 
  call_type,
  disposition_1,
  disposition_2,
  email_address,
  is_custom_input
FROM disposition_config
ORDER BY call_type, disposition_1, disposition_2;
