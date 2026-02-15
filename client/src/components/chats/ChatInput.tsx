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
        <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-md border border-primary bg-dark px-2 py-1">
                <label htmlFor="chat-recipient" className="text-xs text-gray-300">
                    Send to
                </label>
                <select
                    id="chat-recipient"
                    className="w-full rounded-md bg-darkHover px-2 py-1 text-sm outline-none"
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
            <div className="flex justify-between rounded-md border border-primary">
                <input
                    type="text"
                    className="w-full flex-grow rounded-md border-none bg-dark p-2 outline-none"
                    placeholder={
                        selectedRecipient
                            ? `Message to ${selectedRecipient.username}...`
                            : "Enter a message for everyone..."
                    }
                    ref={inputRef}
                />
                <button
                    className="flex items-center justify-center rounded-r-md bg-primary p-2 text-black"
                    type="submit"
                >
                    <LuSendHorizonal size={24} />
                </button>
            </div>
        </form>
    )
}

export default ChatInput
