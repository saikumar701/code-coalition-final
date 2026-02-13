import { useEffect } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import GitHubCorner from "./components/GitHubCorner";
import Toast from "./components/toast/Toast";
import { RunCodeContextProvider } from "./context/RunCodeContext";
import useUserActivity from "./hooks/useUserActivity";
import EditorPage from "./pages/EditorPage";
import HomePage from "./pages/HomePage";

const App = () => {
    // Register socket listeners for user presence/cursor updates once at the app level.
    useUserActivity();

    useEffect(() => {
        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
        };

        window.addEventListener("dragover", handleDragOver);
        window.addEventListener("drop", handleDrop);

        return () => {
            window.removeEventListener("dragover", handleDragOver);
            window.removeEventListener("drop", handleDrop);
        };
    }, []);

    return (
        <RunCodeContextProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/editor/:roomId" element={<EditorPage />} />
                </Routes>
            </Router>
            <Toast /> {/* Toast component from react-hot-toast */}
            <GitHubCorner />
        </RunCodeContextProvider>
    );
};

export default App;