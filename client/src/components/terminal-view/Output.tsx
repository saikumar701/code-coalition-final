import { useRunCode } from "@/context/RunCodeContext";
import { Loader2, Terminal, RotateCcw } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface ConsoleLine {
    id: number;
    text: string;
    type: "prompt" | "input" | "output" | "error";
}

const Output = () => {
    const { output, setInput, isRunning } = useRunCode();
    const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
    const [currentInput, setCurrentInput] = useState("");
    const [pendingInputs, setPendingInputs] = useState<string[]>([]);
    const [showInputHelper, setShowInputHelper] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    /* -------------------------------------------------- */
    /* 🔥 Detect if output is HTML */
    /* -------------------------------------------------- */
    const trimmed = output?.trim().toLowerCase() || "";

    const isHTML =
        trimmed.startsWith("<!doctype") ||
        trimmed.startsWith("<html") ||
        trimmed.includes("<html") ||
        trimmed.includes("<body");

    /* -------------------------------------------------- */
    /* 🧠 If HTML → Render Preview */
    /* -------------------------------------------------- */
    if (isHTML) {
        return (
            <div className="h-full w-full bg-white">
                <iframe
                    srcDoc={output}
                    className="w-full h-full border-0"
                    title="HTML Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
            </div>
        );
    }

    /* -------------------------------------------------- */
    /* 🖥 Console Logic (Non-HTML) */
    /* -------------------------------------------------- */

    useEffect(() => {
        if (!output) {
            setConsoleLines([]);
            return;
        }

        const parsed: ConsoleLine[] = [];
        let id = 0;

        const lines = output.split("\n");

        lines.forEach((line) => {
            const isError =
                line.includes("Error") || line.includes("Traceback");

            parsed.push({
                id: id++,
                text: line,
                type: isError ? "error" : "output",
            });
        });

        setConsoleLines(parsed);
    }, [output]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop =
                scrollRef.current.scrollHeight;
        }
    }, [consoleLines]);

    useEffect(() => {
        if (pendingInputs.length > 0) {
            setInput(pendingInputs.join("\n"));
        }
    }, [pendingInputs, setInput]);

    const handleAddInput = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentInput.trim()) return;

        setPendingInputs((prev) => [...prev, currentInput]);
        setCurrentInput("");
        inputRef.current?.focus();
    };

    const handleClearInputs = () => {
        setPendingInputs([]);
        setConsoleLines([]);
    };

    return (
        <div className="h-full flex flex-col bg-[#0C0C0C]">
            {/* Header */}
            <div className="flex items-center justify-between bg-[#1E1E1E] border-b border-gray-800 px-3 py-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-400 font-medium">
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
                                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
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
                        className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                    >
                        {showInputHelper ? "Hide" : "Show"} Input
                    </button>
                </div>
            </div>

            {/* Console Display */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
            >
                {consoleLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-600">
                        <Terminal size={48} className="mb-3 opacity-30" />
                        <p className="text-sm">
                            Run your code to see output
                        </p>
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

            {/* Input Area */}
            {showInputHelper && (
                <form
                    onSubmit={handleAddInput}
                    className="border-t border-gray-800 bg-[#1E1E1E] p-3"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-mono text-sm">
                            &gt;
                        </span>
                        <input
                            ref={inputRef}
                            type="text"
                            value={currentInput}
                            onChange={(e) =>
                                setCurrentInput(e.target.value)
                            }
                            className="flex-1 bg-[#0C0C0C] text-green-400 px-3 py-2 rounded border border-gray-700 focus:border-cyan-500 focus:outline-none font-mono text-sm"
                            placeholder="Type input and press Enter..."
                        />
                    </div>
                </form>
            )}
        </div>
    );
};

export default Output;
