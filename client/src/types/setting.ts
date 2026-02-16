type UIMode = "dark" | "light"

interface Settings {
    theme: string
    language: string
    fontSize: number
    fontFamily: string
    showGitHubCorner: boolean
    uiMode: UIMode
}

interface SettingsContext extends Settings {
    setTheme: (theme: string) => void
    setLanguage: (language: string) => void
    setFontSize: (fontSize: number) => void
    setFontFamily: (fontFamily: string) => void
    setShowGitHubCorner: (showGitHubCorner: boolean) => void
    setUiMode: (uiMode: UIMode) => void
    resetSettings: () => void
}

export { Settings, SettingsContext, UIMode }
