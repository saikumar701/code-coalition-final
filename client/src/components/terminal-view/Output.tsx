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
            <div className="h-full w-full bg-[var(--ui-terminal-bg)]">
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
        <div className="terminal-shell flex h-full flex-col">
            <div className="terminal-header flex flex-shrink-0 items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-[var(--ui-terminal-muted)]" />
                    <span className="text-xs font-medium text-[var(--ui-terminal-text)]">
                        Console Output
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {isRunning && (
                        <div className="flex items-center gap-2 text-xs text-[var(--ui-terminal-accent)]">
                            <Loader2 size={12} className="animate-spin" />
                            <span>Running...</span>
                        </div>
                    )}

                    {pendingInputs.length > 0 && (
                        <>
                            <span className="text-xs text-emerald-500">
                                {pendingInputs.length} input(s)
                            </span>
                            <button
                                onClick={handleClearInputs}
                                className="flex items-center gap-1 text-xs text-[var(--ui-terminal-error)] hover:brightness-110"
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
                        className="terminal-action-btn rounded px-2 py-1 text-xs"
                    >
                        {showInputHelper ? "Hide" : "Show"} Input
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed text-[var(--ui-terminal-text)]"
            >
                {consoleLines.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-[var(--ui-terminal-muted)]">
                        <Terminal size={48} className="mb-3 opacity-30" />
                        <p className="text-sm">Run your code to see output</p>
                    </div>
                ) : (
                    consoleLines.map((line) => (
                        <div
                            key={line.id}
                            className={`whitespace-pre-wrap break-words ${
                                line.type === "error"
                                    ? "text-[var(--ui-terminal-error)]"
                                    : "text-[var(--ui-terminal-text)]"
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
                    className="terminal-header border-t p-3"
                >
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-[var(--ui-terminal-accent)]">
                            &gt;
                        </span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={currentInput}
                            onChange={(e) =>
                                setCurrentInput(e.target.value)
                            }
                            className="flex-1 rounded border px-3 py-2 font-mono text-sm focus:outline-none"
                            style={{
                                borderColor: "var(--ui-terminal-border)",
                                background: "var(--ui-terminal-input-bg)",
                                color: "var(--ui-terminal-input-text)",
                            }}
                            placeholder="Type input and press Enter..."
                        />
                    </div>
                </form>
            )}
        </div>
    )
}

export default Output
