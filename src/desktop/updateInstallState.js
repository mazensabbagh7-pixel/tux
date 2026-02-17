/**
 * Shared flag so the main-process quit handler can detect an
 * update-driven quit and skip the event.preventDefault() that
 * would otherwise block autoUpdater.quitAndInstall().
 */
let updateInstallInProgress = false;
export function markUpdateInstallInProgress() {
    updateInstallInProgress = true;
}
export function clearUpdateInstallInProgress() {
    updateInstallInProgress = false;
}
export function isUpdateInstallInProgress() {
    return updateInstallInProgress;
}
//# sourceMappingURL=updateInstallState.js.map