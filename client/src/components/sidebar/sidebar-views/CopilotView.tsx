import { useCopilot } from "@/context/CopilotContext"
import { useFileSystem } from "@/context/FileContext"
import { useSocket } from "@/context/SocketContext"
import useResponsive from "@/hooks/useResponsive"
import { SocketEvent } from "@/types/socket"
import toast from "react-hot-toast"
import { LuClipboardPaste, LuCopy, LuRepeat } from "react-icons/lu"
import ReactMarkdown from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

function CopilotView() {
    const {socket} = useSocket()
    const { viewHeight } = useResponsive()
    const { generateCode, output, isRunning, setInput } = useCopilot()
    const { activeFile, updateFileContent, setActiveFile } = useFileSystem()

    const extractCodeForEditor = (text: string) => {
        const matches = [...text.matchAll(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g)]
        if (matches.length === 0) {
            return text.trim()
        }

        return matches
            .map((match) => match[1].trim())
            .filter(Boolean)
            .join("\n\n")
    }

    const copyOutput = async () => {
        try {
            const content = extractCodeForEditor(output)
            await navigator.clipboard.writeText(content)
            toast.success("Output copied to clipboard")
        } catch (error) {
            toast.error("Unable to copy output to clipboard")
            console.log(error)
        }
    }

    const pasteCodeInFile = () => {
        if (activeFile) {
            const fileContent = activeFile.content
                ? `${activeFile.content}\n`
                : ""
            const content = `${fileContent}${extractCodeForEditor(output)}`
            updateFileContent(activeFile.id, content)
            // Update the content of the active file if it's the same file
            setActiveFile({ ...activeFile, content })
            toast.success("Code pasted successfully")
            // Emit the FILE_UPDATED event to the server
            socket.emit(SocketEvent.FILE_UPDATED, {
                fileId: activeFile.id,
                newContent: content,
            })
        }
    }

    const replaceCodeInFile = () => {
        if (activeFile) {
            const isConfirmed = confirm(
                `Are you sure you want to replace the code in the file?`,
            )
            if (!isConfirmed) return
            const content = extractCodeForEditor(output)
            updateFileContent(activeFile.id, content)
            // Update the content of the active file if it's the same file
            setActiveFile({ ...activeFile, content })
            toast.success("Code replaced successfully")
            // Emit the FILE_UPDATED event to the server
            socket.emit(SocketEvent.FILE_UPDATED, {
                fileId: activeFile.id,
                newContent: content,
            })
        }
    }

    return (
        <div
            className="sidebar-modern-view flex max-h-full min-h-[400px] w-full flex-col gap-3 p-4"
            style={{ height: viewHeight }}
        >
            <div className="sidebar-modern-header">
                <h1 className="view-title m-0 border-none pb-0">Copilot</h1>
            </div>
            <textarea
                className="sidebar-modern-control min-h-[120px] p-2 text-sm"
                placeholder="Ask anything: code, errors, concepts, or project questions..."
                onChange={(e) => setInput(e.target.value)}
            />
            <button
                className="sidebar-modern-btn sidebar-modern-btn--primary mt-1 flex w-full justify-center"
                onClick={generateCode}
                disabled={isRunning}
            >
                {isRunning ? "Thinking..." : "Ask Copilot"}
            </button>
            {output && (
                <div className="flex justify-end gap-4 pt-2">
                    <button className="sidebar-modern-btn h-9 w-9 p-0" title="Copy Output" onClick={copyOutput}>
                        <LuCopy
                            size={18}
                            className="cursor-pointer text-[var(--ui-text-primary)]"
                        />
                    </button>
                    <button
                        className="sidebar-modern-btn h-9 w-9 p-0"
                        title="Replace code in file"
                        onClick={replaceCodeInFile}
                    >
                        <LuRepeat
                            size={18}
                            className="cursor-pointer text-[var(--ui-text-primary)]"
                        />
                    </button>
                    <button
                        className="sidebar-modern-btn h-9 w-9 p-0"
                        title="Paste code in file"
                        onClick={pasteCodeInFile}
                    >
                        <LuClipboardPaste
                            size={18}
                            className="cursor-pointer text-[var(--ui-text-primary)]"
                        />
                    </button>
                </div>
            )}
            <div className="sidebar-modern-scroll h-full w-full overflow-y-auto p-2">
                <ReactMarkdown
                    components={{
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        code({ inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || "")
                            const language = match ? match[1] : "javascript" // Default to JS

                            return !inline ? (
                                <SyntaxHighlighter
                                    style={dracula}
                                    language={language}
                                    PreTag="pre"
                                    className="!m-0 !h-full !rounded-lg !bg-gray-900 !p-2"
                                >
                                    {String(children).replace(/\n$/, "")}
                                </SyntaxHighlighter>
                            ) : (
                                <code className={className} {...props}>
                                    {children}
                                </code>
                            )
                        },
                        pre({ children }) {
                            return <pre className="h-full">{children}</pre>
                        },
                    }}
                >
                    {output}
                </ReactMarkdown>
            </div>
        </div>
    )
}

export default CopilotView
