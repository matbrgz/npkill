import { MARGINS } from '../../../constants/main.constants.js';
import { BaseUi, InteractiveUi } from '../base.ui.js';
import { IKeyPress } from '../../interfaces/key-press.interface.js';
import { Subject } from 'rxjs';
import pc from 'picocolors';
import { IConfig } from '../../../cli/interfaces/config.interface.js';
import { OPTIONS_HINTS_BY_TYPE } from '../../../constants/options.constants.js';

type OptionType = 'checkbox' | 'dropdown' | 'input';

interface OptionItem<K extends keyof IConfig = keyof IConfig> {
  label: string;
  type: OptionType;
  key: K;
  value: IConfig[K];
  options?: string[]; // dropdown options
}

export class OptionsUi extends BaseUi implements InteractiveUi {
  resultIndex = 0;
  readonly goBack$ = new Subject<null>();
  readonly goToHelp$ = new Subject<null>();
  private readonly config: IConfig;

  private selectedIndex = 0;
  private isEditing = false;
  private editBuffer = '';

  private options: OptionItem[];

  private readonly KEYS: Record<string, () => void> = {
    up: () => this.move(-1),
    down: () => this.move(1),
    k: () => this.move(-1),
    j: () => this.move(1),
    return: () => this.activateSelected(),
    space: () => this.activateSelected(),
    left: () => this.goToHelp(),
    right: () => this.goBack(),
    h: () => this.goToHelp(),
    l: () => this.goBack(),
    escape: () => (this.isEditing ? this.cancelEdit() : this.goBack()),
    q: () => this.goBack(),
  };

  constructor(
    private readonly changeConfig$: Subject<Partial<IConfig>>,
    config: IConfig,
  ) {
    super();
    this.config = { ...config };
    this.initializeOptions();
  }

  private initializeOptions(): void {
    this.options = [
      // SEARCH
      {
        label: 'Target folder',
        type: 'input',
        key: 'targets',
        value: this.config.targets,
      },
      {
        label: 'Cwd',
        type: 'input',
        key: 'folderRoot',
        value: this.config.folderRoot,
      },
      {
        label: 'Exclude',
        type: 'input',
        key: 'exclude',
        value: this.config.exclude,
      },
      {
        label: 'Exclude hidden dirs.',
        type: 'checkbox',
        key: 'excludeHiddenDirectories',
        value: this.config.excludeHiddenDirectories,
      },

      // DISPLAY
      {
        label: 'Sort by',
        type: 'dropdown',
        key: 'sortBy',
        value: this.config.sortBy,
        options: ['path', 'size', 'last-mod'],
      },
      {
        label: 'Size unit',
        type: 'dropdown',
        key: 'sizeUnit',
        value: this.config.sizeUnit,
        options: ['auto', 'mb', 'gb'],
      },

      // SAFETY
      {
        label: 'Dry-run mode',
        type: 'checkbox',
        key: 'dryRun',
        value: this.config.dryRun,
      },
    ];
  }

  private move(dir: -1 | 1): void {
    if (this.isEditing) return;
    this.selectedIndex =
      (this.selectedIndex + dir + this.options.length) % this.options.length;
    this.render();
  }

  private activateSelected(): void {
    const opt = this.options[this.selectedIndex];

    if (opt.type === 'checkbox') {
      // Direct assignment for boolean types
      opt.value = !opt.value as IConfig[typeof opt.key];
      const key = opt.key as keyof Pick<
        IConfig,
        {
          [K in keyof IConfig]: IConfig[K] extends boolean ? K : never;
        }[keyof IConfig]
      >;
      this.config[key] = !!opt.value;
      this.emitConfigChange(opt.key, opt.value);
      this.render();
    } else if (opt.type === 'dropdown') {
      const key = opt.key as keyof Pick<
        IConfig,
        {
          [K in keyof IConfig]: IConfig[K] extends string ? K : never;
        }[keyof IConfig]
      >;
      const idx = opt.options!.indexOf(opt.value as string);
      const next = (idx + 1) % opt.options!.length;
      opt.value = opt.options![next] as IConfig[typeof key];

      if (opt.key === 'sizeUnit') {
        this.config[key] = opt.value as IConfig['sizeUnit'];
      } else {
        this.config[opt.key as any] = opt.value as IConfig[typeof opt.key];
      }

      this.emitConfigChange(opt.key, opt.value);
      this.render();
    } else if (opt.type === 'input') {
      this.isEditing = true;
      // Convert value to string for current edit buffer
      const val = opt.value;
      this.editBuffer = Array.isArray(val) ? val.join(',') : String(val);
      this.render();
    }
  }

  private handleEditKey(name: string, sequence: string): void {
    const opt = this.options[this.selectedIndex];

    if (opt.type !== 'input') {
      this.isEditing = false;
      this.render();
      return;
    }

    if (name === 'return') {
      if (opt.key === 'targets' || opt.key === 'exclude') {
        const arrValue: string[] = this.editBuffer
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        this.config[opt.key] = arrValue;
        this.emitConfigChange(opt.key, arrValue);
        // Correctly assign array back to value
        // We need to cast or ensure type safety, but essentially we are putting back the correct type
        (opt.value as string[]) = arrValue; 
      } else {

        const key = opt.key as keyof Pick<
          IConfig,
          {
            [K in keyof IConfig]: IConfig[K] extends string ? K : never;
          }[keyof IConfig]
        >;
        const newValue: IConfig[typeof opt.key] = this
          .editBuffer as IConfig[typeof opt.key];
        this.config[key as any] = newValue as unknown as string;
        opt.value = newValue;
        this.emitConfigChange(opt.key, newValue);
      }
      this.isEditing = false;
      this.render();
    } else if (name === 'escape') {
      this.cancelEdit();
    } else if (name === 'backspace') {
      this.editBuffer = this.editBuffer.slice(0, -1);
      this.render();
    } else if (sequence && sequence.length === 1) {
      this.editBuffer += sequence;
      this.render();
    }
  }

  private emitConfigChange<K extends keyof IConfig>(
    key: K,
    value: IConfig[K],
  ): void {
    const configChange: Partial<IConfig> = { [key]: value } as Partial<IConfig>;
    this.changeConfig$.next(configChange);
  }

  private cancelEdit(): void {
    this.isEditing = false;
    this.editBuffer = '';
    this.render();
  }

  onKeyInput(key: IKeyPress): void {
    if (this.isEditing) {
      this.handleEditKey(key.name, key.sequence);
      return;
    }

    const action = this.KEYS[key.name];
    if (action) action();
  }

  private goBack(): void {
    this.clear();
    this.goBack$.next(null);
  }

  private goToHelp(): void {
    this.clear();
    this.goToHelp$.next(null);
  }

  render(): void {
    this.clear();
    this.printHintMessage();
    let currentRow = MARGINS.ROW_RESULTS_START;

    // Header
    this.printAt(pc.bgBlue(pc.black(pc.bold('  OPTIONS MENU  '))), {
      x: 1,
      y: currentRow++,
    });
    currentRow++;

    const groups = [
      { name: 'SEARCH', items: ['targets', 'folderRoot', 'exclude', 'excludeHiddenDirectories'] },
      { name: 'DISPLAY', items: ['sortBy', 'sizeUnit'] },
      { name: 'SAFETY', items: ['dryRun'] },
    ];

    let optionIndex = 0;

    for (const group of groups) {
      if (currentRow >= this.terminal.rows - 2) break; // Integrity check

      // Print Group Header
      this.printAt(pc.gray(`[ ${group.name} ]`), { x: 2, y: currentRow++ });

      const groupOptions = this.options.filter(opt => group.items.includes(opt.key));

      for (const opt of groupOptions) {
        // Find the original index of this option in the main list to handle global selection index
        const globalIndex = this.options.findIndex(o => o.key === opt.key);
        const isSelected = globalIndex === this.selectedIndex;
        
        const label = `${opt.label.padEnd(20)}`;
        let valueText = '';
        
        if (opt.type === 'checkbox') {
          valueText = opt.value ? pc.green('Enabled') : pc.red('Disabled');
        } else if (opt.type === 'dropdown') {
          valueText = pc.yellow(`${opt.value}`);
        } else if (opt.type === 'input') {
          valueText =
            this.isEditing && isSelected
              ? pc.blue(this.editBuffer + '_')
              : pc.cyan(String(opt.value || '')); // Show empty string if null/undefined
            
          // Truncate if too long for display
          if (!this.isEditing && valueText.length > 30) {
             valueText = valueText.substring(0, 27) + '...';
          }
        }

        // Selection Marker
        const marker = isSelected ? pc.cyan('>') : ' ';
        const line = `${marker} ${label} ${valueText}`;
        
        this.printAt(line, { x: 4, y: currentRow++ });

        // If selected and dropdown, show options below
        if (opt.type === 'dropdown' && isSelected) {
          const dropdownOptions = opt.options || [];
          const optionsText = dropdownOptions.map(o => 
            o === opt.value ? pc.bgCyan(pc.black(` ${o} `)) : pc.gray(` ${o} `)
          ).join(' ');
          
          this.printAt(`    ${optionsText}`, { x: 25, y: currentRow++ });
          currentRow++; // Extra space after dropdown
        }
      }
      currentRow++; // Space between groups
    }
  }

  private printHintMessage() {
    const optionSelected = this.options[this.selectedIndex];

    const hintText =
      optionSelected.type === 'input' && this.isEditing
        ? OPTIONS_HINTS_BY_TYPE['input-exit']
        : OPTIONS_HINTS_BY_TYPE[optionSelected.type];

    if (!hintText) {
      return;
    }

    this.printAt(hintText, {
      x: 15,
      y: MARGINS.ROW_RESULTS_START,
    });
  }

  clear(): void {
    for (let row = MARGINS.ROW_RESULTS_START; row < this.terminal.rows; row++) {
      this.clearLine(row);
    }
  }
}
