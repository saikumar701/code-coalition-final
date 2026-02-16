import { useAppContext } from "@/context/AppContext"
import { USER_CONNECTION_STATUS } from "@/types/user"

const Users = () => {
    const { users, currentUser } = useAppContext()

    return (
        <div className="flex flex-col gap-2 overflow-y-auto py-2 pr-1">
            {users.map(user => (
                <div
                    key={user.socketId}
                    className="sidebar-modern-list-item flex items-center gap-3 px-3 py-2"
                >
                    <div
                        className={`h-2.5 w-2.5 rounded-full shadow-[0_0_12px_rgba(0,0,0,0.3)] ${
                            user.status === USER_CONNECTION_STATUS.ONLINE
                                ? "bg-emerald-400 shadow-emerald-300/60"
                                : "bg-slate-400"
                        }`}
                    ></div>
                    <p className="truncate text-sm font-medium text-[var(--ui-text-primary)]">
                        {user.username}
                        {user.username === currentUser?.username && " (You)"}
                    </p>
                </div>
            ))}
        </div>
    )
}

export default Users
