package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	cyan  = "\033[1;36m"
	green = "\033[1;32m"
	dim   = "\033[2m"
	reset = "\033[0m"
	bold  = "\033[1m"
)

func main() {
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	baseDir := filepath.Dir(exePath)

	// If subcommands are passed, route to CLI commands
	if len(os.Args) > 1 {
		arg1 := os.Args[1]
		if arg1 == "help" || arg1 == "--help" || arg1 == "-h" {
			printHelp()
			return
		}

		// Check for dewwie.py or swarmherd.py
		cliScript := filepath.Join(baseDir, "cli", "dewwie.py")
		if _, err := os.Stat(cliScript); os.IsNotExist(err) {
			cliScript = filepath.Join(baseDir, "swarmherd", "cli", "swarmherd.py")
		}
		if _, err := os.Stat(cliScript); err == nil {
			pyArgs := append([]string{cliScript}, os.Args[1:]...)
			cmd := exec.Command("python", pyArgs...)
			cmd.Stdin = os.Stdin
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			if err := cmd.Run(); err != nil {
				os.Exit(1)
			}
			return
		}
	}

	// Default: Launch the standalone Native Windows Desktop Software Window
	desktopDir := filepath.Join(baseDir, "desktop-ui")
	if _, err := os.Stat(desktopDir); os.IsNotExist(err) {
		desktopDir = filepath.Join(baseDir, "swarmherd", "desktop-ui")
	}

	fmt.Printf("\n%s==========================================================%s\n", cyan, reset)
	fmt.Printf("%s   DEWWIE - AUTONOMOUS AI AGENT IDE & TERMINAL           %s\n", bold, reset)
	fmt.Printf("%s==========================================================%s\n\n", cyan, reset)
	fmt.Printf("  %s• Engine:%s   Native WinPTY + Real-time OSC 7501 Protocol\n", green, reset)
	fmt.Printf("  %s• Isolation:%s Parallel Git Worktrees with Dynamic Ports\n", green, reset)
	fmt.Printf("  %s• Storage:%s   Persistent Session Scrollback\n", green, reset)
	fmt.Printf("\n%s▶ Launching Dewwie Desktop Software...%s\n\n", cyan, reset)

	// Fast direct binary execution path with robust multi-location fallback
	candidatePaths := []string{
		filepath.Join(desktopDir, "node_modules", "electron", "dist", "electron.exe"),
		filepath.Join(`D:\1111-Works\Dewwie\desktop-ui`, "node_modules", "electron", "dist", "electron.exe"),
		filepath.Join(`D:\1111-Works\exbytelab\desktop-ui`, "node_modules", "electron", "dist", "electron.exe"),
	}

	var electronBin string
	for _, p := range candidatePaths {
		if _, err := os.Stat(p); err == nil {
			electronBin = p
			break
		}
	}

	var cmd *exec.Cmd
	if electronBin != "" {
		cmd = exec.Command(electronBin, ".")
	} else {
		cmd = exec.Command("cmd.exe", "/c", "npx", "electron", ".")
	}
	cmd.Dir = desktopDir
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		fmt.Printf("Error launching desktop app: %v\n", err)
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Printf(`Dewwie - Autonomous AI Agent IDE & Terminal Workspace

USAGE:
  dewwie.exe                     Launch Standalone Native Desktop Application
  dewwie.exe ls                  List active worktrees, agents, and ports
  dewwie.exe delegate "<task>"   Autonomously decompose & delegate task to Herdr agent in isolated worktree
  dewwie.exe wait <session>       Await background agent completion and inspect diff
  dewwie.exe room [subcommand]   Live Agent Room Mesh (send/listen/status)
  dewwie.exe spawn <name>        Spawn a new isolated agent worktree or local session
  dewwie.exe open <name>         Open worktree in external IDE (Cursor/Zed/VS Code)
  dewwie.exe diff <name>         View code changes against main
  dewwie.exe send <id> <input>   Deliver interactive input to running agent session
`)
}
