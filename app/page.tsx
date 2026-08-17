import { db, dbReadOnly } from "@/lib/db";

export default async function Home() {
  const clients = await db.query("SELECT COUNT(*) FROM customers");
  const impayees = await dbReadOnly.query(
    "SELECT COUNT(*) FROM v_sales_invoices WHERE is_unpaid"
  );

  return (
    <main className="p-10 font-sans">
      <h1 className="text-2xl font-bold mb-6">Connexion PostgreSQL</h1>
      <p>Clients (compte erp_app) : <strong>{clients.rows[0].count}</strong></p>
      <p>Factures impayées (compte erp_assistant) : <strong>{impayees.rows[0].count}</strong></p>
    </main>
  );
}