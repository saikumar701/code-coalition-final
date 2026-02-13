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

    if (node.type === "directory") {
        return (
            <div onContextMenu={handleContextMenu} onClick={closeContextMenu}>
                <div
                    className={`flex items-center cursor-pointer rounded-sm ${
                        selectedDirId === node.id
                            ? "bg-blue-500/20 border-l-2 border-blue-500"
                            : "hover:bg-gray-700"
                    }`}
                    onClick={(e) => {
                        e.stopPropagation()
                        onSelectDirectory(node.id)
                        toggleDirectory(node.id)
                    }}
                >
                    {node.isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {node.isOpen ? <FolderOpen size={16} /> : <FolderIcon size={16} />}
                    <span className="ml-2">{node.name}</span>
                </div>
                {node.isOpen &&
                    node.children &&
                    node.children.map((child) => (
                        <div key={child.id} className="ml-4">
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
            className={`flex items-center cursor-pointer ${
                isSelected
                    ? "bg-blue-500/30 border-l-2 border-blue-500"
                    : "hover:bg-gray-700"
            }`}
            onClick={() => {
                onSelectDirectory(parentDirectoryId)
                openFile(node.id)
            }}
            onContextMenu={handleContextMenu}
        >
            <Icon
                icon={getIconClassName(node.name)}
                fontSize={16}
                className="mr-2 flex-shrink-0"
            />
            <span className="ml-2">{icon} {node.name}</span>
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
