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
        <div className="flex flex-col items-center gap-4 p-2 bg-gray-800 border-r border-gray-700">
            {sidebarItems.map(item => (
                <div key={item.name} className="relative">
                    <Button
                        variant={activeItem === item.name ? "secondary" : "ghost"}
                        size="icon"
                        onClick={() => onSelect(item.name)}
                        title={item.title}
                    >
                        {item.icon}
                    </Button>
                    {item.name === "chat" && isNewMessage && (
                        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-primary" />
                    )}
                    {item.name === "file-sharing" && isNewFileShare && (
                        <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-primary" />
                    )}
                </div>
            ))}
        </div>
    )
}

export default LeftSidebar
