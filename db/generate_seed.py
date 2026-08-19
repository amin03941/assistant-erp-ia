#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Génère seed.sql — jeu de données fictives pour l'assistant ERP.

Caractéristiques :
  * déterministe (graine fixe) : deux exécutions produisent le même fichier ;
  * dates relatives à CURRENT_DATE : le jeu reste pertinent quelle que soit la
    date d'exécution (« ce mois-ci », « en retard » fonctionnent toujours) ;
  * montants cohérents : total = sous-total + taxes, sous-total = somme des lignes ;
  * paid_amount et le statut des factures ne sont PAS écrits : ils sont calculés
    par les déclencheurs du schéma, ce qui vérifie leur bon fonctionnement.

Usage : python3 generate_seed.py > seed.sql
"""

import random
from decimal import Decimal, ROUND_HALF_UP

import bcrypt

random.seed(20260816)

D3 = Decimal("0.001")
D2 = Decimal("0.01")


def q3(x):
    return Decimal(x).quantize(D3, rounding=ROUND_HALF_UP)


def sql(s):
    """Échappe une chaîne pour SQL."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def days(n):
    """Date relative à aujourd'hui, sous forme d'expression SQL."""
    if n == 0:
        return "CURRENT_DATE"
    if n > 0:
        return f"(CURRENT_DATE - {n})"
    return f"(CURRENT_DATE + {abs(n)})"


out = []
w = out.append

w("-- =============================================================================")
w("-- Assistant IA pour ERP générique — jeu de données fictives")
w("-- Généré par generate_seed.py (graine fixe, sortie reproductible)")
w("--")
w("-- Les dates sont relatives à CURRENT_DATE : le jeu reste pertinent")
w("-- quelle que soit la date d'exécution.")
w("--")
w("-- paid_amount et le statut des factures sont calculés par les déclencheurs")
w("-- définis dans schema.sql : ils ne sont pas insérés ici.")
w("--")
w("-- Prérequis : schema.sql exécuté au préalable.")
w("-- =============================================================================")
w("")
w("BEGIN;")
w("")
w("-- Réinitialisation (ordre inverse des dépendances)")
w("TRUNCATE audit_logs, invoice_imports, assistant_requests, documents, messages,")
w("         conversations, supplier_payments, purchase_invoice_items, purchase_invoices,")
w("         customer_payments, sales_invoice_items, sales_invoices,")
w("         sales_order_items, sales_orders, products, suppliers, customers, users")
w("         RESTART IDENTITY CASCADE;")
w("")

# -----------------------------------------------------------------------------
# Utilisateurs
# -----------------------------------------------------------------------------
DEMO_PASSWORD = "Demo1234!"
users = [
    ("Ahmed Ben Ali", "responsable@integrasys.tn", "MANAGER"),
    ("Sonia Trabelsi", "comptable@integrasys.tn", "ACCOUNTANT"),
    ("Karim Jlassi", "commercial@integrasys.tn", "SALES"),
    ("Nadia Bouzid", "admin@integrasys.tn", "ADMIN"),
]

w("-- -----------------------------------------------------------------------------")
w("-- Utilisateurs")
w(f"-- Mot de passe commun à tous les comptes de démonstration : {DEMO_PASSWORD}")
w("-- (haché avec bcrypt, coût 10)")
w("-- -----------------------------------------------------------------------------")
w("INSERT INTO users (full_name, email, password_hash, role, status) VALUES")
rows = []
for full_name, email, role in users:
    h = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(rounds=10)).decode()
    rows.append(f"  ({sql(full_name)}, {sql(email)}, {sql(h)}, {sql(role)}, 'ACTIVE')")
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Clients
# -----------------------------------------------------------------------------
customers = [
    ("CLI-001", "Société Alpha", "1234567/A/M/000", "contact@alpha.tn", "+216 71 234 567", "12 rue de Carthage, 1002 Tunis", 30),
    ("CLI-002", "STE Beta Distribution", "2345678/B/M/000", "achat@beta.tn", "+216 71 345 678", "45 avenue Habib Bourguiba, 4000 Sousse", 45),
    ("CLI-003", "Gamma SARL", "3456789/C/M/000", "info@gamma.tn", "+216 74 456 789", "8 rue Ibn Khaldoun, 3000 Sfax", 30),
    ("CLI-004", "Delta Industrie", "4567890/D/M/000", "compta@delta-ind.tn", "+216 72 567 890", "Zone industrielle, 8000 Nabeul", 60),
    ("CLI-005", "Epsilon Services", "5678901/E/M/000", "contact@epsilon.tn", "+216 71 678 901", "3 rue de Marseille, 1001 Tunis", 30),
    ("CLI-006", "Zeta Trading", "6789012/F/M/000", "sales@zeta.tn", "+216 73 789 012", "22 avenue de la Liberté, 5000 Monastir", 15),
    ("CLI-007", "Horizon Distribution", "7890123/G/M/000", "achats@horizon.tn", "+216 71 890 123", "Route de Bizerte km 7, 2080 Ariana", 30),
    ("CLI-008", "Medina Textile", "8901234/H/M/000", "contact@medina-textile.tn", "+216 73 901 234", "14 rue des Tanneurs, 5100 Mahdia", 45),
    ("CLI-009", "Carthage Logistics", "9012345/I/M/000", "ops@carthage-log.tn", "+216 71 012 345", "Port de Radès, 2040 Radès", 30),
    ("CLI-010", "Sahara Equipements", "0123456/J/M/000", "info@sahara-eq.tn", "+216 75 123 456", "Route de Douz, 4200 Tataouine", 60),
]

w("-- -----------------------------------------------------------------------------")
w("-- Clients")
w("-- -----------------------------------------------------------------------------")
w("INSERT INTO customers (reference, name, tax_identifier, email, phone, address, payment_terms_days, status) VALUES")
rows = []
for i, (ref, name, tax, mail, tel, addr, terms) in enumerate(customers):
    status = "ARCHIVED" if ref == "CLI-010" else "ACTIVE"
    rows.append(f"  ({sql(ref)}, {sql(name)}, {sql(tax)}, {sql(mail)}, {sql(tel)}, {sql(addr)}, {terms}, {sql(status)})")
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Fournisseurs
# -----------------------------------------------------------------------------
suppliers = [
    ("FRS-001", "TechnoImport SA", "1111111/A/M/000", "commandes@technoimport.tn", "+216 71 111 111", "Zone Charguia II, 2035 Tunis", 30),
    ("FRS-002", "Bureau Plus", "2222222/B/M/000", "vente@bureauplus.tn", "+216 71 222 222", "18 rue de Rome, 1000 Tunis", 30),
    ("FRS-003", "Global Composants", "3333333/C/M/000", "info@globalcomp.tn", "+216 74 333 333", "Route de Gabès km 3, 3000 Sfax", 45),
    ("FRS-004", "Energie Services", "4444444/D/M/000", "contact@energie-srv.tn", "+216 72 444 444", "Zone industrielle, 8000 Nabeul", 30),
    ("FRS-005", "Transit Maghreb", "5555555/E/M/000", "ops@transit-maghreb.tn", "+216 71 555 555", "Port de Radès, 2040 Radès", 15),
    ("FRS-006", "Cloud Nord SARL", "6666666/F/M/000", "billing@cloudnord.tn", "+216 71 666 666", "Lac 2, 1053 Tunis", 30),
]

w("-- -----------------------------------------------------------------------------")
w("-- Fournisseurs")
w("-- -----------------------------------------------------------------------------")
w("INSERT INTO suppliers (reference, name, tax_identifier, email, phone, address, payment_terms_days, status) VALUES")
rows = []
for ref, name, tax, mail, tel, addr, terms in suppliers:
    rows.append(f"  ({sql(ref)}, {sql(name)}, {sql(tax)}, {sql(mail)}, {sql(tel)}, {sql(addr)}, {terms}, 'ACTIVE')")
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Produits
# -----------------------------------------------------------------------------
# (référence, nom, catégorie, type, unité, prix vente, prix achat, taux, stock)
products = [
    ("PRD-001", "Ordinateur portable ProBook 15", "Informatique", "GOOD", "unité", 2450.000, 1850.000, 19.00, 24),
    ("PRD-002", "Écran 27 pouces UltraSharp", "Informatique", "GOOD", "unité", 890.000, 640.000, 19.00, 41),
    ("PRD-003", "Station d'accueil USB-C", "Informatique", "GOOD", "unité", 320.000, 210.000, 19.00, 63),
    ("PRD-004", "Serveur rack 2U", "Informatique", "GOOD", "unité", 8900.000, 7100.000, 19.00, 6),
    ("PRD-005", "Onduleur 1500 VA", "Informatique", "GOOD", "unité", 640.000, 430.000, 19.00, 18),
    ("PRD-006", "Switch réseau 24 ports", "Réseau", "GOOD", "unité", 1150.000, 820.000, 19.00, 12),
    ("PRD-007", "Point d'accès Wi-Fi 6", "Réseau", "GOOD", "unité", 480.000, 330.000, 19.00, 27),
    ("PRD-008", "Câble réseau catégorie 6", "Réseau", "GOOD", "mètre", 3.500, 1.900, 19.00, 2400),
    ("PRD-009", "Bureau ergonomique 160 cm", "Mobilier", "GOOD", "unité", 1290.000, 870.000, 19.00, 15),
    ("PRD-010", "Fauteuil de bureau ergonomique", "Mobilier", "GOOD", "unité", 760.000, 480.000, 19.00, 33),
    ("PRD-011", "Armoire métallique 2 portes", "Mobilier", "GOOD", "unité", 940.000, 610.000, 19.00, 9),
    ("PRD-012", "Ramette papier A4 80 g", "Fournitures", "GOOD", "carton", 78.000, 52.000, 19.00, 180),
    ("PRD-013", "Cartouche toner noir", "Fournitures", "GOOD", "unité", 245.000, 168.000, 19.00, 47),
    ("PRD-014", "Installation et paramétrage", "Services", "SERVICE", "heure", 120.000, 0.000, 19.00, 0),
    ("PRD-015", "Maintenance annuelle", "Services", "SERVICE", "forfait", 3200.000, 0.000, 19.00, 0),
    ("PRD-016", "Formation utilisateurs", "Services", "SERVICE", "jour", 850.000, 0.000, 19.00, 0),
    ("PRD-017", "Hébergement cloud mensuel", "Services", "SERVICE", "mois", 450.000, 280.000, 19.00, 0),
    ("PRD-018", "Licence bureautique annuelle", "Logiciels", "GOOD", "licence", 390.000, 295.000, 19.00, 120),
    ("PRD-019", "Clavier et souris sans fil", "Informatique", "GOOD", "lot", 145.000, 88.000, 19.00, 56),
    ("PRD-020", "Disque SSD 1 To", "Informatique", "GOOD", "unité", 410.000, 285.000, 19.00, 38),
]

w("-- -----------------------------------------------------------------------------")
w("-- Produits et services")
w("-- -----------------------------------------------------------------------------")
w("INSERT INTO products (reference, name, category, product_type, unit, sale_price, purchase_price, tax_rate, stock_quantity, status) VALUES")
rows = []
for ref, name, cat, typ, unit, sp, pp, tr, st in products:
    status = "ARCHIVED" if ref == "PRD-011" else "ACTIVE"
    rows.append(
        f"  ({sql(ref)}, {sql(name)}, {sql(cat)}, {sql(typ)}, {sql(unit)}, "
        f"{q3(sp)}, {q3(pp)}, {tr}, {q3(st)}, {sql(status)})"
    )
w(",\n".join(rows) + ";")
w("")

active_customers = [c for c in customers if c[0] != "CLI-010"]
sellable = [p for p in products if p[0] != "PRD-011"]


def build_lines(n_lines):
    """Retourne (lignes, sous_total, taxes, total)."""
    chosen = random.sample(sellable, n_lines)
    lines, subtotal, tax = [], Decimal("0"), Decimal("0")
    for p in chosen:
        ref, name, cat, typ, unit, sp, pp, tr, st = p
        if unit == "mètre":
            qty = q3(random.choice([50, 100, 150, 200, 300]))
        elif unit in ("carton", "lot", "licence"):
            qty = q3(random.randint(2, 20))
        elif typ == "SERVICE":
            qty = q3(random.randint(1, 12))
        else:
            qty = q3(random.randint(1, 8))
        # remise occasionnelle
        price = q3(Decimal(str(sp)) * (Decimal("0.95") if random.random() < 0.18 else Decimal("1")))
        line_total = q3(qty * price)
        subtotal += line_total
        tax += q3(line_total * Decimal(str(tr)) / Decimal("100"))
        lines.append((ref, name, qty, price, Decimal(str(tr)), line_total))
    subtotal = q3(subtotal)
    tax = q3(tax)
    return lines, subtotal, tax, q3(subtotal + tax)


# -----------------------------------------------------------------------------
# Commandes clients
# -----------------------------------------------------------------------------
w("-- -----------------------------------------------------------------------------")
w("-- Commandes clients")
w("-- Quelques commandes CONFIRMED ont une date de livraison dépassée :")
w("-- elles alimentent la question « quelles commandes sont en retard ? »")
w("-- -----------------------------------------------------------------------------")

orders = []          # (ref, cust_ref, days_ago, delivery_offset, status, lines, sub, tax, tot)
order_counter = 0

# Répartition des statuts
order_plan = (
    ["LATE"] * 6 +          # CONFIRMED, livraison dépassée
    ["PENDING"] * 7 +       # CONFIRMED, livraison à venir
    ["DELIVERED"] * 14 +
    ["DRAFT"] * 3 +
    ["CANCELLED"] * 2
)
random.shuffle(order_plan)

for kind in order_plan:
    order_counter += 1
    ref = f"CMD-2026-{order_counter:04d}"
    cust = random.choice(active_customers)
    lines, sub, tax, tot = build_lines(random.randint(1, 4))

    if kind == "LATE":
        d_ago = random.randint(45, 130)
        delivery = d_ago - random.randint(5, 35)   # échéance déjà passée
        status = "CONFIRMED"
    elif kind == "PENDING":
        d_ago = random.randint(2, 25)
        delivery = -random.randint(3, 30)          # dans le futur
        status = "CONFIRMED"
    elif kind == "DELIVERED":
        d_ago = random.randint(20, 240)
        delivery = d_ago - random.randint(5, 20)
        status = "DELIVERED"
    elif kind == "DRAFT":
        d_ago = random.randint(1, 10)
        delivery = -random.randint(10, 40)
        status = "DRAFT"
    else:
        d_ago = random.randint(30, 180)
        delivery = d_ago - random.randint(5, 25)
        status = "CANCELLED"

    orders.append((ref, cust[0], d_ago, delivery, status, lines, sub, tax, tot))

w("INSERT INTO sales_orders (reference, customer_id, order_date, expected_delivery_date, status, subtotal_amount, tax_amount, total_amount) VALUES")
rows = []
for ref, cref, d_ago, delivery, status, lines, sub, tax, tot in orders:
    rows.append(
        f"  ({sql(ref)}, (SELECT id FROM customers WHERE reference={sql(cref)}), "
        f"{days(d_ago)}, {days(delivery)}, {sql(status)}, {sub}, {tax}, {tot})"
    )
w(",\n".join(rows) + ";")
w("")

w("INSERT INTO sales_order_items (sales_order_id, product_id, description, quantity, unit_price, tax_rate) VALUES")
rows = []
for ref, cref, d_ago, delivery, status, lines, sub, tax, tot in orders:
    for pref, pname, qty, price, tr, lt in lines:
        rows.append(
            f"  ((SELECT id FROM sales_orders WHERE reference={sql(ref)}), "
            f"(SELECT id FROM products WHERE reference={sql(pref)}), "
            f"{sql(pname)}, {qty}, {price}, {tr})"
        )
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Factures de vente
# -----------------------------------------------------------------------------
w("-- -----------------------------------------------------------------------------")
w("-- Factures de vente")
w("-- Le statut inséré est DRAFT, ISSUED ou CANCELLED. Le passage à")
w("-- PARTIALLY_PAID ou PAID est effectué par le déclencheur, à partir")
w("-- des paiements confirmés insérés plus bas.")
w("-- -----------------------------------------------------------------------------")

terms_by_ref = {c[0]: c[6] for c in customers}
delivered_orders = [o for o in orders if o[4] == "DELIVERED"]

invoices = []   # (num, cust_ref, order_ref|None, d_ago, due_ago, status, lines, sub, tax, tot, scenario)
inv_counter = 0

invoice_plan = (
    ["OVERDUE_UNPAID"] * 7 +
    ["OVERDUE_PARTIAL"] * 4 +
    ["CURRENT_UNPAID"] * 6 +
    ["PAID"] * 13 +
    ["DRAFT"] * 3 +
    ["CANCELLED"] * 2
)
random.shuffle(invoice_plan)

# Garantir de l'activité sur le mois en cours
current_month_slots = 6

for idx, kind in enumerate(invoice_plan):
    inv_counter += 1
    num = f"FAC-2026-{inv_counter:04d}"

    linked = None
    if delivered_orders and random.random() < 0.55:
        o = random.choice(delivered_orders)
        linked = o[0]
        cref = o[1]
        lines, sub, tax, tot = o[5], o[6], o[7], o[8]
        d_ago = max(1, o[2] - random.randint(1, 10))
    else:
        cref = random.choice(active_customers)[0]
        lines, sub, tax, tot = build_lines(random.randint(1, 4))
        d_ago = random.randint(1, 240)

    terms = terms_by_ref[cref]

    if kind == "OVERDUE_UNPAID":
        d_ago = random.randint(terms + 20, terms + 120)
    elif kind == "OVERDUE_PARTIAL":
        d_ago = random.randint(terms + 15, terms + 90)
    elif kind == "CURRENT_UNPAID":
        d_ago = random.randint(1, max(2, terms - 5))
    elif kind == "PAID":
        if current_month_slots > 0 and random.random() < 0.6:
            d_ago = random.randint(1, 26)      # mois en cours ou proche
            current_month_slots -= 1
        else:
            d_ago = random.randint(20, 240)
    elif kind == "DRAFT":
        d_ago = random.randint(0, 6)
    else:
        d_ago = random.randint(30, 200)

    due_ago = d_ago - terms
    status = {"DRAFT": "DRAFT", "CANCELLED": "CANCELLED"}.get(kind, "ISSUED")

    invoices.append((num, cref, linked, d_ago, due_ago, status, lines, sub, tax, tot, kind))

w("INSERT INTO sales_invoices (invoice_number, customer_id, sales_order_id, invoice_date, due_date, status, subtotal_amount, tax_amount, total_amount, source) VALUES")
rows = []
for num, cref, linked, d_ago, due_ago, status, lines, sub, tax, tot, kind in invoices:
    order_expr = (
        f"(SELECT id FROM sales_orders WHERE reference={sql(linked)})" if linked else "NULL"
    )
    rows.append(
        f"  ({sql(num)}, (SELECT id FROM customers WHERE reference={sql(cref)}), {order_expr}, "
        f"{days(d_ago)}, {days(due_ago)}, {sql(status)}, {sub}, {tax}, {tot}, 'SEED')"
    )
w(",\n".join(rows) + ";")
w("")

w("INSERT INTO sales_invoice_items (sales_invoice_id, product_id, description, quantity, unit_price, tax_rate) VALUES")
rows = []
for num, cref, linked, d_ago, due_ago, status, lines, sub, tax, tot, kind in invoices:
    for pref, pname, qty, price, tr, lt in lines:
        rows.append(
            f"  ((SELECT id FROM sales_invoices WHERE invoice_number={sql(num)}), "
            f"(SELECT id FROM products WHERE reference={sql(pref)}), "
            f"{sql(pname)}, {qty}, {price}, {tr})"
        )
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Paiements clients
# -----------------------------------------------------------------------------
w("-- -----------------------------------------------------------------------------")
w("-- Paiements clients")
w("-- Ces insertions déclenchent la mise à jour de paid_amount et du statut.")
w("-- Un paiement PENDING est volontairement présent : il ne doit pas être compté.")
w("-- -----------------------------------------------------------------------------")

methods = ["BANK_TRANSFER", "CHECK", "CASH", "CARD"]
pay_rows = []
pay_counter = 0

for num, cref, linked, d_ago, due_ago, status, lines, sub, tax, tot, kind in invoices:
    if kind == "PAID":
        # un ou deux règlements
        if random.random() < 0.35:
            first = q3(tot * Decimal(str(round(random.uniform(0.35, 0.6), 2))))
            second = q3(tot - first)
            parts = [first, second]
        else:
            parts = [tot]
        for i, amount in enumerate(parts):
            pay_counter += 1
            offset = max(0, d_ago - random.randint(0, max(1, d_ago // 2)))
            pay_rows.append((f"REG-{pay_counter:04d}", cref, num, offset, amount,
                             random.choice(methods), "CONFIRMED"))
    elif kind == "OVERDUE_PARTIAL":
        pay_counter += 1
        amount = q3(tot * Decimal(str(round(random.uniform(0.2, 0.65), 2))))
        offset = max(0, d_ago - random.randint(5, 30))
        pay_rows.append((f"REG-{pay_counter:04d}", cref, num, offset, amount,
                         random.choice(methods), "CONFIRMED"))

# Un règlement en attente (ne doit pas être compté par le déclencheur)
pending_target = next(i for i in invoices if i[10] == "OVERDUE_UNPAID")
pay_counter += 1
pay_rows.append((f"REG-{pay_counter:04d}", pending_target[1], pending_target[0],
                 2, q3(pending_target[9] / 2), "CHECK", "PENDING"))

w("INSERT INTO customer_payments (reference, customer_id, sales_invoice_id, payment_date, amount, payment_method, status) VALUES")
rows = []
for ref, cref, num, offset, amount, method, st in pay_rows:
    rows.append(
        f"  ({sql(ref)}, (SELECT id FROM customers WHERE reference={sql(cref)}), "
        f"(SELECT id FROM sales_invoices WHERE invoice_number={sql(num)}), "
        f"{days(offset)}, {amount}, {sql(method)}, {sql(st)})"
    )
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Factures d'achat
# -----------------------------------------------------------------------------
w("-- -----------------------------------------------------------------------------")
w("-- Factures d'achat")
w("-- Deux fournisseurs portent volontairement le même numéro de facture :")
w("-- l'unicité est portée par le couple (fournisseur, numéro).")
w("-- -----------------------------------------------------------------------------")

purchasables = [p for p in products if p[6] > 0 and p[0] != "PRD-011"]


def build_purchase_lines(n_lines):
    chosen = random.sample(purchasables, n_lines)
    lines, subtotal, tax = [], Decimal("0"), Decimal("0")
    for p in chosen:
        ref, name, cat, typ, unit, sp, pp, tr, st = p
        qty = q3(random.randint(5, 40)) if unit != "mètre" else q3(random.choice([200, 500, 1000]))
        price = q3(pp)
        lt = q3(qty * price)
        subtotal += lt
        tax += q3(lt * Decimal(str(tr)) / Decimal("100"))
        lines.append((ref, name, qty, price, Decimal(str(tr)), lt))
    subtotal = q3(subtotal)
    tax = q3(tax)
    return lines, subtotal, tax, q3(subtotal + tax)


purchase_plan = ["PAID"] * 8 + ["OVERDUE"] * 4 + ["CURRENT"] * 4 + ["PARTIAL"] * 2
random.shuffle(purchase_plan)

purchases = []
for i, kind in enumerate(purchase_plan, start=1):
    sup = random.choice(suppliers)
    terms = sup[6]
    lines, sub, tax, tot = build_purchase_lines(random.randint(1, 3))
    if kind == "OVERDUE":
        d_ago = random.randint(terms + 15, terms + 90)
    elif kind == "CURRENT":
        d_ago = random.randint(1, max(2, terms - 5))
    else:
        d_ago = random.randint(15, 220)
    num = f"F{2026}-{100 + i}"
    purchases.append((num, sup[0], d_ago, d_ago - terms, lines, sub, tax, tot, kind))

# Doublon volontaire de numéro entre deux fournisseurs différents
dup = purchases[0]
other_supplier = next(s[0] for s in suppliers if s[0] != dup[1])
lines, sub, tax, tot = build_purchase_lines(2)
purchases.append((dup[0], other_supplier, 40, 10, lines, sub, tax, tot, "CURRENT"))

w("INSERT INTO purchase_invoices (invoice_number, supplier_id, invoice_date, due_date, status, subtotal_amount, tax_amount, total_amount, source) VALUES")
rows = []
for num, sref, d_ago, due_ago, lines, sub, tax, tot, kind in purchases:
    rows.append(
        f"  ({sql(num)}, (SELECT id FROM suppliers WHERE reference={sql(sref)}), "
        f"{days(d_ago)}, {days(due_ago)}, 'ISSUED', {sub}, {tax}, {tot}, 'SEED')"
    )
w(",\n".join(rows) + ";")
w("")

w("INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, description, quantity, unit_price, tax_rate) VALUES")
rows = []
for num, sref, d_ago, due_ago, lines, sub, tax, tot, kind in purchases:
    for pref, pname, qty, price, tr, lt in lines:
        rows.append(
            f"  ((SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id "
            f"WHERE pi.invoice_number={sql(num)} AND s.reference={sql(sref)}), "
            f"(SELECT id FROM products WHERE reference={sql(pref)}), "
            f"{sql(pname)}, {qty}, {price}, {tr})"
        )
w(",\n".join(rows) + ";")
w("")

w("-- -----------------------------------------------------------------------------")
w("-- Paiements fournisseurs")
w("-- -----------------------------------------------------------------------------")
sp_rows = []
sp_counter = 0
for num, sref, d_ago, due_ago, lines, sub, tax, tot, kind in purchases:
    if kind == "PAID":
        sp_counter += 1
        sp_rows.append((f"RGF-{sp_counter:04d}", sref, num, max(0, d_ago - random.randint(1, 20)), tot, "BANK_TRANSFER"))
    elif kind == "PARTIAL":
        sp_counter += 1
        sp_rows.append((f"RGF-{sp_counter:04d}", sref, num, max(0, d_ago - random.randint(1, 15)),
                        q3(tot * Decimal("0.5")), "BANK_TRANSFER"))

w("INSERT INTO supplier_payments (reference, supplier_id, purchase_invoice_id, payment_date, amount, payment_method, status) VALUES")
rows = []
for ref, sref, num, offset, amount, method in sp_rows:
    rows.append(
        f"  ({sql(ref)}, (SELECT id FROM suppliers WHERE reference={sql(sref)}), "
        f"(SELECT pi.id FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id "
        f"WHERE pi.invoice_number={sql(num)} AND s.reference={sql(sref)}), "
        f"{days(offset)}, {amount}, {sql(method)}, 'CONFIRMED')"
    )
w(",\n".join(rows) + ";")
w("")

# -----------------------------------------------------------------------------
# Conversation de démonstration
# -----------------------------------------------------------------------------
w("-- -----------------------------------------------------------------------------")
w("-- Conversation de démonstration et journal d'audit")
w("-- -----------------------------------------------------------------------------")
w("""INSERT INTO conversations (user_id, title, status)
SELECT id, 'Suivi des impayés', 'ACTIVE' FROM users WHERE email = 'comptable@integrasys.tn';

INSERT INTO messages (conversation_id, sender, content)
SELECT c.id, 'USER', 'Quel est le montant total des factures impayées ?'
FROM conversations c WHERE c.title = 'Suivi des impayés';

INSERT INTO audit_logs (user_id, event_type, source, details)
SELECT id, 'LOGIN', 'UI', '{"ip":"127.0.0.1"}'::jsonb FROM users WHERE status = 'ACTIVE';""")
w("")
w("COMMIT;")
w("")
w("-- =============================================================================")
w("-- Contrôles rapides après chargement")
w("-- =============================================================================")
w("""-- SELECT COUNT(*) FROM v_sales_invoices WHERE is_overdue;
-- SELECT SUM(remaining_amount) FROM v_sales_invoices WHERE is_unpaid;
-- SELECT * FROM v_sales_orders WHERE is_late ORDER BY days_late DESC;
-- SELECT * FROM v_product_sales WHERE month = date_trunc('month', CURRENT_DATE)::date
--   ORDER BY quantity_sold DESC LIMIT 5;""")

print("\n".join(out))
