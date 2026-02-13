enum VIEWS {
    FILES = "FILES",
    CHATS = "CHATS",
    FILE_SHARING = "FILE_SHARING",
    CLIENTS = "CLIENTS",
    RUN = "RUN",
    COPILOT = "COPILOT",
    SETTINGS = "SETTINGS",
}

interface ViewContext {
    activeView: VIEWS
    setActiveView: (activeView: VIEWS) => void
    isSidebarOpen: boolean
    setIsSidebarOpen: (isSidebarOpen: boolean) => void
    viewComponents: { [key in VIEWS]: JSX.Element }
    viewIcons: { [key in VIEWS]: JSX.Element }
}

export { ViewContext, VIEWS }
