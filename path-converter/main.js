"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
class PathConverterPlugin extends obsidian_1.Plugin {
    constructor(app, manifest) {
        super(app, manifest);
    }
    async onload() {
        console.log('Loading Path Converter Plugin');
        // 监听文件修改事件
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof obsidian_1.TFile && file.extension === 'md') {
                this.processFile(file);
            }
        }));
    }
    async processFile(file) {
        const content = await this.app.vault.read(file);
        const newContent = this.convertPaths(content);
        if (newContent !== content) {
            await this.app.vault.modify(file, newContent);
        }
    }
    convertPaths(content) {
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
exports.default = PathConverterPlugin;
