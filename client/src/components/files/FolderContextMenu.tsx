import React from 'react';
import { useFileSystem } from '@/context/FileContext';

interface FolderContextMenuProps {
    x: number;
    y: number;
    folderId: string;
    onClose: () => void;
}

const FolderContextMenu: React.FC<FolderContextMenuProps> = ({ x, y, folderId, onClose }) => {
    const { renameDirectory, deleteDirectory } = useFileSystem();

    const handleRename = () => {
        const newName = prompt("Enter new folder name:");
        if (newName) {
            renameDirectory(folderId, newName);
        }
        onClose();
    };

    const handleDelete = () => {
        if (window.confirm("Are you sure you want to delete this folder and all its contents?")) {
            deleteDirectory(folderId);
        }
        onClose();
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: y,
                left: x,
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '2px 2px 5px rgba(0,0,0,0.15)',
                zIndex: 1000,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <ul style={{ listStyle: 'none', margin: 0, padding: '5px' }}>
                <li style={{ padding: '5px 10px', cursor: 'pointer' }} onClick={handleRename}>
                    Rename
                </li>
                <li style={{ padding: '5px 10px', cursor: 'pointer' }} onClick={handleDelete}>
                    Delete
                </li>
            </ul>
        </div>
    );
};

export default FolderContextMenu;