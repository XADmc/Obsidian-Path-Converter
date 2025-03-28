import { App, Plugin, PluginManifest, TFile } from 'obsidian';

// 扩展 Vault 接口定义
declare module 'obsidian' {
    interface Vault {
        on(name: 'modify', callback: (file: TFile) => any): EventRef;
    }
}

export default class PathConverterPlugin extends Plugin {
    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
    }

    async onload() {
        console.log('Loading Path Converter Plugin');

        // 监听文件修改事件
        this.registerEvent(
            this.app.vault.on('modify', (file: TFile) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.processFile(file);
                }
            })
        );
    }

    private async processFile(file: TFile) {
        const content = await this.app.vault.read(file);
        const newContent = this.convertPaths(content);
        if (newContent !== content) {
            await this.app.vault.modify(file, newContent);
        }
    }

    private convertPaths(content: string): string {
        const regex = /!\[(.*?)\]\((.*?)\)/g;
        return content.replace(regex, (match, alt, path) => {
            const newPath = path.replace(/\\/g, '/');
            return `![${alt}](${newPath})`;
        });
    }

    async onunload() {
        console.log('Unloading Path Converter Plugin');
    }
}