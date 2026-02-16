import express, { Response, Request } from "express"
import dotenv from "dotenv"
import http from "http"
import cors from "cors"
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { Server } from "socket.io"
import path from "path"
import * as pty from "node-pty"
import os from "os"
import fs from "fs"
import fsPromises from "fs/promises"
import { randomBytes } from "crypto"
import { spawn } from "child_process"

const loadServerEnv = () => {
	const envPaths = [
		path.resolve(process.cwd(), "server", ".env"),
		path.resolve(__dirname, "..", ".env"),
	]

	envPaths.forEach((envPath) => {
		dotenv.config({ path: envPath, override: true })
	})
}

loadServerEnv()

const app = express()

app.use(express.json())

app.use(cors())

app.use(express.static(path.join(__dirname, "public"))) // Serve static files

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "*",
	},
	maxHttpBufferSize: 1e8,
	pingTimeout: 60000,
})

let userSocketMap: User[] = []
const ptyProcess = new Map<SocketId, pty.IPty>()
const shell = os.platform() === "win32" ? "powershell.exe" : "bash"
const workspaceRoot = path.resolve(process.cwd(), ".workspaces")
const roomFileTrees = new Map<string, WorkspaceFileSystemItem>()
const roomTrackedPaths = new Map<string, Set<string>>()
const roomSyncTimers = new Map<string, NodeJS.Timeout>()
const roomScreenShareMap = new Map<string, ScreenShareInfo>()
const maxFileShareEnvValue = Number(process.env.FILE_SHARE_MAX_SIZE_MB || "20")
const maxFileShareSizeMb =
	Number.isFinite(maxFileShareEnvValue) && maxFileShareEnvValue > 0
		? maxFileShareEnvValue
		: 20
const maxFileShareSizeBytes = maxFileShareSizeMb * 1024 * 1024
const maxFileShareNameLength = 255
const maxExternalImportEnvValue = Number(process.env.EXTERNAL_IMPORT_MAX_SIZE_MB || "15")
const maxExternalImportSizeMb =
	Number.isFinite(maxExternalImportEnvValue) && maxExternalImportEnvValue > 0
		? maxExternalImportEnvValue
		: 15
const maxExternalImportSizeBytes = maxExternalImportSizeMb * 1024 * 1024
const oauthStateStore = new Map<string, OAuthStateRecord>()
const oauthStateTtlMs = 10 * 60 * 1000
const googleDriveScope = "https://www.googleapis.com/auth/drive.readonly"
const githubScope = "repo read:user"
const defaultPistonApiBaseUrl = "http://localhost:2000/api/v2/piston"
const localRunTimeoutMs = 15000
const localFallbackRuntimes: PistonRuntime[] = [
	{
		language: "javascript",
		version: "local",
		aliases: ["js", "node"],
	},
	{
		language: "python",
		version: "local",
		aliases: ["py", "python3"],
	},
]

interface WorkspaceFileSystemItem {
	id: string
	name: string
	type: "file" | "directory"
	children?: WorkspaceFileSystemItem[]
	content?: string
	contentEncoding?: "utf8" | "base64"
	mimeType?: string
}

interface WorkspaceEntry {
	relativePath: string
	type: "file" | "directory"
	content?: string
	contentEncoding?: "utf8" | "base64"
	mimeType?: string
}

interface IncomingSharedFile {
	id?: string
	name?: string
	mimeType?: string
	size?: number
	dataUrl?: string
}

interface SharedFilePayload {
	id: string
	name: string
	mimeType: string
	size: number
	dataUrl: string
	senderUsername: string
	senderSocketId: string
	recipientSocketId: string | null
	roomId: string
	sentAt: string
}

interface ChatMessagePayload {
	id: string
	message: string
	username: string
	timestamp: string
	isDirect: boolean
	recipientSocketId: string | null
	recipientUsername: string | null
}

interface ScreenShareInfo {
	socketId: string
	username: string
}

interface ScreenShareSignalEnvelope {
	type: "offer" | "answer" | "ice-candidate"
	sdp?: {
		type?: string
		sdp?: string
	}
	candidate?: {
		candidate?: string
		sdpMid?: string | null
		sdpMLineIndex?: number | null
		usernameFragment?: string | null
	}
}

type OAuthProvider = "github" | "gdrive"

interface OAuthStateRecord {
	provider: OAuthProvider
	origin: string
	createdAt: number
}

interface PistonRuntime {
	language: string
	version: string
	aliases: string[]
}

interface PistonExecuteFile {
	name?: string
	content?: string
}

interface PistonExecuteBody {
	language?: string
	version?: string
	files?: PistonExecuteFile[]
	stdin?: string
}

interface LocalExecutionResult {
	stdout: string
	stderr: string
	code: number | null
	signal: NodeJS.Signals | null
	spawnErrorCode?: string
}

interface LocalCommandCandidate {
	command: string
	getArgs: (filePath: string) => string[]
}

if (!fs.existsSync(workspaceRoot)) {
	fs.mkdirSync(workspaceRoot, { recursive: true })
}

function sanitizeRoomId(roomId: string): string {
	return roomId.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function getRoomWorkspacePath(roomId: string): string {
	const directoryPath = path.join(workspaceRoot, sanitizeRoomId(roomId))
	if (!fs.existsSync(directoryPath)) {
		fs.mkdirSync(directoryPath, { recursive: true })
	}
	return directoryPath
}

function createPtyForSocket(socketId: SocketId, socket: any, cwd: string): pty.IPty {
	const instance = pty.spawn(shell, [], {
		name: "xterm-color",
		cols: 80,
		rows: 30,
		cwd,
		env: process.env,
	})

	instance.onData((data: string) => {
		socket.emit(SocketEvent.TERMINAL_OUTPUT, {
			data,
		})
	})

	instance.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
		const isUserInterrupt = exitCode === -1073741510 || exitCode === 130
		if (isUserInterrupt) {
			console.log(`PTY process for ${socketId} interrupted by user.`)
		} else {
			console.log(
				`PTY process for ${socketId} exited with code ${exitCode}, signal ${signal}`
			)
		}
		ptyProcess.delete(socketId)
		socket.emit(SocketEvent.TERMINAL_OUTPUT, {
			data: "\r\n[Terminal session ended. Press Enter to restart]\r\n",
		})
	})

	ptyProcess.set(socketId, instance)
	return instance
}

function resetPtyForSocket(socket: any, cwd: string) {
	const existing = ptyProcess.get(socket.id)
	if (existing) {
		existing.kill()
		ptyProcess.delete(socket.id)
	}
	createPtyForSocket(socket.id, socket, cwd)
}

function getTerminalCwdForSocket(socketId: SocketId): string {
	const roomId = getRoomId(socketId)
	if (roomId) {
		return getRoomWorkspacePath(roomId)
	}
	return process.env.INIT_CWD || process.cwd()
}

function ensurePtyForSocket(socket: any): pty.IPty {
	const existingPty = ptyProcess.get(socket.id)
	if (existingPty) {
		return existingPty
	}

	const cwd = getTerminalCwdForSocket(socket.id)
	return createPtyForSocket(socket.id, socket, cwd)
}

function getWorkspaceEntries(children: WorkspaceFileSystemItem[], parentPath = ""): WorkspaceEntry[] {
	const entries: WorkspaceEntry[] = []

	children.forEach((child) => {
		const childPath = parentPath ? `${parentPath}/${child.name}` : child.name

		if (child.type === "directory") {
			entries.push({
				relativePath: childPath,
				type: "directory",
			})
			entries.push(...getWorkspaceEntries(child.children || [], childPath))
			return
		}

		entries.push({
			relativePath: childPath,
			type: "file",
			content: child.content || "",
			contentEncoding: child.contentEncoding || "utf8",
			mimeType: child.mimeType || "text/plain",
		})
	})

	return entries
}

async function synchronizeWorkspaceToDisk(roomId: string): Promise<void> {
	const fileTree = roomFileTrees.get(roomId)
	if (!fileTree || fileTree.type !== "directory") return

	const workspacePath = getRoomWorkspacePath(roomId)
	const nextEntries = getWorkspaceEntries(fileTree.children || [])
	const nextPaths = new Set(nextEntries.map((entry) => entry.relativePath))
	const previousPaths = roomTrackedPaths.get(roomId) || new Set<string>()

	const removedPaths = [...previousPaths]
		.filter((relativePath) => !nextPaths.has(relativePath))
		.sort(
			(a, b) => b.split("/").length - a.split("/").length || b.localeCompare(a),
		)

	for (const relativePath of removedPaths) {
		const absolutePath = path.join(workspacePath, ...relativePath.split("/"))
		await fsPromises.rm(absolutePath, { recursive: true, force: true })
	}

	const directoryEntries = nextEntries
		.filter((entry) => entry.type === "directory")
		.sort((a, b) => a.relativePath.split("/").length - b.relativePath.split("/").length)

	for (const directory of directoryEntries) {
		const absolutePath = path.join(workspacePath, ...directory.relativePath.split("/"))
		await fsPromises.mkdir(absolutePath, { recursive: true })
	}

	const fileEntries = nextEntries.filter((entry) => entry.type === "file")
	for (const fileEntry of fileEntries) {
		const absolutePath = path.join(workspacePath, ...fileEntry.relativePath.split("/"))
		await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true })
		if (fileEntry.contentEncoding === "base64") {
			const fileBuffer = Buffer.from(fileEntry.content || "", "base64")
			await fsPromises.writeFile(absolutePath, Uint8Array.from(fileBuffer))
		} else {
			await fsPromises.writeFile(absolutePath, fileEntry.content || "", "utf8")
		}
	}

	roomTrackedPaths.set(roomId, nextPaths)
}

function scheduleWorkspaceSync(roomId: string) {
	const timer = roomSyncTimers.get(roomId)
	if (timer) {
		clearTimeout(timer)
	}

	const syncTimer = setTimeout(() => {
		void synchronizeWorkspaceToDisk(roomId).catch((error) => {
			console.error(`Failed to sync workspace for room ${roomId}:`, error)
		})
		roomSyncTimers.delete(roomId)
	}, 200)

	roomSyncTimers.set(roomId, syncTimer)
}

// Function to get all users in a room
function getUsersInRoom(roomId: string): User[] {
	return userSocketMap.filter((user) => user.roomId == roomId)
}

// Function to get room id by socket id
function getRoomId(socketId: SocketId): string | null {
	const roomId = userSocketMap.find(
		(user) => user.socketId === socketId
	)?.roomId

	if (!roomId) {
		console.error("Room ID is undefined for socket ID:", socketId)
		return null
	}
	return roomId
}

function getUserBySocketId(socketId: SocketId): User | null {
	const user = userSocketMap.find((user) => user.socketId === socketId)
	if (!user) {
		console.error("User not found for socket ID:", socketId)
		return null
	}
	return user
}

function getBase64DecodedSize(base64Value: string): number {
	const trimmed = base64Value.replace(/\s/g, "")
	const paddingMatch = trimmed.match(/=+$/)
	const paddingLength = paddingMatch ? paddingMatch[0].length : 0
	return Math.max(0, Math.floor((trimmed.length * 3) / 4) - paddingLength)
}

function parseDataUrl(dataUrl: string): { mimeType: string; size: number } | null {
	const dataUrlMatch = dataUrl.match(/^data:([^;]*);base64,([\s\S]+)$/)
	if (!dataUrlMatch) return null

	const mimeType =
		dataUrlMatch[1]?.trim() || "application/octet-stream"
	const encodedBody = dataUrlMatch[2]
	return {
		mimeType,
		size: getBase64DecodedSize(encodedBody),
	}
}

function parseFileNameFromContentDisposition(headerValue: string | null): string | null {
	if (!headerValue) return null

	const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i)
	if (utf8Match?.[1]) {
		try {
			return decodeURIComponent(utf8Match[1].replace(/["']/g, ""))
		} catch {
			return utf8Match[1].replace(/["']/g, "")
		}
	}

	const simpleMatch = headerValue.match(/filename="?([^";]+)"?/i)
	if (simpleMatch?.[1]) {
		return simpleMatch[1]
	}

	return null
}

function sanitizeImportedFileName(fileName: string): string {
	const cleaned = fileName
		.replace(/[/\\?%*:|"<>]/g, "_")
		.trim()
	return cleaned || `imported-file-${Date.now()}`
}

function getFileNameFromPath(pathname: string): string {
	const parts = pathname.split("/").filter(Boolean)
	const lastPart = parts[parts.length - 1] || ""
	if (!lastPart) return ""

	try {
		return decodeURIComponent(lastPart)
	} catch {
		return lastPart
	}
}

function extractDriveFileId(urlValue: string): string | null {
	const directMatch = urlValue.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
	if (directMatch?.[1]) return directMatch[1]

	const openMatch = urlValue.match(/[?&]id=([a-zA-Z0-9_-]+)/)
	if (openMatch?.[1]) return openMatch[1]

	const ucMatch = urlValue.match(/[?&]export=download&id=([a-zA-Z0-9_-]+)/)
	if (ucMatch?.[1]) return ucMatch[1]

	return null
}

function getGithubRawUrl(inputUrl: URL): string | null {
	const host = inputUrl.hostname.toLowerCase()
	if (host === "raw.githubusercontent.com") {
		return inputUrl.toString()
	}

	if (host !== "github.com") {
		return null
	}

	const parts = inputUrl.pathname.split("/").filter(Boolean)
	if (parts.length < 5 || parts[2] !== "blob") {
		return null
	}

	const owner = parts[0]
	const repo = parts[1]
	const branch = parts[3]
	const filePath = parts.slice(4).join("/")
	if (!owner || !repo || !branch || !filePath) {
		return null
	}

	return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
}

function isLikelyTextFile(mimeType: string, buffer: Buffer): boolean {
	if (!mimeType || mimeType === "application/octet-stream") {
		const nullByteIndex = buffer.indexOf(0)
		return nullByteIndex === -1
	}

	if (mimeType.startsWith("text/")) {
		return true
	}

	return /(json|javascript|typescript|xml|yaml|yml|csv|markdown|md|x-sh|sql|svg)/i.test(
		mimeType,
	)
}

function normalizeOrigin(originValue: string | null | undefined): string {
	if (!originValue) return ""

	try {
		const parsedOrigin = new URL(originValue)
		return parsedOrigin.origin
	} catch {
		return ""
	}
}

function getServerPublicBaseUrl(req: Request): string {
	const configuredBaseUrl = normalizeOrigin(process.env.SERVER_PUBLIC_URL)
	if (configuredBaseUrl) return configuredBaseUrl

	const forwardedProto =
		typeof req.headers["x-forwarded-proto"] === "string"
			? req.headers["x-forwarded-proto"]
			: ""
	const protocol = forwardedProto || req.protocol || "http"
	const host = req.get("host")
	return `${protocol}://${host}`
}

function buildOAuthRedirectUri(req: Request, provider: OAuthProvider): string {
	const serverBaseUrl = getServerPublicBaseUrl(req)
	const pathSuffix = provider === "github" ? "github" : "gdrive"
	return `${serverBaseUrl}/api/oauth/${pathSuffix}/callback`
}

function getPistonApiBaseUrl(): string {
	const configuredBaseUrl = (
		process.env.PISTON_API_BASE_URL || defaultPistonApiBaseUrl
	).trim()
	return configuredBaseUrl.replace(/\/+$/, "")
}

function getPistonAuthHeaders(): Record<string, string> {
	const pistonApiToken = (process.env.PISTON_API_TOKEN || "").trim()
	if (!pistonApiToken) {
		return {}
	}
	return {
		Authorization: `Bearer ${pistonApiToken}`,
	}
}

function normalizeLanguageName(value: string): string {
	return value.trim().toLowerCase()
}

function getLocalFileExtension(language: string): string {
	const normalizedLanguage = normalizeLanguageName(language)
	if (["javascript", "js", "node"].includes(normalizedLanguage)) return ".js"
	if (["python", "py", "python3"].includes(normalizedLanguage)) return ".py"
	return ".txt"
}

function getLocalCommandCandidates(language: string): LocalCommandCandidate[] {
	const normalizedLanguage = normalizeLanguageName(language)

	if (["javascript", "js", "node"].includes(normalizedLanguage)) {
		return [
			{
				command: "node",
				getArgs: (filePath: string) => [filePath],
			},
		]
	}

	if (["python", "py", "python3"].includes(normalizedLanguage)) {
		return [
			{
				command: "python",
				getArgs: (filePath: string) => [filePath],
			},
			{
				command: "py",
				getArgs: (filePath: string) => ["-3", filePath],
			},
		]
	}

	return []
}

function runLocalCommand({
	command,
	args,
	stdin,
	cwd,
	timeoutMs,
}: {
	command: string
	args: string[]
	stdin: string
	cwd: string
	timeoutMs: number
}): Promise<LocalExecutionResult> {
	return new Promise((resolve, reject) => {
		let stdout = ""
		let stderr = ""
		let settled = false
		let timedOut = false

		const child = spawn(command, args, {
			cwd,
			windowsHide: true,
		})

		const finish = (result: LocalExecutionResult) => {
			if (settled) return
			settled = true
			resolve(result)
		}

		const timer = setTimeout(() => {
			timedOut = true
			child.kill()
		}, timeoutMs)

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString()
		})

		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString()
		})

		child.on("error", (error) => {
			clearTimeout(timer)
			const errorCode = (error as NodeJS.ErrnoException).code || ""
			if (errorCode === "ENOENT") {
				finish({
					stdout: "",
					stderr: "",
					code: null,
					signal: null,
					spawnErrorCode: "ENOENT",
				})
				return
			}

			if (settled) return
			settled = true
			reject(error)
		})

		child.on("close", (code, signal) => {
			clearTimeout(timer)
			const timeoutMessage = timedOut
				? `\nExecution timed out after ${Math.floor(timeoutMs / 1000)} seconds.`
				: ""
			finish({
				stdout,
				stderr: `${stderr}${timeoutMessage}`,
				code,
				signal,
			})
		})

		if (stdin) {
			child.stdin.write(stdin)
		}
		child.stdin.end()
	})
}

async function executeWithLocalRuntime(
	body: PistonExecuteBody,
): Promise<{ success: true; response: unknown } | { success: false; error: string }> {
	const language = normalizeLanguageName(body.language || "")
	const files = Array.isArray(body.files) ? body.files : []
	const firstFile = files[0]
	const content =
		typeof firstFile?.content === "string"
			? firstFile.content
			: typeof firstFile?.content === "number"
				? String(firstFile.content)
				: ""

	if (!language) {
		return { success: false, error: "Language is required." }
	}

	if (!files.length) {
		return { success: false, error: "At least one file is required to execute code." }
	}

	const commandCandidates = getLocalCommandCandidates(language)
	if (!commandCandidates.length) {
		return {
			success: false,
			error: `No local runtime configured for language "${language}".`,
		}
	}

	const safeFileName = path.basename((firstFile?.name || "main").trim()) || "main"
	const hasKnownExtension = path.extname(safeFileName).length > 0
	const targetFileName = hasKnownExtension
		? safeFileName
		: `${safeFileName}${getLocalFileExtension(language)}`

	const tempDirectory = await fsPromises.mkdtemp(
		path.join(os.tmpdir(), "code-coalition-run-"),
	)
	const filePath = path.join(tempDirectory, targetFileName)

	try {
		await fsPromises.writeFile(filePath, content, "utf8")

		let lastCommandError = ""

		for (const candidate of commandCandidates) {
			const commandResult = await runLocalCommand({
				command: candidate.command,
				args: candidate.getArgs(filePath),
				stdin: typeof body.stdin === "string" ? body.stdin : "",
				cwd: tempDirectory,
				timeoutMs: localRunTimeoutMs,
			})

			if (commandResult.spawnErrorCode === "ENOENT") {
				lastCommandError = `Command "${candidate.command}" is not installed.`
				continue
			}

			return {
				success: true,
				response: {
					language,
					version: "local",
					run: {
						stdout: commandResult.stdout,
						stderr: commandResult.stderr,
						code: commandResult.code,
						signal: commandResult.signal,
						output: `${commandResult.stdout}${commandResult.stderr}`,
					},
				},
			}
		}

		return {
			success: false,
			error:
				lastCommandError ||
				`Local runtime for language "${language}" is unavailable on this machine.`,
		}
	} catch (error) {
		return {
			success: false,
			error: `Local execution failed: ${(error as Error).message}`,
		}
	} finally {
		await fsPromises.rm(tempDirectory, { recursive: true, force: true }).catch(() => {})
	}
}

function cleanupOAuthStateStore() {
	const now = Date.now()
	for (const [state, record] of oauthStateStore.entries()) {
		if (now - record.createdAt > oauthStateTtlMs) {
			oauthStateStore.delete(state)
		}
	}
}

function createOAuthState(provider: OAuthProvider, origin: string): string {
	cleanupOAuthStateStore()
	const state = randomBytes(24).toString("hex")
	oauthStateStore.set(state, {
		provider,
		origin,
		createdAt: Date.now(),
	})
	return state
}

function consumeOAuthState(state: string, provider: OAuthProvider): OAuthStateRecord | null {
	cleanupOAuthStateStore()
	const record = oauthStateStore.get(state)
	if (!record || record.provider !== provider) {
		return null
	}
	oauthStateStore.delete(state)
	return record
}

function getOAuthCallbackHtml({
	success,
	provider,
	origin,
	accessToken,
	errorMessage,
}: {
	success: boolean
	provider: OAuthProvider
	origin: string
	accessToken?: string
	errorMessage?: string
}): string {
	const sanitizedOrigin = origin || "*"
	const payload = success
		? {
				type: "oauth-success",
				provider,
				accessToken,
			}
		: {
				type: "oauth-error",
				provider,
				error: errorMessage || "OAuth failed.",
			}

	const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c")
	const serializedOrigin = JSON.stringify(sanitizedOrigin)

	return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>OAuth</title></head>
<body>
<script>
  (function () {
    var payload = ${serializedPayload};
    var targetOrigin = ${serializedOrigin};
    if (window.opener && typeof window.opener.postMessage === "function") {
      window.opener.postMessage(payload, targetOrigin);
    }
    window.close();
  })();
</script>
</body>
</html>`
}

io.on("connection", (socket) => {
	console.log("✅ NEW CONNECTION:", socket.id)

	const ptyInstance = ptyProcess.get(socket.id)
	if (!ptyInstance) {
		createPtyForSocket(socket.id, socket, process.env.INIT_CWD || process.cwd())
	}

	// Handle user actions
	socket.on(SocketEvent.JOIN_REQUEST, ({ roomId, username, sessionId }) => {
		const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : ""
		const normalizedUsername = typeof username === "string" ? username.trim() : ""
		const normalizedSessionId =
			typeof sessionId === "string" ? sessionId.trim() : ""
		console.log("JOIN_REQUEST:", {
			socketId: socket.id,
			roomId: normalizedRoomId,
			username: normalizedUsername,
		})

		if (!normalizedRoomId || !normalizedUsername) {
			io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS)
			return
		}

		const existingUser = getUsersInRoom(normalizedRoomId).find(
			(u) => u.username === normalizedUsername
		)

		if (existingUser) {
			if (existingUser.socketId !== socket.id) {
				const existingSocket = io.sockets.sockets.get(existingUser.socketId)
				const existingSessionId =
					typeof existingSocket?.data?.joinSessionId === "string"
						? existingSocket.data.joinSessionId
						: ""
				const canHandoff =
					normalizedSessionId.length > 0 &&
					existingSessionId.length > 0 &&
					existingSessionId === normalizedSessionId

				if (!canHandoff) {
					io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS)
					return
				}

				// Refresh reconnect handoff: move identity from old socket to the new socket.
				userSocketMap = userSocketMap.filter(
					(u) => u.socketId !== existingUser.socketId
				)
				if (existingSocket) {
					existingSocket.leave(normalizedRoomId)
					existingSocket.disconnect(true)
				}
			}
		}

		// Ensure one user record per active socket.
		userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
		socket.data.joinSessionId = normalizedSessionId

		const user = {
			username: normalizedUsername,
			roomId: normalizedRoomId,
			status: USER_CONNECTION_STATUS.ONLINE,
			cursorPosition: 0,
			typing: false,
			socketId: socket.id,
			currentFile: null,
		}
		userSocketMap.push(user)
		socket.join(normalizedRoomId)
		const roomWorkspacePath = getRoomWorkspacePath(normalizedRoomId)
		resetPtyForSocket(socket, roomWorkspacePath)
		socket.broadcast.to(normalizedRoomId).emit(SocketEvent.USER_JOINED, { user })
		const users = getUsersInRoom(normalizedRoomId)
		console.log("JOIN_ACCEPTED:", {
			socketId: socket.id,
			roomId: normalizedRoomId,
			username: normalizedUsername,
			totalUsersInRoom: users.length,
		})
		io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users })
		const activeScreenShare = roomScreenShareMap.get(normalizedRoomId)
		io.to(socket.id).emit(SocketEvent.SCREEN_SHARE_STATUS, {
			sharerSocketId: activeScreenShare?.socketId || null,
			sharerUsername: activeScreenShare?.username || null,
		})
	})

	socket.on("disconnecting", () => {
		const user = userSocketMap.find((u) => u.socketId === socket.id) || null
		if (user) {
			const roomId = user.roomId
			const activeScreenShare = roomScreenShareMap.get(roomId)
			if (activeScreenShare?.socketId === socket.id) {
				roomScreenShareMap.delete(roomId)
				socket.broadcast.to(roomId).emit(SocketEvent.SCREEN_SHARE_STOPPED, {
					sharerSocketId: socket.id,
				})
			}
			socket.broadcast
				.to(roomId)
				.emit(SocketEvent.USER_DISCONNECTED, { user })
			userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
			socket.leave(roomId)
			if (getUsersInRoom(roomId).length === 0) {
				roomScreenShareMap.delete(roomId)
				const timer = roomSyncTimers.get(roomId)
				if (timer) {
					clearTimeout(timer)
					roomSyncTimers.delete(roomId)
				}
			}
		}

		const pty = ptyProcess.get(socket.id)
		if (pty) {
			pty.kill()
			ptyProcess.delete(socket.id)
		}
	})

	// Handle file actions
	socket.on(
		SocketEvent.SYNC_FILE_STRUCTURE,
		({ fileStructure, openFiles, activeFile, socketId }) => {
			io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
				fileStructure,
				openFiles,
				activeFile,
			})
		}
	)

	socket.on(
		SocketEvent.WORKSPACE_SYNC,
		({ fileStructure }: { fileStructure: WorkspaceFileSystemItem }) => {
			const roomId = getRoomId(socket.id)
			if (!roomId) return
			roomFileTrees.set(roomId, fileStructure)
			scheduleWorkspaceSync(roomId)
		},
	)

	socket.on(
		SocketEvent.DIRECTORY_CREATED,
		({ parentDirId, newDirectory }) => {
			const roomId = getRoomId(socket.id)
			if (!roomId) return
			socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
				parentDirId,
				newDirectory,
			})
		}
	)

	socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
			dirId,
			children,
		})
	})

	socket.on(SocketEvent.DIRECTORY_RENAMED, ({ dirId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
			dirId,
			newName,
		})
	})

	socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.DIRECTORY_DELETED, { dirId })
	})

	socket.on(SocketEvent.FILE_CREATED, ({ parentDirId, newFile }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.FILE_CREATED, { parentDirId, newFile })
	})

	socket.on(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
			fileId,
			newContent,
		})
	})

	socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
			fileId,
			newName,
		})
	})

	socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId })
	})

	// Handle file opened event - update user's current file
	socket.on(SocketEvent.FILE_OPENED, ({ fileId }: { fileId?: string }) => {
		console.log('📂 SERVER: FILE_OPENED received', {
			socketId: socket.id,
			fileId,
		})
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				const updated = {
					...user,
					currentFile: fileId || null,
				}
				console.log('✅ Updated user currentFile:', {
					username: updated.username,
					fileId: updated.currentFile,
				})
				return updated
			}
			return user
		})

		// Broadcast updated user state to all users in room so they know this user's current file
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		console.log('📡 Broadcasting updated user state to room', {
			roomId,
			username: user.username,
			currentFile: user.currentFile,
		})
		socket.broadcast.to(roomId).emit(SocketEvent.USER_UPDATED, { user })
	})

	// Handle user status
	socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socketId) {
				return { ...user, status: USER_CONNECTION_STATUS.OFFLINE }
			}
			return user
		})
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId })
	})

	socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socketId) {
				return { ...user, status: USER_CONNECTION_STATUS.ONLINE }
			}
			return user
		})
		const roomId = getRoomId(socketId)
		if (!roomId) return
		socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId })
	})

	// Handle screen share actions
	socket.on(SocketEvent.SCREEN_SHARE_STATUS_REQUEST, () => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return

		const activeScreenShare = roomScreenShareMap.get(roomId)
		io.to(socket.id).emit(SocketEvent.SCREEN_SHARE_STATUS, {
			sharerSocketId: activeScreenShare?.socketId || null,
			sharerUsername: activeScreenShare?.username || null,
		})
	})

	socket.on(SocketEvent.SCREEN_SHARE_START, () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return

		const roomId = user.roomId
		const previousShare = roomScreenShareMap.get(roomId)
		if (previousShare && previousShare.socketId !== socket.id) {
			io.to(previousShare.socketId).emit(SocketEvent.SCREEN_SHARE_STOPPED, {
				sharerSocketId: previousShare.socketId,
			})
		}

		roomScreenShareMap.set(roomId, {
			socketId: socket.id,
			username: user.username,
		})

		io.to(roomId).emit(SocketEvent.SCREEN_SHARE_STARTED, {
			sharerSocketId: socket.id,
			sharerUsername: user.username,
		})
	})

	socket.on(SocketEvent.SCREEN_SHARE_STOP, () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return

		const roomId = user.roomId
		const activeScreenShare = roomScreenShareMap.get(roomId)
		if (activeScreenShare?.socketId !== socket.id) return

		roomScreenShareMap.delete(roomId)
		io.to(roomId).emit(SocketEvent.SCREEN_SHARE_STOPPED, {
			sharerSocketId: socket.id,
		})
	})

	socket.on(
		SocketEvent.SCREEN_SHARE_SIGNAL,
		({
			targetSocketId,
			payload,
		}: {
			targetSocketId?: string
			payload?: ScreenShareSignalEnvelope
		}) => {
			if (!targetSocketId || !payload) return

			const sourceUser = getUserBySocketId(socket.id)
			if (!sourceUser) return

			const targetUser = getUserBySocketId(targetSocketId)
			if (!targetUser || targetUser.roomId !== sourceUser.roomId) return

			io.to(targetSocketId).emit(SocketEvent.SCREEN_SHARE_SIGNAL, {
				fromSocketId: socket.id,
				fromUsername: sourceUser.username,
				payload,
			})
		},
	)

	// Handle chat actions
	socket.on(SocketEvent.SEND_MESSAGE, ({
		message,
		recipientSocketId,
	}: {
		message?: Partial<ChatMessagePayload>
		recipientSocketId?: string | null
	}) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		const sender = getUserBySocketId(socket.id)
		if (!sender) return

		const text = typeof message?.message === "string"
			? message.message.trim()
			: ""
		if (!text) return

		const outgoingMessage: ChatMessagePayload = {
			id:
				typeof message?.id === "string" && message.id.trim().length > 0
					? message.id
					: `${socket.id}-${Date.now()}`,
			message: text,
			username: sender.username,
			timestamp:
				typeof message?.timestamp === "string" &&
				message.timestamp.trim().length > 0
					? message.timestamp
					: new Date().toISOString(),
			isDirect: false,
			recipientSocketId: null,
			recipientUsername: null,
		}

		if (recipientSocketId && recipientSocketId !== socket.id) {
			const targetUser = getUserBySocketId(recipientSocketId)
			if (!targetUser || targetUser.roomId !== roomId) return

			io.to(targetUser.socketId).emit(SocketEvent.RECEIVE_MESSAGE, {
				message: {
					...outgoingMessage,
					isDirect: true,
					recipientSocketId: targetUser.socketId,
					recipientUsername: targetUser.username,
				},
			})
			return
		}

		socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, {
			message: outgoingMessage,
		})
	})

	socket.on(
		SocketEvent.SEND_FILE_SHARE,
		({
			file,
			recipientSocketId,
		}: {
			file: IncomingSharedFile
			recipientSocketId?: string | null
		}) => {
			const sender = getUserBySocketId(socket.id)
			if (!sender) return

			const emitFileShareError = (message: string) => {
				io.to(socket.id).emit(SocketEvent.FILE_SHARE_ERROR, { message })
			}

			if (!file || typeof file !== "object") {
				emitFileShareError("Invalid file payload.")
				return
			}

			const fileName =
				typeof file.name === "string" ? file.name.trim() : ""
			if (!fileName) {
				emitFileShareError("File name is required.")
				return
			}
			if (fileName.length > maxFileShareNameLength) {
				emitFileShareError("File name is too long.")
				return
			}

			const dataUrl = typeof file.dataUrl === "string" ? file.dataUrl : ""
			if (!dataUrl) {
				emitFileShareError("File content is missing.")
				return
			}

			const parsedData = parseDataUrl(dataUrl)
			if (!parsedData) {
				emitFileShareError("Invalid file encoding. Please upload again.")
				return
			}

			if (
				parsedData.size <= 0 ||
				parsedData.size > maxFileShareSizeBytes
			) {
				emitFileShareError(
					`File is too large. Maximum allowed size is ${maxFileShareSizeMb}MB.`,
				)
				return
			}

			let targetSocketId: string | null = null
			if (recipientSocketId) {
				const targetUser = getUserBySocketId(recipientSocketId)
				if (!targetUser || targetUser.roomId !== sender.roomId) {
					emitFileShareError("Selected user is no longer in this room.")
					return
				}

				if (targetUser.socketId === socket.id) {
					emitFileShareError(
						"Choose another user or share with all users.",
					)
					return
				}

				targetSocketId = targetUser.socketId
			}

			const sharedFilePayload: SharedFilePayload = {
				id:
					typeof file.id === "string" && file.id.trim().length > 0
						? file.id
						: `${socket.id}-${Date.now()}`,
				name: fileName,
				mimeType:
					typeof file.mimeType === "string" && file.mimeType.trim()
						? file.mimeType.trim()
						: parsedData.mimeType,
				size: parsedData.size,
				dataUrl,
				senderUsername: sender.username,
				senderSocketId: sender.socketId,
				recipientSocketId: targetSocketId,
				roomId: sender.roomId,
				sentAt: new Date().toISOString(),
			}

			if (targetSocketId) {
				io.to(targetSocketId).emit(SocketEvent.RECEIVE_FILE_SHARE, {
					file: sharedFilePayload,
				})
				return
			}

			socket.broadcast
				.to(sender.roomId)
				.emit(SocketEvent.RECEIVE_FILE_SHARE, { file: sharedFilePayload })
		},
	)

		// Handle cursor movement
		// ================= CURSOR MOVE (FIXED) =================
	socket.on(
	SocketEvent.CURSOR_MOVE,
	({ cursorPosition, selectionStart, selectionEnd, fileId }) => {

		// Update user state
		userSocketMap = userSocketMap.map((user) => {
		if (user.socketId === socket.id) {
			return {
			...user,
			cursorPosition,
			selectionStart,
			selectionEnd,
			currentFile: fileId ?? user.currentFile,
			}
		}
		return user
		})

		const user = getUserBySocketId(socket.id)
		if (!user) return

		const roomId = user.roomId

		// Broadcast cursor to others in the SAME ROOM
		socket.broadcast.to(roomId).emit(SocketEvent.CURSOR_MOVE, {
		user: {
			socketId: user.socketId,
			username: user.username,
			cursorPosition: user.cursorPosition,
			selectionStart: user.selectionStart,
			selectionEnd: user.selectionEnd,
			currentFile: user.currentFile,
		},
		})
	}
	)


	socket.on(SocketEvent.TYPING_START, ({ fileId, cursorPosition, selectionStart, selectionEnd }) => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return {
					...user,
					typing: true,
					currentFile: fileId || null,
					cursorPosition: cursorPosition ?? user.cursorPosition,
					selectionStart: selectionStart ?? user.selectionStart,
					selectionEnd: selectionEnd ?? user.selectionEnd,
				}
			}
			return user
		})
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user })
	})

	socket.on(SocketEvent.TYPING_PAUSE, () => {
		userSocketMap = userSocketMap.map((user) => {
			if (user.socketId === socket.id) {
				return { ...user, typing: false }
			}
			return user
		})
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user })
	})


		socket.on(SocketEvent.REQUEST_DRAWING, () => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return

		// Ask other users in the room to send their snapshot
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id })
	})

	socket.on(SocketEvent.SYNC_DRAWING, ({ snapshot, drawingData, socketId }) => {
		if (!socketId) return
		const normalizedDrawingData = drawingData ?? snapshot ?? null
		// Keep both keys for backward compatibility between deployed clients.
		socket.to(socketId).emit(SocketEvent.SYNC_DRAWING, {
			drawingData: normalizedDrawingData,
			snapshot: normalizedDrawingData,
		})
	})

	socket.on(SocketEvent.DRAWING_UPDATE, ({ diff }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return

		// Broadcast real-time drawing updates (DIFF)
		socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
			diff,
		})
	})


	socket.on(SocketEvent.TERMINAL_EXECUTE, ({ input }) => {
		const ptyInstance = ensurePtyForSocket(socket)
		ptyInstance.write(input)
	})

	socket.on(SocketEvent.TERMINAL_RESIZE, ({ cols, rows }) => {
		if (typeof cols !== "number" || typeof rows !== "number") return
		if (cols < 2 || rows < 1) return
		const ptyInstance = ensurePtyForSocket(socket)
		ptyInstance.resize(Math.floor(cols), Math.floor(rows))
	})

	socket.on(SocketEvent.TERMINAL_RESET, () => {
		const roomId = getRoomId(socket.id)
		const terminalCwd = roomId
			? getRoomWorkspacePath(roomId)
			: process.env.INIT_CWD || process.cwd()
		resetPtyForSocket(socket, terminalCwd)
		socket.emit(SocketEvent.TERMINAL_OUTPUT, { data: "Session cleared.\r\n" })
	})
})

const PORT = process.env.PORT || 3000

// Copilot API proxy endpoint
app.post("/api/copilot/generate", async (req: Request, res: Response) => {
	try {
		loadServerEnv()

		const {
			prompt,
			messages,
			model,
			systemPrompt,
		} = req.body as {
			prompt?: string
			messages?: Array<{ role?: string; content?: string }>
			model?: string
			systemPrompt?: string
		}

		const userPromptFromMessages = Array.isArray(messages)
			? messages
					.map((m) => `${m.role || "user"}: ${m.content || ""}`.trim())
					.filter(Boolean)
					.join("\n")
			: ""
		const userPrompt = (prompt || userPromptFromMessages || "").trim()
		if (!userPrompt) {
			return res.status(400).json({ error: "Prompt is required" })
		}

		const apiFreeLlmKey = (
			process.env.APIFREELLM_API_KEY ||
			process.env.VITE_APIFREELLM_API_KEY ||
			""
		).trim()
		if (!apiFreeLlmKey) {
			console.error("API Free LLM key not configured")
			return res.status(400).json({
				error: "APIFREELLM_API_KEY is not configured in server/.env",
			})
		}

		const selectedModel =
			typeof model === "string" && model.trim().length > 0
				? model.trim()
				: "apifreellm"
		const baseSystemPrompt =
			typeof systemPrompt === "string" && systemPrompt.trim().length > 0
				? systemPrompt.trim()
				: "You are a coding copilot for the Code Coalition project. Return only Markdown code blocks with no explanation outside the code block."
		const finalMessage = `${baseSystemPrompt}\n\nUser request:\n${userPrompt}`

		const response = await fetch("https://apifreellm.com/api/v1/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiFreeLlmKey}`,
			},
			body: JSON.stringify({
				message: finalMessage,
				model: selectedModel,
			}),
		})

		const data = await response.json()
		if (!response.ok) {
			console.error("API Free LLM error:", response.status, data)
			return res.status(response.status).json({
				error:
					data?.error ||
					data?.message ||
					"API Free LLM request failed",
			})
		}

		const text =
			typeof data?.response === "string"
				? data.response.trim()
				: typeof data?.text === "string"
					? data.text.trim()
					: ""
		if (!text) {
			console.error("API Free LLM returned empty response:", data)
			return res
				.status(502)
				.json({ error: "API Free LLM returned an empty response" })
		}

		return res.json({
			text,
			model: selectedModel,
			tier: data?.tier,
			features: data?.features,
		})
	} catch (error) {
		console.error("Copilot API error:", error)
		res.status(500).json({ error: `Failed to generate code: ${(error as Error).message}` })
	}
})

app.get("/api/piston/runtimes", async (_req: Request, res: Response) => {
	try {
		loadServerEnv()
		const pistonApiBaseUrl = getPistonApiBaseUrl()
		const upstreamResponse = await fetch(`${pistonApiBaseUrl}/runtimes`, {
			method: "GET",
			headers: {
				...getPistonAuthHeaders(),
			},
		})
		const data = await upstreamResponse.json().catch(() => null)

		if (!upstreamResponse.ok) {
			const upstreamErrorMessage =
				(typeof data?.message === "string" && data.message) ||
				(typeof data?.error === "string" && data.error) ||
				`Failed to fetch Piston runtimes (${upstreamResponse.status}).`
			console.warn("Piston runtimes unavailable, using local fallbacks:", upstreamErrorMessage)
			return res.json(localFallbackRuntimes)
		}

		return res.json(data)
	} catch (error) {
		console.warn("Piston runtimes proxy error, using local fallbacks:", error)
		return res.json(localFallbackRuntimes)
	}
})

app.post("/api/piston/execute", async (req: Request, res: Response) => {
	const executeBody = (req.body || {}) as PistonExecuteBody
	let upstreamErrorMessage = ""

	try {
		loadServerEnv()
		const pistonApiBaseUrl = getPistonApiBaseUrl()
		const upstreamResponse = await fetch(`${pistonApiBaseUrl}/execute`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getPistonAuthHeaders(),
			},
			body: JSON.stringify(executeBody),
		})
		const data = await upstreamResponse.json().catch(() => null)

		if (!upstreamResponse.ok) {
			upstreamErrorMessage =
				(typeof data?.message === "string" && data.message) ||
				(typeof data?.error === "string" && data.error) ||
				`Failed to execute code on Piston API (${upstreamResponse.status}).`
		} else {
			return res.json(data)
		}
	} catch (error) {
		upstreamErrorMessage = `Piston execute proxy error: ${(error as Error).message}`
	}

	const localExecution = await executeWithLocalRuntime(executeBody)
	if (localExecution.success) {
		return res.json(localExecution.response)
	}

	const fallbackError = localExecution.error
	if (upstreamErrorMessage) {
		return res.status(502).json({
			error: `${upstreamErrorMessage} Local fallback failed: ${fallbackError}`,
		})
	}

	return res.status(400).json({ error: fallbackError })
})

app.get("/api/oauth/:provider/start", (req: Request, res: Response) => {
	const providerParam = String(req.params.provider || "").toLowerCase()
	const provider: OAuthProvider | null =
		providerParam === "github"
			? "github"
			: providerParam === "gdrive"
				? "gdrive"
				: null

	if (!provider) {
		return res.status(400).json({ error: "Unsupported OAuth provider." })
	}

	const origin = normalizeOrigin(typeof req.query.origin === "string" ? req.query.origin : "")
	if (!origin) {
		return res.status(400).json({ error: "A valid origin is required." })
	}

	const state = createOAuthState(provider, origin)
	const redirectUri = buildOAuthRedirectUri(req, provider)

	if (provider === "github") {
		const clientId = (process.env.GITHUB_CLIENT_ID || "").trim()
		if (!clientId) {
			return res.status(400).json({
				error: "GITHUB_CLIENT_ID is not configured on the server.",
			})
		}

		const authorizeUrl = new URL("https://github.com/login/oauth/authorize")
		authorizeUrl.searchParams.set("client_id", clientId)
		authorizeUrl.searchParams.set("redirect_uri", redirectUri)
		authorizeUrl.searchParams.set("scope", githubScope)
		authorizeUrl.searchParams.set("state", state)

		return res.json({
			provider,
			authorizeUrl: authorizeUrl.toString(),
		})
	}

	const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim()
	if (!clientId) {
		return res.status(400).json({
			error: "GOOGLE_CLIENT_ID is not configured on the server.",
		})
	}

	const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
	authorizeUrl.searchParams.set("client_id", clientId)
	authorizeUrl.searchParams.set("redirect_uri", redirectUri)
	authorizeUrl.searchParams.set("response_type", "code")
	authorizeUrl.searchParams.set("scope", googleDriveScope)
	authorizeUrl.searchParams.set("access_type", "online")
	authorizeUrl.searchParams.set("include_granted_scopes", "true")
	authorizeUrl.searchParams.set("prompt", "consent")
	authorizeUrl.searchParams.set("state", state)

	return res.json({
		provider,
		authorizeUrl: authorizeUrl.toString(),
	})
})

app.get("/api/oauth/github/callback", async (req: Request, res: Response) => {
	try {
		const code = typeof req.query.code === "string" ? req.query.code : ""
		const state = typeof req.query.state === "string" ? req.query.state : ""
		const oauthError = typeof req.query.error === "string" ? req.query.error : ""

		const stateRecord = consumeOAuthState(state, "github")
		const origin = stateRecord?.origin || "*"
		if (!stateRecord) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "github",
						origin,
						errorMessage: "Invalid or expired OAuth state.",
					}),
				)
		}

		if (oauthError) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "github",
						origin,
						errorMessage: oauthError,
					}),
				)
		}

		if (!code) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "github",
						origin,
						errorMessage: "Missing authorization code.",
					}),
				)
		}

		const clientId = (process.env.GITHUB_CLIENT_ID || "").trim()
		const clientSecret = (process.env.GITHUB_CLIENT_SECRET || "").trim()
		if (!clientId || !clientSecret) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "github",
						origin,
						errorMessage: "GitHub OAuth is not configured on the server.",
					}),
				)
		}

		const redirectUri = buildOAuthRedirectUri(req, "github")
		const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: redirectUri,
			}),
		})

		const tokenPayload = await tokenResponse.json().catch(() => null)
		const accessToken =
			typeof tokenPayload?.access_token === "string"
				? tokenPayload.access_token
				: ""
		if (!tokenResponse.ok || !accessToken) {
			const errorMessage =
				typeof tokenPayload?.error_description === "string"
					? tokenPayload.error_description
					: "Failed to exchange GitHub OAuth code."
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "github",
						origin,
						errorMessage,
					}),
				)
		}

		return res.send(
			getOAuthCallbackHtml({
				success: true,
				provider: "github",
				origin,
				accessToken,
			}),
		)
	} catch (error) {
		console.error("GitHub OAuth callback error:", error)
		return res
			.status(500)
			.send(
				getOAuthCallbackHtml({
					success: false,
					provider: "github",
					origin: "*",
					errorMessage: "GitHub OAuth callback failed.",
				}),
			)
	}
})

app.get("/api/oauth/gdrive/callback", async (req: Request, res: Response) => {
	try {
		const code = typeof req.query.code === "string" ? req.query.code : ""
		const state = typeof req.query.state === "string" ? req.query.state : ""
		const oauthError = typeof req.query.error === "string" ? req.query.error : ""

		const stateRecord = consumeOAuthState(state, "gdrive")
		const origin = stateRecord?.origin || "*"
		if (!stateRecord) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "gdrive",
						origin,
						errorMessage: "Invalid or expired OAuth state.",
					}),
				)
		}

		if (oauthError) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "gdrive",
						origin,
						errorMessage: oauthError,
					}),
				)
		}

		if (!code) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "gdrive",
						origin,
						errorMessage: "Missing authorization code.",
					}),
				)
		}

		const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim()
		const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim()
		if (!clientId || !clientSecret) {
			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "gdrive",
						origin,
						errorMessage: "Google OAuth is not configured on the server.",
					}),
				)
		}

		const redirectUri = buildOAuthRedirectUri(req, "gdrive")
		const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				redirect_uri: redirectUri,
				grant_type: "authorization_code",
			}).toString(),
		})

		const tokenPayload = await tokenResponse.json().catch(() => null)
		const accessToken =
			typeof tokenPayload?.access_token === "string"
				? tokenPayload.access_token
				: ""
		if (!tokenResponse.ok || !accessToken) {
			const errorMessage =
				typeof tokenPayload?.error_description === "string"
					? tokenPayload.error_description
					: typeof tokenPayload?.error === "string"
						? tokenPayload.error
						: "Failed to exchange Google OAuth code."

			return res
				.status(400)
				.send(
					getOAuthCallbackHtml({
						success: false,
						provider: "gdrive",
						origin,
						errorMessage,
					}),
				)
		}

		return res.send(
			getOAuthCallbackHtml({
				success: true,
				provider: "gdrive",
				origin,
				accessToken,
			}),
		)
	} catch (error) {
		console.error("Google OAuth callback error:", error)
		return res
			.status(500)
			.send(
				getOAuthCallbackHtml({
					success: false,
					provider: "gdrive",
					origin: "*",
					errorMessage: "Google OAuth callback failed.",
				}),
			)
	}
})

app.post("/api/import/external", async (req: Request, res: Response) => {
	try {
		const urlValue =
			typeof req.body?.url === "string" ? req.body.url.trim() : ""

		if (!urlValue) {
			return res.status(400).json({ error: "URL is required." })
		}

		let parsedUrl: URL
		try {
			parsedUrl = new URL(urlValue)
		} catch {
			return res.status(400).json({ error: "Invalid URL." })
		}

		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			return res.status(400).json({ error: "Only HTTP/HTTPS URLs are supported." })
		}

		const host = parsedUrl.hostname.toLowerCase()
		let provider: "github" | "gdrive"
		let downloadUrl = urlValue
		let fileNameFallback = ""

		if (host === "github.com" || host === "raw.githubusercontent.com") {
			provider = "github"
			const githubRawUrl = getGithubRawUrl(parsedUrl)
			if (!githubRawUrl) {
				return res.status(400).json({
					error: "Provide a direct GitHub file URL (raw URL or blob URL).",
				})
			}
			downloadUrl = githubRawUrl
			fileNameFallback = getFileNameFromPath(new URL(githubRawUrl).pathname)
		} else if (host.endsWith("drive.google.com") || host === "docs.google.com") {
			provider = "gdrive"
			const driveFileId = extractDriveFileId(urlValue)
			if (!driveFileId) {
				return res.status(400).json({
					error: "Unable to read Google Drive file ID from URL.",
				})
			}
			downloadUrl = `https://drive.google.com/uc?export=download&id=${driveFileId}`
			fileNameFallback = `drive-file-${driveFileId}`
		} else {
			return res.status(400).json({
				error: "Only GitHub and Google Drive URLs are supported.",
			})
		}

		const requestHeaders: Record<string, string> = {}
		const githubToken = (process.env.GITHUB_TOKEN || "").trim()
		if (provider === "github" && githubToken) {
			requestHeaders.Authorization = `Bearer ${githubToken}`
		}

		const downloadResponse = await fetch(downloadUrl, {
			method: "GET",
			headers: requestHeaders,
			redirect: "follow",
		})

		if (!downloadResponse.ok) {
			return res.status(downloadResponse.status).json({
				error: `Failed to fetch external file (${downloadResponse.status}).`,
			})
		}

		const arrayBuffer = await downloadResponse.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)

		if (buffer.length === 0) {
			return res.status(400).json({ error: "Downloaded file is empty." })
		}

		if (buffer.length > maxExternalImportSizeBytes) {
			return res.status(413).json({
				error: `File is too large. Maximum allowed size is ${maxExternalImportSizeMb}MB.`,
			})
		}

		const contentTypeHeader =
			downloadResponse.headers.get("content-type") || "application/octet-stream"
		const mimeType = contentTypeHeader.split(";")[0].trim() || "application/octet-stream"
		const fileNameFromHeader = parseFileNameFromContentDisposition(
			downloadResponse.headers.get("content-disposition"),
		)
		const resolvedFileName = sanitizeImportedFileName(
			fileNameFromHeader || fileNameFallback || `imported-file-${Date.now()}`,
		)
		const isLikelyText = isLikelyTextFile(mimeType, buffer)

		return res.json({
			provider,
			fileName: resolvedFileName,
			mimeType,
			size: buffer.length,
			isLikelyText,
			textContent: isLikelyText ? buffer.toString("utf8") : "",
			base64Content: isLikelyText ? null : buffer.toString("base64"),
		})
	} catch (error) {
		console.error("External import error:", error)
		return res.status(500).json({
			error: `Failed to import external file: ${(error as Error).message}`,
		})
	}
})

app.get("/", (req: Request, res: Response) => {
	// Send the index.html file
	res.sendFile(path.join(__dirname, "..", "public", "index.html"))
})

server.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`)
})
