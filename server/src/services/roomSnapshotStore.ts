type MongoCollection = {
	createIndex: (
		indexSpec: Record<string, 1 | -1>,
		options?: Record<string, unknown>,
	) => Promise<unknown>
	updateOne: (
		filter: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: Record<string, unknown>,
	) => Promise<unknown>
	findOne: (filter: Record<string, unknown>) => Promise<{ fileTree?: unknown } | null>
}

type MongoDatabase = {
	collection: (name: string) => MongoCollection
}

type MongoClientLike = {
	connect: () => Promise<void>
	db: (name: string) => MongoDatabase
}

type MongoModule = {
	MongoClient: new (uri: string, options?: Record<string, unknown>) => MongoClientLike
}

let snapshotCollection: MongoCollection | null = null
let initialized = false

export async function initializeRoomSnapshotStore(): Promise<void> {
	if (initialized) return
	initialized = true

	const uri = (process.env.MONGODB_URI || "").trim()
	if (!uri) {
		console.log("Room snapshot persistence disabled (MONGODB_URI is not set).")
		return
	}

	try {
		const mongodb = require("mongodb") as MongoModule
		const client = new mongodb.MongoClient(uri)
		await client.connect()

		const dbName = (process.env.MONGODB_DB_NAME || "code_coalition").trim()
		const collectionName = (process.env.MONGODB_COLLECTION_ROOMS || "room_snapshots").trim()

		snapshotCollection = client.db(dbName).collection(collectionName)
		await snapshotCollection.createIndex({ roomId: 1 }, { unique: true })
		console.log(
			`Room snapshot persistence enabled (MongoDB: ${dbName}.${collectionName}).`,
		)
	} catch (error) {
		snapshotCollection = null
		console.error("Failed to initialize MongoDB room snapshot store:", error)
	}
}

export async function saveRoomSnapshot<T>(roomId: string, fileTree: T): Promise<void> {
	if (!snapshotCollection) return

	try {
		await snapshotCollection.updateOne(
			{ roomId },
			{
				$set: {
					roomId,
					fileTree,
					updatedAt: new Date(),
				},
			},
			{ upsert: true },
		)
	} catch (error) {
		console.error(`Failed to save room snapshot for ${roomId}:`, error)
	}
}

export async function loadRoomSnapshot<T>(roomId: string): Promise<T | null> {
	if (!snapshotCollection) return null

	try {
		const record = await snapshotCollection.findOne({ roomId })
		if (!record || !record.fileTree) return null
		return record.fileTree as T
	} catch (error) {
		console.error(`Failed to load room snapshot for ${roomId}:`, error)
		return null
	}
}

