# ports

`ports` is a macOS-only CLI for seeing which TCP ports are currently listening and which process owns each one.

```sh
npm install
npm run build
./dist/ports
```

For a global command during development:

```sh
npm link
ports
```

## Output

The default view is a compact table:

```text
PORT  SCOPE  ADDRESS    PID    PROCESS  URL
3000  local  127.0.0.1  12345  node     http://localhost:3000
```

`SCOPE` means:

- `local`: only loopback addresses like `127.0.0.1` or `[::1]`
- `all`: all interfaces, such as `*`, `0.0.0.0`, or `[::]`
- `network`: a specific non-loopback interface

## Options

```text
ports --json
ports --wide
ports --no-color
ports --help
ports --version
```

The CLI uses `/usr/sbin/lsof` and `/bin/ps`, both available on macOS.
