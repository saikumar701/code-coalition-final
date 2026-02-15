import { Socket } from "socket.io"

type SocketId = string

enum SocketEvent {
	JOIN_REQUEST = "join-request",
	JOIN_ACCEPTED = "join-accepted",
	USER_JOINED = "user-joined",
	USER_UPDATED = "user-updated",
	USER_DISCONNECTED = "user-disconnected",
	SYNC_FILE_STRUCTURE = "sync-file-structure",
	DIRECTORY_CREATED = "directory-created",
	DIRECTORY_UPDATED = "directory-updated",
	DIRECTORY_RENAMED = "directory-renamed",
	DIRECTORY_DELETED = "directory-deleted",
	FILE_CREATED = "file-created",
	FILE_UPDATED = "file-updated",
	FILE_OPENED = "file-opened",
	FILE_RENAMED = "file-renamed",
	FILE_DELETED = "file-deleted",
	USER_OFFLINE = "offline",
	USER_ONLINE = "online",
	SEND_MESSAGE = "send-message",
	RECEIVE_MESSAGE = "receive-message",
	SEND_FILE_SHARE = "send-file-share",
	RECEIVE_FILE_SHARE = "receive-file-share",
	FILE_SHARE_ERROR = "file-share-error",
	TYPING_START = "typing-start",
	TYPING_PAUSE = "typing-pause",
	CURSOR_MOVE = "cursor-move",
	USERNAME_EXISTS = "username-exists",
	REQUEST_DRAWING = "request-drawing",
	SYNC_DRAWING = "sync-drawing",
	DRAWING_UPDATE = "drawing-update",
	TERMINAL_EXECUTE = "terminal-execute",
	TERMINAL_OUTPUT = "terminal-output",
	TERMINAL_RESIZE = "terminal-resize",
	TERMINAL_RESET = "terminal-reset",
	WORKSPACE_SYNC = "workspace-sync",
	SCREEN_SHARE_START = "screen-share-start",
	SCREEN_SHARE_STOP = "screen-share-stop",
	SCREEN_SHARE_STARTED = "screen-share-started",
	SCREEN_SHARE_STOPPED = "screen-share-stopped",
	SCREEN_SHARE_SIGNAL = "screen-share-signal",
	SCREEN_SHARE_STATUS = "screen-share-status",
	SCREEN_SHARE_STATUS_REQUEST = "screen-share-status-request",
}

interface SocketContext {
	socket: Socket
}

export { SocketEvent, SocketContext, SocketId }
