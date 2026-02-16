import {
    Folder,
    MessageCircle,
    Bot,
    Users,
    Settings,
    Share2,
    Link2,
    Monitor,
} from "lucide-react"
import { useChatRoom } from "@/context/ChatContext"
import { useFileShare } from "@/context/FileShareContext"
import { Button } from "./ui/button"

interface LeftSidebarProps {
    onSelect: (item: string) => void
    activeItem: string
}

const LeftSidebar = ({ onSelect, activeItem }: LeftSidebarProps) => {
    const { isNewMessage } = useChatRoom()
    const { isNewFileShare } = useFileShare()
    const sidebarItems = [
        { icon: <Folder />, name: "files", title: "File Explorer" },
        { icon: <MessageCircle />, name: "chat", title: "Chat" },
        { icon: <Share2 />, name: "file-sharing", title: "File Sharing" },
        { icon: <Link2 />, name: "external-import", title: "External Import" },
        { icon: <Monitor />, name: "screen-share", title: "Screen Share" },
        { icon: <Bot />, name: "copilot", title: "Copilot" },
        { icon: <Users />, name: "clients", title: "Clients" },
        { icon: <Settings />, name: "settings", title: "Settings" },
    ]

    return (
        <div className="workspace-leftbar flex h-full flex-col items-center gap-3 p-3 backdrop-blur-xl">
            {sidebarItems.map(item => (
                <div key={item.name} className="relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onSelect(item.name)}
                        title={item.title}
                        className={`workspace-leftbar-btn group relative h-11 w-11 rounded-2xl transition-all duration-300 ${
                            activeItem === item.name
                                ? "workspace-leftbar-btn--active"
                                : "hover:-translate-y-0.5"
                        }`}
                    >
                        <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/20 via-transparent to-transparent opacity-70" />
                        <span className="relative z-10">{item.icon}</span>
                    </Button>
                    {item.name === "chat" && isNewMessage && (
                        <span className="absolute -right-1 -top-1 flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full border border-white/50 bg-cyan-200" />
                        </span>
                    )}
                    {item.name === "file-sharing" && isNewFileShare && (
                        <span className="absolute -right-1 -top-1 flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full border border-white/50 bg-cyan-200" />
                        </span>
                    )}
                </div>
            ))}
        </div>
    )
}

export default LeftSidebar
