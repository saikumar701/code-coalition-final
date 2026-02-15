import {
    AccountImportPayload,
    fetchDriveFileContent,
    fetchDriveFiles,
    fetchGithubDirectoryEntries,
    fetchGithubFileContent,
    fetchGithubRepos,
    getOAuthAuthorizeUrl,
    GoogleDriveEntry,
    GithubEntry,
    GithubRepo,
    importExternalFile,
    OAuthProvider,
} from "@/api/externalImportApi"
import { useFileSystem } from "@/context/FileContext"
import useResponsive from "@/hooks/useResponsive"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { SiGithub, SiGoogledrive } from "react-icons/si"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

interface OAuthPopupMessage {
    type: "oauth-success" | "oauth-error"
    provider: OAuthProvider
    accessToken?: string
    error?: string
}

const ExternalImportView = () => {
    const { viewHeight } = useResponsive()
    const { fileStructure, importFile } = useFileSystem()
    const [activeMode, setActiveMode] = useState<"link" | "account">("link")
    const [externalUrl, setExternalUrl] = useState("")
    const [isImporting, setIsImporting] = useState(false)
    const [lastImportedName, setLastImportedName] = useState<string | null>(null)
    const [oauthTokens, setOauthTokens] = useState<Partial<Record<OAuthProvider, string>>>({})
    const [activeAccountProvider, setActiveAccountProvider] = useState<OAuthProvider>("gdrive")

    const [driveFiles, setDriveFiles] = useState<GoogleDriveEntry[]>([])
    const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false)

    const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
    const [selectedGithubRepo, setSelectedGithubRepo] = useState<GithubRepo | null>(null)
    const [githubPath, setGithubPath] = useState("")
    const [githubEntries, setGithubEntries] = useState<GithubEntry[]>([])
    const [isLoadingGithubRepos, setIsLoadingGithubRepos] = useState(false)
    const [isLoadingGithubEntries, setIsLoadingGithubEntries] = useState(false)

    const backendOrigin = useMemo(() => {
        try {
            return new URL(BACKEND_URL).origin
        } catch {
            return window.location.origin
        }
    }, [])

    const handleImportedPayload = (payload: AccountImportPayload) => {
        importFile(fileStructure.id, payload.fileName, payload.content, true, {
            contentEncoding: payload.contentEncoding,
            mimeType: payload.mimeType,
        })
        setLastImportedName(payload.fileName)
        toast.success(`${payload.fileName} imported to Explorer`)
    }

    const handleLinkImport = async () => {
        const trimmedUrl = externalUrl.trim()
        if (!trimmedUrl) {
            toast.error("Paste a Google Drive or GitHub file URL")
            return
        }

        try {
            setIsImporting(true)
            const importedResource = await importExternalFile(trimmedUrl)
            const payload: AccountImportPayload = importedResource.isLikelyText
                ? {
                      fileName: importedResource.fileName,
                      mimeType: importedResource.mimeType,
                      content: importedResource.textContent,
                      contentEncoding: "utf8",
                      size: importedResource.size,
                  }
                : {
                      fileName: importedResource.fileName,
                      mimeType: importedResource.mimeType,
                      content: importedResource.base64Content || "",
                      contentEncoding: "base64",
                      size: importedResource.size,
                  }

            handleImportedPayload(payload)
            setExternalUrl("")
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to import external file."
            toast.error(message)
        } finally {
            setIsImporting(false)
        }
    }

    const startProviderLogin = async (provider: OAuthProvider) => {
        try {
            const authorizeUrl = await getOAuthAuthorizeUrl(provider)
            const popup = window.open(
                authorizeUrl,
                `${provider}-oauth`,
                "width=620,height=760,menubar=no,toolbar=no,status=no",
            )
            if (!popup) {
                toast.error("Popup blocked. Allow popups to continue login.")
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to start OAuth login."
            toast.error(message)
        }
    }

    const fetchDriveFileList = async (token: string) => {
        try {
            setIsLoadingDriveFiles(true)
            const files = await fetchDriveFiles(token)
            setDriveFiles(files)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to load Google Drive files."
            toast.error(message)
        } finally {
            setIsLoadingDriveFiles(false)
        }
    }

    const fetchGithubRepoList = async (token: string) => {
        try {
            setIsLoadingGithubRepos(true)
            const repos = await fetchGithubRepos(token)
            setGithubRepos(repos)
            if (!selectedGithubRepo && repos.length > 0) {
                setSelectedGithubRepo(repos[0])
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to load GitHub repositories."
            toast.error(message)
        } finally {
            setIsLoadingGithubRepos(false)
        }
    }

    const fetchGithubFolderEntries = async ({
        token,
        repo,
        path = "",
    }: {
        token: string
        repo: GithubRepo
        path?: string
    }) => {
        try {
            setIsLoadingGithubEntries(true)
            const entries = await fetchGithubDirectoryEntries({
                accessToken: token,
                owner: repo.owner.login,
                repo: repo.name,
                path,
                branch: repo.default_branch,
            })
            const sortedEntries = [...entries].sort((left, right) => {
                if (left.type !== right.type) {
                    return left.type === "dir" ? -1 : 1
                }
                return left.name.localeCompare(right.name)
            })
            setGithubEntries(sortedEntries)
            setGithubPath(path)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to load repository entries."
            toast.error(message)
        } finally {
            setIsLoadingGithubEntries(false)
        }
    }

    useEffect(() => {
        const handleOAuthMessage = (event: MessageEvent<OAuthPopupMessage>) => {
            if (event.origin !== backendOrigin) return
            const payload = event.data
            if (!payload || !payload.provider || !payload.type) return

            if (payload.type === "oauth-error") {
                toast.error(payload.error || "OAuth login failed.")
                return
            }

            if (!payload.accessToken) {
                toast.error("OAuth login returned no access token.")
                return
            }

            setOauthTokens((prevTokens) => ({
                ...prevTokens,
                [payload.provider]: payload.accessToken,
            }))
            setActiveAccountProvider(payload.provider)
            toast.success(
                payload.provider === "github"
                    ? "Logged in to GitHub"
                    : "Logged in to Google Drive",
            )
        }

        window.addEventListener("message", handleOAuthMessage)
        return () => {
            window.removeEventListener("message", handleOAuthMessage)
        }
    }, [backendOrigin])

    useEffect(() => {
        const driveToken = oauthTokens.gdrive
        if (!driveToken) return
        void fetchDriveFileList(driveToken)
    }, [oauthTokens.gdrive])

    useEffect(() => {
        const githubToken = oauthTokens.github
        if (!githubToken) return
        void fetchGithubRepoList(githubToken)
    }, [oauthTokens.github])

    useEffect(() => {
        if (!oauthTokens.github || !selectedGithubRepo) return
        void fetchGithubFolderEntries({
            token: oauthTokens.github,
            repo: selectedGithubRepo,
            path: "",
        })
    }, [oauthTokens.github, selectedGithubRepo])

    const handleImportDriveFile = async (file: GoogleDriveEntry) => {
        const token = oauthTokens.gdrive
        if (!token) {
            toast.error("Login to Google Drive first.")
            return
        }

        try {
            setIsImporting(true)
            const payload = await fetchDriveFileContent({
                accessToken: token,
                fileId: file.id,
                fileName: file.name,
                mimeType: file.mimeType,
            })
            handleImportedPayload(payload)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to import Drive file."
            toast.error(message)
        } finally {
            setIsImporting(false)
        }
    }

    const handleImportGithubFile = async (entry: GithubEntry) => {
        const token = oauthTokens.github
        if (!token || !selectedGithubRepo) {
            toast.error("Login to GitHub and select a repository first.")
            return
        }

        try {
            setIsImporting(true)
            const payload = await fetchGithubFileContent({
                accessToken: token,
                owner: selectedGithubRepo.owner.login,
                repo: selectedGithubRepo.name,
                path: entry.path,
                branch: selectedGithubRepo.default_branch,
            })
            handleImportedPayload(payload)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Failed to import GitHub file."
            toast.error(message)
        } finally {
            setIsImporting(false)
        }
    }

    const handleGithubEntryClick = (entry: GithubEntry) => {
        if (entry.type === "dir") {
            if (!oauthTokens.github || !selectedGithubRepo) return
            void fetchGithubFolderEntries({
                token: oauthTokens.github,
                repo: selectedGithubRepo,
                path: entry.path,
            })
            return
        }
        void handleImportGithubFile(entry)
    }

    const navigateGithubBack = () => {
        if (!oauthTokens.github || !selectedGithubRepo) return
        const pathParts = githubPath.split("/").filter(Boolean)
        pathParts.pop()
        void fetchGithubFolderEntries({
            token: oauthTokens.github,
            repo: selectedGithubRepo,
            path: pathParts.join("/"),
        })
    }

    const isDriveLoggedIn = Boolean(oauthTokens.gdrive)
    const isGithubLoggedIn = Boolean(oauthTokens.github)

    return (
        <div
            className="flex max-h-full min-h-[400px] w-full flex-col gap-3 p-4 text-white"
            style={{ height: viewHeight }}
        >
            <h1 className="view-title">External Import</h1>

            <div className="flex rounded-md border border-gray-700 bg-gray-900/50 p-1">
                <button
                    type="button"
                    className={`flex-1 rounded px-3 py-2 text-sm ${
                        activeMode === "link" ? "bg-white text-black" : "text-gray-300"
                    }`}
                    onClick={() => setActiveMode("link")}
                >
                    Import via link
                </button>
                <button
                    type="button"
                    className={`flex-1 rounded px-3 py-2 text-sm ${
                        activeMode === "account" ? "bg-white text-black" : "text-gray-300"
                    }`}
                    onClick={() => setActiveMode("account")}
                >
                    Import from account
                </button>
            </div>

            {activeMode === "link" && (
                <div className="rounded-md border border-gray-700 bg-gray-900/50 p-3">
                    <label className="mb-2 block text-xs text-gray-400">
                        Keep using direct links from GitHub or Google Drive
                    </label>
                    <textarea
                        value={externalUrl}
                        onChange={(event) => setExternalUrl(event.target.value)}
                        className="h-24 w-full resize-none rounded-md border border-gray-700 bg-gray-800 p-2 text-sm outline-none focus:border-gray-500"
                        placeholder="Paste external file URL..."
                    />
                    <button
                        type="button"
                        className="mt-3 w-full rounded-md bg-white p-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={handleLinkImport}
                        disabled={isImporting}
                    >
                        {isImporting ? "Importing..." : "Import to Explorer"}
                    </button>
                </div>
            )}

            {activeMode === "account" && (
                <div className="min-h-0 flex-1 overflow-auto rounded-md border border-gray-700 bg-gray-900/50 p-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            className={`flex items-center justify-center gap-2 rounded-md border p-2 text-sm ${
                                activeAccountProvider === "gdrive"
                                    ? "border-white bg-white text-black"
                                    : "border-gray-600 text-gray-300"
                            }`}
                            onClick={() => setActiveAccountProvider("gdrive")}
                        >
                            <SiGoogledrive />
                            Google Drive
                        </button>
                        <button
                            type="button"
                            className={`flex items-center justify-center gap-2 rounded-md border p-2 text-sm ${
                                activeAccountProvider === "github"
                                    ? "border-white bg-white text-black"
                                    : "border-gray-600 text-gray-300"
                            }`}
                            onClick={() => setActiveAccountProvider("github")}
                        >
                            <SiGithub />
                            GitHub
                        </button>
                    </div>

                    {activeAccountProvider === "gdrive" && (
                        <div className="mt-3">
                            {!isDriveLoggedIn ? (
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-center gap-2 rounded-md bg-white p-2 text-sm font-medium text-black"
                                    onClick={() => startProviderLogin("gdrive")}
                                >
                                    <SiGoogledrive />
                                    Login to Google Drive
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <button
                                        type="button"
                                        className="w-full rounded-md border border-gray-600 p-2 text-sm"
                                        onClick={() => {
                                            const token = oauthTokens.gdrive
                                            if (token) {
                                                void fetchDriveFileList(token)
                                            }
                                        }}
                                        disabled={isLoadingDriveFiles}
                                    >
                                        {isLoadingDriveFiles ? "Refreshing..." : "Refresh files"}
                                    </button>
                                    <div className="max-h-80 overflow-auto rounded-md border border-gray-700">
                                        {driveFiles.length === 0 ? (
                                            <p className="p-3 text-sm text-gray-400">
                                                No files found in Google Drive.
                                            </p>
                                        ) : (
                                            driveFiles.map((file) => (
                                                <div
                                                    key={file.id}
                                                    className="flex items-center justify-between border-b border-gray-800 p-2 text-sm last:border-b-0"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate">{file.name}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {file.mimeType}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="rounded border border-gray-600 px-2 py-1 text-xs"
                                                        onClick={() => {
                                                            void handleImportDriveFile(file)
                                                        }}
                                                        disabled={isImporting}
                                                    >
                                                        Import
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeAccountProvider === "github" && (
                        <div className="mt-3 space-y-2">
                            {!isGithubLoggedIn ? (
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-center gap-2 rounded-md bg-white p-2 text-sm font-medium text-black"
                                    onClick={() => startProviderLogin("github")}
                                >
                                    <SiGithub />
                                    Login to GitHub
                                </button>
                            ) : (
                                <>
                                    <select
                                        value={selectedGithubRepo?.full_name || ""}
                                        onChange={(event) => {
                                            const nextRepo = githubRepos.find(
                                                (repo) => repo.full_name === event.target.value,
                                            )
                                            if (nextRepo) {
                                                setSelectedGithubRepo(nextRepo)
                                            }
                                        }}
                                        className="w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-sm"
                                        disabled={isLoadingGithubRepos || githubRepos.length === 0}
                                    >
                                        {githubRepos.map((repo) => (
                                            <option key={repo.id} value={repo.full_name}>
                                                {repo.full_name}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                        <button
                                            type="button"
                                            className="rounded border border-gray-600 px-2 py-1"
                                            onClick={navigateGithubBack}
                                            disabled={!githubPath}
                                        >
                                            Back
                                        </button>
                                        <span className="truncate">
                                            /{githubPath || ""}
                                        </span>
                                    </div>

                                    <div className="max-h-80 overflow-auto rounded-md border border-gray-700">
                                        {isLoadingGithubEntries ? (
                                            <p className="p-3 text-sm text-gray-400">
                                                Loading repository files...
                                            </p>
                                        ) : githubEntries.length === 0 ? (
                                            <p className="p-3 text-sm text-gray-400">
                                                No entries found in this folder.
                                            </p>
                                        ) : (
                                            githubEntries.map((entry) => (
                                                <button
                                                    type="button"
                                                    key={entry.path}
                                                    className="flex w-full items-center justify-between border-b border-gray-800 p-2 text-left text-sm hover:bg-gray-800/60 last:border-b-0"
                                                    onClick={() => handleGithubEntryClick(entry)}
                                                    disabled={isImporting}
                                                >
                                                    <span className="truncate">
                                                        {entry.type === "dir" ? "[DIR]" : "[FILE]"}{" "}
                                                        {entry.name}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {entry.type === "dir"
                                                            ? "Open"
                                                            : "Import"}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="rounded-md border border-gray-700 bg-gray-900/40 p-3 text-xs text-gray-400">
                Imported files are added to the Explorer root and synchronized to all users in the room.
                {lastImportedName && <div className="mt-1">Last imported: {lastImportedName}</div>}
            </div>
        </div>
    )
}

export default ExternalImportView
