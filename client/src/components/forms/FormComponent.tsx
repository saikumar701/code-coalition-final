import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent } from "@/types/socket"
import { USER_STATUS } from "@/types/user"
import { ChangeEvent, FormEvent, useEffect, useRef } from "react"
import { toast } from "react-hot-toast"
import { useLocation, useNavigate } from "react-router-dom"
import { v4 as uuidv4 } from "uuid"
import logo from "@/assets/logo.svg"
import { Key, User } from "lucide-react"
import { getClientSessionId } from "@/utils/session"

const FormComponent = () => {
    const location = useLocation()
    const { currentUser, setCurrentUser, status, setStatus } = useAppContext()
    const { socket } = useSocket()

    const usernameRef = useRef<HTMLInputElement | null>(null)
    const joinTimeoutRef = useRef<number | null>(null)
    const navigate = useNavigate()

    const createNewRoomId = () => {
        setCurrentUser({ ...currentUser, roomId: uuidv4() })
        toast.success("Created a new Room Id")
        usernameRef.current?.focus()
    }

    const handleInputChanges = (e: ChangeEvent<HTMLInputElement>) => {
        const name = e.target.name
        const value = e.target.value
        setCurrentUser({ ...currentUser, [name]: value })
    }

    const validateForm = () => {
        const username = currentUser.username.trim()
        const roomId = currentUser.roomId.trim()

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

    const joinRoom = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (status === USER_STATUS.ATTEMPTING_JOIN) return
        if (!validateForm()) return

        const joinPayload = {
            username: currentUser.username.trim(),
            roomId: currentUser.roomId.trim(),
            sessionId: getClientSessionId(),
        }

        setCurrentUser({
            username: joinPayload.username,
            roomId: joinPayload.roomId,
        })
        toast.loading("Joining room...", { id: "join-room" })
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
            toast.error("Join request timed out. Please try again.")
            joinTimeoutRef.current = null
        }, 9000)
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
        if (status !== USER_STATUS.ATTEMPTING_JOIN) {
            toast.dismiss("join-room")
            if (joinTimeoutRef.current !== null) {
                window.clearTimeout(joinTimeoutRef.current)
                joinTimeoutRef.current = null
            }
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
                        Enter a room ID or generate a new one to collaborate instantly. Your
                        session stays in sync across devices.
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
                                disabled={status === USER_STATUS.ATTEMPTING_JOIN}
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
                                disabled={status === USER_STATUS.ATTEMPTING_JOIN}
                                className="w-full rounded-2xl border border-gray-600 bg-gray-700/50 py-3 pl-10 pr-4 text-white placeholder-gray-400 outline-none transition focus:border-teal-500 focus:bg-gray-700/80 focus:shadow-[0_0_0_2px_rgba(13,148,136,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                                onChange={handleInputChanges}
                                value={currentUser.username}
                                ref={usernameRef}
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={status === USER_STATUS.ATTEMPTING_JOIN}
                        className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-teal-500 to-teal-400 px-8 py-3 text-base font-semibold text-gray-900 transition-transform hover:scale-105 hover:shadow-[0_20px_45px_-20px_rgba(13,148,136,0.8)] active:scale-100 sm:text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                    >
                        {status === USER_STATUS.ATTEMPTING_JOIN ? "Joining..." : "Join room"}
                    </button>
                </form>
                <button
                    disabled={status === USER_STATUS.ATTEMPTING_JOIN}
                    className="text-sm font-medium text-teal-400 transition hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={createNewRoomId}
                >
                    Generate a unique room ID
                </button>
            </div>
        </div>
    )
}

export default FormComponent
