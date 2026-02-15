import { useAppContext } from "@/context/AppContext"
import { useChatRoom } from "@/context/ChatContext"
import { SyntheticEvent, useEffect, useRef } from "react"

// Tailwind background color classes
const colors = [
    "bg-blue-700",
    "bg-green-700",
    "bg-purple-700",
    "bg-red-700",
    "bg-yellow-700",
    "bg-pink-700",
    "bg-indigo-700",
    "bg-teal-700",
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
            className="flex-grow overflow-auto rounded-md bg-darkHover p-2"
            ref={messagesContainerRef}
            onScroll={handleScroll}
        >
            {messages.map((message) => {
                const bubbleColor = getUserColor(message.username)
                const isOwnMessage = message.username === currentUser.username
                const directLabel = isOwnMessage
                    ? `To ${message.recipientUsername || "selected user"}`
                    : "Direct"

                return (
                    <div
                        key={message.id}
                        className={
                            `mb-2 w-[80%] self-end break-words rounded-md px-3 py-2 
                            ${isOwnMessage ? "ml-auto" : ""} 
                            ${bubbleColor}`
                        }
                    >
                        <div className="flex justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-white">
                                    {message.username}
                                </span>
                                {message.isDirect && (
                                    <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-gray-100">
                                        {directLabel}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-gray-200">
                                {message.timestamp}
                            </span>
                        </div>
                        <p className="py-1 text-white">{message.message}</p>
                    </div>
                )
            })}
        </div>
    )
}

export default ChatList
