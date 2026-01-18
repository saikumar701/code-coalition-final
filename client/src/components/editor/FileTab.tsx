import { useFileSystem } from "@/context/FileContext";
import { getIconClassName } from "@/utils/getIconClassName";
import { Icon } from "@iconify/react";
import { IoClose } from "react-icons/io5";
import cn from "classnames";
import { useEffect, useRef } from "react";
import customMapping from "@/utils/customMapping";
import { useSettings } from "@/context/SettingContext";
import langMap from "lang-map";

function FileTab() {
    const {
        openFiles,
        closeFile,
        activeFile,
        updateFileContent,
        setActiveFile,
    } = useFileSystem();
    const fileTabRef = useRef<HTMLDivElement>(null);
    const { setLanguage } = useSettings();

    const changeActiveFile = (fileId: string) => {
        if (activeFile?.id === fileId) return;
        updateFileContent(activeFile?.id || "", activeFile?.content || "");
        const file = openFiles.find((file) => file.id === fileId);
        if (file) {
            setActiveFile(file);
        }
    };

    useEffect(() => {
        const fileTabNode = fileTabRef.current;
        if (!fileTabNode) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY > 0) {
                fileTabNode.scrollLeft += 100;
            } else {
                fileTabNode.scrollLeft -= 100;
            }
        };

        fileTabNode.addEventListener("wheel", handleWheel);

        return () => {
            fileTabNode.removeEventListener("wheel", handleWheel);
        };
    }, []);

    useEffect(() => {
        if (activeFile?.name === undefined) return;
        const extension = activeFile.name.split(".").pop();
        if (!extension) return;

        if (customMapping[extension]) {
            setLanguage(customMapping[extension]);
            return;
        }

        const language = langMap.languages(extension);
        setLanguage(language[0]);
    }, [activeFile?.name, setLanguage]);

    return (
        <div
            className="flex h-10 w-full select-none bg-[#161B22] border-b border-gray-800"
            ref={fileTabRef}
        >
            {openFiles.map((file) => (
                <div
                    key={file.id}
                    className={cn(
                        "flex items-center justify-between h-full px-4 cursor-pointer border-r border-gray-800",
                        {
                            "bg-[#212429]": file.id === activeFile?.id,
                            "hover:bg-gray-800/50": file.id !== activeFile?.id,
                        }
                    )}
                    onClick={() => changeActiveFile(file.id)}
                >
                    <div className="flex items-center gap-2">
                        <Icon
                            icon={getIconClassName(file.name)}
                            fontSize={18}
                        />
                        <span className="text-sm text-gray-300 font-medium">{file.name}</span>
                    </div>
                    <IoClose
                        className="ml-4 p-1 rounded-md hover:bg-gray-700"
                        size={20}
                        onClick={(e) => {
                            e.stopPropagation();
                            closeFile(file.id);
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

export default FileTab;