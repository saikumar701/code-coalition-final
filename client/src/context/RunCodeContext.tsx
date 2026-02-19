import axiosInstance from "@/api/pistonApi"
import {
    Language,
    RunContext as RunContextType,
    RunDiagnostic,
} from "@/types/run"
import langMap from "lang-map"
import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
} from "react"
import toast from "react-hot-toast"
import { useFileSystem } from "./FileContext"

const RunCodeContext = createContext<RunContextType | null>(null)
const EMPTY_LANGUAGE: Language = { language: "", version: "", aliases: [] }
const preferredRuntimeCandidates = [
    "python",
    "javascript",
    "node",
    "typescript",
    "java",
    "c",
    "cpp",
    "go",
    "rust",
]

const mimeRuntimeCandidates: Record<string, string[]> = {
    "application/javascript": ["javascript", "js", "node"],
    "application/json": ["javascript", "js", "node"],
    "application/typescript": ["typescript", "ts"],
    "application/x-httpd-php": ["php"],
    "application/xhtml+xml": ["html"],
    "text/css": ["css"],
    "text/html": ["html"],
    "text/javascript": ["javascript", "js", "node"],
    "text/markdown": ["markdown", "md"],
    "text/typescript": ["typescript", "ts"],
    "text/x-c++src": ["cpp", "c++", "cxx"],
    "text/x-csrc": ["c"],
    "text/x-csharp": ["csharp", "cs", "dotnet"],
    "text/x-go": ["go", "golang"],
    "text/x-java-source": ["java"],
    "text/x-php": ["php"],
    "text/x-python": ["python", "py"],
    "text/x-ruby": ["ruby", "rb"],
    "text/x-rust": ["rust", "rs"],
    "text/x-script.python": ["python", "py"],
    "text/x-shellscript": ["bash", "sh"],
}

interface RunnableFile {
    name: string
    mimeType?: string
    content?: string
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function selectDiagnosticMessage(lines: string[], lineIndex: number): string {
    const currentLine = (lines[lineIndex] || "").trim()
    if (/(error|exception|traceback|syntax)/i.test(currentLine)) {
        return currentLine
    }

    for (let offset = 1; offset <= 2; offset++) {
        const nextLine = (lines[lineIndex + offset] || "").trim()
        if (/(error|exception|traceback|syntax)/i.test(nextLine)) {
            return nextLine
        }
    }

    const fallback =
        [...lines]
            .reverse()
            .find((line) => /(error|exception|traceback|syntax)/i.test(line)) || ""
    return fallback.trim() || currentLine || "Runtime error"
}

function parseRuntimeDiagnostics(
    output: string,
    fileName: string,
): RunDiagnostic[] {
    const lines = output.split(/\r?\n/)
    const diagnostics: RunDiagnostic[] = []
    const uniqueKeys = new Set<string>()
    const escapedFileName = escapeRegExp(fileName.trim())

    const pushDiagnostic = (
        line: number,
        column: number | undefined,
        message: string,
    ) => {
        if (!Number.isFinite(line) || line <= 0) return
        const normalizedColumn =
            typeof column === "number" && Number.isFinite(column) && column > 0
                ? column
                : undefined
        const normalizedMessage = message.trim() || "Runtime error"
        const key = `${line}:${normalizedColumn || 0}:${normalizedMessage}`
        if (uniqueKeys.has(key)) return
        uniqueKeys.add(key)
        diagnostics.push({
            line,
            column: normalizedColumn,
            message: normalizedMessage,
        })
    }

    lines.forEach((rawLine, index) => {
        const line = rawLine.trim()
        if (!line) return

        const message = selectDiagnosticMessage(lines, index)

        // Patterns like: file.py:12:8 ...
        const fileWithColumnMatch = line.match(
            new RegExp(`${escapedFileName}:(\\d+):(\\d+)`, "i"),
        )
        if (fileWithColumnMatch) {
            pushDiagnostic(
                Number(fileWithColumnMatch[1]),
                Number(fileWithColumnMatch[2]),
                message,
            )
            return
        }

        // Patterns like: file.py:12 ...
        const fileLineMatch = line.match(
            new RegExp(`${escapedFileName}:(\\d+)`, "i"),
        )
        if (fileLineMatch) {
            pushDiagnostic(Number(fileLineMatch[1]), undefined, message)
            return
        }

        // Python traceback style: File ".../file.py", line 12
        const pythonTracebackMatch = line.match(
            new RegExp(
                `File\\s+"[^"]*${escapedFileName}",\\s*line\\s+(\\d+)`,
                "i",
            ),
        )
        if (pythonTracebackMatch) {
            pushDiagnostic(Number(pythonTracebackMatch[1]), undefined, message)
            return
        }

        // Generic: line 12
        const genericLineMatch = line.match(/\bline\s+(\d+)\b/i)
        if (genericLineMatch && /(error|exception|traceback|syntax)/i.test(line)) {
            pushDiagnostic(Number(genericLineMatch[1]), undefined, message)
        }
    })

    return diagnostics.slice(0, 25)
}

function normalizeValue(value: string): string {
    return value.trim().toLowerCase()
}

function getLanguageNamesFromExtension(extension: string): string[] {
    const normalizedExtension = normalizeValue(extension)
    if (!normalizedExtension) return []

    try {
        const mappedNames = langMap.languages(normalizedExtension)
        if (Array.isArray(mappedNames)) {
            return mappedNames.map((name) => normalizeValue(String(name)))
        }
        return [normalizeValue(String(mappedNames))]
    } catch {
        return []
    }
}

function getExtensionCandidates(fileName: string): string[] {
    const splitName = fileName.split(".")
    if (splitName.length < 2) return []

    const extension = normalizeValue(splitName.pop() || "")
    if (!extension) return []
    return [extension, ...getLanguageNamesFromExtension(extension)]
}

function getMimeCandidates(mimeType?: string): string[] {
    const normalizedMime = normalizeValue((mimeType || "").split(";")[0] || "")
    if (!normalizedMime) return []
    return mimeRuntimeCandidates[normalizedMime] || []
}

function getContentCandidates(content?: string): string[] {
    if (!content) return []

    const firstLine = normalizeValue(content.split(/\r?\n/, 1)[0] || "")
    const normalizedContent = content.toLowerCase()
    const candidates: string[] = []

    if (firstLine.startsWith("#!")) {
        if (firstLine.includes("python")) candidates.push("python", "py")
        if (firstLine.includes("node")) candidates.push("javascript", "js", "node")
        if (firstLine.includes("bash") || firstLine.includes("sh")) candidates.push("bash", "sh")
        if (firstLine.includes("ruby")) candidates.push("ruby", "rb")
        if (firstLine.includes("php")) candidates.push("php")
    }

    if (
        /^\s*<!doctype html/i.test(content) ||
        /^\s*<html[\s>]/i.test(content)
    ) {
        candidates.push("html")
    }

    if (/\bpublic\s+static\s+void\s+main\s*\(/i.test(content)) {
        candidates.push("java")
    }

    if (/\bpackage\s+main\b/i.test(content) && /\bfunc\s+main\s*\(/i.test(content)) {
        candidates.push("go")
    }

    if (/\bdef\s+\w+\s*\([^)]*\)\s*:/i.test(content)) {
        candidates.push("python", "py")
    }

    if (
        /\bconsole\.log\s*\(/.test(normalizedContent) ||
        /\bmodule\.exports\b/.test(normalizedContent) ||
        /\brequire\s*\(/.test(normalizedContent)
    ) {
        candidates.push("javascript", "js", "node")
    }

    return candidates
}

function findMatchingLanguage(
    runtimes: Language[],
    candidates: string[],
): Language | null {
    const normalizedCandidates = [...new Set(candidates.map(normalizeValue).filter(Boolean))]
    if (!normalizedCandidates.length) return null

    const exactMatch = runtimes.find((runtime) => {
        const runtimeName = normalizeValue(runtime.language)
        const runtimeAliases = runtime.aliases.map(normalizeValue)
        return normalizedCandidates.some(
            (candidate) => runtimeName === candidate || runtimeAliases.includes(candidate),
        )
    })

    if (exactMatch) return exactMatch

    return (
        runtimes.find((runtime) => {
            const runtimeName = normalizeValue(runtime.language)
            return normalizedCandidates.some(
                (candidate) =>
                    runtimeName.includes(candidate) || candidate.includes(runtimeName),
            )
        }) || null
    )
}

function getPreferredRuntime(runtimes: Language[]): Language | null {
    return findMatchingLanguage(runtimes, preferredRuntimeCandidates)
}

function inferRuntimeFromFile(
    file: RunnableFile,
    runtimes: Language[],
): Language | null {
    const candidates = [
        ...getExtensionCandidates(file.name),
        ...getMimeCandidates(file.mimeType),
        ...getContentCandidates(file.content),
    ]
    return findMatchingLanguage(runtimes, candidates) || getPreferredRuntime(runtimes)
}

function isHtmlPreviewFile(file: RunnableFile): boolean {
    const extension = getExtensionCandidates(file.name)[0]
    if (extension === "html" || extension === "htm" || extension === "xhtml") {
        return true
    }

    const mimeCandidates = getMimeCandidates(file.mimeType)
    if (mimeCandidates.includes("html")) {
        return true
    }

    const contentCandidates = getContentCandidates(file.content)
    return contentCandidates.includes("html")
}

export const useRunCode = () => {
    const context = useContext(RunCodeContext)
    if (context === null) {
        throw new Error(
            "useRunCode must be used within a RunCodeContextProvider",
        )
    }
    return context
}

const RunCodeContextProvider = ({ children }: { children: ReactNode }) => {
    const { activeFile } = useFileSystem()
    const [input, setInput] = useState<string>("")
    const [output, setOutput] = useState<string>("")
    const [outputMode, setOutputMode] = useState<"text" | "html">("text")
    const [isRunning, setIsRunning] = useState<boolean>(false)
    const [hasRunError, setHasRunError] = useState<boolean>(false)
    const [diagnostics, setDiagnostics] = useState<RunDiagnostic[]>([])
    const [diagnosticFileId, setDiagnosticFileId] = useState<string | null>(null)
    const [supportedLanguages, setSupportedLanguages] = useState<Language[]>([])
    const [selectedLanguage, setSelectedLanguage] = useState<Language>(EMPTY_LANGUAGE)

    useEffect(() => {
        const fetchSupportedLanguages = async () => {
            try {
                const languages = await axiosInstance.get("/runtimes")
                setSupportedLanguages(languages.data)
            } catch (error: any) {
                toast.error("Failed to fetch supported languages")
                if (error?.response?.data) console.error(error?.response?.data)
            }
        }

        fetchSupportedLanguages()
    }, [])

    // Infer selected language from extension, MIME type, and content.
    useEffect(() => {
        if (supportedLanguages.length === 0 || !activeFile?.name) {
            setSelectedLanguage(EMPTY_LANGUAGE)
            return
        }

        const inferredRuntime = inferRuntimeFromFile(
            {
                name: activeFile.name,
                mimeType: activeFile.mimeType,
                content: activeFile.content,
            },
            supportedLanguages,
        )

        if (inferredRuntime) {
            setSelectedLanguage(inferredRuntime)
            return
        }

        setSelectedLanguage(EMPTY_LANGUAGE)
    }, [activeFile?.content, activeFile?.mimeType, activeFile?.name, supportedLanguages])

    const runCode = async () => {
        if (!activeFile) {
            return toast.error("Please open a file to run the code")
        }

        if (
            isHtmlPreviewFile({
                name: activeFile.name,
                mimeType: activeFile.mimeType,
                content: activeFile.content,
            })
        ) {
            const htmlPreview = activeFile.content?.trim()
                ? activeFile.content
                : "<!doctype html><html><body style='margin:0;padding:1rem;font-family:Arial,sans-serif;background:#fff;color:#111;'>No HTML content to preview.</body></html>"
            setOutput(htmlPreview)
            setOutputMode("html")
            setHasRunError(false)
            return
        }

        try {
            if (supportedLanguages.length === 0) {
                return toast.error("No runtimes available. Check run server configuration.")
            }

            const resolvedLanguage =
                selectedLanguage?.language
                    ? selectedLanguage
                    : inferRuntimeFromFile(
                          {
                              name: activeFile.name,
                              mimeType: activeFile.mimeType,
                              content: activeFile.content,
                          },
                          supportedLanguages,
                      )

            if (!resolvedLanguage?.language) {
                return toast.error("Please select a language to run the code")
            }

            setSelectedLanguage(resolvedLanguage)
            toast.loading("Running code...")

            setIsRunning(true)
            setHasRunError(false)
            setDiagnostics([])
            setDiagnosticFileId(activeFile.id)
            setOutputMode("text")
            const { language, version } = resolvedLanguage

            const response = await axiosInstance.post("/execute", {
                language,
                version,
                files: [{ name: activeFile.name, content: activeFile.content || "" }],
                stdin: input,
            })
            if (response.data.run.stderr) {
                const stderrOutput = String(response.data.run.stderr)
                setOutput(stderrOutput)
                setHasRunError(true)
                setDiagnostics(parseRuntimeDiagnostics(stderrOutput, activeFile.name))
            } else {
                setOutput(response.data.run.stdout)
                setHasRunError(false)
                setDiagnostics([])
            }
            setOutputMode("text")
            setIsRunning(false)
            toast.dismiss()
        } catch (error: any) {
            if (error?.response?.data) {
                console.error(error.response.data)
                console.error(error.response.data.error)
            }
            const errorMessage =
                error?.response?.data?.error ||
                error?.message ||
                "Failed to run the code"
            setOutput(errorMessage)
            setOutputMode("text")
            setHasRunError(true)
            setDiagnostics([])
            setDiagnosticFileId(activeFile.id)
            setIsRunning(false)
            toast.dismiss()
            toast.error("Failed to run the code")
        }
    }

    return (
        <RunCodeContext.Provider
            value={{
                setInput,
                output,
                outputMode,
                isRunning,
                hasRunError,
                diagnostics,
                diagnosticFileId,
                supportedLanguages,
                selectedLanguage,
                setSelectedLanguage,
                runCode,
            }}
        >
            {children}
        </RunCodeContext.Provider>
    )
}

export { RunCodeContextProvider }
export default RunCodeContext
