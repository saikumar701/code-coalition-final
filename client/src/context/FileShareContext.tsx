import {
    FileShareContext as FileShareContextType,
    FileShareRecipient,
    SharedFileEntry,
    SharedFilePayload,
} from "@/types/fileShare"
import { SocketEvent } from "@/types/socket"
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { v4 as uuidv4 } from "uuid"
import { useAppContext } from "./AppContext"
import { useSocket } from "./SocketContext"

const FileShareContext = createContext<FileShareContextType | null>(null)

const MAX_TRANSFER_HISTORY = 10

const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = () => reject(new Error("Failed to read file"))
        reader.readAsDataURL(file)
    })

export const useFileShare = (): FileShareContextType => {
    const context = useContext(FileShareContext)
    if (!context) {
        throw new Error("useFileShare must be used within a FileShareContextProvider")
    }
    return context
}

function FileShareContextProvider({ children }: { children: ReactNode }) {
    const { socket } = useSocket()
    const { currentUser } = useAppContext()
    const [transfers, setTransfers] = useState<SharedFileEntry[]>([])
    const [isNewFileShare, setIsNewFileShare] = useState(false)

    const pushTransfer = useCallback((entry: SharedFileEntry) => {
        setTransfers((prevTransfers) => [entry, ...prevTransfers].slice(0, MAX_TRANSFER_HISTORY))
    }, [])

    const sendFileShare = useCallback(
        async (file: File, recipient: FileShareRecipient) => {
            if (!file) {
                throw new Error("No file selected")
            }

            const dataUrl = await readFileAsDataUrl(file)
            const sharedFilePayload: SharedFilePayload = {
                id: uuidv4(),
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                size: file.size,
                dataUrl,
                senderUsername: currentUser.username,
                senderSocketId: socket.id || "",
                recipientSocketId: recipient === "all" ? null : recipient,
                roomId: currentUser.roomId,
                sentAt: new Date().toISOString(),
            }

            socket.emit(SocketEvent.SEND_FILE_SHARE, {
                file: sharedFilePayload,
                recipientSocketId: recipient === "all" ? null : recipient,
            })

            pushTransfer({
                ...sharedFilePayload,
                direction: "sent",
            })
        },
        [currentUser.roomId, currentUser.username, pushTransfer, socket],
    )

    const handleReceiveFile = useCallback(
        ({ file }: { file: SharedFilePayload }) => {
            pushTransfer({
                ...file,
                direction: "received",
            })
            setIsNewFileShare(true)
            toast.success(`${file.senderUsername} shared ${file.name}`)
        },
        [pushTransfer],
    )

    const handleFileShareError = useCallback(({ message }: { message: string }) => {
        toast.error(message || "File sharing failed")
    }, [])

    useEffect(() => {
        socket.on(SocketEvent.RECEIVE_FILE_SHARE, handleReceiveFile)
        socket.on(SocketEvent.FILE_SHARE_ERROR, handleFileShareError)

        return () => {
            socket.off(SocketEvent.RECEIVE_FILE_SHARE, handleReceiveFile)
            socket.off(SocketEvent.FILE_SHARE_ERROR, handleFileShareError)
        }
    }, [handleFileShareError, handleReceiveFile, socket])

    const contextValue = useMemo(
        () => ({
            transfers,
            isNewFileShare,
            setIsNewFileShare,
            sendFileShare,
        }),
        [isNewFileShare, sendFileShare, transfers],
    )

    return <FileShareContext.Provider value={contextValue}>{children}</FileShareContext.Provider>
}

export { FileShareContextProvider }
export default FileShareContext
