# Dewwie PowerShell Collaboration Profile
function broadcast($msg, $target = "@all") {
    dewwie.exe room send "$msg" --target $target
}
function ask-lead($msg) {
    dewwie.exe room send "$msg" --target "@lead" --type "review_request"
}
function status-report($state, $msg) {
    dewwie.exe status "$state" "$msg"
}
function mesh-status {
    dewwie.exe room agents
}
function mesh-listen {
    dewwie.exe room list
}
