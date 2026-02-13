interface RenderOutputProps {
    output: string;
}

const RenderOutput: React.FC<RenderOutputProps> = ({ output }) => {

    const trimmed = output.trim().toLowerCase();

    const isHTML =
        trimmed.includes('<html') ||
        trimmed.includes('<!doctype') ||
        trimmed.includes('<body');

    if (isHTML) {
        return (
            <div className="w-full h-full bg-white">
                <iframe
                    srcDoc={output}
                    className="w-full h-full border-0"
                    title="Output"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-auto bg-[#1E1E1E]">
            <div className="p-4 font-mono text-sm text-gray-300 whitespace-pre-wrap break-words min-h-full">
                {output}
            </div>
        </div>
    );
};

export default RenderOutput;
