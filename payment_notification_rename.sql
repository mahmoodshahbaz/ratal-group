-- Rename "Payment Instruction" → "Payment Notification" in document_templates
UPDATE document_templates
SET template_name = 'Payment Notification'
WHERE template_key = 'payment_instruction';
