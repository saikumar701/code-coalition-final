import { VscRunAll } from "react-icons/vsc"
import { Button } from "@/components/ui/button"
import { useRunCode } from "@/context/RunCodeContext"
import GitHubCorner from "@/components/GitHubCorner"
import Dropdown from "@/components/common/Dropdown"

const TopToolbar = () => {
    const { runCode } = useRunCode()

    return (
        <div className="workspace-toolbar flex items-center justify-between px-3 py-2 text-[var(--ui-text-primary)]">
            {/* Left section */}
            <div className="flex items-center gap-4">
                <Button
                    className="sidebar-modern-btn sidebar-modern-btn--primary h-9 px-4"
                    size="sm"
                    onClick={runCode}
                >
                    <VscRunAll className="mr-2 h-5 w-5" />
                    Run
                </Button>
            </div>

            {/* Center section */}
            <div className="flex flex-1 justify-center">
                <span className="workspace-brand-title text-xl font-extrabold">
                    Code Coalition
                </span>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-4">
                <GitHubCorner />
                <Dropdown />
            </div>
        </div>
    )
}

export default TopToolbar
