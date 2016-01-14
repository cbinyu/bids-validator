var async = require('async');
var utils = require('../utils');
var Issue = utils.Issue;

/**
 * NIFTI
 *
 * Takes a NifTi header, a file path and a callback
 * as arguments. And callsback with any issues
 * it finds while validating against the BIDS
 * specification.
 */
module.exports = function NIFTI (header, file, jsonContentsDict, bContentsDict, fileList, events, callback) {
    var path = file.relativePath;
    var issues = [];
    var potentialSidecars = potentialLocations(path.replace(".gz", "").replace(".nii", ".json"));
    var potentialEvents   = potentialLocations(path.replace(".gz", "").replace("bold.nii", "events.tsv"));
    var mergedDictionary  = generateMergedSidecarDict(potentialSidecars, jsonContentsDict);
    var sidecarMessage    = "It can be included one of the following locations: " + potentialSidecars.join(", ");
    var eventsMessage     = "It can be included one of the following locations: " + potentialEvents.join(", ");

    if (path.includes('_dwi.nii')) {
        var potentialBvecs = potentialLocations(path.replace(".gz", "").replace(".nii", ".bvec"));
        var potentialBvals = potentialLocations(path.replace(".gz", "").replace(".nii", ".bval"));
        var bvec = getBFileContent(potentialBvecs, bContentsDict);
        var bval = getBFileContent(potentialBvals, bContentsDict);
        var bvecMessage = "It can be included in one of the following locations: " + potentialBvecs.join(", ");
        var bvalMessage = "It can be included in one of the following locations: " + potentialBvals.join(", ");

        if (!bvec) {
            issues.push(new Issue({
                code: 32,
                file: file,
                reason: '_dwi scans should have a corresponding .bvec file. ' + bvecMessage
            }));
        }
        if (!bval) {
            issues.push(new Issue({
                code: 33,
                file: file,
                reason: '_dwi scans should have a corresponding .bval file. ' + bvalMessage
            }));
        }

        if (bval && bvec && header) {
            var volumes = [
                bvec.split('\n')[0].replace(/^\s+|\s+$/g, '').split(' ').length, // bvec row 1 length
                bvec.split('\n')[1].replace(/^\s+|\s+$/g, '').split(' ').length, // bvec row 2 length
                bvec.split('\n')[2].replace(/^\s+|\s+$/g, '').split(' ').length, // bvec row 3 length
                bval.replace(/^\s+|\s+$/g, '').split(' ').length,                // bval row length
                header.dim[4]                                                    // header 4th dimension
            ];

            if (!volumes.every(function(v) { return v === volumes[0]; })) {
                issues.push(new Issue({
                    code: 29,
                    file: file
                }));
            }
        }
    }

    if (missingEvents(path, potentialEvents, events)) {
        issues.push(new Issue({
            code: 25,
            file: file,
            reason: 'Task scans should have a correspondings events.tsv file. ' + eventsMessage
        }));
    }

    if (header) {
        // Define repetition time from header and coerce to seconds.
        var repetitionTime = header.pixdim[4];
        var repetitionUnit = header.xyzt_units[3];
        if (repetitionUnit === 'ms') {repetitionTime = repetitionTime / 1000;    repetitionUnit = 's';}
        if (repetitionUnit === 'us') {repetitionTime = repetitionTime / 1000000; repetitionUnit = 's';}
    }

    if (path.includes("_bold.nii") || path.includes("_sbref.nii") || path.includes("_dwi.nii")) {
        if (!mergedDictionary.hasOwnProperty('EchoTime')) {
            issues.push(new Issue({
                file: file,
                code: 6,
                reason: "You should define 'EchoTime' for this file. If you don't provide this information field map correction will not be possible. " + sidecarMessage
            }));
        }
        if (!mergedDictionary.hasOwnProperty('PhaseEncodingDirection')) {
            issues.push(new Issue({
                file: file,
                code: 7,
                reason: "You should define 'PhaseEncodingDirection' for this file. If you don't provide this information field map correction will not be possible. " + sidecarMessage
            }));
        }
        if (!mergedDictionary.hasOwnProperty('EffectiveEchoSpacing')) {
            issues.push(new Issue({
                file: file,
                code: 8,
                reason: "You should define 'EffectiveEchoSpacing' for this file. If you don't provide this information field map correction will not be possible. " + sidecarMessage
            }));
        }
    }
    if (path.includes("_dwi.nii")) {
        if (!mergedDictionary.hasOwnProperty('TotalReadoutTime')) {
            issues.push(new Issue({
                file: file,
                code: 9,
                reason: "You should define 'TotalReadoutTime' for this file. If you don't provide this information field map correction using TOPUP might not be possible. " + sidecarMessage
            }));
        }
    }
    // we don't need slice timing or repetition time for SBref
    if (path.includes("_bold.nii")) {
        if (!mergedDictionary.hasOwnProperty('RepetitionTime')) {
            issues.push(new Issue({
                file: file,
                code: 10,
                reason: "You have to define 'RepetitionTime' for this file. " + sidecarMessage
            }));
        }

        if (repetitionTime && mergedDictionary.RepetitionTime) {
            if (repetitionUnit !== 's') {
                issues.push(new Issue({
                    file: file,
                    code: 11
                }));
            } else {
                var niftiTR = Number((repetitionTime).toFixed(6));
                var jsonTR = Number((mergedDictionary.RepetitionTime).toFixed(6));
                if (niftiTR !== jsonTR) {
                    issues.push(new Issue({
                        file: file,
                        code: 12,
                        reason: "Repetition time defined in the JSON (" + jsonTR + " sec.) did not match the one defined in the NIFTI header (" + niftiTR + " sec.)"
                    }));
                }
            }
        }

        if (!mergedDictionary.hasOwnProperty('SliceTiming')) {
            issues.push(new Issue({
                file: file,
                code: 13,
                reason: "You should define 'SliceTiming' for this file. If you don't provide this information slice time correction will not be possible. " + sidecarMessage
            }));
        }
        if (!mergedDictionary.hasOwnProperty('SliceEncodingDirection')) {
            issues.push(new Issue({
                file: file,
                code: 14,
                reason: "You should define 'SliceEncodingDirection' for this file. If you don't provide this information slice time correction will not be possible. " + sidecarMessage
            }));
        }
    }
    else if (path.includes("_phasediff.nii")){
        if (!mergedDictionary.hasOwnProperty('EchoTime1')) {
            issues.push(new Issue({
                file: file,
                code: 15,
                reason: "You have to define 'EchoTime1' for this file. " + sidecarMessage
            }));
        }
        if (!mergedDictionary.hasOwnProperty('EchoTime2')) {
            issues.push(new Issue({
                file: file,
                code: 15,
                reason: "You have to define 'EchoTime2' for this file. " + sidecarMessage
            }));
        }
    } else if (path.includes("_phase1.nii") || path.includes("_phase2.nii")){
        if (!mergedDictionary.hasOwnProperty('EchoTime')) {
            issues.push(new Issue({
                file: file,
                code:16,
                reason: "You have to define 'EchoTime' for this file. " + sidecarMessage
            }));
        }
    } else if (path.includes("_fieldmap.nii")){
        if (!mergedDictionary.hasOwnProperty('Units')) {
            issues.push(new Issue({
                file: file,
                code: 17,
                reason: "You have to define 'Units' for this file. " + sidecarMessage
            }));
        }
    } else if (path.includes("_epi.nii")){
        if (!mergedDictionary.hasOwnProperty('PhaseEncodingDirection')) {
            issues.push(new Issue({
                file: file,
                code: 18,
                reason: "You have to define 'PhaseEncodingDirection' for this file. " + sidecarMessage
            }));
        }
        if (!mergedDictionary.hasOwnProperty('TotalReadoutTime')) {
            issues.push(new Issue({
                file: file,
                code: 19,
                reason: "You have to define 'TotalReadoutTime' for this file. " + sidecarMessage
            }));
        }
    }

    if (path.includes("_phasediff.nii") || path.includes("_phase1.nii") ||
        path.includes("_phase2.nii") || path.includes("_fieldmap.nii") || path.includes("_epi.nii")){
        if (mergedDictionary.hasOwnProperty('IntendedFor')) {
            var intendedForFile = "/" + path.split("/")[1] + "/" + mergedDictionary['IntendedFor'];
            var onTheList = false;
            async.forEachOf(fileList, function (file, key, cb) {
                if (file.path.endsWith(intendedForFile)){
                    onTheList = true;
                }
                cb();
            }, function(){
                if (!onTheList) {
                    issues.push(new Issue({
                        file: file,
                        code: 37,
                        reason: "'IntendedFor' property of this fieldmap ('" + mergedDictionary['IntendedFor'] + "') does " +
                        "not point to an existing file. Please mind that this value should not include subject level directory " +
                        "('/" + path.split("/")[1] + "/')."
                    }));
                }
            });
        }
    }

    callback(issues);
};

function missingEvents(path, potentialEvents, events) {
    var hasEvent = false,
        isRest   = false;

    // check if is a rest file
    var pathParts = path.split('/');
    var filenameParts  = pathParts[pathParts.length - 1].split('_');
    for (var i = 0; i < filenameParts.length; i++) {
        var part = filenameParts[i];
        if (part.toLowerCase().indexOf('task') === 0 && part.toLowerCase().indexOf('rest') > -1) {
            isRest = true;
        }
    }

    // check for event file
    for (var i = 0; i < potentialEvents.length; i++) {
        var event = potentialEvents[i];
        if (events.indexOf(event) > -1) {
            hasEvent = true;
        }
    }

    return !isRest && path.includes('_bold.nii') && !hasEvent;
}


/**
 * Potential Locations
 *
 * Takes the path to the lowest possible level of
 * a file that can be hierarchily positioned and
 * return a list of all possible locations for that
 * file.
 */
function potentialLocations(path) {
    var potentialPaths = [path];
    var pathComponents = path.split('/');
    var filenameComponents = pathComponents[pathComponents.length - 1].split("_");

    var sessionLevelComponentList = [],
        subjectLevelComponentList = [],
        topLevelComponentList = [],
        ses = null,
        sub = null;

    filenameComponents.forEach(function (filenameComponent) {
        if (filenameComponent.substring(0, 3) != "run") {
            sessionLevelComponentList.push(filenameComponent);
            if (filenameComponent.substring(0, 3) == "ses") {
                ses = filenameComponent;

            } else {
                subjectLevelComponentList.push(filenameComponent);
                if (filenameComponent.substring(0, 3) == "sub") {
                    sub = filenameComponent;
                } else {
                    topLevelComponentList.push(filenameComponent);
                }
            }
        }
    });

    if (ses) {
        var sessionLevelPath= "/" + sub + "/" + ses + "/" + sessionLevelComponentList.join("_");
        potentialPaths.push(sessionLevelPath)
    };

    var subjectLevelPath = "/" + sub + "/" + subjectLevelComponentList.join("_");
    potentialPaths.push(subjectLevelPath);

    var topLevelPath = "/" + topLevelComponentList.join("_");
    potentialPaths.push(topLevelPath);

    return potentialPaths;
}

/**
 * Generate Merged Sidecar Dictionary
 *
 * Takes an array of potential sidecards and a
 * master object dictionary of all JSON file
 * content and returns a merged dictionary
 * containing all values from the potential
 * sidecars.
 */
function generateMergedSidecarDict(potentialSidecars, jsonContents) {
    var mergedDictionary = {};
    for (var i = 0; i < potentialSidecars.length; i++) {
        var sidecarName = potentialSidecars[i];
        var jsonObject = jsonContents[sidecarName];
        if (jsonObject) {
            for (var key in jsonObject) {
                mergedDictionary[key] = jsonObject[key];
            }
        }
    }
    return mergedDictionary;
}

/**
 * Get B-File Contents
 *
 * Takes an array of potential bval or bvec files
 * and a master b-file contents dictionary and returns
 * the contents of the desired file.
 */
function getBFileContent(potentialBFiles, bContentsDict) {
    for (var i = 0; i < potentialBFiles.length; i++) {
        var potentialBFile = potentialBFiles[i];
        if (bContentsDict.hasOwnProperty(potentialBFile)) {
            return bContentsDict[potentialBFile];
        }
    }
}