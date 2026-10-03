// Native editable color overlays: no capture, PNG encoding or image embedding.
var pseudocolorLayerSession = null;

function pseudocolorEditable(item, doc) {
    var current = item;
    while (current && current !== doc) {
        if (current.locked || current.hidden ||
            (current.typename === "Layer" && current.visible === false)) return false;
        current = current.parent;
    }
    return current === doc;
}

function pseudocolorLayerRGB(lut) {
    var colors = {red:[255,0,0],green:[0,255,0],blue:[0,0,255],cyan:[0,255,255],
        magenta:[255,0,255],yellow:[255,255,0],grays:[255,255,255]};
    if (!Object.prototype.hasOwnProperty.call(colors, lut)) return null;
    var values = colors[lut], color = new RGBColor();
    color.red = values[0]; color.green = values[1]; color.blue = values[2];
    return color;
}

// Notes survive saving, reopening and renaming. The strict named structure
// below also recognizes results created before these identifiers were added.
var pseudocolorChannelPrefix = "SCI_PSEUDOCOLOR_CHANNEL:1:";
var pseudocolorRootNote = "SCI_PSEUDOCOLOR_ROOT:1";

function pseudocolorDirectChildren(group) {
    var children = [];
    for (var i = 0; i < group.pageItems.length; i++) {
        if (group.pageItems[i].parent === group) children.push(group.pageItems[i]);
    }
    return children;
}

function pseudocolorLayerParts(item) {
    if (item.typename !== "GroupItem") return null;
    var children = pseudocolorDirectChildren(item), channel = item;
    if (item.note === pseudocolorRootNote || item.name.indexOf("SCI Pseudocolor ") === 0) {
        if (children.length !== 1 || children[0].typename !== "GroupItem") return null;
        channel = children[0]; children = pseudocolorDirectChildren(channel);
    }
    var note = channel.note || "", match = /^LUT (red|green|blue|cyan|magenta|yellow|grays) — /.exec(channel.name);
    var lut = note.indexOf(pseudocolorChannelPrefix) === 0 ? note.substring(pseudocolorChannelPrefix.length) : match && match[1];
    if (!lut || !pseudocolorLayerRGB(lut)) return null;
    var source = null, tint = null, backdrop = null;
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.typename === "PlacedItem" || child.typename === "RasterItem") {
            if (source) return null;
            source = child;
        } else if (child.typename === "PathItem" && !child.clipping && !child.stroked && child.filled) {
            if (child.note === "SCI_PSEUDOCOLOR_TINT:1" || child.name === "Color " + lut) {
                if (tint) return null;
                tint = child;
            } else if (child.note === "SCI_PSEUDOCOLOR_BACKGROUND:1" || child.name === "Black background") {
                if (backdrop) return null;
                backdrop = child;
            } else return null;
        } else return null;
    }
    if (!source || !tint) return null;
    // If a supported RGB tint was edited in the Layers panel, its current
    // fill is authoritative. Keep the stored LUT for document-converted colors.
    var fill = tint.fillColor;
    if (fill.typename === "RGBColor") {
        var luts = ["red","green","blue","cyan","magenta","yellow","grays"];
        for (var k = 0; k < luts.length; k++) {
            var color = pseudocolorLayerRGB(luts[k]);
            if (Math.abs(fill.red-color.red) < 0.01 && Math.abs(fill.green-color.green) < 0.01 && Math.abs(fill.blue-color.blue) < 0.01) {
                lut = luts[k]; break;
            }
        }
    }
    return {channel:channel,source:source,tint:tint,backdrop:backdrop,lut:lut};
}

function pseudocolorSameBounds(a, b) {
    for (var i = 0; i < 4; i++) if (Math.abs(a[i] - b[i]) > 0.001) return false;
    return true;
}

function readPseudocolorLayerEntry(item, doc) {
    var parts = pseudocolorLayerParts(item);
    // Direct-selecting the source copy should update its existing result too.
    if (!parts && (item.typename === "PlacedItem" || item.typename === "RasterItem")) {
        var parentParts = pseudocolorLayerParts(item.parent);
        if (parentParts && parentParts.source === item) {
            item = item.parent;
            if (item.parent.typename === "GroupItem" && pseudocolorLayerParts(item.parent)) item = item.parent;
            parts = pseudocolorLayerParts(item);
        }
    }
    var source = parts ? parts.source : item;
    if ((!parts && source.typename !== "PlacedItem" && source.typename !== "RasterItem") ||
        !pseudocolorEditable(item, doc) || !pseudocolorEditable(source, doc))
        throw new Error(sciError("errors.layerImage"));
    var matrix = source.matrix;
    if (item.opacity !== 100 || source.opacity !== 100 ||
        (source.blendingMode !== BlendModes.NORMAL && !(parts && source.blendingMode === BlendModes.MULTIPLY)) ||
        (item.blendingMode !== BlendModes.NORMAL && !(parts && item === parts.channel && item.blendingMode === BlendModes.SCREEN)) ||
        (matrix && (Math.abs(matrix.mValueB) > 0.000001 || Math.abs(matrix.mValueC) > 0.000001)))
        throw new Error(sciError("errors.layerImage"));
    var b = source.geometricBounds;
    if (b[2] <= b[0] || b[1] <= b[3]) throw new Error(sciError("errors.layerImage"));
    if (parts && (!pseudocolorEditable(parts.tint, doc) || parts.tint.opacity !== 100 ||
        parts.channel.opacity !== 100 ||
        !pseudocolorSameBounds(b, item.geometricBounds) || !pseudocolorSameBounds(b, parts.tint.geometricBounds) ||
        (parts.backdrop && (!pseudocolorEditable(parts.backdrop, doc) || !pseudocolorSameBounds(b, parts.backdrop.geometricBounds)))))
        throw new Error(sciError("errors.layerImage"));
    return {item:item,parent:item.parent,source:source,sourceParent:source.parent,
        parts:parts,lut:parts ? parts.lut : null,name:source.name || "Image",bounds:[b[0],b[1],b[2],b[3]]};
}

function readPseudocolorLayerTargets() {
    if (app.documents.length === 0) throw new Error(sciError("errors.noDocument"));
    var doc = app.activeDocument, selection = doc.selection, targets = [];
    if (!selection || !selection.length) throw new Error(sciError("errors.pseudocolorSelection"));
    for (var i = 0; i < selection.length; i++) {
        var entry = readPseudocolorLayerEntry(selection[i], doc), duplicate = false;
        for (var j = 0; j < targets.length; j++) if (targets[j].source === entry.source) duplicate = true;
        if (!duplicate) targets.push(entry);
    }
    return {document:doc,targets:targets};
}

function inspectPseudocolorLayerTargets() {
    try {
        var session = readPseudocolorLayerTargets();
        session.id = "layers_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
        pseudocolorLayerSession = session;
        var targets = [];
        for (var i = 0; i < session.targets.length; i++) {
            var entry = session.targets[i], b = entry.bounds;
            targets.push({name:entry.item.name || String(i + 1),width:b[2]-b[0],height:b[1]-b[3],lut:entry.lut});
        }
        return JSON.stringify({sessionId:session.id,targets:targets});
    } catch (error) { return String(error.message || error); }
}

function cancelPseudocolorLayerTargets(id) {
    if (pseudocolorLayerSession && pseudocolorLayerSession.id === id) pseudocolorLayerSession = null;
    return "Success";
}

function validatePseudocolorLayerSession(session) {
    if (!session || !app.documents.length || session.document !== app.activeDocument)
        return sciError("errors.pseudocolorStale");
    for (var i = 0; i < session.targets.length; i++) {
        var target = session.targets[i];
        try {
            var current = readPseudocolorLayerEntry(target.item, session.document);
            if (current.parent !== target.parent || current.source !== target.source ||
                current.sourceParent !== target.sourceParent || current.lut !== target.lut ||
                !!current.parts !== !!target.parts ||
                (current.parts && (current.parts.channel !== target.parts.channel || current.parts.tint !== target.parts.tint)))
                return sciError("errors.pseudocolorStale");
            if (!pseudocolorSameBounds(current.bounds, target.bounds))
                return sciError("errors.pseudocolorStale");
        } catch (error) { return sciError("errors.pseudocolorStale"); }
    }
    return null;
}

function makePseudocolorLayerGroup(parent, entry, lut, left, top) {
    var b = entry.bounds, group = parent.groupItems.add();
    group.name = "LUT " + lut + " — " + entry.name;
    group.note = pseudocolorChannelPrefix + lut;
    group.isIsolated = true;
    // A neutral backdrop prevents the raster's antialiased edge from exposing
    // a saturated tint. Darken keeps gray in enabled RGB components and zeros
    // the others for the seven supported colors, without cropping the image.
    var backdrop = group.pathItems.rectangle(top, left, b[2]-b[0], b[1]-b[3]);
    var black = new RGBColor(); black.red = 0; black.green = 0; black.blue = 0;
    backdrop.name = "Black background";
    backdrop.note = "SCI_PSEUDOCOLOR_BACKGROUND:1";
    backdrop.stroked = false; backdrop.filled = true; backdrop.fillColor = black;
    var image = entry.source.duplicate(group, ElementPlacement.PLACEATBEGINNING);
    image.name = entry.parts ? entry.source.name : "Source " + entry.name;
    image.translate(left - b[0], top - b[1]);
    image.blendingMode = BlendModes.NORMAL;
    var tint = group.pathItems.rectangle(top, left, b[2]-b[0], b[1]-b[3]);
    tint.name = "Color " + lut;
    tint.note = "SCI_PSEUDOCOLOR_TINT:1";
    tint.stroked = false; tint.filled = true; tint.fillColor = pseudocolorLayerRGB(lut);
    tint.blendingMode = BlendModes.DARKEN;
    return group;
}

function recolorPseudocolorLayer(entry, lut) {
    var parts = entry.parts;
    parts.tint.fillColor = pseudocolorLayerRGB(lut);
    parts.tint.name = "Color " + lut;
    parts.channel.note = pseudocolorChannelPrefix + lut;
    if (parts.channel.name.indexOf("LUT ") === 0) parts.channel.name = "LUT " + lut + " — " + entry.name;
    if (entry.item !== parts.channel && entry.item.name.indexOf("SCI Pseudocolor ") === 0)
        entry.item.name = "SCI Pseudocolor " + lut;
}

function applyPseudocolorLayers(payload) {
    var request, session, created = [], updated = [], results = [], originalSelection = [], doc;
    try {
        request = JSON.parse(payload);
        if (request.mode !== "batch" && request.mode !== "merge") return sciError("errors.layerOptions");
        if (request.mode === "merge" && request.sessionId) {
            session = pseudocolorLayerSession;
            if (!session || session.id !== request.sessionId) return sciError("errors.pseudocolorStale");
        } else session = readPseudocolorLayerTargets();
        var validation = validatePseudocolorLayerSession(session);
        if (validation) return validation;
        doc = session.document;
        for (var s = 0; doc.selection && s < doc.selection.length; s++) originalSelection.push(doc.selection[s]);
        var channels = request.channels, indices = [], defaults = ["red","green","blue","cyan","magenta","yellow","grays"];
        if (request.mode === "batch") {
            if (!pseudocolorLayerRGB(request.lut)) return sciError("errors.layerOptions");
        } else {
            if (!channels) {
                if (session.targets.length < 2 || session.targets.length > 7) return sciError("errors.mergeCount");
                channels = [];
                for (var c = 0; c < session.targets.length; c++) channels.push({enabled:true,lut:session.targets[c].lut || defaults[c]});
            }
            if (!(channels instanceof Array) || channels.length !== session.targets.length)
                return sciError("errors.layerOptions");
            for (var k = 0; k < channels.length; k++) {
                if (!channels[k].enabled) continue;
                if (!pseudocolorLayerRGB(channels[k].lut)) return sciError("errors.layerOptions");
                indices.push(k);
            }
            if (indices.length < 2 || indices.length > 7) return sciError("errors.mergeCount");
            var first = session.targets[indices[0]], right = -Infinity;
            for (var n = 0; n < indices.length; n++) {
                var b = session.targets[indices[n]].bounds, ref = first.bounds;
                if (Math.abs((b[2]-b[0])-(ref[2]-ref[0])) > 0.001 ||
                    Math.abs((b[1]-b[3])-(ref[1]-ref[3])) > 0.001) return sciError("errors.mergeSize");
                right = Math.max(right, b[2]);
            }
        }
        // Track root groups before filling them, so duplication or setters can
        // fail safely without removing or moving any original image.
        if (request.mode === "batch") {
            for (var t = 0; t < session.targets.length; t++) {
                var entry = session.targets[t];
                if (entry.parts) { results.push(entry.item); continue; }
                var root = doc.groupItems.add();
                created.push(root);
                results.push(root);
                root.move(entry.item, ElementPlacement.PLACEBEFORE);
                root.name = "SCI Pseudocolor " + request.lut;
                root.note = pseudocolorRootNote;
                root.isIsolated = true;
                var left = entry.bounds[0];
                if (request.keepOriginal !== false) left = entry.bounds[2] + 10;
                makePseudocolorLayerGroup(root, entry, request.lut, left, entry.bounds[1]);
            }
            // Stage new results first, then recolor existing groups in place.
            // Retain snapshots before setters so a failed mixed batch can roll back.
            for (var u = 0; u < session.targets.length; u++) {
                var existing = session.targets[u], parts = existing.parts;
                if (!parts) continue;
                updated.push({entry:existing,color:parts.tint.fillColor,tintName:parts.tint.name,
                    channelName:parts.channel.name,channelNote:parts.channel.note,itemName:existing.item.name});
                recolorPseudocolorLayer(existing, request.lut);
            }
        } else {
            var merged = doc.groupItems.add(); created.push(merged);
            results.push(merged);
            merged.move(first.item.layer, ElementPlacement.PLACEATBEGINNING);
            merged.name = "SCI Merge Channels — Screen"; merged.isIsolated = true;
            for (var m = 0; m < indices.length; m++) {
                var index = indices[m];
                var channel = makePseudocolorLayerGroup(merged, session.targets[index], channels[index].lut, right+10, first.bounds[1]);
                channel.blendingMode = m === 0 ? BlendModes.NORMAL : BlendModes.SCREEN;
            }
        }
    } catch (error) {
        for (var v = updated.length - 1; v >= 0; v--) {
            try {
                var saved = updated[v], oldParts = saved.entry.parts;
                oldParts.tint.fillColor = saved.color; oldParts.tint.name = saved.tintName;
                oldParts.channel.name = saved.channelName; oldParts.channel.note = saved.channelNote;
                saved.entry.item.name = saved.itemName;
            } catch (ignoredUpdate) {}
        }
        for (var r = created.length - 1; r >= 0; r--) {
            try { created[r].remove(); } catch (ignored) {}
        }
        if (doc) doc.selection = originalSelection;
        var message = String(error.message || error);
        if (message.indexOf("Error:") === 0) return message;
        return sciError("errors.layerApply", [message]);
    }
    if (request.mode === "batch" && request.keepOriginal === false) {
        for (var d = 0; d < session.targets.length; d++) {
            if (!session.targets[d].parts) session.targets[d].item.remove();
        }
    }
    doc.selection = results;
    pseudocolorLayerSession = null;
    return String(request.mode === "merge" ? indices.length : results.length);
}
