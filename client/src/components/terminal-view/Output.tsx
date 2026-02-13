import { useRunCode } from "@/context/RunCodeContext"
import { Loader2, RotateCcw, Terminal } from "lucide-react"
import { useEffect, useRef, useState } from "react"

interface ConsoleLine {
    id: number
    text: string
    type: "prompt" | "input" | "output" | "error"
}

const Output = () => {
    const { output, outputMode, setInput, isRunning } = useRunCode()
    const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
    const [currentInput, setCurrentInput] = useState("")
    const [pendingInputs, setPendingInputs] = useState<string[]>([])
    const [showInputHelper, setShowInputHelper] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const isHTML = outputMode === "html"

    useEffect(() => {
        if (isHTML) {
            return
        }

        if (!output) {
            setConsoleLines([])
            return
        }

        const parsed: ConsoleLine[] = []
        let id = 0

        output.split("\n").forEach((line) => {
            const isError =
                line.includes("Error") || line.includes("Traceback")

            parsed.push({
                id: id++,
                text: line,
                type: isError ? "error" : "output",
            })
        })

        setConsoleLines(parsed)
    }, [isHTML, output])

    useEffect(() => {
        if (isHTML) {
            return
        }

        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [consoleLines, isHTML])

    useEffect(() => {
        if (isHTML) {
            return
        }

        if (pendingInputs.length > 0) {
            setInput(pendingInputs.join("\n"))
        }
    }, [isHTML, pendingInputs, setInput])

    const handleAddInput = (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentInput.trim()) return

        setPendingInputs((prev) => [...prev, currentInput])
        setCurrentInput("")
        inputRef.current?.focus()
    }

    const handleClearInputs = () => {
        setPendingInputs([])
        setConsoleLines([])
    }

    if (isHTML) {
        return (
            <div className="h-full w-full bg-white">
                <iframe
                    srcDoc={output}
                    className="h-full w-full border-0"
                    title="HTML Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col bg-[#0C0C0C]">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-800 bg-[#1E1E1E] px-3 py-2">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-400">
                        Console Output
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {isRunning && (
                        <div className="flex items-center gap-2 text-xs text-blue-400">
                            <Loader2 size={12} className="animate-spin" />
                            <span>Running...</span>
                        </div>
                    )}

                    {pendingInputs.length > 0 && (
                        <>
                            <span className="text-xs text-green-400">
                                {pendingInputs.length} input(s)
                            </span>
                            <button
                                onClick={handleClearInputs}
                                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                            >
                                <RotateCcw size={12} />
                                Clear
                            </button>
                        </>
                    )}

                    <button
                        onClick={() =>
                            setShowInputHelper(!showInputHelper)
                        }
                        className="rounded bg-gray-700 px-2 py-1 text-xs text-white hover:bg-gray-600"
                    >
                        {showInputHelper ? "Hide" : "Show"} Input
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
            >
                {consoleLines.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-gray-600">
                        <Terminal size={48} className="mb-3 opacity-30" />
                        <p className="text-sm">Run your code to see output</p>
                    </div>
                ) : (
                    consoleLines.map((line) => (
                        <div
                            key={line.id}
                            className={`whitespace-pre-wrap break-words ${
                                line.type === "error"
                                    ? "text-red-400"
                                    : "text-gray-200"
                            }`}
                        >
                            {line.text}
                        </div>
                    ))
                )}
            </div>

            {showInputHelper && (
                <form
                    onSubmit={handleAddInput}
                    className="border-t border-gray-800 bg-[#1E1E1E] p-3"
                >
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-cyan-400">
                            &gt;
                        </span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={currentInput}
                            onChange={(e) =>
                                setCurrentInput(e.target.value)
                            }
                            className="flex-1 rounded border border-gray-700 bg-[#0C0C0C] px-3 py-2 font-mono text-sm text-green-400 focus:border-cyan-500 focus:outline-none"
                            placeholder="Type input and press Enter..."
                        />
                    </div>
                </form>
            )}
        </div>
    )
}

export default Output
