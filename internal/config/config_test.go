package config

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// unsetEnv removes any ambient API2MCP_* variables so tests observe only the
// values they set themselves.
func unsetEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		envBaseURL, envAuthMode, envAuthToken, envAuthHeader, envAuthQueryKey,
		envAllowDestructive, envToolsFile, envConfig, envClientSecret,
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

func writeJSON(t *testing.T, body string, mode os.FileMode) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(body), mode); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadDefaults(t *testing.T) {
	unsetEnv(t)
	t.Setenv(envConfig, "")

	cfg, err := Load(nil, io.Discard)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AuthMode != DefaultAuthMode {
		t.Errorf("AuthMode = %q, want %q", cfg.AuthMode, DefaultAuthMode)
	}
	if cfg.AuthHeader != DefaultAuthHeader {
		t.Errorf("AuthHeader = %q, want %q", cfg.AuthHeader, DefaultAuthHeader)
	}
	if cfg.AuthQueryKey != DefaultAuthQueryKey {
		t.Errorf("AuthQueryKey = %q, want %q", cfg.AuthQueryKey, DefaultAuthQueryKey)
	}
	if cfg.ToolsFile != DefaultToolsFile {
		t.Errorf("ToolsFile = %q, want %q", cfg.ToolsFile, DefaultToolsFile)
	}
	if cfg.AllowDestructive {
		t.Error("AllowDestructive = true, want false")
	}
}

func TestLoadJSONOverridesDefault(t *testing.T) {
	unsetEnv(t)
	path := writeJSON(t, `{
		"baseUrl": "http://json.example",
		"authMode": "header",
		"authHeader": "X-Json",
		"authQueryKey": "json_key",
		"allowDestructive": true,
		"toolsFile": "json-tools.json"
	}`, 0o600)
	t.Setenv(envConfig, path)

	cfg, err := Load(nil, io.Discard)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.BaseURL != "http://json.example" || cfg.AuthMode != AuthHeader ||
		cfg.AuthHeader != "X-Json" || cfg.AuthQueryKey != "json_key" ||
		!cfg.AllowDestructive || cfg.ToolsFile != "json-tools.json" {
		t.Fatalf("JSON layer not applied: %+v", *cfg)
	}
}

func TestLoadEnvOverridesJSON(t *testing.T) {
	unsetEnv(t)
	path := writeJSON(t, `{
		"baseUrl": "http://json.example",
		"authMode": "header",
		"authHeader": "X-Json",
		"authQueryKey": "json_key",
		"allowDestructive": false,
		"toolsFile": "json-tools.json"
	}`, 0o600)
	t.Setenv(envConfig, path)
	t.Setenv(envBaseURL, "http://env.example")
	t.Setenv(envAuthMode, "bearer")
	t.Setenv(envAuthToken, "env-token")
	t.Setenv(envAuthHeader, "X-Env")
	t.Setenv(envAuthQueryKey, "env_key")
	t.Setenv(envAllowDestructive, "true")
	t.Setenv(envToolsFile, "env-tools.json")

	cfg, err := Load(nil, io.Discard)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.BaseURL != "http://env.example" || cfg.AuthMode != AuthBearer ||
		cfg.AuthHeader != "X-Env" || cfg.AuthQueryKey != "env_key" ||
		!cfg.AllowDestructive || cfg.ToolsFile != "env-tools.json" || cfg.AuthToken != "env-token" {
		t.Fatalf("env layer not applied over JSON: %+v", *cfg)
	}
}

func TestLoadFlagsOverrideEnv(t *testing.T) {
	unsetEnv(t)
	t.Setenv(envConfig, "")
	t.Setenv(envBaseURL, "http://env.example")
	t.Setenv(envAuthMode, "bearer")
	t.Setenv(envAuthToken, "env-token")
	t.Setenv(envAuthHeader, "X-Env")
	t.Setenv(envAuthQueryKey, "env_key")
	t.Setenv(envAllowDestructive, "false")
	t.Setenv(envToolsFile, "env-tools.json")

	base, mode, header, key, tools := "http://flag.example", "query", "X-Flag", "flag_key", "flag-tools.json"
	allow := true
	cfg, err := Load(&Flags{
		BaseURL:          &base,
		AuthMode:         &mode,
		AuthHeader:       &header,
		AuthQueryKey:     &key,
		AllowDestructive: &allow,
		ToolsFile:        &tools,
	}, io.Discard)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.BaseURL != base || cfg.AuthMode != AuthQuery || cfg.AuthHeader != header ||
		cfg.AuthQueryKey != key || !cfg.AllowDestructive || cfg.ToolsFile != tools {
		t.Fatalf("flag layer not applied over env: %+v", *cfg)
	}
}

func TestStrictBoolParsing(t *testing.T) {
	unsetEnv(t)
	t.Setenv(envConfig, "")
	cases := []struct {
		in      string
		want    bool
		wantErr bool
	}{
		{"1", true, false},
		{"t", true, false},
		{"T", true, false},
		{"TRUE", true, false},
		{"true", true, false},
		{"True", true, false},
		{"0", false, false},
		{"f", false, false},
		{"F", false, false},
		{"FALSE", false, false},
		{"false", false, false},
		{"False", false, false},
		{"", false, true},
		{"yes", false, true},
		{"no", false, true},
		{"2", false, true},
		{"on", false, true},
		{"TrUe", false, true},
		{"TRUE ", false, true},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			t.Setenv(envAllowDestructive, tc.in)
			cfg, err := Load(nil, io.Discard)
			if tc.wantErr {
				if err == nil || !IsConfigError(err) {
					t.Fatalf("Load(%q) error = %v, want config error", tc.in, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("Load(%q): %v", tc.in, err)
			}
			if cfg.AllowDestructive != tc.want {
				t.Errorf("AllowDestructive = %v, want %v", cfg.AllowDestructive, tc.want)
			}
		})
	}
}

func TestUnknownJSONFieldIsError(t *testing.T) {
	unsetEnv(t)
	path := writeJSON(t, `{"baseUrl":"http://x.example","bogusField":1}`, 0o600)
	t.Setenv(envConfig, path)

	_, err := Load(nil, io.Discard)
	if err == nil || !IsConfigError(err) {
		t.Fatalf("Load error = %v, want config error", err)
	}
	if !strings.Contains(err.Error(), "bogusField") {
		t.Errorf("error %q does not name the unknown field", err)
	}
}

func TestSecretFilePermissions(t *testing.T) {
	unsetEnv(t)
	cases := []struct {
		name    string
		body    string
		mode    os.FileMode
		wantErr bool
	}{
		{"authToken 0644", `{"authToken":"sentinel"}`, 0o644, true},
		{"authToken 0640", `{"authToken":"sentinel"}`, 0o640, true},
		{"authToken 0600", `{"authToken":"sentinel"}`, 0o600, false},
		{"clientSecret 0644", `{"clientSecret":"sentinel"}`, 0o644, true},
		{"clientSecret 0600", `{"clientSecret":"sentinel"}`, 0o600, false},
		{"no secret 0644", `{"baseUrl":"http://x.example"}`, 0o644, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := writeJSON(t, tc.body, tc.mode)
			t.Setenv(envConfig, path)
			_, err := Load(nil, io.Discard)
			if tc.wantErr {
				if err == nil || !IsConfigError(err) {
					t.Fatalf("Load error = %v, want config error", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
		})
	}
}

func TestQueryAuthWarning(t *testing.T) {
	unsetEnv(t)
	t.Setenv(envConfig, "")
	t.Setenv(envBaseURL, "http://x.example")
	t.Setenv(envAuthMode, "query")
	t.Setenv(envAuthToken, "sentinel")

	var warn bytes.Buffer
	if _, err := Load(nil, &warn); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !strings.Contains(warn.String(), "query") || !strings.Contains(warn.String(), "warning") {
		t.Errorf("warning = %q, want query-auth warning", warn.String())
	}
}

func TestNoWarningForNonQueryAuth(t *testing.T) {
	unsetEnv(t)
	t.Setenv(envConfig, "")
	t.Setenv(envBaseURL, "http://x.example")
	t.Setenv(envAuthMode, "bearer")
	t.Setenv(envAuthToken, "sentinel")

	var warn bytes.Buffer
	if _, err := Load(nil, &warn); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if warn.Len() != 0 {
		t.Errorf("warning = %q, want none", warn.String())
	}
}

func TestInvalidAuthMode(t *testing.T) {
	unsetEnv(t)
	t.Setenv(envConfig, "")
	t.Setenv(envAuthMode, "bogus")

	_, err := Load(nil, io.Discard)
	if err == nil || !IsConfigError(err) {
		t.Fatalf("Load error = %v, want config error", err)
	}
}

func TestValidateForServe(t *testing.T) {
	cases := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"missing base url", Config{AuthMode: AuthNone}, true},
		{"blank base url", Config{BaseURL: "   ", AuthMode: AuthNone}, true},
		{"valid", Config{BaseURL: "http://x.example", AuthMode: AuthNone}, false},
		{"missing token", Config{BaseURL: "http://x.example", AuthMode: AuthBearer}, true},
		{"token present", Config{BaseURL: "http://x.example", AuthMode: AuthBearer, AuthToken: "t"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.cfg.ValidateForServe()
			if tc.wantErr {
				if err == nil || !IsConfigError(err) {
					t.Fatalf("ValidateForServe error = %v, want config error", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("ValidateForServe: %v", err)
			}
		})
	}
}
