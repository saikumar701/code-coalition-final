import { StoreSnapshot, TLRecord } from "@tldraw/tldraw"
import { PendingJoinRequest, RemoteUser, User, USER_STATUS } from "./user"

type DrawingData = StoreSnapshot<TLRecord> | null

enum ACTIVITY_STATE {
    CODING = "coding",
    DRAWING = "drawing",
}

interface AppContext {
    users: RemoteUser[]
    setUsers: (
        users: RemoteUser[] | ((users: RemoteUser[]) => RemoteUser[]),
    ) => void
    pendingJoinRequests: PendingJoinRequest[]
    setPendingJoinRequests: (
        requests:
            | PendingJoinRequest[]
            | ((requests: PendingJoinRequest[]) => PendingJoinRequest[]),
    ) => void
    currentUser: User
    setCurrentUser: (user: User) => void
    status: USER_STATUS
    setStatus: (status: USER_STATUS) => void
    activityState: ACTIVITY_STATE
    setActivityState: (state: ACTIVITY_STATE) => void
    drawingData: DrawingData
    setDrawingData: (data: DrawingData) => void
    autoSaveEnabled: boolean
    setAutoSaveEnabled: (enabled: boolean) => void
}

export { ACTIVITY_STATE }
export { AppContext, DrawingData }
