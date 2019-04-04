#!/usr/bin/env node

"use strict";

const _      = require( "lodash" );
const fs     = require( "fs-extra" );
const glob   = require( "glob" );
const path   = require( "path" );
const Q      = require( "q" );
const xml2js = require( "xml2js" );

function fileExists( pathToFile ) {
	try {
		return fs.statSync( pathToFile ).isFile();
	} catch( e ) {
		return false;
	}
}

module.exports = context => {
	const deferred = Q.defer();

	getTargetLang( context )
		.then( languages => {
			const promisesToRun = [];

			languages.forEach( lang => {
				// read the json file
				const langJson = require( lang.path );

				// check the locales to write to
				const localeLangs = [];
				if( _.has( langJson, "locale" ) && _.has( langJson.locale, "android" ) ) {
					// iterate the locales to to be iterated.
					_.forEach( langJson.locale.android, aLocale => {
						localeLangs.push( aLocale );
					} );
				} else {
					// use the default lang from the filename, for example "en" in en.json
					localeLangs.push( lang.lang );
				}

				_.forEach( localeLangs, localeLang => {
					const stringXmlFilePath = getLocalStringXmlPath( context, localeLang );
					const parser            = new xml2js.Parser();

					let stringXmlJson = null;
					if( !fileExists( stringXmlFilePath ) ) {
						stringXmlJson = {
							resources : {
								string : []
							}
						};
						promisesToRun.push( processResult( context, localeLang, langJson, stringXmlJson ) );
					} else {
						// lets read from strings.xml into json
						fs.readFile( stringXmlFilePath, {
							encoding : "utf8"
						}, ( err, data ) => {
							if( err ) {
								throw err;
							}

							parser.parseString( data, ( error, result ) => {
								if( error ) {
									throw error;
								}

								stringXmlJson = result;

								// initialize xmlJson to have strings
								if( !_.has( stringXmlJson, "resources" ) || !_.has( stringXmlJson.resources, "string" ) ) {
									stringXmlJson.resources = {
										string : []
									};
								}

								promisesToRun.push( processResult( context, localeLang, langJson, stringXmlJson ) );
							} );
						} );
					}
				} );
			} );

			// eslint-disable-next-line promise/no-nesting
			return Q.all( promisesToRun )
				.then( () => {
					console.log( "Resolving deferred" );
					deferred.resolve();
					return null;
				} );
		} )
		.catch( err => {
			deferred.reject( err );
		} );

	return deferred.promise;
};

function getTargetLang( context ) {
	const deferred      = Q.defer();
	const targetLangArr = [];

	glob( "translations/app/*.json", ( err, langFiles ) => {
		if( err ) {
			deferred.reject( err );
		} else {
			langFiles.forEach( langFile => {
				const matches = langFile.match( /translations\/app\/(.*).json/ );

				if( matches ) {
					targetLangArr.push( {
						lang : matches[ 1 ],
						path : path.join( context.opts.projectRoot, langFile )
					} );
				}
			} );
			deferred.resolve( targetLangArr );
		}
	} );

	return deferred.promise;
}

function getLocalizationDir( context, lang ) {
	let langDir = null;
	switch( lang ) {
		case "en":
			langDir = path.normalize( path.join( getResPath( context ), "values" ) );
			break;
		default:
			langDir = path.normalize( path.join( getResPath( context ), `values-${lang}` ) );
			break;
	}
	return langDir;
}

function getLocalStringXmlPath( context, lang ) {
	let filePath = null;
	switch( lang ) {
		case "en":
			filePath = path.normalize( path.join( getResPath( context ), "values/strings.xml" ) );
			break;
		default:
			filePath = path.normalize( path.join( getResPath( context ), `values-${lang}/`, "strings.xml" ) );
			break;
	}
	return filePath;
}

function getResPath( context ) {
	const locations = context.requireCordovaModule( "cordova-lib/src/platforms/platforms" ).getPlatformApi( "android" ).locations;

	if( locations && locations.res ) {
		return locations.res;
	}

	return path.join( context.opts.projectRoot, "platforms/android/res" );
}

// process the modified xml and put write to file
function processResult( context, lang, langJson, stringXmlJson ) {
	const deferred = Q.defer();
	const mapObj   = {};
	// create a map to the actual string
	_.forEach( stringXmlJson.resources.string, val => {
		if( _.has( val, "$" ) && _.has( val.$, "name" ) ) {
			mapObj[ val.$.name ] = val;
		}
	} );

	const langJsonToProcess = _.assignIn( langJson.config_android, langJson.app );

	// now iterate through langJsonToProcess
	_.forEach( langJsonToProcess, ( val, key ) => {
		// positional string format is in Mac OS X format.  change to android format
		val = val.replace( /\$@/gi, "$s" );

		if( _.has( mapObj, key ) ) {
			// mapObj contains key. replace key
			mapObj[ key ]._ = val;
		} else {
			// add by inserting
			stringXmlJson.resources.string.push( {
				_ : val,
				$ : {
					name : key
				}
			} );
		}
	} );

	// save to disk
	const langDir  = getLocalizationDir( context, lang );
	const filePath = getLocalStringXmlPath( context, lang );

	fs.ensureDir( langDir, err => {
		if( err ) {
			throw err;
		}

		fs.writeFile( filePath, buildXML( stringXmlJson ), {
			encoding : "utf8"
		}, error => {
			if( error ) {
				throw error;
			}
			// eslint-disable-next-line no-console
			console.log( `Saved:${filePath}` );
			return deferred.resolve();
		} );
	} );

	function buildXML( obj ) {
		const builder = new xml2js.Builder();
		builder.options.renderOpts.indent = "\t";

		const x = builder.buildObject( obj );
		return x.toString();
	}

	return deferred.promise;
}
