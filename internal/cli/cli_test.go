package cli

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/sstreichan/api2mcp/internal/config"
)

func unsetEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		"API2MCP_BASE_URL", "API2MCP_AUTH_MODE", "API2MCP_AUTH_TOKEN",
		"API2MCP_AUTH_HEADER", "API2MCP_AUTH_QUERY_KEY", "API2MCP_ALLOW_DESTRUCTIVE",
		"API2MCP_TOOLS_FILE", "API2MCP_CONFIG", "API2MCP_CLIENT_SECRET",
	}
	for _, k := range keys {
		if old, ok := os.LookupEnv(k); ok {
			if err := os.Unsetenv(k); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { os.Setenv(k, old) })
		}
	}
}

func TestGlobalHelp(t *testing.T) {
	unsetEnv(t)
	var out, errb bytes.Buffer
	if code := execute([]string{"--help"}, &out, &errb); code != ExitOK {
		t.Fatalf("--help exit = %d, want %d (stderr: %s)", code, ExitOK, errb.String())
	}
	got := out.String()
	for _, want := range []string{
		"serve", "discover", "oauth2", "version",
		"API2MCP_BASE_URL", "API2MCP_CONFIG", "API2MCP_CLIENT_SECRET",
		"Exit codes", "0", "1", "2", "3", "4", "130",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("help output missing %q", want)
		}
	}
}

func TestSubcommandHelp(t *testing.T) {
	unsetEnv(t)
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"serve", "--help"}, "--base-url"},
		{[]string{"discover", "--help"}, "--pacing-delay-ms"},
		{[]string{"oauth2", "--help"}, "--token-url"},
		{[]string{"version", "--help"}, "version"},
	}
	for _, tc := range cases {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			var out, errb bytes.Buffer
			if code := execute(tc.args, &out, &errb); code != ExitOK {
				t.Fatalf("exit = %d, want %d (stderr: %s)", code, ExitOK, errb.String())
			}
			if !strings.Contains(out.String(), tc.want) {
				t.Errorf("help output missing %q: %s", tc.want, out.String())
			}
			if errb.Len() != 0 {
				t.Errorf("help wrote to stderr: %s", errb.String())
			}
		})
	}
}

func TestVersion(t *testing.T) {
	unsetEnv(t)
	var out, errb bytes.Buffer
	if code := execute([]string{"version"}, &out, &errb); code != ExitOK {
		t.Fatalf("version exit = %d, want %d", code, ExitOK)
	}
	if !strings.Contains(out.String(), Version) || !strings.Contains(out.String(), ServerName) {
		t.Errorf("version output = %q, want %s and %s", out.String(), Version, ServerName)
	}
	if errb.Len() != 0 {
		t.Errorf("version wrote to stderr: %s", errb.String())
	}
}

func TestUnknownFlagIsUsageError(t *testing.T) {
	unsetEnv(t)
	for _, args := range [][]string{{"serve", "--nope"}, {"--nope"}} {
		var out, errb bytes.Buffer
		if code := execute(args, &out, &errb); code != ExitUsage {
			t.Errorf("%v exit = %d, want %d", args, code, ExitUsage)
		}
		if !strings.Contains(errb.String(), "not defined") {
			t.Errorf("%v stderr = %q, want flag error", args, errb.String())
		}
	}
}

func TestUnknownSubcommandIsUsageError(t *testing.T) {
	unsetEnv(t)
	var out, errb bytes.Buffer
	if code := execute([]string{"bogus"}, &out, &errb); code != ExitUsage {
		t.Fatalf("exit = %d, want %d", code, ExitUsage)
	}
	if !strings.Contains(errb.String(), "unknown subcommand") {
		t.Errorf("stderr = %q, want unknown subcommand", errb.String())
	}
}

func TestInvalidBoolIsConfigError(t *testing.T) {
	unsetEnv(t)
	t.Setenv("API2MCP_CONFIG", "")
	t.Setenv("API2MCP_ALLOW_DESTRUCTIVE", "notabool")

	var out, errb bytes.Buffer
	if code := execute([]string{"serve"}, &out, &errb); code != ExitConfig {
		t.Fatalf("exit = %d, want %d (stderr: %s)", code, ExitConfig, errb.String())
	}
	if !strings.Contains(errb.String(), "not a valid boolean") {
		t.Errorf("stderr = %q, want boolean error", errb.String())
	}
}

func TestServeMissingBaseURLIsConfigError(t *testing.T) {
	unsetEnv(t)
	t.Setenv("API2MCP_CONFIG", "")
	t.Setenv("API2MCP_BASE_URL", "")

	var out, errb bytes.Buffer
	if code := execute([]string{"serve"}, &out, &errb); code != ExitConfig {
		t.Fatalf("exit = %d, want %d (stderr: %s)", code, ExitConfig, errb.String())
	}
	if !strings.Contains(errb.String(), "API2MCP_BASE_URL") {
		t.Errorf("stderr = %q, want base URL error", errb.String())
	}
}

func TestServeStubLandsInMCPPhase(t *testing.T) {
	unsetEnv(t)
	t.Setenv("API2MCP_CONFIG", "")
	t.Setenv("API2MCP_BASE_URL", "http://example.test")

	var out, errb bytes.Buffer
	if code := execute([]string{"serve"}, &out, &errb); code != ExitError {
		t.Fatalf("exit = %d, want %d (stderr: %s)", code, ExitError, errb.String())
	}
	if !strings.Contains(errb.String(), "migration phase C") {
		t.Errorf("stderr = %q, want phase C stub message", errb.String())
	}
	if out.Len() != 0 {
		t.Errorf("serve wrote to stdout: %s", out.String())
	}
}

func TestDevtoolsStubs(t *testing.T) {
	unsetEnv(t)
	for _, args := range [][]string{{"discover"}, {"oauth2"}} {
		var out, errb bytes.Buffer
		if code := execute(args, &out, &errb); code != ExitError {
			t.Errorf("%v exit = %d, want %d", args, code, ExitError)
		}
		if !strings.Contains(errb.String(), "migration phase E") {
			t.Errorf("%v stderr = %q, want phase E stub message", args, errb.String())
		}
	}
}

func TestExitCodeMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"success", nil, ExitOK},
		{"generic", errors.New("boom"), ExitError},
		{"usage", fmt.Errorf("%w: unknown flag", errUsage), ExitUsage},
		{"config", &config.Error{Msg: "bad config"}, ExitConfig},
		{"auth", fmt.Errorf("%w: upstream 401", ErrAuth), ExitAuth},
		{"signal", context.Canceled, ExitSignal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := exitCode(tc.err); got != tc.want {
				t.Errorf("exitCode(%v) = %d, want %d", tc.err, got, tc.want)
			}
		})
	}
}
