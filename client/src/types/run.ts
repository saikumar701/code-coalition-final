interface Language {
    language: string
    version: string
    aliases: string[]
}

interface RunDiagnostic {
    line: number
    column?: number
    message: string
}

interface RunContext {
    setInput: (input: string) => void
    output: string
    outputMode: "text" | "html"
    isRunning: boolean
    hasRunError: boolean
    diagnostics: RunDiagnostic[]
    diagnosticFileId: string | null
    supportedLanguages: Language[]
    selectedLanguage: Language
    setSelectedLanguage: (language: Language) => void
    runCode: () => void
}

export { Language, RunContext, RunDiagnostic }
