var fs = require("fs"),
    path = require("path"),
	nodesass = require('node-sass'),
	autoprefixer = require('autoprefixer',{
        browsers: ['> 2%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1', 'Explorer 9'],
        cascade: false
    }),
	color = require('cli-color'),
	UglifyJS = require("uglify-js");

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
    		var result = UglifyJS.minify(importedFiles, {
    			screw_ie8: true,
    			outSourceMap: path.basename(file, path.extname(file))+'.js.map',
    			sourceRoot: '/'
    		});
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
        
        if (typeof result != 'undefined') {
    		fs.writeFile(outFile, result.code, function(err) {
    		    if(err) {
    		        console.log(color.red('Error saving ' + outFile + ': ' + err));
    		    } else {
    		        // file saved
    		        console.log(color.green('Rendered JS for '+file + ' to ' +outFile));
    		    }
    		});
    		fs.writeFile(outFile+'.map', result.map, function(err) {
    		    if(err) {
    		        console.log(color.red('Error saving ' + outFile+'.map' + ': ' + err));
    		    } else {
    		        // file saved
    		        console.log(color.green('Saved source map for '+file + ' to ' +outFile+'.map'));
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
    					console.log(color.yellow('Importing file '+path.resolve(filePath, fileName)));
						// Replace Import
						fileMap.concat( module.exports.getImportFiles(filePath+'/'+fileName, fileMap, true) );
					}
				);
        
        // add to map
        if (recursive === true) fileMap.push(mapPath);
        
        return fileMap;
	}
}