INSERT INTO admin_profiles (user_id, email, first_name, last_name, role, status)
VALUES 
  ('0d70cac6-b7ff-4041-a90e-d40614f39622', 'scarlettbonatto@gmail.com', 'Scarlett', 'Bonatto', 'super_admin', 'active'),
  ('e3700614-19c6-489a-abaa-8731e822f193', 'claudioreybaud@gmail.com', 'Claudio', 'Reybaud', 'super_admin', 'active')
ON CONFLICT DO NOTHING;