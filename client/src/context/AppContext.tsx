import {
    ACTIVITY_STATE,
    AppContext as AppContextType,
    DrawingData,
} from "@/types/app"
import { RemoteUser, USER_STATUS, User } from "@/types/user"
import { ReactNode, createContext, useContext, useEffect, useState } from "react"

const AppContext = createContext<AppContextType | null>(null)
const USER_STORAGE_KEY = "code-coalition:user"

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
    const [status, setStatus] = useState<USER_STATUS>(USER_STATUS.INITIAL)
    const [currentUser, setCurrentUser] = useState<User>(() => {
        if (typeof window === "undefined") {
            return { username: "", roomId: "" }
        }

        const savedUser = sessionStorage.getItem(USER_STORAGE_KEY)
        if (!savedUser) {
            return { username: "", roomId: "" }
        }

        try {
            const parsedUser = JSON.parse(savedUser) as Partial<User>
            return {
                username: parsedUser.username || "",
                roomId: parsedUser.roomId || "",
            }
        } catch {
            return { username: "", roomId: "" }
        }
    })
    const [activityState, setActivityState] = useState<ACTIVITY_STATE>(
        ACTIVITY_STATE.CODING,
    )
    const [drawingData, setDrawingData] = useState<DrawingData>(null)

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

    return (
        <AppContext.Provider
            value={{
                users,
                setUsers,
                currentUser,
                setCurrentUser,
                status,
                setStatus,
                activityState,
                setActivityState,
                drawingData,
                setDrawingData,
            }}
        >
            {children}
        </AppContext.Provider>
    )
}

export { AppContextProvider }
export default AppContext
