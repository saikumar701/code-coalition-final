import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import EditorComponent from "../components/editor/EditorComponent"
import DrawingEditor from "../components/drawing/DrawingEditor"
import LeftSidebar from "../components/LeftSidebar"
import FileStructureView from "../components/files/FileStructureView"
import ChatsView from "../components/sidebar/sidebar-views/ChatsView"
import FileSharingView from "../components/sidebar/sidebar-views/FileSharingView"
import CopilotView from "../components/sidebar/sidebar-views/CopilotView"
import SettingsView from "../components/sidebar/sidebar-views/SettingsView"
import UsersView from "../components/sidebar/sidebar-views/UsersView"
import TerminalView from "../components/terminal-view"
import TopToolbar from "../components/TopToolbar"
import { useState, useEffect, useRef } from "react"
import { Code2, Pencil } from "lucide-react"
import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent } from "@/types/socket"
import { USER_STATUS } from "@/types/user"
import { useParams } from "react-router-dom"

const EditorPage = () => {
    const [activeSidebarItem, setActiveSidebarItem] = useState("files");
    const [activeEditorTab, setActiveEditorTab] = useState<"code" | "draw">("code");
    const [editorKey, setEditorKey] = useState(0);
    const { roomId: routeRoomId = "" } = useParams();
    const { socket } = useSocket();
    const { currentUser, setCurrentUser, status, setStatus } = useAppContext();
    const generatedGuestRef = useRef(`guest-${Math.random().toString(36).slice(2, 8)}`);

    // Force editor to remount when switching tabs or files
    useEffect(() => {
        setEditorKey(prev => prev + 1);
    }, [activeEditorTab]);

    // Ensure direct /editor/:roomId visits still join the room so terminal/workspace sync works.
    useEffect(() => {
        if (!routeRoomId) return;

        const username = currentUser.username.trim() || generatedGuestRef.current;
        const joinPayload = { ...currentUser, roomId: routeRoomId, username };
        const isJoinedInThisRoom =
            status === USER_STATUS.JOINED && currentUser.roomId === routeRoomId;

        if (
            currentUser.roomId !== routeRoomId ||
            currentUser.username !== username
        ) {
            setCurrentUser(joinPayload);
        }

        if (isJoinedInThisRoom || status === USER_STATUS.ATTEMPTING_JOIN) {
            return;
        }

        setStatus(USER_STATUS.ATTEMPTING_JOIN);

        const sendJoin = () => {
            socket.emit(SocketEvent.JOIN_REQUEST, joinPayload);
        };

        if (socket.connected) {
            sendJoin();
            return;
        }

        socket.connect();
        socket.once("connect", sendJoin);

        return () => {
            socket.off("connect", sendJoin);
        };
    }, [
        currentUser,
        routeRoomId,
        setCurrentUser,
        setStatus,
        socket,
        status,
    ]);

    // Rejoin room after socket reconnect so terminal/workspace path remains correct.
    useEffect(() => {
        if (!routeRoomId) return;

        const handleReconnect = () => {
            if (status !== USER_STATUS.JOINED) return;
            const username = currentUser.username.trim() || generatedGuestRef.current;
            socket.emit(SocketEvent.JOIN_REQUEST, {
                ...currentUser,
                roomId: routeRoomId,
                username,
            });
        };

        socket.on("connect", handleReconnect);
        return () => {
            socket.off("connect", handleReconnect);
        };
    }, [currentUser, routeRoomId, socket, status]);

    const renderActiveSidebarView = () => {
        switch (activeSidebarItem) {
            case "files":
                return <FileStructureView />
            case "chat":
                return <ChatsView />
            case "file-sharing":
                return <FileSharingView />
            case "copilot":
                return <CopilotView />
            case "clients":
                return <UsersView />
            case "settings":
                return <SettingsView />
            default:
                return null
        }
    }

    return (
        <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
            <TopToolbar />
            <div className="flex flex-grow min-h-0">
                <LeftSidebar
                    onSelect={setActiveSidebarItem}
                    activeItem={activeSidebarItem}
                />
                
                <ResizablePanelGroup direction="horizontal" className="flex-grow">
                    {/* Sidebar Panel */}
                    <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
                        <div className="h-full bg-gray-800/50 border-r border-gray-700 overflow-auto">
                            {renderActiveSidebarView()}
                        </div>
                    </ResizablePanel>
                    
                    <ResizableHandle withHandle />
                    
                    {/* Main Editor and Terminal Area */}
                    <ResizablePanel defaultSize={80}>
                        <ResizablePanelGroup direction="vertical">
                            {/* Editor Panel */}
                            <ResizablePanel defaultSize={70} minSize={30}>
                                <div className="h-full flex flex-col bg-gray-900">
                                    {/* Tab Bar */}
                                    <div className="flex items-center gap-1 bg-gray-800 border-b border-gray-700 px-2 py-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => setActiveEditorTab("code")}
                                            className={`
                                                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                                                transition-all duration-200
                                                ${activeEditorTab === "code" 
                                                    ? "bg-gray-700 text-white shadow-sm" 
                                                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
                                                }
                                            `}
                                        >
                                            <Code2 size={16} />
                                            Code Editor
                                        </button>
                                        <button
                                            onClick={() => setActiveEditorTab("draw")}
                                            className={`
                                                flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
                                                transition-all duration-200
                                                ${activeEditorTab === "draw" 
                                                    ? "bg-gray-700 text-white shadow-sm" 
                                                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
                                                }
                                            `}
                                        >
                                            <Pencil size={16} />
                                            Drawing Board
                                        </button>
                                    </div>

                                    {/* Tab Content - with key to force remount */}
                                    <div className="flex-grow min-h-0 relative bg-gray-900 overflow-hidden">
                                        {activeEditorTab === "code" && (
                                            <div key={`editor-${editorKey}`} className="absolute inset-0">
                                                <EditorComponent />
                                            </div>
                                        )}
                                        {activeEditorTab === "draw" && (
                                            <div key={`draw-${editorKey}`} className="absolute inset-0">
                                                <DrawingEditor />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </ResizablePanel>
                            
                            <ResizableHandle withHandle />
                            
                            {/* Terminal Panel */}
                            <ResizablePanel defaultSize={30} minSize={20} maxSize={60}>
                                <div className="h-full overflow-hidden">
                                    <TerminalView />
                                </div>
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
};

export default EditorPage;
