import { useScreenShare } from "@/context/ScreenShareContext"
import useResponsive from "@/hooks/useResponsive"
import { useEffect, useRef } from "react"

const ScreenShareView = () => {
    const { viewHeight } = useResponsive()
    const {
        activeScreenShare,
        localPreviewStream,
        remoteViewerStream,
        isSharingScreen,
        startScreenShare,
        stopScreenShare,
    } = useScreenShare()
    const localVideoRef = useRef<HTMLVideoElement | null>(null)
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null)

    useEffect(() => {
        if (!localVideoRef.current) return
        localVideoRef.current.srcObject = localPreviewStream
    }, [localPreviewStream])

    useEffect(() => {
        if (!remoteVideoRef.current) return
        remoteVideoRef.current.srcObject = remoteViewerStream
    }, [remoteViewerStream])

    const showRemotePreview = Boolean(
        !isSharingScreen &&
            activeScreenShare &&
            activeScreenShare.socketId &&
            remoteViewerStream,
    )

    return (
        <div
            className="flex max-h-full min-h-[400px] w-full flex-col gap-3 p-4 text-white"
            style={{ height: viewHeight }}
        >
            <h1 className="view-title">Screen Share</h1>

            <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3">
                <p className="text-sm text-gray-200">
                    {isSharingScreen
                        ? "You are sharing your screen with this room."
                        : activeScreenShare
                          ? `${activeScreenShare.username} is sharing their screen.`
                          : "No active screen share right now."}
                </p>
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        className="flex-1 rounded-md bg-white p-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={startScreenShare}
                        disabled={Boolean(activeScreenShare && !isSharingScreen)}
                    >
                        Start sharing
                    </button>
                    <button
                        type="button"
                        className="flex-1 rounded-md border border-gray-600 p-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={stopScreenShare}
                        disabled={!isSharingScreen}
                    >
                        Stop sharing
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-gray-700 bg-gray-900/40 p-2">
                {isSharingScreen && (
                    <div className="mb-3 rounded-md border border-gray-700 bg-black/40 p-2">
                        <p className="mb-2 text-xs text-gray-300">Your shared screen preview</p>
                        <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full rounded-md bg-black"
                        />
                    </div>
                )}

                {showRemotePreview && (
                    <div className="rounded-md border border-gray-700 bg-black/40 p-2">
                        <p className="mb-2 text-xs text-gray-300">
                            Live view from {activeScreenShare?.username}
                        </p>
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full rounded-md bg-black"
                        />
                    </div>
                )}

                {!isSharingScreen && !showRemotePreview && (
                    <p className="text-sm text-gray-400">
                        Start sharing to broadcast your screen, or wait for someone else to share.
                    </p>
                )}
            </div>
        </div>
    )
}

export default ScreenShareView
