import { useRunCode } from "@/context/RunCodeContext"
import useResponsive from "@/hooks/useResponsive"
import TerminalView from "@/components/terminal-view"
import { ChangeEvent, useState } from "react"
import toast from "react-hot-toast"
import { LuCopy } from "react-icons/lu"
import { PiCaretDownBold } from "react-icons/pi"

function RunView() {
    const { viewHeight } = useResponsive()
    const [mode, setMode] = useState<"terminal" | "runner">("terminal")
    const {
        setInput,
        output,
        isRunning,
        supportedLanguages,
        selectedLanguage,
        setSelectedLanguage,
        runCode,
    } = useRunCode()

    const handleLanguageChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const lang = JSON.parse(e.target.value)
        setSelectedLanguage(lang)
    }

    const copyOutput = () => {
        navigator.clipboard.writeText(output)
        toast.success("Output copied to clipboard")
    }

    const renderRunner = () => (
        <div className="flex h-full w-full flex-col items-end gap-2">
            <div className="relative w-full">
                <select
                    className="w-full rounded-md border-none bg-darkHover px-4 py-2 text-white outline-none"
                    value={JSON.stringify(selectedLanguage)}
                    onChange={handleLanguageChange}
                >
                    {supportedLanguages
                        .sort((a, b) => (a.language > b.language ? 1 : -1))
                        .map((lang, i) => {
                            return (
                                <option key={i} value={JSON.stringify(lang)}>
                                    {lang.language +
                                        (lang.version
                                            ? ` (${lang.version})`
                                            : "")}
                                </option>
                            )
                        })}
                </select>
                <PiCaretDownBold
                    size={16}
                    className="absolute bottom-3 right-4 z-10 text-white"
                />
            </div>
            <textarea
                className="min-h-[120px] w-full resize-none rounded-md border-none bg-darkHover p-2 text-white outline-none"
                placeholder="Write you input here..."
                onChange={(e) => setInput(e.target.value)}
            />
            <button
                className="flex w-full justify-center rounded-md bg-primary p-2 font-bold text-black outline-none disabled:cursor-not-allowed disabled:opacity-50"
                onClick={runCode}
                disabled={isRunning}
            >
                Run
            </button>
            <label className="flex w-full justify-between">
                Output :
                <button onClick={copyOutput} title="Copy Output">
                    <LuCopy size={18} className="cursor-pointer text-white" />
                </button>
            </label>
            <div className="w-full flex-grow resize-none overflow-y-auto rounded-md border-none bg-darkHover p-2 text-white outline-none">
                <code>
                    <pre className="text-wrap">{output}</pre>
                </code>
            </div>
        </div>
    )

    const renderTerminal = () => (
        <div className="h-full w-full">
            <TerminalView />
        </div>
    )

    return (
        <div className="flex flex-col gap-4 p-4" style={{ height: viewHeight }}>
            <div className="flex items-center justify-between">
                <h1 className="view-title m-0 border-none p-0">Run Tools</h1>
                <div className="flex gap-2">
                    {(["terminal", "runner"] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => setMode(value)}
                            className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                                mode === value
                                    ? "bg-primary text-black"
                                    : "bg-white/10 text-white/70 hover:bg-white/20"
                            }`}
                        >
                            {value === "terminal" ? "Terminal" : "Runner"}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1">
                {mode === "terminal" ? renderTerminal() : renderRunner()}
            </div>
        </div>
    )
}

export default RunView