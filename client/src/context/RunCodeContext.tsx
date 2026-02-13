import axiosInstance from "@/api/pistonApi"
import { Language, RunContext as RunContextType } from "@/types/run"
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
    const [supportedLanguages, setSupportedLanguages] = useState<Language[]>([])
    const [selectedLanguage, setSelectedLanguage] = useState<Language>({
        language: "",
        version: "",
        aliases: [],
    })

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

    // Set the selected language based on the file extension
    useEffect(() => {
        if (supportedLanguages.length === 0 || !activeFile?.name) return

        const extension = activeFile.name.split(".").pop()
        if (extension) {
            const languageName = langMap.languages(extension)
            const language = supportedLanguages.find(
                (lang) =>
                    lang.aliases.includes(extension) ||
                    languageName.includes(lang.language.toLowerCase()),
            )
            if (language) setSelectedLanguage(language)
        } else setSelectedLanguage({ language: "", version: "", aliases: [] })
    }, [activeFile?.name, supportedLanguages])

    const runCode = async () => {
        if (!activeFile) {
            return toast.error("Please open a file to run the code")
        }

        const extension = activeFile.name.split(".").pop()
        if (extension === "html") {
            const htmlPreview = activeFile.content?.trim()
                ? activeFile.content
                : "<!doctype html><html><body style='margin:0;padding:1rem;font-family:Arial,sans-serif;background:#fff;color:#111;'>No HTML content to preview.</body></html>"
            setOutput(htmlPreview)
            setOutputMode("html")
            setHasRunError(false)
            return
        }

        try {
            if (!selectedLanguage?.language) {
                return toast.error("Please select a language to run the code")
            } else {
                toast.loading("Running code...")
            }

            setIsRunning(true)
            setHasRunError(false)
            setOutputMode("text")
            const { language, version } = selectedLanguage

            const response = await axiosInstance.post("/execute", {
                language,
                version,
                files: [{ name: activeFile.name, content: activeFile.content }],
                stdin: input,
            })
            if (response.data.run.stderr) {
                setOutput(response.data.run.stderr)
                setHasRunError(true)
            } else {
                setOutput(response.data.run.stdout)
                setHasRunError(false)
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
