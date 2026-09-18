package mcp

import (
	"context"
	"errors"

	"github.com/sstreichan/api2mcp/internal/config"
)

// Run starts the stdio MCP server. It is a stub; the real server is
// implemented in migration phase C.
func Run(ctx context.Context, cfg config.Config) error {
	return errors.New("not yet implemented (migration phase C)")
}
