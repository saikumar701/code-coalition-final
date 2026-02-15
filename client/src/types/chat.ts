interface ChatMessage {
    id: string
    message: string
    username: string
    timestamp: string
    isDirect: boolean
    recipientSocketId: string | null
    recipientUsername: string | null
}

interface ChatContext {
    messages: ChatMessage[]
    setMessages: (
        messages: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[]),
    ) => void
    isNewMessage: boolean
    setIsNewMessage: (isNewMessage: boolean) => void
    lastScrollHeight: number
    setLastScrollHeight: (lastScrollHeight: number) => void
}

export { ChatContext, ChatMessage }
