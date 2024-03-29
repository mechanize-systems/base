/**
 * CLI argument parser
 */

import * as util from "util";
import * as pp from "prettier-printer";
import * as Lang from "./Lang.js";

type MaybeString<O> = O extends string ? string : undefined;

export type OptSpec = {
  readonly name: string;
  readonly shortName?: string;
  readonly doc?: string;
  readonly docv?: string;
  readonly env?: string;
  readonly default?: string | void;
};

export type Opt<T> = OptSpec & {
  readonly type: "Opt";
  readonly action: "string" | "boolean" | ((value: string | undefined) => T);
};

/** Define an option. */
export function option<S extends OptSpec>(
  spec: S
): Opt<string | MaybeString<S["default"]>> {
  return { ...spec, type: "Opt", action: "string" };
}

/** Define an option which computes to a value using `action`. */
export function optionAnd<S extends OptSpec, T>(
  spec: S,
  action: (value: string | MaybeString<S["default"]>) => T
): Opt<T> {
  return { ...spec, type: "Opt", action: action as Opt<T>["action"] };
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
  type: "Arg";
  readonly action: "string" | ((value: string) => T);
};

/** Define an argument. */
export function arg(spec: ArgSpec): Arg<string> {
  return { ...spec, type: "Arg", action: "string" };
}

/** Define an argument which computes to a value using `action`. */
export function argAnd<T>(
  spec: ArgSpec,
  action: (value: string) => T
): Arg<T> {
  return { ...spec, type: "Arg", action };
}

type RepeatingArg<A> = { type: "RepeatingArg"; arg: Arg<A> };

export function argRepeating<A>(arg: Arg<A>): RepeatingArg<A> {
  return { type: "RepeatingArg", arg };
}

type OptionalArg<_A> = {
  type: "OptionalArg";
  arg: AnyArg;
  default?: string | undefined;
};

export function argOptional<A, D extends string | undefined>(
  arg: Arg<A>,
  defaultValue?: D
): OptionalArg<D extends string ? A : A | undefined> {
  return { type: "OptionalArg", arg, default: defaultValue };
}

type AnyArg = Arg<any>;

type AnyArgRest = RepeatingArg<any> | OptionalArg<any>;

export type Cmd<
  A extends Arg<any>[],
  RA extends AnyArgRest | null,
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
type AnyCmd = Cmd<AnyArg[], AnyArgRest, any, any>;

export type CmdAction<C extends AnyCmd> = (
  this: { name: string; cmd: C },
  opts: CmdOptsResult<C>,
  ...args: CmdArgsResult<C>
) => void;

/** Define a command. */
export function cmd<
  A extends AnyArg[],
  RA extends AnyArgRest,
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
  doc: "show this message and exit",
});

type CmdArgsResult<C> = C extends Cmd<[], null, infer _O, infer _C>
  ? []
  : C extends Cmd<infer A, null, infer _O, infer _C>
  ? [...{ [K in keyof A]: ArgResult<A[K]> }]
  : C extends Cmd<[], infer RA, infer _O, infer _C>
  ? WithArgRestResult<[], RA>
  : C extends Cmd<infer A, infer RA, infer _O, infer _C>
  ? WithArgRestResult<[...{ [K in keyof A]: ArgResult<A[K]> }], RA>
  : never;

type WithArgRestResult<A extends any[], RA> = RA extends RepeatingArg<
  infer RA0
>
  ? [...A, ...RA0[]]
  : RA extends OptionalArg<infer RA0>
  ? [...A, RA0]
  : A;

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
export function error(msg: string): never {
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
  let argsRest: AnyArgRest | null = cmd.argsRest != null ? cmd.argsRest : null;
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

  function addArgValue(arg: AnyArg, value: any) {
    if (arg.action === "string") argsValues.push(value);
    else argsValues.push(arg.action(value));
  }

  while (tokens.length > 0) {
    let tok = tokens[0]!;
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
              `missing value for option --${opt.name}`
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
          addArgValue(args.shift()!, tok.value);
        } else if (argsRest != null) {
          switch (argsRest.type) {
            case "RepeatingArg":
              tokens.shift();
              addArgValue(argsRest.arg, tok.value);
              break;
            case "OptionalArg":
              if (args.length === 0) {
                tokens.shift();
                addArgValue(argsRest.arg, tok.value);
              } else {
                throw new CommandLineError(cmds, "extra position argument");
              }
              break;
            default:
              Lang.never(argsRest);
          }
        } else {
          if (cmd.cmds == null)
            throw new CommandLineError(cmds, "extra position argument");
          let nextCmd: AnyCmd | null = cmd.cmds[tok.value];
          if (nextCmd == null)
            throw new CommandLineError(
              cmds,
              `unknown subcommand ${tok.value}`
            );
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
    throw new CommandLineError(cmds, `missing ${args[0]!.docv} argument`);
  if (
    argsRest?.type === "OptionalArg" &&
    (cmd.args?.length ?? 0) === argsValues.length &&
    argsRest.default != null
  )
    addArgValue(argsRest.arg, argsRest.default);

  // Add missing options
  for (let name in opts) {
    let { opt, key } = opts[name]!;
    if (optsValues[key] == null) {
      if (opt.type === "OptionRepeating") {
        if (opt.opt.env != null) {
          let envval = process.env[opt.opt.env];
          if (envval != null) addOptValue(opt, key, envval);
        } else optsValues[key] = [];
      } else if (opt.type === "Opt" && opt.action === "boolean") {
        if (opt.env != null) {
          let envval = (process.env[opt.env] ?? "false").toLowerCase();
          optsValues[key] =
            envval !== "no" &&
            envval !== "off" &&
            envval !== "0" &&
            envval !== "false";
        } else optsValues[key] = false;
      } else if (opt.type === "Opt") {
        if (opt.env != null) {
          let envval = process.env[opt.env];
          if (envval != null) addOptValue(opt, key, envval);
        }
        if (optsValues[key] == null && opt.default != null) {
          addOptValue(opt, key, opt.default);
        }
      }
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
        console.log(printUsage(err.cmds[err.cmds.length - 1]!, name));
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
    let argRest = cmd.argsRest;
    switch (argRest.type) {
      case "RepeatingArg":
        usage = `${usage} ${argRest.arg.docv ?? "ARG"}...`;
        break;
      case "OptionalArg":
        usage = `${usage} [${argRest.arg.docv ?? "ARG"}]`;
        break;
      default:
        Lang.never(argRest);
    }
  }
  return usage;
}

function ppOptName(opt: Opt<any>) {
  let name =
    opt.shortName != null
      ? `--${opt.name}, -${opt.shortName}`
      : `--${opt.name}`;
  if (opt.action !== "boolean") name = `${name} ${opt.docv ?? "VALUE"}`;
  return name;
}

function ppOptDoc(opt: Opt<any>): pp.IDoc {
  let doc: pp.IDocArray = opt.doc != null ? [ppText(opt.doc)] : [];
  if (opt.default != null) {
    if (doc.length > 0) doc.push(pp.line);
    doc.push(ppText(`(default: ${JSON.stringify(opt.default)})`));
  }
  if (opt.env != null) {
    if (doc.length > 0) doc.push(pp.line);
    doc.push(ppText(`(env var: \$${opt.env})`));
  }
  return doc;
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
      let name = ppOptName(opt.type === "OptionRepeating" ? opt.opt : opt);
      let doc = ppOptDoc(opt.type === "OptionRepeating" ? opt.opt : opt);
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
