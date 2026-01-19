#!/bin/bash

# Installation script for PilotBar GNOME Extension

EXTENSION_UUID="pilotbar@perpuchaty.github.com"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "Installing PilotBar - GitHub Copilot Monitor..."

# Remove old versions
for old_uuid in "aibar@sowology.com" "pilotbar@sowology.com" "pilotbar@perpuchaty.github.com"; do
    old_dir="$HOME/.local/share/gnome-shell/extensions/$old_uuid"
    if [ -d "$old_dir" ]; then
        echo "Removing old version: $old_uuid"
        rm -rf "$old_dir"
    fi
done

# Create extension directory
mkdir -p "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR/icons"
mkdir -p "$EXTENSION_DIR/schemas"

# Copy extension files
cp extension.js "$EXTENSION_DIR/"
cp prefs.js "$EXTENSION_DIR/"
cp metadata.json "$EXTENSION_DIR/"
cp -r icons/* "$EXTENSION_DIR/icons/" 2>/dev/null || true
cp -r schemas/* "$EXTENSION_DIR/schemas/" 2>/dev/null || true

# Compile schemas
if [ -d "$EXTENSION_DIR/schemas" ]; then
    echo "Compiling GSettings schemas..."
    glib-compile-schemas "$EXTENSION_DIR/schemas/"
fi

echo "Extension files copied to $EXTENSION_DIR"

echo ""
echo "To activate the extension:"
echo "1. Log out and log back in (Wayland) or press Alt+F2 and type 'r' (X11)"
echo "2. Enable the extension:"
echo "   gnome-extensions enable $EXTENSION_UUID"

