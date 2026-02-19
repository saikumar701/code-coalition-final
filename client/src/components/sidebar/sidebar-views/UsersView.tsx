import Users from "@/components/common/Users"
import { useAppContext } from "@/context/AppContext"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent } from "@/types/socket"
import useResponsive from "@/hooks/useResponsive"
import { USER_STATUS } from "@/types/user"
import toast from "react-hot-toast"
import { GoSignOut } from "react-icons/go"
import { IoShareOutline } from "react-icons/io5"
import { LuCopy } from "react-icons/lu"
import { useNavigate } from "react-router-dom"


function UsersView() {
    const navigate = useNavigate()
    const { viewHeight } = useResponsive()
    const { currentUser, pendingJoinRequests, setPendingJoinRequests, setStatus } =
        useAppContext()
    const { socket } = useSocket()


    const copyURL = async () => {
        const url = window.location.href
        try {
            await navigator.clipboard.writeText(url)
            toast.success("URL copied to clipboard")
        } catch (error) {
            toast.error("Unable to copy URL to clipboard")
            console.log(error)
        }
    }


    const shareURL = async () => {
        const url = window.location.href
        try {
            await navigator.share({ url })
        } catch (error) {
            toast.error("Unable to share URL")
            console.log(error)
        }
    }


    const leaveRoom = () => {
        setPendingJoinRequests([])
        socket.disconnect()
        setStatus(USER_STATUS.DISCONNECTED)
        navigate("/", {
            replace: true,
        })
    }

    const handleJoinDecision = (requesterSocketId: string, approved: boolean) => {
        socket.emit(SocketEvent.JOIN_APPROVAL_DECISION, {
            requesterSocketId,
            approved,
        })
    }

    return (
        <div className="sidebar-modern-view flex flex-col p-4" style={{ height: viewHeight }}>
            <div className="sidebar-modern-header">
                <h1 className="view-title m-0 border-none pb-0">Active Users</h1>
            </div>
            {/* List of connected users */}
            <div className="sidebar-modern-scroll min-h-0 flex-1 p-2">
                <Users />
                {currentUser.isAdmin && (
                    <div className="mt-4 rounded-xl border border-gray-700 bg-gray-900/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
                            Join Requests
                        </p>
                        {pendingJoinRequests.length === 0 ? (
                            <p className="mt-2 text-xs text-gray-400">
                                No pending requests.
                            </p>
                        ) : (
                            <div className="mt-3 flex flex-col gap-2">
                                {pendingJoinRequests.map((request) => (
                                    <div
                                        key={request.requestId}
                                        className="rounded-lg border border-gray-700 bg-gray-800/80 p-2"
                                    >
                                        <p className="truncate text-sm text-gray-100">
                                            {request.username}
                                        </p>
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-semibold text-gray-900 transition hover:bg-emerald-400"
                                                onClick={() =>
                                                    handleJoinDecision(
                                                        request.requesterSocketId,
                                                        true,
                                                    )
                                                }
                                            >
                                                Approve
                                            </button>
                                            <button
                                                className="rounded-md bg-rose-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-rose-400"
                                                onClick={() =>
                                                    handleJoinDecision(
                                                        request.requesterSocketId,
                                                        false,
                                                    )
                                                }
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <div className="flex flex-col items-center gap-4 pt-4">
                <div className="flex w-full gap-4">
                    {/* Share URL button */}
                    <button
                        className="sidebar-modern-btn sidebar-modern-btn--primary flex flex-grow p-3"
                        onClick={shareURL}
                        title="Share Link"
                    >
                        <IoShareOutline size={26} />
                    </button>
                    {/* Copy URL button */}
                    <button
                        className="sidebar-modern-btn sidebar-modern-btn--primary flex flex-grow p-3"
                        onClick={copyURL}
                        title="Copy Link"
                    >
                        <LuCopy size={22} />
                    </button>
                    {/* Leave room button */}
                    <button
                        className="sidebar-modern-btn sidebar-modern-btn--danger flex flex-grow p-3"
                        onClick={leaveRoom}
                        title="Leave room"
                    >
                        <GoSignOut size={22} />
                    </button>
                </div>
            </div>
        </div>
    )
}


export default UsersView
