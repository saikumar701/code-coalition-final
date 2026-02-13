import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent, SocketId } from "@/types/socket"
import { RemoteUser, USER_CONNECTION_STATUS } from "@/types/user"
import { useCallback, useEffect } from "react"

function useUserActivity() {
    const { setUsers } = useAppContext()
    const { socket } = useSocket()

    const handleUserVisibilityChange = useCallback(() => {
        if (document.visibilityState === "visible") {
            socket.emit(SocketEvent.USER_ONLINE, { socketId: socket.id })
        } else if (document.visibilityState === "hidden") {
            socket.emit(SocketEvent.USER_OFFLINE, { socketId: socket.id })
        }
    }, [socket])

    const handleUserOnline = useCallback(
        ({ socketId }: { socketId: SocketId }) => {
            setUsers((users) =>
                users.map((user) =>
                    user.socketId === socketId
                        ? { ...user, status: USER_CONNECTION_STATUS.ONLINE }
                        : user,
                ),
            )
        },
        [setUsers],
    )

    const handleUserOffline = useCallback(
        ({ socketId }: { socketId: SocketId }) => {
            setUsers((users) =>
                users.map((user) =>
                    user.socketId === socketId
                        ? { ...user, status: USER_CONNECTION_STATUS.OFFLINE }
                        : user,
                ),
            )
        },
        [setUsers],
    )

    const handleUserUpdated = useCallback(
        ({ user }: { user: RemoteUser }) => {
            setUsers((users) =>
                users.map((existingUser) =>
                    existingUser.socketId === user.socketId
                        ? { ...existingUser, ...user }
                        : existingUser,
                ),
            )
        },
        [setUsers],
    )

    useEffect(() => {
        document.addEventListener("visibilitychange", handleUserVisibilityChange)

        socket.on(SocketEvent.USER_ONLINE, handleUserOnline)
        socket.on(SocketEvent.USER_OFFLINE, handleUserOffline)
        socket.on(SocketEvent.TYPING_START, handleUserUpdated)
        socket.on(SocketEvent.TYPING_PAUSE, handleUserUpdated)
        socket.on(SocketEvent.CURSOR_MOVE, handleUserUpdated)
        socket.on(SocketEvent.USER_UPDATED, handleUserUpdated)

        return () => {
            document.removeEventListener("visibilitychange", handleUserVisibilityChange)
            socket.off(SocketEvent.USER_ONLINE, handleUserOnline)
            socket.off(SocketEvent.USER_OFFLINE, handleUserOffline)
            socket.off(SocketEvent.TYPING_START, handleUserUpdated)
            socket.off(SocketEvent.TYPING_PAUSE, handleUserUpdated)
            socket.off(SocketEvent.CURSOR_MOVE, handleUserUpdated)
            socket.off(SocketEvent.USER_UPDATED, handleUserUpdated)
        }
    }, [
        socket,
        handleUserVisibilityChange,
        handleUserOnline,
        handleUserOffline,
        handleUserUpdated,
    ])
}

export default useUserActivity
