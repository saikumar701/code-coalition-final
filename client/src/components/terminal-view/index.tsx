import { useState } from "react";
import Output from "./Output.tsx";
import TerminalComponent from "./Terminal.tsx";
import { 
    PlayCircle, 
    Terminal,
    type LucideIcon
} from "lucide-react";

const TerminalView = () => {
    const [activeTab, setActiveTab] = useState("terminal");

    const tabs = [
        { id: "output", label: "Output", icon: PlayCircle },
        { id: "terminal", label: "Terminal", icon: Terminal },
    ];

    return (
        <div className="h-full flex flex-col bg-[#1E1E1E]">
            {/* Tab Bar */}
            <div className="flex items-center bg-[#252526] border-t border-gray-700 overflow-x-auto">
                {tabs.map((tab) => (
                    <Tab
                        key={tab.id}
                        label={tab.label}
                        icon={tab.icon}
                        active={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                    />
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-grow overflow-hidden">
                {activeTab === "output" && <Output />}
                {activeTab === "terminal" && <TerminalComponent />}
            </div>
        </div>
    );
};

interface TabProps {
    label: string;
    active: boolean;
    onClick: () => void;
    icon?: LucideIcon;
}

const Tab: React.FC<TabProps> = ({ label, active, onClick, icon: Icon }) => (
    <div
        className={`
            flex items-center gap-2 px-4 py-2 cursor-pointer text-xs font-medium
            border-b-2 transition-all whitespace-nowrap
            ${
                active
                    ? "bg-[#1E1E1E] text-white border-blue-500"
                    : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-[#2D2D30]"
            }
        `}
        onClick={onClick}
    >
        {Icon && <Icon size={14} />}
        {label}
    </div>
);

export default TerminalView;