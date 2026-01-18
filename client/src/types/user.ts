enum USER_CONNECTION_STATUS {
    OFFLINE = "offline",
    ONLINE = "online",
}

interface User {
    username: string
    roomId: string
}

interface RemoteUser extends User {
    status: USER_CONNECTION_STATUS
    typing: boolean
    currentFile: string
    socketId: string
    cursorPosition?: number
    selectionStart?: number
    selectionEnd?: number
}

enum USER_STATUS {
    INITIAL = "initial",
    CONNECTING = "connecting",
    ATTEMPTING_JOIN = "attempting-join",
    JOINED = "joined",
    CONNECTION_FAILED = "connection-failed",
    DISCONNECTED = "disconnected",
}

export { USER_CONNECTION_STATUS, USER_STATUS, RemoteUser, User }
