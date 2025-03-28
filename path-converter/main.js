"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_SETTINGS = {
    osType: "auto",
    excludedFolders: "node/mx,ex/te"
};
function debounce(func, wait = 300, immediate = false) {
    let timeout = null;
    let result;
    const debounced = (...args) => {
        if (timeout !== null)
            clearTimeout(timeout);
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
    return debounced;
}
class PathConverterSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian_1.Setting(containerEl)
            .setName('操作系统设置')
            .setDesc('选择路径转换模式')
            .addDropdown(dropdown => dropdown
            .addOption('auto', '自动检测')
            .addOption('windows', 'Windows 模式 (使用反斜杠\\)')
            .addOption('macos', 'macOS 模式 (使用正斜杠/)')
            .setValue(this.plugin.settings.osType)
            .onChange(async (value) => {
            this.plugin.settings.osType = value;
            await this.plugin.saveSettings();
            this.plugin.processAllFiles().then(() => {
                new obsidian_1.Notice('自动转换已完成！');
            });
        }));
        new obsidian_1.Setting(containerEl)
            .setName('排除目录')
            .setDesc('输入要排除的目录（路径分隔符为/，多个路径逗号分隔）')
            .addText(text => text
            .setPlaceholder('node/mx,ex/te')
            .setValue(this.plugin.settings.excludedFolders)
            .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('立即转换所有文件')
            .setDesc('强制重新处理所有Markdown文件')
            .addButton(button => button
            .setButtonText('开始转换')
            .onClick(() => {
            this.plugin.processAllFiles().then(() => {
                new obsidian_1.Notice('手动转换已完成！');
            });
        }));
    }
}
class PathConverterPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
        this.isProcessing = false;
        this.debouncedProcessFile = debounce((file) => this.processFile(file), 500, true);
    }
    async onload() {
        console.log('路径转换插件已加载');
        await this.loadSettings();
        this.addSettingTab(new PathConverterSettingTab(this.app, this));
        // 注册文件监听器（带防抖）
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (this.shouldProcessFile(file)) {
                this.debouncedProcessFile(file);
            }
        }));
        this.registerEvent(this.app.vault.on('save', (file) => {
            if (this.shouldProcessFile(file)) {
                this.debouncedProcessFile(file);
            }
        }));
    }
    shouldProcessFile(file) {
        if (!(file instanceof obsidian_1.TFile))
            return false;
        if (file.extension !== 'md')
            return false;
        // 检查排除目录
        const excludePatterns = this.settings.excludedFolders
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        return !excludePatterns.some(pattern => file.path.startsWith(pattern));
    }
    async processAllFiles() {
        if (this.isProcessing) {
            new obsidian_1.Notice('转换正在进行中，请稍候...');
            return;
        }
        this.isProcessing = true;
        const files = this.app.vault.getMarkdownFiles().filter(f => this.shouldProcessFile(f));
        let successCount = 0;
        let errorCount = 0;
        const batchSize = 20;
        new obsidian_1.Notice(`开始处理 ${files.length} 个文件...`, 5000);
        try {
            for (let i = 0; i < files.length; i += batchSize) {
                const batch = files.slice(i, i + batchSize);
                await Promise.all(batch.map(async (file) => {
                    try {
                        await this.processFile(file);
                        successCount++;
                    }
                    catch (error) {
                        console.error(`处理失败: ${file.path}`, error);
                        errorCount++;
                    }
                }));
                // 更新进度通知
                new obsidian_1.Notice(`已处理 ${Math.min(i + batchSize, files.length)}/${files.length} 个文件...`, 3000);
            }
        }
        finally {
            this.isProcessing = false;
            new obsidian_1.Notice(`处理完成！\n成功: ${successCount} 个\n失败: ${errorCount} 个`, 10000);
        }
    }
    async processFile(file) {
        const content = await this.app.vault.read(file);
        const newContent = this.convertPaths(content);
        if (newContent !== content) {
            await this.app.vault.modify(file, newContent);
            console.log(`已更新文件: ${file.path}`);
        }
    }
    convertPaths(content) {
        const isWindows = this.shouldUseWindowsFormat();
        return content.replace(/!\[.*?\]\((.*?)\)/g, (match, path) => {
            // 跳过网络路径和绝对路径
            if (path.startsWith('http') || path.startsWith('/'))
                return match;
            // 转换路径分隔符
            const converted = isWindows ?
                path.replace(/\//g, '\\') :
                path.replace(/\\/g, '/');
            return converted !== path ? match.replace(path, converted) : match;
        });
    }
    shouldUseWindowsFormat() {
        switch (this.settings.osType) {
            case 'auto': return obsidian_1.Platform.isWin;
            case 'windows': return true;
            case 'macos': return false;
            default: return obsidian_1.Platform.isWin;
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
exports.default = PathConverterPlugin;
