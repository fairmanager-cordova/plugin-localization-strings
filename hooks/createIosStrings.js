#!/usr/bin/env node

"use strict";

const fs    = require( "fs-extra" );
const _     = require( "lodash" );
const glob  = require( "glob" );
const iconv = require( "iconv-lite" );
const path  = require( "path" );
const Q     = require( "q" );

let iosProjFolder  = null;
let iosPbxProjPath = null;

const getValue = ( config, name ) => {
	const value = config.match( new RegExp( `<${name}>(.*?)</${name}>`, "i" ) );
	if( value && value[ 1 ] ) {
		return value[ 1 ];
	} else {
		return null;
	}
};

function jsonToDotStrings( jsonObj ) {
	let returnString = "";
	_.forEach( jsonObj, ( val, key ) => {
		returnString += `"${key}" = "${val}";${"\n"}`;
	} );
	return returnString;
}

function initIosDir() {
	if( !iosProjFolder || !iosPbxProjPath ) {
		const config = fs.readFileSync( "config.xml" ).toString();
		const name   = getValue( config, "name" );

		iosProjFolder  = `platforms/ios/${name}`;
		iosPbxProjPath = `platforms/ios/${name}.xcodeproj/project.pbxproj`;
	}
}

function getTargetIosDir() {
	initIosDir();
	return iosProjFolder;
}

function getXcodePbxProjPath() {
	initIosDir();
	return iosPbxProjPath;
}

function writeStringFile( plistStringJsonObj, lang, fileName ) {
	const lProjPath = `${getTargetIosDir()}/Resources/${lang}.lproj`;
	fs.ensureDir( lProjPath, err => {
		if( !err ) {
			const stringToWrite = jsonToDotStrings( plistStringJsonObj );
			const buffer        = iconv.encode( stringToWrite, "utf8" );

			fs.open( `${lProjPath}/${fileName}`, "w", ( innerErr, fd ) => {
				if( innerErr ) {
					throw innerErr;
				}
				fs.writeFileSync( fd, buffer );
			} );
		}
	} );
}

function writeLocalisationFieldsToXcodeProj( filePaths, groupname, proj ) {
	const fileRefSection = proj.pbxFileReferenceSection();
	const fileRefValues  = _.values( fileRefSection );

	if( filePaths.length > 0 ) {

		// var groupKey;
		let groupKey = proj.findPBXVariantGroupKey( {
			name : groupname
		} );
		if( !groupKey ) {
			// findPBXVariantGroupKey with name InfoPlist.strings not found.  creating new group
			const localizableStringVarGroup = proj.addLocalizationVariantGroup( groupname );
			groupKey = localizableStringVarGroup.fileRef;
		}

		filePaths.forEach( filePath => {
			const results = _.find( fileRefValues, o => ( _.isObject( o ) && _.has( o, "path" ) && o.path.replace( /['"]+/g, "" ) === filePath ) );
			if( _.isUndefined( results ) ) {
				// not found in pbxFileReference yet
				proj.addResourceFile( `Resources/${filePath}`, {
					variantGroup : true
				}, groupKey );
			}
		} );
	}
}
module.exports = context => {
	const deferred = Q.defer();
	const xcode    = require( "xcode" );

	const localizableStringsPaths = [];
	const infoPlistPaths          = [];

	getTargetLang( context )
		.then( languages => {
			languages.forEach( lang => {

				// read the json file
				const langJson = require( lang.path );

				// check the locales to write to
				const localeLangs = [];
				if( _.has( langJson, "locale" ) && _.has( langJson.locale, "ios" ) ) {
					// iterate the locales to to be iterated.
					_.forEach( langJson.locale.ios, aLocale => localeLangs.push( aLocale ) );
				} else {
					// use the default lang from the filename, for example "en" in en.json
					localeLangs.push( lang.lang );
				}

				_.forEach( localeLangs, localeLang => {
					if( _.has( langJson, "config_ios" ) ) {
						// do processing for appname into plist
						const plistString = langJson.config_ios;
						if( !_.isEmpty( plistString ) ) {
							writeStringFile( plistString, localeLang, "InfoPlist.strings" );
							infoPlistPaths.push( `${localeLang}.lproj/InfoPlist.strings` );
						}
					}

					// remove APP_NAME and write to Localizable.strings
					if( _.has( langJson, "app" ) ) {
						// do processing for appname into plist
						const localizableStringsJson = langJson.app;
						if( !_.isEmpty( localizableStringsJson ) ) {
							writeStringFile( localizableStringsJson, localeLang, "Localizable.strings" );
							localizableStringsPaths.push( `${localeLang}.lproj/Localizable.strings` );
						}
					}
				} );

			} );

			const proj = xcode.project( getXcodePbxProjPath() );

			proj.parse( err => {
				if( err ) {
					deferred.reject( err );

				} else {
					writeLocalisationFieldsToXcodeProj( localizableStringsPaths, "Localizable.strings", proj );
					writeLocalisationFieldsToXcodeProj( infoPlistPaths, "InfoPlist.strings", proj );

					fs.writeFileSync( getXcodePbxProjPath(), proj.writeSync() );
					// eslint-disable-next-line no-console
					console.log( "new pbx project written with localization groups" );

					const platformPath   = path.join( context.opts.projectRoot, "platforms", "ios" );
					const projectFileApi = require( path.join( platformPath, "/cordova/lib/projectFile.js" ) );
					projectFileApi.purgeProjectFileCache( platformPath );
					// eslint-disable-next-line no-console
					console.log( `${platformPath} purged from project cache` );

					deferred.resolve();
				}
			} );

			return null;
		} )
		.catch( err => {
			deferred.reject( err );
		} );

	return deferred.promise;
};

function getTargetLang( context ) {
	const targetLangArr = [];
	const deferred      = Q.defer();


	glob( "translations/app/*.json",
		( err, langFiles ) => {
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
		}
	);
	return deferred.promise;
}
