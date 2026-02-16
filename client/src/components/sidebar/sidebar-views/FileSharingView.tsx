import { useFileShare } from "@/context/FileShareContext"
import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import useResponsive from "@/hooks/useResponsive"
import { FileShareRecipient, SharedFileEntry } from "@/types/fileShare"
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { FiDownload, FiExternalLink, FiUpload } from "react-icons/fi"

const maxFileShareEnvValue = Number(import.meta.env.VITE_FILE_SHARE_MAX_MB || "20")
const maxFileShareSizeMb =
    Number.isFinite(maxFileShareEnvValue) && maxFileShareEnvValue > 0
        ? maxFileShareEnvValue
        : 20
const maxFileShareSizeBytes = maxFileShareSizeMb * 1024 * 1024

const formatFileSize = (sizeInBytes: number): string => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`
}

const getTransferLabel = (
    transfer: SharedFileEntry,
    recipientNameBySocketId: Record<string, string>,
): string => {
    if (transfer.direction === "sent") {
        if (!transfer.recipientSocketId) {
            return "You shared this file with all users"
        }
        const recipientName =
            recipientNameBySocketId[transfer.recipientSocketId] || "selected user"
        return `You shared this file with ${recipientName}`
    }

    if (transfer.recipientSocketId) {
        return `${transfer.senderUsername} shared this file with you`
    }

    return `${transfer.senderUsername} shared this file with everyone`
}

const FileSharingView = () => {
    const { viewHeight } = useResponsive()
    const { users, currentUser } = useAppContext()
    const { socket } = useSocket()
    const { transfers, sendFileShare, setIsNewFileShare } = useFileShare()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [selectedRecipient, setSelectedRecipient] = useState<FileShareRecipient>("all")
    const [isSending, setIsSending] = useState(false)

    const availableRecipients = useMemo(
        () =>
            users.filter(
                (user) =>
                    Boolean(user.socketId) &&
                    user.socketId !== socket.id &&
                    user.username !== currentUser.username,
            ),
        [currentUser.username, socket.id, users],
    )

    const recipientNameBySocketId = useMemo(
        () =>
            availableRecipients.reduce<Record<string, string>>((acc, user) => {
                acc[user.socketId] = user.username
                return acc
            }, {}),
        [availableRecipients],
    )

    useEffect(() => {
        setIsNewFileShare(false)
    }, [setIsNewFileShare])

    const resetSelection = () => {
        setSelectedFile(null)
        if (inputRef.current) {
            inputRef.current.value = ""
        }
    }

    const handleSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            setSelectedFile(null)
            return
        }
        setSelectedFile(file)
    }

    const handleSendFile = async () => {
        if (!selectedFile) {
            toast.error("Select a file to share")
            return
        }

        if (selectedFile.size > maxFileShareSizeBytes) {
            toast.error(`File size exceeds ${maxFileShareSizeMb}MB limit`)
            return
        }

        try {
            setIsSending(true)
            await sendFileShare(selectedFile, selectedRecipient)
            const recipientLabel =
                selectedRecipient === "all"
                    ? "all users"
                    : recipientNameBySocketId[selectedRecipient] || "selected user"
            toast.success(`Shared ${selectedFile.name} with ${recipientLabel}`)
            resetSelection()
        } catch (error) {
            toast.error("Failed to share file")
            console.error(error)
        } finally {
            setIsSending(false)
        }
    }

    const createObjectUrl = async (dataUrl: string): Promise<string> => {
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        return URL.createObjectURL(blob)
    }

    const handleDownload = async (transfer: SharedFileEntry) => {
        try {
            const objectUrl = await createObjectUrl(transfer.dataUrl)
            const anchor = document.createElement("a")
            anchor.href = objectUrl
            anchor.download = transfer.name
            document.body.append(anchor)
            anchor.click()
            anchor.remove()
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
        } catch (error) {
            toast.error("Unable to download this file")
            console.error(error)
        }
    }

    const handleOpen = async (transfer: SharedFileEntry) => {
        try {
            const objectUrl = await createObjectUrl(transfer.dataUrl)
            const popup = window.open(objectUrl, "_blank", "noopener,noreferrer")
            if (!popup) {
                toast.error("Popup blocked. Use download instead.")
            }
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
        } catch (error) {
            toast.error("Unable to open this file")
            console.error(error)
        }
    }

    return (
        <div
            className="sidebar-modern-view flex max-h-full min-h-[400px] w-full flex-col gap-3 p-4"
            style={{ height: viewHeight }}
        >
            <div className="sidebar-modern-header">
                <h1 className="view-title m-0 border-none pb-0">File Sharing</h1>
            </div>

            <div className="sidebar-modern-card">
                <div className="mb-3 flex flex-col gap-3">
                    <input
                        ref={inputRef}
                        type="file"
                        onChange={handleSelectFile}
                        className="sidebar-modern-control p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-200/80 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-cyan-950"
                    />
                    <select
                        className="sidebar-modern-control p-2 text-sm"
                        value={selectedRecipient}
                        onChange={(event) =>
                            setSelectedRecipient(event.target.value as FileShareRecipient)
                        }
                    >
                        <option value="all">Share with all users</option>
                        {availableRecipients.map((user) => (
                            <option key={user.socketId} value={user.socketId}>
                                Share privately with {user.username}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    className="sidebar-modern-btn sidebar-modern-btn--primary flex w-full"
                    onClick={handleSendFile}
                    disabled={!selectedFile || isSending}
                >
                    <FiUpload />
                    {isSending ? "Sharing..." : "Share file"}
                </button>
                <p className="ui-muted-text mt-2 text-xs">
                    Any file type is supported. Max file size: {maxFileShareSizeMb}MB.
                </p>
                {selectedFile && (
                    <p className="ui-muted-text mt-1 text-xs">
                        Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </p>
                )}
            </div>

            <div className="sidebar-modern-scroll min-h-0 flex-1 overflow-auto p-2">
                {transfers.length === 0 ? (
                    <p className="ui-muted-text p-2 text-sm">
                        Shared files will appear here.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {transfers.map((transfer) => (
                            <div
                                key={`${transfer.id}-${transfer.direction}`}
                                className="sidebar-modern-list-item p-3"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="max-w-[70%] truncate text-sm font-medium">
                                        {transfer.name}
                                    </p>
                                    <span className="ui-muted-text text-xs">
                                        {formatFileSize(transfer.size)}
                                    </span>
                                </div>
                                <p className="ui-muted-text mt-1 text-xs">
                                    {getTransferLabel(transfer, recipientNameBySocketId)}
                                </p>
                                <p className="ui-muted-text mt-1 text-xs">
                                    {new Date(transfer.sentAt).toLocaleString()}
                                </p>
                                <div className="mt-3 flex gap-2">
                                    <button
                                        type="button"
                                        className="sidebar-modern-btn px-2 py-1 text-xs"
                                        onClick={() => handleOpen(transfer)}
                                    >
                                        <FiExternalLink />
                                        Open
                                    </button>
                                    <button
                                        type="button"
                                        className="sidebar-modern-btn px-2 py-1 text-xs"
                                        onClick={() => handleDownload(transfer)}
                                    >
                                        <FiDownload />
                                        Download
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default FileSharingView
