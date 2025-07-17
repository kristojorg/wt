#!/usr/bin/env bun

import { spawn } from "bun";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const WORKTREES_DIR = ".worktrees";

interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  current: boolean;
}

async function execCommand(command: string, args: string[] = []): Promise<{ stdout: string; stderr: string; success: boolean }> {
  const proc = spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
  const result = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, success: result === 0 };
}

async function getCurrentBranch(): Promise<string> {
  const result = await execCommand("git", ["branch", "--show-current"]);
  return result.stdout.trim();
}

async function getWorktrees(): Promise<WorktreeInfo[]> {
  const result = await execCommand("git", ["worktree", "list", "--porcelain"]);
  if (!result.success) return [];

  const worktrees: WorktreeInfo[] = [];
  const lines = result.stdout.split("\n");
  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        worktrees.push(current as WorktreeInfo);
      }
      current = { path: line.substring(9) };
    } else if (line.startsWith("branch ")) {
      current.branch = line.substring(7);
    } else if (line === "bare") {
      current.current = false;
    } else if (line === "detached") {
      current.branch = "detached";
    } else if (line === "") {
      if (current.path) {
        current.name = current.path.split("/").pop() || "";
        current.current = current.path === process.cwd();
        worktrees.push(current as WorktreeInfo);
        current = {};
      }
    }
  }

  if (current.path) {
    current.name = current.path.split("/").pop() || "";
    current.current = current.path === process.cwd();
    worktrees.push(current as WorktreeInfo);
  }

  return worktrees;
}

async function createWorktree(name: string): Promise<void> {
  if (!existsSync(WORKTREES_DIR)) {
    mkdirSync(WORKTREES_DIR, { recursive: true });
  }

  const worktreePath = join(WORKTREES_DIR, name);
  
  if (existsSync(worktreePath)) {
    console.error(`Worktree '${name}' already exists`);
    process.exit(1);
  }

  const result = await execCommand("git", ["worktree", "add", "-b", name, worktreePath]);
  
  if (!result.success) {
    console.error(`Failed to create worktree: ${result.stderr}`);
    process.exit(1);
  }

  console.log(`Created worktree '${name}' at ${worktreePath}`);
}

async function listWorktrees(): Promise<void> {
  const worktrees = await getWorktrees();
  
  if (worktrees.length === 0) {
    console.log("No worktrees found");
    return;
  }

  console.log("Worktrees:");
  for (const wt of worktrees) {
    const indicator = wt.current ? "* " : "  ";
    console.log(`${indicator}${wt.name} -> ${wt.branch} (${wt.path})`);
  }
}

async function switchWorktree(name: string): Promise<void> {
  const worktreePath = join(WORKTREES_DIR, name);
  
  if (!existsSync(worktreePath)) {
    console.error(`Worktree '${name}' does not exist`);
    process.exit(1);
  }

  console.log(`Switching to worktree '${name}' at ${worktreePath}`);
  console.log(`Run: cd ${worktreePath}`);
}

async function removeWorktree(name: string): Promise<void> {
  const worktreePath = join(WORKTREES_DIR, name);
  
  if (!existsSync(worktreePath)) {
    console.error(`Worktree '${name}' does not exist`);
    process.exit(1);
  }

  const result = await execCommand("git", ["worktree", "remove", worktreePath]);
  
  if (!result.success) {
    console.error(`Failed to remove worktree: ${result.stderr}`);
    process.exit(1);
  }

  console.log(`Removed worktree '${name}'`);
}

function showHelp(): void {
  console.log(`
Usage: wt <command> [options]

Commands:
  create <name>    Create a new worktree with the given name
  list             List all worktrees
  switch <name>    Switch to the specified worktree
  remove <name>    Remove the specified worktree
  help             Show this help message

Examples:
  wt create feature-branch
  wt list
  wt switch feature-branch
  wt remove feature-branch
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help") {
    showHelp();
    return;
  }

  switch (command) {
    case "create":
      if (!args[1]) {
        console.error("Error: worktree name is required");
        process.exit(1);
      }
      await createWorktree(args[1]);
      break;
    
    case "list":
      await listWorktrees();
      break;
    
    case "switch":
      if (!args[1]) {
        console.error("Error: worktree name is required");
        process.exit(1);
      }
      await switchWorktree(args[1]);
      break;
    
    case "remove":
      if (!args[1]) {
        console.error("Error: worktree name is required");
        process.exit(1);
      }
      await removeWorktree(args[1]);
      break;
    
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(console.error);