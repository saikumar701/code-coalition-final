import { useEffect, useRef, useState } from "react"
import { useFileSystem } from "@/context/FileContext"
import useResponsive from "@/hooks/useResponsive"
import { FileSystemItem, Id } from "@/types/file"
import { getFileById, sortFileSystemItem } from "@/utils/file"
import cn from "classnames"
import {
    FileArchive,
    FilePlus,
    FileUp,
    Folder as FolderIcon,
    FolderPlus,
    FolderUp,
    Upload,
} from "lucide-react"
import DropZone from "../DropZone"
import TreeNode from "./TreeNode"

function FileStructureView() {
    const {
        fileStructure,
        createFile,
        createDirectory,
        collapseDirectories,
        importFile,
        importZip,
    } = useFileSystem()

    const explorerRef = useRef<HTMLDivElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const folderInputRef = useRef<HTMLInputElement | null>(null)
    const [selectedDirId, setSelectedDirId] = useState<Id>(fileStructure.id)
    const { minHeightReached } = useResponsive()

    useEffect(() => {
        setSelectedDirId(fileStructure.id)
    }, [fileStructure.id])

    const resolveSelectedDirectoryId = () => selectedDirId || fileStructure.id

    const readFileContent = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (event) => {
                resolve((event.target?.result as string) || "")
            }
            reader.onerror = reject
            reader.readAsText(file)
        })
    }

    const openPathInTerminal = (relativePath: string) => {
        window.dispatchEvent(
            new CustomEvent("terminal:cd", {
                detail: { path: relativePath || "." },
            }),
        )
    }

    const getOrCreateDirectoryId = (
        directoryPathCache: Map<string, string>,
        importRootId: Id,
        pathFromImportRoot: string,
        directoryName: string,
        parentId: Id,
    ) => {
        const cacheKey = `${importRootId}:${pathFromImportRoot}`
        const cachedDirectoryId = directoryPathCache.get(cacheKey)
        if (cachedDirectoryId) return cachedDirectoryId

        const parentNode = getFileById(fileStructure, parentId)
        const existingDirectory =
            parentNode?.type === "directory"
                ? parentNode.children?.find(
                      (item) => item.type === "directory" && item.name === directoryName,
                  )
                : null

        const directoryId = existingDirectory?.id || createDirectory(parentId, directoryName)
        directoryPathCache.set(cacheKey, directoryId)
        return directoryId
    }

    const handleCreateFile = () => {
        const fileName = prompt("Enter file name")
        if (!fileName) return
        createFile(resolveSelectedDirectoryId(), fileName)
    }

    const handleCreateDirectory = () => {
        const dirName = prompt("Enter directory name")
        if (!dirName) return
        createDirectory(resolveSelectedDirectoryId(), dirName)
    }

    const handleImportFile = () => {
        fileInputRef.current?.click()
    }

    const handleImportFolder = () => {
        folderInputRef.current?.click()
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return

        const targetDirectoryId = resolveSelectedDirectoryId()
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index]
            const content = await readFileContent(file)
            importFile(targetDirectoryId, file.name, content)
        }

        event.target.value = ""
    }

    const handleFolderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return

        const targetDirectoryId = resolveSelectedDirectoryId()
        const directoryPathCache = new Map<string, string>()

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index]
            const content = await readFileContent(file)
            const relativePath = (file.webkitRelativePath || file.name)
                .split("/")
                .filter(Boolean)
            if (relativePath.length === 0) continue

            const directoryParts = relativePath.slice(0, -1)
            const fileName = relativePath[relativePath.length - 1]

            let currentParentId = targetDirectoryId
            let traversedPath = ""

            for (const dirPart of directoryParts) {
                traversedPath = traversedPath ? `${traversedPath}/${dirPart}` : dirPart
                currentParentId = getOrCreateDirectoryId(
                    directoryPathCache,
                    targetDirectoryId,
                    traversedPath,
                    dirPart,
                    currentParentId,
                )
            }

            importFile(currentParentId, fileName, content)
        }

        event.target.value = ""
    }

    const readDirectoryEntries = async (reader: any): Promise<any[]> => {
        const entries: any[] = []
        let batch: any[] = await new Promise((resolve) => reader.readEntries(resolve))

        while (batch.length > 0) {
            entries.push(...batch)
            batch = await new Promise((resolve) => reader.readEntries(resolve))
        }

        return entries
    }

    const processEntry = async (entry: any, parentId: string): Promise<void> => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve) => entry.file(resolve))
            const text = await file.text()
            importFile(parentId, file.name, text)
            return
        }

        if (entry.isDirectory) {
            const newDirectoryId = createDirectory(parentId, entry.name)
            const reader = entry.createReader()
            const entries = await readDirectoryEntries(reader)
            for (const child of entries) {
                await processEntry(child, newDirectoryId)
            }
        }
    }

    const handleDrop = async (event: React.DragEvent) => {
        event.preventDefault()
        const targetDirectoryId = resolveSelectedDirectoryId()
        const items = event.dataTransfer.items

        for (let index = 0; index < items.length; index += 1) {
            const entry = (items[index] as any).webkitGetAsEntry?.()
            if (entry) {
                await processEntry(entry, targetDirectoryId)
            }
        }
    }

    const sortedFileStructure = sortFileSystemItem(fileStructure)

    return (
        <div className="flex h-full flex-grow flex-col bg-[#1E1E1E] text-white">
            <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
                accept="*/*"
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                onChange={handleFolderChange}
                className="hidden"
                {...({ webkitdirectory: "", directory: "" } as any)}
            />

            <div className="flex items-center justify-between border-b border-gray-800 bg-[#252526] px-3 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Explorer
                </h2>
                <div className="flex gap-1">
                    <button
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={handleCreateFile}
                        title="New File"
                    >
                        <FilePlus size={16} />
                    </button>
                    <button
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={handleCreateDirectory}
                        title="New Folder"
                    >
                        <FolderPlus size={16} />
                    </button>
                    <button
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={handleImportFile}
                        title="Import Files"
                    >
                        <FileUp size={16} />
                    </button>
                    <button
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={handleImportFolder}
                        title="Import Folder"
                    >
                        <Upload size={16} />
                    </button>
                    <button
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={() => {
                            const input = document.createElement("input")
                            input.type = "file"
                            input.accept = ".zip"
                            input.onchange = (zipEvent) => {
                                const target = zipEvent.target as HTMLInputElement
                                if (target.files && target.files.length > 0) {
                                    importZip(target.files[0])
                                }
                            }
                            input.click()
                        }}
                        title="Import from Zip"
                    >
                        <FileArchive size={16} />
                    </button>
                    <button
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                        onClick={collapseDirectories}
                        title="Collapse Folders"
                    >
                        <FolderUp size={16} />
                    </button>
                </div>
            </div>

            <div className="p-2">
                <DropZone />
            </div>

            <div
                onDrop={handleDrop}
                onDragOver={(event) => event.preventDefault()}
                className={cn("flex-grow overflow-auto", {
                    "h-[calc(80vh-170px)]": !minHeightReached,
                    "h-[85vh]": minHeightReached,
                })}
                ref={explorerRef}
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        setSelectedDirId(fileStructure.id)
                    }
                }}
            >
                {sortedFileStructure.children && sortedFileStructure.children.length > 0 ? (
                    sortedFileStructure.children.map((item: FileSystemItem) => (
                        <TreeNode
                            key={item.id}
                            node={item}
                            selectedDirId={selectedDirId}
                            pathSegments={[]}
                            parentDirectoryId={fileStructure.id}
                            onSelectDirectory={setSelectedDirId}
                            onOpenInTerminal={openPathInTerminal}
                        />
                    ))
                ) : (
                    <div className="flex h-full flex-col items-center justify-center px-4 text-sm text-gray-500">
                        <FolderIcon size={48} className="mb-3 opacity-30" />
                        <p className="mb-2 text-center">No files yet</p>
                        <p className="text-center text-xs text-gray-600">
                            Create a new file or import from your device
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default FileStructureView
