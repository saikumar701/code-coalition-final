import { useEffect, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import { useSocket } from "@/context/SocketContext"
import { SocketEvent } from "@/types/socket"

type TerminalLine = {
    id: string
    text: string
    role: "input" | "output" | "error" | "system"
}

interface TerminalProps {
    onClose?: () => void
    variant?: "modal" | "panel"
}

const Terminal = ({ onClose, variant = "modal" }: TerminalProps) => {
    const { socket } = useSocket()
    const [lines, setLines] = useState<TerminalLine[]>([
        {
            id: uuidv4(),
            text: "Interactive terminal connected. Press Esc to close.",
            role: "system",
        },
    ])
    const [currentInput, setCurrentInput] = useState("")
    const [history, setHistory] = useState<string[]>([])
    const [historyIndex, setHistoryIndex] = useState<number | null>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
        if (!onClose) return
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose()
            }
        }
        window.addEventListener("keydown", handleKey)
        return () => window.removeEventListener("keydown", handleKey)
    }, [onClose])

    useEffect(() => {
        const handleOutput = ({
            lines,
            isError,
        }: {
            lines: string[]
            isError?: boolean
        }) => {
            const newLines: TerminalLine[] = lines.map((text) => ({
                id: uuidv4(),
                text,
                role: isError ? "error" : "system",
            }))
            setLines((prev) => [...prev, ...newLines])
        }
        socket.on(SocketEvent.TERMINAL_OUTPUT, handleOutput)
        return () => {
            socket.off(SocketEvent.TERMINAL_OUTPUT, handleOutput)
        }
    }, [socket])

    useEffect(() => {
        requestAnimationFrame(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop =
                    scrollContainerRef.current.scrollHeight
            }
        })
    }, [lines])

    const submitInput = () => {
        if (!currentInput.trim()) return
        const payload = currentInput
        setLines((prev) => [
            ...prev,
            { id: uuidv4(), text: `> ${payload}`, role: "input" },
        ])
        socket.emit(SocketEvent.TERMINAL_EXECUTE, { input: payload })
        setHistory((prev) => [...prev, payload])
        setHistoryIndex(null)
        setCurrentInput("")
    }

    const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        submitInput()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowUp") {
            event.preventDefault()
            if (!history.length) return
            setHistoryIndex((prev) => {
                const nextIndex =
                    prev === null ? history.length - 1 : Math.max(prev - 1, 0)
                setCurrentInput(history[nextIndex])
                return nextIndex
            })
        } else if (event.key === "ArrowDown") {
            event.preventDefault()
            if (historyIndex === null) return
            if (historyIndex === history.length - 1) {
                setHistoryIndex(null)
                setCurrentInput("")
                return
            }
            const nextIndex = Math.min(historyIndex + 1, history.length - 1)
            setHistoryIndex(nextIndex)
            setCurrentInput(history[nextIndex])
        }
    }

    const clearTerminal = () => {
        setLines([
            {
                id: uuidv4(),
                text: "Terminal cleared.",
                role: "system",
            },
        ])
        socket.emit(SocketEvent.TERMINAL_RESET)
        setHistoryIndex(null)
    }

    const terminalBody = (
        <div
            className={`flex flex-col overflow-hidden border border-white/10 bg-[#050A18] ${
                variant === "modal"
                    ? "h-[75vh] w-full max-w-4xl rounded-3xl shadow-2xl"
                    : "h-full w-full rounded-2xl shadow-[inset_0_0_20px_rgba(0,0,0,0.45)]"
            }`}
        >
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary/70">
                            Terminal
                        </p>
                        <p className="text-xs text-white/60">
                            Real-time sandboxed execution
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={clearTerminal}
                            className="rounded-full border border-white/15 px-4 py-1 text-sm font-semibold text-white transition hover:border-primary hover:text-primary"
                        >
                            Clear
                        </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="rounded-full border border-white/15 px-4 py-1 text-sm font-semibold text-white transition hover:border-red-400 hover:text-red-400"
                        >
                            Close
                        </button>
                    )}
                    </div>
                </header>
                <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto bg-black/40 px-6 py-4 font-mono text-sm text-[#c9ffc4]"
                >
                    {lines.map((line) => (
                        <div
                            key={line.id}
                            className={`whitespace-pre-wrap ${
                                line.role === "input"
                                    ? "text-primary"
                                    : line.role === "error"
                                      ? "text-red-300"
                                      : line.role === "system"
                                        ? "text-white/60"
                                        : "text-[#c9ffc4]"
                            }`}
                        >
                            {line.text || "\u00A0"}
                        </div>
                    ))}
                </div>
                <form
                    onSubmit={handleFormSubmit}
                    className="flex items-center gap-4 border-t border-white/10 bg-[#080d1f] px-6 py-4"
                >
                    <span className="text-primary">›</span>
                    <input
                        ref={inputRef}
                        value={currentInput}
                        onChange={(event) => setCurrentInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 rounded-md border border-white/10 bg-black/40 px-4 py-2 font-mono text-sm text-white outline-none transition focus:border-primary"
                        placeholder="Type a command or expression and press Enter..."
                    />
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-6 py-2 font-semibold text-[#050A18] transition hover:bg-green-300"
                    >
                        Send
                    </button>
                </form>
        </div>
    )

    if (variant === "modal") {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                {terminalBody}
            </div>
        )
    }

    return terminalBody
}

export default Terminal

