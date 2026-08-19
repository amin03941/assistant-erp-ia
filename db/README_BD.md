# Base de données — installation et vérification

## 1. Créer la base

```bash
createdb assistant_erp
psql -d assistant_erp -v ON_ERROR_STOP=1 -f schema.sql
psql -d assistant_erp -v ON_ERROR_STOP=1 -f seed.sql
```

`seed.sql` commence par un `TRUNCATE` : il est rejouable autant de fois que
nécessaire, sans avoir à recréer la base.

## 2. Comptes de démonstration

Mot de passe commun : `Demo1234!` (haché en bcrypt, coût 10).

| Email | Rôle |
|---|---|
| `responsable@integrasys.tn` | `MANAGER` |
| `comptable@integrasys.tn` | `ACCOUNTANT` |
| `commercial@integrasys.tn` | `SALES` |
| `admin@integrasys.tn` | `ADMIN` |

> À remplacer avant toute mise en ligne. Ces comptes sont destinés au
> développement et à la démonstration uniquement.

## 3. Contenu du jeu de données

| Table | Lignes |
|---|---|
| `users` | 4 |
| `customers` | 10 (dont 1 archivé) |
| `suppliers` | 6 |
| `products` | 20 (dont 1 archivé, 4 services) |
| `sales_orders` | 32 |
| `sales_order_items` | 80 |
| `sales_invoices` | 35 |
| `sales_invoice_items` | 95 |
| `customer_payments` | 22 (dont 1 en attente) |
| `purchase_invoices` | 19 |
| `purchase_invoice_items` | 40 |
| `supplier_payments` | 10 |

Les dates sont **relatives à `CURRENT_DATE`**. Le jeu reste donc pertinent quelle
que soit la date d'exécution : les factures en retard le restent, et il y a
toujours de l'activité sur le mois en cours.

Les statuts `PARTIALLY_PAID` et `PAID` ainsi que la colonne `paid_amount` ne sont
jamais insérés : ils sont produits par les déclencheurs à partir des paiements.
Charger ce fichier constitue donc en soi un test de leur bon fonctionnement.

## 4. Cas particuliers volontairement présents

Ils servent aux scénarios de test de l'annexe A du document de conception.

| Cas | Où |
|---|---|
| Paiement `PENDING` non compté dans `paid_amount` | `REG-0022` |
| Deux fournisseurs avec le même numéro de facture | `F2026-101` |
| Client archivé sans activité récente | `CLI-010` |
| Produit archivé | `PRD-011` |
| Factures `DRAFT` exclues des indicateurs | 3 factures |
| Factures `CANCELLED` exclues sans exception | 2 factures |
| Factures partiellement réglées et en retard | 4 factures |
| Commandes confirmées dont la livraison est dépassée | 6 commandes |

## 5. Vérification après chargement

```sql
-- Répartition des statuts, calculée par les déclencheurs
SELECT status, count(*), sum(total_amount), sum(paid_amount)
FROM sales_invoices GROUP BY status ORDER BY status;

-- Cohérence : sous-total = somme des lignes
SELECT count(*) FROM (
  SELECT f.id FROM sales_invoices f
  JOIN sales_invoice_items i ON i.sales_invoice_id = f.id
  GROUP BY f.id, f.subtotal_amount
  HAVING abs(sum(i.line_total) - f.subtotal_amount) > 0.001) t;   -- attendu : 0

-- Cohérence : paid_amount = somme des paiements confirmés
SELECT count(*) FROM sales_invoices f WHERE f.paid_amount <> (
  SELECT COALESCE(sum(amount),0) FROM customer_payments
  WHERE sales_invoice_id = f.id AND status = 'CONFIRMED');        -- attendu : 0
```

## 6. Régénérer le jeu de données

```bash
pip install bcrypt
python3 generate_seed.py > seed.sql
```

Le générateur utilise une graine fixe : deux exécutions produisent le même
fichier, aux hachages bcrypt près (le sel est aléatoire par construction).
Modifier `random.seed(...)` pour obtenir un autre jeu.

## 7. Point de conception à trancher

La question « quel est le produit le plus vendu ? » est ambiguë lorsque les
unités diffèrent : 50 mètres de câble ne se comparent pas à 50 ordinateurs. La
vue `v_product_sales` expose donc **deux** colonnes, `quantity_sold` et
`revenue_excl_tax`. Il faut décider laquelle fait référence, et l'inscrire dans
l'annexe A ainsi que dans le prompt du modèle. Le classement par chiffre
d'affaires est le plus défendable.
