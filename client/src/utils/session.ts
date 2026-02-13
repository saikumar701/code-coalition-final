const CLIENT_SESSION_ID_KEY = "code-coalition:session-id"

function generateSessionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID()
	}

	return `sess-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

export function getClientSessionId(): string {
	if (typeof window === "undefined") {
		return "server-session"
	}

	const existingSessionId = sessionStorage.getItem(CLIENT_SESSION_ID_KEY)
	if (existingSessionId) {
		return existingSessionId
	}

	const nextSessionId = generateSessionId()
	sessionStorage.setItem(CLIENT_SESSION_ID_KEY, nextSessionId)
	return nextSessionId
}
