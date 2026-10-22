-- Clean up the test row inserted during diagnostics
DELETE FROM site_masters WHERE job_no = 'TEST-DIRECT-001';
