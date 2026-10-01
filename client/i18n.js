/* UI translations are stored in i18n/en.json and i18n/zh_CN.json. */
(function (global) {
    'use strict';

    var dictionaries = {};
    var language = 'en';

    function normalizeLanguage(value) {
        return value === 'zh_CN' ? 'zh_CN' : 'en';
    }

    function loadDictionary(locale) {
        // CEP serves the panel from file://; the manifest permits local file access.
        // Load these small bundled files before the host handlers and UI initialize.
        var request = new XMLHttpRequest();
        request.open('GET', 'i18n/' + locale + '.json', false);
        request.send();
        if (request.status !== 0 && request.status !== 200) {
            throw new Error('Could not load locale: ' + locale);
        }
        return JSON.parse(request.responseText);
    }

    function t(key, params) {
        var current = dictionaries[language] || {};
        var fallback = dictionaries.en || {};
        var value = current[key] || fallback[key] || key;
        return value.replace(/\{(\w+)\}/g, function (match, name) {
            return params && params[name] !== undefined ? String(params[name]) : match;
        });
    }

    function apply() {
        document.documentElement.lang = language === 'zh_CN' ? 'zh-CN' : 'en';
        ['text', 'title', 'placeholder', 'alt'].forEach(function (attribute) {
            var marker = attribute === 'text' ? 'data-i18n' : 'data-i18n-' + attribute;
            var elements = document.querySelectorAll('[' + marker + ']');
            Array.prototype.forEach.call(elements, function (element) {
                var params = JSON.parse(element.getAttribute('data-i18n-params') || '{}');
                var value = t(element.getAttribute(marker), params);
                if (attribute === 'text') element.textContent = value;
                else element.setAttribute(attribute, value);
            });
        });

        var activeTab = document.querySelector('.tab.active');
        var title = document.getElementById('panel-title');
        if (title && activeTab) title.textContent = activeTab.textContent;
        var select = document.getElementById('language');
        if (select) select.value = language;
    }

    // ExtendScript returns Error: key|URI-encoded argument|... . Keep the
    // Error: prefix so existing success/error routing continues to work.
    function formatError(result) {
        var parts = String(result).replace(/^Error:\s*/, '').split('|');
        var key = parts.shift();
        var params = parts.map(function (part) {
            try { return decodeURIComponent(part); } catch (e) { return part; }
        });
        return t('errors.prefix') + t(key, params);
    }

    ['en', 'zh_CN'].forEach(function (locale) {
        try { dictionaries[locale] = loadDictionary(locale); }
        catch (e) { console.error('Failed to load translations:', e); }
    });

    global.I18n = {
        t: t,
        apply: apply,
        formatError: formatError,
        normalizeLanguage: normalizeLanguage,
        setLanguage: function (value) {
            language = normalizeLanguage(value);
            apply();
        },
        // Retain dynamic translation keys so placeholders/tooltips also update
        // when the user switches languages without re-running the operation.
        bind: function (element, attribute, key, params) {
            element.setAttribute('data-i18n-' + attribute, key);
            element.setAttribute('data-i18n-params', JSON.stringify(params || {}));
            element.setAttribute(attribute, t(key, params));
        }
    };
})(window);
