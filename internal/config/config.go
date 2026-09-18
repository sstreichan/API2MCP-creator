package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// AuthMode is a validated API2MCP_AUTH_MODE value.
type AuthMode string

const (
	AuthNone   AuthMode = "none"
	AuthBearer AuthMode = "bearer"
	AuthHeader AuthMode = "header"
	AuthBasic  AuthMode = "basic"
	AuthQuery  AuthMode = "query"
)

// Environment variable names. There is deliberately no alias for the old
// TypeScript names (migration plan 8.1).
const (
	envBaseURL          = "API2MCP_BASE_URL"
	envAuthMode         = "API2MCP_AUTH_MODE"
	envAuthToken        = "API2MCP_AUTH_TOKEN"
	envAuthHeader       = "API2MCP_AUTH_HEADER"
	envAuthQueryKey     = "API2MCP_AUTH_QUERY_KEY"
	envAllowDestructive = "API2MCP_ALLOW_DESTRUCTIVE"
	envToolsFile        = "API2MCP_TOOLS_FILE"
	envConfig           = "API2MCP_CONFIG"
	envClientSecret     = "API2MCP_CLIENT_SECRET"
)

// Defaults applied when neither a flag, an environment variable nor the JSON
// config file provides a value.
const (
	DefaultAuthMode     = AuthNone
	DefaultAuthHeader   = "Authorization"
	DefaultAuthQueryKey = "api_key"
	DefaultToolsFile    = "tools.json"
)

// Config is the fully resolved and validated runtime configuration.
type Config struct {
	BaseURL          string
	AuthMode         AuthMode
	AuthToken        string
	AuthHeader       string
	AuthQueryKey     string
	AllowDestructive bool
	ToolsFile        string
	ClientSecret     string
}

// Flags carries non-secret CLI overrides. A nil field means "not set", so the
// next source in the priority order applies. Secrets are never flag-settable.
type Flags struct {
	BaseURL          *string
	AuthMode         *string
	AuthHeader       *string
	AuthQueryKey     *string
	AllowDestructive *bool
	ToolsFile        *string
	ConfigPath       *string
}

// Error is a configuration error. Callers map it to exit code 3.
type Error struct{ Msg string }

func (e *Error) Error() string { return e.Msg }

// IsConfigError reports whether err is a configuration error.
func IsConfigError(err error) bool {
	var e *Error
	return errors.As(err, &e)
}

func newError(format string, args ...any) *Error {
	return &Error{Msg: fmt.Sprintf(format, args...)}
}

// fileConfig is the JSON config file schema. Pointers distinguish "absent"
// from "present but zero-valued" for per-field priority. Keys are
// lowerCamelCase; strict decoding rejects unknown fields.
type fileConfig struct {
	BaseURL          *string `json:"baseUrl"`
	AuthMode         *string `json:"authMode"`
	AuthToken        *string `json:"authToken"`
	AuthHeader       *string `json:"authHeader"`
	AuthQueryKey     *string `json:"authQueryKey"`
	AllowDestructive *bool   `json:"allowDestructive"`
	ToolsFile        *string `json:"toolsFile"`
	ClientSecret     *string `json:"clientSecret"`
}

// Load resolves the configuration with per-field priority
// Flags > Env > JSON > Defaults, then validates it. It writes start warnings
// (AUTH_MODE=query) to warn; a nil warn defaults to os.Stderr.
func Load(flags *Flags, warn io.Writer) (*Config, error) {
	if warn == nil {
		warn = os.Stderr
	}
	var f Flags
	if flags != nil {
		f = *flags
	}

	cfg := Config{
		AuthMode:     DefaultAuthMode,
		AuthHeader:   DefaultAuthHeader,
		AuthQueryKey: DefaultAuthQueryKey,
		ToolsFile:    DefaultToolsFile,
	}

	// JSON layer. The path itself follows flag > env.
	path := ""
	if v, ok := os.LookupEnv(envConfig); ok {
		path = v
	}
	if f.ConfigPath != nil {
		path = *f.ConfigPath
	}
	if path != "" {
		fc, err := loadFile(path)
		if err != nil {
			return nil, err
		}
		if hasSecret(fc) {
			if err := checkSecretPerms(path); err != nil {
				return nil, err
			}
		}
		if fc.BaseURL != nil {
			cfg.BaseURL = *fc.BaseURL
		}
		if fc.AuthMode != nil {
			cfg.AuthMode = AuthMode(*fc.AuthMode)
		}
		if fc.AuthToken != nil {
			cfg.AuthToken = *fc.AuthToken
		}
		if fc.AuthHeader != nil {
			cfg.AuthHeader = *fc.AuthHeader
		}
		if fc.AuthQueryKey != nil {
			cfg.AuthQueryKey = *fc.AuthQueryKey
		}
		if fc.AllowDestructive != nil {
			cfg.AllowDestructive = *fc.AllowDestructive
		}
		if fc.ToolsFile != nil {
			cfg.ToolsFile = *fc.ToolsFile
		}
		if fc.ClientSecret != nil {
			cfg.ClientSecret = *fc.ClientSecret
		}
	}

	// Env layer.
	if v, ok := os.LookupEnv(envBaseURL); ok {
		cfg.BaseURL = v
	}
	if v, ok := os.LookupEnv(envAuthMode); ok {
		cfg.AuthMode = AuthMode(v)
	}
	if v, ok := os.LookupEnv(envAuthToken); ok {
		cfg.AuthToken = v
	}
	if v, ok := os.LookupEnv(envAuthHeader); ok {
		cfg.AuthHeader = v
	}
	if v, ok := os.LookupEnv(envAuthQueryKey); ok {
		cfg.AuthQueryKey = v
	}
	if v, ok := os.LookupEnv(envClientSecret); ok {
		cfg.ClientSecret = v
	}
	if v, ok := os.LookupEnv(envToolsFile); ok {
		cfg.ToolsFile = v
	}
	if f.AllowDestructive == nil {
		if v, ok := os.LookupEnv(envAllowDestructive); ok {
			b, err := strconv.ParseBool(v)
			if err != nil {
				return nil, newError("config: %s=%q is not a valid boolean (use strconv.ParseBool values)", envAllowDestructive, v)
			}
			cfg.AllowDestructive = b
		}
	}

	// Flag layer.
	if f.BaseURL != nil {
		cfg.BaseURL = *f.BaseURL
	}
	if f.AuthMode != nil {
		cfg.AuthMode = AuthMode(*f.AuthMode)
	}
	if f.AuthHeader != nil {
		cfg.AuthHeader = *f.AuthHeader
	}
	if f.AuthQueryKey != nil {
		cfg.AuthQueryKey = *f.AuthQueryKey
	}
	if f.AllowDestructive != nil {
		cfg.AllowDestructive = *f.AllowDestructive
	}
	if f.ToolsFile != nil {
		cfg.ToolsFile = *f.ToolsFile
	}

	switch cfg.AuthMode {
	case AuthNone, AuthBearer, AuthHeader, AuthBasic, AuthQuery:
	default:
		return nil, newError("config: %s=%q is not one of none|bearer|header|basic|query", envAuthMode, cfg.AuthMode)
	}

	if cfg.AuthMode == AuthQuery {
		fmt.Fprintln(warn, "warning: API2MCP_AUTH_MODE=query puts the auth token in the URL query; it can leak into proxy and access logs")
	}

	return &cfg, nil
}

// ValidateForServe applies the required-value checks for the serve path.
func (c *Config) ValidateForServe() error {
	if strings.TrimSpace(c.BaseURL) == "" {
		return newError("config: %s is required for serve", envBaseURL)
	}
	if c.AuthMode != AuthNone && c.AuthToken == "" {
		return newError("config: %s is required when %s=%s", envAuthToken, envAuthMode, c.AuthMode)
	}
	return nil
}

func loadFile(path string) (*fileConfig, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, newError("config: read %s: %v", path, err)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var fc fileConfig
	if err := dec.Decode(&fc); err != nil {
		return nil, newError("config: decode %s: %v", path, err)
	}
	var extra any
	switch err := dec.Decode(&extra); {
	case err == io.EOF:
		// no trailing content
	case err == nil:
		return nil, newError("config: %s contains trailing JSON data", path)
	default:
		return nil, newError("config: decode %s: %v", path, err)
	}
	return &fc, nil
}

func hasSecret(fc *fileConfig) bool {
	return (fc.AuthToken != nil && *fc.AuthToken != "") ||
		(fc.ClientSecret != nil && *fc.ClientSecret != "")
}

func checkSecretPerms(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return newError("config: stat %s: %v", path, err)
	}
	if perm := info.Mode().Perm(); perm&^0o600 != 0 {
		return newError("config: %s contains secrets but has permissions %04o; must be 0600 or stricter", path, perm)
	}
	return nil
}
