// Apply only fillable vector artwork; clipping masks, guides and images stay intact.
function collectPaletteFillPaths(item, targets) {
    if (!item || item.locked || item.hidden || item.editable === false) return;
    var i;
    if (item.typename === "PathItem") {
        if (item.clipping || item.guides) return;
        for (i = 0; i < targets.length; i++) if (targets[i] === item) return;
        targets.push(item);
    } else if (item.typename === "CompoundPathItem") {
        // A compound clipping mask must be skipped as a whole.
        for (i = 0; i < item.pathItems.length; i++) if (item.pathItems[i].clipping) return;
        for (i = 0; i < item.pathItems.length; i++) collectPaletteFillPaths(item.pathItems[i], targets);
    } else if (item.typename === "GroupItem") {
        for (i = 0; i < item.pageItems.length; i++) collectPaletteFillPaths(item.pageItems[i], targets);
    }
}

function applyPaletteFill(hex) {
    if (app.documents.length === 0) return sciError("errors.noDocument");
    if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex))
        return sciError("palettes.errors.hex");
    var selection = app.activeDocument.selection;
    if (!selection || selection.length === 0) return sciError("errors.paletteFillSelection");
    var targets = [], previous = [], i;
    try {
        for (i = 0; i < selection.length; i++) collectPaletteFillPaths(selection[i], targets);
        if (!targets.length) return sciError("errors.paletteFillSelection");
        for (i = 0; i < targets.length; i++) {
            previous.push({ item: targets[i], color: targets[i].fillColor, filled: targets[i].filled });
        }
    } catch (error) {
        return sciError("errors.paletteFill", [String(error)]);
    }
    var color = new RGBColor();
    color.red = parseInt(hex.substr(1, 2), 16);
    color.green = parseInt(hex.substr(3, 2), 16);
    color.blue = parseInt(hex.substr(5, 2), 16);
    try {
        for (i = 0; i < targets.length; i++) {
            targets[i].fillColor = color;
            targets[i].filled = true;
        }
        return String(targets.length);
    } catch (error) {
        // Include the current item because a failed setter can change it partially.
        for (var rollback = i; rollback >= 0; rollback--) {
            try {
                previous[rollback].item.fillColor = previous[rollback].color;
                previous[rollback].item.filled = previous[rollback].filled;
            } catch (ignored) {}
        }
        return sciError("errors.paletteFill", [String(error)]);
    }
}
