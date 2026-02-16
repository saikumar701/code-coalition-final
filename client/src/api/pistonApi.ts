import axios, { AxiosInstance } from "axios"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"
const pistonBaseUrl = `${BACKEND_URL}/api/piston`

const instance: AxiosInstance = axios.create({
    baseURL: pistonBaseUrl,
    headers: {
        "Content-Type": "application/json",
    },
})

export default instance
