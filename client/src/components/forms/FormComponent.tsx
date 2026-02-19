import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent } from "@/types/socket"
import { USER_STATUS } from "@/types/user"
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react"
import { toast } from "react-hot-toast"
import { useLocation, useNavigate } from "react-router-dom"
import { v4 as uuidv4 } from "uuid"
import logo from "@/assets/logo.svg"
import { Key, User } from "lucide-react"
import { getClientSessionId } from "@/utils/session"

type JoinMode = "create" | "join"

const FormComponent = () => {
    const location = useLocation()
    const { currentUser, setCurrentUser, status, setStatus } = useAppContext()
    const { socket } = useSocket()

    const usernameRef = useRef<HTMLInputElement | null>(null)
    const joinTimeoutRef = useRef<number | null>(null)
    const [lastRequestedMode, setLastRequestedMode] = useState<JoinMode>("join")
    const navigate = useNavigate()

    const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
        const name = e.target.name
        const value = e.target.value
        setCurrentUser({ ...currentUser, [name]: value })
    }

    const validateForm = (roomIdValue: string) => {
        const username = currentUser.username.trim()
        const roomId = roomIdValue.trim()

        if (username.length === 0) {
            toast.error("Enter your username")
            return false
        } else if (roomId.length === 0) {
            toast.error("Enter a room id")
            return false
        } else if (roomId.length < 5) {
            toast.error("ROOM Id must be at least 5 characters long")
            return false
        } else if (username.length < 3) {
            toast.error("Username must be at least 3 characters long")
            return false
        }
        return true
    }

    const requestRoomAccess = (mode: JoinMode) => {
        if (
            status === USER_STATUS.ATTEMPTING_JOIN ||
            status === USER_STATUS.PENDING_APPROVAL
        ) {
            return
        }

        const username = currentUser.username.trim()
        const inputRoomId = currentUser.roomId.trim()
        const roomId = mode === "create" ? inputRoomId || uuidv4() : inputRoomId
        if (!validateForm(roomId)) return

        const joinPayload = {
            username,
            roomId,
            sessionId: getClientSessionId(),
            mode,
        }

        setCurrentUser({
            username,
            roomId,
            isAdmin: false,
        })
        setLastRequestedMode(mode)
        toast.loading(
            mode === "create"
                ? "Creating room..."
                : "Requesting to join room...",
            { id: "join-room" },
        )
        setStatus(USER_STATUS.ATTEMPTING_JOIN)

        if (!socket.connected) {
            socket.connect()
        }
        // Socket.io buffers emits until connected, so this handles both connected/connecting states.
        socket.emit(SocketEvent.JOIN_REQUEST, joinPayload)

        if (joinTimeoutRef.current !== null) {
            window.clearTimeout(joinTimeoutRef.current)
        }
        joinTimeoutRef.current = window.setTimeout(() => {
            setStatus(USER_STATUS.CONNECTION_FAILED)
            toast.dismiss("join-room")
            toast.error("Request timed out. Please try again.")
            joinTimeoutRef.current = null
        }, 9000)
    }

    const joinRoom = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        requestRoomAccess("join")
    }

    useEffect(() => {
        if (currentUser.roomId.length > 0) return
        if (location.state?.roomId) {
            setCurrentUser({ ...currentUser, roomId: location.state.roomId })
            if (currentUser.username.trim().length === 0) {
                toast.success("Enter your username")
            }
        }
    }, [currentUser, location.state?.roomId, setCurrentUser])

    useEffect(() => {
        if (status !== USER_STATUS.JOINED) {
            return
        }

        toast.dismiss("join-room")
        if (joinTimeoutRef.current !== null) {
            window.clearTimeout(joinTimeoutRef.current)
            joinTimeoutRef.current = null
        }

        navigate(`/editor/${currentUser.roomId}`, {
            replace: true,
            state: {
                username: currentUser.username,
            },
        })
    }, [currentUser.roomId, currentUser.username, navigate, status])

    useEffect(() => {
        if (status === USER_STATUS.ATTEMPTING_JOIN) return

        if (joinTimeoutRef.current !== null) {
            window.clearTimeout(joinTimeoutRef.current)
            joinTimeoutRef.current = null
        }
        if (status !== USER_STATUS.PENDING_APPROVAL) {
            toast.dismiss("join-room")
        }
    }, [status])

    useEffect(() => {
        return () => {
            if (joinTimeoutRef.current !== null) {
                window.clearTimeout(joinTimeoutRef.current)
            }
        }
    }, [])

    return (
        <div className="w-full">
            <div className="relative flex w-full max-w-[520px] flex-col gap-6 rounded-3xl border border-gray-700 bg-gray-800/80 p-5 shadow-[0_40px_120px_-60px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:mx-auto sm:gap-8 sm:p-8">
                <div className="flex flex-col items-center gap-4 text-center">
                    <span className="rounded-full border border-teal-400/50 bg-teal-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-teal-400/80">
                        Welcome to CodeCoalition
                    </span>
                    <img src={logo} alt="CodeAlong logo" className="h-16 w-auto" />
                    <p className="max-w-sm text-sm text-gray-300">
                        Create room to become the admin, or join an existing room and wait for
                        admin approval.
                    </p>
                </div>
                <form onSubmit={joinRoom} className="flex w-full flex-col gap-4">
                    <div className="relative flex flex-col gap-2">
                        <label htmlFor="roomId" className="text-sm font-medium text-gray-300">
                            Room ID
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                id="roomId"
                                type="text"
                                name="roomId"
                                placeholder="e.g. build-together-123"
                                disabled={
                                    status === USER_STATUS.ATTEMPTING_JOIN ||
                                    status === USER_STATUS.PENDING_APPROVAL
                                }
                                className="w-full rounded-2xl border border-gray-600 bg-gray-700/50 py-3 pl-10 pr-4 text-white placeholder-gray-400 outline-none transition focus:border-teal-500 focus:bg-gray-700/80 focus:shadow-[0_0_0_2px_rgba(13,148,136,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                                onChange={handleInputChanges}
                                value={currentUser.roomId}
                            />
                        </div>
                    </div>
                    <div className="relative flex flex-col gap-2">
                        <label htmlFor="username" className="text-sm font-medium text-gray-300">
                            Display name
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                id="username"
                                type="text"
                                name="username"
                                placeholder="Your name"
                                disabled={
                                    status === USER_STATUS.ATTEMPTING_JOIN ||
                                    status === USER_STATUS.PENDING_APPROVAL
                                }
                                className="w-full rounded-2xl border border-gray-600 bg-gray-700/50 py-3 pl-10 pr-4 text-white placeholder-gray-400 outline-none transition focus:border-teal-500 focus:bg-gray-700/80 focus:shadow-[0_0_0_2px_rgba(13,148,136,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                                onChange={handleInputChanges}
                                value={currentUser.username}
                                ref={usernameRef}
                            />
                        </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            disabled={
                                status === USER_STATUS.ATTEMPTING_JOIN ||
                                status === USER_STATUS.PENDING_APPROVAL
                            }
                            className="inline-flex w-full items-center justify-center rounded-2xl border border-teal-400/50 bg-teal-500/10 px-6 py-3 text-base font-semibold text-teal-300 transition hover:bg-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => requestRoomAccess("create")}
                        >
                            {status === USER_STATUS.ATTEMPTING_JOIN &&
                            lastRequestedMode === "create"
                                ? "Creating..."
                                : "Create Room (Admin)"}
                        </button>
                        <button
                            type="submit"
                            disabled={
                                status === USER_STATUS.ATTEMPTING_JOIN ||
                                status === USER_STATUS.PENDING_APPROVAL
                            }
                            className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-teal-500 to-teal-400 px-6 py-3 text-base font-semibold text-gray-900 transition-transform hover:scale-105 hover:shadow-[0_20px_45px_-20px_rgba(13,148,136,0.8)] active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100"
                        >
                            {status === USER_STATUS.PENDING_APPROVAL
                                ? "Awaiting Approval..."
                                : status === USER_STATUS.ATTEMPTING_JOIN &&
                                    lastRequestedMode === "join"
                                  ? "Joining..."
                                  : "Join Room (User)"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default FormComponent
