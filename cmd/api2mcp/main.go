// Command api2mcp is the any-api-mcp MCP server binary.
//
// The binary identity is api2mcp; the MCP server name stays any-api-mcp
// (see migration plan 5.1). All output routing and exit codes live in
// internal/cli.
package main

import (
	"os"

	"github.com/sstreichan/api2mcp/internal/cli"
)

func main() {
	os.Exit(cli.Execute(os.Args[1:]))
}
