import { useAppContext } from "@/context/AppContext"
import { useFileSystem } from "@/context/FileContext"
import { useSettings } from "@/context/SettingContext"
import { useSocket } from "@/context/SocketContext"
import usePageEvents from "@/hooks/usePageEvents"
import useResponsive from "@/hooks/useResponsive"
import { editorThemes } from "@/resources/Themes"
import { FileSystemItem } from "@/types/file"
import { SocketEvent } from "@/types/socket"
import { color } from "@uiw/codemirror-extensions-color"
import { hyperLink } from "@uiw/codemirror-extensions-hyper-link"
import { LanguageName, loadLanguage } from "@uiw/codemirror-extensions-langs"
import CodeMirror, {
    Extension,
    scrollPastEnd,
} from "@uiw/react-codemirror"
import { EditorView as CM6EditorView } from "@codemirror/view"
import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import toast from "react-hot-toast"
import { collaborativeHighlighting, updateRemoteUsers } from "@/extensions/collaborativeHighlighting"

const textMimePattern =
    /^(text\/|application\/(json|javascript|typescript|xml|x-www-form-urlencoded)|image\/svg\+xml)/i

function Editor() {
    const { users, currentUser } = useAppContext()
    const { activeFile, setActiveFile } = useFileSystem()
    const { theme, language, fontSize } = useSettings()
    const { socket } = useSocket()
    const { viewHeight } = useResponsive()
    const [timeOut, setTimeOut] = useState(setTimeout(() => {}, 0))
    const filteredUsers = useMemo(
        () => users.filter((u) => u.currentFile === activeFile?.id && u.username !== currentUser.username),
        [users, currentUser, activeFile?.id],
    )
    const [extensions, setExtensions] = useState<Extension[]>([])
    const editorRef = useRef<any>(null)
    const editorViewRef = useRef<CM6EditorView | null>(null)
    const lastCursorPositionRef = useRef<number>(0)
    const lastSelectionRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 })
    const cursorMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const onCodeChange = (code: string) => {
        if (!activeFile) return

        const file: FileSystemItem = { ...activeFile, content: code, contentEncoding: "utf8" }
        setActiveFile(file)

        // Get cursor position and selection range
        const view = editorViewRef.current
        if (view) {
            const selection = view.state.selection.main
            const cursorPosition = selection.head
            const selectionStart = selection.from
            const selectionEnd = selection.to

            console.log('⌨️ TYPING_START emitted:', {
                fileId: activeFile.id,
                cursorPosition,
            })
            // Emit cursor and selection data
            socket.emit(SocketEvent.TYPING_START, {
                fileId: activeFile.id,
                cursorPosition,
                selectionStart,
                selectionEnd
            })
        }

        socket.emit(SocketEvent.FILE_UPDATED, {
            fileId: activeFile.id,
            newContent: code,
        })
        clearTimeout(timeOut)

        // Debounce typing pause
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }

        typingTimeoutRef.current = setTimeout(() => {
            console.log('⏸️ TYPING_PAUSE emitted')
            socket.emit(SocketEvent.TYPING_PAUSE, {
                fileId: activeFile.id,
            })
        }, 1000)

        const newTimeOut = setTimeout(
            () => socket.emit(SocketEvent.FILE_UPDATED, {
                fileId: activeFile.id,
                newContent: code,
            }),
            1000,
        )
        setTimeOut(newTimeOut)
    }

    // Handle cursor/selection changes without typing (debounced)
    const handleSelectionChange = useCallback((update: any) => {
        if (!update.selectionSet) return // Only handle selection changes
        if (!update.view) return

        const view = update.view
        const selection = view.state.selection.main
        const cursorPosition = selection.head
        const selectionStart = selection.from
        const selectionEnd = selection.to

        // Check if cursor or selection actually changed
        const cursorChanged = cursorPosition !== lastCursorPositionRef.current
        const selectionChanged = 
            selectionStart !== lastSelectionRef.current.from || 
            selectionEnd !== lastSelectionRef.current.to

        if (!cursorChanged && !selectionChanged) return

        lastCursorPositionRef.current = cursorPosition
        lastSelectionRef.current = { from: selectionStart, to: selectionEnd }

        // Clear existing timeout
        if (cursorMoveTimeoutRef.current) {
            clearTimeout(cursorMoveTimeoutRef.current)
        }

        // Debounce cursor move events
        cursorMoveTimeoutRef.current = setTimeout(() => {
            if (!activeFile) return
            
            console.log('➡️ CURSOR_MOVE emitted:', {
                fileId: activeFile.id,
                cursorPosition,
            })
            
            socket.emit(SocketEvent.CURSOR_MOVE, {
                fileId: activeFile.id,
                cursorPosition,
                selectionStart,
                selectionEnd
            })
        }, 100) // 100ms debounce
    }, [socket, activeFile])

    // Listen wheel event to zoom in/out and prevent page reload
    usePageEvents()

    // Emit FILE_OPENED when user switches files
    useEffect(() => {
        if (activeFile && socket) {
            console.log('📂 FILE_OPENED emitted:', activeFile.id)
            socket.emit(SocketEvent.FILE_OPENED, {
                fileId: activeFile.id,
            })
        }
    }, [activeFile?.id, socket])

    useEffect(() => {
        const extensions = [
            color,
            hyperLink,
            collaborativeHighlighting(),
            CM6EditorView.updateListener.of(handleSelectionChange),
            scrollPastEnd(),
        ]
        const langExt = loadLanguage(language.toLowerCase() as LanguageName)
        if (langExt) {
            extensions.push(langExt)
        } else {
            toast.error(
                "Syntax highlighting is unavailable for this language. Please adjust the editor settings; it may be listed under a different name.",
                {
                    duration: 5000,
                },
            )
        }

        setExtensions(extensions)
    }, [filteredUsers, language, handleSelectionChange])

    // Update remote users when filteredUsers changes and once the view is ready
    useEffect(() => {
        const view = editorRef.current?.view
        if (view) {
            console.log('🔄 Updating remote users:', filteredUsers.length)
            view.dispatch({
                effects: updateRemoteUsers.of(filteredUsers)
            })
        }
    }, [filteredUsers])

    const mimeType = activeFile?.mimeType || ""
    const isBinaryFile = Boolean(
        activeFile?.type === "file" &&
            (activeFile?.contentEncoding === "base64" ||
                (mimeType && !textMimePattern.test(mimeType))),
    )
    const binaryDataUrl = useMemo(() => {
        if (!activeFile || !isBinaryFile) return ""
        const normalizedMimeType = activeFile.mimeType || "application/octet-stream"
        return `data:${normalizedMimeType};base64,${activeFile.content || ""}`
    }, [activeFile, isBinaryFile])

    const openBinaryFile = () => {
        if (!binaryDataUrl) return
        window.open(binaryDataUrl, "_blank", "noopener,noreferrer")
    }

    const downloadBinaryFile = () => {
        if (!binaryDataUrl || !activeFile) return
        const anchor = document.createElement("a")
        anchor.href = binaryDataUrl
        anchor.download = activeFile.name
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
    }

    if (activeFile && isBinaryFile) {
        const isPdf = mimeType === "application/pdf"
        const isImage = mimeType.startsWith("image/")

        return (
            <div
                className="flex h-full w-full flex-col gap-3 overflow-auto bg-[#1E1E1E] p-3 text-gray-200"
                style={{ height: viewHeight }}
            >
                <div className="rounded-md border border-gray-700 bg-gray-800/50 p-3">
                    <p className="text-sm font-medium">Binary file preview</p>
                    <p className="mt-1 text-xs text-gray-400">
                        {activeFile.name} ({mimeType || "application/octet-stream"})
                    </p>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black"
                            onClick={openBinaryFile}
                        >
                            Open in new tab
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-gray-600 px-3 py-2 text-sm"
                            onClick={downloadBinaryFile}
                        >
                            Download
                        </button>
                    </div>
                </div>

                {(isPdf || isImage) && binaryDataUrl && (
                    <div className="min-h-0 flex-1 rounded-md border border-gray-700 bg-black/40 p-2">
                        {isPdf ? (
                            <iframe
                                title={activeFile.name}
                                src={binaryDataUrl}
                                className="h-full min-h-[420px] w-full rounded border-0"
                            />
                        ) : (
                            <img
                                src={binaryDataUrl}
                                alt={activeFile.name}
                                className="h-full max-h-[70vh] w-full object-contain"
                            />
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <CodeMirror
            ref={editorRef}
            theme={editorThemes[theme]}
            onChange={onCodeChange}
            value={activeFile?.content}
            extensions={extensions}
            minHeight="100%"
            maxWidth="100vw"
            style={{
                fontSize: fontSize + "px",
                height: viewHeight,
                position: "relative",
            }}
        />
    )
}

export default Editor
