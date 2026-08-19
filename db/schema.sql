-- =============================================================================
-- Assistant IA pour l'interrogation d'un ERP générique
-- Schéma PostgreSQL — V1
-- Auteur : Mohamed Amin Kharrat — VirtualDev — 2026
-- Cible   : PostgreSQL 14+
-- Statut  : exécuté et validé sur PostgreSQL 16.14 (schéma, déclencheurs,
--           vues métier et rôle en lecture seule)
--
-- Conventions (voir SPEC_REFERENCE_V1.md) :
--   * montants en numeric(14,3) — dinar tunisien, millimes
--   * aucune suppression physique : statut ARCHIVED ou CANCELLED
--   * line_total est une colonne générée : quantity * unit_price (hors taxe)
--   * paid_amount est maintenu par déclencheur à partir des paiements CONFIRMED
--   * l'assistant n'interroge que les vues v_*, jamais les tables
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Utilitaires
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. Utilisateurs de l'assistant
-- =============================================================================

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name      varchar(150) NOT NULL,
    email          varchar(150) NOT NULL,
    password_hash  text         NOT NULL,
    role           varchar(30)  NOT NULL,
    status         varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    last_login_at  timestamptz,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_role_check   CHECK (role   IN ('ADMIN','SALES','ACCOUNTANT','MANAGER')),
    CONSTRAINT users_status_check CHECK (status IN ('ACTIVE','DISABLED'))
);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2. Données de référence
-- =============================================================================

CREATE TABLE customers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference          varchar(40)  NOT NULL,
    name               varchar(200) NOT NULL,
    tax_identifier     varchar(50),
    email              varchar(150),
    phone              varchar(30),
    address            text,
    payment_terms_days int          NOT NULL DEFAULT 30,
    status             varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT customers_reference_unique UNIQUE (reference),
    CONSTRAINT customers_status_check     CHECK (status IN ('ACTIVE','ARCHIVED')),
    CONSTRAINT customers_terms_check      CHECK (payment_terms_days BETWEEN 0 AND 365)
);

CREATE TRIGGER customers_set_updated_at
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE suppliers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference          varchar(40)  NOT NULL,
    name               varchar(200) NOT NULL,
    tax_identifier     varchar(50),
    email              varchar(150),
    phone              varchar(30),
    address            text,
    payment_terms_days int          NOT NULL DEFAULT 30,
    status             varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT suppliers_reference_unique UNIQUE (reference),
    CONSTRAINT suppliers_status_check     CHECK (status IN ('ACTIVE','ARCHIVED')),
    CONSTRAINT suppliers_terms_check      CHECK (payment_terms_days BETWEEN 0 AND 365)
);

CREATE TRIGGER suppliers_set_updated_at
    BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference      varchar(50)  NOT NULL,
    name           varchar(200) NOT NULL,
    description    text,
    category       varchar(100),
    product_type   varchar(20)  NOT NULL DEFAULT 'GOOD',
    unit           varchar(30)  NOT NULL DEFAULT 'unité',
    sale_price     numeric(14,3) NOT NULL DEFAULT 0,
    purchase_price numeric(14,3) NOT NULL DEFAULT 0,
    tax_rate       numeric(5,2)  NOT NULL DEFAULT 19.00,
    stock_quantity numeric(14,3) NOT NULL DEFAULT 0,
    status         varchar(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT products_reference_unique UNIQUE (reference),
    CONSTRAINT products_type_check   CHECK (product_type IN ('GOOD','SERVICE')),
    CONSTRAINT products_status_check  CHECK (status IN ('ACTIVE','ARCHIVED')),
    CONSTRAINT products_prices_check  CHECK (sale_price >= 0 AND purchase_price >= 0),
    CONSTRAINT products_tax_check     CHECK (tax_rate BETWEEN 0 AND 100)
);

CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 3. Flux des ventes
-- =============================================================================

CREATE TABLE sales_orders (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference              varchar(50) NOT NULL,
    customer_id            uuid        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    order_date             date        NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date date,
    status                 varchar(30) NOT NULL DEFAULT 'DRAFT',
    subtotal_amount        numeric(14,3) NOT NULL DEFAULT 0,
    tax_amount             numeric(14,3) NOT NULL DEFAULT 0,
    total_amount           numeric(14,3) NOT NULL DEFAULT 0,
    notes                  text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_orders_reference_unique UNIQUE (reference),
    CONSTRAINT sales_orders_status_check CHECK (status IN ('DRAFT','CONFIRMED','DELIVERED','CANCELLED')),
    CONSTRAINT sales_orders_amounts_check CHECK (subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0),
    CONSTRAINT sales_orders_delivery_check CHECK (expected_delivery_date IS NULL OR expected_delivery_date >= order_date)
);

CREATE TRIGGER sales_orders_set_updated_at
    BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sales_order_items (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id     uuid REFERENCES products(id) ON DELETE RESTRICT,
    description    text NOT NULL,
    quantity       numeric(14,3) NOT NULL,
    unit_price     numeric(14,3) NOT NULL,
    tax_rate       numeric(5,2)  NOT NULL DEFAULT 19.00,
    line_total     numeric(14,3) GENERATED ALWAYS AS (round(quantity * unit_price, 3)) STORED,
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT sales_order_items_price_check    CHECK (unit_price >= 0),
    CONSTRAINT sales_order_items_tax_check      CHECK (tax_rate BETWEEN 0 AND 100)
);

CREATE TABLE sales_invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number  varchar(50) NOT NULL,
    customer_id     uuid        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sales_order_id  uuid        REFERENCES sales_orders(id) ON DELETE SET NULL,
    invoice_date    date        NOT NULL DEFAULT CURRENT_DATE,
    due_date        date        NOT NULL,
    status          varchar(30) NOT NULL DEFAULT 'DRAFT',
    subtotal_amount numeric(14,3) NOT NULL DEFAULT 0,
    tax_amount      numeric(14,3) NOT NULL DEFAULT 0,
    total_amount    numeric(14,3) NOT NULL DEFAULT 0,
    paid_amount     numeric(14,3) NOT NULL DEFAULT 0,   -- maintenu par déclencheur
    source          varchar(20) NOT NULL DEFAULT 'MANUAL',
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_invoices_number_unique UNIQUE (invoice_number),
    CONSTRAINT sales_invoices_status_check  CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','CANCELLED')),
    CONSTRAINT sales_invoices_source_check  CHECK (source IN ('MANUAL','IMPORT','SEED')),
    CONSTRAINT sales_invoices_amounts_check CHECK (subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0),
    CONSTRAINT sales_invoices_due_check     CHECK (due_date >= invoice_date)
);

CREATE TRIGGER sales_invoices_set_updated_at
    BEFORE UPDATE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sales_invoice_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_invoice_id uuid NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id       uuid REFERENCES products(id) ON DELETE RESTRICT,
    description      text NOT NULL,
    quantity         numeric(14,3) NOT NULL,
    unit_price       numeric(14,3) NOT NULL,
    tax_rate         numeric(5,2)  NOT NULL DEFAULT 19.00,
    line_total       numeric(14,3) GENERATED ALWAYS AS (round(quantity * unit_price, 3)) STORED,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_invoice_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT sales_invoice_items_price_check    CHECK (unit_price >= 0),
    CONSTRAINT sales_invoice_items_tax_check      CHECK (tax_rate BETWEEN 0 AND 100)
);

CREATE TABLE customer_payments (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference          varchar(50) NOT NULL,
    customer_id        uuid        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sales_invoice_id   uuid        NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    payment_date       date        NOT NULL DEFAULT CURRENT_DATE,
    amount             numeric(14,3) NOT NULL,
    payment_method     varchar(30) NOT NULL,
    external_reference varchar(100),
    status             varchar(20) NOT NULL DEFAULT 'CONFIRMED',
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT customer_payments_reference_unique UNIQUE (reference),
    CONSTRAINT customer_payments_amount_check CHECK (amount > 0),
    CONSTRAINT customer_payments_status_check CHECK (status IN ('PENDING','CONFIRMED','FAILED')),
    CONSTRAINT customer_payments_method_check CHECK (payment_method IN ('CASH','BANK_TRANSFER','CHECK','CARD','OTHER'))
);


-- =============================================================================
-- 4. Flux des achats
-- =============================================================================

CREATE TABLE purchase_invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number  varchar(100) NOT NULL,
    supplier_id     uuid         NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_date    date         NOT NULL DEFAULT CURRENT_DATE,
    due_date        date         NOT NULL,
    status          varchar(30)  NOT NULL DEFAULT 'DRAFT',
    subtotal_amount numeric(14,3) NOT NULL DEFAULT 0,
    tax_amount      numeric(14,3) NOT NULL DEFAULT 0,
    total_amount    numeric(14,3) NOT NULL DEFAULT 0,
    paid_amount     numeric(14,3) NOT NULL DEFAULT 0,   -- maintenu par déclencheur
    source          varchar(20)  NOT NULL DEFAULT 'MANUAL',
    notes           text,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    -- unicité par fournisseur : deux fournisseurs peuvent émettre le même numéro
    CONSTRAINT purchase_invoices_number_unique UNIQUE (supplier_id, invoice_number),
    CONSTRAINT purchase_invoices_status_check  CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','CANCELLED')),
    CONSTRAINT purchase_invoices_source_check  CHECK (source IN ('MANUAL','IMPORT','SEED')),
    CONSTRAINT purchase_invoices_amounts_check CHECK (subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0),
    CONSTRAINT purchase_invoices_due_check     CHECK (due_date >= invoice_date)
);

CREATE TRIGGER purchase_invoices_set_updated_at
    BEFORE UPDATE ON purchase_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_invoice_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_invoice_id uuid NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    product_id          uuid REFERENCES products(id) ON DELETE RESTRICT,
    description         text NOT NULL,
    quantity            numeric(14,3) NOT NULL,
    unit_price          numeric(14,3) NOT NULL,
    tax_rate            numeric(5,2)  NOT NULL DEFAULT 19.00,
    line_total          numeric(14,3) GENERATED ALWAYS AS (round(quantity * unit_price, 3)) STORED,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT purchase_invoice_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT purchase_invoice_items_price_check    CHECK (unit_price >= 0),
    CONSTRAINT purchase_invoice_items_tax_check      CHECK (tax_rate BETWEEN 0 AND 100)
);

CREATE TABLE supplier_payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference           varchar(50) NOT NULL,
    supplier_id         uuid        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    purchase_invoice_id uuid        NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
    payment_date        date        NOT NULL DEFAULT CURRENT_DATE,
    amount              numeric(14,3) NOT NULL,
    payment_method      varchar(30) NOT NULL,
    external_reference  varchar(100),
    status              varchar(20) NOT NULL DEFAULT 'CONFIRMED',
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT supplier_payments_reference_unique UNIQUE (reference),
    CONSTRAINT supplier_payments_amount_check CHECK (amount > 0),
    CONSTRAINT supplier_payments_status_check CHECK (status IN ('PENDING','CONFIRMED','FAILED')),
    CONSTRAINT supplier_payments_method_check CHECK (payment_method IN ('CASH','BANK_TRANSFER','CHECK','CARD','OTHER'))
);


-- =============================================================================
-- 5. Conversations, assistant, documents, audit
-- =============================================================================

CREATE TABLE conversations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title      varchar(200),
    status     varchar(20) NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conversations_status_check CHECK (status IN ('ACTIVE','ARCHIVED'))
);

CREATE TRIGGER conversations_set_updated_at
    BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender          varchar(20) NOT NULL,
    content         text        NOT NULL,
    structured_data jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_sender_check CHECK (sender IN ('USER','ASSISTANT','SYSTEM'))
);

CREATE TABLE documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid         REFERENCES conversations(id) ON DELETE SET NULL,
    message_id      uuid         REFERENCES messages(id) ON DELETE SET NULL,   -- nullable : téléversement avant persistance du message
    uploaded_by     uuid         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    file_name       varchar(255) NOT NULL,
    storage_path    text         NOT NULL,
    mime_type       varchar(100) NOT NULL,
    size_bytes      bigint       NOT NULL,
    file_hash       varchar(128) NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT documents_size_check CHECK (size_bytes > 0 AND size_bytes <= 10485760),  -- 10 Mo
    CONSTRAINT documents_mime_check CHECK (mime_type IN ('application/pdf','image/png','image/jpeg'))
);

CREATE TABLE assistant_requests (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id       uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_message_id       uuid        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    response_message_id   uuid        REFERENCES messages(id) ON DELETE SET NULL,
    user_id               uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_at_request       varchar(30) NOT NULL,   -- rôle effectif au moment de la demande
    request_type          varchar(20) NOT NULL,
    intent                varchar(100),
    query_spec            jsonb,      -- spécification produite par le modèle
    generated_sql         text,       -- SQL construit par le backend, journalisé
    action_payload        jsonb,      -- action structurée validée, source de vérité à la confirmation
    confirmation_required boolean     NOT NULL DEFAULT false,
    status                varchar(30) NOT NULL DEFAULT 'PENDING',
    refusal_reason        text,
    error_message         text,
    row_count             int,
    duration_ms           int,
    expires_at            timestamptz,
    confirmed_at          timestamptz,
    executed_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assistant_requests_type_check CHECK (request_type IN ('QUERY','ACTION','INVOICE_IMPORT')),
    CONSTRAINT assistant_requests_role_check CHECK (role_at_request IN ('ADMIN','SALES','ACCOUNTANT','MANAGER')),
    CONSTRAINT assistant_requests_status_check CHECK (status IN
        ('PENDING','AWAITING_CONFIRMATION','EXECUTED','REFUSED','FAILED','EXPIRED','CANCELLED')),
    CONSTRAINT assistant_requests_confirm_check CHECK (
        confirmation_required = false OR expires_at IS NOT NULL
    )
);

CREATE TABLE invoice_imports (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id               uuid        NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    assistant_request_id      uuid        REFERENCES assistant_requests(id) ON DELETE SET NULL,
    reviewed_by               uuid        REFERENCES users(id) ON DELETE RESTRICT,
    invoice_type              varchar(20) NOT NULL,
    extracted_data            jsonb       NOT NULL,
    field_confidence          jsonb,      -- { "invoice_number": "HIGH", "total_amount": "LOW", ... }
    needs_review              boolean     NOT NULL DEFAULT true,
    matched_customer_id       uuid        REFERENCES customers(id) ON DELETE SET NULL,
    matched_supplier_id       uuid        REFERENCES suppliers(id) ON DELETE SET NULL,
    created_sales_invoice_id  uuid        REFERENCES sales_invoices(id) ON DELETE SET NULL,
    created_purchase_invoice_id uuid      REFERENCES purchase_invoices(id) ON DELETE SET NULL,
    status                    varchar(30) NOT NULL DEFAULT 'EXTRACTING',
    error_message             text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoice_imports_type_check   CHECK (invoice_type IN ('SALES','PURCHASE')),
    CONSTRAINT invoice_imports_status_check CHECK (status IN
        ('EXTRACTING','NEEDS_REVIEW','CONFIRMED','REJECTED','FAILED','DUPLICATE')),
    -- un import est soit client, soit fournisseur, jamais les deux
    CONSTRAINT invoice_imports_partner_check CHECK (
        NOT (matched_customer_id IS NOT NULL AND matched_supplier_id IS NOT NULL)
    ),
    CONSTRAINT invoice_imports_created_check CHECK (
        NOT (created_sales_invoice_id IS NOT NULL AND created_purchase_invoice_id IS NOT NULL)
    )
);

CREATE TRIGGER invoice_imports_set_updated_at
    BEFORE UPDATE ON invoice_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_logs (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid        REFERENCES users(id) ON DELETE SET NULL,   -- nullable : événements système
    assistant_request_id uuid        REFERENCES assistant_requests(id) ON DELETE SET NULL,
    event_type           varchar(50) NOT NULL,
    entity_type          varchar(50),
    entity_id            uuid,
    old_values           jsonb,
    new_values           jsonb,
    source               varchar(20) NOT NULL DEFAULT 'CHAT',
    ip_address           inet,
    details              jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_source_check CHECK (source IN ('CHAT','UI','SYSTEM'))
);


-- =============================================================================
-- 6. Maintien automatique de paid_amount et du statut des factures
-- =============================================================================

CREATE OR REPLACE FUNCTION recompute_sales_invoice_paid(p_invoice_id uuid)
RETURNS void AS $$
DECLARE
    v_paid   numeric(14,3);
    v_total  numeric(14,3);
    v_status varchar(30);
BEGIN
    IF p_invoice_id IS NULL THEN
        RETURN;
    END IF;

    SELECT total_amount, status INTO v_total, v_status
    FROM sales_invoices WHERE id = p_invoice_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM customer_payments
    WHERE sales_invoice_id = p_invoice_id AND status = 'CONFIRMED';

    UPDATE sales_invoices
       SET paid_amount = v_paid,
           status = CASE
               WHEN v_status IN ('DRAFT','CANCELLED') THEN v_status
               WHEN v_paid >= v_total AND v_total > 0  THEN 'PAID'
               WHEN v_paid > 0                         THEN 'PARTIALLY_PAID'
               ELSE 'ISSUED'
           END
     WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sync_sales_invoice_paid() RETURNS trigger AS $$
BEGIN
    IF TG_OP IN ('UPDATE','DELETE') THEN
        PERFORM recompute_sales_invoice_paid(OLD.sales_invoice_id);
    END IF;
    IF TG_OP IN ('INSERT','UPDATE') THEN
        PERFORM recompute_sales_invoice_paid(NEW.sales_invoice_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_payments_sync
    AFTER INSERT OR UPDATE OR DELETE ON customer_payments
    FOR EACH ROW EXECUTE FUNCTION trg_sync_sales_invoice_paid();


CREATE OR REPLACE FUNCTION recompute_purchase_invoice_paid(p_invoice_id uuid)
RETURNS void AS $$
DECLARE
    v_paid   numeric(14,3);
    v_total  numeric(14,3);
    v_status varchar(30);
BEGIN
    IF p_invoice_id IS NULL THEN
        RETURN;
    END IF;

    SELECT total_amount, status INTO v_total, v_status
    FROM purchase_invoices WHERE id = p_invoice_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM supplier_payments
    WHERE purchase_invoice_id = p_invoice_id AND status = 'CONFIRMED';

    UPDATE purchase_invoices
       SET paid_amount = v_paid,
           status = CASE
               WHEN v_status IN ('DRAFT','CANCELLED') THEN v_status
               WHEN v_paid >= v_total AND v_total > 0  THEN 'PAID'
               WHEN v_paid > 0                         THEN 'PARTIALLY_PAID'
               ELSE 'ISSUED'
           END
     WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sync_purchase_invoice_paid() RETURNS trigger AS $$
BEGIN
    IF TG_OP IN ('UPDATE','DELETE') THEN
        PERFORM recompute_purchase_invoice_paid(OLD.purchase_invoice_id);
    END IF;
    IF TG_OP IN ('INSERT','UPDATE') THEN
        PERFORM recompute_purchase_invoice_paid(NEW.purchase_invoice_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_payments_sync
    AFTER INSERT OR UPDATE OR DELETE ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION trg_sync_purchase_invoice_paid();


-- Cohérence : le client du paiement doit être celui de la facture
CREATE OR REPLACE FUNCTION trg_check_payment_customer() RETURNS trigger AS $$
DECLARE v_customer uuid;
BEGIN
    SELECT customer_id INTO v_customer FROM sales_invoices WHERE id = NEW.sales_invoice_id;
    IF v_customer IS DISTINCT FROM NEW.customer_id THEN
        RAISE EXCEPTION 'Le client du paiement ne correspond pas au client de la facture';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_payments_check_customer
    BEFORE INSERT OR UPDATE ON customer_payments
    FOR EACH ROW EXECUTE FUNCTION trg_check_payment_customer();

CREATE OR REPLACE FUNCTION trg_check_payment_supplier() RETURNS trigger AS $$
DECLARE v_supplier uuid;
BEGIN
    SELECT supplier_id INTO v_supplier FROM purchase_invoices WHERE id = NEW.purchase_invoice_id;
    IF v_supplier IS DISTINCT FROM NEW.supplier_id THEN
        RAISE EXCEPTION 'Le fournisseur du paiement ne correspond pas à celui de la facture';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_payments_check_supplier
    BEFORE INSERT OR UPDATE ON supplier_payments
    FOR EACH ROW EXECUTE FUNCTION trg_check_payment_supplier();


-- =============================================================================
-- 7. Index
-- =============================================================================

CREATE INDEX idx_sales_orders_customer        ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_status          ON sales_orders(status);
CREATE INDEX idx_sales_orders_delivery        ON sales_orders(expected_delivery_date);
CREATE INDEX idx_sales_order_items_order      ON sales_order_items(sales_order_id);
CREATE INDEX idx_sales_order_items_product    ON sales_order_items(product_id);

CREATE INDEX idx_sales_invoices_customer      ON sales_invoices(customer_id);
CREATE INDEX idx_sales_invoices_order         ON sales_invoices(sales_order_id);
CREATE INDEX idx_sales_invoices_status        ON sales_invoices(status);
CREATE INDEX idx_sales_invoices_due           ON sales_invoices(due_date);
CREATE INDEX idx_sales_invoices_date          ON sales_invoices(invoice_date);
CREATE INDEX idx_sales_invoice_items_invoice  ON sales_invoice_items(sales_invoice_id);
CREATE INDEX idx_sales_invoice_items_product  ON sales_invoice_items(product_id);

CREATE INDEX idx_customer_payments_invoice    ON customer_payments(sales_invoice_id);
CREATE INDEX idx_customer_payments_customer   ON customer_payments(customer_id);
CREATE INDEX idx_customer_payments_date       ON customer_payments(payment_date);

CREATE INDEX idx_purchase_invoices_supplier   ON purchase_invoices(supplier_id);
CREATE INDEX idx_purchase_invoices_status     ON purchase_invoices(status);
CREATE INDEX idx_purchase_invoices_due        ON purchase_invoices(due_date);
CREATE INDEX idx_purchase_invoice_items_inv   ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX idx_supplier_payments_invoice    ON supplier_payments(purchase_invoice_id);
CREATE INDEX idx_supplier_payments_supplier   ON supplier_payments(supplier_id);

CREATE INDEX idx_conversations_user           ON conversations(user_id);
CREATE INDEX idx_messages_conversation        ON messages(conversation_id, created_at);
CREATE INDEX idx_documents_hash               ON documents(file_hash);
CREATE INDEX idx_assistant_requests_conv      ON assistant_requests(conversation_id);
CREATE INDEX idx_assistant_requests_user      ON assistant_requests(user_id, created_at);
CREATE INDEX idx_assistant_requests_status    ON assistant_requests(status);
CREATE INDEX idx_invoice_imports_document     ON invoice_imports(document_id);
CREATE INDEX idx_audit_logs_user              ON audit_logs(user_id, created_at);
CREATE INDEX idx_audit_logs_event             ON audit_logs(event_type, created_at);

-- Recherche insensible à la casse sur les noms (« client Alpha »)
CREATE INDEX idx_customers_name_lower ON customers(lower(name));
CREATE INDEX idx_suppliers_name_lower ON suppliers(lower(name));
CREATE INDEX idx_products_name_lower  ON products(lower(name));


-- =============================================================================
-- 8. Vues métier — seule surface exposée à l'assistant
--    Les définitions de « impayé », « en retard », « reste à payer » sont ici
--    et nulle part ailleurs.
-- =============================================================================

CREATE VIEW v_customers AS
SELECT c.id, c.reference, c.name, c.tax_identifier, c.email, c.phone, c.address,
       c.payment_terms_days, c.status, c.created_at
FROM customers c;

CREATE VIEW v_suppliers AS
SELECT s.id, s.reference, s.name, s.tax_identifier, s.email, s.phone, s.address,
       s.payment_terms_days, s.status, s.created_at
FROM suppliers s;

-- Sans purchase_price : la marge n'est pas visible par le rôle SALES
CREATE VIEW v_products AS
SELECT p.id, p.reference, p.name, p.description, p.category, p.product_type,
       p.unit, p.sale_price, p.tax_rate, p.stock_quantity, p.status
FROM products p;

-- Avec purchase_price : réservée à ACCOUNTANT et MANAGER
CREATE VIEW v_products_full AS
SELECT p.id, p.reference, p.name, p.description, p.category, p.product_type,
       p.unit, p.sale_price, p.purchase_price, p.tax_rate, p.stock_quantity, p.status
FROM products p;

CREATE VIEW v_sales_orders AS
SELECT o.id,
       o.reference,
       c.reference AS customer_reference,
       c.name      AS customer_name,
       o.order_date,
       o.expected_delivery_date,
       o.status,
       o.subtotal_amount,
       o.tax_amount,
       o.total_amount,
       (o.status = 'CONFIRMED'
        AND o.expected_delivery_date IS NOT NULL
        AND o.expected_delivery_date < CURRENT_DATE) AS is_late,
       CASE WHEN o.status = 'CONFIRMED'
             AND o.expected_delivery_date IS NOT NULL
             AND o.expected_delivery_date < CURRENT_DATE
            THEN (CURRENT_DATE - o.expected_delivery_date)
            ELSE 0 END AS days_late,
       o.notes
FROM sales_orders o
JOIN customers c ON c.id = o.customer_id;

CREATE VIEW v_sales_order_items AS
SELECT i.id,
       o.reference AS order_reference,
       c.name      AS customer_name,
       p.reference AS product_reference,
       p.name      AS product_name,
       i.description,
       i.quantity,
       i.unit_price,
       i.tax_rate,
       i.line_total
FROM sales_order_items i
JOIN sales_orders o ON o.id = i.sales_order_id
JOIN customers    c ON c.id = o.customer_id
LEFT JOIN products p ON p.id = i.product_id;

CREATE VIEW v_sales_invoices AS
SELECT f.id,
       f.invoice_number,
       c.reference AS customer_reference,
       c.name      AS customer_name,
       o.reference AS order_reference,
       f.invoice_date,
       f.due_date,
       f.status,
       f.subtotal_amount,
       f.tax_amount,
       f.total_amount,
       f.paid_amount,
       (f.total_amount - f.paid_amount) AS remaining_amount,
       (f.status IN ('ISSUED','PARTIALLY_PAID') AND f.paid_amount < f.total_amount) AS is_unpaid,
       (f.status IN ('ISSUED','PARTIALLY_PAID')
        AND f.paid_amount < f.total_amount
        AND f.due_date < CURRENT_DATE) AS is_overdue,
       CASE WHEN f.status IN ('ISSUED','PARTIALLY_PAID')
             AND f.paid_amount < f.total_amount
             AND f.due_date < CURRENT_DATE
            THEN (CURRENT_DATE - f.due_date)
            ELSE 0 END AS days_overdue,
       f.source
FROM sales_invoices f
JOIN customers c ON c.id = f.customer_id
LEFT JOIN sales_orders o ON o.id = f.sales_order_id;

CREATE VIEW v_sales_invoice_items AS
SELECT i.id,
       f.invoice_number,
       c.name      AS customer_name,
       p.reference AS product_reference,
       p.name      AS product_name,
       i.description,
       i.quantity,
       i.unit_price,
       i.tax_rate,
       i.line_total,
       f.invoice_date,
       f.status    AS invoice_status
FROM sales_invoice_items i
JOIN sales_invoices f ON f.id = i.sales_invoice_id
JOIN customers      c ON c.id = f.customer_id
LEFT JOIN products  p ON p.id = i.product_id;

CREATE VIEW v_customer_payments AS
SELECT pm.id,
       pm.reference,
       c.name AS customer_name,
       f.invoice_number,
       pm.payment_date,
       pm.amount,
       pm.payment_method,
       pm.status,
       pm.external_reference
FROM customer_payments pm
JOIN customers      c ON c.id = pm.customer_id
JOIN sales_invoices f ON f.id = pm.sales_invoice_id;

CREATE VIEW v_purchase_invoices AS
SELECT f.id,
       f.invoice_number,
       s.reference AS supplier_reference,
       s.name      AS supplier_name,
       f.invoice_date,
       f.due_date,
       f.status,
       f.subtotal_amount,
       f.tax_amount,
       f.total_amount,
       f.paid_amount,
       (f.total_amount - f.paid_amount) AS remaining_amount,
       (f.status IN ('ISSUED','PARTIALLY_PAID') AND f.paid_amount < f.total_amount) AS is_unpaid,
       (f.status IN ('ISSUED','PARTIALLY_PAID')
        AND f.paid_amount < f.total_amount
        AND f.due_date < CURRENT_DATE) AS is_overdue,
       CASE WHEN f.status IN ('ISSUED','PARTIALLY_PAID')
             AND f.paid_amount < f.total_amount
             AND f.due_date < CURRENT_DATE
            THEN (CURRENT_DATE - f.due_date)
            ELSE 0 END AS days_overdue,
       f.source
FROM purchase_invoices f
JOIN suppliers s ON s.id = f.supplier_id;

CREATE VIEW v_purchase_invoice_items AS
SELECT i.id,
       f.invoice_number,
       s.name      AS supplier_name,
       p.reference AS product_reference,
       p.name      AS product_name,
       i.description,
       i.quantity,
       i.unit_price,
       i.tax_rate,
       i.line_total,
       f.invoice_date
FROM purchase_invoice_items i
JOIN purchase_invoices f ON f.id = i.purchase_invoice_id
JOIN suppliers          s ON s.id = f.supplier_id
LEFT JOIN products      p ON p.id = i.product_id;

CREATE VIEW v_supplier_payments AS
SELECT pm.id,
       pm.reference,
       s.name AS supplier_name,
       f.invoice_number,
       pm.payment_date,
       pm.amount,
       pm.payment_method,
       pm.status,
       pm.external_reference
FROM supplier_payments pm
JOIN suppliers         s ON s.id = pm.supplier_id
JOIN purchase_invoices f ON f.id = pm.purchase_invoice_id;

-- Encours par client
CREATE VIEW v_customer_balances AS
SELECT c.id          AS customer_id,
       c.reference   AS customer_reference,
       c.name        AS customer_name,
       COUNT(f.id) FILTER (WHERE f.status IN ('ISSUED','PARTIALLY_PAID')
                             AND f.paid_amount < f.total_amount)          AS unpaid_invoice_count,
       COALESCE(SUM(f.total_amount - f.paid_amount)
                FILTER (WHERE f.status IN ('ISSUED','PARTIALLY_PAID')
                          AND f.paid_amount < f.total_amount), 0)         AS outstanding_amount,
       COALESCE(SUM(f.total_amount - f.paid_amount)
                FILTER (WHERE f.status IN ('ISSUED','PARTIALLY_PAID')
                          AND f.paid_amount < f.total_amount
                          AND f.due_date < CURRENT_DATE), 0)              AS overdue_amount
FROM customers c
LEFT JOIN sales_invoices f ON f.customer_id = c.id
GROUP BY c.id, c.reference, c.name;

-- Ventes par produit et par mois (« produit le plus vendu ce mois-ci »)
CREATE VIEW v_product_sales AS
SELECT p.id        AS product_id,
       p.reference AS product_reference,
       p.name      AS product_name,
       p.category,
       date_trunc('month', f.invoice_date)::date AS month,
       SUM(i.quantity)   AS quantity_sold,
       SUM(i.line_total) AS revenue_excl_tax
FROM sales_invoice_items i
JOIN sales_invoices f ON f.id = i.sales_invoice_id
JOIN products       p ON p.id = i.product_id
WHERE f.status <> 'CANCELLED'
GROUP BY p.id, p.reference, p.name, p.category, date_trunc('month', f.invoice_date);

-- Chiffre d'affaires mensuel, hors taxe, factures non annulées
CREATE VIEW v_monthly_revenue AS
SELECT date_trunc('month', f.invoice_date)::date AS month,
       COUNT(*)                  AS invoice_count,
       SUM(f.subtotal_amount)    AS revenue_excl_tax,
       SUM(f.total_amount)       AS revenue_incl_tax,
       SUM(f.paid_amount)        AS collected_amount
FROM sales_invoices f
WHERE f.status <> 'CANCELLED'
GROUP BY date_trunc('month', f.invoice_date);

COMMIT;


-- =============================================================================
-- 9. Rôle PostgreSQL en lecture seule — seconde barrière de sécurité
--
--    L'application utilise DEUX connexions distinctes :
--      * erp_app       : écritures (authentification, historique, actions confirmées)
--      * erp_assistant : lecture seule, réservée aux requêtes issues du modèle
--
--    Les vues appartiennent au propriétaire du schéma. Par défaut, une vue
--    PostgreSQL s'exécute avec les privilèges de son propriétaire : accorder
--    SELECT sur la vue sans l'accorder sur les tables suffit donc à interdire
--    tout accès direct aux tables brutes.
--
--    Adapter le mot de passe et le nom de la base avant exécution.
-- =============================================================================

-- CREATE ROLE erp_readonly NOLOGIN;
-- CREATE ROLE erp_assistant LOGIN PASSWORD 'a_definir_dans_env' IN ROLE erp_readonly;
--
-- ALTER ROLE erp_assistant SET default_transaction_read_only = on;
-- ALTER ROLE erp_assistant SET statement_timeout = '3s';
-- ALTER ROLE erp_assistant SET idle_in_transaction_session_timeout = '10s';
--
-- REVOKE ALL ON SCHEMA public FROM PUBLIC;
-- GRANT USAGE ON SCHEMA public TO erp_readonly;
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM erp_readonly;
--
-- GRANT SELECT ON
--     v_customers, v_suppliers, v_products, v_products_full,
--     v_sales_orders, v_sales_order_items,
--     v_sales_invoices, v_sales_invoice_items, v_customer_payments,
--     v_purchase_invoices, v_purchase_invoice_items, v_supplier_payments,
--     v_customer_balances, v_product_sales, v_monthly_revenue
-- TO erp_readonly;
--
-- Le filtrage par rôle applicatif (SALES ne voit pas v_sales_invoices) reste
-- assuré par le backend, à partir de la matrice du §4 de SPEC_REFERENCE_V1.md.
-- Le rôle PostgreSQL garantit qu'aucune écriture ni aucun accès aux tables
-- brutes n'est possible, même si cette matrice est contournée.
