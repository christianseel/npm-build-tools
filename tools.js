if (typeof params)
	var fs = require("fs"),
		path = require("path"),
		nodesass = require('node-sass'),
		color = require('cli-color'),
		UglifyJS = require("uglify-js"),
		babel = require("babel-core"),
		generatesourcemap = require('generate-source-map');

var notify = require('osx-notifier');


module.exports = {
	// build css
	sass: function(params) {

		var file = params.file;
		var outFile = params.outputDir + path.basename(file, path.extname(file)) + '.css';

		nodesass.render({
			file: file,
			outFile: path.resolve(outFile),

			includePaths: [ 'assets/tpl/sources/scss/', 'assets/tpl/sources/', 'assets/tpl/sources/bower_components/' ],

			sourceMap: true,
			//sourceComments: true,
			//sourceMapContents: true,
			//sourceMapEmbed: false,
			//omitSourceMapUrl: false,
			outputStyle: params.outputStyle,

		}, function(error, result){

			if (error) {
				console.log(color.red('ERROR found in ') + color.red.bold(error.file) + color.red(' on line '+error.line) + color.red(': '+error.message));
				//console.log(error.code);
				notify && notify({
					type: 'fail',
					title: 'Error found (SASS)',
					subtitle: 'in '+path.basename(file),
					message: error.message,
					group: 'build-tools',
				});

			} else {
				// success

				var apbrowsers = JSON.parse(params.browsers.replace(new RegExp("'", 'g'),'"'));
				var autoprefixer = require('autoprefixer',{
					browsers: apbrowsers,
					cascade: false
				});

				// run autoprefixer
				result.css = autoprefixer.process(result.css.toString(), {
					in: path.resolve(file),
					to: path.resolve(outFile),
					map: {
						inline: false,
						prev: result.map.toString()
					}
				});

				fs.writeFile(outFile+'.map', result.map.toString(), function(err) {
					if(err) {
						console.log(color.red('Error saving ' + outFile+'.map' + ': ' + err));
					} else {
						// file saved
						console.log(color.green('Saved sourcemap for '+file + ' to ' +outFile+'.map'));
					}
				});

				fs.writeFile(outFile, result.css.toString(), function(err) {
					if(err) {
						console.log(color.red('Error saving ' + outFile + ': ' + err));
					} else {
						// file saved
						console.log(color.green('Rendered CSS for '+file + ' to ' +outFile));
					}
				});
			}
		});


	},


	// build js
	js: function(params) {

		var file = params.file;
		var outFile = params.outputDir + path.basename(file, path.extname(file)) + '.js';

		console.log('Processing '+outFile);

		var importedFiles = module.exports.getImportFiles(file);
		importedFiles.push(file);

		if (importedFiles.length == 0) {
			console.log(color.red('No files found'));
			notify && notify({
				type: 'fail',
				title: 'Error (JS)',
				subtitle: 'No files found',
				message: 'No files found',
				group: 'build-tools',
			});
			return;
		}

		//console.log(importedFiles);

		try {
			// load babelrc config
			try {
				var babelconfig = JSON.parse(fs.readFileSync(path.resolve('.babelrc')));
				if (typeof babelconfig !== 'object') babelconfig = {};
			} catch(err) {
				babelconfig = {};
			}

			var codes = [];
			var maps = [];

			importedFiles.forEach(function(file){
				file = path.normalize(file);
				console.log(color.yellow(' - Including contents of '+ file));

				// run babeljs
				var babeloptions = {
					filename: path.basename(file),
					filenameRelative: '../'+path.normalize(file),
					sourceMaps: true,
					sourceRoot: '',
					sourceMapTarget: '../'+path.normalize(file),
					sourceFileName: '../'+path.normalize(file),
					compact: false
				};
				//console.log(babeloptions);

				if (file.indexOf('foundation-sites') != -1) {
					result = babel.transformFileSync(file, babeloptions);

					if (result.code.indexOf('"use strict";') === 0 || result.code.indexOf("'use strict';") === 0) {
						result.code = result.code.substring(13);
					}
				} else {
					// load code
					result = {
						code: fs.readFileSync(file, "utf8")
					}
					// generate source map
					var generatedmap = generatesourcemap({
						source: result.code,
						sourceFile: '../'+file
					});
					result.map = generatedmap.toString();
				}

				codes.push(result.code);
				maps.push(result.map);
			});


			var bundled = module.exports.catjs(codes, maps, outFile, outFile+'.map','');

			//var result = bundled;

			var result = UglifyJS.minify(bundled.code, {
				fromString: true,
				inSourceMap: JSON.parse(bundled.map),
				outSourceMap: path.basename(outFile+'.map'),
				mangle: false
			});


		} catch(err) {
			console.log(color.red('JS Processing Error: '+err.message+"\n"+'Line: '+err.line+' Col: '+err.col+' Pos: '+err.pos));
			notify && notify({
				type: 'fail',
				title: 'Error found (JS)',
				subtitle: 'Line: '+err.line+' Col: '+err.col+' Pos: '+err.pos,
				message: err.message,
				group: 'build-tools',
			});
		}

		console.log(color.green('Done!'));

		if (typeof result.code != 'undefined') {
			fs.writeFile(outFile, result.code, function(err) {
				if(err) {
					console.log(color.red('Error saving ' + outFile + ': ' + err));
				} else {
					// file saved
					//console.log(color.green('Saved bundled JS for '+file + ' at ' +outFile));
				}
			});
		}
		if (typeof result.map != 'undefined') {
			fs.writeFile(outFile+'.map', result.map, function(err) {
				if(err) {
					console.log(color.red('Error saving ' + outFile+'.map' + ': ' + err));
				} else {
					// file saved
					//console.log(color.green('Saved source map for '+file + ' at ' +outFile+'.map'));
				}
			});
		}
	},


	// helper function to list imported files
	getImportFiles: function(fileName, fileMap, recursive){
		if (typeof recursive == 'undefinded') recursive = false;

		// To Prevent Circular Imports
		var fileMap = fileMap || [];

		// Determine Path for Importing dependent files
		var filePath = path.dirname(fileName),

		// Resolve to get the full path every time
			mapPath = fileName; //path.resolve(fileName);

		// Add Error Handlers Later...
		if(
			// Check that File Exists
		!fs.existsSync(path.resolve(fileName)) ||

		// Check it hasn't been imported yet
		fileMap.indexOf(mapPath) > -1
		){
			console.log(color.red('Error: import file not found ('+fileName+')'), filePath, path.resolve(fileName));
			notify && notify({
				type: 'fail',
				title: 'Import Error',
				message: 'file not found ('+fileName+')',
				group: 'build-tools',
			});
			return "";
		} else {
			//   console.log('Importing files for '+fileName);
		}

		fs.readFileSync(fileName)
			.toString()
			.replace(
				// Regex to match import statements
				/^([ \t]*)(\/\/*)( \t*)import [\"\'](.+)?[\"\'](;?)(?![^\*]+\*\/)/gm,
				function(match, tabs, prefix, space, fileName){
					// Replace Import
					fileMap.concat( module.exports.getImportFiles(filePath+'/'+fileName, fileMap, true) );
				}
			);

		// add to map
		if (recursive === true) fileMap.push(mapPath);

		return fileMap;
	},

	// inspired by https://github.com/edc/mapcat/blob/master/lib/index.js
	catjs: function(inputJSFiles, inputMapFiles, outJSFile, outMapFile, maproot) {
		var SourceMapConsumer, SourceMapGenerator, path, readFileSync, writeFileSync, _ref, _ref1;

		_ref = require('fs'), readFileSync = _ref.readFileSync, writeFileSync = _ref.writeFileSync;

		path = require('path');

		_ref1 = require('source-map'), SourceMapConsumer = _ref1.SourceMapConsumer, SourceMapGenerator = _ref1.SourceMapGenerator;

		var buffer, f, generator, lineOffset, map, src, _i, _len;
		buffer = [];
		generator = new SourceMapGenerator({
			file: outJSFile
		});
		lineOffset = 0;
		for (_i = 0, _len = inputJSFiles.length; _i < _len; _i++) {
			f = inputMapFiles[_i];
			src = inputJSFiles[_i]
			src = src.replace(/\/\/[@#]\ssourceMappingURL[^\r\n]*/g, '//');
			buffer.push(src);

			map = new SourceMapConsumer(f);

			map.eachMapping(function(mapping) {
				var origSrc;
				origSrc = mapping.source;

				mapping = {
					generated: {
						line: mapping.generatedLine + lineOffset,
						column: mapping.generatedColumn
					},
					original: {
						line: mapping.originalLine,
						column: mapping.originalColumn
					},
					source: origSrc // path.relative(path.dirname(outMapFile), origSrc)
				};
				return generator.addMapping(mapping);
			});

			lineOffset = src.split('\n').length;
		}
		if (maproot === null) {
			buffer.push("//# sourceMappingURL=" + (path.relative(path.dirname(outJSFile), outMapFile)));
		} else {
			buffer.push("//# sourceMappingURL=" + (maproot + path.relative(path.dirname(outJSFile), outMapFile)));
		}

		return {code: buffer.join('\n'), map: generator.toString()};
	}
}
