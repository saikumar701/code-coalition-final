import { useAppContext } from "@/context/AppContext"
import { useChatRoom } from "@/context/ChatContext"
import { SyntheticEvent, useEffect, useRef } from "react"

// Tailwind background color classes
const colors = [
    "from-blue-500/85 to-cyan-500/80",
    "from-emerald-500/85 to-teal-500/80",
    "from-violet-500/85 to-fuchsia-500/80",
    "from-rose-500/85 to-red-500/80",
    "from-amber-500/85 to-orange-500/80",
    "from-pink-500/85 to-rose-500/80",
    "from-indigo-500/85 to-sky-500/80",
    "from-teal-500/85 to-cyan-500/80",
]

// Deterministic color generator based on username
function getUserColor(username: string) {
    let hash = 0
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
}

function ChatList() {
    const {
        messages,
        isNewMessage,
        setIsNewMessage,
        lastScrollHeight,
        setLastScrollHeight,
    } = useChatRoom()

    const { currentUser } = useAppContext()
    const messagesContainerRef = useRef<HTMLDivElement | null>(null)

    const handleScroll = (e: SyntheticEvent) => {
        const container = e.target as HTMLDivElement
        setLastScrollHeight(container.scrollTop)
    }

    // Scroll to bottom when messages change
    useEffect(() => {
        if (!messagesContainerRef.current) return
        messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight
    }, [messages])

    useEffect(() => {
        if (isNewMessage) {
            setIsNewMessage(false)
        }
        if (messagesContainerRef.current)
            messagesContainerRef.current.scrollTop = lastScrollHeight
    }, [isNewMessage, setIsNewMessage, lastScrollHeight])

    return (
        <div
            className="sidebar-modern-scroll flex-grow space-y-3 overflow-auto p-3"
            ref={messagesContainerRef}
            onScroll={handleScroll}
        >
            {messages.map((message, index) => {
                const bubbleColor = getUserColor(message.username)
                const isOwnMessage = message.username === currentUser.username
                const directLabel = isOwnMessage
                    ? `To ${message.recipientUsername || "selected user"}`
                    : "Direct"

                return (
                    <div
                        key={message.id}
                        className={
                            `w-[86%] break-words rounded-2xl border border-white/15 bg-gradient-to-br px-3 py-2.5 shadow-[0_12px_28px_rgba(2,6,23,0.35)] 
                            ${isOwnMessage ? "ml-auto" : ""} 
                            ${bubbleColor}`
                        }
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white">
                                    {message.username}
                                </span>
                                <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] text-white/85">
                                    Message {index + 1}
                                </span>
                                {message.isDirect && (
                                    <span className="rounded-full border border-white/20 bg-black/30 px-2 py-0.5 text-[10px] text-gray-100">
                                        {directLabel}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-gray-100/90">
                                {message.timestamp}
                            </span>
                        </div>
                        <p className="pt-1.5 text-sm text-white">{message.message}</p>
                    </div>
                )
            })}
        </div>
    )
}

export default ChatList
