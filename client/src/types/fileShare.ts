import { SocketId } from "./socket"

type FileShareRecipient = "all" | SocketId

interface SharedFilePayload {
    id: string
    name: string
    mimeType: string
    size: number
    dataUrl: string
    senderUsername: string
    senderSocketId: SocketId
    recipientSocketId: SocketId | null
    roomId: string
    sentAt: string
}

interface SharedFileEntry extends SharedFilePayload {
    direction: "sent" | "received"
}

interface FileShareContext {
    transfers: SharedFileEntry[]
    isNewFileShare: boolean
    setIsNewFileShare: (isNewFileShare: boolean) => void
    sendFileShare: (file: File, recipient: FileShareRecipient) => Promise<void>
}

export type {
    FileShareContext,
    FileShareRecipient,
    SharedFileEntry,
    SharedFilePayload,
}
