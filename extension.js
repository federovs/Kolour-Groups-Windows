import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
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

const CustomGrayscaleEffect = GObject.registerClass({
    GTypeName: 'CustomGrayscaleEffect',
}, class CustomGrayscaleEffect extends Clutter.ShaderEffect {
    _init(level) {
        super._init();
        this._level = level;
        
        this.set_shader_source(`
            uniform sampler2D tex;
            uniform float grayscale_factor;
            
            void main() {
                vec4 color = texture2D(tex, cogl_tex_coord_in[0].st);
                float intensity = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                vec3 grayscale = vec3(intensity);
                vec3 final_color = mix(color.rgb, grayscale, grayscale_factor);
                cogl_color_out = vec4(final_color, color.a);
            }
        `);
        
        this.set_uniform_value('grayscale_factor', this._level);
    }
    
    set level(value) {
        this._level = value;
        this.set_uniform_value('grayscale_factor', value);
    }
    
    get level() {
        return this._level;
    }
});

export default class KolourGroupsExtension {
    constructor(metadata) {
        this.metadata = metadata;
        this._keybindings = [];
        this._windowGroupUI = null;
        this._globalEffectActive = false;
    }

    enable() {
        this._setupKeybindings();
        this._restoreEffects();
    }

    _setupKeybindings() {
        const bindings = [
            {
                name: KEYBINDINGS.GRAYSCALE_25,
                callback: () => this._applyGrayscaleToFocused(GRAYSCALE_LEVELS.LEVEL_1)
            },
            {
                name: KEYBINDINGS.GRAYSCALE_50,
                callback: () => this._applyGrayscaleToFocused(GRAYSCALE_LEVELS.LEVEL_2)
            },
            {
                name: KEYBINDINGS.GRAYSCALE_75, 
                callback: () => this._applyGrayscaleToFocused(GRAYSCALE_LEVELS.LEVEL_3)
            },
            {
                name: KEYBINDINGS.GRAYSCALE_100,
                callback: () => this._applyGrayscaleToFocused(GRAYSCALE_LEVELS.LEVEL_4)
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
            Main.wm.addKeybinding(
                binding.name,
                {
                    get_default: () => this._getDefaultBinding(binding.name)
                },
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                binding.callback
            );
            this._keybindings.push(binding.name);
        });
    }

    _getDefaultBinding(name) {
        const defaults = {
            [KEYBINDINGS.GRAYSCALE_25]: ['<Primary><Alt>K1'],
            [KEYBINDINGS.GRAYSCALE_50]: ['<Primary><Alt>K2'],
            [KEYBINDINGS.GRAYSCALE_75]: ['<Primary><Alt>K3'],
            [KEYBINDINGS.GRAYSCALE_100]: ['<Primary><Alt>K4'],
            [KEYBINDINGS.REMOVE_EFFECTS]: ['<Primary><Alt>K0'],
            [KEYBINDINGS.WINDOW_GROUP]: ['<Primary><Alt>G'],
            [KEYBINDINGS.GLOBAL_GRAYSCALE]: ['<Primary><Alt>Q']
        };
        return defaults[name] || [];
    }

    _applyGrayscaleToFocused(level) {
        const focusedWindow = this._getFocusedWindow();
        
        if (focusedWindow) {
            focusedWindow.remove_effect_by_name('custom-grayscale-effect');
            
            const effect = new CustomGrayscaleEffect(level);
            focusedWindow.add_effect_with_name('custom-grayscale-effect', effect);
            
            this._saveWindowState(focusedWindow, level);
        }
    }

    _getFocusedWindow() {
        return global.get_window_actors().find(actor => {
            const metaWindow = actor.get_meta_window();
            return metaWindow && metaWindow.has_focus();
        });
    }

    _removeAllEffects() {
        global.get_window_actors().forEach(actor => {
            actor.remove_effect_by_name('custom-grayscale-effect');
        });
        
        global.get_window_actors().forEach(actor => {
            const metaWindow = actor.get_meta_window();
            if (metaWindow && metaWindow._kolour_grayscale_level) {
                delete metaWindow._kolour_grayscale_level;
            }
        });
    }

    _showWindowGrouper() {
        if (this._windowGroupUI) {
            this._hideWindowGrouper();
            return;
        }

        const windows = this._getVisibleWindows();
        
        if (windows.length === 0) {
            return;
        }

        this._createWindowGroupUI(windows);
    }

    _getVisibleWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        return global.get_window_actors().filter(actor => {
            const metaWindow = actor.get_meta_window();
            return metaWindow && 
                   metaWindow.get_window_type() === Meta.WindowType.NORMAL &&
                   !metaWindow.minimized &&
                   metaWindow.get_workspace() === workspace;
        });
    }

    _createWindowGroupUI(windows) {
        const container = new St.BoxLayout({
            vertical: true,
            style_class: 'window-group-container',
            reactive: true,
            width: 450,
            height: 600
        });

        const title = new St.Label({
            text: `📁 Ventanas (${windows.length})`,
            style_class: 'window-group-title'
        });
        container.add_child(title);

        const scrollView = new St.ScrollView({
            style_class: 'window-group-scroll',
            x_expand: true,
            y_expand: true
        });

        const scrollBox = new St.BoxLayout({
            vertical: true,
            style_class: 'window-group-scrollbox'
        });

        windows.forEach((actor, index) => {
            const metaWindow = actor.get_meta_window();
            const title = metaWindow.get_title() || 'Sin título';
            const button = new St.Button({
                style_class: 'window-group-button',
                label: ` ${index + 1}. ${title}`,
                can_focus: true,
                reactive: true
            });
            
            button.connect('clicked', () => {
                metaWindow.activate(global.get_current_time());
                this._hideWindowGrouper();
            });
            
            button.connect('enter-event', () => {
                button.add_style_pseudo_class('hover');
            });
            
            button.connect('leave-event', () => {
                button.remove_style_pseudo_class('hover');
            });
            
            scrollBox.add_child(button);
        });

        scrollView.add_actor(scrollBox);
        container.add_child(scrollView);

        const closeButton = new St.Button({
            style_class: 'window-group-close-button',
            label: 'Cerrar',
            can_focus: true
        });
        
        closeButton.connect('clicked', () => {
            this._hideWindowGrouper();
        });
        
        container.add_child(closeButton);

        Main.layoutManager.addChrome(container);
        container.add_style_class_name('window-group-visible');

        this._windowGroupUI = container;

        global.stage.set_key_focus(container);

        this._keyPressId = container.connect('key-press-event', (actor, event) => {
            return this._handleWindowGroupKeyPress(actor, event, windows);
        });
    }

    _handleWindowGroupKeyPress(actor, event, windows) {
        const symbol = event.get_key_symbol();
        
        switch(symbol) {
            case Clutter.KEY_Escape:
                this._hideWindowGrouper();
                return true;
            case Clutter.KEY_1:
            case Clutter.KEY_2:
            case Clutter.KEY_3:
            case Clutter.KEY_4:
            case Clutter.KEY_5:
            case Clutter.KEY_6:
            case Clutter.KEY_7:
            case Clutter.KEY_8:
            case Clutter.KEY_9:
                const index = symbol - Clutter.KEY_1;
                if (index < windows.length) {
                    const metaWindow = windows[index].get_meta_window();
                    metaWindow.activate(global.get_current_time());
                    this._hideWindowGrouper();
                }
                return true;
        }
        
        return false;
    }

    _hideWindowGrouper() {
        if (this._windowGroupUI) {
            if (this._keyPressId) {
                this._windowGroupUI.disconnect(this._keyPressId);
                this._keyPressId = null;
            }
            
            this._windowGroupUI.destroy();
            this._windowGroupUI = null;
        }
    }

    _toggleGlobalGrayscale() {
        if (this._globalEffectActive) {
            Main.uiGroup.remove_effect_by_name('global-grayscale-effect');
            this._globalEffectActive = false;
        } else {
            const effect = new CustomGrayscaleEffect(1.0);
            Main.uiGroup.add_effect_with_name('global-grayscale-effect', effect);
            this._globalEffectActive = true;
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
                const effect = new CustomGrayscaleEffect(metaWindow._kolour_grayscale_level);
                actor.add_effect_with_name('custom-grayscale-effect', effect);
            }
        });
    }

    disable() {
        this._keybindings.forEach(name => {
            Main.wm.removeKeybinding(name);
        });
        this._keybindings = [];

        global.get_window_actors().forEach(actor => {
            actor.remove_effect_by_name('custom-grayscale-effect');
        });

        if (this._globalEffectActive) {
            Main.uiGroup.remove_effect_by_name('global-grayscale-effect');
            this._globalEffectActive = false;
        }

        if (this._windowGroupUI) {
            this._hideWindowGrouper();
        }
    }
}
