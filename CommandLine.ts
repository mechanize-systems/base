/**
 * CLI argument parser
 */

import * as util from "util";
import * as pp from "prettier-printer";
import * as Lang from "./Lang.js";

export type OptSpec = {
  readonly name: string;
  readonly shortName?: string;
  readonly doc?: string;
  readonly docv?: string;
  readonly env?: string;
};

export type Opt<T> = OptSpec & {
  readonly type: "Opt";
  readonly action: "string" | "boolean" | ((value: string) => T);
};

/** Define an option. */
export function option(spec: OptSpec): Opt<string> {
  return { ...spec, type: "Opt", action: "string" };
}

/** Define an option which computes to a value using `action`. */
export function optionAnd<T>(
  spec: OptSpec,
  action: (value: string) => T
): Opt<T> {
  return { ...spec, type: "Opt", action };
}

/** Define a flag (boolean option). */
export function optionFlag(spec: OptSpec): Opt<boolean> {
  return { ...spec, type: "Opt", action: "boolean" };
}

type OptionRepeating<T> = {
  readonly type: "OptionRepeating";
  opt: Opt<T>;
};

/** Allow to repeat option multiple times. */
export function optionRepeating<T>(opt: Opt<T>): OptionRepeating<T> {
  return { type: "OptionRepeating", opt };
}

type AnyOpt = Opt<any> | OptionRepeating<any>;

export type ArgSpec = {
  readonly doc?: string;
  readonly docv?: string;
};

export type Arg<T> = ArgSpec & {
  readonly action: "string" | ((value: string) => T);
};

type AnyArg = Arg<any>;

/** Define an argument. */
export function arg(spec: ArgSpec): Arg<string> {
  return { ...spec, action: "string" };
}

/** Define an argument which computes to a value using `action`. */
export function argAnd<T>(spec: ArgSpec, action: (value: string) => T): Arg<T> {
  return { ...spec, action };
}

export type Cmd<
  A extends readonly Arg<any>[],
  RA extends Arg<any> | null,
  O extends { [name: string]: AnyOpt },
  C extends { [name: string]: AnyCmd }
> = {
  readonly name: string;
  readonly doc?: string;
  readonly args?: A;
  readonly argsRest?: RA;
  readonly opts?: O;
  readonly cmds?: C;
};

// Only for use in type constraints
type AnyCmd = Cmd<any, any, any, any>;

export type CmdAction<C extends AnyCmd> = (
  this: { name: string; cmd: C },
  opts: CmdOptsResult<C>,
  ...args: CmdArgsResult<C>
) => void;

/** Define a command. */
export function cmd<
  A extends AnyArg[],
  RA extends AnyArg,
  C extends Cmd<Lang.NarrowTuple<A>, RA, any, any>
>(spec: C, action?: CmdAction<C>): C {
  if (action == null) action = defaultCmdAction;
  if (spec.opts?.help == null) {
    spec = { ...spec, opts: { ...spec.opts, help: defaultHelpOption } };
  }
  return { ...spec, action };
}

let defaultCmdAction: CmdAction<AnyCmd> = function (opts, ...args) {
  console.log("no action for command", {
    name: this.name,
    cmd: this.cmd,
    opts,
    args,
  });
};

let defaultHelpOption = optionFlag({
  name: "help",
  shortName: "h",
  doc: "Show this message and exit",
});

type CmdArgsResult<C> = C extends Cmd<[], null, infer _O, infer _C>
  ? []
  : C extends Cmd<infer A, null, infer _O, infer _C>
  ? [...{ [K in keyof A]: ArgResult<A[K]> }]
  : C extends Cmd<infer A, infer RA, infer _O, infer _C>
  ? [...{ [K in keyof A]: ArgResult<A[K]> }, ...ArgResult<RA>[]]
  : never;

type ArgResult<A> = A extends Arg<infer T> ? T : never;

type OptResult<O> = O extends Opt<infer T>
  ? T
  : O extends OptionRepeating<infer T>
  ? T[]
  : never;

type OptsResult<O extends { [name: string]: AnyOpt }> = {
  [K in keyof O]: OptResult<O[K]>;
};

type CmdOptsResult<C> = C extends Cmd<infer _A, infer _RA, never, infer _C>
  ? {}
  : C extends Cmd<infer _A, infer _RA, infer O, infer _C>
  ? OptsResult<O>
  : never;

type NextCmds<C> = C extends Cmd<infer _A, infer _RA, infer _O, infer C>
  ? C
  : never;

type NextCmdResult<C extends AnyCmd> = {
  [K in keyof NextCmds<C>]: { name: K } & CmdResult<NextCmds<C>[K]>;
};

type CmdResult<C extends AnyCmd> = {
  readonly cmd: C;
  readonly cmds: AnyCmd[];
  readonly args: CmdArgsResult<C>;
  readonly opts: CmdOptsResult<C>;
  readonly next: null | NextCmdResult<C>[keyof NextCmds<C>];
};

class CommandLineError extends Error {
  cmds: AnyCmd[];
  constructor(cmds: AnyCmd[], msg: string) {
    super(msg);
    this.cmds = cmds;
  }
}

class UserError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/** Print usage line, error message, then exit the program. */
export function error(msg: string) {
  throw new UserError(msg);
}

/** Parse the provided arguments given the command definition. */
export function parse<C extends AnyCmd>(argv: string[], cmd: C): CmdResult<C> {
  let { tokens } = util.parseArgs({
    args: argv,
    tokens: true,
    allowPositionals: true,
    strict: false,
  });
  return parse1(cmd, [cmd], tokens) as CmdResult<C>;
}

// TODO: this should really be in @types/node
type ParseConfig = { tokens: true; allowPositionals: true; strict: false };
type ParseArgs = typeof util.parseArgs<ParseConfig>;
type ParsedTokens = ReturnType<ParseArgs>["tokens"];

function parse1(
  cmd: AnyCmd,
  cmds: AnyCmd[],
  tokens: ParsedTokens
): CmdResult<AnyCmd> {
  let args: Arg<any>[] = cmd.args == null ? [] : [...cmd.args];
  let argsRest: Arg<any> | null = cmd.argsRest != null ? cmd.argsRest : null;
  let opts: { [name: string]: { key: string; opt: AnyOpt } } = {};
  for (let key in cmd.opts) {
    let opt = cmd.opts[key];
    opts[key] = { key, opt };
    if (opt.shortName != null) opts[opt.shortName] = { key, opt };
  }

  let optsValues: { [name: string]: unknown } = {};
  let argsValues: string[] = [];
  let next: null | NextCmdResult<AnyCmd> = null;

  function addOptValue(opt: AnyOpt, key: string, value: any) {
    if (opt.type === "OptionRepeating") {
      let existing = (optsValues[key] ?? []) as unknown as unknown[];
      existing.push(value);
    } else {
      optsValues[key] = value;
    }
  }

  while (tokens.length > 0) {
    let tok = tokens[0];
    switch (tok.kind) {
      case "option": {
        tokens.shift();
        let optAndKey = opts[tok.name];
        if (optAndKey == null)
          throw new CommandLineError(cmds, `unknown option --${tok.name}`);
        let { opt: maybeOpt, key } = optAndKey;
        let opt: Opt<any> =
          maybeOpt.type === "OptionRepeating" ? maybeOpt.opt : maybeOpt;
        if (opt.action === "boolean" && opt.name === "help") {
          let name = cmds.map((cmd) => cmd.name).join(" ");
          printHelp(cmd, name);
          process.exit(0);
        } else if (opt.action === "boolean") addOptValue(maybeOpt, key, true);
        else if (tok.value != null) addOptValue(maybeOpt, key, tok.value);
        else {
          if (tokens[0]?.kind !== "positional")
            throw new CommandLineError(
              cmds,
              `missing value for option --${tok.name}`
            );
          let value = (tokens.shift() as { value: string }).value;
          if (opt.action === "string") addOptValue(maybeOpt, key, value);
          else addOptValue(maybeOpt, key, opt.action(value));
        }
        break;
      }
      case "positional":
        if (args.length > 0) {
          tokens.shift();
          args.shift();
          argsValues.push(tok.value);
        } else if (argsRest != null) {
          tokens.shift();
          argsValues.push(tok.value);
        } else {
          if (cmd.cmds == null)
            throw new CommandLineError(cmds, "extra position argument");
          let nextCmd: AnyCmd | null = cmd.cmds[tok.value];
          if (nextCmd == null)
            throw new CommandLineError(cmds, `unknown subcommand ${tok.value}`);
          tokens.shift();
          next = {
            name: tok.value,
            ...parse1(nextCmd, cmds.concat(nextCmd), tokens),
          } as any;
        }
        break;
      case "option-terminator":
        throw new CommandLineError(cmds, "TODO");
      default:
        Lang.never(tok);
    }
  }

  if (args.length > 0)
    throw new CommandLineError(cmds, `missing ${args[0].docv} argument`);

  // Add missing options
  for (let name in opts) {
    let { opt, key } = opts[name];
    if (optsValues[key] == null) {
      if (opt.type === "OptionRepeating") {
        if (opt.opt.env != null) {
          let envval = process.env[opt.opt.env];
          if (envval != null) addOptValue(opt, key, envval);
        } else optsValues[key] = [];
      } else if (opt.type === "Opt" && opt.action === "boolean")
        if (opt.env != null) {
          let envval = (process.env[opt.env] ?? "false").toLowerCase();
          optsValues[key] =
            envval !== "no" &&
            envval !== "off" &&
            envval !== "0" &&
            envval !== "false";
        } else optsValues[key] = false;
    } else if (opt.type === "Opt")
      if (opt.env != null) {
        let envval = process.env[opt.env];
        if (envval != null) addOptValue(opt, key, envval);
      }
  }

  return {
    cmd,
    cmds,
    opts: optsValues,
    args: argsValues,
    next,
  } as CmdResult<AnyCmd>;
}

/** Run the command with the provided arguments. */
export async function run<C extends AnyCmd>(
  argv: string[],
  cmd: C
): Promise<void> {
  try {
    let res: null | CmdResult<C> = null;
    try {
      res = parse(argv, cmd);
    } catch (err) {
      if (err instanceof CommandLineError) {
        let name = err.cmds.map((cmd) => cmd.name).join(" ");
        console.log(printUsage(err.cmds[err.cmds.length - 1], name));
        console.log(`error: ${err.message}`);
        process.exit(1);
      } else {
        throw err;
      }
    }
    while (res.next != null) res = res.next;
    await runAction(res.cmd.name ?? process.argv[1], res.cmd, res);
  } catch (err) {
    if (err instanceof UserError) {
      console.log(`error: ${err.message}`);
    } else {
      console.log(err);
    }
    process.exit(1);
  }
}

export async function runAction<C extends AnyCmd>(
  name: string,
  cmd: C,
  res: CmdResult<C>
): Promise<void> {
  let action: CmdAction<C> = (cmd as any).action;
  return action.call({ name, cmd }, res.opts, ...res.args);
}

/** Print usage message for the command. */
export function printUsage(cmd: AnyCmd, name?: string) {
  let width = Math.min(process.stdout.columns, 79);
  console.log(pp.render(width, ppUsage(cmd, name)));
}

/** Print help message for the command. */
export function printHelp(cmd: AnyCmd, name?: string) {
  let width = Math.min(process.stdout.columns, 79);
  console.log(pp.render(width, ppHelp(cmd, name)));
}

function ppUsage(cmd: AnyCmd, name?: string): pp.IDoc {
  let hasCommands = cmd.cmds != null && Object.keys(cmd.cmds).length > 0;
  let usage = `usage: ${name ?? cmd.name} [OPTIONS]`;
  if (hasCommands) usage = `${usage} COMMAND`;
  if (cmd.args != null) {
    let args = cmd.args
      .map((arg: Arg<any>, idx: number) => arg.docv ?? `ARG${idx}`)
      .join(" ");
    usage = `${usage} ${args}`;
  }
  if (cmd.argsRest != null) {
    let argsRest = `${cmd.argsRest.docv ?? "ARG"}...`;
    usage = `${usage} ${argsRest}`;
  }
  return usage;
}

function ppOptName(opt: Opt<any>) {
  return opt.shortName != null
    ? `--${opt.name}, -${opt.shortName}`
    : `--${opt.name}`;
}

function ppOptDoc(opt: Opt<any>): pp.IDoc {
  if (opt.env == null) return opt.doc ?? "";
  let doc = opt.doc ?? "";
  return [ppText(doc), pp.line, ppText(``)];
}

function ppHelp(cmd: AnyCmd, name?: string): pp.IDoc {
  let doc: pp.IDocArray = [];
  let hasCommands = cmd.cmds != null && Object.keys(cmd.cmds).length > 0;
  let hasOptions = cmd.opts != null && Object.keys(cmd.opts).length > 0;
  doc.push(ppUsage(cmd, name));
  if (cmd.doc != null) {
    doc.push(pp.lineBreak);
    doc.push(pp.lineBreak);
    doc.push(ppText(cmd.doc));
  }
  if (hasOptions) {
    doc.push(pp.lineBreak);
    doc.push(pp.lineBreak);
    doc.push("OPTIONS:");
    let rows: [string, pp.IDoc][] = [];
    for (let key in cmd.opts) {
      let opt: AnyOpt = cmd.opts[key];
      let name: string;
      let doc: pp.IDoc;
      if (opt.type === "OptionRepeating") {
        name = ppOptName(opt.opt);
        doc = ppOptDoc(opt.opt);
      } else {
        if (opt.action === "boolean") name = ppOptName(opt);
        else name = `${ppOptName(opt)} ${opt.docv ?? "VALUE"}`;
        doc = opt.doc ?? "";
      }
      rows.push([name, doc]);
    }
    doc.push(pp.nest("  ", ppTable(rows)));
  }
  if (hasCommands) {
    doc.push(pp.lineBreak);
    doc.push(pp.lineBreak);
    doc.push("COMMANDS:");
    let rows: [string, string][] = [];
    for (let key in cmd.cmds) {
      let c: AnyCmd = cmd.cmds[key];
      let name = c.name;
      let doc: string | undefined = c.doc;
      rows.push([name, doc ?? ""]);
    }
    doc.push(pp.nest("  ", ppTable(rows)));
  }
  return doc;
}

function ppText(text: string): pp.IDoc {
  return pp.group(pp.intersperse(pp.softLine, text.split(/\s+/)));
}

function ppTable(rows: [string, pp.IDoc][]): pp.IDoc {
  let doc: pp.IDocArray = [];
  let maxCol1Len = Math.max(...rows.map(([col1]) => col1.length));
  for (let [col1, col2] of rows) {
    doc.push(pp.lineBreak);
    doc.push(pp.group([col1.padStart(maxCol1Len), "  ", pp.align(col2)]));
  }
  return doc;
}
