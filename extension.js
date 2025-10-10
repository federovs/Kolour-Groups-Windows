import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';

const GRAYSCALE_LEVELS = {
    LEVEL_1: 0.25,
    LEVEL_2: 0.5,
    LEVEL_3: 0.75,
    LEVEL_4: 1.0
};

const KEYBINDINGS = {
    GRAYSCALE_25: 'grayscale-25',
    GRAYSCALE_50: 'grayscale-50', 
    GRAYSCALE_75: 'grayscale-75',
    GRAYSCALE_100: 'grayscale-100',
    REMOVE_EFFECTS: 'remove-effects',
    WINDOW_GROUP: 'window-group',
    GLOBAL_GRAYSCALE: 'global-grayscale'
};

export default class KolourGroupsExtension {
    constructor(metadata) {
        this.metadata = metadata;
        this._keybindings = [];
    }

    enable() {
        this._setupKeybindings();
        this._restoreEffects();
    }

    _setupKeybindings() {
        const bindings = [
            {
                name: KEYBINDINGS.GRAYSCALE_25,
                callback: () => this._applyGrayscale(GRAYSCALE_LEVELS.LEVEL_1)
            },
            {
                name: KEYBINDINGS.GRAYSCALE_50,
                callback: () => this._applyGrayscale(GRAYSCALE_LEVELS.LEVEL_2)
            },
            {
                name: KEYBINDINGS.GRAYSCALE_75, 
                callback: () => this._applyGrayscale(GRAYSCALE_LEVELS.LEVEL_3)
            },
            {
                name: KEYBINDINGS.GRAYSCALE_100,
                callback: () => this._applyGrayscale(GRAYSCALE_LEVELS.LEVEL_4)
            },
            {
                name: KEYBINDINGS.REMOVE_EFFECTS,
                callback: () => this._removeAllEffects()
            },
            {
                name: KEYBINDINGS.WINDOW_GROUP,
                callback: () => this._showWindowGrouper()
            },
            {
                name: KEYBINDINGS.GLOBAL_GRAYSCALE,
                callback: () => this._toggleGlobalGrayscale()
            }
        ];

        bindings.forEach(binding => {
            try {
                Main.wm.addKeybinding(
                    binding.name,
                    {
                        get_default: () => this._getDefaultBinding(binding.name)
                    },
                    Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL,
                    binding.callback
                );
                this._keybindings.push(binding.name);
            } catch (e) {
                log(`Error adding keybinding ${binding.name}: ${e}`);
            }
        });
    }

    _getDefaultBinding(name) {
        const defaults = {
            [KEYBINDINGS.GRAYSCALE_25]: ['<Super><Shift>1'],
            [KEYBINDINGS.GRAYSCALE_50]: ['<Super><Shift>2'],
            [KEYBINDINGS.GRAYSCALE_75]: ['<Super><Shift>3'],
            [KEYBINDINGS.GRAYSCALE_100]: ['<Super><Shift>4'],
            [KEYBINDINGS.REMOVE_EFFECTS]: ['<Super><Shift>0'],
            [KEYBINDINGS.WINDOW_GROUP]: ['<Super>G'],
            [KEYBINDINGS.GLOBAL_GRAYSCALE]: ['<Super><Shift>G']
        };
        return defaults[name] || [];
    }

    _applyGrayscale(level) {
        const focusedWindow = global.get_window_actors().find(actor => 
            actor.get_meta_window()?.has_focus()
        );
        
        if (focusedWindow) {
            focusedWindow.remove_effect_by_name('grayscale-effect');
            
            const effect = new Clutter.DesaturateEffect();
            effect.factor = level;
            focusedWindow.add_effect_with_name('grayscale-effect', effect);
            
            this._saveWindowState(focusedWindow, level);
        }
    }

    _removeAllEffects() {
        global.get_window_actors().forEach(actor => {
            actor.remove_effect_by_name('grayscale-effect');
        });
    }

    _showWindowGrouper() {
        const windows = global.get_window_actors().filter(actor => {
            const metaWindow = actor.get_meta_window();
            return metaWindow && 
                   metaWindow.get_window_type() === Meta.WindowType.NORMAL &&
                   !metaWindow.minimized;
        });
        
        log(`[Kolour Groups] Showing ${windows.length} windows in group view`);
    }

    _toggleGlobalGrayscale() {
        if (Main.uiGroup.get_effect('global-grayscale-effect')) {
            Main.uiGroup.remove_effect_by_name('global-grayscale-effect');
        } else {
            const effect = new Clutter.DesaturateEffect();
            effect.factor = 1.0;
            Main.uiGroup.add_effect_with_name('global-grayscale-effect', effect);
        }
    }

    _saveWindowState(actor, level) {
        const metaWindow = actor.get_meta_window();
        if (metaWindow) {
            metaWindow._kolour_grayscale_level = level;
        }
    }

    _restoreEffects() {
        global.get_window_actors().forEach(actor => {
            const metaWindow = actor.get_meta_window();
            if (metaWindow && metaWindow._kolour_grayscale_level !== undefined) {
                const effect = new Clutter.DesaturateEffect();
                effect.factor = metaWindow._kolour_grayscale_level;
                actor.add_effect_with_name('grayscale-effect', effect);
            }
        });
    }

    disable() {
        this._keybindings.forEach(name => {
            try {
                Main.wm.removeKeybinding(name);
            } catch (e) {
            }
        });
        this._keybindings = [];

        global.get_window_actors().forEach(actor => {
            actor.remove_effect_by_name('grayscale-effect');
        });

        Main.uiGroup.remove_effect_by_name('global-grayscale-effect');
    }
}
