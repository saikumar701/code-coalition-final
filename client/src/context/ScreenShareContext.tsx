import { SocketEvent } from "@/types/socket"
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useAppContext } from "./AppContext"
import { useSocket } from "./SocketContext"

type ScreenSignalPayload =
    | {
          type: "offer"
          sdp: RTCSessionDescriptionInit
      }
    | {
          type: "answer"
          sdp: RTCSessionDescriptionInit
      }
    | {
          type: "ice-candidate"
          candidate: RTCIceCandidateInit
      }

interface ActiveScreenShare {
    socketId: string
    username: string
}

interface ScreenShareContextType {
    activeScreenShare: ActiveScreenShare | null
    localPreviewStream: MediaStream | null
    remoteViewerStream: MediaStream | null
    isSharingScreen: boolean
    startScreenShare: () => Promise<void>
    stopScreenShare: () => void
}

const peerConnectionConfig: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
}

const ScreenShareContext = createContext<ScreenShareContextType | null>(null)

const useScreenShare = (): ScreenShareContextType => {
    const context = useContext(ScreenShareContext)
    if (!context) {
        throw new Error("useScreenShare must be used within a ScreenShareContextProvider")
    }
    return context
}

const ScreenShareContextProvider = ({ children }: { children: ReactNode }) => {
    const { socket } = useSocket()
    const { users, currentUser } = useAppContext()
    const [activeScreenShare, setActiveScreenShare] = useState<ActiveScreenShare | null>(null)
    const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(null)
    const [remoteViewerStream, setRemoteViewerStream] = useState<MediaStream | null>(null)

    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
    const localStreamRef = useRef<MediaStream | null>(null)

    const cleanupPeerConnection = useCallback((remoteSocketId: string) => {
        const existingConnection = peerConnectionsRef.current.get(remoteSocketId)
        if (!existingConnection) return

        existingConnection.onicecandidate = null
        existingConnection.ontrack = null
        existingConnection.close()
        peerConnectionsRef.current.delete(remoteSocketId)
    }, [])

    const cleanupAllPeerConnections = useCallback(() => {
        const remoteSocketIds = [...peerConnectionsRef.current.keys()]
        remoteSocketIds.forEach(cleanupPeerConnection)
    }, [cleanupPeerConnection])

    const createPeerConnection = useCallback(
        (remoteSocketId: string, onTrack?: (stream: MediaStream) => void) => {
            const existingConnection = peerConnectionsRef.current.get(remoteSocketId)
            if (existingConnection) {
                if (onTrack) {
                    existingConnection.ontrack = (event) => {
                        const stream = event.streams[0]
                        if (stream) {
                            onTrack(stream)
                        }
                    }
                }
                return existingConnection
            }

            const connection = new RTCPeerConnection(peerConnectionConfig)

            connection.onicecandidate = (event) => {
                if (!event.candidate) return

                socket.emit(SocketEvent.SCREEN_SHARE_SIGNAL, {
                    targetSocketId: remoteSocketId,
                    payload: {
                        type: "ice-candidate",
                        candidate: event.candidate.toJSON(),
                    },
                })
            }

            if (onTrack) {
                connection.ontrack = (event) => {
                    const stream = event.streams[0]
                    if (stream) {
                        onTrack(stream)
                    }
                }
            }

            connection.onconnectionstatechange = () => {
                if (["closed", "failed", "disconnected"].includes(connection.connectionState)) {
                    cleanupPeerConnection(remoteSocketId)
                }
            }

            peerConnectionsRef.current.set(remoteSocketId, connection)
            return connection
        },
        [cleanupPeerConnection, socket],
    )

    const createOfferForViewer = useCallback(
        async (viewerSocketId: string) => {
            const localStream = localStreamRef.current
            if (!localStream) return

            const connection = createPeerConnection(viewerSocketId)
            const existingTrackIds = new Set(
                connection.getSenders().map((sender) => sender.track?.id).filter(Boolean),
            )

            localStream.getTracks().forEach((track) => {
                if (!existingTrackIds.has(track.id)) {
                    connection.addTrack(track, localStream)
                }
            })

            const offer = await connection.createOffer()
            await connection.setLocalDescription(offer)

            socket.emit(SocketEvent.SCREEN_SHARE_SIGNAL, {
                targetSocketId: viewerSocketId,
                payload: {
                    type: "offer",
                    sdp: offer,
                },
            })
        },
        [createPeerConnection, socket],
    )

    const stopLocalStream = useCallback(() => {
        if (!localStreamRef.current) return

        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
        setLocalPreviewStream(null)
    }, [])

    const stopScreenShare = useCallback(() => {
        const wasSharer = activeScreenShare?.socketId === socket.id
        stopLocalStream()
        cleanupAllPeerConnections()
        setRemoteViewerStream(null)

        if (wasSharer) {
            socket.emit(SocketEvent.SCREEN_SHARE_STOP)
            setActiveScreenShare(null)
        }
    }, [activeScreenShare?.socketId, cleanupAllPeerConnections, socket, stopLocalStream])

    const startScreenShare = useCallback(async () => {
        if (localStreamRef.current) return

        const sharerSocketId = socket.id
        if (!sharerSocketId) {
            toast.error("Socket not connected. Reconnect and try again.")
            return
        }

        if (activeScreenShare && activeScreenShare.socketId !== socket.id) {
            toast.error(`${activeScreenShare.username} is already sharing their screen.`)
            return
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            })

            localStreamRef.current = stream
            setLocalPreviewStream(stream)
            setActiveScreenShare({
                socketId: sharerSocketId,
                username: currentUser.username || "You",
            })
            socket.emit(SocketEvent.SCREEN_SHARE_START)

            const videoTrack = stream.getVideoTracks()[0]
            if (videoTrack) {
                videoTrack.onended = () => {
                    stopScreenShare()
                }
            }

            const viewerSocketIds = users
                .map((user) => user.socketId)
                .filter((socketId): socketId is string => Boolean(socketId) && socketId !== socket.id)

            for (const viewerSocketId of viewerSocketIds) {
                await createOfferForViewer(viewerSocketId)
            }
        } catch (error) {
            console.error(error)
            toast.error("Unable to start screen sharing.")
        }
    }, [
        activeScreenShare,
        createOfferForViewer,
        currentUser.username,
        socket,
        stopScreenShare,
        users,
    ])

    useEffect(() => {
        if (!localStreamRef.current || !socket.id) return

        const viewerSocketIds = users
            .map((user) => user.socketId)
            .filter((socketId): socketId is string => Boolean(socketId) && socketId !== socket.id)
        const knownViewerIds = new Set(viewerSocketIds)

        viewerSocketIds.forEach((viewerSocketId) => {
            if (!peerConnectionsRef.current.has(viewerSocketId)) {
                void createOfferForViewer(viewerSocketId)
            }
        })

        const staleConnectionIds = [...peerConnectionsRef.current.keys()].filter(
            (remoteSocketId) => !knownViewerIds.has(remoteSocketId),
        )
        staleConnectionIds.forEach(cleanupPeerConnection)
    }, [cleanupPeerConnection, createOfferForViewer, socket.id, users])

    useEffect(() => {
        const handleScreenShareStatus = ({
            sharerSocketId,
            sharerUsername,
        }: {
            sharerSocketId?: string | null
            sharerUsername?: string | null
        }) => {
            if (!sharerSocketId) {
                if (!localStreamRef.current) {
                    setActiveScreenShare(null)
                    setRemoteViewerStream(null)
                }
                return
            }

            setActiveScreenShare({
                socketId: sharerSocketId,
                username: sharerUsername || "User",
            })
        }

        const handleScreenShareStarted = ({
            sharerSocketId,
            sharerUsername,
        }: {
            sharerSocketId: string
            sharerUsername: string
        }) => {
            if (!sharerSocketId) return

            if (sharerSocketId !== socket.id && localStreamRef.current) {
                stopLocalStream()
                cleanupAllPeerConnections()
            }

            if (sharerSocketId !== socket.id) {
                setRemoteViewerStream(null)
            }

            setActiveScreenShare({
                socketId: sharerSocketId,
                username: sharerUsername || "User",
            })
        }

        const handleScreenShareStopped = ({
            sharerSocketId,
        }: {
            sharerSocketId?: string
        }) => {
            if (!sharerSocketId) return

            cleanupPeerConnection(sharerSocketId)

            if (sharerSocketId === socket.id) {
                stopLocalStream()
            } else {
                setRemoteViewerStream(null)
            }

            setActiveScreenShare((currentShare) =>
                currentShare?.socketId === sharerSocketId ? null : currentShare,
            )
        }

        const handleScreenShareSignal = async ({
            fromSocketId,
            payload,
        }: {
            fromSocketId?: string
            payload?: ScreenSignalPayload
        }) => {
            if (!fromSocketId || !payload) return

            try {
                if (payload.type === "offer") {
                    const connection = createPeerConnection(fromSocketId, (stream) => {
                        setRemoteViewerStream(stream)
                    })

                    await connection.setRemoteDescription(payload.sdp)
                    const answer = await connection.createAnswer()
                    await connection.setLocalDescription(answer)

                    socket.emit(SocketEvent.SCREEN_SHARE_SIGNAL, {
                        targetSocketId: fromSocketId,
                        payload: {
                            type: "answer",
                            sdp: answer,
                        },
                    })
                    return
                }

                const connection = peerConnectionsRef.current.get(fromSocketId)
                if (!connection) return

                if (payload.type === "answer") {
                    await connection.setRemoteDescription(payload.sdp)
                    return
                }

                if (payload.type === "ice-candidate" && payload.candidate) {
                    await connection.addIceCandidate(payload.candidate)
                }
            } catch (error) {
                console.error("Screen share signaling error:", error)
            }
        }

        const requestScreenShareStatus = () => {
            if (!currentUser.roomId.trim()) return
            socket.emit(SocketEvent.SCREEN_SHARE_STATUS_REQUEST)
        }

        socket.on(SocketEvent.SCREEN_SHARE_STATUS, handleScreenShareStatus)
        socket.on(SocketEvent.SCREEN_SHARE_STARTED, handleScreenShareStarted)
        socket.on(SocketEvent.SCREEN_SHARE_STOPPED, handleScreenShareStopped)
        socket.on(SocketEvent.SCREEN_SHARE_SIGNAL, handleScreenShareSignal)
        socket.on("connect", requestScreenShareStatus)
        requestScreenShareStatus()

        return () => {
            socket.off(SocketEvent.SCREEN_SHARE_STATUS, handleScreenShareStatus)
            socket.off(SocketEvent.SCREEN_SHARE_STARTED, handleScreenShareStarted)
            socket.off(SocketEvent.SCREEN_SHARE_STOPPED, handleScreenShareStopped)
            socket.off(SocketEvent.SCREEN_SHARE_SIGNAL, handleScreenShareSignal)
            socket.off("connect", requestScreenShareStatus)
        }
    }, [
        cleanupAllPeerConnections,
        cleanupPeerConnection,
        currentUser.roomId,
        createPeerConnection,
        socket,
        stopLocalStream,
    ])

    useEffect(
        () => () => {
            stopLocalStream()
            cleanupAllPeerConnections()
        },
        [cleanupAllPeerConnections, stopLocalStream],
    )

    const contextValue = useMemo(
        () => ({
            activeScreenShare,
            localPreviewStream,
            remoteViewerStream,
            isSharingScreen: Boolean(localPreviewStream && activeScreenShare?.socketId === socket.id),
            startScreenShare,
            stopScreenShare,
        }),
        [
            activeScreenShare,
            localPreviewStream,
            remoteViewerStream,
            socket.id,
            startScreenShare,
            stopScreenShare,
        ],
    )

    return (
        <ScreenShareContext.Provider value={contextValue}>{children}</ScreenShareContext.Provider>
    )
}

export { ScreenShareContextProvider, useScreenShare }
