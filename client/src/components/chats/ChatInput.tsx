import { useAppContext } from "@/context/AppContext"
import { useChatRoom } from "@/context/ChatContext"
import { useSocket } from "@/context/SocketContext"
import { ChatMessage } from "@/types/chat"
import { SocketEvent } from "@/types/socket"
import { formatDate } from "@/utils/formateDate"
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { LuSendHorizonal } from "react-icons/lu"
import { v4 as uuidV4 } from "uuid"

function ChatInput() {
    const { currentUser, users } = useAppContext()
    const { socket } = useSocket()
    const { setMessages } = useChatRoom()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [recipientSocketId, setRecipientSocketId] = useState<string>("all")

    const availableRecipients = useMemo(
        () =>
            users
                .filter((user) => user.socketId !== socket.id)
                .sort((a, b) => a.username.localeCompare(b.username)),
        [users, socket.id],
    )

    const selectedRecipient = useMemo(
        () =>
            recipientSocketId === "all"
                ? null
                : availableRecipients.find((user) => user.socketId === recipientSocketId) ||
                  null,
        [availableRecipients, recipientSocketId],
    )

    useEffect(() => {
        if (recipientSocketId === "all") return
        const userStillInRoom = availableRecipients.some(
            (user) => user.socketId === recipientSocketId,
        )
        if (!userStillInRoom) {
            setRecipientSocketId("all")
        }
    }, [availableRecipients, recipientSocketId])

    const handleRecipientChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setRecipientSocketId(event.target.value)
    }

    const handleSendMessage = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const inputVal = inputRef.current?.value.trim()
        const targetRecipient =
            recipientSocketId === "all"
                ? null
                : availableRecipients.find((user) => user.socketId === recipientSocketId) ||
                  null

        if (recipientSocketId !== "all" && !targetRecipient) {
            return
        }

        if (inputVal && inputVal.length > 0) {
            const message: ChatMessage = {
                id: uuidV4(),
                message: inputVal,
                username: currentUser.username,
                timestamp: formatDate(new Date().toISOString()),
                isDirect: Boolean(targetRecipient),
                recipientSocketId: targetRecipient?.socketId || null,
                recipientUsername: targetRecipient?.username || null,
            }
            socket.emit(SocketEvent.SEND_MESSAGE, {
                message,
                recipientSocketId: targetRecipient?.socketId || null,
            })
            setMessages((messages) => [...messages, message])

            if (inputRef.current) inputRef.current.value = ""
        }
    }

    return (
        <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
            <div className="sidebar-modern-card flex items-center gap-2 px-3 py-2">
                <label htmlFor="chat-recipient" className="ui-muted-text text-xs font-medium">
                    Send to
                </label>
                <select
                    id="chat-recipient"
                    className="sidebar-modern-control px-3 py-1.5 text-sm"
                    value={recipientSocketId}
                    onChange={handleRecipientChange}
                >
                    <option value="all">Chat with all</option>
                    {availableRecipients.map((user) => (
                        <option key={user.socketId} value={user.socketId}>
                            {user.username}
                        </option>
                    ))}
                </select>
            </div>
            <div className="sidebar-modern-card flex justify-between overflow-hidden p-0">
                <input
                    type="text"
                    className="w-full flex-grow rounded-l-2xl border-none bg-transparent px-3 py-2.5 text-sm text-[var(--ui-text-primary)] outline-none placeholder:text-[var(--ui-text-muted)]"
                    placeholder={
                        selectedRecipient
                            ? `Message to ${selectedRecipient.username}...`
                            : "Enter a message for everyone..."
                    }
                    ref={inputRef}
                />
                <button
                    className="sidebar-modern-btn sidebar-modern-btn--primary rounded-none rounded-r-2xl border-l px-4"
                    type="submit"
                >
                    <LuSendHorizonal size={24} />
                </button>
            </div>
        </form>
    )
}

export default ChatInput
