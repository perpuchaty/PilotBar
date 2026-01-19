import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PilotBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Display Settings',
            description: 'Configure how budget information is displayed in the top bar'
        });
        page.add(group);
        
        // Display format dropdown
        const formatRow = new Adw.ComboRow({
            title: 'Top Bar Display Format',
            subtitle: 'Choose how to show budget in the panel'
        });
        
        const formatModel = new Gtk.StringList();
        formatModel.append('Percentage (e.g. 85%)');
        formatModel.append('Spent/Budget (e.g. $17/$20)');
        formatModel.append('Spent Only (e.g. $17)');
        formatModel.append('Requests (e.g. 425/300)');
        formatRow.model = formatModel;
        
        // Map setting value to index
        const formatMap = ['percentage', 'spent-budget', 'spent-only', 'requests'];
        const currentFormat = settings.get_string('display-format');
        formatRow.selected = Math.max(0, formatMap.indexOf(currentFormat));
        
        formatRow.connect('notify::selected', () => {
            settings.set_string('display-format', formatMap[formatRow.selected]);
        });
        
        group.add(formatRow);
        
        // Info row
        const infoRow = new Adw.ActionRow({
            title: 'How it works',
            subtitle: 'Budget resets monthly. Spent = overage requests × ~$0.04'
        });
        group.add(infoRow);
        
        window.add(page);
    }
}
