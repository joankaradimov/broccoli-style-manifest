/* eslint-env node */
'use strict';

var Plugin = require('broccoli-plugin');
var walkSync = require('walk-sync');
var fs = require('fs');
var FSTree = require('fs-tree-diff');
var Promise = require('rsvp').Promise;
var path = require('path');
var os = require("os");

module.exports = StyleManifest;

StyleManifest.prototype = Object.create(Plugin.prototype);
StyleManifest.prototype.constructor = StyleManifest;
function StyleManifest(inputNode, options) {
  options = options || {};
  Plugin.call(this, [inputNode], {
    annotation: options.annotation,
    persistentOutput: true
  });

  this.currentTree = new FSTree();
  this.styleFiles = {};
  this.changedExtensions = [];
  this.outputFileStem = options.outputFileNameWithoutExtension;
  this.defaultExtension = options.defaultExtension || 'css';
}

StyleManifest.prototype.build = function() {
  var entries = walkSync.entries(this.inputPaths[0], {
    directories: false,
  });
  var nextTree = new FSTree.fromEntries(entries, {
    sortAndExpand: true
  });
  var currentTree = this.currentTree;
  var patches = currentTree.calculatePatch(nextTree);

  this.currentTree = nextTree;

  return Promise.resolve()
    .then(this.ganerateManifest.bind(this, patches))
    .then(this.ensureFile.bind(this));
};

StyleManifest.prototype.ganerateManifest = function(patches) {
  for (var i = 0; i < patches.length; i++) {
    switch (patches[i][0]) {
      case 'create':
        this.addImport(patches[i][1]);
        break;
      case 'unlink':
        this.removeImport(patches[i][1]);
        break;
    }
  }

  this.makeManifest();
}

StyleManifest.prototype.addImport = function(stylePath) {
  var extension = path.extname(stylePath);

  this.styleFiles[extension] = this.styleFiles[extension] || {};
  this.styleFiles[extension][stylePath] = '@import "' + stylePath + '"';
  this.changedExtensions.push(extension);
}

StyleManifest.prototype.removeImport = function(stylePath) {
  var extension = path.extname(stylePath);

  delete this.styleFiles[extension][stylePath];
  this.changedExtensions.push(extension);
}

StyleManifest.prototype.makeManifest = function() {
  while (this.changedExtensions.length) {
    var extension = this.changedExtensions.pop()
    var output = this.generateManifestContent(this.styleFiles[extension]);
    fs.writeFileSync(this.filePath(extension), output);
  }
}

StyleManifest.prototype.generateManifestContent = function(fileList, output) {
  output = output || '';
  for (var file in fileList) {
    output = fileList[file] + ';' + os.EOL + output;
  }
  return output;
}

StyleManifest.prototype.filePath = function(extension) {
  extension = extension || '.' + this.defaultExtension;
  return path.join(this.outputPath, this.outputFileStem + extension);
}

const EMPTY_FILE_COMMENT = '\
/*\n\
  broccoli-style-manifest: This is an empty style mainfest file.\n\
*/\n';

StyleManifest.prototype.ensureFile = function() {
  if (Object.keys(this.styleFiles).length === 0) {
    if (!this.emptyFile) {
      fs.writeFileSync(this.filePath(), EMPTY_FILE_COMMENT);
    }
  } else if (this.emptyFile) {
    fs.unlinkSync(this.emptyFile);
    delete this.emptyFile;
  }
}
