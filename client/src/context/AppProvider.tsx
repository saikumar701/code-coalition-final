import { ReactNode } from "react"
import { AppContextProvider } from "./AppContext.js"
import { ChatContextProvider } from "./ChatContext.jsx"
import { FileContextProvider } from "./FileContext.jsx"
import { RunCodeContextProvider } from "./RunCodeContext.jsx"
import { SettingContextProvider } from "./SettingContext.jsx"
import { SocketProvider } from "./SocketContext.jsx"
import { CopilotContextProvider } from "./CopilotContext.js"
import { FileShareContextProvider } from "./FileShareContext.js"

function AppProvider({ children }: { children: ReactNode }) {
    return (
        <AppContextProvider>
            <SocketProvider>
                <SettingContextProvider>
                    <FileContextProvider>
                        <CopilotContextProvider>
                            <RunCodeContextProvider>
                                <ChatContextProvider>
                                    <FileShareContextProvider>
                                        {children}
                                    </FileShareContextProvider>
                                </ChatContextProvider>
                            </RunCodeContextProvider>
                        </CopilotContextProvider>
                    </FileContextProvider>
                </SettingContextProvider>
            </SocketProvider>
        </AppContextProvider>
    )
}

export default AppProvider
