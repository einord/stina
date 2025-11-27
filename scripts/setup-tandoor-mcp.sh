#!/usr/bin/env bash
set -e

echo "🔧 Setting up Tandoor MCP Server..."

# Check for Rust installation
if ! command -v cargo &> /dev/null; then
    echo "📦 Rust is not installed. Installing rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "✅ Rust installed successfully"
else
    echo "✅ Rust is already installed ($(cargo --version))"
fi

# Create directory for MCP servers
MCP_DIR="$HOME/.stina/mcp-servers"
mkdir -p "$MCP_DIR"

# Clone or update tandoor-mcp
TANDOOR_DIR="$MCP_DIR/tandoor-mcp"
if [ -d "$TANDOOR_DIR" ]; then
    echo "📂 Tandoor MCP directory exists, pulling latest..."
    cd "$TANDOOR_DIR"
    git pull
else
    echo "📥 Cloning tandoor-mcp repository..."
    git clone https://github.com/ChristopherJMiller/tandoor-mcp.git "$TANDOOR_DIR"
    cd "$TANDOOR_DIR"
fi

# Build the server
echo "🔨 Building Tandoor MCP server (this may take a few minutes)..."
cargo build --release

echo ""
echo "✅ Tandoor MCP server built successfully!"
echo ""
echo "📍 Server location: $TANDOOR_DIR/target/release/tandoor-mcp"
echo ""
echo "Next steps:"
echo "1. Set up your Tandoor instance credentials:"
echo "   export TANDOOR_BASE_URL='http://your-tandoor-url:8080'"
echo "   export TANDOOR_USERNAME='your-username'"
echo "   export TANDOOR_PASSWORD='your-password'"
echo ""
echo "2. Run the configuration script:"
echo "   bun scripts/configure-tandoor-mcp.ts"
echo ""
