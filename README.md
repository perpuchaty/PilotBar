# PilotBar - GitHub Copilot Monitor for GNOME



A lightweight GNOME Shell extension that displays your GitHub Copilot quota directly in the top bar.
![PilotBar Preview](https://github.com/perpuchaty/PilotBar/blob/main/screenshoot.png)

![PilotBar Preview](https://img.shields.io/badge/GNOME-Shell-4A86CF?style=flat&logo=gnome)
![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 Features

- **Real-time Quota Monitoring**: See your GitHub Copilot usage percentage in the GNOME top bar
- **OAuth Authentication**: Secure GitHub Device Code Flow authentication (no manual tokens needed!)
- **Non-blocking Login**: OAuth dialog doesn't freeze your desktop
- **Auto-refresh**: Automatically updates quota every 5 minutes
- **Manual Refresh**: Click "Refresh Status" button to update immediately
- **Clean UI**: Minimal design with GitHub Copilot icon and percentage
- **Quick Access**: One-click access to GitHub usage page

## 📦 Installation

### Prerequisites

- GNOME Shell 45, 46, 47, or 48
- GitHub Copilot subscription

### Quick Install

1. **Clone the repository:**
   ```bash
   git clone https://github.com/perpuchaty/PilotBar.git
   cd PilotBar
   ```

2. **Run the install script:**
   ```bash
   ./install.sh
   ```

3. **Log out and log back in** (required on Wayland)

4. **Enable the extension:**
   ```bash
   gnome-extensions enable pilotbar@perpuchaty.github.com
   ```

## 🔐 Authentication

PilotBar uses **GitHub's OAuth Device Code Flow** for secure authentication - no need to manually create tokens!

1. Click on the PilotBar icon in the top bar
2. Click "🔑 Login with GitHub"
3. A dialog will appear with a code (automatically copied to clipboard)
4. Your browser will open to GitHub's device activation page
5. Paste the code and authorize the app
6. The extension will automatically detect authorization after few seconds

The OAuth token is stored securely in `~/.config/pilotbar-github-oauth-token


## 🎨 Usage

### Top Bar Display

- **Icon**: GitHub Copilot logo (SVG)
- **Percentage**: Your current quota usage (e.g., "82%")
- **Status**: "--" when loading, "❌" on error
- **Auto-refresh**: Updates automatically every 5 minutes

### Menu Options

- **Copilot Status**: Shows current quota and usage details
- **AI Models**: Number of available Copilot models
- **🔄 Refresh Status**: Manually update quota information (also refreshes automatically every 5 minutes)
- **📊 View Usage on GitHub**: Opens GitHub Copilot settings page
- **🔑 Login with GitHub**: Start OAuth authentication flow
- **🚪 Logout**: Remove stored token

### Quota Updates

Your quota is automatically fetched:
- ✅ On extension startup (if logged in)
- ✅ After successful OAuth login
- ✅ Every 5 minutes automatically
- ✅ When you click "🔄 Refresh Status"

## 🔧 Configuration

Configuration files are stored in `~/.config/`:

- `pilotbar-github-oauth-token` - OAuth access token (created automatically)
- `pilotbar-settings.json` - Extension settings (future use)

## 🛠️ Development

### File Structure

```
PilotBar/
├── extension.js              # Main extension code
├── metadata.json             # Extension metadata
├── icons/
│   └── copilot-symbolic.svg  # GitHub Copilot icon
├── install.sh                # Installation script
└── README.md                 # This file
```

### Making Changes

1. Edit files in the repository
2. Run `./install.sh` to copy changes
3. Reload GNOME Shell:
   - **Wayland**: Log out and back in
   - **X11**: Press `Alt+F2`, type `r`, press Enter

### Debugging

View real-time logs:
```bash
journalctl -f /usr/bin/gnome-shell | grep -i pilotbar
```

Check extension status:
```bash
gnome-extensions show pilotbar@perpuchaty.github.com
```

Check for errors:
```bash
journalctl -b --no-pager /usr/bin/gnome-shell | grep -i "pilotbar\|error"
```

## 🐛 Troubleshooting

### Extension doesn't appear in top bar

```bash
# Check if extension is enabled
gnome-extensions list --enabled | grep pilotbar

# Enable it if not
gnome-extensions enable pilotbar@perpuchaty.github.com

# View extension logs
journalctl -b --no-pager /usr/bin/gnome-shell | grep -i pilotbar
```

### Authentication fails

1. Click "🚪 Logout" in the menu
2. Click "🔑 Login with GitHub" again
3. If still failing, check logs for errors
4. Make sure you have an active GitHub Copilot subscription

### "Extension is not defined" error

Make sure you're using GNOME Shell 45 or higher. Check version:
```bash
gnome-shell --version
```

### Icon doesn't show

Make sure the icons folder was copied correctly:
```bash
ls -la ~/.local/share/gnome-shell/extensions/pilotbar@perpuchaty.github.com/icons/
```

## 📝 API Details

PilotBar uses GitHub's internal Copilot API:

- **Endpoint**: `https://api.github.com/copilot_internal/user`
- **Auth**: OAuth 2.0 Device Code Flow
- **Client ID**: `Iv1.b507a08c87ecfe98` (GitHub Copilot official client)
- **Scopes**: Default scopes for device code flow

The extension polls this endpoint every 30 minutes to keep quota data fresh.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- GitHub Copilot for the API access
- GNOME Shell developers for the extension framework
- The open-source community for inspiration

## 📧 Contact

- GitHub: [@perpuchaty](https://github.com/perpuchaty)
- Project: [PilotBar](https://github.com/perpuchaty/PilotBar)

## 🔮 Future Features

- [ ] Custom refresh intervals
- [ ] Desktop notifications for low quota
- [ ] Usage history tracking
- [ ] Multi-account support
- [ ] Support for GitHub Copilot Business

## 🔒 Privacy & Security

- Your OAuth token is stored locally in `~/.config/pilotbar-github-oauth-token`
- The file has restricted permissions (readable only by you)
- No data is sent anywhere except GitHub's official API
- The extension runs entirely locally on your machine
- OAuth flow uses GitHub's official client ID

---

Made with ❤️ for the GNOME community
- Token is only used to fetch your Copilot quota

## License

MIT License - Feel free to modify and share!
