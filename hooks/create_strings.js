"use strict";

const scriptIos     = require( "./create_ios_strings" );
const scriptAndroid = require( "./create_android_strings" );

module.exports = context => {
	const Q         = context.requireCordovaModule( "q" );
	const platforms = context.requireCordovaModule( "cordova-lib/src/cordova/util" ).listPlatforms( context.opts.projectRoot );

	const promises = [];

	if( platforms.indexOf( "ios" ) >= 0 ) {
		promises.push( scriptIos( context ) );
	}

	if( platforms.indexOf( "android" ) >= 0 ) {
		promises.push( scriptAndroid( context ) );
	}

	return Q.all( promises );
};
