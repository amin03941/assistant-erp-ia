import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import {
    Sparkles, LayoutDashboard, Users, Package, ClipboardList,
    FileText, CreditCard, ShoppingCart, BarChart3, Settings, HelpCircle, LogOut,
} from "lucide-react";

/** Rôles qui voient le tableau de bord : un suivi du système, pas une vue métier. */
const ROLES_TABLEAU = ["MANAGER", "ADMIN"];

const MODULES = [
    { icone: Users, libelle: "Clients" },
    { icone: Package, libelle: "Produits" },
    { icone: ClipboardList, libelle: "Commandes" },
    { icone: FileText, libelle: "Factures" },
    { icone: CreditCard, libelle: "Paiements" },
    { icone: ShoppingCart, libelle: "Achats" },
    { icone: BarChart3, libelle: "Rapports" },
    { icone: Settings, libelle: "Paramètres" },
];

const ROLES: Record<string, string> = {
    MANAGER: "Responsable", ACCOUNTANT: "Comptable",
    SALES: "Commercial", ADMIN: "Administrateur",
};

const lien = (actif: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${actif
        ? "bg-[#5B5BD6] text-white"
        : "text-white/70 hover:bg-white/5 hover:text-white"}`;

export default function Sidebar({
    nom, role, actif = "assistant", children,
}: { nom: string; role: string; actif?: "assistant" | "tableau"; children?: React.ReactNode }) {
    const tableauOuvert = ROLES_TABLEAU.includes(role);
    return (
        <aside className="w-64 shrink-0 bg-[#1B1F32] text-white flex flex-col">
            <div className="flex items-center gap-2.5 px-5 py-5">
                <Image
                    src="/logo.png"
                    alt="IntegraSys ERP"
                    width={32}
                    height={32}
                    className="rounded-lg"
                    priority
                />
                <span className="font-semibold">IntegraSys ERP</span>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col">
                <div className="space-y-1 px-3">
                    <Link href="/chat" className={lien(actif === "assistant")} aria-current={actif === "assistant" ? "page" : undefined}>
                        <Sparkles size={17} />
                        Assistant IA
                    </Link>
                    {tableauOuvert ? (
                        <Link href="/chat/tableau-de-bord" className={lien(actif === "tableau")} aria-current={actif === "tableau" ? "page" : undefined}>
                            <LayoutDashboard size={17} />
                            Tableau de bord
                        </Link>
                    ) : (
                        <div
                            aria-disabled
                            title="Réservé au responsable et à l'administrateur"
                            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/35"
                        >
                            <LayoutDashboard size={17} />
                            <span className="flex-1">Tableau de bord</span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-wide">réservé</span>
                        </div>
                    )}
                </div>

                {children}

                <div className="space-y-1 px-3 pt-3">
                    {MODULES.map(({ icone: Icone, libelle }) => (
                        <div
                            key={libelle}
                            aria-disabled
                            title="Module à venir"
                            className="group flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/35"
                        >
                            <Icone size={17} />
                            <span className="flex-1">{libelle}</span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-wide">
                                à venir
                            </span>
                        </div>
                    ))}
                </div>
            </nav>

            <div className="space-y-3 p-3">
                <div className="flex items-start gap-2.5 rounded-xl bg-white/5 p-3 text-xs">
                    <HelpCircle size={16} className="mt-0.5 text-[#8B90FF]" />
                    <div>
                        <p className="font-medium text-white/90">Besoin d&apos;aide ?</p>
                        <p className="text-white/45">Consultez le guide d&apos;utilisation</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-[#5B5BD6] text-sm font-semibold">
                        {nom.charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{nom}</p>
                        <p className="text-xs text-white/45">{ROLES[role] ?? role}</p>
                    </div>
                    <form
                        action={async () => {
                            "use server";
                            await signOut({ redirectTo: "/login" });
                        }}
                        className="ml-auto"
                    >
                        <button type="submit" aria-label="Se déconnecter" className="text-white/40 hover:text-white">
                            <LogOut size={16} />
                        </button>
                    </form>
                </div>
            </div>
        </aside>
    );
}