#!/usr/bin/env bun

import { Args, Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Command as PlatformCommand } from "@effect/platform";
import { Console, Effect } from "effect";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const WORKTREES_DIR = ".worktrees";

interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  current: boolean;
}

const execCommand = (command: string, args: string[] = []) =>
  PlatformCommand.make(command, ...args).pipe(
    PlatformCommand.string,
    Effect.map((output) => output.trim()),
    Effect.orElse(() => Effect.succeed(""))
  );

const getWorktrees = Effect.gen(function* () {
  const output = yield* execCommand("git", ["worktree", "list", "--porcelain"]);
  if (!output) return [];

  const worktrees: WorktreeInfo[] = [];
  const lines = output.split("\n");
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
});

const nameArg = Args.text({ name: "name" });

const createCommand = Command.make("create", { name: nameArg }, ({ name }) =>
  Effect.gen(function* () {
    if (!existsSync(WORKTREES_DIR)) {
      mkdirSync(WORKTREES_DIR, { recursive: true });
    }

    const worktreePath = join(WORKTREES_DIR, name);
    
    if (existsSync(worktreePath)) {
      yield* Console.error(`Worktree '${name}' already exists`);
      yield* Effect.fail(new Error(`Worktree '${name}' already exists`));
    }

    yield* execCommand("git", ["worktree", "add", "-b", name, worktreePath]);
    yield* Console.log(`Created worktree '${name}' at ${worktreePath}`);
  })
);

const listCommand = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const worktrees = yield* getWorktrees;
    
    if (worktrees.length === 0) {
      yield* Console.log("No worktrees found");
      return;
    }

    yield* Console.log("Worktrees:");
    for (const wt of worktrees) {
      const indicator = wt.current ? "* " : "  ";
      yield* Console.log(`${indicator}${wt.name} -> ${wt.branch} (${wt.path})`);
    }
  })
);

const switchCommand = Command.make("switch", { name: nameArg }, ({ name }) =>
  Effect.gen(function* () {
    const worktreePath = join(WORKTREES_DIR, name);
    
    if (!existsSync(worktreePath)) {
      yield* Console.error(`Worktree '${name}' does not exist`);
      yield* Effect.fail(new Error(`Worktree '${name}' does not exist`));
    }

    yield* Console.log(`Switching to worktree '${name}' at ${worktreePath}`);
    yield* Console.log(`Run: cd ${worktreePath}`);
  })
);

const removeCommand = Command.make("remove", { name: nameArg }, ({ name }) =>
  Effect.gen(function* () {
    const worktreePath = join(WORKTREES_DIR, name);
    
    if (!existsSync(worktreePath)) {
      yield* Console.error(`Worktree '${name}' does not exist`);
      yield* Effect.fail(new Error(`Worktree '${name}' does not exist`));
    }

    yield* execCommand("git", ["worktree", "remove", worktreePath]);
    yield* Console.log(`Removed worktree '${name}'`);
  })
);

const wtCommand = Command.make("wt", {}, () =>
  Console.log("wt - Git worktree utility\n\nUse 'wt --help' for more information")
).pipe(
  Command.withSubcommands([createCommand, listCommand, switchCommand, removeCommand])
);

const cli = Command.run(wtCommand, {
  name: "wt - Git worktree utility",
  version: "1.0.0"
});

cli(process.argv).pipe(
  Effect.provide(BunContext.layer),
  BunRuntime.runMain
);