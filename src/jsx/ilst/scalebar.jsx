// Physical calibration is independent of Illustrator's document/display units.
// Keep ES3 syntax: this file also runs in older ExtendScript hosts.
function scaleUnitFactor(unit) {
    var u = String(unit || "").toLowerCase().replace(/\s/g, "").replace(/[μµ]/g, "u");
    var factors = { nm: 0.001, um: 1, micron: 1, microns: 1, micrometer: 1,
        micrometers: 1, mm: 1000, cm: 10000, m: 1000000, inch: 25400, inches: 25400, "in": 25400 };
    return factors[u] || 0;
}

function scaleUnitName(unit) {
    var factor = scaleUnitFactor(unit);
    var names = { "0.001": "nm", "1": "um", "1000": "mm", "10000": "cm", "1000000": "m", "25400": "inch" };
    return names[String(factor)] || "um";
}

function scaleLabel(options, fov) {
    var unit = scaleUnitName(options.unit || fov.unit);
    var value = Number((options.lengthUm / scaleUnitFactor(unit)).toPrecision(12));
    return String(value) + (unit === "um" ? "μm" : unit);
}

function validScaleFov(fov) {
    return fov && isFinite(fov.width) && isFinite(fov.height) && fov.width > 0 && fov.height > 0 && scaleUnitFactor(fov.unit) > 0;
}

function scaleXmlAttribute(text, name) {
    var match = new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i").exec(text);
    return match ? match[1].replace(/&#181;|&#xB5;|&micro;/gi, "µ").replace(/&#956;|&#x3BC;/gi, "μ") : null;
}

// OME uses physical pixel sizes; ImageJ uses TIFF pixels-per-unit plus unit=.
// Do not infer a microscope calibration from ordinary printing DPI alone.
function scaleFovFromTiffMetadata(meta) {
    var description = meta.description || "", pixels = /<(?:\w+:)?Pixels\b[^>]*>/i.exec(description);
    if (pixels) {
        var p = pixels[0], x = Number(scaleXmlAttribute(p, "PhysicalSizeX")), y = Number(scaleXmlAttribute(p, "PhysicalSizeY"));
        var xf = scaleUnitFactor(scaleXmlAttribute(p, "PhysicalSizeXUnit") || "um");
        var yf = scaleUnitFactor(scaleXmlAttribute(p, "PhysicalSizeYUnit") || "um");
        if (x > 0 && y > 0 && xf && yf) return { width: meta.width * x, height: meta.height * y * yf / xf,
            unit: scaleUnitName(scaleXmlAttribute(p, "PhysicalSizeXUnit") || "um"), source: "OME-TIFF" };
    }
    var unit = /(?:^|\n)unit\s*=\s*([^\r\n]+)/i.exec(description);
    var factor = unit ? scaleUnitFactor(unit[1]) : 0;
    if (factor && meta.xResolution > 0 && meta.yResolution > 0) {
        return { width: meta.width / meta.xResolution, height: meta.height / meta.yResolution, unit: scaleUnitName(unit[1]), source: "ImageJ TIFF" };
    }
    var fov = /FOV\s*[:=]\s*([\d.eE+-]+)\s*[x×,]\s*([\d.eE+-]+)\s*(μm|µm|um|nm|mm|cm|m|microns?)/i.exec(description);
    if (fov) return { width: Number(fov[1]), height: Number(fov[2]), unit: fov[3], source: "TIFF FOV" };
    return null;
}

// Seek only the first IFD and calibration fields; never load image pixels or
// the whole stack. Also supports BigTIFF offsets within JS's safe integer range.
function readScaleTiff(file, diagnostics) {
    if (!file || !file.exists) return null;
    file.encoding = "BINARY";
    if (!file.open("r")) return null;
    try {
        var length = file.length;
        function read(offset, count) {
            if (offset < 0 || count < 0 || offset + count > length || count > 1048576) throw new Error("Invalid TIFF field");
            file.seek(offset, 0);
            var data = file.read(count);
            if (data.length !== count) throw new Error("Truncated TIFF");
            return data;
        }
        var header = read(0, Math.min(16, length)), little = header.substring(0, 2) === "II";
        if (!little && header.substring(0, 2) !== "MM") return null;
        function integer(data, offset, size) {
            var value = 0;
            for (var i = 0; i < size; i++) value = value * 256 + (data.charCodeAt(offset + (little ? size - i - 1 : i)) & 255);
            if (value > 9007199254740991) throw new Error("TIFF offset too large: " + value + " (" + offset + ", " + size + ")");
            return value;
        }
        var magic = integer(header, 2, 2), big = magic === 43;
        if (diagnostics) { diagnostics.magic = magic; diagnostics.big = big; }
        if (magic !== 42 && !big) return null;
        if (big && (integer(header, 4, 2) !== 8 || integer(header, 6, 2) !== 0)) return null;
        var offsetSize = big ? 8 : 4, ifd = integer(header, big ? 8 : 4, offsetSize);
        var countSize = big ? 8 : 2, entrySize = big ? 20 : 12;
        var count = integer(read(ifd, countSize), 0, countSize);
        if (count > 4096) return null;
        var directory = read(ifd + countSize, count * entrySize), meta = {};
        var names = { 256: "width", 257: "height", 270: "description", 282: "xResolution", 283: "yResolution" };
        for (var n = 0; n < count; n++) {
            var entry = directory.substring(n * entrySize, (n + 1) * entrySize);
            var tag = integer(entry, 0, 2), name = names[tag];
            if (!name) continue;
            var type = integer(entry, 2, 2), num = integer(entry, 4, big ? 8 : 4);
            // ExtendScript evaluates nested ternaries differently from modern
            // JS in some builds. An explicit lookup works in both runtimes.
            var sizes = { 2: 1, 3: 2, 4: 4, 5: 8, 16: 8 };
            var size = sizes[type] || 0;
            if (!size || num < 1 || num * size > 1048576) continue;
            var fieldOffset = big ? 12 : 8;
            if (diagnostics) diagnostics.lastField = { tag: tag, type: type, size: size, count: num };
            var data = num * size <= offsetSize ? entry.substring(fieldOffset) : read(integer(entry, fieldOffset, offsetSize), num * size);
            if (type === 2) {
                data = data.replace(/\x00+$/, "");
                try { data = decodeURIComponent(escape(data)); } catch (utfError) {}
                meta[name] = data;
            } else if (type === 5) {
                var denominator = integer(data, 4, 4);
                meta[name] = denominator ? integer(data, 0, 4) / denominator : 0;
            } else meta[name] = integer(data, 0, size);
        }
        var fov = scaleFovFromTiffMetadata(meta);
        if (diagnostics) diagnostics.metadata = meta;
        return validScaleFov(fov) ? fov : null;
    } catch (error) { if (diagnostics) diagnostics.error = String(error); return null; }
    finally { file.close(); }
}

function scaleReadStoredFov(item) {
    try {
        var match = /\[SCI_FOV\]([\s\S]*?)\[\/SCI_FOV\]/.exec(item.note || "");
        var fov = JSON.parse(match ? match[1] : getTag(item, "SCI_FOV"));
        if (validScaleFov(fov)) return fov;
    } catch (error) {}
    return null;
}

function scaleWriteFov(item, fov) {
    var data = JSON.stringify(fov), note = item.note || "";
    var block = "[SCI_FOV]" + data + "[/SCI_FOV]";
    var nextNote = /\[SCI_FOV\][\s\S]*?\[\/SCI_FOV\]/.test(note)
        ? note.replace(/\[SCI_FOV\][\s\S]*?\[\/SCI_FOV\]/g, block)
        : note + (note ? "\n" : "") + block;
    if (nextNote !== note) item.note = nextNote;
    if (getTag(item, "SCI_FOV") !== data) addTag(item, "SCI_FOV", data);
}

function scaleWrapperPicture(item) {
    if (getTag(item, "SCI_SCALE_WRAPPER") && item.typename === "GroupItem") {
        for (var i = 0; i < item.pageItems.length; i++) {
            var child = item.pageItems[i];
            if (child.parent === item && !getTag(child, "SCI_SCALE_BAR")) return child;
        }
    }
    return item;
}

function scaleFindRaster(item, result) {
    if (getTag(item, "SCI_SCALE_BAR")) return;
    if (item.typename === "RasterItem" || item.typename === "PlacedItem") result.push(item);
    if (item.typename === "GroupItem") {
        for (var i = 0; i < item.pageItems.length; i++) {
            if (item.pageItems[i].parent === item) scaleFindRaster(item.pageItems[i], result);
        }
    }
}

function scaleReadFov(item) {
    var stored = scaleReadStoredFov(item);
    if (stored) return stored;
    var rasters = [];
    scaleFindRaster(item, rasters);
    if (rasters.length !== 1) return null;
    var image = rasters[0], fov = scaleReadStoredFov(image);
    if (!fov) {
        try { fov = readScaleTiff(image.file); } catch (fileError) {}
    }
    if (!fov) return null;
    if (image !== item) {
        var full = image.geometricBounds, view = getVisibleBounds(item) || item.geometricBounds;
        fov = { width: fov.width * (view[2] - view[0]) / (full[2] - full[0]),
            height: fov.height * (view[1] - view[3]) / (full[1] - full[3]), unit: fov.unit, source: fov.source };
    }
    return validScaleFov(fov) ? fov : null;
}

function scaleReadOptions(item) {
    try {
        var options = JSON.parse(getTag(item, "SCI_SCALE_OPTIONS"));
        if (options && !options.unit) {
            var fov = scaleReadFov(item);
            options.unit = scaleUnitName(fov ? fov.unit : "um");
        }
        return options;
    } catch (error) { return null; }
}

function scaleSelectionTarget(doc) {
    var selection = doc.selection;
    if (!selection || selection.length !== 1) throw new Error("errors.scaleSelection");
    var item = selection[0], current = item;
    while (current && current.typename !== "Layer" && current.typename !== "Document") {
        var key = getTag(current, "SCI_SCALE_BAR");
        if (key) {
            if (getTag(current.parent, "SCI_SCALE_WRAPPER")) return scaleWrapperPicture(current.parent);
            if (scaleReadOptions(current.parent)) return current.parent;
            for (var i = 0; i < doc.pageItems.length; i++) {
                var candidate = doc.pageItems[i];
                if (getTag(candidate, "SCI_SCALE_ID") === key && (!candidate.uuid || candidate.uuid === key)) return scaleWrapperPicture(candidate);
            }
        }
        if (getTag(current, "SCI_SCALE_WRAPPER")) return scaleWrapperPicture(current);
        if (scaleReadOptions(current)) return current;
        current = current.parent;
    }
    item = scaleWrapperPicture(item);
    var rasters = [];
    scaleFindRaster(item, rasters);
    if (rasters.length !== 1) throw new Error("errors.scaleSelection");
    return item;
}

function scaleDocumentKey(doc) {
    try { return doc.fullName.fsName; } catch (error) { return doc.name; }
}

function inspectScalebar(previousSignature) {
    var signature = "no-document", documentKey = "";
    try {
        if (!app.documents.length) throw new Error("errors.noDocument");
        var doc = app.activeDocument, target = scaleSelectionTarget(doc);
        documentKey = scaleDocumentKey(doc);
        // A token pins the inspected object; changing selection cannot apply
        // the old form's FOV to another image. Tokens persist across CEP reloads.
        var token = target.uuid || getTag(target, "SCI_SCALE_TARGET") || createZoomRecordKey(doc);
        if (!target.uuid && getTag(target, "SCI_SCALE_TARGET") !== token) addTag(target, "SCI_SCALE_TARGET", token);
        signature = documentKey + "|" + token;
        if (signature === previousSignature) return "null";
        return JSON.stringify({ token: token, signature: signature, documentKey: documentKey, fov: scaleReadFov(target), options: scaleReadOptions(target) });
    } catch (error) {
        if (previousSignature === undefined) return sciError(String(error.message));
        if (app.documents.length) signature = scaleDocumentKey(app.activeDocument) + "|no-image";
        if (signature === previousSignature) return "null";
        return JSON.stringify({ token: "", signature: signature, fov: null, options: null, errorKey: String(error.message) });
    }
}

function validateScaleOptions(options, fov) {
    if (!validScaleFov(fov)) throw new Error("errors.scaleFov");
    if (!options || !(options.lengthUm > 0) || !isFinite(options.lengthUm) || !(options.thickness > 0) || !isFinite(options.thickness) ||
        !(options.fontSize > 0) || !isFinite(options.fontSize) || !/^(horizontal|vertical)$/.test(options.orientation) ||
        !/^(TL|TR|BL|BR)$/.test(options.position) || !/^#[0-9a-f]{6}$/i.test(options.color) || !/^#[0-9a-f]{6}$/i.test(options.fontColor) ||
        (options.unit && !scaleUnitFactor(options.unit))) throw new Error("errors.scaleOptions");
    var dimension = options.orientation === "vertical" ? fov.height : fov.width;
    if (options.lengthUm > dimension * scaleUnitFactor(fov.unit)) throw new Error("errors.scaleTooLong");
}

function scaleColor(hex) {
    var color = new RGBColor();
    color.red = parseInt(hex.substring(1, 3), 16);
    color.green = parseInt(hex.substring(3, 5), 16);
    color.blue = parseInt(hex.substring(5, 7), 16);
    return color;
}

function scaleRemoveBars(doc, target) {
    var key = getTag(target, "SCI_SCALE_ID");
    if (!key) return;
    var owner = null;
    if (target.typename === "GroupItem") owner = target;
    else if (getTag(target.parent, "SCI_SCALE_WRAPPER")) owner = target.parent;
    var items = doc.pageItems;
    for (var i = items.length - 1; i >= 0; i--) {
        var bar = items[i];
        if (getTag(bar, "SCI_SCALE_BAR") !== key) continue;
        var insideOwner = owner && bar.parent === owner;
        var nativeOwner = target.uuid && getTag(bar, "SCI_SCALE_OWNER") === target.uuid;
        if (!insideOwner && !nativeOwner && (owner || target.uuid)) continue;
        bar.remove();
    }
}

function scaleDrawBar(doc, target, fov, options) {
    validateScaleOptions(options, fov);
    options.unit = scaleUnitName(options.unit || fov.unit);
    var bounds = getVisibleBounds(target) || target.geometricBounds;
    var width = bounds[2] - bounds[0], height = bounds[1] - bounds[3];
    var vertical = options.orientation === "vertical";
    var length = options.lengthUm / ((vertical ? fov.height : fov.width) * scaleUnitFactor(fov.unit)) * (vertical ? height : width);
    var barWidth = vertical ? options.thickness : length, barHeight = vertical ? length : options.thickness;
    var parent = target.parent, wrapper = null, oldWrapper = null;
    if (!options.autoGroup && getTag(parent, "SCI_SCALE_WRAPPER")) {
        oldWrapper = parent;
        parent = parent.parent;
    }
    if (options.autoGroup && target.typename !== "GroupItem" && !getTag(parent, "SCI_SCALE_WRAPPER")) {
        wrapper = parent.groupItems.add();
        wrapper.move(target, ElementPlacement.PLACEBEFORE);
        addTag(wrapper, "SCI_SCALE_WRAPPER", "1");
        target.moveToBeginning(wrapper);
        parent = wrapper;
    } else if (options.autoGroup && target.typename === "GroupItem") parent = target;
    var bar = parent.groupItems.add();
    var key = target.uuid || getTag(target, "SCI_SCALE_ID") || createZoomRecordKey(doc);
    try {
        bar.name = "Scalebar " + scaleLabel(options, fov);
        var path = bar.pathItems.rectangle(0, 0, barWidth, barHeight);
        path.stroked = false; path.filled = true; path.fillColor = scaleColor(options.color);
        if (options.showText) {
            var label = bar.textFrames.add();
            label.contents = scaleLabel(options, fov);
            var attributes = label.textRange.characterAttributes;
            attributes.size = options.fontSize;
            attributes.fillColor = scaleColor(options.fontColor);
            attributes.textFont = app.textFonts.getByName(getFontFullName("ArialMT", options.bold));
            var lb = label.geometricBounds, gap = Math.max(2, options.thickness);
            var tx = vertical ? -gap - (lb[2] - lb[0]) : (barWidth - (lb[2] - lb[0])) / 2;
            var ty = vertical ? -(barHeight - (lb[1] - lb[3])) / 2 : gap + (lb[1] - lb[3]);
            label.translate(tx - lb[0], ty - lb[1]);
        }
        var bb = bar.geometricBounds, margin = Math.min(width, height) * 0.04;
        var right = options.position === "TR" || options.position === "BR";
        var top = options.position === "TL" || options.position === "TR";
        var left = right ? bounds[2] - margin - (bb[2] - bb[0]) : bounds[0] + margin;
        var barTop = top ? bounds[1] - margin : bounds[3] + margin + (bb[1] - bb[3]);
        // Long labels/bars stay within the picture when there is little margin.
        left = Math.max(bounds[0], Math.min(left, bounds[2] - (bb[2] - bb[0])));
        barTop = Math.min(bounds[1], Math.max(barTop, bounds[3] + (bb[1] - bb[3])));
        bar.translate(left - bb[0], barTop - bb[1]);
        // All construction succeeds before the previous scale is removed.
        scaleRemoveBars(doc, target);
        addTag(bar, "SCI_SCALE_BAR", key);
        if (target.uuid) addTag(bar, "SCI_SCALE_OWNER", target.uuid);
        addTag(target, "SCI_SCALE_ID", key);
        addTag(target, "SCI_SCALE_OPTIONS", JSON.stringify(options));
        scaleWriteFov(target, fov);
        if (options.autoGroup && target.clipped) {
            // Keep the clipping path topmost and the annotation above pixels.
            bar.moveToBeginning(target);
            for (var c = 0; c < target.pageItems.length; c++) {
                if (target.pageItems[c].clipping) { target.pageItems[c].moveToBeginning(target); break; }
            }
        }
        if (oldWrapper && oldWrapper.pageItems.length === 1) {
            target.move(oldWrapper, ElementPlacement.PLACEBEFORE);
            oldWrapper.remove();
        }
        return wrapper || (getTag(target.parent, "SCI_SCALE_WRAPPER") ? target.parent : target);
    } catch (error) {
        try { bar.remove(); } catch (cleanupError) {}
        if (wrapper) { target.move(wrapper, ElementPlacement.PLACEBEFORE); wrapper.remove(); }
        throw error;
    }
}

function applyScalebar(payloadJson) {
    if (!app.documents.length) return sciError("errors.noDocument");
    try {
        var doc = app.activeDocument, payload = JSON.parse(payloadJson), target = null;
        if (payload.documentKey && payload.documentKey !== scaleDocumentKey(doc)) return sciError("errors.scaleTargetChanged");
        if (payload.autoSave) {
            // Save the inspected image even when the user has already selected
            // another one. Background saves never alter Illustrator selection.
            for (var i = 0; i < doc.pageItems.length; i++) {
                var candidate = doc.pageItems[i];
                if ((candidate.uuid || getTag(candidate, "SCI_SCALE_TARGET")) === payload.token) { target = candidate; break; }
            }
            if (!target) return sciError("errors.scaleTargetChanged");
        } else target = scaleSelectionTarget(doc);
        if ((target.uuid || getTag(target, "SCI_SCALE_TARGET")) !== payload.token) return sciError("errors.scaleTargetChanged");
        if (!validScaleFov(payload.fov)) return sciError("errors.scaleFov");
        var currentOptions = payload.options;
        if (payload.saveOnly) currentOptions = scaleReadOptions(target);
        if (currentOptions) validateScaleOptions(currentOptions, payload.fov);
        if (payload.saveOnly && !currentOptions) scaleWriteFov(target, payload.fov);
        else {
            var wasSelectedTarget = false;
            if (payload.autoSave) {
                try { wasSelectedTarget = scaleSelectionTarget(doc) === target; } catch (selectionError) {}
            }
            var selected = scaleDrawBar(doc, target, payload.fov, currentOptions);
            if (!payload.autoSave) {
                doc.selection = null;
                selected.selected = true;
            } else if (wasSelectedTarget && !doc.selection.length) {
                // Editing a selected scale label replaces that native item.
                // Restore its own image selection, leaving other images alone.
                selected.selected = true;
            }
        }
        return "OK";
    } catch (error) { return sciError(String(error.message)); }
}

function scaleClearDuplicate(item) {
    if (item.typename === "GroupItem") {
        for (var i = item.pageItems.length - 1; i >= 0; i--) {
            var child = item.pageItems[i];
            if (child.parent !== item) continue;
            if (getTag(child, "SCI_SCALE_BAR")) child.remove();
            else scaleClearDuplicate(child);
        }
    }
    for (var t = item.tags.length - 1; t >= 0; t--) {
        if (item.tags[t].name.indexOf("SCI_SCALE_") === 0 || item.tags[t].name === "SCI_FOV") item.tags[t].remove();
    }
    try { item.note = (item.note || "").replace(/\[SCI_FOV\][\s\S]*?\[\/SCI_FOV\]/g, ""); } catch (error) {}
}

function scaleZoomFov(source, region) {
    var fov = scaleReadFov(source);
    return fov ? { width: fov.width * region.width, height: fov.height * region.height, unit: fov.unit, source: "zoom" } : null;
}

function scaleZoomOptions(source, entry) {
    var original = scaleReadOptions(source);
    if (!original && entry.recordKey) {
        var existing = findItemByTag(app.activeDocument, "ILST_ZOOM_ITEM_" + entry.recordKey);
        if (existing) original = scaleReadOptions(existing);
    }
    if (!original) return null;
    var options = JSON.parse(JSON.stringify(original));
    if (entry.scaleLengthUm !== null && entry.scaleLengthUm !== undefined) options.lengthUm = Number(entry.scaleLengthUm);
    if (entry.scaleUnit) options.unit = scaleUnitName(entry.scaleUnit);
    options.autoGroup = true;
    return options;
}
