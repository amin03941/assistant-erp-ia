import { getSession } from "@/lib/session";
import Sidebar from "@/components/sidebar";
import Historique from "@/components/historique";
import ChatArea from "@/components/chat-area";
import { ConversationProvider } from "@/components/conversation-context";

export default async function ChatPage() {
    const session = await getSession();

    return (
        <ConversationProvider>
            <div className="flex h-screen bg-[#F7F8FC] text-[#1B1F32]">
                <Sidebar nom={session.nom} role={session.role} actif="assistant">
                    <Historique />
                </Sidebar>
                <ChatArea nom={session.nom} role={session.role} />
            </div>
        </ConversationProvider>
    );
}
