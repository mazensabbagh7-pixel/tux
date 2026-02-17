import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Component } from "react";
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.handleReset = () => {
            this.setState({ hasError: false, error: null, errorInfo: null });
        };
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error, errorInfo: null };
    }
    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.setState({
            error,
            errorInfo,
        });
    }
    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (_jsxs("div", { className: "bg-error-bg-dark border-danger-soft text-danger-soft m-5 rounded border p-5", children: [_jsxs("h3", { className: "m-0 mb-2.5 text-base", children: ["Something went wrong", this.props.workspaceInfo && ` in ${this.props.workspaceInfo}`] }), this.state.error && (_jsxs("pre", { className: "my-2.5 rounded-sm bg-black/30 p-2.5 text-xs break-all whitespace-pre-wrap", children: [this.state.error.toString(), this.state.errorInfo && (_jsxs(_Fragment, { children: [_jsx("br", {}), this.state.errorInfo.componentStack] }))] })), _jsx("button", { onClick: this.handleReset, className: "bg-danger-soft hover:bg-info-light cursor-pointer rounded-sm border-none px-4 py-2 text-sm text-white", children: "Reset" })] }));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=ErrorBoundary.js.map