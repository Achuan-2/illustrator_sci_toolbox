const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('client/index.html');
const runtime = read('client/i18n.js');
const host = read('host/index.jsx');
const illustrator = read('jsx/arrange.jsx');
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const dictionaries = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale, JSON.parse(read(`client/i18n/${locale}.json`))]));
const storageKey = 'illustrator_sci_plugin_settings';

// Exercise the actual panel scripts with a small DOM/CEP adapter. This tests
// language state and host messages without requiring an Illustrator process.
function createPanel(saved, options = {}) {
    const windowEvents = {};
    const elements = [];
    const byId = new Map();
    const markup = html.slice(0, html.indexOf('    <!-- Dependencies -->'))
        .replace(/<style>[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
    for (const match of markup.matchAll(/<(\w+)\b([^<>]*)>/g)) {
        const tag = match[1].toUpperCase();
        const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
        const classes = new Set((attributes.class || '').split(/\s+/));
        const element = {
            tagName: tag, type: attributes.type, value: attributes.value || '',
            checked: /\bchecked\b/.test(match[2]), textContent: '', style: {}, events: {},
            dataset: Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5), value])),
            getAttribute(name) { return attributes[name] ?? null; },
            setAttribute(name, value) { attributes[name] = String(value); },
            removeAttribute(name) { delete attributes[name]; },
            addEventListener(name, callback) { (this.events[name] ||= []).push(callback); },
            dispatch(name) { for (const callback of this.events[name] || []) callback.call(this, { target: this }); },
            classList: {
                add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
                contains(name) { return classes.has(name); },
                toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
            }
        };
        Object.defineProperty(element, 'id', { value: attributes.id });
        if (tag === 'SELECT') {
            const body = markup.slice(match.index + match[0].length).split('</select>')[0];
            const choices = [...body.matchAll(/<option\b([^>]*)>/g)];
            const selected = choices.find(choice => /\bselected\b/.test(choice[1])) || choices[0];
            element.value = /value="([^"]*)"/.exec(selected[1])[1];
        }
        elements.push(element);
        if (element.id) byId.set(element.id, element);
    }
    function matches(element, selector) {
        if (selector.startsWith('#')) return element.id === selector.slice(1);
        const attr = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(selector);
        if (attr && (element.getAttribute(attr[1]) === null || (attr[2] && element.getAttribute(attr[1]) !== attr[2]))) return false;
        const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
        if (classes.length) return classes.every(name => element.classList.contains(name));
        if (attr) return true;
        return element.tagName === selector.toUpperCase();
    }
    const stored = new Map(saved === undefined ? [] : [[storageKey, saved]]);
    const alerts = [];
    const context = vm.createContext({
        document: {
            documentElement: {}, getElementById: id => byId.get(id),
            querySelectorAll: selector => elements.filter(element => selector.split(',').some(part => matches(element, part.trim()))),
            querySelector: selector => elements.find(element => matches(element, selector))
        },
        localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
        console: { log() {}, error() {} },
        location: { hash: options.hash || '' },
        setTimeout() { return 1; }, clearTimeout() {},
        addEventListener(name, callback) { (windowEvents[name] ||= []).push(callback); },
        alert: message => alerts.push(message),
        XMLHttpRequest: function () {
            this.open = (method, url) => { this.url = url; };
            this.send = () => {
                this.status = 0; // CEP file:// response
                const locale = /i18n\/(\w+)\.json/.exec(this.url)[1];
                const values = { ...dictionaries[locale] };
                if (options.missingChineseKey && locale === 'zh_CN') delete values[options.missingChineseKey];
                this.responseText = JSON.stringify(values);
            };
        },
        SystemPath: { EXTENSION: 'extension' },
        CSInterface: function () {
            this.getSystemPath = () => root;
            this.evalScript = (script, callback) => { if (callback) callback(context.nextHostResult); };
        }
    });
    context.window = context;
    vm.runInContext(runtime, context, { filename: 'client/i18n.js' });
    inlineScripts.forEach(script => vm.runInContext(script, context));
    vm.runInContext(host, context, { filename: 'host/index.jsx' });
    for (const callback of windowEvents.load || []) callback();
    return { context, elements, byId, stored, alerts };
}

test('all referenced keys and interpolation placeholders have matching translations', () => {
    assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.zh_CN).sort());
    for (const key of Object.keys(dictionaries.en)) {
        const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
        assert.deepEqual(placeholders(dictionaries.en[key]), placeholders(dictionaries.zh_CN[key]), key);
    }
    const references = [
        ...[...html.matchAll(/data-i18n(?:-title|-placeholder|-alt)?="([^"]+)"/g)].map(match => match[1]),
        ...[...host.matchAll(/I18n\.t\("([^"]+)"/g)].map(match => match[1]),
        ...[...host.matchAll(/I18n\.bind\([^,]+, ["'][^"']+["'], ["']([^"']+)["']/g)].map(match => match[1]),
        ...[...illustrator.matchAll(/sciError\("([^"]+)"/g)].map(match => match[1])
    ];
    for (const key of references) assert.ok(dictionaries.en[key], `Missing key: ${key}`);
    assert.doesNotMatch(host, /alert\(["']/);
    assert.doesNotMatch(illustrator, /\balert\(/);
});

test('English is the default, settings tab works, and saved language survives reopening', () => {
    const panel = createPanel(undefined, { hash: '#settings' });
    assert.equal(panel.context.document.documentElement.lang, 'en');
    assert.equal(panel.byId.get('panel-title').textContent, 'Settings');
    assert.equal(panel.byId.get('panel-settings').classList.contains('active'), true);
    panel.byId.get('font-size').value = '14';
    panel.byId.get('language').value = 'zh_CN';
    panel.byId.get('language').dispatch('change');
    assert.equal(panel.byId.get('panel-title').textContent, '设置');
    assert.equal(panel.byId.get('copy-pos-button').textContent, '复制');
    const saved = panel.stored.get(storageKey);
    assert.equal(JSON.parse(saved).language, 'zh_CN');
    const reopened = createPanel(saved);
    assert.equal(reopened.context.document.documentElement.lang, 'zh-CN');
    assert.equal(reopened.byId.get('language').value, 'zh_CN');
    assert.equal(reopened.byId.get('font-size').value, 14);
    reopened.byId.get('language').value = 'en';
    reopened.byId.get('language').dispatch('change');
    assert.equal(reopened.byId.get('panel-title').textContent, 'Relative Position');
    assert.equal(JSON.parse(reopened.stored.get(storageKey)).fontSize, 14);
});

test('old, invalid, and unsupported saved language settings use English', () => {
    for (const saved of ['{"fontSize":12}', '{broken', '{"language":"fr"}', 'null']) {
        const panel = createPanel(saved);
        assert.equal(panel.byId.get('language').value, 'en');
        assert.equal(panel.byId.get('copy-pos-button').textContent, 'Copy');
    }
});

test('dynamic placeholders and editing hints switch language without losing form values', () => {
    const panel = createPanel();
    panel.context.nextHostResult = '[{"deltaX":1,"deltaY":2},{"deltaX":3,"deltaY":4}]';
    panel.context.handleCopyPosition();
    assert.equal(panel.byId.get('delta-x').getAttribute('placeholder'), 'Multiple Values (2)');
    panel.context.enterLabelEditingMode();
    const offset = panel.byId.get('label-offset-x');
    offset.value = '-12';
    panel.context.I18n.setLanguage('zh_CN');
    assert.equal(panel.byId.get('delta-x').getAttribute('placeholder'), '多个值（2）');
    assert.equal(offset.getAttribute('title'), '更改数值，将实时移动标签位置');
    assert.equal(offset.value, '-12');
    panel.context.exitLabelEditingMode();
    panel.context.I18n.setLanguage('en');
    assert.equal(offset.getAttribute('data-i18n-title'), null);
    assert.equal(offset.title, '');
});

test('ExtendScript keys and encoded arguments produce localized panel alerts without native JSON', () => {
    const jsx = vm.createContext({ app: { documents: [] }, JSON: undefined });
    vm.runInContext(illustrator, jsx, { filename: 'jsx/arrange.jsx' });
    const panel = createPanel('{"language":"zh_CN"}');
    for (const name of ['arrangeImages', 'addLabelsToImages', 'updateLabelIndex', 'filterTextFrames', 'filterSelection', 'copyRelativePosition', 'pasteRelativePosition', 'copySize', 'pasteSize', 'swapSelectedPositions', 'distributeSpacing', 'measureSpacing', 'copySpacing', 'pasteSpacing', 'addBorder', 'updateLabelOffsets']) {
        assert.equal(panel.context.I18n.formatError(jsx[name]()), '错误：没有打开的文档。', name);
    }
    panel.context.nextHostResult = jsx.arrangeImages();
    panel.context.handleArrange();
    assert.equal(panel.alerts.pop(), '错误：没有打开的文档。');
    const detail = '包含 |、% 和换行\n的消息';
    assert.equal(panel.context.I18n.formatError(jsx.sciError('errors.addLabel', [2, detail])), `错误：为第 2 个对象添加标签时出错：${detail}`);
    panel.context.nextHostResult = jsx.sciError('errors.countMismatch', [3, 2]);
    panel.context.handlePastePosition();
    assert.equal(panel.alerts.pop(), '错误：要移动的对象数量（3）与已保存的数据数量（2）不匹配。');
});

test('missing Chinese entries fall back to the English dictionary', () => {
    const panel = createPanel('{"language":"zh_CN"}', { missingChineseKey: 'common.copy' });
    assert.equal(panel.byId.get('copy-pos-button').textContent, 'Copy');
    assert.equal(panel.context.I18n.t('relative.multipleValues', { count: 3 }), '多个值（3）');
});
