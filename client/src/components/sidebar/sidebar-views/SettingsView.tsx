import Select from "@/components/common/Select"
import { useSettings } from "@/context/SettingContext"
import useResponsive from "@/hooks/useResponsive"
import { editorFonts } from "@/resources/Fonts"
import { editorThemes } from "@/resources/Themes"
import { UIMode } from "@/types/setting"
import { langNames } from "@uiw/codemirror-extensions-langs"
import { ChangeEvent, useEffect } from "react"

function SettingsView() {
    const {
        theme,
        setTheme,
        language,
        setLanguage,
        fontSize,
        setFontSize,
        fontFamily,
        setFontFamily,
        showGitHubCorner,
        setShowGitHubCorner,
        uiMode,
        setUiMode,
        resetSettings,
    } = useSettings()
    const { viewHeight } = useResponsive()

    const handleFontFamilyChange = (e: ChangeEvent<HTMLSelectElement>) =>
        setFontFamily(e.target.value)
    const handleThemeChange = (e: ChangeEvent<HTMLSelectElement>) =>
        setTheme(e.target.value)
    const handleLanguageChange = (e: ChangeEvent<HTMLSelectElement>) =>
        setLanguage(e.target.value)
    const handleFontSizeChange = (e: ChangeEvent<HTMLSelectElement>) =>
        setFontSize(parseInt(e.target.value))
    const handleShowGitHubCornerChange = (e: ChangeEvent<HTMLInputElement>) =>
        setShowGitHubCorner(e.target.checked)
    const handleUIModeChange = (mode: UIMode) => setUiMode(mode)

    useEffect(() => {
        // Set editor font family
        const editor = document.querySelector(
            ".cm-editor > .cm-scroller",
        ) as HTMLElement
        if (editor !== null) {
            editor.style.fontFamily = `${fontFamily}, monospace`
        }
    }, [fontFamily])

    return (
        <div
            className="sidebar-modern-view flex flex-col items-center gap-3 p-4"
            style={{ height: viewHeight }}
        >
            <div className="sidebar-modern-header w-full">
                <h1 className="view-title m-0 border-none pb-0">Settings</h1>
            </div>
            {/* Choose Font Family option */}
            <div className="sidebar-modern-card flex w-full items-end gap-2">
                <Select
                    onChange={handleFontFamilyChange}
                    value={fontFamily}
                    options={editorFonts}
                    title="Font Family"
                />
                {/* Choose font size option */}
                <select
                    value={fontSize}
                    onChange={handleFontSizeChange}
                    className="sidebar-modern-control px-4 py-2 text-sm"
                    title="Font Size"
                >
                    {[...Array(13).keys()].map((size) => {
                        return (
                            <option key={size} value={size + 12}>
                                {size + 12}
                            </option>
                        )
                    })}
                </select>
            </div>
            {/* Choose theme option */}
            <div className="sidebar-modern-card w-full">
                <Select
                    onChange={handleThemeChange}
                    value={theme}
                    options={Object.keys(editorThemes)}
                    title="Theme"
                />
            </div>
            {/* Choose language option */}
            <div className="sidebar-modern-card w-full">
                <Select
                    onChange={handleLanguageChange}
                    value={language}
                    options={langNames}
                    title="Language"
                />
            </div>
            <div className="sidebar-modern-card w-full">
                <label className="ui-muted-text mb-2 block text-xs font-medium uppercase tracking-wide">
                    App UI Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className={`sidebar-modern-btn ${
                            uiMode === "dark" ? "sidebar-modern-btn--primary" : ""
                        }`}
                        onClick={() => handleUIModeChange("dark")}
                    >
                        Dark
                    </button>
                    <button
                        type="button"
                        className={`sidebar-modern-btn ${
                            uiMode === "light" ? "sidebar-modern-btn--primary" : ""
                        }`}
                        onClick={() => handleUIModeChange("light")}
                    >
                        Light
                    </button>
                </div>
            </div>
            {/* Show GitHub corner option */}
            <div className="sidebar-modern-card mt-1 flex w-full items-center justify-between">
                <label className="ui-muted-text text-sm">Show github corner</label>
                <label className="relative inline-flex cursor-pointer items-center">
                    <input
                        className="peer sr-only"
                        type="checkbox"
                        onChange={handleShowGitHubCornerChange}
                        checked={showGitHubCorner}
                    />
                    <div className="settings-toggle"></div>
                </label>
            </div>
            <button
                className="sidebar-modern-btn mt-auto w-full"
                onClick={resetSettings}
            >
                Reset to default
            </button>
        </div>
    )
}

export default SettingsView
