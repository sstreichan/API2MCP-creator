package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/sstreichan/api2mcp/internal/config"
	"github.com/sstreichan/api2mcp/internal/devtools"
	"github.com/sstreichan/api2mcp/internal/mcp"
)

// Product and server identity (migration plan 5.1).
const (
	Version    = "v0.1.0"
	ServerName = "any-api-mcp"
)

// Process exit codes (migration plan 5.3).
const (
	ExitOK     = 0
	ExitError  = 1
	ExitUsage  = 2
	ExitConfig = 3
	ExitAuth   = 4
	ExitSignal = 130
)

// ErrAuth marks a runtime authentication failure (upstream 401/403 in CLI
// commands). It is mapped to exit code 4; produced from migration phase E on.
var ErrAuth = errors.New("auth error")

// errUsage marks a usage error (unknown flag/subcommand, malformed value) and
// is mapped to exit code 2.
var errUsage = errors.New("usage error")

// Execute runs the CLI and returns the process exit code. Errors and usage go
// to stderr; help and version go to stdout.
func Execute(args []string) int {
	return execute(args, os.Stdout, os.Stderr)
}

func execute(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		return runServe(nil, stdout, stderr)
	}
	switch args[0] {
	case "serve":
		return runServe(args[1:], stdout, stderr)
	case "discover":
		return runDiscover(args[1:], stdout, stderr)
	case "oauth2":
		return runOAuth2(args[1:], stdout, stderr)
	case "version":
		return runVersion(args[1:], stdout, stderr)
	case "-h", "-help", "--help":
		printGlobalHelp(stdout)
		return ExitOK
	default:
		if strings.HasPrefix(args[0], "-") {
			// serve is the default command; its flag parser reports unknown flags.
			return runServe(args, stdout, stderr)
		}
		fmt.Fprintf(stderr, "unknown subcommand %q\n", args[0])
		printGlobalHelp(stderr)
		return ExitUsage
	}
}

// exitCode maps a dispatch outcome to the documented exit code. The
// signal case is context.Canceled, produced by the serve signal context.
func exitCode(err error) int {
	if err == nil {
		return ExitOK
	}
	switch {
	case errors.Is(err, errUsage):
		return ExitUsage
	case config.IsConfigError(err):
		return ExitConfig
	case errors.Is(err, ErrAuth):
		return ExitAuth
	case errors.Is(err, context.Canceled):
		return ExitSignal
	default:
		return ExitError
	}
}

// finish writes a non-nil error to stderr and returns its exit code.
func finish(err error, stderr io.Writer) int {
	if err == nil {
		return ExitOK
	}
	fmt.Fprintln(stderr, err)
	return exitCode(err)
}

// handleParseErr returns help on stdout for -h/--help and a usage error on
// stderr for everything else. The FlagSet usage is silenced by callers.
func handleParseErr(err error, printHelp func(io.Writer), cmd string, stdout, stderr io.Writer) int {
	if errors.Is(err, flag.ErrHelp) {
		printHelp(stdout)
		return ExitOK
	}
	// The FlagSet already printed the parse error to stderr; add a hint.
	fmt.Fprintf(stderr, "run 'api2mcp %s --help' for usage\n", cmd)
	return ExitUsage
}

func runServe(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {}

	baseURL := fs.String("base-url", "", "target API base URL")
	authMode := fs.String("auth-mode", "", "none|bearer|header|basic|query")
	authHeader := fs.String("auth-header", "", "header name for header auth")
	authQueryKey := fs.String("auth-query-key", "", "query parameter for query auth")
	allowDestructive := fs.Bool("allow-destructive", false, "enable write tools")
	toolsFile := fs.String("tools-file", "", "path to tools.json")
	configPath := fs.String("config", "", "path to JSON config file")

	if err := fs.Parse(args); err != nil {
		return handleParseErr(err, printServeHelp, "serve", stdout, stderr)
	}

	seen := map[string]bool{}
	fs.Visit(func(fl *flag.Flag) { seen[fl.Name] = true })
	var f config.Flags
	if seen["base-url"] {
		f.BaseURL = baseURL
	}
	if seen["auth-mode"] {
		f.AuthMode = authMode
	}
	if seen["auth-header"] {
		f.AuthHeader = authHeader
	}
	if seen["auth-query-key"] {
		f.AuthQueryKey = authQueryKey
	}
	if seen["allow-destructive"] {
		f.AllowDestructive = allowDestructive
	}
	if seen["tools-file"] {
		f.ToolsFile = toolsFile
	}
	if seen["config"] {
		f.ConfigPath = configPath
	}

	cfg, err := config.Load(&f, stderr)
	if err != nil {
		return finish(err, stderr)
	}
	if err := cfg.ValidateForServe(); err != nil {
		return finish(err, stderr)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	err = mcp.Run(ctx, *cfg)
	if ctx.Err() != nil {
		fmt.Fprintln(stderr, "interrupted")
		return ExitSignal
	}
	return finish(err, stderr)
}

func runDiscover(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("discover", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {}

	var opts devtools.DiscoverOptions
	fs.IntVar(&opts.PacingDelayMS, "pacing-delay-ms", 0, "initial delay between scan requests in milliseconds")
	fs.StringVar(&opts.Paths, "paths", "", "comma-separated paths to probe")
	fs.StringVar(&opts.Output, "output", "", "output file for generated tools.json")
	fs.StringVar(&opts.OutputDir, "output-dir", "", "output directory for generated files")
	fs.StringVar(&opts.Wordlist, "wordlist", "", "wordlist file for endpoint scanning")
	fs.StringVar(&opts.OpenAPIFile, "openapi-file", "", "OpenAPI document to convert")
	fs.StringVar(&opts.ScanFile, "scan-file", "", "scan result file to convert")

	if err := fs.Parse(args); err != nil {
		return handleParseErr(err, printDiscoverHelp, "discover", stdout, stderr)
	}
	return finish(devtools.RunDiscover(context.Background(), opts), stderr)
}

func runOAuth2(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("oauth2", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {}

	var opts devtools.OAuth2Options
	fs.StringVar(&opts.TokenURL, "token-url", "", "OAuth2 token endpoint")
	fs.StringVar(&opts.ClientID, "client-id", "", "OAuth2 client id")
	fs.StringVar(&opts.Scope, "scope", "", "requested OAuth2 scope")
	fs.StringVar(&opts.DeviceAuthURL, "device-auth-url", "", "OAuth2 device authorization endpoint")

	if err := fs.Parse(args); err != nil {
		return handleParseErr(err, printOAuth2Help, "oauth2", stdout, stderr)
	}
	// The client secret is never a flag; env (or config file) only.
	opts.ClientSecret = os.Getenv("API2MCP_CLIENT_SECRET")
	return finish(devtools.RunOAuth2(context.Background(), opts), stderr)
}

func runVersion(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("version", flag.ContinueOnError)
	fs.SetOutput(stderr)
	fs.Usage = func() {}
	if err := fs.Parse(args); err != nil {
		return handleParseErr(err, printVersionHelp, "version", stdout, stderr)
	}
	fmt.Fprintf(stdout, "api2mcp %s\n", Version)
	fmt.Fprintf(stdout, "MCP server name: %s\n", ServerName)
	return ExitOK
}

func printGlobalHelp(w io.Writer) {
	fmt.Fprint(w, `api2mcp - MCP server for adapting any HTTP API

Usage:
  api2mcp [command] [flags]

Commands:
  serve      run the stdio MCP server (default when no command is given)
  discover   discover endpoints and generate tools.json (phase E)
  oauth2     obtain an OAuth2 token (phase E)
  version    print version and MCP server name

Run "api2mcp <command> --help" for command-specific flags.

Environment:
  API2MCP_BASE_URL           target API base URL (required for serve)
  API2MCP_AUTH_MODE          none|bearer|header|basic|query (default none)
  API2MCP_AUTH_TOKEN         auth token; never accepted as a CLI flag
  API2MCP_AUTH_HEADER        header name for header auth (default Authorization)
  API2MCP_AUTH_QUERY_KEY     query parameter for query auth (default api_key)
  API2MCP_ALLOW_DESTRUCTIVE  strict boolean, strconv.ParseBool values only (default false)
  API2MCP_TOOLS_FILE         path to tools.json (default tools.json)
  API2MCP_CONFIG             path to a JSON config file
  API2MCP_CLIENT_SECRET      OAuth2 client secret; never accepted as a CLI flag

Priority per field: flags > environment > JSON config file > defaults.

Exit codes:
  0    success
  1    generic runtime error
  2    usage error
  3    configuration error
  4    authentication error at runtime
  130  interrupted by SIGINT/SIGTERM
`)
}

func printServeHelp(w io.Writer) {
	fmt.Fprint(w, `Usage: api2mcp serve [flags]

Run the stdio MCP server. This is the default command.

Flags:
  --base-url string        target API base URL (env API2MCP_BASE_URL)
  --auth-mode string       none|bearer|header|basic|query (env API2MCP_AUTH_MODE)
  --auth-header string     header name for header auth (env API2MCP_AUTH_HEADER)
  --auth-query-key string  query parameter for query auth (env API2MCP_AUTH_QUERY_KEY)
  --allow-destructive      enable write tools (env API2MCP_ALLOW_DESTRUCTIVE)
  --tools-file string      path to tools.json (env API2MCP_TOOLS_FILE)
  --config string          path to JSON config file (env API2MCP_CONFIG)

Secrets are only accepted through the environment or the config file, never as flags.
Priority per field: flags > environment > JSON config file > defaults.
`)
}

func printDiscoverHelp(w io.Writer) {
	fmt.Fprint(w, `Usage: api2mcp discover [flags]

Discover endpoints and generate tools.json. Implemented in migration phase E.

Flags:
  --pacing-delay-ms int     initial delay between scan requests in milliseconds
  --paths string            comma-separated paths to probe
  --output string           output file for generated tools.json
  --output-dir string       output directory for generated files
  --wordlist string         wordlist file for endpoint scanning
  --openapi-file string     OpenAPI document to convert
  --scan-file string        scan result file to convert
`)
}

func printOAuth2Help(w io.Writer) {
	fmt.Fprint(w, `Usage: api2mcp oauth2 [flags]

Obtain an OAuth2 token. Implemented in migration phase E.

Flags:
  --token-url string        OAuth2 token endpoint
  --client-id string        OAuth2 client id
  --scope string            requested OAuth2 scope
  --device-auth-url string  OAuth2 device authorization endpoint

The client secret is only read from API2MCP_CLIENT_SECRET or the config file,
never from a flag.
`)
}

func printVersionHelp(w io.Writer) {
	fmt.Fprint(w, `Usage: api2mcp version

Print the product version and the MCP server name. Requires no configuration.
`)
}
