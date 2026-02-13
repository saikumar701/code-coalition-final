import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { useState } from "react";

type ProblemSeverity = "error" | "warning" | "info";

interface Problem {
    id: string;
    severity: ProblemSeverity;
    message: string;
    file: string;
    line: number;
    column: number;
}

const Problems = () => {
    // Example problems - replace with actual problem detection
    const [problems] = useState<Problem[]>([
        // Uncomment to test with sample problems
        // {
        //     id: "1",
        //     severity: "error",
        //     message: "Cannot find module 'react'",
        //     file: "src/App.tsx",
        //     line: 1,
        //     column: 20,
        // },
        // {
        //     id: "2",
        //     severity: "warning",
        //     message: "Variable 'x' is declared but never used",
        //     file: "src/components/Test.tsx",
        //     line: 15,
        //     column: 10,
        // },
    ]);

    const errorCount = problems.filter((p) => p.severity === "error").length;
    const warningCount = problems.filter((p) => p.severity === "warning").length;
    const infoCount = problems.filter((p) => p.severity === "info").length;

    const getSeverityIcon = (severity: ProblemSeverity) => {
        switch (severity) {
            case "error":
                return <AlertCircle size={14} className="text-red-500" />;
            case "warning":
                return <AlertTriangle size={14} className="text-yellow-500" />;
            case "info":
                return <Info size={14} className="text-blue-500" />;
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#1E1E1E]">
            {/* Problems Header */}
            <div className="flex items-center justify-between bg-[#252526] border-b border-gray-700 px-3 py-2">
                <div className="flex items-center gap-3">
                    <AlertCircle size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-400 font-medium">Problems</span>
                    
                    {problems.length > 0 && (
                        <div className="flex items-center gap-3 text-xs">
                            {errorCount > 0 && (
                                <span className="flex items-center gap-1 text-red-400">
                                    <AlertCircle size={12} />
                                    {errorCount}
                                </span>
                            )}
                            {warningCount > 0 && (
                                <span className="flex items-center gap-1 text-yellow-400">
                                    <AlertTriangle size={12} />
                                    {warningCount}
                                </span>
                            )}
                            {infoCount > 0 && (
                                <span className="flex items-center gap-1 text-blue-400">
                                    <Info size={12} />
                                    {infoCount}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Problems List */}
            <div className="flex-1 overflow-y-auto">
                {problems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <CheckCircle size={32} className="text-green-500 mb-2" />
                        <p className="text-sm font-medium">No problems detected</p>
                        <p className="text-xs text-gray-600 mt-1">
                            Your code is looking good!
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {problems.map((problem) => (
                            <div
                                key={problem.id}
                                className="px-3 py-2 hover:bg-[#252526] cursor-pointer transition-colors"
                            >
                                <div className="flex items-start gap-2">
                                    {getSeverityIcon(problem.severity)}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-300">
                                            {problem.message}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {problem.file} [{problem.line}, {problem.column}]
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Problems;