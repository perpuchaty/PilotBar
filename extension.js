import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const CONFIG_FILE = GLib.get_home_dir() + '/.config/pilotbar-github-oauth-token';
const CLIENT_ID = 'Iv1.b507a08c87ecfe98'; // GitHub Copilot's official client ID

// Device Code OAuth Dialog (non-blocking)
const DeviceCodeDialog = GObject.registerClass(
class DeviceCodeDialog extends ModalDialog.ModalDialog {
    _init(userCode, verificationUri, onComplete) {
        super._init({ styleClass: 'modal-dialog' });
        this._onComplete = onComplete;
        
        this.setButtons([{
            label: 'Got It!',
            action: () => this.close(),
            key: Clutter.KEY_Escape
        }]);
        
        let content = new St.BoxLayout({ vertical: true, style: 'spacing: 12px; padding: 20px;' });
        
        let title = new St.Label({
            text: 'GitHub Copilot Authentication',
            style: 'font-size: 16pt; font-weight: bold;'
        });
        content.add_child(title);
        
        let instructions = new St.Label({
            text: '✨ Browser opened! Enter this code:\n(Code copied to clipboard)',
            style: 'font-size: 11pt;'
        });
        instructions.clutter_text.line_wrap = true;
        content.add_child(instructions);
        
        let codeBox = new St.BoxLayout({
            vertical: false,
            style: 'background-color: #2d2d2d; padding: 15px; border-radius: 8px; spacing: 10px;',
            x_align: Clutter.ActorAlign.CENTER
        });
        
        let codeLabel = new St.Label({
            text: userCode,
            style: 'font-size: 24pt; font-weight: bold; color: #00ff00; font-family: monospace;'
        });
        codeBox.add_child(codeLabel);
        
        let copyButton = new St.Button({
            label: '📋',
            style: 'font-size: 18pt; padding: 5px 10px;'
        });
        this._copyButtonTimeout = null;
        copyButton.connect('clicked', () => {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, userCode);
            copyButton.label = '✅';
            // Clear any existing timeout before creating new one
            if (this._copyButtonTimeout) {
                GLib.source_remove(this._copyButtonTimeout);
            }
            this._copyButtonTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                copyButton.label = '📋';
                this._copyButtonTimeout = null;
                return GLib.SOURCE_REMOVE;
            });
        });
        codeBox.add_child(copyButton);
        
        content.add_child(codeBox);
        
        let urlLabel = new St.Label({
            text: 'URL: ' + verificationUri,
            style: 'font-size: 9pt; color: #888;'
        });
        content.add_child(urlLabel);
        
        let waiting = new St.Label({
            text: '\n⏳ Waiting for authorization...\nYou can close this dialog.',
            style: 'font-size: 10pt; font-style: italic;'
        });
        content.add_child(waiting);
        
        this.contentLayout.add_child(content);
        
        // Auto-copy code to clipboard
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, userCode);
        
        // Auto-open browser
        try {
            Gio.AppInfo.launch_default_for_uri(verificationUri, null);
        } catch (e) {
            // Silently fail if browser can't open
        }
    }
});

const GitHubCopilotIndicator = GObject.registerClass(
class GitHubCopilotIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'GitHub Copilot Quota Indicator');
        
        this._extension = extension;
        this._extensionPath = extension.path;
        this._token = null;
        this._quotaData = null;
        this._session = new Soup.Session();
        this._refreshTimeout = null;
        this._settings = extension.getSettings();
        
        // Listen for settings changes to refresh display
        this._settingsChangedId = this._settings.connect('changed::display-format', () => {
            if (this._quotaData) {
                this._parseCopilotData(this._quotaData);
            }
        });
        
        // Create icon and label for the top bar
        let box = new St.BoxLayout({ style_class: 'panel-button' });
        
        // Use GitHub Copilot SVG icon
        this._icon = this._createGitHubIcon();
        
        this._statusLabel = new St.Label({
            text: ' --',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-left: 4px;'
        });
        
        box.add_child(this._icon);
        box.add_child(this._statusLabel);
        this.add_child(box);
        
        // Build menu
        this._buildMenu();
        
        // Load saved token and fetch quota
        this._loadToken();
        
        // Start auto-refresh every 5 minutes
        this._startAutoRefresh();
    }
    
    _createGitHubIcon() {
        let iconPath = GLib.build_filenamev([this._extensionPath, 'icons', 'copilot-symbolic.svg']);
        let iconFile = Gio.File.new_for_path(iconPath);
        
        if (iconFile.query_exists(null)) {
            let gicon = Gio.FileIcon.new(iconFile);
            return new St.Icon({
                gicon: gicon,
                icon_size: 16,
                style_class: 'system-status-icon'
            });
        } else {
            // Fallback to text
            return new St.Label({
                text: 'GH',
                y_align: Clutter.ActorAlign.CENTER,
                style: 'font-weight: bold;'
            });
        }
    }
    
    _buildMenu() {
        // Token status section
        this._loginStatusItem = new PopupMenu.PopupMenuItem('Not logged in');
        this._loginStatusItem.reactive = false;
        this.menu.addMenuItem(this._loginStatusItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Copilot status
        this._copilotStatusItem = new PopupMenu.PopupMenuItem('Copilot: Checking...');
        this._copilotStatusItem.reactive = false;
        this.menu.addMenuItem(this._copilotStatusItem);
        
        // Models count
        this._modelsItem = new PopupMenu.PopupMenuItem('AI Models: --');
        this._modelsItem.reactive = false;
        this.menu.addMenuItem(this._modelsItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Actions
        let refreshItem = new PopupMenu.PopupMenuItem('🔄 Refresh Status');
        refreshItem.connect('activate', () => {
            this._fetchQuota();
        });
        this.menu.addMenuItem(refreshItem);
        
        let usageItem = new PopupMenu.PopupMenuItem('📊 View Usage on GitHub');
        usageItem.connect('activate', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('https://github.com/settings/copilot', null);
            } catch (e) {
                Main.notify('PilotBar', 'Could not open browser');
            }
        });
        this.menu.addMenuItem(usageItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let oauthItem = new PopupMenu.PopupMenuItem('🔐 Login with GitHub OAuth');
        oauthItem.connect('activate', () => {
            this._startOAuthFlow();
        });
        this.menu.addMenuItem(oauthItem);
        
        let logoutItem = new PopupMenu.PopupMenuItem('🚪 Logout');
        logoutItem.connect('activate', () => {
            this._logout();
        });
        this.menu.addMenuItem(logoutItem);
    }
    
    _loadToken() {
        try {
            let file = Gio.File.new_for_path(CONFIG_FILE);
            if (file.query_exists(null)) {
                let [success, contents] = file.load_contents(null);
                if (success) {
                    this._token = new TextDecoder().decode(contents).trim();
                    this._loginStatusItem.label.text = '✅ Logged in';
                    this._fetchQuota();
                    this._startAutoRefresh();
                    return;
                }
            }
        } catch (e) {
            // Token loading failed, user needs to log in
        }
        this._loginStatusItem.label.text = '❌ Not logged in';
    }
    
    _saveToken(token) {
        try {
            let file = Gio.File.new_for_path(CONFIG_FILE);
            let tokenBytes = new GLib.Bytes(new TextEncoder().encode(token));
            
            file.replace_contents(
                tokenBytes.get_data(),
                null,
                false,
                Gio.FileCreateFlags.PRIVATE,
                null
            );
            
            this._token = token;
            this._loginStatusItem.label.text = '✅ Logged in';
            this._fetchQuota();
            this._startAutoRefresh();
        } catch (e) {
            Main.notify('PilotBar', `Error saving token: ${e}`);
            console.debug(`PilotBar: Error saving token: ${e}`);
        }
    }
    
    _logout() {
        try {
            // Stop auto-refresh
            this._stopAutoRefresh();
            
            let file = Gio.File.new_for_path(CONFIG_FILE);
            if (file.query_exists(null)) {
                file.delete(null);
            }
            this._token = null;
            this._quotaData = null;
            this._loginStatusItem.label.text = '❌ Not logged in';
            this._copilotStatusItem.label.text = 'Copilot: --';
            this._modelsItem.label.text = 'AI Models: --';
            this._statusLabel.text = ' AI';
            Main.notify('PilotBar', 'Logged out successfully');
        } catch (e) {
            Main.notify('PilotBar', `Error logging out: ${e}`);
        }
    }
    
    _startOAuthFlow() {
        // Step 1: Request device code
        let message = Soup.Message.new('POST', 'https://github.com/login/device/code');
        message.request_headers.append('Accept', 'application/json');
        message.request_headers.append('Content-Type', 'application/json');
        
        let requestBody = JSON.stringify({
            client_id: CLIENT_ID,
            scope: 'user:email'
        });
        message.set_request_body_from_bytes('application/json', 
            new GLib.Bytes(new TextEncoder().encode(requestBody)));
        
        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                let bytes = session.send_and_read_finish(result);
                let decoder = new TextDecoder('utf-8');
                let response = decoder.decode(bytes.get_data());
                let data = JSON.parse(response);
                
                if (data.device_code && data.user_code && data.verification_uri) {
                    // Show dialog with code
                    let dialog = new DeviceCodeDialog(data.user_code, data.verification_uri, () => {
                        dialog.close();
                    });
                    dialog.open();
                    
                    // Start polling for token
                    this._pollForToken(data.device_code, data.interval || 5);
                } else {
                    Main.notify('PilotBar', 'Failed to start OAuth flow');
                }
            } catch (e) {
                Main.notify('PilotBar', 'OAuth request failed: ' + e);
            }
        });
    }
    
    _pollForToken(deviceCode, interval) {
        // Store device code for potential interval changes
        this._oauthDeviceCode = deviceCode;
        this._oauthInterval = interval;
        
        // Schedule next poll
        this._scheduleOAuthPoll();
    }
    
    _scheduleOAuthPoll() {
        // Clear any existing timeout
        if (this._pollingTimeout) {
            GLib.source_remove(this._pollingTimeout);
            this._pollingTimeout = null;
        }
        
        this._pollingTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._oauthInterval, () => {
            this._doOAuthPoll();
            return GLib.SOURCE_REMOVE;  // Don't repeat automatically, we'll schedule next one
        });
    }
    
    _doOAuthPoll() {
        let message = Soup.Message.new('POST', 'https://github.com/login/oauth/access_token');
        message.request_headers.append('Accept', 'application/json');
        message.request_headers.append('Content-Type', 'application/json');
        
        let requestBody = JSON.stringify({
            client_id: CLIENT_ID,
            device_code: this._oauthDeviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });
        message.set_request_body_from_bytes('application/json', 
            new GLib.Bytes(new TextEncoder().encode(requestBody)));
        
        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                let bytes = session.send_and_read_finish(result);
                let decoder = new TextDecoder('utf-8');
                let response = decoder.decode(bytes.get_data());
                let data = JSON.parse(response);
                
                if (data.access_token) {
                    // SUCCESS! We got the token!
                    // Clear polling state
                    this._oauthDeviceCode = null;
                    this._oauthInterval = null;
                    
                    // Save the token
                    this._saveToken(data.access_token);
                    Main.notify('PilotBar', '✅ OAuth authentication successful!');
                    // Don't schedule another poll - we're done!
                    
                } else if (data.error === 'authorization_pending') {
                    // User hasn't authorized yet, keep polling
                    this._scheduleOAuthPoll();
                    
                } else if (data.error === 'slow_down') {
                    // GitHub wants us to slow down - increase interval
                    let newInterval = data.interval || (this._oauthInterval + 5);
                    this._oauthInterval = newInterval;
                    this._scheduleOAuthPoll();
                    
                } else if (data.error === 'expired_token') {
                    // Device code expired (usually after 15 minutes)
                    Main.notify('PilotBar', '❌ Code expired. Please try again.');
                    this._oauthDeviceCode = null;
                    this._oauthInterval = null;
                    
                } else if (data.error === 'access_denied') {
                    // User denied the request
                    Main.notify('PilotBar', '❌ Authorization was denied.');
                    this._oauthDeviceCode = null;
                    this._oauthInterval = null;
                    
                } else if (data.error) {
                    // Some other error
                    console.debug(`PilotBar: OAuth error - ${data.error}`);
                    Main.notify('PilotBar', 'OAuth failed: ' + data.error);
                    this._oauthDeviceCode = null;
                    this._oauthInterval = null;
                }
            } catch (e) {
                console.debug(`PilotBar: OAuth polling error - ${e}`);
                // Try again on network errors
                this._scheduleOAuthPoll();
            }
        });
    }
    
    _startAutoRefresh() {
        // Stop any existing refresh timer
        this._stopAutoRefresh();
        
        // Refresh quota every 5 minutes (300 seconds)
        this._refreshTimeout = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            300,
            () => {
                if (this._token) {
                    this._fetchQuota();
                }
                return GLib.SOURCE_CONTINUE; // Keep repeating
            }
        );
    }
    
    _stopAutoRefresh() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }
    }
    
    _fetchQuota() {
        if (!this._token) {
            Main.notify('PilotBar', 'Please set your GitHub token first');
            return;
        }
        
        this._copilotStatusItem.label.text = 'Copilot: Checking...';
        this._modelsItem.label.text = 'AI Models: Loading...';
        
        // Check if user has access to GitHub Models (indicates Copilot Pro)
        this._checkGitHubModels();
    }
    
    _checkGitHubModels() {
        // First check Copilot internal API for quota
        this._fetchCopilotQuota();
    }
    
    _fetchCopilotQuota() {
        let message = Soup.Message.new(
            'GET',
            'https://api.github.com/copilot_internal/user'
        );
        
        message.request_headers.append('Authorization', `Bearer ${this._token}`);
        message.request_headers.append('Accept', 'application/vnd.github+json');
        message.request_headers.append('X-GitHub-Api-Version', '2022-11-28');
        message.request_headers.append('User-Agent', 'PilotBar-GNOME-Extension/1.0');
        
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder('utf-8');
                    let response = decoder.decode(bytes.get_data());
                    
                    if (message.status_code === 200) {
                        let data = JSON.parse(response);
                        this._parseCopilotData(data);
                    } else if (message.status_code === 404) {
                        // Fallback to Models API
                        this._checkModelsAPI();
                    } else {
                        this._copilotStatusItem.label.text = `Error: ${message.status_code}`;
                        this._modelsItem.label.text = 'Check token';
                    }
                } catch (e) {
                    this._copilotStatusItem.label.text = 'Error checking status';
                    this._modelsItem.label.text = 'Check token permissions';
                    console.debug(`PilotBar: API error - ${e}`);
                }
            }
        );
    }
    
    _parseCopilotData(data) {
        try {
            let plan = data.copilot_plan || 'unknown';
            let snapshots = data.quota_snapshots || {};
            let resetDate = data.quota_reset_date || '';
            
            // Show plan type and reset date
            if (plan === 'individual') {
                this._copilotStatusItem.label.text = '✅ Copilot Pro Active';
            } else if (plan === 'business') {
                this._copilotStatusItem.label.text = '✅ Copilot Business';
            } else {
                this._copilotStatusItem.label.text = '✅ Copilot Active';
            }
            
            // Parse premium quota (the one that matters!)
            let premium = snapshots.premium_interactions;
            if (premium && !premium.unlimited) {
                let remaining = premium.remaining || 0;
                let total = premium.entitlement || 300;  // From API
                let used = total - remaining;
                
                // Calculate dollar values
                // Fixed values - $20 budget is standard for Copilot Pro
                // Price ~$0.04 per overage request (average across models)
                let budgetDollars = 20.0;
                let pricePerOverage = 0.04;
                
                // GitHub bills only for OVERAGE requests (used - entitlement)
                // Included requests are free
                let overageRequests = Math.max(0, used - total);
                let spentDollars = overageRequests * pricePerOverage;
                let remainingBudgetDollars = Math.max(0, budgetDollars - spentDollars);
                let overBudgetDollars = Math.max(0, spentDollars - budgetDollars);
                let percentUsed = budgetDollars > 0 ? (spentDollars / budgetDollars) * 100 : 0;
                let percentRemainingBudget = Math.max(0, Math.min(100, 100 - percentUsed));
                
                // Get display format from settings
                let displayFormat = this._settings.get_string('display-format');
                
                // Update menu item (always show full info)
                if (overBudgetDollars > 0) {
                    this._modelsItem.label.text = `Budget: $${spentDollars.toFixed(2)}/$${budgetDollars.toFixed(2)} ❌`;
                    this._icon.text = '🔴';
                } else if (percentRemainingBudget < 20) {
                    this._modelsItem.label.text = `Budget: $${spentDollars.toFixed(2)}/$${budgetDollars.toFixed(2)} (${Math.round(percentRemainingBudget)}% left)`;
                    this._icon.text = '⚠️';
                } else {
                    this._modelsItem.label.text = `Budget: $${spentDollars.toFixed(2)}/$${budgetDollars.toFixed(2)} (${Math.round(percentRemainingBudget)}% left)`;
                    this._icon.text = '🤖';
                }
                
                // Update top bar based on display format
                switch (displayFormat) {
                    case 'spent-budget':
                        this._statusLabel.text = ` $${spentDollars.toFixed(2)}/$${budgetDollars.toFixed(2)}`;
                        break;
                    case 'spent-only':
                        this._statusLabel.text = ` $${spentDollars.toFixed(2)}`;
                        break;
                    case 'requests':
                        this._statusLabel.text = ` ${used}/${total}`;
                        break;
                    case 'percentage':
                    default:
                        this._statusLabel.text = ` ${Math.round(percentRemainingBudget)}%`;
                        break;
                }
                
                // Add reset date info to menu if available
                if (resetDate) {
                    // Show when budget resets
                    let resetInfo = `Resets: ${resetDate}`;
                    if (!this._resetInfoItem) {
                        this._resetInfoItem = new PopupMenu.PopupMenuItem(resetInfo);
                        this._resetInfoItem.reactive = false;
                        // Insert after models item
                        this.menu.addMenuItem(this._resetInfoItem, 3);
                    } else {
                        this._resetInfoItem.label.text = resetInfo;
                    }
                }
                
            } else if (premium && premium.unlimited) {
                this._modelsItem.label.text = 'Premium: Unlimited ∞';
                this._statusLabel.text = ' ∞';
                this._icon.text = '🚀';
            } else {
                // Show chat/completions if no premium
                let chat = snapshots.chat;
                let completions = snapshots.completions;
                
                if (chat && chat.unlimited && completions && completions.unlimited) {
                    this._modelsItem.label.text = 'Chat & Completions: Unlimited';
                    this._statusLabel.text = ' ∞';
                    this._icon.text = '🤖';
                } else {
                    this._modelsItem.label.text = 'Quota: Active';
                    this._statusLabel.text = ' ✅';
                    this._icon.text = '🤖';
                }
            }
            
            this._quotaData = data;
        } catch (e) {
            console.debug(`PilotBar: Parse error - ${e}`);
            this._copilotStatusItem.label.text = 'Error parsing quota';
        }
    }
    
    _checkModelsAPI() {
        // Fallback: Check GitHub Models API
        let message = Soup.Message.new(
            'GET',
            'https://api.github.com/models'
        );
        
        message.request_headers.append('Authorization', `Bearer ${this._token}`);
        message.request_headers.append('Accept', 'application/vnd.github+json');
        message.request_headers.append('X-GitHub-Api-Version', '2022-11-28');
        message.request_headers.append('User-Agent', 'PilotBar-GNOME-Extension/1.0');
        
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder('utf-8');
                    let response = decoder.decode(bytes.get_data());
                    
                    if (message.status_code === 200) {
                        let data = JSON.parse(response);
                        this._copilotStatusItem.label.text = '✅ Copilot Pro Active';
                        this._modelsItem.label.text = `${data.length} AI Models available`;
                        this._statusLabel.text = ' ✅';
                        this._icon.text = '🤖';
                    } else {
                        this._copilotStatusItem.label.text = '❌ No Copilot Access';
                        this._modelsItem.label.text = 'Not available';
                        this._statusLabel.text = ' ❌';
                        this._icon.text = '🔒';
                    }
                } catch (e) {
                    // Silently fail Models API check
                }
            }
        );
    }
    
    _fetchRateLimits() {
        // Fetch API rate limits to show usage
        let message = Soup.Message.new(
            'GET',
            'https://api.github.com/rate_limit'
        );
        
        message.request_headers.append('Authorization', `token ${this._token}`);
        message.request_headers.append('Accept', 'application/vnd.github+json');
        message.request_headers.append('User-Agent', 'PilotBar-GNOME-Extension/1.0');
        
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder('utf-8');
                    let response = decoder.decode(bytes.get_data());
                    
                    if (message.status_code === 200) {
                        let data = JSON.parse(response);
                        let core = data.resources.core;
                        let remaining = core.remaining;
                        let limit = core.limit;
                        // Rate limit info available but not displayed
                    }
                } catch (e) {
                    // Silently fail rate limit check
                }
            }
        );
    }
    
    _verifyTokenAndFetchData() {
        // First, verify the token works by getting user info
        let message = Soup.Message.new(
            'GET',
            'https://api.github.com/user'
        );
        
        message.request_headers.append('Authorization', `token ${this._token}`);
        message.request_headers.append('Accept', 'application/vnd.github+json');
        message.request_headers.append('X-GitHub-Api-Version', '2022-11-28');
        message.request_headers.append('User-Agent', 'PilotBar-GNOME-Extension/1.0');
        
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder('utf-8');
                    let response = decoder.decode(bytes.get_data());
                    
                    if (message.status_code === 200) {
                        let userData = JSON.parse(response);
                        this._loginStatusItem.label.text = `✅ ${userData.login}`;
                        // Now try to fetch Copilot data
                        this._fetchCopilotData();
                    } else if (message.status_code === 401) {
                        this._quotaItem.label.text = 'Invalid token';
                        this._usageItem.label.text = 'Please check your token';
                        Main.notify('PilotBar', 'Token is invalid. Please set a new token.');
                    } else {
                        this._quotaItem.label.text = `Error: ${message.status_code}`;
                        Main.notify('PilotBar', `API Error: ${message.status_code}\n${response}`);
                    }
                } catch (e) {
                    this._quotaItem.label.text = 'Error verifying token';
                }
            }
        );
    }
    
    _fetchCopilotData() {
        // Try to fetch Copilot seat information
        let message = Soup.Message.new(
            'GET',
            'https://api.github.com/copilot/billing/seats'
        );
        
        message.request_headers.append('Authorization', `token ${this._token}`);
        message.request_headers.append('Accept', 'application/vnd.github+json');
        message.request_headers.append('X-GitHub-Api-Version', '2022-11-28');
        message.request_headers.append('User-Agent', 'PilotBar-GNOME-Extension/1.0');
        
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder('utf-8');
                    let response = decoder.decode(bytes.get_data());
                    
                    if (message.status_code === 200) {
                        this._parseQuotaResponse(response);
                    } else if (message.status_code === 404) {
                        // User doesn't have enterprise access, check individual subscription
                        this._checkIndividualSubscription();
                    } else {
                        this._quotaItem.label.text = `Copilot: ${message.status_code}`;
                        this._usageItem.label.text = 'See menu for details';
                    }
                } catch (e) {
                    this._quotaItem.label.text = 'Error fetching data';
                }
            }
        );
    }
    
    _checkIndividualSubscription() {
        // Check if user has individual Copilot subscription
        let message = Soup.Message.new(
            'GET',
            'https://api.github.com/user/copilot_seat_details'
        );
        
        message.request_headers.append('Authorization', `token ${this._token}`);
        message.request_headers.append('Accept', 'application/vnd.github+json');
        message.request_headers.append('X-GitHub-Api-Version', '2022-11-28');
        message.request_headers.append('User-Agent', 'PilotBar-GNOME-Extension/1.0');
        
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder('utf-8');
                    let response = decoder.decode(bytes.get_data());
                    
                    if (message.status_code === 200) {
                        let data = JSON.parse(response);
                        this._quotaItem.label.text = 'Copilot: Active ✅';
                        this._usageItem.label.text = `Plan: Individual`;
                        this._statusLabel.text = ' ✅';
                    } else {
                        this._quotaItem.label.text = 'Copilot: Not found';
                        this._usageItem.label.text = 'No active subscription';
                        this._statusLabel.text = ' ❓';
                    }
                } catch (e) {
                    this._quotaItem.label.text = 'Token valid, no Copilot';
                    this._usageItem.label.text = 'Check your subscription';
                }
            }
        );
    }
    
    _parseQuotaResponse(response) {
        try {
            let data = JSON.parse(response);
            
            if (data.error) {
                this._quotaItem.label.text = 'Copilot: Error';
                this._usageItem.label.text = data.error;
                this._statusLabel.text = ' ❌';
            } else if (data.seats && Array.isArray(data.seats)) {
                // Enterprise seats information
                let totalSeats = data.total_seats || data.seats.length;
                this._quotaItem.label.text = `Seats: ${totalSeats}`;
                this._usageItem.label.text = `Enterprise Plan`;
                this._statusLabel.text = ' ✅';
                this._quotaData = data;
            } else if (data.assignee) {
                // Individual subscription
                this._quotaItem.label.text = 'Copilot: Active ✅';
                this._usageItem.label.text = `User: ${data.assignee.login || 'You'}`;
                this._statusLabel.text = ' ✅';
                this._quotaData = data;
            } else {
                // Unknown structure - show what we got
                this._quotaItem.label.text = 'Copilot: Active';
                this._usageItem.label.text = 'Connected ✅';
                this._statusLabel.text = ' ✅';
                this._quotaData = data;
            }
        } catch (e) {
            this._quotaItem.label.text = 'Error parsing response';
            this._statusLabel.text = ' ❌';
            console.debug(`PilotBar: Parse error - ${e}`);
        }
    }
    
    destroy() {
        // Disconnect settings signal
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        // Clean up OAuth polling timeout to prevent memory leaks
        if (this._pollingTimeout) {
            GLib.source_remove(this._pollingTimeout);
            this._pollingTimeout = null;
        }
        
        // Clean up auto-refresh timeout to prevent memory leaks
        this._stopAutoRefresh();
        
        // Abort all pending HTTP requests to prevent callbacks after destroy
        if (this._session) {
            this._session.abort();
            this._session = null;
        }
        
        super.destroy();
    }
});

export default class PilotBarExtension extends Extension {
    enable() {
        this._indicator = new GitHubCopilotIndicator(this);
        Main.panel.addToStatusArea('pilotbar-indicator', this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
