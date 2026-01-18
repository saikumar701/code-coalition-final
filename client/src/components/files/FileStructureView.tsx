import { useAppContext } from "@/context/AppContext";
import { useFileSystem } from "@/context/FileContext";
import { useViews } from "@/context/ViewContext";
import { useContextMenu } from "@/hooks/useContextMenu";
import useWindowDimensions from "@/hooks/useWindowDimensions";
import { ACTIVITY_STATE } from "@/types/app";
import { FileSystemItem, Id } from "@/types/file";
import { sortFileSystemItem } from "@/utils/file";
import { getIconClassName } from "@/utils/getIconClassName";
import { Icon } from "@iconify/react";
import cn from "classnames";
import {
    ChevronDown,
    ChevronRight,
    Folder as FolderIcon,
    FolderOpen,
    Trash2,
    Pencil,
    FilePlus,
    FolderPlus,
    FolderUp,
} from "lucide-react";
import { MouseEvent, useEffect, useRef, useState } from "react";
import RenameView from "./RenameView";
import useResponsive from "@/hooks/useResponsive";

function FileStructureView() {
    const { fileStructure, createFile, createDirectory, collapseDirectories } =
        useFileSystem();
    const explorerRef = useRef<HTMLDivElement | null>(null);
    const [selectedDirId, setSelectedDirId] = useState<Id | null>(null);
    const { minHeightReached } = useResponsive();

    const handleClickOutside = (e: MouseEvent) => {
        if (
            explorerRef.current &&
            !explorerRef.current.contains(e.target as Node)
        ) {
            setSelectedDirId(fileStructure.id);
        }
    };

    const handleCreateFile = () => {
        const fileName = prompt("Enter file name");
        if (fileName) {
            const parentDirId: Id = selectedDirId || fileStructure.id;
            createFile(parentDirId, fileName);
        }
    };

    const handleCreateDirectory = () => {
        const dirName = prompt("Enter directory name");
        if (dirName) {
            const parentDirId: Id = selectedDirId || fileStructure.id;
            createDirectory(parentDirId, dirName);
        }
    };

    const sortedFileStructure = sortFileSystemItem(fileStructure);

    return (
        <div
            onClick={handleClickOutside}
            className="flex flex-grow flex-col bg-dark/30 text-white/80"
        >
            <div className="flex items-center justify-between p-2 border-b border-white/10">
                <h2 className="text-lg font-semibold">Explorer</h2>
                <div className="flex gap-2">
                    <button
                        className="p-1 rounded-md hover:bg-white/10"
                        onClick={handleCreateFile}
                        title="Create File"
                    >
                        <FilePlus size={18} />
                    </button>
                    <button
                        className="p-1 rounded-md hover:bg-white/10"
                        onClick={handleCreateDirectory}
                        title="Create Directory"
                    >
                        <FolderPlus size={18} />
                    </button>
                    <button
                        className="p-1 rounded-md hover:bg-white/10"
                        onClick={collapseDirectories}
                        title="Collapse All Directories"
                    >
                        <FolderUp size={18} />
                    </button>
                </div>
            </div>
            <div
                className={cn("flex-grow overflow-auto p-2", {
                    "h-[calc(80vh-170px)]": !minHeightReached,
                    "h-[85vh]": minHeightReached,
                })}
                ref={explorerRef}
            >
                {sortedFileStructure.children &&
                    sortedFileStructure.children.map((item) => (
                        <Directory
                            key={item.id}
                            item={item}
                            setSelectedDirId={setSelectedDirId}
                        />
                    ))}
            </div>
        </div>
    );
}

function Directory({
    item,
    setSelectedDirId,
}: {
    item: FileSystemItem;
    setSelectedDirId: (id: Id) => void;
}) {
    const [isEditing, setEditing] = useState<boolean>(false);
    const dirRef = useRef<HTMLDivElement | null>(null);
    const { coords, menuOpen, setMenuOpen } = useContextMenu({
        ref: dirRef,
    });
    const { deleteDirectory, toggleDirectory } = useFileSystem();

    const handleDirClick = (dirId: string) => {
        setSelectedDirId(dirId);
        toggleDirectory(dirId);
    };

    const handleRenameDirectory = (e: MouseEvent) => {
        e.stopPropagation();
        setMenuOpen(false);
        setEditing(true);
    };

    const handleDeleteDirectory = (e: MouseEvent, id: Id) => {
        e.stopPropagation();
        setMenuOpen(false);
        const isConfirmed = confirm(
            `Are you sure you want to delete directory?`
        );
        if (isConfirmed) {
            deleteDirectory(id);
        }
    };

    useEffect(() => {
        const dirNode = dirRef.current;
        if (!dirNode) return;
        dirNode.tabIndex = 0;
        const handleF2 = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "F2") {
                setEditing(true);
            }
        };
        dirNode.addEventListener("keydown", handleF2);
        return () => {
            dirNode.removeEventListener("keydown", handleF2);
        };
    }, []);

    if (item.type === "file") {
        return <File item={item} setSelectedDirId={setSelectedDirId} />;
    }

    return (
        <div className="text-sm">
            <div
                className="flex items-center w-full px-2 py-1 rounded-md cursor-pointer hover:bg-white/5"
                onClick={() => handleDirClick(item.id)}
                ref={dirRef}
            >
                {item.isOpen ? (
                    <ChevronDown size={16} className="mr-1 min-w-fit" />
                ) : (
                    <ChevronRight size={16} className="mr-1 min-w-fit" />
                )}
                {item.isOpen ? (
                    <FolderOpen size={16} className="mr-2 min-w-fit text-sky-400" />
                ) : (
                    <FolderIcon size={16} className="mr-2 min-w-fit text-sky-400" />
                )}
                {isEditing ? (
                    <RenameView
                        id={item.id}
                        preName={item.name}
                        type="directory"
                        setEditing={setEditing}
                    />
                ) : (
                    <p
                        className="flex-grow overflow-hidden truncate"
                        title={item.name}
                    >
                        {item.name}
                    </p>
                )}
            </div>
            <div
                className={cn(
                    "pl-4 border-l border-white/10 ml-3",
                    { hidden: !item.isOpen },
                    { block: item.isOpen }
                )}
            >
                {item.children &&
                    item.children.map((child) => (
                        <Directory
                            key={child.id}
                            item={child}
                            setSelectedDirId={setSelectedDirId}
                        />
                    ))}
            </div>

            {menuOpen && (
                <DirectoryMenu
                    handleDeleteDirectory={handleDeleteDirectory}
                    handleRenameDirectory={handleRenameDirectory}
                    id={item.id}
                    left={coords.x}
                    top={coords.y}
                />
            )}
        </div>
    );
}

const File = ({
    item,
    setSelectedDirId,
}: {
    item: FileSystemItem;
    setSelectedDirId: (id: Id) => void;
}) => {
    const { deleteFile, openFile } = useFileSystem();
    const [isEditing, setEditing] = useState<boolean>(false);
    const { setIsSidebarOpen } = useViews();
    const { isMobile } = useWindowDimensions();
    const { activityState, setActivityState } = useAppContext();
    const fileRef = useRef<HTMLDivElement | null>(null);
    const { menuOpen, coords, setMenuOpen } = useContextMenu({
        ref: fileRef,
    });

    const handleFileClick = (fileId: string) => {
        if (isEditing) return;
        setSelectedDirId(fileId);
        openFile(fileId);
        if (isMobile) {
            setIsSidebarOpen(false);
        }
        if (activityState === ACTIVITY_STATE.DRAWING) {
            setActivityState(ACTIVITY_STATE.CODING);
        }
    };

    const handleRenameFile = (e: MouseEvent) => {
        e.stopPropagation();
        setEditing(true);
        setMenuOpen(false);
    };

    const handleDeleteFile = (e: MouseEvent, id: Id) => {
        e.stopPropagation();
        setMenuOpen(false);
        const isConfirmed = confirm(`Are you sure you want to delete file?`);
        if (isConfirmed) {
            deleteFile(id);
        }
    };

    useEffect(() => {
        const fileNode = fileRef.current;
        if (!fileNode) return;
        fileNode.tabIndex = 0;
        const handleF2 = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === "F2") {
                setEditing(true);
            }
        };
        fileNode.addEventListener("keydown", handleF2);
        return () => {
            fileNode.removeEventListener("keydown", handleF2);
        };
    }, []);

    return (
        <div
            className="flex items-center w-full px-2 py-1 rounded-md cursor-pointer hover:bg-white/5"
            onClick={() => handleFileClick(item.id)}
            ref={fileRef}
        >
            <Icon
                icon={getIconClassName(item.name)}
                fontSize={16}
                className="mr-2 min-w-fit"
            />
            {isEditing ? (
                <RenameView
                    id={item.id}
                    preName={item.name}
                    type="file"
                    setEditing={setEditing}
                />
            ) : (
                <p
                    className="flex-grow overflow-hidden truncate"
                    title={item.name}
                >
                    {item.name}
                </p>
            )}

            {menuOpen && (
                <FileMenu
                    top={coords.y}
                    left={coords.x}
                    id={item.id}
                    handleRenameFile={handleRenameFile}
                    handleDeleteFile={handleDeleteFile}
                />
            )}
        </div>
    );
};

const Menu = ({
    top,
    left,
    children,
}: {
    top: number;
    left: number;
    children: React.ReactNode;
}) => {
    return (
        <div
            className="absolute z-50 w-40 rounded-md border border-white/10 bg-[#1c1c1c] shadow-lg"
            style={{ top, left }}
        >
            {children}
        </div>
    );
};

const MenuItem = ({
    onClick,
    children,
    className,
}: {
    onClick: (e: MouseEvent) => void;
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center w-full gap-2 px-3 py-2 text-sm text-left text-white/80 hover:bg-white/5",
                className
            )}
        >
            {children}
        </button>
    );
};

const FileMenu = ({
    top,
    left,
    id,
    handleRenameFile,
    handleDeleteFile,
}: {
    top: number;
    left: number;
    id: Id;
    handleRenameFile: (e: MouseEvent) => void;
    handleDeleteFile: (e: MouseEvent, id: Id) => void;
}) => {
    return (
        <Menu top={top} left={left}>
            <MenuItem onClick={handleRenameFile}>
                <Pencil size={16} />
                Rename
            </MenuItem>
            <MenuItem
                onClick={(e) => handleDeleteFile(e, id)}
                className="text-red-500"
            >
                <Trash2 size={16} />
                Delete
            </MenuItem>
        </Menu>
    );
};

const DirectoryMenu = ({
    top,
    left,
    id,
    handleRenameDirectory,
    handleDeleteDirectory,
}: {
    top: number;
    left: number;
    id: Id;
    handleRenameDirectory: (e: MouseEvent) => void;
    handleDeleteDirectory: (e: MouseEvent, id: Id) => void;
}) => {
    return (
        <Menu top={top} left={left}>
            <MenuItem onClick={handleRenameDirectory}>
                <Pencil size={16} />
                Rename
            </MenuItem>
            <MenuItem
                onClick={(e) => handleDeleteDirectory(e, id)}
                className="text-red-500"
            >
                <Trash2 size={16} />
                Delete
            </MenuItem>
        </Menu>
    );
};

export default FileStructureView;