package devtools

import (
	"context"
	"errors"
)

// DiscoverOptions holds the flags of "api2mcp discover".
type DiscoverOptions struct {
	PacingDelayMS int
	Paths         string
	Output        string
	OutputDir     string
	Wordlist      string
	OpenAPIFile   string
	ScanFile      string
}

// RunDiscover is a stub; discovery is implemented in migration phase E.
func RunDiscover(ctx context.Context, opts DiscoverOptions) error {
	return errors.New("not yet implemented (migration phase E)")
}

// OAuth2Options holds the flags of "api2mcp oauth2". The client secret comes
// from the environment or the config file, never from a flag.
type OAuth2Options struct {
	TokenURL      string
	ClientID      string
	Scope         string
	DeviceAuthURL string
	ClientSecret  string
}

// RunOAuth2 is a stub; OAuth2 is implemented in migration phase E.
func RunOAuth2(ctx context.Context, opts OAuth2Options) error {
	return errors.New("not yet implemented (migration phase E)")
}
