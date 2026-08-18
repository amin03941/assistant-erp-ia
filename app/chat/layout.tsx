import { Bell, Search } from "lucide-react";
import { getSession } from "@/lib/session";
import Sidebar from "@/components/sidebar";

const ROLES: Record<string, string> = {
    MANAGER: "Responsable", ACCOUNTANT: "Comptable",
    SALES: "Commercial", ADMIN: "Administrateur",
};

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession();

    return (
        <div className="flex h-screen bg-[#F7F8FC] text-[#1B1F32]">
            <Sidebar nom={session.nom} role={session.role} />

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex items-center justify-between border-b border-[#E8EAF2] bg-white px-6 py-3.5">
                    <div>
                        <p className="font-semibold">Bonjour, {session.nom.split(" ")[0]} 👋</p>
                        <p className="text-xs text-[#6B7089]">{ROLES[session.role] ?? session.role}</p>
                    </div>
                    <div className="flex items-center gap-4 text-[#6B7089]">
                        <Search size={18} />
                        <Bell size={18} />
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#5B5BD6] text-sm font-semibold text-white">
                            {session.nom.charAt(0)}
                        </div>
                    </div>
                </header>

                {children}
            </div>
        </div>
    );
}