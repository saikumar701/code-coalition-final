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
            className="sidebar-modern-view flex max-h-full min-h-[400px] w-full flex-col gap-3 p-4"
            style={{ height: viewHeight }}
        >
            <div className="sidebar-modern-header">
                <h1 className="view-title m-0 border-none pb-0">Screen Share</h1>
            </div>

            <div className="sidebar-modern-card">
                <p className="text-sm text-[var(--ui-text-primary)]">
                    {isSharingScreen
                        ? "You are sharing your screen with this room."
                        : activeScreenShare
                          ? `${activeScreenShare.username} is sharing their screen.`
                          : "No active screen share right now."}
                </p>
                <div className="mt-3 flex gap-2">
                    <button
                        type="button"
                        className="sidebar-modern-btn sidebar-modern-btn--primary flex-1"
                        onClick={startScreenShare}
                        disabled={Boolean(activeScreenShare && !isSharingScreen)}
                    >
                        Start sharing
                    </button>
                    <button
                        type="button"
                        className="sidebar-modern-btn flex-1"
                        onClick={stopScreenShare}
                        disabled={!isSharingScreen}
                    >
                        Stop sharing
                    </button>
                </div>
            </div>

            <div className="sidebar-modern-scroll min-h-0 flex-1 overflow-auto p-2">
                {isSharingScreen && (
                    <div className="mb-3 rounded-xl border border-cyan-300/25 bg-black/35 p-2">
                        <p className="ui-muted-text mb-2 text-xs">Your shared screen preview</p>
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
                    <div className="rounded-xl border border-cyan-300/25 bg-black/35 p-2">
                        <p className="ui-muted-text mb-2 text-xs">
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
                    <p className="ui-muted-text text-sm">
                        Start sharing to broadcast your screen, or wait for someone else to share.
                    </p>
                )}
            </div>
        </div>
    )
}

export default ScreenShareView
