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
const maxFileShareEnvValue = Number(process.env.FILE_SHARE_MAX_SIZE_MB || "20")
const maxFileShareSizeMb =
	Number.isFinite(maxFileShareEnvValue) && maxFileShareEnvValue > 0
		? maxFileShareEnvValue
		: 20
const maxFileShareSizeBytes = maxFileShareSizeMb * 1024 * 1024
const maxFileShareNameLength = 255

interface WorkspaceFileSystemItem {
	id: string
	name: string
	type: "file" | "directory"
	children?: WorkspaceFileSystemItem[]
	content?: string
}

interface WorkspaceEntry {
	relativePath: string
	type: "file" | "directory"
	content?: string
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
		console.log(
			`PTY process for ${socketId} exited with code ${exitCode}, signal ${signal}`
		)
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
		await fsPromises.writeFile(absolutePath, fileEntry.content || "", "utf8")
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

io.on("connection", (socket) => {
	console.log("✅ NEW CONNECTION:", socket.id)

	const ptyInstance = ptyProcess.get(socket.id)
	if (!ptyInstance) {
		createPtyForSocket(socket.id, socket, process.env.INIT_CWD || process.cwd())
	}

	// Handle user actions
	socket.on(SocketEvent.JOIN_REQUEST, ({ roomId, username }) => {
		console.log('🔗 JOIN_REQUEST:', { socketId: socket.id, roomId, username })
		// Check is username exist in the room
		const isUsernameExist = getUsersInRoom(roomId).filter(
			(u) => u.username === username
		)
		if (isUsernameExist.length > 0) {
			io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS)
			return
		}

		const user = {
			username,
			roomId,
			status: USER_CONNECTION_STATUS.ONLINE,
			cursorPosition: 0,
			typing: false,
			socketId: socket.id,
			currentFile: null,
		}
		userSocketMap.push(user)
		socket.join(roomId)
		const roomWorkspacePath = getRoomWorkspacePath(roomId)
		resetPtyForSocket(socket, roomWorkspacePath)
		socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user })
		const users = getUsersInRoom(roomId)
		console.log('✅ JOIN_ACCEPTED:', { socketId: socket.id, roomId, username, totalUsersInRoom: users.length })
		io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users })
	})

	socket.on("disconnecting", () => {
		const user = getUserBySocketId(socket.id)
		if (!user) return
		const roomId = user.roomId
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.USER_DISCONNECTED, { user })
		userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id)
		socket.leave(roomId)
		if (getUsersInRoom(roomId).length === 0) {
			const timer = roomSyncTimers.get(roomId)
			if (timer) {
				clearTimeout(timer)
				roomSyncTimers.delete(roomId)
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

	// Handle chat actions
	socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
		const roomId = getRoomId(socket.id)
		if (!roomId) return
		socket.broadcast
			.to(roomId)
			.emit(SocketEvent.RECEIVE_MESSAGE, { message })
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

	socket.on(SocketEvent.SYNC_DRAWING, ({ snapshot, socketId }) => {
		// Send snapshot ONLY to the requesting socket
		socket.to(socketId).emit(SocketEvent.SYNC_DRAWING, { snapshot })
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

app.get("/", (req: Request, res: Response) => {
	// Send the index.html file
	res.sendFile(path.join(__dirname, "..", "public", "index.html"))
})

server.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`)
})
