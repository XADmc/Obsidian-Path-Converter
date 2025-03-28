import { App, Plugin, PluginManifest, TFile, PluginSettingTab, Setting, Platform, TAbstractFile, Notice } from 'obsidian';

declare module 'obsidian' {
    interface Vault {
        on(name: 'modify' | 'save', callback: (file: TFile) => any): EventRef;
    }
}

interface PathConverterSettings {
    osType: "auto" | "windows" | "macos";
    excludedFolders: string;
}

const DEFAULT_SETTINGS: PathConverterSettings = {
    osType: "auto",
    excludedFolders: "node/mx,ex/te"
};

// 防抖函数类型
type Debouncer<T extends unknown[], V> = {
    (...args: [...T]): V;
    cancel(): void;
};

function debounce<T extends unknown[], V>(
    func: (...args: [...T]) => V,
    wait: number = 300,
    immediate: boolean = false
): Debouncer<T, V> {
    let timeout: number | null = null;
    let result: V;

    const debounced = (...args: [...T]) => {
        if (timeout !== null) clearTimeout(timeout);

        if (immediate && timeout === null) {
            result = func(...args);
        }

        timeout = window.setTimeout(() => {
            timeout = null;
            if (!immediate) {
                result = func(...args);
            }
        }, wait);

        return result;
    };

    debounced.cancel = () => {
        if (timeout !== null) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    return debounced as Debouncer<T, V>;
}

class PathConverterSettingTab extends PluginSettingTab {
    plugin: PathConverterPlugin;

    constructor(app: App, plugin: PathConverterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('操作系统设置')
            .setDesc('选择路径转换模式')
            .addDropdown(dropdown => dropdown
                .addOption('auto', '自动检测')
                .addOption('windows', 'Windows 模式 (使用反斜杠\\)')
                .addOption('macos', 'macOS 模式 (使用正斜杠/)')
                .setValue(this.plugin.settings.osType)
                .onChange(async (value) => {
                    this.plugin.settings.osType = value as "auto" | "windows" | "macos";
                    await this.plugin.saveSettings();
                    this.plugin.processAllFiles().then(() => {
                        new Notice('自动转换已完成！');
                    });
                }));

        new Setting(containerEl)
            .setName('排除目录')
            .setDesc('输入要排除的目录（路径分隔符为/，多个路径逗号分隔）')
            .addText(text => text
                .setPlaceholder('node/mx,ex/te')
                .setValue(this.plugin.settings.excludedFolders)
                .onChange(async (value) => {
                    this.plugin.settings.excludedFolders = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('立即转换所有文件')
            .setDesc('强制重新处理所有Markdown文件')
            .addButton(button => button
                .setButtonText('开始转换')
                .onClick(() => {
                    this.plugin.processAllFiles().then(() => {
                        new Notice('手动转换已完成！');
                    });
                }));
    }
}

export default class PathConverterPlugin extends Plugin {
    settings: PathConverterSettings = DEFAULT_SETTINGS;
    private isProcessing = false;

    async onload() {
        console.log('路径转换插件已加载');
        await this.loadSettings();

        this.addSettingTab(new PathConverterSettingTab(this.app, this));

        // 注册文件监听器（带防抖）
        this.registerEvent(
            this.app.vault.on('modify', (file: TAbstractFile) => {
                if (this.shouldProcessFile(file)) {
                    this.debouncedProcessFile(file as TFile);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('save', (file: TAbstractFile) => {
                if (this.shouldProcessFile(file)) {
                    this.debouncedProcessFile(file as TFile);
                }
            })
        );
    }

    private debouncedProcessFile = debounce(
        (file: TFile) => this.processFile(file),
        500,
        true
    );

    private shouldProcessFile(file: TAbstractFile): boolean {
        if (!(file instanceof TFile)) return false;
        if (file.extension !== 'md') return false;
        
        // 检查排除目录
        const excludePatterns = this.settings.excludedFolders
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        return !excludePatterns.some(pattern => 
            file.path.startsWith(pattern)
        );
    }

    async processAllFiles(): Promise<void> {
        if (this.isProcessing) {
            new Notice('转换正在进行中，请稍候...');
            return;
        }

        this.isProcessing = true;
        const files = this.app.vault.getMarkdownFiles().filter(f => 
            this.shouldProcessFile(f)
        );

        let successCount = 0;
        let errorCount = 0;
        const batchSize = 20;
        
        new Notice(`开始处理 ${files.length} 个文件...`, 5000);

        try {
            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                await Promise.all(batch.map(async (file) => {
                    try {
                        await this.processFile(file);
                        successCount++;
                    } catch (error) {
                        console.error(`处理失败: ${file.path}`, error);
                        errorCount++;
                    }
                }));
                
                // 更新进度通知
                new Notice(
                    `已处理 ${Math.min(i + batchSize, files.length)}/${files.length} 个文件...`,
                    3000
                );
            }
        } finally {
            this.isProcessing = false;
            new Notice(
                `处理完成！\n成功: ${successCount} 个\n失败: ${errorCount} 个`,
                10000
            );
        }
    }

    private async processFile(file: TFile): Promise<void> {
        const content = await this.app.vault.read(file);
        const newContent = this.convertPaths(content);
        
        if (newContent !== content) {
            await this.app.vault.modify(file, newContent);
            console.log(`已更新文件: ${file.path}`);
        }
    }

    private convertPaths(content: string): string {
        const isWindows = this.shouldUseWindowsFormat();
        
        return content.replace(/!\[.*?\]\((.*?)\)/g, (match, path) => {
            // 跳过网络路径和绝对路径
            if (path.startsWith('http') || path.startsWith('/')) return match;
            
            // 转换路径分隔符
            const converted = isWindows ? 
                path.replace(/\//g, '\\') : 
                path.replace(/\\/g, '/');
            
            return converted !== path ? match.replace(path, converted) : match;
        });
    }

    private shouldUseWindowsFormat(): boolean {
        switch (this.settings.osType) {
            case 'auto': return Platform.isWin;
            case 'windows': return true;
            case 'macos': return false;
            default: return Platform.isWin;
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async onunload() {
        console.log('路径转换插件已卸载');
        this.debouncedProcessFile.cancel();
    }
}