-- New user: Максим Камушкин (manager)
-- Password will be auto-hashed by hash_password_on_upsert trigger
INSERT INTO users (full_name, login, password, role, phone, is_active)
VALUES ('Максим Камушкин', 'kamushkin', 'Kamushkin1', 'manager', '+84352812915', true);
