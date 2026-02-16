import React, { useState } from "react"
import { FileSystemItem, Id } from "@/types/file"
import { useFileSystem } from "@/context/FileContext"
import { getIconClassName } from "@/utils/getIconClassName"
import { Icon } from "@iconify/react"
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen } from "lucide-react"
import NodeContextMenu from "./NodeContextMenu"

const iconMap: { [key: string]: string } = {
    tsx: "",
    js: "",
    json: "",
    md: "",
}

interface TreeNodeProps {
    node: FileSystemItem
    selectedDirId: Id
    pathSegments: string[]
    parentDirectoryId: Id
    onSelectDirectory: (id: Id) => void
    onOpenInTerminal: (path: string) => void
}

const TreeNode: React.FC<TreeNodeProps> = ({
    node,
    selectedDirId,
    pathSegments,
    parentDirectoryId,
    onSelectDirectory,
    onOpenInTerminal,
}) => {
    const { toggleDirectory, openFile, activeFile } = useFileSystem()
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY })
    }

    const closeContextMenu = () => {
        setContextMenu(null)
    }

    const currentPath = [...pathSegments, node.name].join("/")
    const terminalPath = node.type === "directory" ? currentPath : pathSegments.join("/")
    const directoryRowClassName = `explorer-row mb-0.5 flex cursor-pointer items-center rounded-lg border px-2 py-1.5 text-base transition-all ${
        selectedDirId === node.id
            ? "explorer-row--active"
            : "border-transparent"
    }`

    if (node.type === "directory") {
        return (
            <div onContextMenu={handleContextMenu} onClick={closeContextMenu}>
                <div
                    className={directoryRowClassName}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSelectDirectory(node.id)
                        toggleDirectory(node.id)
                    }}
                >
                    {node.isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    {node.isOpen ? <FolderOpen size={20} /> : <FolderIcon size={20} />}
                    <span className="ml-2 truncate">{node.name}</span>
                </div>
                {node.isOpen &&
                    node.children &&
                    node.children.map((child) => (
                        <div key={child.id} className="explorer-indent ml-3 border-l pl-2">
                            <TreeNode
                                node={child}
                                selectedDirId={selectedDirId}
                                pathSegments={[...pathSegments, node.name]}
                                parentDirectoryId={node.id}
                                onSelectDirectory={onSelectDirectory}
                                onOpenInTerminal={onOpenInTerminal}
                            />
                        </div>
                    ))}
                {contextMenu && (
                    <NodeContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        nodeId={node.id}
                        nodeType="directory"
                        terminalPath={terminalPath}
                        onOpenInTerminal={onOpenInTerminal}
                        onClose={closeContextMenu}
                    />
                )}
            </div>
        )
    }

    const extension = node.name.split(".").pop() || ""
    const icon = iconMap[extension] || ""
    const isSelected = activeFile?.id === node.id

    return (
        <div
            className={`explorer-row mb-0.5 flex cursor-pointer items-center rounded-lg border px-2 py-1.5 text-base transition-all ${
                isSelected
                    ? "explorer-row--active"
                    : "border-transparent"
            }`}
            onClick={() => {
                onSelectDirectory(parentDirectoryId)
                openFile(node.id)
            }}
            onContextMenu={handleContextMenu}
        >
            <Icon
                icon={getIconClassName(node.name)}
                fontSize={20}
                className="mr-2 flex-shrink-0 opacity-95"
            />
            <span className="ml-2 truncate">{icon} {node.name}</span>
            {contextMenu && (
                <NodeContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    nodeId={node.id}
                    nodeType="file"
                    terminalPath={terminalPath}
                    onOpenInTerminal={onOpenInTerminal}
                    onClose={closeContextMenu}
                />
            )}
        </div>
    )
}

export default TreeNode
