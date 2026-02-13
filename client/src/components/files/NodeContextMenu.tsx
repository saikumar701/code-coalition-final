import { useFileSystem } from "@/context/FileContext"
import { useEffect, useRef } from "react"

interface NodeContextMenuProps {
    x: number
    y: number
    nodeId: string
    nodeType: "file" | "directory"
    terminalPath: string
    onClose: () => void
    onOpenInTerminal: (path: string) => void
}

function NodeContextMenu({
    x,
    y,
    nodeId,
    nodeType,
    terminalPath,
    onClose,
    onOpenInTerminal,
}: NodeContextMenuProps) {
    const { renameDirectory, deleteDirectory, renameFile, deleteFile } = useFileSystem()
    const menuRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (menuRef.current && target && !menuRef.current.contains(target)) {
                onClose()
            }
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose()
        }

        document.addEventListener("mousedown", handleClickOutside)
        document.addEventListener("keydown", handleEscape)

        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
            document.removeEventListener("keydown", handleEscape)
        }
    }, [onClose])

    const handleRename = () => {
        const label = nodeType === "directory" ? "folder" : "file"
        const newName = prompt(`Enter new ${label} name:`)
        if (!newName) {
            onClose()
            return
        }

        if (nodeType === "directory") {
            renameDirectory(nodeId, newName)
        } else {
            renameFile(nodeId, newName)
        }
        onClose()
    }

    const handleDelete = () => {
        const label = nodeType === "directory" ? "folder and all its contents" : "file"
        if (!window.confirm(`Are you sure you want to delete this ${label}?`)) {
            onClose()
            return
        }

        if (nodeType === "directory") {
            deleteDirectory(nodeId)
        } else {
            deleteFile(nodeId)
        }
        onClose()
    }

    const handleOpenInTerminal = () => {
        onOpenInTerminal(terminalPath)
        onClose()
    }

    const menuItemClassName =
        "w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-[#3c3c3c] transition-colors"

    return (
        <div
            ref={menuRef}
            style={{ top: y, left: x }}
            className="fixed z-[1200] min-w-[190px] rounded-md border border-gray-700 bg-[#252526] py-1 shadow-lg"
            onClick={(event) => event.stopPropagation()}
        >
            <button className={menuItemClassName} onClick={handleRename}>
                Rename
            </button>
            <button className={menuItemClassName} onClick={handleDelete}>
                Delete
            </button>
            <button className={menuItemClassName} onClick={handleOpenInTerminal}>
                Open in Terminal
            </button>
        </div>
    )
}

export default NodeContextMenu
