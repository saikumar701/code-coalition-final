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
        <div className="terminal-shell flex h-full flex-col">
            {/* Tab Bar */}
            <div className="terminal-tabbar flex items-center border-t overflow-x-auto">
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
            terminal-tab flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-2 text-xs font-medium
            transition-all
            ${
                active
                    ? "terminal-tab--active"
                    : ""
            }
        `}
        onClick={onClick}
    >
        {Icon && <Icon size={14} />}
        {label}
    </div>
);

export default TerminalView;
