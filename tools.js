if (typeof params)
var fs = require("fs"),
    path = require("path"),
	nodesass = require('node-sass'),
	color = require('cli-color'),
	UglifyJS = require("uglify-js"),
	babel = require("babel-core");

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
        		var babelconfig = JSON.parse(require('fs').readFileSync(path.resolve('.babelrc')));
        		if (typeof babelconfig !== 'object') babelconfig = {};
            } catch(err) {
                babelconfig = {};
            }
    		
    		// this is following "the hard way" implementation of UglifyJS: https://github.com/mishoo/UglifyJS2#the-hard-way
            var toplevel = null;
            importedFiles.forEach(function(file){
                console.log(color.yellow(' - Processing contents of '+ file));
                // load file content
                var code = fs.readFileSync(file, "utf8");
                // run babeljs
                var babelresult = babel.transform(code, babelconfig);
                // run uglifyjs
                toplevel = UglifyJS.parse(babelresult.code, {
                    filename: file,
                    toplevel: toplevel
                });
            });
            
            // Scope information
            toplevel.figure_out_scope({screw_ie8: true})
            
            // Compression
            var compressor = UglifyJS.Compressor({screw_ie8: true});
            var compressed_ast = toplevel.transform(compressor);

            // Mangling
            compressed_ast.figure_out_scope({screw_ie8: true});
            compressed_ast.compute_char_frequency();
            compressed_ast.mangle_names();
            
            // Generating output (code and source map)
            var source_map = UglifyJS.SourceMap({
                file: path.basename(file, path.extname(file))+'.js'
            });
            var stream = UglifyJS.OutputStream({
                source_map: source_map,
                screw_ie8: true
            });
            compressed_ast.print(stream);
            var code = stream.toString();
            var map = source_map.toString();

        } catch(err) {
            console.log(color.red('UglifyJS Error: '+err.message+"\n"+'Line: '+err.line+' Col: '+err.col+' Pos: '+err.pos));
            notify && notify({
              type: 'fail',
              title: 'Error found (JS)',
              subtitle: 'Line: '+err.line+' Col: '+err.col+' Pos: '+err.pos,
              message: err.message,
              group: 'build-tools',
            });
        }
        
        if (typeof code != 'undefined') {
    		fs.writeFile(outFile, code, function(err) {
    		    if(err) {
    		        console.log(color.red('Error saving ' + outFile + ': ' + err));
    		    } else {
    		        // file saved
    		        console.log(color.green('Saved bundled JS for '+file + ' at ' +outFile));
    		    }
    		});
        }
        if (typeof map != 'undefined') {
    		fs.writeFile(outFile+'.map', map, function(err) {
    		    if(err) {
    		        console.log(color.red('Error saving ' + outFile+'.map' + ': ' + err));
    		    } else {
    		        // file saved
    		        console.log(color.green('Saved source map for '+file + ' at ' +outFile+'.map'));
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
	}
}
