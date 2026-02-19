enum USER_CONNECTION_STATUS {
    OFFLINE = "offline",
    ONLINE = "online",
}

interface User {
    username: string
    roomId: string
    isAdmin: boolean
}

interface RemoteUser extends User {
    status: USER_CONNECTION_STATUS
    typing: boolean
    currentFile: string | null
    socketId: string
    cursorPosition?: number
    selectionStart?: number
    selectionEnd?: number
}

interface PendingJoinRequest {
    requestId: string
    roomId: string
    username: string
    requesterSocketId: string
}

enum USER_STATUS {
    INITIAL = "initial",
    CONNECTING = "connecting",
    ATTEMPTING_JOIN = "attempting-join",
    PENDING_APPROVAL = "pending-approval",
    JOINED = "joined",
    CONNECTION_FAILED = "connection-failed",
    DISCONNECTED = "disconnected",
}

export { USER_CONNECTION_STATUS, USER_STATUS, PendingJoinRequest, RemoteUser, User }
