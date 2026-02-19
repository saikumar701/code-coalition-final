import {
    ACTIVITY_STATE,
    AppContext as AppContextType,
    DrawingData,
} from "@/types/app"
import { PendingJoinRequest, RemoteUser, USER_STATUS, User } from "@/types/user"
import { ReactNode, createContext, useContext, useEffect, useState } from "react"

const AppContext = createContext<AppContextType | null>(null)
const USER_STORAGE_KEY = "code-coalition:user"
const AUTO_SAVE_STORAGE_KEY = "code-coalition:auto-save-enabled"

export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext)
    if (context === null) {
        throw new Error(
            "useAppContext must be used within a AppContextProvider",
        )
    }
    return context
}

function AppContextProvider({ children }: { children: ReactNode }) {
    const [users, setUsers] = useState<RemoteUser[]>([])
    const [pendingJoinRequests, setPendingJoinRequests] = useState<PendingJoinRequest[]>([])
    const [status, setStatus] = useState<USER_STATUS>(USER_STATUS.INITIAL)
    const [currentUser, setCurrentUser] = useState<User>(() => {
        if (typeof window === "undefined") {
            return { username: "", roomId: "", isAdmin: false }
        }

        const savedUser = sessionStorage.getItem(USER_STORAGE_KEY)
        if (!savedUser) {
            return { username: "", roomId: "", isAdmin: false }
        }

        try {
            const parsedUser = JSON.parse(savedUser) as Partial<User>
            return {
                username: parsedUser.username || "",
                roomId: parsedUser.roomId || "",
                isAdmin: Boolean(parsedUser.isAdmin),
            }
        } catch {
            return { username: "", roomId: "", isAdmin: false }
        }
    })
    const [activityState, setActivityState] = useState<ACTIVITY_STATE>(
        ACTIVITY_STATE.CODING,
    )
    const [drawingData, setDrawingData] = useState<DrawingData>(null)
    const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
        if (typeof window === "undefined") return true
        const saved = localStorage.getItem(AUTO_SAVE_STORAGE_KEY)
        if (saved === null) return true
        return saved !== "false"
    })

    useEffect(() => {
        if (typeof window === "undefined") {
            return
        }

        if (!currentUser.username && !currentUser.roomId) {
            sessionStorage.removeItem(USER_STORAGE_KEY)
            return
        }

        sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(currentUser))
    }, [currentUser])

    useEffect(() => {
        if (typeof window === "undefined") return
        localStorage.setItem(AUTO_SAVE_STORAGE_KEY, String(autoSaveEnabled))
    }, [autoSaveEnabled])

    return (
        <AppContext.Provider
            value={{
                users,
                setUsers,
                pendingJoinRequests,
                setPendingJoinRequests,
                currentUser,
                setCurrentUser,
                status,
                setStatus,
                activityState,
                setActivityState,
                drawingData,
                setDrawingData,
                autoSaveEnabled,
                setAutoSaveEnabled,
            }}
        >
            {children}
        </AppContext.Provider>
    )
}

export { AppContextProvider }
export default AppContext
