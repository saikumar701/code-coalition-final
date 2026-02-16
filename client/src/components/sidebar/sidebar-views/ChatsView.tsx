import ChatInput from "@/components/chats/ChatInput"
import ChatList from "@/components/chats/ChatList"
import useResponsive from "@/hooks/useResponsive"

const ChatsView = () => {
    const { viewHeight } = useResponsive()

    return (
        <div
            className="sidebar-modern-view flex max-h-full min-h-[400px] w-full flex-col gap-3 p-4"
            style={{ height: viewHeight }}
        >
            <div className="sidebar-modern-header">
                <div>
                    <h1 className="view-title m-0 border-none pb-0">Chat</h1>
                    <p className="ui-muted-text text-xs">Live room conversation</p>
                </div>
            </div>
            {/* Chat list */}
            <ChatList />
            {/* Chat input */}
            <ChatInput />
        </div>
    )
}

export default ChatsView
