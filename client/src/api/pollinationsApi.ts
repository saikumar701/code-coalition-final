import axios, { AxiosInstance } from "axios"

const axiosInstance: AxiosInstance = axios.create({
    baseURL: "https://api.pollinations.ai/v1",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_POLLINATIONS_API_KEY}`,
    },
})

export default axiosInstance
