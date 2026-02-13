import { useEffect, useRef } from "react"
import { SocketEvent } from "@/types/socket"
import { useSocket } from "@/context/SocketContext"
import { Terminal as TerminalIcon, X } from "lucide-react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"

type TerminalOutputPayload = {
    data?: string
    lines?: string[]
}

type TerminalCdEventDetail = {
    path?: string
}

function TerminalComponent() {
    const { socket } = useSocket()
    const terminalElementRef = useRef<HTMLDivElement | null>(null)
    const xtermRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)

    useEffect(() => {
        if (!terminalElementRef.current) return

        const term = new Terminal({
            cursorBlink: true,
            convertEol: false,
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize: 13,
            theme: {
                background: "#1E1E1E",
                foreground: "#d4d4d4",
                cursor: "#d4d4d4",
            },
        })
        const fitAddon = new FitAddon()

        term.loadAddon(fitAddon)
        term.open(terminalElementRef.current)
        fitAddon.fit()
        socket.emit(SocketEvent.TERMINAL_RESIZE, {
            cols: term.cols,
            rows: term.rows,
        })
        term.focus()

        const handleWindowResize = () => {
            fitAddon.fit()
            socket.emit(SocketEvent.TERMINAL_RESIZE, {
                cols: term.cols,
                rows: term.rows,
            })
        }

        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit()
            socket.emit(SocketEvent.TERMINAL_RESIZE, {
                cols: term.cols,
                rows: term.rows,
            })
        })
        resizeObserver.observe(terminalElementRef.current)
        window.addEventListener("resize", handleWindowResize)

        const terminalInputDisposable = term.onData((data) => {
            socket.emit(SocketEvent.TERMINAL_EXECUTE, { input: data })
        })

        const handleOutput = (payload: TerminalOutputPayload) => {
            if (typeof payload.data === "string") {
                term.write(payload.data)
                return
            }
            if (Array.isArray(payload.lines)) {
                term.write(payload.lines.join("\r\n"))
                if (payload.lines.length > 0) {
                    term.write("\r\n")
                }
            }
        }

        const handleTerminalCd = (event: Event) => {
            const customEvent = event as CustomEvent<TerminalCdEventDetail>
            const path = (customEvent.detail?.path || ".").replace(/"/g, '\\"')
            socket.emit(SocketEvent.TERMINAL_EXECUTE, {
                input: `cd "${path}"\r`,
            })
            term.focus()
        }

        socket.on(SocketEvent.TERMINAL_OUTPUT, handleOutput)
        window.addEventListener("terminal:cd", handleTerminalCd as EventListener)

        xtermRef.current = term
        fitAddonRef.current = fitAddon

        return () => {
            window.removeEventListener("resize", handleWindowResize)
            resizeObserver.disconnect()
            terminalInputDisposable.dispose()
            socket.off(SocketEvent.TERMINAL_OUTPUT, handleOutput)
            window.removeEventListener("terminal:cd", handleTerminalCd as EventListener)
            term.dispose()
            xtermRef.current = null
            fitAddonRef.current = null
        }
    }, [socket])

    const clearTerminal = () => {
        socket.emit(SocketEvent.TERMINAL_RESET)
        xtermRef.current?.clear()
        xtermRef.current?.focus()
    }

    return (
        <div className="flex h-full flex-col bg-[#1E1E1E]">
            <div className="flex items-center justify-between border-b border-gray-700 bg-[#252526] px-3 py-1.5">
                <div className="flex items-center gap-2">
                    <TerminalIcon size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-400">Terminal</span>
                    <span className="text-xs text-gray-500">PowerShell</span>
                </div>
                <button
                    onClick={clearTerminal}
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                    title="Clear terminal"
                >
                    <X size={14} />
                </button>
            </div>

            <div
                ref={terminalElementRef}
                className="min-h-0 flex-1 overflow-hidden px-2 py-1"
                onClick={() => xtermRef.current?.focus()}
            />
        </div>
    )
}

export default TerminalComponent
