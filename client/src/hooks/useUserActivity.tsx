import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent, SocketId } from "@/types/socket"
import { RemoteUser, USER_CONNECTION_STATUS } from "@/types/user"
import { useCallback, useEffect } from "react"

function useUserActivity() {
    const { setUsers } = useAppContext()
    const { socket } = useSocket()

    const handleUserVisibilityChange = useCallback(() => {
        if (document.visibilityState === "visible")
            socket.emit(SocketEvent.USER_ONLINE, { socketId: socket.id })
        else if (document.visibilityState === "hidden") {
            socket.emit(SocketEvent.USER_OFFLINE, { socketId: socket.id })
        }
    }, [socket])

    const handleUserOnline = useCallback(
        ({ socketId }: { socketId: SocketId }) => {
            setUsers((users) => {
                return users.map((user) => {
                    if (user.socketId === socketId) {
                        return {
                            ...user,
                            status: USER_CONNECTION_STATUS.ONLINE,
                        }
                    }
                    return user
                })
            })
        },
        [setUsers],
    )

    const handleUserOffline = useCallback(
        ({ socketId }: { socketId: SocketId }) => {
            setUsers((users) => {
                return users.map((user) => {
                    if (user.socketId === socketId) {
                        return {
                            ...user,
                            status: USER_CONNECTION_STATUS.OFFLINE,
                        }
                    }
                    return user
                })
            })
        },
        [setUsers],
    )

    const handleUserTyping = useCallback(
        ({ user }: { user: RemoteUser }) => {
            console.log('👤 handleUserTyping called with user:', {
                username: user.username,
                currentFile: user.currentFile,
                cursorPosition: user.cursorPosition,
                typing: user.typing,
            })
            setUsers((users) => {
                return users.map((u) => {
                    if (u.socketId === user.socketId) {
                        console.log('✅ Updating user in context:', {
                            username: user.username,
                            oldCurrentFile: u.currentFile,
                            newCurrentFile: user.currentFile,
                        })
                        return user
                    }
                    return u
                })
            })
        },
        [setUsers],
    )

    useEffect(() => {
        document.addEventListener(
            "visibilitychange",
            handleUserVisibilityChange,
        )

        socket.on(SocketEvent.USER_ONLINE, handleUserOnline)
        socket.on(SocketEvent.USER_OFFLINE, handleUserOffline)
        socket.on(SocketEvent.TYPING_START, (data) => {
            console.log('📝 TYPING_START received:', data)
            handleUserTyping(data)
        })
        socket.on(SocketEvent.TYPING_PAUSE, (data) => {
            console.log('⏸️ TYPING_PAUSE received:', data)
            handleUserTyping(data)
        })
        socket.on(SocketEvent.CURSOR_MOVE, (data) => {
            console.log('🖱️ CURSOR_MOVE received:', data)
            handleUserTyping(data)
        })
        socket.on(SocketEvent.USER_JOINED, (data) => {
            console.log('👥 USER_JOINED received:', data)
            handleUserTyping(data)
        })

        return () => {
            document.removeEventListener(
                "visibilitychange",
                handleUserVisibilityChange,
            )

            socket.off(SocketEvent.USER_ONLINE)
            socket.off(SocketEvent.USER_OFFLINE)
            socket.off(SocketEvent.TYPING_START)
            socket.off(SocketEvent.TYPING_PAUSE)
            socket.off(SocketEvent.CURSOR_MOVE)
            socket.off(SocketEvent.USER_JOINED)
        }
    }, [
        socket,
        setUsers,
        handleUserVisibilityChange,
        handleUserOnline,
        handleUserOffline,
        handleUserTyping,
    ])
}

export default useUserActivity
