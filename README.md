# @mechanize/base

**DO NOT USE: UNSTABLE AND INCOMPLETE**

An opinionated standard library for your TypeScript / React application.

## Usage

While the library is not released it is not stable and it is advised **NOT TO
USE** it in any way.

If you are still brave to do so the intended way is:

- To copy sources over to your project or use the repo via git submodule
  mechanism:

  ```
  $ git submodule add https://github.com/mechanize-systems/base.git base
  ```

- Add this `paths` declaration to project's `tsconfig.json`:

  ```
  "paths": { "@mechanize-systems/base/*": ["./base/*"] }
  ```

- Now you can import `@mechanize-systems/base` and submodules in your project.
