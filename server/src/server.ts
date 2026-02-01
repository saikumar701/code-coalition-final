import express, { Response, Request } from "express"
import dotenv from "dotenv"
import http from "http"
import cors from "cors"
import { SocketEvent, SocketId } from "./types/socket"
import { USER_CONNECTION_STATUS, User } from "./types/user"
import { Server } from "socket.io"
import path from "path"
import vm from "vm"

dotenv.config()

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
const terminalContexts = new Map<SocketId, vm.Context>()

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

const formatValue = (value: unknown): string => {
	if (typeof value === "string") return value
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

const createSandboxContext = () => {
	return vm.createContext({
		Math,
		Number,
		String,
		Boolean,
		BigInt,
		Date,
		JSON,
		Array,
		Object,
		Map,
		Set,
		WeakMap,
		WeakSet,
	})
}

const ensureTerminalContext = (socketId: SocketId) => {
	if (!terminalContexts.has(socketId)) {
		terminalContexts.set(socketId, createSandboxContext())
	}
	return terminalContexts.get(socketId) as vm.Context
}

io.on("connection", (socket) => {
	console.log('✅ NEW CONNECTION:', socket.id)
	
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
		terminalContexts.delete(socket.id)
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
		socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user })
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
		if (typeof input !== "string") return
		const command = input.trim()
		if (!command.length) return

		const sandbox = ensureTerminalContext(socket.id)
		const lines: string[] = []
		const pushLine = (line: string) => {
			line.split(/\r?\n/).forEach((chunk) => lines.push(chunk))
		}

		const consoleProxy = {
			log: (...args: unknown[]) =>
				pushLine(args.map((arg) => formatValue(arg)).join(" ")),
			error: (...args: unknown[]) =>
				pushLine(args.map((arg) => formatValue(arg)).join(" ")),
			warn: (...args: unknown[]) =>
				pushLine(args.map((arg) => formatValue(arg)).join(" ")),
		}

		// Attach a minimal console implementation to the sandbox
		;(sandbox as vm.Context & { console: Console }).console =
			consoleProxy as unknown as Console

		try {
			const script = new vm.Script(command)
			const result = script.runInContext(sandbox, { timeout: 1000 })
			if (result !== undefined) {
				pushLine(`=> ${formatValue(result)}`)
			}
			socket.emit(SocketEvent.TERMINAL_OUTPUT, { lines })
		} catch (error) {
			socket.emit(SocketEvent.TERMINAL_OUTPUT, {
				lines: [`Error: ${(error as Error).message}`],
				isError: true,
			})
		}
	})

	socket.on(SocketEvent.TERMINAL_RESET, () => {
		terminalContexts.set(socket.id, createSandboxContext())
		socket.emit(SocketEvent.TERMINAL_OUTPUT, { lines: ["Session cleared."] })
	})
})

const PORT = process.env.PORT || 3000

// Copilot API proxy endpoint
app.post("/api/copilot/generate", async (req: Request, res: Response) => {
	try {
		const { messages, model } = req.body
		
		if (!process.env.OPENAI_API_KEY) {
			console.error("OpenAI API key not configured")
			return res.status(400).json({ error: "API key not configured" })
		}

		console.log("Sending request to OpenAI API with model:", model)
		
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
				messages,
				model: model || "gpt-3.5-turbo",
				temperature: 0.7,
				max_tokens: 2000,
			}),
		})

		if (!response.ok) {
			const errorData = await response.json()
			console.error("OpenAI API error:", response.status, errorData)
			return res.status(response.status).json({ error: errorData.error?.message || "API request failed" })
		}

		const data = await response.json()
		console.log("OpenAI API response received")
		res.json(data)
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