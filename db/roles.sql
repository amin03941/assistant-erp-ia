-- =============================================================================
-- Assistant IA pour ERP générique — Rôles PostgreSQL
--
-- Crée les deux rôles utilisés par l'application :
--
--   erp_app        : connexion applicative, en écriture.
--                    Authentification, historique, actions confirmées.
--
--   erp_assistant  : connexion réservée aux requêtes issues du modèle.
--                    Lecture seule, accès limité aux vues métier,
--                    délai d'exécution plafonné.
--
-- Pourquoi cela suffit à interdire l'accès aux tables : une vue PostgreSQL
-- s'exécute avec les privilèges de son propriétaire. Accorder SELECT sur la
-- vue sans l'accorder sur les tables laisse donc la lecture des vues possible
-- et l'accès direct aux tables impossible.
--
-- Exécution :
--   psql -U postgres -d assistant_erp -v ON_ERROR_STOP=1 -f roles.sql
--
-- IMPORTANT : remplacer les deux mots de passe ci-dessous avant toute
-- utilisation en dehors du poste de développement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Création des rôles
-- -----------------------------------------------------------------------------

DROP ROLE IF EXISTS erp_assistant;
DROP ROLE IF EXISTS erp_app;
DROP ROLE IF EXISTS erp_readonly;

CREATE ROLE erp_readonly NOLOGIN;

CREATE ROLE erp_app LOGIN PASSWORD 'app_dev_2026';
CREATE ROLE erp_assistant LOGIN PASSWORD 'assistant_dev_2026' IN ROLE erp_readonly;

-- -----------------------------------------------------------------------------
-- 2. Garde-fous appliqués à la connexion de l'assistant
-- -----------------------------------------------------------------------------

-- Toute transaction est ouverte en lecture seule : INSERT, UPDATE, DELETE,
-- DROP et TRUNCATE échouent au niveau du serveur.
ALTER ROLE erp_assistant SET default_transaction_read_only = on;

-- Une requête trop coûteuse est interrompue après 3 secondes.
ALTER ROLE erp_assistant SET statement_timeout = '3s';

-- Une transaction laissée ouverte est fermée après 10 secondes.
ALTER ROLE erp_assistant SET idle_in_transaction_session_timeout = '10s';

-- -----------------------------------------------------------------------------
-- 3. Privilèges du rôle applicatif (écriture)
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO erp_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;

-- Volontairement omis : DELETE et TRUNCATE.
-- La règle « aucune suppression définitive » est ainsi appliquée par la base
-- elle-même, et non seulement par le code applicatif.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE ON TABLES TO erp_app;

-- -----------------------------------------------------------------------------
-- 4. Privilèges du rôle assistant (lecture seule, vues uniquement)
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO erp_readonly;

-- Aucun accès aux tables brutes.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM erp_readonly;

-- Seules les vues métier sont accessibles.
GRANT SELECT ON
    v_customers,
    v_suppliers,
    v_products,
    v_products_full,
    v_sales_orders,
    v_sales_order_items,
    v_sales_invoices,
    v_sales_invoice_items,
    v_customer_payments,
    v_purchase_invoices,
    v_purchase_invoice_items,
    v_supplier_payments,
    v_customer_balances,
    v_product_sales,
    v_monthly_revenue
TO erp_readonly;

-- Empêche la création d'objets dans le schéma par des rôles non privilégiés.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 5. Rappel
--
-- Le filtrage par rôle métier — un commercial ne doit pas voir
-- v_sales_invoices — reste assuré par le backend, à partir de la matrice de
-- permissions de l'annexe A. Le rôle PostgreSQL garantit un niveau différent :
-- qu'aucune écriture ni aucun accès aux tables brutes n'est possible, même si
-- cette matrice était contournée.
-- -----------------------------------------------------------------------------
