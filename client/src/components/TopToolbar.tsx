import { VscRunAll } from "react-icons/vsc"
import { Button } from "@/components/ui/button"
import { useRunCode } from "@/context/RunCodeContext"
import GitHubCorner from "@/components/GitHubCorner"
import Dropdown from "@/components/common/Dropdown"

const TopToolbar = () => {
    const { runCode } = useRunCode()

    return (
        <div className="flex items-center justify-between p-2 bg-gray-800 text-white border-b border-gray-700">
            {/* Left section */}
            <div className="flex items-center gap-4">
                <Button className="bg-white text-black hover:bg-gray-200" size="sm" onClick={runCode}>
                    <VscRunAll className="h-5 w-5 mr-2" />
                    Run
                </Button>
            </div>

            {/* Center section */}
            <div className="flex-1 flex justify-center">
                <span className="text-green-1000 font-extrabold text-xl drop-shadow-[0_0_8px_#00ff00]">
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
