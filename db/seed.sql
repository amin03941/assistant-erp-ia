-- =============================================================================
-- Assistant IA pour ERP générique — jeu de données fictives
-- Généré par generate_seed.py (graine fixe, sortie reproductible)
--
-- Les dates sont relatives à CURRENT_DATE : le jeu reste pertinent
-- quelle que soit la date d'exécution.
--
-- paid_amount et le statut des factures sont calculés par les déclencheurs
-- définis dans schema.sql : ils ne sont pas insérés ici.
--
-- Prérequis : schema.sql exécuté au préalable.
-- =============================================================================

BEGIN;

-- Réinitialisation (ordre inverse des dépendances)
TRUNCATE audit_logs, invoice_imports, assistant_requests, documents, messages,
         conversations, supplier_payments, purchase_invoice_items, purchase_invoices,
         customer_payments, sales_invoice_items, sales_invoices,
         sales_order_items, sales_orders, products, suppliers, customers, users
         RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- Utilisateurs
-- Mot de passe commun à tous les comptes de démonstration : Demo1234!
-- (haché avec bcrypt, coût 10)
-- -----------------------------------------------------------------------------
INSERT INTO users (full_name, email, password_hash, role, status) VALUES
  ('Ahmed Ben Ali', 'responsable@integrasys.tn', '$2b$10$cUR7emEPX/k40FUOWvhKUuG/b13QjaelFGh/4ruLu3VC.wscBbLjm', 'MANAGER', 'ACTIVE'),
  ('Sonia Trabelsi', 'comptable@integrasys.tn', '$2b$10$2IdSqyDio9HTMlGXBrrX9uC9tkO3J5KkQx.C89Mgrku9TKyogvRre', 'ACCOUNTANT', 'ACTIVE'),
  ('Karim Jlassi', 'commercial@integrasys.tn', '$2b$10$5Oq0SbsEZnjXADRD8oBEHO1N8vkgIg4rXaJ9x4K0Q/Il4.OPh.PBu', 'SALES', 'ACTIVE'),
  ('Nadia Bouzid', 'admin@integrasys.tn', '$2b$10$g4qqW1n4YjuFcBO.9XtcBO5ieq0srjpEjwGv4jDxXU8hlPrLemTOa', 'ADMIN', 'ACTIVE');

-- -----------------------------------------------------------------------------
-- Clients
-- -----------------------------------------------------------------------------
INSERT INTO customers (reference, name, tax_identifier, email, phone, address, payment_terms_days, status) VALUES
  ('CLI-001', 'Société Alpha', '1234567/A/M/000', 'contact@alpha.tn', '+216 71 234 567', '12 rue de Carthage, 1002 Tunis', 30, 'ACTIVE'),
  ('CLI-002', 'STE Beta Distribution', '2345678/B/M/000', 'achat@beta.tn', '+216 71 345 678', '45 avenue Habib Bourguiba, 4000 Sousse', 45, 'ACTIVE'),
  ('CLI-003', 'Gamma SARL', '3456789/C/M/000', 'info@gamma.tn', '+216 74 456 789', '8 rue Ibn Khaldoun, 3000 Sfax', 30, 'ACTIVE'),
  ('CLI-004', 'Delta Industrie', '4567890/D/M/000', 'compta@delta-ind.tn', '+216 72 567 890', 'Zone industrielle, 8000 Nabeul', 60, 'ACTIVE'),
  ('CLI-005', 'Epsilon Services', '5678901/E/M/000', 'contact@epsilon.tn', '+216 71 678 901', '3 rue de Marseille, 1001 Tunis', 30, 'ACTIVE'),
  ('CLI-006', 'Zeta Trading', '6789012/F/M/000', 'sales@zeta.tn', '+216 73 789 012', '22 avenue de la Liberté, 5000 Monastir', 15, 'ACTIVE'),
  ('CLI-007', 'Horizon Distribution', '7890123/G/M/000', 'achats@horizon.tn', '+216 71 890 123', 'Route de Bizerte km 7, 2080 Ariana', 30, 'ACTIVE'),
  ('CLI-008', 'Medina Textile', '8901234/H/M/000', 'contact@medina-textile.tn', '+216 73 901 234', '14 rue des Tanneurs, 5100 Mahdia', 45, 'ACTIVE'),
  ('CLI-009', 'Carthage Logistics', '9012345/I/M/000', 'ops@carthage-log.tn', '+216 71 012 345', 'Port de Radès, 2040 Radès', 30, 'ACTIVE'),
  ('CLI-010', 'Sahara Equipements', '0123456/J/M/000', 'info@sahara-eq.tn', '+216 75 123 456', 'Route de Douz, 4200 Tataouine', 60, 'ARCHIVED');

-- -----------------------------------------------------------------------------
-- Fournisseurs
-- -----------------------------------------------------------------------------
INSERT INTO suppliers (reference, name, tax_identifier, email, phone, address, payment_terms_days, status) VALUES
  ('FRS-001', 'TechnoImport SA', '1111111/A/M/000', 'commandes@technoimport.tn', '+216 71 111 111', 'Zone Charguia II, 2035 Tunis', 30, 'ACTIVE'),
  ('FRS-002', 'Bureau Plus', '2222222/B/M/000', 'vente@bureauplus.tn', '+216 71 222 222', '18 rue de Rome, 1000 Tunis', 30, 'ACTIVE'),
  ('FRS-003', 'Global Composants', '3333333/C/M/000', 'info@globalcomp.tn', '+216 74 333 333', 'Route de Gabès km 3, 3000 Sfax', 45, 'ACTIVE'),
  ('FRS-004', 'Energie Services', '4444444/D/M/000', 'contact@energie-srv.tn', '+216 72 444 444', 'Zone industrielle, 8000 Nabeul', 30, 'ACTIVE'),
  ('FRS-005', 'Transit Maghreb', '5555555/E/M/000', 'ops@transit-maghreb.tn', '+216 71 555 555', 'Port de Radès, 2040 Radès', 15, 'ACTIVE'),
  ('FRS-006', 'Cloud Nord SARL', '6666666/F/M/000', 'billing@cloudnord.tn', '+216 71 666 666', 'Lac 2, 1053 Tunis', 30, 'ACTIVE');

-- -----------------------------------------------------------------------------
-- Produits et services
-- -----------------------------------------------------------------------------
INSERT INTO products (reference, name, category, product_type, unit, sale_price, purchase_price, tax_rate, stock_quantity, status) VALUES
  ('PRD-001', 'Ordinateur portable ProBook 15', 'Informatique', 'GOOD', 'unité', 2450.000, 1850.000, 19.0, 24.000, 'ACTIVE'),
  ('PRD-002', 'Écran 27 pouces UltraSharp', 'Informatique', 'GOOD', 'unité', 890.000, 640.000, 19.0, 41.000, 'ACTIVE'),
  ('PRD-003', 'Station d''accueil USB-C', 'Informatique', 'GOOD', 'unité', 320.000, 210.000, 19.0, 63.000, 'ACTIVE'),
  ('PRD-004', 'Serveur rack 2U', 'Informatique', 'GOOD', 'unité', 8900.000, 7100.000, 19.0, 6.000, 'ACTIVE'),
  ('PRD-005', 'Onduleur 1500 VA', 'Informatique', 'GOOD', 'unité', 640.000, 430.000, 19.0, 18.000, 'ACTIVE'),
  ('PRD-006', 'Switch réseau 24 ports', 'Réseau', 'GOOD', 'unité', 1150.000, 820.000, 19.0, 12.000, 'ACTIVE'),
  ('PRD-007', 'Point d''accès Wi-Fi 6', 'Réseau', 'GOOD', 'unité', 480.000, 330.000, 19.0, 27.000, 'ACTIVE'),
  ('PRD-008', 'Câble réseau catégorie 6', 'Réseau', 'GOOD', 'mètre', 3.500, 1.900, 19.0, 2400.000, 'ACTIVE'),
  ('PRD-009', 'Bureau ergonomique 160 cm', 'Mobilier', 'GOOD', 'unité', 1290.000, 870.000, 19.0, 15.000, 'ACTIVE'),
  ('PRD-010', 'Fauteuil de bureau ergonomique', 'Mobilier', 'GOOD', 'unité', 760.000, 480.000, 19.0, 33.000, 'ACTIVE'),
  ('PRD-011', 'Armoire métallique 2 portes', 'Mobilier', 'GOOD', 'unité', 940.000, 610.000, 19.0, 9.000, 'ARCHIVED'),
  ('PRD-012', 'Ramette papier A4 80 g', 'Fournitures', 'GOOD', 'carton', 78.000, 52.000, 19.0, 180.000, 'ACTIVE'),
  ('PRD-013', 'Cartouche toner noir', 'Fournitures', 'GOOD', 'unité', 245.000, 168.000, 19.0, 47.000, 'ACTIVE'),
  ('PRD-014', 'Installation et paramétrage', 'Services', 'SERVICE', 'heure', 120.000, 0.000, 19.0, 0.000, 'ACTIVE'),
  ('PRD-015', 'Maintenance annuelle', 'Services', 'SERVICE', 'forfait', 3200.000, 0.000, 19.0, 0.000, 'ACTIVE'),
  ('PRD-016', 'Formation utilisateurs', 'Services', 'SERVICE', 'jour', 850.000, 0.000, 19.0, 0.000, 'ACTIVE'),
  ('PRD-017', 'Hébergement cloud mensuel', 'Services', 'SERVICE', 'mois', 450.000, 280.000, 19.0, 0.000, 'ACTIVE'),
  ('PRD-018', 'Licence bureautique annuelle', 'Logiciels', 'GOOD', 'licence', 390.000, 295.000, 19.0, 120.000, 'ACTIVE'),
  ('PRD-019', 'Clavier et souris sans fil', 'Informatique', 'GOOD', 'lot', 145.000, 88.000, 19.0, 56.000, 'ACTIVE'),
  ('PRD-020', 'Disque SSD 1 To', 'Informatique', 'GOOD', 'unité', 410.000, 285.000, 19.0, 38.000, 'ACTIVE');

-- -----------------------------------------------------------------------------
-- Commandes clients
-- Quelques commandes CONFIRMED ont une date de livraison dépassée :
-- elles alimentent la question « quelles commandes sont en retard ? »
-- -----------------------------------------------------------------------------
INSERT INTO sales_orders (reference, customer_id, order_date, expected_delivery_date, status, subtotal_amount, tax_amount, total_amount) VALUES
  ('CMD-2026-0001', (SELECT id FROM customers WHERE reference='CLI-005'), (CURRENT_DATE - 73), (CURRENT_DATE - 66), 'DELIVERED', 6555.000, 1245.450, 7800.450),
  ('CMD-2026-0002', (SELECT id FROM customers WHERE reference='CLI-001'), (CURRENT_DATE - 22), (CURRENT_DATE + 14), 'CONFIRMED', 11048.000, 2099.120, 13147.120),
  ('CMD-2026-0003', (SELECT id FROM customers WHERE reference='CLI-002'), (CURRENT_DATE - 142), (CURRENT_DATE - 125), 'DELIVERED', 3072.000, 583.680, 3655.680),
  ('CMD-2026-0004', (SELECT id FROM customers WHERE reference='CLI-004'), (CURRENT_DATE - 75), (CURRENT_DATE - 59), 'CONFIRMED', 770.000, 146.300, 916.300),
  ('CMD-2026-0005', (SELECT id FROM customers WHERE reference='CLI-003'), (CURRENT_DATE - 231), (CURRENT_DATE - 216), 'DELIVERED', 59876.500, 11376.535, 71253.035),
  ('CMD-2026-0006', (SELECT id FROM customers WHERE reference='CLI-002'), (CURRENT_DATE - 205), (CURRENT_DATE - 191), 'DELIVERED', 3945.000, 749.550, 4694.550),
  ('CMD-2026-0007', (SELECT id FROM customers WHERE reference='CLI-005'), (CURRENT_DATE - 6), (CURRENT_DATE + 13), 'CONFIRMED', 6072.300, 1153.737, 7226.037),
  ('CMD-2026-0008', (SELECT id FROM customers WHERE reference='CLI-009'), (CURRENT_DATE - 157), (CURRENT_DATE - 142), 'DELIVERED', 11118.000, 2112.420, 13230.420),
  ('CMD-2026-0009', (SELECT id FROM customers WHERE reference='CLI-004'), (CURRENT_DATE - 48), (CURRENT_DATE - 28), 'CONFIRMED', 2470.000, 469.300, 2939.300),
  ('CMD-2026-0010', (SELECT id FROM customers WHERE reference='CLI-005'), (CURRENT_DATE - 27), (CURRENT_DATE - 20), 'DELIVERED', 2145.600, 407.664, 2553.264),
  ('CMD-2026-0011', (SELECT id FROM customers WHERE reference='CLI-001'), (CURRENT_DATE - 24), (CURRENT_DATE + 4), 'CONFIRMED', 9010.000, 1711.900, 10721.900),
  ('CMD-2026-0012', (SELECT id FROM customers WHERE reference='CLI-003'), (CURRENT_DATE - 81), (CURRENT_DATE - 57), 'CONFIRMED', 245.000, 46.550, 291.550),
  ('CMD-2026-0013', (SELECT id FROM customers WHERE reference='CLI-008'), (CURRENT_DATE - 199), (CURRENT_DATE - 181), 'DELIVERED', 11794.000, 2240.860, 14034.860),
  ('CMD-2026-0014', (SELECT id FROM customers WHERE reference='CLI-008'), (CURRENT_DATE - 211), (CURRENT_DATE - 194), 'DELIVERED', 9210.000, 1749.900, 10959.900),
  ('CMD-2026-0015', (SELECT id FROM customers WHERE reference='CLI-007'), (CURRENT_DATE - 122), (CURRENT_DATE - 109), 'CONFIRMED', 3260.000, 619.400, 3879.400),
  ('CMD-2026-0016', (SELECT id FROM customers WHERE reference='CLI-006'), (CURRENT_DATE - 155), (CURRENT_DATE - 150), 'DELIVERED', 8305.000, 1577.950, 9882.950),
  ('CMD-2026-0017', (SELECT id FROM customers WHERE reference='CLI-004'), (CURRENT_DATE - 10), (CURRENT_DATE + 24), 'DRAFT', 5000.000, 950.000, 5950.000),
  ('CMD-2026-0018', (SELECT id FROM customers WHERE reference='CLI-002'), (CURRENT_DATE - 13), (CURRENT_DATE + 20), 'CONFIRMED', 26092.500, 4957.575, 31050.075),
  ('CMD-2026-0019', (SELECT id FROM customers WHERE reference='CLI-008'), (CURRENT_DATE - 165), (CURRENT_DATE - 158), 'DELIVERED', 63554.000, 12075.260, 75629.260),
  ('CMD-2026-0020', (SELECT id FROM customers WHERE reference='CLI-003'), (CURRENT_DATE - 7), (CURRENT_DATE + 24), 'DRAFT', 26700.000, 5073.000, 31773.000),
  ('CMD-2026-0021', (SELECT id FROM customers WHERE reference='CLI-001'), (CURRENT_DATE - 85), (CURRENT_DATE - 51), 'CONFIRMED', 8850.000, 1681.500, 10531.500),
  ('CMD-2026-0022', (SELECT id FROM customers WHERE reference='CLI-008'), (CURRENT_DATE - 25), (CURRENT_DATE + 5), 'CONFIRMED', 2560.000, 486.400, 3046.400),
  ('CMD-2026-0023', (SELECT id FROM customers WHERE reference='CLI-005'), (CURRENT_DATE - 145), (CURRENT_DATE - 135), 'DELIVERED', 28008.000, 5321.520, 33329.520),
  ('CMD-2026-0024', (SELECT id FROM customers WHERE reference='CLI-004'), (CURRENT_DATE - 64), (CURRENT_DATE - 48), 'CANCELLED', 9200.000, 1748.000, 10948.000),
  ('CMD-2026-0025', (SELECT id FROM customers WHERE reference='CLI-001'), (CURRENT_DATE - 88), (CURRENT_DATE - 81), 'DELIVERED', 6080.000, 1155.200, 7235.200),
  ('CMD-2026-0026', (SELECT id FROM customers WHERE reference='CLI-005'), (CURRENT_DATE - 86), (CURRENT_DATE - 79), 'CONFIRMED', 1615.000, 306.850, 1921.850),
  ('CMD-2026-0027', (SELECT id FROM customers WHERE reference='CLI-001'), (CURRENT_DATE - 22), (CURRENT_DATE + 10), 'CONFIRMED', 6360.000, 1208.400, 7568.400),
  ('CMD-2026-0028', (SELECT id FROM customers WHERE reference='CLI-001'), (CURRENT_DATE - 100), (CURRENT_DATE - 84), 'DELIVERED', 3428.000, 651.320, 4079.320),
  ('CMD-2026-0029', (SELECT id FROM customers WHERE reference='CLI-008'), (CURRENT_DATE - 2), (CURRENT_DATE + 20), 'DRAFT', 6040.000, 1147.600, 7187.600),
  ('CMD-2026-0030', (SELECT id FROM customers WHERE reference='CLI-007'), (CURRENT_DATE - 108), (CURRENT_DATE - 101), 'DELIVERED', 8925.000, 1695.750, 10620.750),
  ('CMD-2026-0031', (SELECT id FROM customers WHERE reference='CLI-007'), (CURRENT_DATE - 18), (CURRENT_DATE + 13), 'CONFIRMED', 12418.500, 2359.515, 14778.015),
  ('CMD-2026-0032', (SELECT id FROM customers WHERE reference='CLI-009'), (CURRENT_DATE - 33), (CURRENT_DATE - 16), 'CANCELLED', 4582.500, 870.675, 5453.175);

INSERT INTO sales_order_items (sales_order_id, product_id, description, quantity, unit_price, tax_rate) VALUES
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0001'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 6.000, 1092.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0002'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 11.000, 78.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0002'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 13.000, 390.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0002'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 4.000, 480.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0002'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 1.000, 3200.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0003'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 8.000, 304.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0003'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 1.000, 640.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0004'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 1.000, 480.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0004'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 2.000, 145.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0005'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 1.000, 760.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0005'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 6.000, 8900.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0005'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 13.000, 370.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0005'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 2.000, 450.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0006'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 10.000, 370.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0006'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 2.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0007'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 15.000, 390.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0007'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 3.000, 74.100, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0008'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 16.000, 370.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0008'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 18.000, 145.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0008'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 2.000, 1290.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0009'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 150.000, 3.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0009'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 6.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0009'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 5.000, 245.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0010'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 16.000, 74.100, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0010'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 8.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0011'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 3.000, 410.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0011'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 1.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0011'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 18.000, 390.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0011'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 1.000, 640.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0012'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 1.000, 245.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 14.000, 390.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 4.000, 890.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 8.000, 232.750, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 304.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0014'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 6.000, 760.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0014'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 6.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0014'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 6.000, 245.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0014'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 6.000, 410.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0015'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 320.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0015'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 2.000, 1150.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0016'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 5.000, 640.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0016'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 3.000, 450.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0016'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 1.000, 1290.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0016'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 17.000, 145.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0017'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 6.000, 640.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0017'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 8.000, 145.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0018'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 7.000, 2327.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0018'), (SELECT id FROM products WHERE reference='PRD-016'), 'Formation utilisateurs', 4.000, 850.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0018'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 2.000, 3200.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0019'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 11.000, 114.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0019'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 7.000, 8900.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0020'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 3.000, 8900.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0021'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 6.000, 760.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0021'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 8.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0021'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 300.000, 3.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0021'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 5.000, 456.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0022'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 4.000, 640.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0023'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 7.000, 320.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0023'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 7.000, 3200.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0023'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 20.000, 145.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0023'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 6.000, 78.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0024'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 8.000, 1150.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0025'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 8.000, 760.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0026'), (SELECT id FROM products WHERE reference='PRD-016'), 'Formation utilisateurs', 2.000, 807.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0027'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 320.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0027'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 12.000, 450.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0028'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 2.000, 114.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0028'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 1.000, 3200.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0029'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 14.000, 145.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0029'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 1.000, 410.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0029'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 8.000, 450.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0030'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 8.000, 450.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0030'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 1.000, 120.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0030'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 150.000, 3.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0030'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 12.000, 390.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0031'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 7.000, 1225.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0031'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 6.000, 640.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0032'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 6.000, 389.500, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0032'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 2.000, 890.000, 19.0),
  ((SELECT id FROM sales_orders WHERE reference='CMD-2026-0032'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 2.000, 232.750, 19.0);

-- -----------------------------------------------------------------------------
-- Factures de vente
-- Le statut inséré est DRAFT, ISSUED ou CANCELLED. Le passage à
-- PARTIALLY_PAID ou PAID est effectué par le déclencheur, à partir
-- des paiements confirmés insérés plus bas.
-- -----------------------------------------------------------------------------
INSERT INTO sales_invoices (invoice_number, customer_id, sales_order_id, invoice_date, due_date, status, subtotal_amount, tax_amount, total_amount, source) VALUES
  ('FAC-2026-0001', (SELECT id FROM customers WHERE reference='CLI-004'), NULL, (CURRENT_DATE - 15), (CURRENT_DATE + 45), 'ISSUED', 11785.000, 2239.150, 14024.150, 'SEED'),
  ('FAC-2026-0002', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (CURRENT_DATE - 125), (CURRENT_DATE - 80), 'ISSUED', 11794.000, 2240.860, 14034.860, 'SEED'),
  ('FAC-2026-0003', (SELECT id FROM customers WHERE reference='CLI-002'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0006'), (CURRENT_DATE - 15), (CURRENT_DATE + 30), 'ISSUED', 3945.000, 749.550, 4694.550, 'SEED'),
  ('FAC-2026-0004', (SELECT id FROM customers WHERE reference='CLI-005'), NULL, (CURRENT_DATE - 15), (CURRENT_DATE + 15), 'ISSUED', 12254.000, 2328.260, 14582.260, 'SEED'),
  ('FAC-2026-0005', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0010'), (CURRENT_DATE - 93), (CURRENT_DATE - 63), 'ISSUED', 2145.600, 407.664, 2553.264, 'SEED'),
  ('FAC-2026-0006', (SELECT id FROM customers WHERE reference='CLI-009'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0008'), (CURRENT_DATE - 5), (CURRENT_DATE + 25), 'ISSUED', 11118.000, 2112.420, 13230.420, 'SEED'),
  ('FAC-2026-0007', (SELECT id FROM customers WHERE reference='CLI-001'), NULL, (CURRENT_DATE - 115), (CURRENT_DATE - 85), 'ISSUED', 16190.000, 3076.100, 19266.100, 'SEED'),
  ('FAC-2026-0008', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0001'), (CURRENT_DATE - 24), (CURRENT_DATE + 6), 'ISSUED', 6555.000, 1245.450, 7800.450, 'SEED'),
  ('FAC-2026-0009', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0014'), (CURRENT_DATE - 2), (CURRENT_DATE + 43), 'DRAFT', 9210.000, 1749.900, 10959.900, 'SEED'),
  ('FAC-2026-0010', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (CURRENT_DATE - 116), (CURRENT_DATE - 71), 'ISSUED', 11794.000, 2240.860, 14034.860, 'SEED'),
  ('FAC-2026-0011', (SELECT id FROM customers WHERE reference='CLI-006'), NULL, (CURRENT_DATE - 4), (CURRENT_DATE + 11), 'ISSUED', 17696.000, 3362.240, 21058.240, 'SEED'),
  ('FAC-2026-0012', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0025'), (CURRENT_DATE - 173), (CURRENT_DATE - 143), 'CANCELLED', 6080.000, 1155.200, 7235.200, 'SEED'),
  ('FAC-2026-0013', (SELECT id FROM customers WHERE reference='CLI-005'), NULL, (CURRENT_DATE - 166), (CURRENT_DATE - 136), 'CANCELLED', 6224.000, 1182.560, 7406.560, 'SEED'),
  ('FAC-2026-0014', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0013'), (CURRENT_DATE - 158), (CURRENT_DATE - 113), 'ISSUED', 11794.000, 2240.860, 14034.860, 'SEED'),
  ('FAC-2026-0015', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0025'), (CURRENT_DATE - 54), (CURRENT_DATE - 24), 'ISSUED', 6080.000, 1155.200, 7235.200, 'SEED'),
  ('FAC-2026-0016', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0023'), (CURRENT_DATE - 107), (CURRENT_DATE - 77), 'ISSUED', 28008.000, 5321.520, 33329.520, 'SEED'),
  ('FAC-2026-0017', (SELECT id FROM customers WHERE reference='CLI-003'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0005'), (CURRENT_DATE - 47), (CURRENT_DATE - 17), 'ISSUED', 59876.500, 11376.535, 71253.035, 'SEED'),
  ('FAC-2026-0018', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0019'), (CURRENT_DATE - 6), (CURRENT_DATE + 39), 'DRAFT', 63554.000, 12075.260, 75629.260, 'SEED'),
  ('FAC-2026-0019', (SELECT id FROM customers WHERE reference='CLI-004'), NULL, (CURRENT_DATE - 14), (CURRENT_DATE + 46), 'ISSUED', 8530.000, 1620.700, 10150.700, 'SEED'),
  ('FAC-2026-0020', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0019'), (CURRENT_DATE - 103), (CURRENT_DATE - 58), 'ISSUED', 63554.000, 12075.260, 75629.260, 'SEED'),
  ('FAC-2026-0021', (SELECT id FROM customers WHERE reference='CLI-002'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0003'), (CURRENT_DATE - 97), (CURRENT_DATE - 52), 'ISSUED', 3072.000, 583.680, 3655.680, 'SEED'),
  ('FAC-2026-0022', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0014'), (CURRENT_DATE - 49), (CURRENT_DATE - 4), 'ISSUED', 9210.000, 1749.900, 10959.900, 'SEED'),
  ('FAC-2026-0023', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0028'), (CURRENT_DATE - 3), (CURRENT_DATE + 27), 'ISSUED', 3428.000, 651.320, 4079.320, 'SEED'),
  ('FAC-2026-0024', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0028'), (CURRENT_DATE - 71), (CURRENT_DATE - 41), 'ISSUED', 3428.000, 651.320, 4079.320, 'SEED'),
  ('FAC-2026-0025', (SELECT id FROM customers WHERE reference='CLI-005'), NULL, (CURRENT_DATE - 10), (CURRENT_DATE + 20), 'ISSUED', 1440.000, 273.600, 1713.600, 'SEED'),
  ('FAC-2026-0026', (SELECT id FROM customers WHERE reference='CLI-009'), NULL, (CURRENT_DATE - 79), (CURRENT_DATE - 49), 'ISSUED', 11684.000, 2219.960, 13903.960, 'SEED'),
  ('FAC-2026-0027', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0028'), (CURRENT_DATE - 21), (CURRENT_DATE + 9), 'ISSUED', 3428.000, 651.320, 4079.320, 'SEED'),
  ('FAC-2026-0028', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0019'), (CURRENT_DATE - 20), (CURRENT_DATE + 25), 'ISSUED', 63554.000, 12075.260, 75629.260, 'SEED'),
  ('FAC-2026-0029', (SELECT id FROM customers WHERE reference='CLI-003'), NULL, (CURRENT_DATE - 91), (CURRENT_DATE - 61), 'ISSUED', 35600.000, 6764.000, 42364.000, 'SEED'),
  ('FAC-2026-0030', (SELECT id FROM customers WHERE reference='CLI-002'), NULL, (CURRENT_DATE - 125), (CURRENT_DATE - 80), 'ISSUED', 5270.000, 1001.300, 6271.300, 'SEED'),
  ('FAC-2026-0031', (SELECT id FROM customers WHERE reference='CLI-008'), NULL, (CURRENT_DATE - 215), (CURRENT_DATE - 170), 'ISSUED', 20605.000, 3914.950, 24519.950, 'SEED'),
  ('FAC-2026-0032', (SELECT id FROM customers WHERE reference='CLI-008'), NULL, (CURRENT_DATE - 104), (CURRENT_DATE - 59), 'ISSUED', 4002.000, 760.380, 4762.380, 'SEED'),
  ('FAC-2026-0033', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0023'), (CURRENT_DATE - 103), (CURRENT_DATE - 73), 'ISSUED', 28008.000, 5321.520, 33329.520, 'SEED'),
  ('FAC-2026-0034', (SELECT id FROM customers WHERE reference='CLI-005'), NULL, (CURRENT_DATE - 5), (CURRENT_DATE + 25), 'ISSUED', 11220.000, 2131.800, 13351.800, 'SEED'),
  ('FAC-2026-0035', (SELECT id FROM customers WHERE reference='CLI-009'), (SELECT id FROM sales_orders WHERE reference='CMD-2026-0008'), (CURRENT_DATE - 2), (CURRENT_DATE + 28), 'DRAFT', 11118.000, 2112.420, 13230.420, 'SEED');

INSERT INTO sales_invoice_items (sales_invoice_id, product_id, description, quantity, unit_price, tax_rate) VALUES
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0001'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 4.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0001'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 7.000, 1150.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0001'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 50.000, 3.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0002'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 14.000, 390.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0002'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 4.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0002'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 8.000, 232.750, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0002'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 304.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0003'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 10.000, 370.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0003'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 2.000, 120.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0004'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 1.000, 2450.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0004'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 8.000, 1225.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0005'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 16.000, 74.100, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0005'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 8.000, 120.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0006'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 16.000, 370.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0006'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 18.000, 145.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0006'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 2.000, 1290.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0007'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 5.000, 480.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0007'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 320.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0007'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 5.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0007'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 7.000, 1290.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0008'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 6.000, 1092.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0009'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 6.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0009'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 6.000, 120.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0009'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 6.000, 245.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0009'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 6.000, 410.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0010'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 14.000, 390.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0010'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 4.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0010'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 8.000, 232.750, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0010'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 304.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0011'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 6.000, 456.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0011'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 2.000, 245.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0011'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 8.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0011'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 3.000, 2450.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0012'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 8.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0013'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 9.000, 120.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0013'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 7.000, 320.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0013'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 16.000, 137.750, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0013'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 200.000, 3.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0014'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 14.000, 390.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0014'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 4.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0014'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 8.000, 232.750, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0014'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 3.000, 304.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0015'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 8.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0016'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 7.000, 320.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0016'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 7.000, 3200.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0016'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 20.000, 145.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0016'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 6.000, 78.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0017'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 1.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0017'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 6.000, 8900.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0017'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 13.000, 370.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0017'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 2.000, 450.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0018'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 11.000, 114.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0018'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 7.000, 8900.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0019'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 8.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0019'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 1.000, 2450.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0020'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 11.000, 114.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0020'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 7.000, 8900.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0021'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 8.000, 304.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0021'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 1.000, 640.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0022'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 6.000, 760.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0022'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 6.000, 120.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0022'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 6.000, 245.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0022'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 6.000, 410.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0023'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 2.000, 114.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0023'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 1.000, 3200.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0024'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 2.000, 114.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0024'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 1.000, 3200.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0025'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 3.000, 480.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0026'), (SELECT id FROM products WHERE reference='PRD-016'), 'Formation utilisateurs', 11.000, 850.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0026'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 1.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0026'), (SELECT id FROM products WHERE reference='PRD-010'), 'Fauteuil de bureau ergonomique', 2.000, 722.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0027'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 2.000, 114.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0027'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 1.000, 3200.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0028'), (SELECT id FROM products WHERE reference='PRD-014'), 'Installation et paramétrage', 11.000, 114.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0028'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 7.000, 8900.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0029'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 4.000, 8900.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0030'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 5.000, 890.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0030'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 2.000, 410.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0031'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 1.000, 320.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0031'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 2.000, 8900.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0031'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 8.000, 245.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0031'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 150.000, 3.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0032'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 4.000, 640.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0032'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 14.000, 78.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0032'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 100.000, 3.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0033'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 7.000, 320.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0033'), (SELECT id FROM products WHERE reference='PRD-015'), 'Maintenance annuelle', 7.000, 3200.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0033'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 20.000, 145.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0033'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 6.000, 78.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0034'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 3.000, 1150.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0034'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 13.000, 390.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0034'), (SELECT id FROM products WHERE reference='PRD-017'), 'Hébergement cloud mensuel', 6.000, 450.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0035'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 16.000, 370.500, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0035'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 18.000, 145.000, 19.0),
  ((SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0035'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 2.000, 1290.000, 19.0);

-- -----------------------------------------------------------------------------
-- Paiements clients
-- Ces insertions déclenchent la mise à jour de paid_amount et du statut.
-- Un paiement PENDING est volontairement présent : il ne doit pas être compté.
-- -----------------------------------------------------------------------------
INSERT INTO customer_payments (reference, customer_id, sales_invoice_id, payment_date, amount, payment_method, status) VALUES
  ('REG-0001', (SELECT id FROM customers WHERE reference='CLI-004'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0001'), (CURRENT_DATE - 14), 14024.150, 'CARD', 'CONFIRMED'),
  ('REG-0002', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0002'), (CURRENT_DATE - 102), 2806.972, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0003', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0004'), (CURRENT_DATE - 10), 6562.017, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0004', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0004'), (CURRENT_DATE - 15), 8020.243, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0005', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0005'), (CURRENT_DATE - 85), 638.316, 'CASH', 'CONFIRMED'),
  ('REG-0006', (SELECT id FROM customers WHERE reference='CLI-009'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0006'), (CURRENT_DATE - 5), 6482.906, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0007', (SELECT id FROM customers WHERE reference='CLI-009'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0006'), (CURRENT_DATE - 3), 6747.514, 'CASH', 'CONFIRMED'),
  ('REG-0008', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0010'), (CURRENT_DATE - 100), 14034.860, 'CASH', 'CONFIRMED'),
  ('REG-0009', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0016'), (CURRENT_DATE - 105), 33329.520, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0010', (SELECT id FROM customers WHERE reference='CLI-003'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0017'), (CURRENT_DATE - 36), 71253.035, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0011', (SELECT id FROM customers WHERE reference='CLI-004'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0019'), (CURRENT_DATE - 14), 10150.700, 'CHECK', 'CONFIRMED'),
  ('REG-0012', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0020'), (CURRENT_DATE - 77), 29495.411, 'CHECK', 'CONFIRMED'),
  ('REG-0013', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0022'), (CURRENT_DATE - 35), 10959.900, 'CASH', 'CONFIRMED'),
  ('REG-0014', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0025'), (CURRENT_DATE - 7), 1713.600, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0015', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0027'), (CURRENT_DATE - 21), 4079.320, 'CHECK', 'CONFIRMED'),
  ('REG-0016', (SELECT id FROM customers WHERE reference='CLI-002'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0030'), (CURRENT_DATE - 109), 3135.650, 'CHECK', 'CONFIRMED'),
  ('REG-0017', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0031'), (CURRENT_DATE - 175), 13976.372, 'BANK_TRANSFER', 'CONFIRMED'),
  ('REG-0018', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0031'), (CURRENT_DATE - 214), 10543.578, 'CHECK', 'CONFIRMED'),
  ('REG-0019', (SELECT id FROM customers WHERE reference='CLI-008'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0032'), (CURRENT_DATE - 53), 4762.380, 'CARD', 'CONFIRMED'),
  ('REG-0020', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0033'), (CURRENT_DATE - 87), 19664.417, 'CHECK', 'CONFIRMED'),
  ('REG-0021', (SELECT id FROM customers WHERE reference='CLI-005'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0033'), (CURRENT_DATE - 96), 13665.103, 'CASH', 'CONFIRMED'),
  ('REG-0022', (SELECT id FROM customers WHERE reference='CLI-001'), (SELECT id FROM sales_invoices WHERE invoice_number='FAC-2026-0007'), (CURRENT_DATE - 2), 9633.050, 'CHECK', 'PENDING');

-- -----------------------------------------------------------------------------
-- Factures d'achat
-- Deux fournisseurs portent volontairement le même numéro de facture :
-- l'unicité est portée par le couple (fournisseur, numéro).
-- -----------------------------------------------------------------------------
INSERT INTO purchase_invoices (invoice_number, supplier_id, invoice_date, due_date, status, subtotal_amount, tax_amount, total_amount, source) VALUES
  ('F2026-101', (SELECT id FROM suppliers WHERE reference='FRS-004'), (CURRENT_DATE - 46), (CURRENT_DATE - 16), 'ISSUED', 17970.000, 3414.300, 21384.300, 'SEED'),
  ('F2026-102', (SELECT id FROM suppliers WHERE reference='FRS-006'), (CURRENT_DATE - 119), (CURRENT_DATE - 89), 'ISSUED', 24920.000, 4734.800, 29654.800, 'SEED'),
  ('F2026-103', (SELECT id FROM suppliers WHERE reference='FRS-002'), (CURRENT_DATE - 2), (CURRENT_DATE + 28), 'ISSUED', 27880.000, 5297.200, 33177.200, 'SEED'),
  ('F2026-104', (SELECT id FROM suppliers WHERE reference='FRS-006'), (CURRENT_DATE - 73), (CURRENT_DATE - 43), 'ISSUED', 70300.000, 13357.000, 83657.000, 'SEED'),
  ('F2026-105', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 10), (CURRENT_DATE + 35), 'ISSUED', 244920.000, 46534.800, 291454.800, 'SEED'),
  ('F2026-106', (SELECT id FROM suppliers WHERE reference='FRS-001'), (CURRENT_DATE - 27), (CURRENT_DATE + 3), 'ISSUED', 61100.000, 11609.000, 72709.000, 'SEED'),
  ('F2026-107', (SELECT id FROM suppliers WHERE reference='FRS-004'), (CURRENT_DATE - 75), (CURRENT_DATE - 45), 'ISSUED', 210014.000, 39902.660, 249916.660, 'SEED'),
  ('F2026-108', (SELECT id FROM suppliers WHERE reference='FRS-005'), (CURRENT_DATE - 64), (CURRENT_DATE - 49), 'ISSUED', 10416.000, 1979.040, 12395.040, 'SEED'),
  ('F2026-109', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 54), (CURRENT_DATE - 9), 'ISSUED', 72835.000, 13838.650, 86673.650, 'SEED'),
  ('F2026-110', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 105), (CURRENT_DATE - 60), 'ISSUED', 20042.000, 3807.980, 23849.980, 'SEED'),
  ('F2026-111', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 124), (CURRENT_DATE - 79), 'ISSUED', 210700.000, 40033.000, 250733.000, 'SEED'),
  ('F2026-112', (SELECT id FROM suppliers WHERE reference='FRS-005'), (CURRENT_DATE - 178), (CURRENT_DATE - 163), 'ISSUED', 13662.000, 2595.780, 16257.780, 'SEED'),
  ('F2026-113', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 130), (CURRENT_DATE - 85), 'ISSUED', 2016.000, 383.040, 2399.040, 'SEED'),
  ('F2026-114', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 152), (CURRENT_DATE - 107), 'ISSUED', 10440.000, 1983.600, 12423.600, 'SEED'),
  ('F2026-115', (SELECT id FROM suppliers WHERE reference='FRS-006'), (CURRENT_DATE - 17), (CURRENT_DATE + 13), 'ISSUED', 12253.000, 2328.070, 14581.070, 'SEED'),
  ('F2026-116', (SELECT id FROM suppliers WHERE reference='FRS-001'), (CURRENT_DATE - 17), (CURRENT_DATE + 13), 'ISSUED', 61540.000, 11692.600, 73232.600, 'SEED'),
  ('F2026-117', (SELECT id FROM suppliers WHERE reference='FRS-006'), (CURRENT_DATE - 163), (CURRENT_DATE - 133), 'ISSUED', 14620.000, 2777.800, 17397.800, 'SEED'),
  ('F2026-118', (SELECT id FROM suppliers WHERE reference='FRS-003'), (CURRENT_DATE - 134), (CURRENT_DATE - 89), 'ISSUED', 31300.000, 5947.000, 37247.000, 'SEED'),
  ('F2026-101', (SELECT id FROM suppliers WHERE reference='FRS-001'), (CURRENT_DATE - 40), (CURRENT_DATE - 10), 'ISSUED', 6600.000, 1254.000, 7854.000, 'SEED');

INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, description, quantity, unit_price, tax_rate) VALUES
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-101' AND s.reference='FRS-004'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 15.000, 430.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-101' AND s.reference='FRS-004'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 18.000, 640.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-102' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 15.000, 870.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-102' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 38.000, 285.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-102' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 20.000, 52.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-103' AND s.reference='FRS-002'), (SELECT id FROM products WHERE reference='PRD-006'), 'Switch réseau 24 ports', 34.000, 820.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-104' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 38.000, 1850.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-105' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 33.000, 7100.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-105' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 36.000, 295.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-106' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 37.000, 640.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-106' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 26.000, 870.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-106' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 8.000, 1850.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-107' AND s.reference='FRS-004'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 5.000, 330.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-107' AND s.reference='FRS-004'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 29.000, 7100.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-107' AND s.reference='FRS-004'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 28.000, 88.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-108' AND s.reference='FRS-005'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 6.000, 430.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-108' AND s.reference='FRS-005'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 26.000, 210.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-108' AND s.reference='FRS-005'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 27.000, 88.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-109' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 21.000, 295.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-109' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 35.000, 1850.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-109' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 9.000, 210.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-110' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 19.000, 870.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-110' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-012'), 'Ramette papier A4 80 g', 31.000, 52.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-110' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-008'), 'Câble réseau catégorie 6', 1000.000, 1.900, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-111' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-004'), 'Serveur rack 2U', 26.000, 7100.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-111' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 30.000, 870.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-112' AND s.reference='FRS-005'), (SELECT id FROM products WHERE reference='PRD-007'), 'Point d''accès Wi-Fi 6', 35.000, 330.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-112' AND s.reference='FRS-005'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 24.000, 88.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-113' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-013'), 'Cartouche toner noir', 12.000, 168.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-114' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-009'), 'Bureau ergonomique 160 cm', 12.000, 870.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-115' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-019'), 'Clavier et souris sans fil', 31.000, 88.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-115' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 6.000, 210.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-115' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 29.000, 285.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-116' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-001'), 'Ordinateur portable ProBook 15', 26.000, 1850.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-116' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 21.000, 640.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-117' AND s.reference='FRS-006'), (SELECT id FROM products WHERE reference='PRD-005'), 'Onduleur 1500 VA', 34.000, 430.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-118' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-002'), 'Écran 27 pouces UltraSharp', 36.000, 640.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-118' AND s.reference='FRS-003'), (SELECT id FROM products WHERE reference='PRD-018'), 'Licence bureautique annuelle', 28.000, 295.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-101' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-003'), 'Station d''accueil USB-C', 7.000, 210.000, 19.0),
  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-101' AND s.reference='FRS-001'), (SELECT id FROM products WHERE reference='PRD-020'), 'Disque SSD 1 To', 18.000, 285.000, 19.0);

-- -----------------------------------------------------------------------------
-- Paiements fournisseurs
-- -----------------------------------------------------------------------------
INSERT INTO supplier_payments (reference, supplier_id, purchase_invoice_id, payment_date, amount, payment_method, status) VALUES
  ('RGF-0001', (SELECT id FROM suppliers WHERE reference='FRS-004'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-101' AND s.reference='FRS-004'), (CURRENT_DATE - 40), 21384.300, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0002', (SELECT id FROM suppliers WHERE reference='FRS-006'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-104' AND s.reference='FRS-006'), (CURRENT_DATE - 60), 83657.000, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0003', (SELECT id FROM suppliers WHERE reference='FRS-001'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-106' AND s.reference='FRS-001'), (CURRENT_DATE - 13), 72709.000, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0004', (SELECT id FROM suppliers WHERE reference='FRS-004'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-107' AND s.reference='FRS-004'), (CURRENT_DATE - 66), 124958.330, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0005', (SELECT id FROM suppliers WHERE reference='FRS-005'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-108' AND s.reference='FRS-005'), (CURRENT_DATE - 49), 12395.040, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0006', (SELECT id FROM suppliers WHERE reference='FRS-003'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-109' AND s.reference='FRS-003'), (CURRENT_DATE - 46), 43336.825, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0007', (SELECT id FROM suppliers WHERE reference='FRS-003'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-110' AND s.reference='FRS-003'), (CURRENT_DATE - 102), 23849.980, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0008', (SELECT id FROM suppliers WHERE reference='FRS-005'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-112' AND s.reference='FRS-005'), (CURRENT_DATE - 160), 16257.780, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0009', (SELECT id FROM suppliers WHERE reference='FRS-003'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-114' AND s.reference='FRS-003'), (CURRENT_DATE - 139), 12423.600, 'BANK_TRANSFER', 'CONFIRMED'),
  ('RGF-0010', (SELECT id FROM suppliers WHERE reference='FRS-006'), (SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.invoice_number='F2026-117' AND s.reference='FRS-006'), (CURRENT_DATE - 151), 17397.800, 'BANK_TRANSFER', 'CONFIRMED');

-- -----------------------------------------------------------------------------
-- Conversation de démonstration et journal d'audit
-- -----------------------------------------------------------------------------
INSERT INTO conversations (user_id, title, status)
SELECT id, 'Suivi des impayés', 'ACTIVE' FROM users WHERE email = 'comptable@integrasys.tn';

INSERT INTO messages (conversation_id, sender, content)
SELECT c.id, 'USER', 'Quel est le montant total des factures impayées ?'
FROM conversations c WHERE c.title = 'Suivi des impayés';

INSERT INTO audit_logs (user_id, event_type, source, details)
SELECT id, 'LOGIN', 'UI', '{"ip":"127.0.0.1"}'::jsonb FROM users WHERE status = 'ACTIVE';

COMMIT;

-- =============================================================================
-- Contrôles rapides après chargement
-- =============================================================================
-- SELECT COUNT(*) FROM v_sales_invoices WHERE is_overdue;
-- SELECT SUM(remaining_amount) FROM v_sales_invoices WHERE is_unpaid;
-- SELECT * FROM v_sales_orders WHERE is_late ORDER BY days_late DESC;
-- SELECT * FROM v_product_sales WHERE month = date_trunc('month', CURRENT_DATE)::date
--   ORDER BY quantity_sold DESC LIMIT 5;
