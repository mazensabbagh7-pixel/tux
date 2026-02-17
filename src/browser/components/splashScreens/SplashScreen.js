import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@/browser/components/ui/dialog";
import { Button } from "@/browser/components/ui/button";
export function SplashScreen(props) {
    const handlePrimaryAction = () => {
        if (!props.primaryAction) {
            return;
        }
        props.primaryAction.onClick();
        if (props.dismissOnPrimaryAction !== false) {
            props.onDismiss();
        }
    };
    return (_jsx(Dialog, { open: true, onOpenChange: (open) => !open && props.onDismiss(), children: _jsxs(DialogContent, { maxWidth: "500px", onInteractOutside: (e) => e.preventDefault(), children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: props.title }) }), props.children, _jsx(DialogFooter, { className: props.footerClassName, children: props.footer ?? (_jsxs(_Fragment, { children: [props.primaryAction && (_jsx(Button, { onClick: handlePrimaryAction, disabled: props.primaryAction.disabled === true, children: props.primaryAction.label })), props.dismissLabel !== null && (_jsx(Button, { variant: "secondary", onClick: props.onDismiss, children: props.dismissLabel ?? "Got it" }))] })) })] }) }));
}
//# sourceMappingURL=SplashScreen.js.map